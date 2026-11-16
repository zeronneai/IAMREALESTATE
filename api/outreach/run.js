// POST /api/outreach/run  Sends the caller's company follow-up steps that are due now (used right after enrolling owners).
import { only, guard } from '../_lib/util.js'
import { runDueSteps, sb } from '../_lib/outreach.js'
export const config = { maxDuration: 120 }
export default async function handler(req, res) {
  if (!only(req, res)) return
  const a = await guard(req, res); if (!a) return
  const db = sb(); if (!db.ok || !a.user) return res.status(503).json({ code: 'not_configured' })
  const me = (await (await db.rest(`team_members?user_id=eq.${a.user.id}&select=org_id,role`)).json())?.[0]
  if (!me || !['admin', 'agent'].includes(me.role)) return res.status(403).json({ code: 'forbidden' })
  const r = await runDueSteps({ orgId: me.org_id, limit: 200, host: req.headers['x-forwarded-host'] || req.headers.host })
  res.status(r.ok ? 200 : 500).json(r)
}
