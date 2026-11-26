// POST /api/pay/webhook  Stripe events. In Stripe: Developers > Webhooks > Add endpoint
//   https://<portal>/api/pay/webhook  with: checkout.session.completed, checkout.session.async_payment_succeeded,
//   checkout.session.async_payment_failed. Its signing secret goes in Vercel as STRIPE_WEBHOOK_SECRET.
// A card payment is marked received right away; a bank (ACH) payment when it clears (a few days).
import { stripeSigOk } from '../_lib/pay.js'
import { sb } from '../_lib/outreach.js'

// The signature is over the exact bytes Stripe sent, so read the raw stream (never touch req.body first:
// on Vercel reading req.body parses and consumes it).
export const config = { api: { bodyParser: false } }
async function rawBody(req) {
  const chunks = []; for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c)
  return Buffer.concat(chunks).toString('utf8')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const raw = await rawBody(req)
  if (!stripeSigOk(raw, req.headers['stripe-signature'])) return res.status(400).json({ error: 'bad_signature' })
  let ev; try { ev = JSON.parse(raw) } catch { return res.status(400).end() }
  const s = ev?.data?.object || {}
  const md = s.metadata || {}
  const paidNow = (ev.type === 'checkout.session.completed' && s.payment_status === 'paid') || ev.type === 'checkout.session.async_payment_succeeded'
  if (!paidNow || !md.obligation_id || !md.period) return res.status(200).json({ ok: true, skipped: ev.type })
  const db = sb(); if (!db.ok) return res.status(500).end()
  const ob = (await (await db.rest(`obligations?id=eq.${encodeURIComponent(md.obligation_id)}&select=id,org_id,amount`)).json().catch(() => []))?.[0]
  if (!ob) return res.status(200).json({ ok: true, skipped: 'unknown_obligation' })
  const prev = (await (await db.rest(`payments?obligation_id=eq.${ob.id}&period=eq.${md.period}&select=*`)).json().catch(() => []))?.[0]
  if (prev?.stripe_ref && String(prev.stripe_ref).includes(s.id)) return res.status(200).json({ ok: true, duplicate: true })
  const got = Math.round((s.amount_total || 0)) / 100
  const paid = Math.round(((+prev?.amount_paid || 0) + got) * 100) / 100
  // Bank (ACH) payments finish later with async_payment_succeeded; card payments are paid at completion.
  const ach = ev.type === 'checkout.session.async_payment_succeeded'
  const row = {
    org_id: ob.org_id, obligation_id: ob.id, period: md.period, due_date: md.due || prev?.due_date || null, amount_due: +ob.amount || got,
    amount_paid: paid, paid_on: new Date().toISOString().slice(0, 10), method: ach ? 'Stripe (bank)' : 'Stripe (card)',
    reference: String(s.payment_intent || s.id).slice(0, 200), status: paid + 0.01 >= (+ob.amount || 0) ? 'paid' : 'partial',
    notes: [prev?.notes, `Paid online with Stripe${s.customer_details?.email ? ' by ' + s.customer_details.email : ''}`].filter(Boolean).join(' · ').slice(0, 500),
    stripe_ref: [prev?.stripe_ref, s.id].filter(Boolean).join(' ').slice(0, 500),
  }
  const r = await db.rest('payments?on_conflict=obligation_id,period', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(row) })
  if (!r.ok) { console.error('stripe webhook save', await r.text()); return res.status(500).end() }
  res.status(200).json({ ok: true })
}
