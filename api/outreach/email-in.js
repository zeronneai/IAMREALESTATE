// Resend webhook for email replies (event: email.received). Point each company's reply-to address at Resend receiving.
// The reply lands in Conversations on the right property and stops that owner's follow ups.
import crypto from 'node:crypto'
import { sb, stopOnReply } from '../_lib/outreach.js'
export const config = { api: { bodyParser: false } }

const raw = req => new Promise((res, rej) => { let d = ''; req.setEncoding('utf8'); req.on('data', c => { d += c; if (d.length > 2e6) req.destroy() }); req.on('end', () => res(d)); req.on('error', rej) })

// Svix signature (what Resend uses): HMAC-SHA256(base64-decoded secret, "id.timestamp.body"), header "v1,<base64> ..."
export function svixValid(secret, id, ts, sigHeader, body, nowSec = Math.floor(Date.now() / 1000)) {
  if (!secret || !id || !ts || !sigHeader) return false
  if (Math.abs(nowSec - +ts) > 600) return false
  const key = Buffer.from(String(secret).replace(/^whsec_/, ''), 'base64')
  const expected = crypto.createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64')
  return String(sigHeader).split(' ').some(p => { const v = p.split(',')[1]; return v && v.length === expected.length && crypto.timingSafeEqual(Buffer.from(v), Buffer.from(expected)) })
}
// Keep only the new part of a reply: drop quoted history and signatures from common mail apps.
export function stripReply(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n'), out = []
  for (const l of lines) {
    if (/^\s*>/.test(l)) break
    if (/^\s*(On .+wrote:|El .+escribió:|-----\s*Original Message|From:\s|De:\s|Sent from my|Enviado desde mi)/i.test(l)) break
    out.push(l)
  }
  return out.join('\n').trim() || String(text || '').trim()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const body = await raw(req)  // read the raw stream (never touch req.body: the signature needs the exact bytes)
  if (!svixValid(process.env.RESEND_WEBHOOK_SECRET, req.headers['svix-id'], req.headers['svix-timestamp'], req.headers['svix-signature'], body)) return res.status(401).end()
  let ev; try { ev = JSON.parse(body) } catch { return res.status(400).end() }
  if (ev.type !== 'email.received') return res.status(200).json({ ignored: true })
  const db = sb(); if (!db.ok) return res.status(200).end()
  const d = ev.data || {}
  const from = String(d.from || '').toLowerCase().replace(/.*<|>.*/g, '').trim()
  const tos = [...(d.to || []), ...(d.received_for || [])].map(x => String(x).toLowerCase().replace(/.*<|>.*/g, '').trim())
  const orgs = (await (await db.rest('orgs?select=id,reply_to&reply_to=not.is.null')).json()) || []
  const org = orgs.find(o => tos.includes(String(o.reply_to).toLowerCase()))?.id
  if (!org || !from) return res.status(200).json({ ignored: true })
  let text = ''
  try {
    const r = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(d.email_id)}`, { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } })
    const j = await r.json(); text = j.text || String(j.html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
  } catch {}
  const last = (await (await db.rest(`messages?org_id=eq.${org}&peer=eq.${encodeURIComponent(from)}&parcel_id=not.is.null&select=parcel_id&order=created_at.desc&limit=1`)).json())?.[0]
  await db.rest('messages', { method: 'POST', body: JSON.stringify({ org_id: org, parcel_id: last?.parcel_id || null, channel: 'email', direction: 'in', peer: from, subject: d.subject || null, body: stripReply(text).slice(0, 5000) || '(no text)', status: 'received', provider_id: d.email_id || null, read: false }) })
  await stopOnReply(org, from, 'email')
  if (/^\s*(unsubscribe|remove|stop|baja)\b/i.test(stripReply(text)) || /unsubscribe/i.test(d.subject || '')) await db.rest('opt_outs', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ org_id: org, channel: 'email', peer: from }) })
  res.status(200).json({ ok: true })
}
