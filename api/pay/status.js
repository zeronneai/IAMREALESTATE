// GET /api/pay/status  Is Stripe connected? (for the portal settings). No secrets returned.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  const k = process.env.STRIPE_SECRET_KEY || ''
  res.status(200).json({ ready: !!k && /^pk_(live|test)_/.test(process.env.STRIPE_PUBLISHABLE_KEY || ''), secret: !!k, publishable: /^pk_/.test(process.env.STRIPE_PUBLISHABLE_KEY || ''), mode: k.startsWith('sk_live_') || k.startsWith('rk_live_') ? 'live' : k ? 'test' : null, webhook: !!process.env.STRIPE_WEBHOOK_SECRET })
}
