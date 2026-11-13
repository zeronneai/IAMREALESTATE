// Leaflet map (OpenStreetMap tiles, softened to a light gray with .light-tiles). Loaded on demand.
import { scoreInk, esc, money, date } from './ui.js'

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
  const map = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: true, wheelPxPerZoomLevel: 90 }).setView([31.80, -106.40], zoom)
  // Light basemap. Override with VITE_MAP_TILES_URL for a keyed provider.
  L.tileLayer(import.meta.env.VITE_MAP_TILES_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, className: import.meta.env.VITE_MAP_TILES_URL ? '' : 'light-tiles',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map)
  const pts = []
  for (const p of parcels) {
    if (p.lat == null || p.lng == null) continue
    pts.push([p.lat, p.lng])
    const c = scoreInk(p._score)
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
