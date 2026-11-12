// Leaflet map (OpenStreetMap tiles). Loaded on demand.
import { scoreColor, esc, money, date } from './ui.js'

let L = null
async function lib() {
  if (L) return L
  const [mod] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')])
  L = mod.default || mod
  return L
}

export async function mountMap(el, parcels, { onOpen, zoom = 11 } = {}) {
  const L = await lib()
  if (el._map) { el._map.remove(); el._map = null }
  const map = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView([31.80, -106.40], zoom)
  // OpenStreetMap standard tiles, darkened with a CSS filter (.dark-tiles). For heavy production use,
  // switch to a keyed provider (Mapbox, MapTiler, Stadia) via VITE_MAP_TILES_URL.
  L.tileLayer(import.meta.env.VITE_MAP_TILES_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, className: import.meta.env.VITE_MAP_TILES_URL ? '' : 'dark-tiles',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map)
  const pts = []
  for (const p of parcels) {
    if (p.lat == null || p.lng == null) continue
    pts.push([p.lat, p.lng])
    const c = scoreColor(p._score).replace(/linear-gradient\([^,]+,([^,]+),.*$/, '$1')
    const m = L.marker([p.lat, p.lng], { icon: L.divIcon({ className: '', html: `<div class="pin" style="background:${c}"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] }) }).addTo(map)
    m.bindPopup(`<b>${esc(p.address)}</b><br/>${esc(p.owners?.[0]?.name || '')}<br/>${p.foreclosure ? 'Sale ' + esc(date(p.foreclosure.saleDate)) + '<br/>' : ''}Equity ${esc(money(p._d.equity, true))} · Score ${p._score}<br/><a href="#" data-open="${esc(p.id)}">Open</a>`)
  }
  map.on('popupopen', e => {
    const a = e.popup.getElement()?.querySelector('[data-open]')
    if (a) a.addEventListener('click', ev => { ev.preventDefault(); onOpen?.(a.dataset.open) })
  })
  if (pts.length > 1) map.fitBounds(pts, { padding: [24, 24], maxZoom: 13 })
  el._map = map
  setTimeout(() => map.invalidateSize(), 60)
  return map
}
