// GET /api/txparcel?lat=31.79&lng=-106.33  Free Texas parcel lookup (TxGIO StratMap statewide parcels, from each county
// appraisal district). Returns the lot boundary and owner. Public data; lightly rate limited.
const SVC = 'https://feature.geographic.texas.gov/arcgis/rest/services/Parcels/stratmap_land_parcels_48_most_recent/MapServer/0/query'
const hits = new Map()
export default async function handler(req, res) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  const now = Date.now(), h = (hits.get(ip) || []).filter(t => now - t < 60e3); h.push(now); hits.set(ip, h); if (hits.size > 5000) hits.clear()
  if (h.length > 200) return res.status(429).json({ code: 'slow_down' })
  const lat = +req.query.lat, lng = +req.query.lng
  if (!isFinite(lat) || !isFinite(lng) || lat < 25.5 || lat > 36.7 || lng < -106.8 || lng > -93.3) return res.status(400).json({ code: 'outside_texas' })
  const d = 0.002
  const q = new URLSearchParams({ geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', sr: '4326', layers: 'all:0', tolerance: req.query.pid ? '40' : '1', mapExtent: `${lng - d},${lat - d},${lng + d},${lat + d}`, imageDisplay: '800,600,96', returnGeometry: 'true', geometryPrecision: '6', f: 'json' })
  const r = await fetch(`${SVC.replace(/\/0\/query$/, '/identify')}?${q}`, { headers: { Accept: 'application/json' } }).catch(() => null)
  if (!r || !r.ok) return res.status(502).json({ code: 'unreachable' })
  const j = await r.json().catch(() => null)
  // With ?pid= (county property id) pick that exact parcel; the first hit can be a neighbor.
  const pid = String(req.query.pid || '').trim()
  let hit = pid ? (j?.results || []).find(x => String(x.attributes?.PROP_ID ?? x.attributes?.prop_id) === pid) : j?.results?.[0]
  if (pid && !hit) {
    const q2 = new URLSearchParams(q); q2.set('tolerance', '120')
    const r2 = await fetch(`${SVC.replace(/\/0\/query$/, '/identify')}?${q2}`, { headers: { Accept: 'application/json' } }).catch(() => null)
    const j2 = r2?.ok ? await r2.json().catch(() => null) : null
    hit = (j2?.results || []).find(x => String(x.attributes?.PROP_ID ?? x.attributes?.prop_id) === pid)
  }
  res.setHeader('Cache-Control', 'public, s-maxage=86400')
  if (!hit) return res.status(200).json({ parcel: null })
  const a = {}
  for (const [k, v] of Object.entries(hit.attributes || {})) a[k.toLowerCase()] = v === 'Null' || v === '' ? null : v
  const street = [a.situs_num, a.situs_stre, a.situs_st_1, a.situs_st_2].filter(Boolean).join(' ') || String(a.situs_addr || '').split(',')[0]
  const mail1 = a.mail_line2 || a.mail_line1 || String(a.mail_addr || '').split(',')[0]
  const rings = hit.geometry?.rings
  res.status(200).json({ parcel: { ...a, situs_addr: street.trim(), mail_line1: String(mail1 || '').trim(), mail_addr: a.mail_addr ? String(a.mail_addr).replace(/\s+,/g, ',') : null, geometry: rings ? { type: 'Polygon', coordinates: rings } : null } })
}
