// GET /api/photo?q=<address or lat,lng>&kind=street|sat&w=640&h=360
// Returns a property photo from Google (Street View, or satellite if no street image exists).
// The Google key stays on the server. Images are cached 30 days at the edge to keep cost near zero.
export default async function handler(req, res) {
  const key = process.env.GOOGLE_MAPS_KEY
  const q = String(req.query.q || '').slice(0, 200).trim()
  const kind = req.query.kind === 'sat' ? 'sat' : 'street'
  const w = Math.min(640, Math.max(80, parseInt(req.query.w) || 640))
  const h = Math.min(640, Math.max(80, parseInt(req.query.h) || 400))
  if (!key || !q) return res.status(404).end()
  const loc = encodeURIComponent(q)
  try {
    let url = null
    if (kind === 'street') {
      // Metadata calls are free: only pay for an image that exists.
      const meta = await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${loc}&source=outdoor&key=${key}`).then(r => r.json())
      if (meta.status === 'OK') url = `https://maps.googleapis.com/maps/api/streetview?size=${w}x${h}&location=${loc}&source=outdoor&fov=80&key=${key}`
    }
    if (!url) url = `https://maps.googleapis.com/maps/api/staticmap?center=${loc}&zoom=19&size=${w}x${h}&scale=2&maptype=satellite&markers=color:0xc99a2e%7C${loc}&key=${key}`
    const r = await fetch(url)
    if (!r.ok) return res.status(502).end()
    const buf = Buffer.from(await r.arrayBuffer())
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg')
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=2592000, immutable')
    return res.status(200).send(buf)
  } catch { return res.status(502).end() }
}
