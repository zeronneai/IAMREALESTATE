// Daily job: charges the automatic monthly payments (autopay) on their due date with the card or bank account the
// tenant or buyer saved on their pay link. Once per payment line and month; Stripe confirms by webhook
// (payment_intent.succeeded marks it received; payment_failed saves the reason so Finance can see it).
import { sb } from '../_lib/outreach.js'
import { stripe, stripeReady, applies, dueOn, monthOf } from '../_lib/pay.js'

export default async function handler(req, res) {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'unauthorized' })
  if (!stripeReady()) return res.status(200).json({ ok: true, skipped: 'stripe_not_configured' })
  const db = sb(); if (!db.ok) return res.status(500).json({ error: 'db' })
  const obs = await (await db.rest('obligations?stripe_autopay=is.true&active=is.true&direction=eq.in&stripe_pm=not.is.null&select=*')).json().catch(() => [])
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' })
  const period = monthOf(new Date(today + 'T12:00:00'))
  const out = { checked: 0, charged: 0, skipped: 0, errors: 0 }
  for (const ob of Array.isArray(obs) ? obs : []) {
    out.checked++
    if (!applies(ob, period) || ob.stripe_last_try === period) { out.skipped++; continue }
    const due = dueOn(ob, period)
    if (today < due) { out.skipped++; continue }
    const pay = (await (await db.rest(`payments?obligation_id=eq.${ob.id}&period=eq.${period}&select=amount_paid,status`)).json().catch(() => []))?.[0]
    const owed = pay?.status === 'waived' ? 0 : Math.round(((+ob.amount || 0) - (+pay?.amount_paid || 0)) * 100) / 100
    if (!(owed >= 0.5)) { out.skipped++; continue }
    // Mark the try first so a slow day never charges twice; the idempotency key covers retries too.
    await db.rest(`obligations?id=eq.${ob.id}`, { method: 'PATCH', body: JSON.stringify({ stripe_last_try: period }) })
    try {
      await stripe('payment_intents', {
        amount: Math.round(owed * 100), currency: 'usd', customer: ob.stripe_customer, payment_method: ob.stripe_pm,
        payment_method_types: [ob.stripe_pm_type || 'card'], off_session: true, confirm: true,
        description: `${ob.label || (ob.kind === 'rent' ? 'Rent' : 'Payment')} ${period.slice(0, 7)} (automatic)`.slice(0, 250),
        metadata: { autopay_charge: '1', obligation_id: ob.id, period, due, org_id: ob.org_id },
      }, 'POST', `autopay-${ob.id}-${period}`)
      out.charged++
    } catch (e) {
      out.errors++
      await db.rest(`obligations?id=eq.${ob.id}`, { method: 'PATCH', body: JSON.stringify({ stripe_last_error: `${period}: ${String(e.message || 'error').slice(0, 250)}` }) })
    }
  }
  res.status(200).json({ ok: true, period, ...out })
}
