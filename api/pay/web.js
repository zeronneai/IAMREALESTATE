// Website "Payments" button: anyone pays I AM an amount they type, with a reference (address, invoice, account).
//   GET  /api/pay/web   public options (on/off, limits, labels) set by the team in the portal
//   POST /api/pay/web   { name, email, phone, address, reference, amount } -> Stripe embedded checkout
// The payment shows up in the portal (Finance, To collect, received) when Stripe confirms it (webhook).
import { sb } from '../_lib/outreach.js'
import { stripe, stripeReady, stripePk, payConfig, methodsOf, siteOrg } from '../_lib/pay.js'

const hits = new Map()
const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n)

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  const db = sb(); if (!db.ok) return res.status(503).json({ error: 'db' })
  const org = await siteOrg(db)
  if (!org) return res.status(404).json({ error: 'no_org' })
  const c = await payConfig(db, org.id)
  if (req.method === 'GET') {
    return res.status(200).json({ company: org.name, phone: org.sms_number, on: !!c.web_on, ready: stripeReady() && !!stripePk(), pk: stripePk(), min: +c.web_min || 1, max: +c.web_max || 10000, ref_en: c.ref_en, ref_es: c.ref_es, note_en: c.web_note_en, note_es: c.web_note_es, card: !!c.card, bank: !!c.bank })
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' })
  if (!c.web_on) return res.status(403).json({ error: 'off' })
  if (!stripeReady()) return res.status(503).json({ error: 'not_configured' })
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0] || 'x'
  const h = (hits.get(ip) || []).filter(x => Date.now() - x < 600e3); h.push(Date.now()); hits.set(ip, h)
  if (h.length > 15) return res.status(429).json({ error: 'slow_down' })
  let b = req.body || {}; if (typeof b === 'string') { try { b = JSON.parse(b) } catch { b = {} } }
  const amount = Math.round(parseFloat(String(b.amount || '').replace(/[$,]/g, '')) * 100) / 100
  const min = +c.web_min || 1, max = +c.web_max || 10000
  if (!(amount >= min && amount <= max)) return res.status(400).json({ error: 'bad_amount', min, max })
  const name = clip(b.name, 80), ref = clip(b.reference, 120), email = clip(b.email, 120), phone = clip(b.phone, 30), address = clip(b.address, 120)
  if (!name || !ref) return res.status(400).json({ error: 'missing' })
  const host = req.headers['x-forwarded-host'] || req.headers.host
  try {
    const s = await stripe('checkout/sessions', {
      mode: 'payment', ui_mode: 'embedded_page', allowed_payment_method_types: methodsOf(c),
      return_url: `https://${host}/pay/?web=1&ok=1&session_id={CHECKOUT_SESSION_ID}`,
      line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: Math.round(amount * 100), product_data: { name: `Payment to ${org.name}: ${ref}`.slice(0, 250) } } }],
      metadata: { web: '1', org_id: org.id, name, ref, phone, address, email },
      payment_intent_data: { metadata: { web: '1', org_id: org.id, ref }, description: `${name}: ${ref}`.slice(0, 250) },
      ...(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? { customer_email: email } : {}),
    })
    res.status(200).json({ client_secret: s.client_secret, amount })
  } catch (e) {
    console.error('stripe web checkout', e.message)
    res.status(502).json({ error: 'stripe_error', detail: String(e.message || '').slice(0, 300) })
  }
}
