// POST /api/voice/chat
//   { mode: 'turn', config, lang, messages: [{ role: 'user'|'assistant', content }] } -> { reply, end }
//   { mode: 'summary', lang, transcript: [{ role: 'agent'|'caller', text }] }          -> { data }
// The brain behind the AI phone agent (Claude). The voice (Cartesia or the browser) sits around it.
import { body as readBody, only, guard } from '../_lib/util.js'
import { systemPrompt, claude, SUMMARY_PROMPT } from '../_lib/voice.js'

export default async function handler(req, res) {
  if (!only(req, res)) return
  if (!(await guard(req, res))) return
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ code: 'no_llm' })
  const b = readBody(req)
  const lang = b.lang === 'es' ? 'es' : 'en'
  try {
    if (b.mode === 'summary') {
      const lines = (b.transcript || []).slice(-80).map(x => `${x.role === 'agent' ? 'Assistant' : 'Caller'}: ${String(x.text || '').slice(0, 600)}`).join('\n')
      if (!lines) return res.status(400).json({ code: 'empty' })
      const out = await claude({ system: SUMMARY_PROMPT, messages: [{ role: 'user', content: `Language for summary and next_step: ${lang === 'es' ? 'Spanish' : 'English'}\n\n${lines}` }], max: 700 })
      const m = out.match(/\{[\s\S]*\}/)
      return res.status(200).json({ data: m ? JSON.parse(m[0]) : null })
    }
    const msgs = (b.messages || []).filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string').slice(-30).map(m => ({ role: m.role, content: m.content.slice(0, 1000) }))
    while (msgs.length && msgs[0].role !== 'user') msgs.shift()
    if (!msgs.length) return res.status(400).json({ code: 'empty' })
    const raw = await claude({ system: systemPrompt(b.config || {}, lang), messages: msgs })
    const end = /\[END\]/.test(raw)
    return res.status(200).json({ reply: raw.replace(/\[END\]/g, '').replace(/[—–]/g, ', ').trim(), end })
  } catch (e) {
    return res.status(502).json({ code: 'llm_failed' })
  }
}
