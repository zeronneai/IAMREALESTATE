// GET /api/cron/reminders  (called every 10 minutes by Supabase pg_cron, see supabase/calendar.sql).
// Texts each appointment's contact once, remind_minutes before it starts, from the company's number. Logs it in Conversations.
import { sb, sendSms, e164 } from '../_lib/outreach.js'
export const config = { maxDuration: 60 }

const TPL = {
  en: 'Hi {{first}}, this is a reminder of your appointment with {{company}} {{when}}{{where}}. Reply C to confirm or call us to reschedule.',
}
export function reminderText(a, org, tz = process.env.OUTREACH_TZ || 'America/Denver') {
  const first = String(a.with_name || '').trim().split(/\s+/)[0] || 'there'
  const d = new Date(a.starts_at)
  const day = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', month: 'short', day: 'numeric' }).format(d)
  const time = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(d)
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()) === new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d)
  const vals = { first, company: org?.name || 'us', when: today ? `today at ${time}` : `on ${day} at ${time}`, where: a.location ? ` at ${a.location}` : '' }
  return String(org?.reminder_sms || TPL.en).replace(/\{\{(\w+)\}\}/g, (_, k) => vals[k] ?? '')
}

export default async function handler(req, res) {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'unauthorized' })
  const db = sb(); if (!db.ok) return res.status(503).json({ error: 'not_configured' })
  const now = new Date(), soon = new Date(now.getTime() + 24 * 3600e3)
  const q = `appointments?remind=eq.true&reminded_at=is.null&status=in.(scheduled,confirmed)&starts_at=gt.${encodeURIComponent(now.toISOString())}&starts_at=lte.${encodeURIComponent(soon.toISOString())}` +
    `&select=id,org_id,starts_at,location,with_name,with_phone,remind_minutes,people(phone,dnd),orgs(name,active,sms_number,reminder_sms)&limit=200`
  const list = await (await db.rest(q)).json().catch(() => [])
  if (!Array.isArray(list)) return res.status(500).json({ error: 'query_failed', detail: list })
  const out = { checked: list.length, sent: 0, skipped: 0, errors: [] }
  const host = req.headers['x-forwarded-host'] || req.headers.host
  for (const a of list) {
    if (new Date(a.starts_at).getTime() - (a.remind_minutes || 60) * 60e3 > now.getTime()) continue // not yet
    const mark = () => db.rest(`appointments?id=eq.${a.id}`, { method: 'PATCH', body: JSON.stringify({ reminded_at: new Date().toISOString() }) })
    const to = e164(a.with_phone || a.people?.phone)
    if (!to || a.people?.dnd || !a.orgs?.active || !a.orgs?.sms_number) { out.skipped++; await mark(); continue }
    const opt = await (await db.rest(`opt_outs?org_id=eq.${a.org_id}&channel=eq.sms&peer=eq.${encodeURIComponent(to)}&select=peer`)).json().catch(() => [])
    if (opt?.length) { out.skipped++; await mark(); continue }
    const body = reminderText(a, a.orgs)
    const sent = await sendSms({ from: a.orgs.sms_number, to, body, statusCallback: host ? `https://${host}/api/outreach/inbound?status=1` : undefined })
    await db.rest('messages', { method: 'POST', body: JSON.stringify({ org_id: a.org_id, channel: 'sms', direction: 'out', peer: to, body, status: sent.ok ? sent.status : 'failed', provider_id: sent.id || null, error: sent.ok ? null : sent.error, read: true }) })
    await mark()
    if (sent.ok) out.sent++; else out.errors.push(sent.error)
  }
  res.status(200).json(out)
}
