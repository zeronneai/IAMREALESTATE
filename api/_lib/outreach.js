// Shared helpers for texting and email (Twilio + Resend). Keys stay in Vercel env vars.
import crypto from 'node:crypto'

export const e164 = v => { const d = String(v || '').replace(/\D/g, ''); if (d.length === 10) return '+1' + d; if (d.length === 11 && d[0] === '1') return '+' + d; return null }
export const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim())
export const STOP_WORDS = /^\s*(stop|stopall|unsubscribe|cancel|end|quit|remove|alto|parar|baja)\b/i
export const START_WORDS = /^\s*(start|unstop|yes|si|sí)\s*[.!]*\s*$/i

// Texting window (TCPA): 8 am to 9 pm where the owner lives. El Paso is Mountain Time.
export function inQuietHours(now = new Date(), tz = process.env.OUTREACH_TZ || 'America/Denver') {
  const h = +new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: tz }).format(now)
  return h < 8 || h >= 21
}

export function sb() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const h = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  const rest = (path, init = {}) => fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...h, ...(init.headers || {}) } })
  return { ok: !!(url && key), url, rest }
}

export async function sendSms({ from, to, body, statusCallback }) {
  const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !tok) return { ok: false, error: 'sms_not_configured' }
  const form = new URLSearchParams({ From: from, To: to, Body: body })
  if (statusCallback) form.set('StatusCallback', statusCallback)
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${tok}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: form,
  })
  const j = await r.json().catch(() => ({}))
  return r.ok ? { ok: true, id: j.sid, status: j.status || 'queued' } : { ok: false, error: j.message || 'sms_failed', code: j.code }
}

export async function sendEmail({ from, to, subject, body, replyTo }) {
  const key = process.env.RESEND_API_KEY
  if (!key) return { ok: false, error: 'email_not_configured' }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text: body, ...(replyTo ? { reply_to: replyTo } : {}) }),
  })
  const j = await r.json().catch(() => ({}))
  return r.ok ? { ok: true, id: j.id, status: 'sent' } : { ok: false, error: j.message || 'email_failed' }
}

