// Door knock / drive route: nearest neighbor + 2-opt on straight line distance (good enough inside a city),
// numbered stops on the map, Google Maps links in chunks of 9 waypoints, printable sheet and field mode.
export const OFFICE = { label: 'IAM office · 1522 Montana Ave', address: '1522 Montana Ave, El Paso, TX 79902', lat: 31.7716, lng: -106.4744 }

const R = 3958.8
export function miles(a, b) {
  const t = x => x * Math.PI / 180
  const dLat = t(b.lat - a.lat), dLng = t(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
const len = (pts) => pts.reduce((s, p, i) => (i ? s + miles(pts[i - 1], p) : 0), 0)

// stops: [{id, lat, lng, ...}] start: {lat,lng}. Returns ordered stops (open route from start, no return).
export function optimize(stops, start = OFFICE) {
  const left = stops.filter(s => s.lat != null && s.lng != null)
  const order = []
  let cur = start
  while (left.length) {
    let bi = 0, bd = Infinity
    left.forEach((s, i) => { const d = miles(cur, s); if (d < bd) { bd = d; bi = i } })
    cur = left.splice(bi, 1)[0]; order.push(cur)
  }
  // 2-opt improvement on [start, ...order]
  let route = [start, ...order], improved = true, guard = 0
  while (improved && guard++ < 60) {
    improved = false
    for (let i = 1; i < route.length - 2; i++) {
      for (let k = i + 1; k < route.length - 1; k++) {
        const a = route[i - 1], b = route[i], c = route[k], d = route[k + 1]
        if (miles(a, c) + miles(b, d) < miles(a, b) + miles(c, d) - 1e-9) { route = [...route.slice(0, i), ...route.slice(i, k + 1).reverse(), ...route.slice(k + 1)]; improved = true }
      }
    }
  }
  return { stops: route.slice(1), miles: +len(route).toFixed(1) }
}

// Google Maps directions URLs; each link holds origin + up to 9 waypoints + destination.
export function mapsLinks(stops, start = OFFICE) {
  const a = s => encodeURIComponent(s.fullAddress || `${s.address}, ${s.city || 'El Paso'}, TX ${s.zip || ''}`)
  const links = []
  let origin = start.address ? encodeURIComponent(start.address) : `${start.lat},${start.lng}`
  for (let i = 0; i < stops.length; i += 10) {
    const chunk = stops.slice(i, i + 10)
    const dest = chunk[chunk.length - 1]
    const wps = chunk.slice(0, -1).map(a).join('|')
    links.push(`https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${origin}&destination=${a(dest)}${wps ? '&waypoints=' + wps : ''}`)
    origin = a(dest)
  }
  return links
}
