// GET /api/pay/info?t=<token>  Public: what a pay link is for (company, home, amount due, period). No private data.
import { payTarget, stripeReady, stripePk, KIND_LABEL } from '../_lib/pay.js'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  const x = await payTarget(req.query?.t)
  if (!x) return res.status(404).json({ error: 'not_found' })
  const first = String(x.ob.party || '').trim().split(/\s+/)[0] || ''
  res.status(200).json({
    company: x.org?.name || 'I AM Real Estate', phone: x.org?.sms_number || null,
    home: x.inv?.address || null, unit: x.ob.unit || null, kind: x.ob.kind, label: x.ob.label || null, kind_label: KIND_LABEL[x.ob.kind] || KIND_LABEL.rent,
    name: first, period: x.period, due: x.due || null, amount: x.amount, ready: stripeReady() && !!stripePk(), pk: stripePk(),
    // Rent, wrap and loan links let them pay part of it (or a different amount the team agreed); one-time charges are exact.
    once: x.ob.frequency === 'once',
    // Automatic monthly payment: offered on recurring links when the team allows it; shows if it is already on.
    autopay_ok: x.ob.frequency !== 'once' && x.cfg.autopay !== false, autopay_on: !!x.ob.stripe_autopay, autopay_label: x.ob.stripe_autopay ? (x.ob.stripe_pm_label || null) : null, other_amount: x.ob.frequency !== 'once' && x.cfg.partial !== false, bank: !!x.cfg.bank, card: !!x.cfg.card,
  })
}
