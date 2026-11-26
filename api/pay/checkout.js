// POST /api/pay/checkout { t }  Public: opens a Stripe Checkout page (card or bank account) for what the link owes now.
import { payTarget, stripe, stripeReady, KIND_LABEL } from '../_lib/pay.js'

const hits = new Map()
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' })
  if (!stripeReady()) return res.status(503).json({ error: 'not_configured' })
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0] || 'x'
  const h = (hits.get(ip) || []).filter(x => Date.now() - x < 600e3); h.push(Date.now()); hits.set(ip, h)
  if (h.length > 20) return res.status(429).json({ error: 'slow_down' })
  let b = req.body || {}; if (typeof b === 'string') { try { b = JSON.parse(b) } catch { b = {} } }
  const x = await payTarget(b.t)
  if (!x) return res.status(404).json({ error: 'not_found' })
  if (!x.period || !(x.amount > 0)) return res.status(409).json({ error: 'nothing_due' })
  // A different amount (partial payment) only on recurring links, between $1 and what is owed.
  let amount = x.amount
  if (b.amount != null && b.amount !== '' && x.ob.frequency !== 'once') {
    const a = Math.round(parseFloat(String(b.amount).replace(/[$,]/g, '')) * 100) / 100
    if (!(a >= 1) || a > x.amount) return res.status(400).json({ error: 'bad_amount', max: x.amount })
    amount = a
  }
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const back = `https://${host}/pay/?t=${encodeURIComponent(b.t)}`
  const [y, m] = x.period.split('-')
  const month = new Date(+y, +m - 1, 15).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const what = `${(x.ob.label || KIND_LABEL[x.ob.kind]?.[0] || 'Payment')}, ${month}${x.inv?.address ? ' · ' + x.inv.address : ''}${x.ob.unit ? ' #' + x.ob.unit : ''}`
  try {
    const s = await stripe('checkout/sessions', {
      mode: 'payment',
      payment_method_types: ['card', 'us_bank_account'],
      line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: Math.round(amount * 100), product_data: { name: what.slice(0, 250) } } }],
      // Embedded: the Stripe payment form shows inside our own pay page (logo, colors), not on a Stripe page.
      ui_mode: 'embedded', return_url: back + '&ok=1&session_id={CHECKOUT_SESSION_ID}',
      metadata: { obligation_id: x.ob.id, period: x.period, org_id: x.ob.org_id, due: x.due },
      payment_intent_data: { metadata: { obligation_id: x.ob.id, period: x.period, org_id: x.ob.org_id }, description: what.slice(0, 250) },
      ...(b.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email) ? { customer_email: String(b.email).slice(0, 120) } : {}),
    })
    res.status(200).json({ client_secret: s.client_secret, amount })
  } catch (e) {
    console.error('stripe checkout', e.message)
    res.status(502).json({ error: 'stripe_error' })
  }
}
