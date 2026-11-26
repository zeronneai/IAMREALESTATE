// Calls placed by the AI through Twilio (Jarvis calling the team, the agent calling a customer who gave permission).
// The call is turn based: Twilio listens (speech to text), Claude answers, Cartesia speaks (Twilio's own voice as backup).
import crypto from 'node:crypto'
import { sb, e164 } from './outreach.js'
import { systemPrompt, DEFAULT_AGENT, claude, SUMMARY_PROMPT } from './voice.js'

export const TZ = process.env.OUTREACH_TZ || 'America/Denver'
const auth = () => 'Basic ' + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')
export const twilioReady = () => !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)

// Signed links so only Twilio (with the link we gave it) can fetch a call's audio.
export const sign = (id, n) => crypto.createHmac('sha256', process.env.TWILIO_AUTH_TOKEN || 'x').update(`${id}:${n}`).digest('hex').slice(0, 24)

// Hour in El Paso. Customer calls only 9 am to 8 pm (the law allows 8 to 9; we keep a margin).
export function localHour(now = new Date()) { return +new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(now) }

// Office hours for incoming calls. Default: Monday to Saturday, 9 am to 5 pm in El Paso (Sunday closed).
export const OFFICE = { days: [1, 2, 3, 4, 5, 6], open: 9, close: 17 }
export function officeOf(cfg = {}) {
  const days = Array.isArray(cfg.office_days) && cfg.office_days.length ? cfg.office_days.map(Number) : OFFICE.days
  const open = Number.isFinite(+cfg.office_open) && cfg.office_open !== '' ? +cfg.office_open : OFFICE.open
  const close = Number.isFinite(+cfg.office_close) && cfg.office_close !== '' ? +cfg.office_close : OFFICE.close
  return { days, open, close }
}
export function officeOpen(cfg, now = new Date()) {
  const o = officeOf(cfg)
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(now)]
  const h = localHour(now)
  return o.days.includes(wd) && h >= o.open && h < o.close
}
export function officeText(cfg) {
  const o = officeOf(cfg), N = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const ampm = h => h === 0 ? '12 am' : h < 12 ? h + ' am' : h === 12 ? '12 pm' : (h - 12) + ' pm'
  const d = [...o.days].sort()
  const days = d.length > 2 && d.every((x, i) => i === 0 || x === d[i - 1] + 1) ? `${N[d[0]]} to ${N[d[d.length - 1]]}` : d.map(x => N[x]).join(', ')
  return `${days}, ${ampm(o.open)} to ${ampm(o.close)} El Paso time`
}

export async function orgSettings(db, orgId) {
  const org = (await (await db.rest(`orgs?id=eq.${orgId}&select=id,name,sms_number,active`)).json().catch(() => []))?.[0] || null
  const va = (await (await db.rest(`settings?org_id=eq.${orgId}&key=eq.voiceAgent&select=value`)).json().catch(() => []))?.[0]?.value || {}
  return { org, cfg: { ...DEFAULT_AGENT, ...va, company: org?.name || DEFAULT_AGENT.company } }
}

