// POST /api/outreach/send { parcelId, channel: 'sms'|'email', to, subject?, body }
// Sends a text or an email from the caller's company and logs it in Conversations.
import { body as readBody, only, guard } from '../_lib/util.js'
import { e164, isEmail, inQuietHours, sb, sendSms, sendEmail } from '../_lib/outreach.js'

export default async function handler(req, res) {
  if (!only(req, res)) return
  const a = await guard(req, res); if (!a) return
  const db = sb(); if (!db.ok || !a.user) return res.status(503).json({ code: 'not_configured' })
  const b = readBody(req)
  const channel = b.channel === 'email' ? 'email' : 'sms'
  const text = String(b.body || '').trim().slice(0, 1500)
  const subject = String(b.subject || '').trim().slice(0, 200)
  if (!text) return res.status(400).json({ code: 'empty' })

  const me = (await (await db.rest(`team_members?user_id=eq.${a.user.id}&select=org_id,role,orgs(name,active,sms_number,email_from,reply_to)`)).json())?.[0]
  if (!me?.orgs?.active) return res.status(403).json({ code: 'forbidden' })
  if (!['admin', 'agent'].includes(me.role)) return res.status(403).json({ code: 'forbidden' })
  const org = me.org_id

  let parcelId = null
  if (b.parcelId) {
    const p = (await (await db.rest(`parcels?id=eq.${encodeURIComponent(b.parcelId)}&org_id=eq.${org}&select=id`)).json())?.[0]
    if (!p) return res.status(404).json({ code: 'not_found' })
    parcelId = p.id
  }

  const peer = channel === 'sms' ? e164(b.to) : String(b.to || '').trim().toLowerCase()
  if (!peer || (channel === 'email' && !isEmail(peer))) return res.status(400).json({ code: 'bad_to' })
  const opt = await (await db.rest(`opt_outs?org_id=eq.${org}&channel=eq.${channel}&peer=eq.${encodeURIComponent(peer)}&select=peer`)).json()
  if (Array.isArray(opt) && opt.length) return res.status(409).json({ code: 'opted_out' })

  let sent
  if (channel === 'sms') {
    if (b.dnc) return res.status(409).json({ code: 'dnc' })
    const flagged = await (await db.rest(`contacts?org_id=eq.${org}&kind=eq.phone&dnc=eq.true&select=value`)).json()
    if ((flagged || []).some(c => e164(c.value) === peer)) return res.status(409).json({ code: 'dnc' })
    if (inQuietHours()) return res.status(409).json({ code: 'quiet_hours' })
    if (!me.orgs.sms_number) return res.status(503).json({ code: 'no_number' })
    const host = req.headers['x-forwarded-host'] || req.headers.host
    sent = await sendSms({ from: me.orgs.sms_number, to: peer, body: text, statusCallback: host ? `https://${host}/api/outreach/inbound?status=1` : undefined })
  } else {
    if (!me.orgs.email_from) return res.status(503).json({ code: 'no_email' })
    sent = await sendEmail({ from: me.orgs.email_from, to: peer, subject: subject || me.orgs.name, body: text, replyTo: me.orgs.reply_to || undefined })
  }
  if (!sent.ok) return res.status(502).json({ code: /not_configured/.test(sent.error) ? sent.error : 'send_failed', error: sent.error })

  const row = { org_id: org, parcel_id: parcelId, channel, direction: 'out', peer, subject: subject || null, body: text, status: sent.status, provider_id: sent.id || null, created_by: a.user.id, read: true }
  const ins = await db.rest('messages', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) })
  const saved = (await ins.json().catch(() => null))?.[0] || row
  return res.status(200).json({ ok: true, message: saved })
}
