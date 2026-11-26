// Twilio webhook. Set it on each company number: "A message comes in" -> POST https://<portal>/api/outreach/inbound
// Also receives delivery status updates (?status=1). Replies land in Conversations; STOP opts the number out.
import { e164, STOP_WORDS, START_WORDS, sb, twilioValid, stopOnReply } from '../_lib/outreach.js'
import { smsAgentReply, xmlEscape } from '../_lib/smsagent.js'

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

  // Senders outside the US (e.g. a team member testing from Mexico) are saved too, but the AI reply is only
  // stored in the portal, never texted back: our approved A2P campaign covers US numbers only.
  const intl = !e164(p.From) && /^\+\d{8,15}$/.test(String(p.From || '').replace(/[^\d+]/g, ''))
  const to = e164(p.To), from = e164(p.From) || (intl ? String(p.From).replace(/[^\d+]/g, '') : null), text = String(p.Body || '').slice(0, 1600)
  if (!to || !from) return empty()
  const orgRow = (await (await db.rest(`orgs?sms_number=eq.${encodeURIComponent(to)}&select=id,name,active`)).json())?.[0]
  const org = orgRow?.id
  if (!org) return empty()
  const last = (await (await db.rest(`messages?org_id=eq.${org}&peer=eq.${encodeURIComponent(from)}&parcel_id=not.is.null&select=parcel_id&order=created_at.desc&limit=1`)).json())?.[0]
  await db.rest('messages', { method: 'POST', body: JSON.stringify({ org_id: org, parcel_id: last?.parcel_id || null, channel: 'sms', direction: 'in', peer: from, body: text || '(media)', status: 'received', provider_id: p.MessageSid || null, read: false }) })
  await stopOnReply(org, from, 'sms')
  if (STOP_WORDS.test(text)) await db.rest('opt_outs', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ org_id: org, channel: 'sms', peer: from }) })
  else if (START_WORDS.test(text)) await db.rest(`opt_outs?org_id=eq.${org}&channel=eq.sms&peer=eq.${encodeURIComponent(from)}`, { method: 'DELETE' })
  // "C" (or yes / confirm / sí) after a reminder confirms their next appointment.
  else if (/^\s*(c|confirm|confirmed|yes|y|si|sí|ok)\s*[.!]?\s*$/i.test(text)) {
    const ap = (await (await db.rest(`appointments?org_id=eq.${org}&with_phone=eq.${encodeURIComponent(from)}&status=eq.scheduled&starts_at=gt.${encodeURIComponent(new Date().toISOString())}&order=starts_at.asc&limit=1&select=id`)).json().catch(() => []))?.[0]
    if (ap) await db.rest(`appointments?id=eq.${ap.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'confirmed' }) })
  }
  // Anything else: the AI text agent answers if the company turned it on (and no person is handling this chat).
  else if (text && orgRow.active !== false) {
    const opted = await (await db.rest(`opt_outs?org_id=eq.${org}&channel=eq.sms&peer=eq.${encodeURIComponent(from)}&select=peer`)).json().catch(() => [])
    if (!opted?.length) {
      const r = await smsAgentReply({ org: orgRow, peer: from, text }).catch(e => { console.error('sms agent', e.message); return null })
      if (r?.reply) {
        await db.rest('messages', { method: 'POST', body: JSON.stringify({ org_id: org, parcel_id: last?.parcel_id || null, channel: 'sms', direction: 'out', peer: from, body: r.reply, status: intl ? 'agent_test' : 'agent', read: true }) })
        if (intl) return empty()
        return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xmlEscape(r.reply)}</Message></Response>`)
      }
    }
  }
  return empty()
}
