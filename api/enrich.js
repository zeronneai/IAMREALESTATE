// POST /api/enrich { address | property_id } -> EPCAD appraisal data (owner, value, year built, deed date).
// Adapter: point EPCAD_LOOKUP_URL to your own lookup service (for example a Supabase function over the imported
// EPCAD certified export) or a paid property data API. Returns 501 until configured.
import { body, only, guard, notConfigured } from './_lib/util.js'

export default async function handler(req, res) {
  if (!only(req, res)) return
  if (!(await guard(req, res))) return
  const b = body(req)
  if (!b.address && !b.property_id) return res.status(400).json({ error: 'address_or_property_id_required' })
  const url = process.env.EPCAD_LOOKUP_URL
  if (!url) return notConfigured(res, 'epcad', ['EPCAD_LOOKUP_URL', 'or import the EPCAD export in Import center'])
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(process.env.EPCAD_LOOKUP_KEY ? { Authorization: `Bearer ${process.env.EPCAD_LOOKUP_KEY}` } : {}) }, body: JSON.stringify(b) })
  const j = await r.json().catch(() => ({}))
  res.status(r.ok ? 200 : 502).json(j)
}
