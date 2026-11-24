// Calls placed by the AI through Twilio (Jarvis calling the team, the agent calling a customer who gave permission).
// The call is turn based: Twilio listens (speech to text), Claude answers, Cartesia speaks (Twilio's own voice as backup).
import crypto from 'node:crypto'
import { sb, e164 } from './outreach.js'
import { systemPrompt, DEFAULT_AGENT } from './voice.js'

export const TZ = process.env.OUTREACH_TZ || 'America/Denver'
const auth = () => 'Basic ' + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')
export const twilioReady = () => !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)

// Signed links so only Twilio (with the link we gave it) can fetch a call's audio.
export const sign = (id, n) => crypto.createHmac('sha256', process.env.TWILIO_AUTH_TOKEN || 'x').update(`${id}:${n}`).digest('hex').slice(0, 24)

// Hour in El Paso. Customer calls only 9 am to 8 pm (the law allows 8 to 9; we keep a margin).
export function localHour(now = new Date()) { return +new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(now) }

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

export { sb }
