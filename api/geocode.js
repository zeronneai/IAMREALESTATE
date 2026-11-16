// GET /api/geocode?lat=31.8&lng=-106.3 -> { address, zip, city } (Google reverse geocoding). Signed in users only.
import { guard } from './_lib/util.js'

export default async function handler(req, res) {
  if (!(await guard(req, res))) return
  const key = process.env.GOOGLE_MAPS_KEY
  const lat = +req.query.lat, lng = +req.query.lng
  if (!key) return res.status(503).json({ code: 'no_key' })
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return res.status(400).json({ code: 'bad_request' })
  const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&result_type=street_address|premise&key=${key}`).catch(() => null)
  const j = r?.ok ? await r.json() : null
  if (!j || j.status !== 'OK' || !j.results?.length) return res.status(404).json({ code: j?.status === 'REQUEST_DENIED' ? 'enable_geocoding' : 'not_found' })
  const c = j.results[0].address_components || []
  const get = type => c.find(x => x.types.includes(type))
  const num = get('street_number')?.long_name || '', street = get('route')?.short_name || ''
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ address: `${num} ${street}`.trim().toUpperCase(), zip: get('postal_code')?.long_name || '', city: get('locality')?.long_name || 'El Paso' })
}
