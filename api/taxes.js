// POST /api/taxes { property_id | account } -> delinquent taxes per taxing entity.
// The El Paso consolidated tax office publishes accounts at actweb.acttax.com (El Paso). There is no public API;
// configure TAX_LOOKUP_URL with an approved data feed or service after reviewing the site's terms of use.
import { body, only, guard, notConfigured } from './_lib/util.js'

export default async function handler(req, res) {
  if (!only(req, res)) return
  if (!(await guard(req, res))) return
  const b = body(req)
  if (!b.property_id && !b.account) return res.status(400).json({ error: 'property_id_or_account_required' })
  const url = process.env.TAX_LOOKUP_URL
  if (!url) return notConfigured(res, 'taxes', ['TAX_LOOKUP_URL'])
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(process.env.TAX_LOOKUP_KEY ? { Authorization: `Bearer ${process.env.TAX_LOOKUP_KEY}` } : {}) }, body: JSON.stringify(b) })
  const j = await r.json().catch(() => ({}))
  res.status(r.ok ? 200 : 502).json(j)
}