// Twilio request signature: base64(HMAC-SHA1(authToken, url + sorted key/value pairs)).
export function twilioValid(signature, url, params, token = process.env.TWILIO_AUTH_TOKEN) {
  if (!token || !signature) return false
  const data = url + Object.keys(params).sort().map(k => k + params[k]).join('')
  const expected = crypto.createHmac('sha1', token).update(Buffer.from(data, 'utf8')).digest('base64')
  const a = Buffer.from(expected), b = Buffer.from(String(signature))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

const niceCase = s => String(s || '').toLowerCase().replace(/(^|[\s\-'/])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())
// Fill {{first}}, {{owner}}, {{address}}, {{agent}}, {{company}}, {{phone}} in a template.
export function fillTemplate(tpl, { owners = [], address = '', sender = {}, company = '', lang = 'en' } = {}) {
  const names = owners.map(o => niceCase(o.name || o)).filter(Boolean)
  const first = (names[0] || '').split(/\s+/)[0] || (lang === 'es' ? 'buen día' : 'there')
  const vals = { first, owner: names.slice(0, 2).join(' & '), address: niceCase(address), agent: sender.agent || '', company: company || sender.company || '', phone: sender.phone || '' }
  return String(tpl || '').replace(/\{\{(\w+)\}\}/g, (_, k) => vals[k] ?? '')
}

// Send every follow-up step that is due. orgId limits it to one company (manual "run now"); null runs all.
export async function runDueSteps({ orgId = null, now = new Date(), limit = 300, host = null } = {}) {
  const db = sb(); if (!db.ok) return { ok: false, error: 'not_configured' }
  const out = { sent: 0, skipped: 0, done: 0, errors: [] }
  const quiet = inQuietHours(now)
  const q = `enrollments?status=eq.active&next_at=lte.${encodeURIComponent(now.toISOString())}${orgId ? `&org_id=eq.${orgId}` : ''}&order=next_at.asc&limit=${limit}` +
    `&select=id,org_id,step,phone,email,parcel_id,sequences(name,steps,active),parcels(address,owners(name)),orgs(name,active,sms_number,email_from,reply_to)`
  const r = await db.rest(q); if (!r.ok) return { ok: false, error: 'db' }
  const rows = await r.json()
  const senders = {}
  for (const e of rows) {
    const steps = e.sequences?.steps || [], st = steps[e.step]
    if (!e.orgs?.active || !e.sequences?.active) { out.skipped++; continue }
    if (!st) { await db.rest(`enrollments?id=eq.${e.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'done' }) }); out.done++; continue }
    if (st.channel === 'sms' && quiet) { out.skipped++; continue }
    if (!(e.org_id in senders)) { const s = (await (await db.rest(`settings?org_id=eq.${e.org_id}&key=eq.mailSender&select=value`)).json())?.[0]?.value || {}; senders[e.org_id] = s }
    const peer = st.channel === 'sms' ? e164(e.phone) : (isEmail(e.email) ? e.email.toLowerCase() : null)
    let err = null, sent = null
    if (!peer) err = st.channel === 'sms' ? 'no_phone' : 'no_email'
    else {
      const opt = await (await db.rest(`opt_outs?org_id=eq.${e.org_id}&channel=eq.${st.channel}&peer=eq.${encodeURIComponent(peer)}&select=peer`)).json()
      if (opt?.length) { await db.rest(`enrollments?id=eq.${e.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'opted_out' }) }); out.skipped++; continue }
      const body = fillTemplate(st.body, { owners: e.parcels?.owners || [], address: e.parcels?.address, sender: senders[e.org_id], company: e.orgs.name })
      if (st.channel === 'sms') sent = e.orgs.sms_number ? await sendSms({ from: e.orgs.sms_number, to: peer, body, statusCallback: host ? `https://${host}/api/outreach/inbound?status=1` : undefined }) : { ok: false, error: 'no_number' }
      else {
        const subject = fillTemplate(st.subject || e.orgs.name, { owners: e.parcels?.owners || [], address: e.parcels?.address, sender: senders[e.org_id], company: e.orgs.name })
        sent = e.orgs.email_from ? await sendEmail({ from: e.orgs.email_from, to: peer, subject, body, replyTo: e.orgs.reply_to || undefined }) : { ok: false, error: 'no_email' }
      }
      if (sent.ok) {
        await db.rest('messages', { method: 'POST', body: JSON.stringify({ org_id: e.org_id, parcel_id: e.parcel_id, channel: st.channel, direction: 'out', peer, subject: st.channel === 'email' ? (st.subject || null) : null, body, status: sent.status, provider_id: sent.id || null, read: true }) })
        out.sent++
      } else err = sent.error
    }
    // A missing number or email skips that step; sending errors also move on so one owner never blocks the queue.
    const next = e.step + 1, ns = steps[next]
    const patch = ns ? { step: next, next_at: new Date(now.getTime() + Math.max(0, (+ns.day || 0) - (+st.day || 0)) * 86400e3).toISOString(), last_error: err } : { step: next, status: 'done', last_error: err }
    await db.rest(`enrollments?id=eq.${e.id}`, { method: 'PATCH', body: JSON.stringify(patch) })
    if (err) out.errors.push(err)
    if (!ns) out.done++
  }
  return { ok: true, ...out }
}

// Called when an owner replies: stop their follow ups in that company.
export async function stopOnReply(orgId, peer, channel) {
  const db = sb(); if (!db.ok) return
  const col = channel === 'sms' ? 'phone' : 'email'
  const rows = await (await db.rest(`enrollments?org_id=eq.${orgId}&status=eq.active&select=id,${col},sequences(stop_on_reply)`)).json()
  const hit = (rows || []).filter(e => e.sequences?.stop_on_reply !== false && (channel === 'sms' ? e164(e.phone) === peer : String(e.email || '').toLowerCase() === peer))
  for (const e of hit) await db.rest(`enrollments?id=eq.${e.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'replied' }) })
}
