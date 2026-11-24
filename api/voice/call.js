// Twilio "A call comes in" webhook for the company number: POST https://<portal>/api/voice/call
// For now it forwards the call to the team number set in the AI agent settings ("Transfer to").
// If nobody answers (or no number is set) the caller hears a short message and can leave a voicemail,
// which Twilio records; the portal shows it as a missed call to return.
import { e164, sb, twilioValid } from '../_lib/outreach.js'

const xml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')
  if (req.method !== 'POST') return res.status(405).send('<Response/>')
  let p = req.body || {}
  if (typeof p === 'string') p = Object.fromEntries(new URLSearchParams(p))
  const host = req.headers['x-forwarded-host'] || req.headers.host
  if (!twilioValid(req.headers['x-twilio-signature'], `https://${host}${req.url}`, p)) return res.status(403).send('<Response/>')
  const db = sb()
  const to = e164(p.To)
  let cfg = {}, company = 'I AM Real Estate'
  if (db.ok && to) {
    const org = (await (await db.rest(`orgs?sms_number=eq.${encodeURIComponent(to)}&select=id,name`)).json().catch(() => []))?.[0]
    if (org) {
      company = org.name || company
      cfg = (await (await db.rest(`settings?org_id=eq.${org.id}&key=eq.voiceAgent&select=value`)).json().catch(() => []))?.[0]?.value || {}
    }
  }
  const fwd = e164(cfg.transfer)
  const vm = `<Say voice="Polly.Joanna">Thanks for calling ${xml(company)}. We can't take your call right now. Please leave your name, number and the property address after the tone, or send us a text at this number.</Say><Record maxLength="120" playBeep="true" />`
  if (String(req.query?.after || '') === '1') {
    // Dial ended: if the team answered, hang up; otherwise go to voicemail.
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response>${p.DialCallStatus === 'completed' ? '<Hangup/>' : vm}</Response>`)
  }
  const twiml = fwd
    ? `<Dial timeout="20" action="/api/voice/call?after=1" callerId="${xml(p.From || to)}">${xml(fwd)}</Dial>`
    : vm
  res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response>${twiml}</Response>`)
}