// Creates the call log row and asks Twilio to dial. Returns { ok, id } or { ok:false, code }.
export async function placeCall({ db, host, orgId, to, source, lang, data, parcelId = null, createdBy = null }) {
  if (!twilioReady()) return { ok: false, code: 'no_twilio' }
  const { org } = await orgSettings(db, orgId)
  const from = e164(process.env.TWILIO_VOICE_FROM) || e164(org?.sms_number)
  if (!from) return { ok: false, code: 'no_number' }
  const num = e164(to); if (!num) return { ok: false, code: 'bad_number' }
  const row = { org_id: orgId, parcel_id: parcelId, source, direction: 'out', phone: num, lang, transcript: [], data, status: 'dialing', created_by: createdBy }
  const ins = await db.rest('voice_calls', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) })
  const id = (await ins.json().catch(() => []))?.[0]?.id
  if (!id) return { ok: false, code: 'db_failed' }
  const base = `https://${host}/api/voice/agent?id=${id}`
  const form = new URLSearchParams({ To: num, From: from, Url: base, Method: 'POST', StatusCallback: base + '&status=1', StatusCallbackMethod: 'POST', Timeout: '25' })
  if (source === 'outbound') form.set('MachineDetection', 'Enable')
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Calls.json`, { method: 'POST', headers: { Authorization: auth(), 'Content-Type': 'application/x-www-form-urlencoded' }, body: form })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) { await db.rest(`voice_calls?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'failed', summary: j.message || 'Twilio rejected the call' }) }); return { ok: false, code: 'twilio_failed', detail: j.message } }
  await db.rest(`voice_calls?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ call_sid: j.sid }) })
  return { ok: true, id }
}

// What the AI is told on each kind of call.
export function callPrompt(call, cfg) {
  const lang = call.lang === 'es' ? 'es' : 'en', d = call.data || {}
  const speak = lang === 'es' ? 'Spanish (Mexican, warm, natural)' : 'English'
  if (call.source === 'jarvis') {
    return `You are Jarvis, the AI assistant of the ${cfg.company} team (a real estate company in El Paso, Texas). You are calling ${d.name || 'a team member'} on the phone.
Everything you write is spoken aloud. Speak ${speak}. One to three short sentences per turn, plain words, no lists or symbols. Say money and dates the way people say them.
Why you are calling: ${d.reason || 'a quick update of what needs attention in the portal'}.
What you know (from the portal, right now):
${String(d.brief || 'Nothing urgent.').slice(0, 6000)}
How the call goes: greet them by first name, say you are Jarvis, and give the most important item first in one or two sentences. Then ask if they want more detail or the next item. Answer questions only with what you know above; if it is not there, say it is in the portal. Never invent numbers.
When they are done or say goodbye, say a short goodbye and put [END] at the very end.`
  }
  if (call.source === 'phone') {
    return systemPrompt({ ...cfg, hours: officeText(cfg) }, lang) + `
This is an INCOMING call to the company line${call.data?.after_hours ? ', outside office hours, so nobody from the team is available right now' : ', and nobody from the team could pick up'}. You already greeted the caller.
Take a complete message: who they are, why they are calling, and the best number and time to call back. If they are calling about selling a house, ask the questions above. If it is about something else (a buyer, a renter, a vendor, a team matter), just take the message.
If they ask for a person, say someone from the team will call them back${call.data?.after_hours ? ' as soon as the office opens' : ' shortly'}. Never promise an exact time.
If the caller speaks Spanish, answer in Spanish and put the token [ES] at the very end of your reply. If they speak English, reply in English.`
  }
  // Customer call: the same agent as the phone line, calling someone who gave permission.
  return systemPrompt(cfg, lang) + `
This is an OUTBOUND call you are making. The person is ${d.name || 'the customer'}${d.address ? `, about the property at ${d.address}` : ''}. They gave permission to be contacted (${d.consent || 'consent on file'}).
Opening, required: say your name, that you are an AI assistant calling from ${cfg.company}, why you are calling in a few words, and ask if now is a good time. Mention the call may be recorded.
${d.goal ? `Goal of this call: ${d.goal}\n` : ''}If they say it is not a good time, offer to call back later and ask when. If they ask not to be called again, apologize, confirm they will not be called again, say goodbye and put [OPTOUT] [END] at the end.`
}

// Spoken text for a turn: Cartesia link (signed) or Twilio's own voice if Cartesia is not set.
export function speakXml(host, id, n, text, lang) {
  const x = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  if (process.env.CARTESIA_API_KEY) return `<Play>https://${host}/api/voice/say?id=${id}&amp;n=${n}&amp;s=${sign(id, n)}</Play>`
  return `<Say voice="${lang === 'es' ? 'Polly.Mia-Neural' : 'Polly.Joanna-Neural'}" language="${lang === 'es' ? 'es-MX' : 'en-US'}">${x(text)}</Say>`
}

export async function pickVoice(cfg, lang) {
  if (cfg['voice_' + lang]) return cfg['voice_' + lang]
  if (cfg.voice) return cfg.voice
  const r = await fetch('https://api.cartesia.ai/voices?limit=100', { headers: { Authorization: `Bearer ${process.env.CARTESIA_API_KEY}`, 'Cartesia-Version': process.env.CARTESIA_VERSION || '2026-08-14' } }).catch(() => null)
  const j = r?.ok ? await r.json() : null
  const list = Array.isArray(j) ? j : (j?.data || [])
  return list.find(v => String(v.language || '').startsWith(lang))?.id || null
}

