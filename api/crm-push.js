// POST /api/crm-push { leads: [...] } forwards leads to the GoHighLevel inbound webhook (GHL_WEBHOOK_URL).
import { body, only, guard, notConfigured } from './_lib/util.js'

export default async function handler(req, res) {
  if (!only(req, res)) return
  if (!(await guard(req, res))) return
  const leads = Array.isArray(body(req).leads) ? body(req).leads.slice(0, 500) : []
  if (!leads.length) return res.status(400).json({ error: 'no_leads' })
  const url = process.env.GHL_WEBHOOK_URL
  if (!url) return notConfigured(res, 'gohighlevel', ['GHL_WEBHOOK_URL'])
  let sent = 0, failed = 0
  for (const l of leads) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source: 'IAM Portal', ...l }) })
      r.ok ? sent++ : failed++
    } catch { failed++ }
  }
  res.status(200).json({ sent, failed })
}
