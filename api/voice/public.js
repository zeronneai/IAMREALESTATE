// POST /api/voice/public  The website "Talk to us" voice agent (no sign in). Same agent, voice and settings as the portal.
//   { action: 'config', lang }                        -> { name, greeting, ready }
//   { action: 'turn', lang, messages }                -> { reply, end }
//   { action: 'tts', lang, text }                     -> audio/mpeg (Cartesia voice chosen in the portal)
//   { action: 'end', lang, transcript, startedAt }    -> { ok }  saves the call with an AI summary
// Abuse limits: per visitor rate limit, short texts, capped conversation length.
import { body as readBody } from '../_lib/util.js'
import { systemPrompt, claude, SUMMARY_PROMPT, DEFAULT_AGENT } from '../_lib/voice.js'
import { sb } from '../_lib/outreach.js'

const hits = new Map()
function limited(ip, max = 60, windowMs = 10 * 60e3) {
  const now = Date.now(), h = (hits.get(ip) || []).filter(t => now - t < windowMs)
  h.push(now); hits.set(ip, h)
  if (hits.size > 5000) hits.clear()
  return h.length > max
}
let cache = null
async function agent() {
  if (cache && Date.now() - cache.at < 60e3) return cache.v
  const db = sb(), slug = process.env.PUBLIC_ORG_SLUG || 'iam'
  let cfg = { ...DEFAULT_AGENT }, org = null
  if (db.ok) {
    org = (await (await db.rest(`orgs?slug=eq.${encodeURIComponent(slug)}&select=id,name,active`)).json().catch(() => []))?.[0] || null
    if (org) {
      const s = (await (await db.rest(`settings?org_id=eq.${org.id}&key=in.(voiceAgent,mailSender)&select=key,value`)).json().catch(() => [])) || []
      const va = s.find(x => x.key === 'voiceAgent')?.value || {}
      cfg = { ...cfg, ...va, company: org.name || cfg.company }
    }
  }
  cache = { at: Date.now(), v: { cfg, org } }
  return cache.v
}
async function pickVoice(cfg, lang) {
  if (cfg['voice_' + lang]) return cfg['voice_' + lang]
  const r = await fetch('https://api.cartesia.ai/voices?limit=100', { headers: { Authorization: `Bearer ${process.env.CARTESIA_API_KEY}`, 'Cartesia-Version': process.env.CARTESIA_VERSION || '2026-08-14' } }).catch(() => null)
  const j = r?.ok ? await r.json() : null
  const list = Array.isArray(j) ? j : (j?.data || [])
  return list.find(v => String(v.language || '').startsWith(lang))?.id || null
}
const fill = (s, c) => String(s || '').replace(/\{\{(\w+)\}\}/g, (_, k) => c[k] ?? '')

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim()
  if (limited(ip)) return res.status(429).json({ code: 'slow_down' })
  const b = readBody(req)
  const lang = b.lang === 'es' ? 'es' : 'en'
  const { cfg, org } = await agent()
  if (org && org.active === false) return res.status(503).json({ code: 'off' })
  try {
    if (b.action === 'config') {
      return res.status(200).json({ name: cfg.name, greeting: fill(lang === 'es' ? cfg.greeting_es : cfg.greeting_en, cfg), ready: !!process.env.ANTHROPIC_API_KEY, voice: !!process.env.CARTESIA_API_KEY })
    }
    if (b.action === 'turn') {
      if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ code: 'no_llm' })
      const msgs = (b.messages || []).filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string').slice(-24).map(m => ({ role: m.role, content: m.content.slice(0, 600) }))
      while (msgs.length && msgs[0].role !== 'user') msgs.shift()
      if (!msgs.length) return res.status(400).json({ code: 'empty' })
      if ((b.messages || []).length > 60) return res.status(200).json({ reply: lang === 'es' ? 'Gracias por su tiempo. Alguien de nuestro equipo le llamará. ¡Hasta pronto!' : 'Thank you for your time. Someone from our team will call you. Goodbye!', end: true })
      const raw = await claude({ system: systemPrompt(cfg, lang) + '\nThis conversation is happening through the website, not a phone line. Ask for their phone number so the team can call back.', messages: msgs })
      return res.status(200).json({ reply: raw.replace(/\[END\]/g, '').replace(/[—–]/g, ', ').trim(), end: /\[END\]/.test(raw) })
    }
    if (b.action === 'tts') {
      if (!process.env.CARTESIA_API_KEY) return res.status(503).json({ code: 'no_voice' })
      const text = String(b.text || '').replace(/[—–]/g, ', ').slice(0, 450).trim()
      const voice = await pickVoice(cfg, lang)
      if (!text || !voice) return res.status(400).json({ code: 'bad_request' })
      const r = await fetch('https://api.cartesia.ai/tts/bytes', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.CARTESIA_API_KEY}`, 'Cartesia-Version': process.env.CARTESIA_VERSION || '2026-08-14', 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: process.env.CARTESIA_MODEL || 'sonic-3.6', transcript: text, voice: { id: voice }, language: lang, output_format: { container: 'mp3', sample_rate: 44100, bit_rate: 128000 } }),
      })
      if (!r.ok) return res.status(502).json({ code: 'tts_failed' })
      res.setHeader('Content-Type', 'audio/mpeg'); res.setHeader('Cache-Control', 'no-store')
      return res.status(200).send(Buffer.from(await r.arrayBuffer()))
    }
    if (b.action === 'end') {
      const transcript = (b.transcript || []).slice(0, 80).map(x => ({ role: x.role === 'agent' ? 'agent' : 'caller', text: String(x.text || '').slice(0, 600) }))
      if (!transcript.some(x => x.role === 'caller')) return res.status(200).json({ ok: true })
      let data = null
      if (process.env.ANTHROPIC_API_KEY) {
        const lines = transcript.map(x => `${x.role === 'agent' ? 'Assistant' : 'Caller'}: ${x.text}`).join('\n')
        const out = await claude({ system: SUMMARY_PROMPT, messages: [{ role: 'user', content: `Language for summary and next_step: ${lang === 'es' ? 'Spanish' : 'English'}\n\n${lines}` }], max: 700 }).catch(() => '')
        const m = out.match(/\{[\s\S]*\}/); try { data = m ? JSON.parse(m[0]) : null } catch {}
      }
      const db = sb()
      if (db.ok && org) {
        const started = Date.parse(b.startedAt) || Date.now()
        await db.rest('voice_calls', { method: 'POST', body: JSON.stringify({ org_id: org.id, source: 'web', direction: 'in', phone: data?.phone || null, lang, started_at: new Date(started).toISOString(), duration_sec: Math.min(7200, Math.round((Date.now() - started) / 1000)), transcript, summary: data?.summary || null, data: data || {}, interest: data?.interest || null }) })
      }
      return res.status(200).json({ ok: true })
    }
    return res.status(400).json({ code: 'bad_action' })
  } catch {
    return res.status(502).json({ code: 'failed' })
  }
}
