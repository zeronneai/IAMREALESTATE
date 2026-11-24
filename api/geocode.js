// GET /api/geocode?lat=31.8&lng=-106.3 -> { address, zip, city } (Google reverse geocoding).
// GET /api/geocode?address=123 Main St&zip=79924 -> { lat, lng } (US Census geocoder, no key; Google as backup). Signed in users only.
import { guard } from './_lib/util.js'

export default async function handler(req, res) {
  if (!(await guard(req, res))) return
  const key = process.env.GOOGLE_MAPS_KEY
  if (req.query.address) return forward(req, res, key)
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

async function forward(req, res, key) {
  const street = String(req.query.address).slice(0, 120).trim(), zip = String(req.query.zip || '').replace(/\D/g, '').slice(0, 5)
  const city = String(req.query.city || 'El Paso').slice(0, 40)
  const line = `${street}, ${city}, TX${zip ? ' ' + zip : ''}`
  res.setHeader('Cache-Control', 'no-store')
  const c = await fetch('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=' + encodeURIComponent(line)).then(r => r.ok ? r.json() : null).catch(() => null)
  const m = c?.result?.addressMatches?.[0]
  if (m?.coordinates) return res.status(200).json({ lat: +m.coordinates.y, lng: +m.coordinates.x, source: 'census' })
  if (key) {
    const g = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(line)}&key=${key}`).then(r => r.ok ? r.json() : null).catch(() => null)
    const loc = g?.status === 'OK' && g.results?.[0]?.geometry?.location
    if (loc) return res.status(200).json({ lat: loc.lat, lng: loc.lng, source: 'google' })
  }
  return res.status(404).json({ code: 'not_found' })
}
