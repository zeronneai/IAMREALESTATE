// Twilio "A call comes in" webhook for the company number: POST https://<portal>/api/voice/call
// Office hours (default Monday to Saturday, 9 am to 5 pm El Paso): the call rings the team cell set in
// "Transfer to" for 20 seconds; if nobody answers, the AI agent picks up and takes the message.
// Outside office hours (or with no transfer number): the AI agent answers from the first ring.
// Every call is saved in the portal (AI calls + Conversations) with the transcript and a summary;
// when it matters (hot lead, or they asked for a person) Jarvis calls the team.
//   POST /api/voice/call             a call comes in
//   POST /api/voice/call?after=1&id= the team's phone stopped ringing
//   POST /api/voice/call?status=1    the call ended (number status callback)
import { e164, sb, twilioValid } from '../_lib/outreach.js'
import crypto from 'node:crypto'
import { officeOpen, finishCall, openingText, gatherXml, speakXml, pickVoice, audioKey, audioUrl, audioCached } from '../_lib/calls.js'
import { DEFAULT_AGENT } from '../_lib/voice.js'

const xml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const out = (res, s) => res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response>${s}</Response>`)

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')
  if (req.method !== 'POST') return res.status(405).send('<Response/>')
  let p = req.body || {}
  if (typeof p === 'string') p = Object.fromEntries(new URLSearchParams(p))
  const host = req.headers['x-forwarded-host'] || req.headers.host
  if (!twilioValid(req.headers['x-twilio-signature'], `https://${host}${req.url}`, p)) return res.status(403).send('<Response/>')
  const db = sb(), q = req.query || {}

  // The call ended: save the summary (and maybe have Jarvis call the team).
  if (String(q.status || '') === '1') {
    if (db.ok && p.CallSid) {
      const call = (await (await db.rest(`voice_calls?call_sid=eq.${encodeURIComponent(p.CallSid)}&select=*`)).json().catch(() => []))?.[0]
      if (call && !/^(completed|busy|failed|no-answer|canceled)$/.test(call.status || '')) await finishCall({ db, host, call, p }).catch(e => console.error('finish', e.message))
    }
    return out(res, '')
  }

  const to = e164(p.To)
  const from = e164(p.From) || (/^\+\d{8,15}$/.test(String(p.From || '')) ? String(p.From) : null)
  const org = db.ok && to ? (await (await db.rest(`orgs?sms_number=eq.${encodeURIComponent(to)}&select=id,name`)).json().catch(() => []))?.[0] : null
  const va = org ? (await (await db.rest(`settings?org_id=eq.${org.id}&key=eq.voiceAgent&select=value`)).json().catch(() => []))?.[0]?.value || {} : {}
  const cfg = { ...DEFAULT_AGENT, ...va, company: org?.name || DEFAULT_AGENT.company }
  const company = org?.name || 'I AM Real Estate'
  const voicemail = `<Say voice="Polly.Joanna">Thanks for calling ${xml(company)}. We can't take your call right now. Please leave your name, number and the property address after the tone, or send us a text at this number.</Say><Record maxLength="120" playBeep="true" />`
  const aiReady = !!(org && process.env.ANTHROPIC_API_KEY)
  const toAgent = id => `<Redirect method="POST">/api/voice/agent?id=${id}</Redirect>`

  // The team's phone stopped ringing: answered, or the AI takes it from here.
  if (String(q.after || '') === '1') {
    const id = /^[0-9a-f-]{36}$/i.test(String(q.id || '')) ? q.id : null
    if (p.DialCallStatus === 'completed') {
      if (id) await db.rest(`voice_calls?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ data: { answered: true }, summary: 'Answered by the team.', reviewed: true }) })
      return out(res, '<Hangup/>')
    }
    return out(res, id && aiReady ? toAgent(id) : voicemail)
  }

  // A call comes in: save it, then ring the team (office hours) or let the AI answer.
  const open = officeOpen(cfg)
  const fwd = e164(cfg.transfer)
  const lang = cfg.lang === 'es' ? 'es' : 'en'
  if (!org) return out(res, voicemail)
  const id = crypto.randomUUID()
  const data = { after_hours: !open, auto_lang: cfg.lang !== 'en' && cfg.lang !== 'es' }
  const row = { id, org_id: org.id, source: 'phone', direction: 'in', phone: from, lang, transcript: [], status: 'ringing', call_sid: p.CallSid || null, data }
  if (open && fwd) {
    await db.rest('voice_calls', { method: 'POST', body: JSON.stringify(row) })
    return out(res, `<Dial timeout="20" action="/api/voice/call?after=1&amp;id=${id}" callerId="${xml(p.From || to)}">${xml(fwd)}</Dial>`)
  }
  if (!aiReady) { await db.rest('voice_calls', { method: 'POST', body: JSON.stringify(row) }); return out(res, voicemail) }
  // The AI answers right here (no extra hop): greeting saved as the first turn, audio from the cache when it exists.
  const text = openingText(cfg, data, lang)
  row.transcript = [{ role: 'agent', text }]; row.status = 'in-progress'
  let speech = null
  if (process.env.CARTESIA_API_KEY) {
    const voice = await pickVoice(cfg, lang).catch(() => null)
    const key = voice ? audioKey(text.replace(/[—–]/g, ', ').slice(0, 900), voice, lang) : null
    const [cached] = await Promise.all([key ? audioCached(db, key) : false, db.rest('voice_calls', { method: 'POST', body: JSON.stringify(row) })])
    if (cached) speech = `<Play>${xml(audioUrl(db, key))}</Play>`
  } else await db.rest('voice_calls', { method: 'POST', body: JSON.stringify(row) })
  speech = speech || speakXml(host, id, 0, text, lang)
  return out(res, gatherXml(id, lang, speech, data.auto_lang))
}
