// POST /api/outreach/connect  (signed in admin)
// Points the company's texting number (Settings > Texting number) at the portal inside Twilio:
// incoming texts -> /api/outreach/inbound, incoming calls -> /api/voice/call. Returns what it found.
import { guard, body as readBody } from '../_lib/util.js'
import { sb, e164 } from '../_lib/outreach.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' })
  const a = await guard(req, res); if (!a) return
  const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !tok) return res.status(503).json({ code: 'sms_not_configured', error: 'Twilio keys are not set in Vercel.' })
  const db = sb(); if (!db.ok) return res.status(503).json({ code: 'not_configured' })
  const me = (await (await db.rest(`team_members?user_id=eq.${a.user.id}&select=org_id,role`)).json())?.[0]
  if (!me || me.role !== 'admin') return res.status(403).json({ code: 'forbidden', error: 'Only an admin can connect the number.' })
  const org = (await (await db.rest(`orgs?id=eq.${me.org_id}&select=id,sms_number`)).json())?.[0]
  const num = e164(readBody(req).number || org?.sms_number)
  if (!num) return res.status(400).json({ code: 'no_number', error: 'Save the texting number in Settings first.' })
  const auth = { Authorization: 'Basic ' + Buffer.from(`${sid}:${tok}`).toString('base64') }
  const base = `https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers`
  const list = await (await fetch(`${base}.json?PhoneNumber=${encodeURIComponent(num)}`, { headers: auth })).json().catch(() => ({}))
  const n = list.incoming_phone_numbers?.[0]
  if (!n) return res.status(404).json({ code: 'not_in_twilio', error: `${num} is not in the Twilio account yet. It appears once HighLevel finishes moving it.` })
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const form = new URLSearchParams({ SmsUrl: `https://${host}/api/outreach/inbound`, SmsMethod: 'POST', VoiceUrl: `https://${host}/api/voice/call`, VoiceMethod: 'POST', FriendlyName: 'I AM portal' })
  const up = await fetch(`${base}/${n.sid}.json`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form })
  const j = await up.json().catch(() => ({}))
  if (!up.ok) return res.status(502).json({ code: 'twilio', error: j.message || 'Twilio did not accept the change.' })
  res.json({ ok: true, number: num, sms_url: j.sms_url, voice_url: j.voice_url })
}
