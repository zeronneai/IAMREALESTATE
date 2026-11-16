// Twilio webhook. Set it on each company number: "A message comes in" -> POST https://<portal>/api/outreach/inbound
// Also receives delivery status updates (?status=1). Replies land in Conversations; STOP opts the number out.
import { e164, STOP_WORDS, START_WORDS, sb, twilioValid, stopOnReply } from '../_lib/outreach.js'

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')
  const empty = () => res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>')
  if (req.method !== 'POST') return res.status(405).send('<Response/>')
  let p = req.body || {}
  if (typeof p === 'string') p = Object.fromEntries(new URLSearchParams(p))
  const host = req.headers['x-forwarded-host'] || req.headers.host
  if (!twilioValid(req.headers['x-twilio-signature'], `https://${host}${req.url}`, p)) return res.status(403).send('<Response/>')
  const db = sb(); if (!db.ok) return empty()

  if (String(req.query?.status || '') === '1') {
    if (p.MessageSid && p.MessageStatus) await db.rest(`messages?provider_id=eq.${encodeURIComponent(p.MessageSid)}`, { method: 'PATCH', body: JSON.stringify({ status: p.MessageStatus, ...(p.ErrorCode ? { error: String(p.ErrorCode) } : {}) }) })
    return empty()
  }

  const to = e164(p.To), from = e164(p.From), text = String(p.Body || '').slice(0, 1600)
  if (!to || !from) return empty()
  const org = (await (await db.rest(`orgs?sms_number=eq.${encodeURIComponent(to)}&select=id`)).json())?.[0]?.id
  if (!org) return empty()
  const last = (await (await db.rest(`messages?org_id=eq.${org}&peer=eq.${encodeURIComponent(from)}&parcel_id=not.is.null&select=parcel_id&order=created_at.desc&limit=1`)).json())?.[0]
  await db.rest('messages', { method: 'POST', body: JSON.stringify({ org_id: org, parcel_id: last?.parcel_id || null, channel: 'sms', direction: 'in', peer: from, body: text || '(media)', status: 'received', provider_id: p.MessageSid || null, read: false }) })
  await stopOnReply(org, from, 'sms')
  if (STOP_WORDS.test(text)) await db.rest('opt_outs', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ org_id: org, channel: 'sms', peer: from }) })
  else if (START_WORDS.test(text)) await db.rest(`opt_outs?org_id=eq.${org}&channel=eq.sms&peer=eq.${encodeURIComponent(from)}`, { method: 'DELETE' })
  return empty()
}