// End of a call (Twilio status callback): duration, summary and the caller's details; for incoming calls,
// Jarvis calls the team when it is important (hot lead or they asked for a person).
export async function finishCall({ db, host, call, p }) {
  const lang = call.lang === 'es' ? 'es' : 'en'
  const done = { status: p.CallStatus || 'completed', duration_sec: +p.CallDuration || call.duration_sec || 0 }
  const tr = call.transcript || []
  const talked = tr.some(x => x.role === 'caller')
  let data = null
  if ((call.source === 'outbound' || call.source === 'phone') && talked && process.env.ANTHROPIC_API_KEY) {
    const lines = tr.map(x => `${x.role === 'agent' ? 'Assistant' : 'Person'}: ${x.text}`).join('\n')
    const out = await claude({ system: SUMMARY_PROMPT, messages: [{ role: 'user', content: `Language for summary and next_step: ${lang === 'es' ? 'Spanish' : 'English'}\n${call.source === 'phone' ? 'This was an incoming call to the company line. The caller phone number is ' + (call.phone || 'unknown') + '.\n' : ''}\n${lines}` }], max: 700 }).catch(() => '')
    const m = out.match(/\{[\s\S]*\}/); try { data = m ? JSON.parse(m[0]) : null } catch { data = null }
    if (data) Object.assign(done, { summary: data.summary || null, interest: data.interest || null, data: { ...(call.data || {}), ...data } })
  }
  if (!done.summary && !call.summary) {
    if (call.source === 'phone') done.summary = call.data?.answered ? (lang === 'es' ? 'Contestó alguien del equipo.' : 'Answered by the team.') : talked ? (lang === 'es' ? 'Llamada atendida por la IA.' : 'Call handled by the AI.') : (lang === 'es' ? 'Colgó antes de hablar.' : 'Hung up before talking.')
    else done.summary = talked ? (lang === 'es' ? 'Llamada completada.' : 'Call completed.') : (lang === 'es' ? `No contestó (${p.CallStatus || 'sin respuesta'}).` : `No answer (${p.CallStatus || 'no answer'}).`)
  }
  if (call.source === 'phone' && call.data?.answered) done.reviewed = true
  await db.rest(`voice_calls?id=eq.${call.id}`, { method: 'PATCH', body: JSON.stringify(done) })
  if (call.source === 'phone' && data && (data.interest === 'hot' || data.wants_human) && !data.do_not_contact) await alertCall({ db, host, call, data }).catch(e => console.error('jarvis alert', e.message))
}

// Jarvis calls the team members who turned on Jarvis calls (8 am to 9 pm El Paso time).
// Once per person who reached out every 3 hours, so a long chat does not ring the team again and again.
export async function alertTeam({ db, host, orgId, peer, reason, brief }) {
  const h = localHour(); if (h < 8 || h >= 21) return 0
  if (peer) {
    const since = new Date(Date.now() - 3 * 3600e3).toISOString()
    const recent = await (await db.rest(`voice_calls?org_id=eq.${orgId}&source=eq.jarvis&data->>peer=eq.${encodeURIComponent(peer)}&started_at=gt.${encodeURIComponent(since)}&select=id&limit=1`)).json().catch(() => [])
    if (Array.isArray(recent) && recent.length) return 0
  }
  const team = await (await db.rest(`team_members?org_id=eq.${orgId}&jarvis_call=is.true&phone=not.is.null&role=in.(admin,agent)&select=full_name,email,phone,call_lang`)).json().catch(() => [])
  let n = 0
  for (const m of (Array.isArray(team) ? team : []).slice(0, 3)) {
    const r = await placeCall({ db, host, orgId, to: m.phone, source: 'jarvis', lang: m.call_lang === 'es' ? 'es' : 'en', data: { name: m.full_name || m.email, reason, brief, peer: peer || null } })
    if (r.ok) n++
  }
  return n
}
const spell = v => String(v || '').replace(/^\+1/, '').split('').join(' ')

