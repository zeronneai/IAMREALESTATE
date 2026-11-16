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
