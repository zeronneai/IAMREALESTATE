// GET /api/market?op=sale|rent|property|value&...  Nationwide listings, owner records and value estimates (RentCast).
// Signed in users only. Results are cached in Supabase (market_cache) so repeated searches cost nothing.
import { guard } from './_lib/util.js'
import { sb } from './_lib/outreach.js'

const BASE = 'https://api.rentcast.io/v1'
const OPS = {
  sale: { path: '/listings/sale', ttl: 12 * 3600 },
  rent: { path: '/listings/rental/long-term', ttl: 12 * 3600 },
  property: { path: '/properties', ttl: 7 * 86400 },
  value: { path: '/avm/value', ttl: 7 * 86400 },
}
const ALLOWED = ['city', 'state', 'zipCode', 'address', 'latitude', 'longitude', 'radius', 'propertyType', 'bedrooms', 'bathrooms', 'squareFootage', 'yearBuilt', 'price', 'daysOld', 'limit', 'offset', 'compCount']

export default async function handler(req, res) {
  if (!(await guard(req, res))) return
  const key = process.env.RENTCAST_API_KEY
  if (!key) return res.status(503).json({ code: 'no_key' })
  const op = OPS[req.query.op]
  if (!op) return res.status(400).json({ code: 'bad_op' })
  const q = new URLSearchParams()
  for (const k of ALLOWED) { const v = req.query[k]; if (v != null && String(v).trim() !== '') q.set(k, String(v).slice(0, 120)) }
  if (req.query.op === 'sale' || req.query.op === 'rent') { q.set('status', 'Active'); if (!q.has('limit')) q.set('limit', '200'); q.set('includeTotalCount', 'true') }
  if (q.has('latitude')) { q.set('latitude', (+q.get('latitude')).toFixed(3)); q.set('longitude', (+q.get('longitude')).toFixed(3)) }
  if (q.has('radius')) q.set('radius', String(Math.min(100, Math.max(0.01, +q.get('radius') || 1)).toFixed(2)))
  if (!['city', 'zipCode', 'address', 'latitude'].some(k => q.has(k))) return res.status(400).json({ code: 'need_place' })
  const ck = `${req.query.op}?${[...q.entries()].sort().map(([k, v]) => `${k}=${v}`).join('&')}`
  const db = sb()
  if (db.ok) {
    const hit = await db.rest(`market_cache?key=eq.${encodeURIComponent(ck)}&select=data,total,fetched_at`).then(r => (r.ok ? r.json() : [])).catch(() => [])
    if (hit?.[0] && Date.now() - new Date(hit[0].fetched_at) < op.ttl * 1000) return res.status(200).json({ data: hit[0].data, total: hit[0].total, cached: true })
  }
  const r = await fetch(`${BASE}${op.path}?${q}`, { headers: { 'X-Api-Key': key, Accept: 'application/json' } }).catch(() => null)
  if (!r) return res.status(502).json({ code: 'unreachable' })
  if (r.status === 404) return res.status(200).json({ data: req.query.op === 'value' ? null : [], total: 0 })
  if (r.status === 401 || r.status === 403) return res.status(502).json({ code: 'bad_key' })
  if (r.status === 429) return res.status(429).json({ code: 'limit' })
  if (!r.ok) return res.status(502).json({ code: 'failed', status: r.status })
  const data = await r.json()
  const total = +r.headers.get('x-total-count') || (Array.isArray(data) ? data.length : 1)
  if (db.ok) await db.rest('market_cache?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key: ck, data, total, fetched_at: new Date().toISOString() }) }).catch(() => {})
  res.status(200).json({ data, total })
}