async function alertCall({ db, host, call, data }) {
  const who = data.name || 'A caller'
  const brief = [`- ${who} just called the company line${call.phone ? ' from ' + spell(call.phone) : ''}.`, data.property_address && `- Property: ${data.property_address}.`, data.motivation && `- Why: ${data.motivation}.`, data.timeline && `- Timeline: ${data.timeline}.`, data.best_time && `- Best time to call back: ${data.best_time}.`, data.wants_human && '- They asked to talk to a person.', data.next_step && `- Next step: ${data.next_step}`, '- The full call is in the portal, under Conversations and AI calls.'].filter(Boolean).join('\n')
  return alertTeam({ db, host, orgId: call.org_id, peer: call.phone, reason: data.wants_human ? 'A caller asked to talk to a person.' : 'A hot lead just called the company line.', brief })
}

// A text that matters (the AI marked it hot, or the person asked for someone from the team): Jarvis calls the team.
export async function alertText({ db, host, orgId, peer, text, reply, who, address, asked }) {
  const brief = [`- ${who || 'Someone'} just texted the company number${peer ? ' from ' + spell(peer) : ''}${address ? ', about ' + address : ''}.`, `- They wrote: ${String(text).slice(0, 300)}`, reply && `- The AI answered: ${String(reply).slice(0, 300)}`, asked && '- They want someone from the team to reach out.', '- The whole chat is in the portal, under Conversations.'].filter(Boolean).join('\n')
  return alertTeam({ db, host, orgId, peer, reason: asked ? 'Someone who texted wants to talk to the team.' : 'A hot lead just texted the company number.', brief })
}

// The opening line of an incoming call (from the greeting in the settings).
export function openingText(cfg, data = {}, lang = 'en') {
  const fill = g => String(g || '').replace(/\{\{(\w+)\}\}/g, (_, k) => cfg[k] ?? '')
  let t = fill(lang === 'es' ? cfg.greeting_es : cfg.greeting_en)
  if (data.after_hours) t += lang === 'es' ? ' Ahorita la oficina está cerrada, pero con gusto le ayudo y le paso su mensaje al equipo.' : ' Our office is closed right now, but I can help you and pass your message to the team.'
  if (data.auto_lang && lang === 'en') t += ' Para español, diga español o marque 2.'
  return t
}

// Listen for the caller's answer (speech, and on the first turn of an incoming call also the 2 key for Spanish).
export function gatherXml(id, lang, speech, dtmf = false) {
  return `<Gather input="${dtmf ? 'speech dtmf" numDigits="1' : 'speech'}" language="${lang === 'es' ? 'es-MX' : 'en-US'}" speechTimeout="auto"${lang === 'en' ? ' speechModel="phone_call" enhanced="true"' : ''} actionOnEmptyResult="true" action="/api/voice/agent?id=${id}" method="POST">${speech}</Gather>`
}

// Audio cache in Supabase Storage (public bucket "voice-cache"): lines that repeat, like the greeting, are made
// once by Cartesia and then Twilio plays the saved file directly, so the call is answered with no wait.
export const audioKey = (text, voice, lang) => crypto.createHash('sha1').update(`${voice}|${lang}|${process.env.CARTESIA_MODEL || 'sonic-3.6'}|${text}`).digest('hex')
export const audioUrl = (db, key) => `${db.url}/storage/v1/object/public/voice-cache/${key}.wav`
export async function audioCached(db, key) {
  const r = await fetch(audioUrl(db, key), { method: 'HEAD' }).catch(() => null)
  return !!r?.ok
}
export async function audioStore(db, key, buf) {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY, h = { apikey: k, Authorization: `Bearer ${k}` }
  const put = () => fetch(`${db.url}/storage/v1/object/voice-cache/${key}.wav`, { method: 'POST', headers: { ...h, 'Content-Type': 'audio/wav', 'x-upsert': 'true' }, body: buf }).catch(() => null)
  let r = await put()
  if (!r?.ok) {
    await fetch(`${db.url}/storage/v1/bucket`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'voice-cache', name: 'voice-cache', public: true }) }).catch(() => null)
    r = await put()
  }
  return !!r?.ok
}

export { sb }
