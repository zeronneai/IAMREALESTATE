// Online payments with Stripe for what tenants and buyers owe (rent, wrap, loan). No Stripe library: plain REST.
// Vercel env vars: STRIPE_SECRET_KEY (sk_live_... or sk_test_...), STRIPE_WEBHOOK_SECRET (whsec_...).
import crypto from 'node:crypto'
import { sb } from './outreach.js'

export const stripeReady = () => !!process.env.STRIPE_SECRET_KEY

// Stripe API call (form encoded, nested keys like line_items[0][price_data][currency]).
export async function stripe(path, params = {}, method = 'POST') {
  const form = new URLSearchParams()
  const add = (k, v) => {
    if (v === undefined || v === null) return
    if (Array.isArray(v)) v.forEach((x, i) => add(`${k}[${i}]`, x))
    else if (typeof v === 'object') Object.entries(v).forEach(([kk, vv]) => add(`${k}[${kk}]`, vv))
    else form.append(k, String(v))
  }
  Object.entries(params).forEach(([k, v]) => add(k, v))
  const r = await fetch(`https://api.stripe.com/v1/${path}${method === 'GET' && [...form].length ? '?' + form : ''}`, {
    method, headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, ...(method === 'GET' ? {} : { 'Content-Type': 'application/x-www-form-urlencoded' }) }, body: method === 'GET' ? undefined : form,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j?.error?.message || `stripe ${r.status}`)
  return j
}

// Stripe-Signature check: t=<time>,v1=<hmac sha256 of "t.body">. Rejects anything older than 10 minutes.
export function stripeSigOk(raw, header, secret = process.env.STRIPE_WEBHOOK_SECRET) {
  if (!secret || !header) return false
  const parts = Object.fromEntries(String(header).split(',').map(x => x.split('=')).filter(x => x.length === 2).map(([k, v]) => [k, v]))
  const sigs = String(header).split(',').filter(x => x.startsWith('v1=')).map(x => x.slice(3))
  const ts = +parts.t
  if (!ts || Math.abs(Date.now() / 1000 - ts) > 600) return false
  const want = crypto.createHmac('sha256', secret).update(`${ts}.${raw}`).digest('hex')
  return sigs.some(s => s.length === want.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(want)))
}

const pad = n => String(n).padStart(2, '0')
const monthOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`
const mm = s => +s.slice(0, 4) * 12 + +s.slice(5, 7)
const addMonths = (s, n) => { const t = mm(s) - 1 + n; return `${Math.floor(t / 12)}-${pad(t % 12 + 1)}-01` }

// Does an obligation fall in this period (first day of a month)? Same rules as the portal.
function applies(ob, period) {
  const start = ob.due_date ? ob.due_date.slice(0, 7) + '-01' : null
  if (ob.frequency === 'once') return !!start && start === period
  if (start && period < start) return false
  if (ob.frequency === 'monthly') return true
  const base = start || period
  if (ob.frequency === 'quarterly') return (mm(period) - mm(base)) % 3 === 0
  if (ob.frequency === 'yearly') return (mm(period) - mm(base)) % 12 === 0
  return false
}
function dueOn(ob, period) {
  const y = +period.slice(0, 4), m = +period.slice(5, 7), last = new Date(y, m, 0).getDate()
  const day = Math.min(ob.frequency === 'monthly' && ob.due_day ? ob.due_day : ob.due_date ? +ob.due_date.slice(8, 10) : (ob.due_day || 1), last)
  return `${period.slice(0, 8)}${pad(day)}`
}

// What this pay link is for right now: this month if it is not fully paid, otherwise the next one that is due.
// Older months are not asked here (they may have been paid outside the portal); the team handles those.
export async function payTarget(token) {
  const db = sb(); if (!db.ok || !/^[A-Za-z0-9_-]{20,64}$/.test(String(token || ''))) return null
  const ob = (await (await db.rest(`obligations?pay_token=eq.${encodeURIComponent(token)}&active=is.true&select=*`)).json().catch(() => []))?.[0]
  if (!ob || ob.direction !== 'in') return null
  const [org, inv, pays] = await Promise.all([
    db.rest(`orgs?id=eq.${ob.org_id}&select=id,name,sms_number`).then(r => r.json()).then(x => x?.[0] || null).catch(() => null),
    ob.inventory_id ? db.rest(`inventory?id=eq.${ob.inventory_id}&select=address,zip`).then(r => r.json()).then(x => x?.[0] || null).catch(() => null) : null,
    db.rest(`payments?obligation_id=eq.${ob.id}&select=period,amount_due,amount_paid,status`).then(r => r.json()).catch(() => []),
  ])
  const now = monthOf(new Date())
  const owed = p => { const pay = (pays || []).find(x => x.period === p); if (pay?.status === 'waived') return 0; return Math.max(0, Math.round(((+ob.amount || 0) - (+pay?.amount_paid || 0)) * 100) / 100) }
  let period = null
  for (let i = 0; i <= 12 && !period; i++) { const p = addMonths(now, i); if (applies(ob, p) && owed(p) > 0) period = p }
  if (!period) return { ob, org, inv, period: null, amount: 0 }
  return { ob, org, inv, period, due: dueOn(ob, period), amount: owed(period) }
}

export const KIND_LABEL = { rent: ['Rent', 'Renta'], wrap: ['Home payment', 'Pago de casa'], loan: ['Loan payment', 'Pago de préstamo'] }
