// GET /api/cron/sequences  (Vercel Cron, daily at 9 to 10 am El Paso time). Sends every follow-up step that is due.
import { runDueSteps } from '../_lib/outreach.js'
export const config = { maxDuration: 300 }
export default async function handler(req, res) {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'unauthorized' })
  const r = await runDueSteps({ host: req.headers['x-forwarded-host'] || req.headers.host })
  res.status(r.ok ? 200 : 500).json(r)
}
