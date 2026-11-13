// Field route: optimized visiting order from the office, numbered map, Google Maps links, print sheet, field mode.
import { t } from '../i18n.js'
import * as S from '../store.js'
import { esc, money, date, toast, routeIds, selection, $ } from '../ui.js'
import { optimize, mapsLinks, OFFICE } from '../route.js'

let L = null
let ids = []
let done = new Set()

export async function routeView(el) {
  if (routeIds.length) { ids = [...routeIds]; routeIds.length = 0; done = new Set() }
  if (!ids.length && selection.size) ids = [...selection]
  const lists = S.lists()
  const ps = ids.map(S.parcel).filter(Boolean)
  if (!ps.length) {
    el.innerHTML = `<div class="card fade-in"><p class="muted">${esc(t('route.empty'))}</p>
      ${lists.length ? `<div class="toolbar">${lists.map(l => `<button class="btn sm" data-list="${esc(l.id)}">${esc(t('route.from_list'))}: ${esc(l.name)} (${l.ids.length})</button>`).join('')}</div>` : ''}</div>`
    el.querySelectorAll('[data-list]').forEach(b => b.onclick = () => { ids = [...S.lists().find(l => l.id === b.dataset.list).ids]; routeView(el) })
    return
  }
  const { stops, miles } = optimize(ps)
  const missing = ps.length - stops.length
  const links = mapsLinks(stops)
  el.innerHTML = `
  <div class="route-grid fade-in">
    <div style="display:grid;gap:12px;align-content:start;min-width:0">
      <div class="toolbar"><b>${stops.length} ${esc(t('route.stops'))}</b><span class="muted">· ${miles} ${esc(t('route.miles'))}</span>${missing ? `<span class="pill warn">${missing} sin mapa / no map</span>` : ''}<span class="sp"></span>
        ${links.map((u, i) => `<a class="btn sm gold" href="${esc(u)}" target="_blank" rel="noopener">${esc(t('route.open'))}${links.length > 1 ? ` · ${esc(t('route.part'))} ${i + 1}` : ''}</a>`).join('')}
        <button class="btn sm" data-print>${esc(t('route.print'))}</button></div>
      <div class="route-map" id="rmap"></div>
    </div>
    <div class="card" style="align-content:start"><h3>${esc(t('route.field'))}<span class="r mono">${done.size}/${stops.length}</span></h3>
      <div class="stop"><div class="n" style="background:#ece6da">0</div><div><b>${esc(t('route.start'))}</b><div class="muted" style="font-size:12px">${esc(OFFICE.label)}</div></div></div>
      ${stops.map((p, i) => `<div class="stop ${done.has(p.id) ? 'done' : ''}" data-id="${esc(p.id)}"><div class="n">${i + 1}</div><div>
        <b>${esc(p.address)}</b> <span class="muted" style="font-size:12px">${esc(p.zip)}</span>
        <div class="muted" style="font-size:12px">${esc(p.owners?.[0]?.name || '')}${p.foreclosure ? ` · ${esc(date(p.foreclosure.saleDate))}` : ''} · ${money(p._d.equity, true)}</div>
        <div class="acts">${['no_answer', 'talked', 'note', 'vacant'].map(k => `<button class="btn ghost" data-out="${k}">${esc(t('route.' + k))}</button>`).join('')}<button class="btn ghost" data-open>${esc(t('d.close') === 'Close' ? 'Open' : 'Abrir')}</button></div>
      </div></div>`).join('')}
    </div>
  </div>
  <div class="print-sheet" hidden></div>`
  el.querySelectorAll('.stop[data-id]').forEach(row => {
    const id = row.dataset.id
    row.querySelectorAll('[data-out]').forEach(b => b.onclick = async () => {
      const k = b.dataset.out
      await S.addActivity(id, 'visit', t('route.' + k))
      if (k === 'vacant') { const p = S.parcel(id); if (p && !(p.tags || []).includes('vacant')) await S.updateParcel(id, { vacant: true, tags: [...(p.tags || []), 'vacant'] }) }
      done.add(id); row.classList.add('done'); toast(t('route.logged'))
      $('.card h3 .r', el).textContent = `${done.size}/${stops.length}`
    })
    row.querySelector('[data-open]').onclick = () => import('../drawer.js').then(m => m.openDrawer(id))
  })
  el.querySelector('[data-print]').onclick = () => {
    const sh = el.querySelector('.print-sheet')
    sh.hidden = false
    sh.innerHTML = `<h2 style="margin:0 0 6px">IAM · ${esc(t('nav.route'))} · ${new Date().toLocaleDateString()}</h2><p style="margin:0 0 12px">${esc(OFFICE.label)} · ${stops.length} ${esc(t('route.stops'))} · ${miles} mi</p>
      <table style="width:100%;border-collapse:collapse;font:12px Arial">${stops.map((p, i) => `<tr style="border-bottom:1px solid #999"><td style="padding:6px;width:24px"><b>${i + 1}</b></td><td style="padding:6px"><b>${esc(p.address)}</b>, ${esc(p.zip)}<br/>${esc(p.owners?.map(o => o.name).join(' & ') || '')}</td><td style="padding:6px">${p.foreclosure ? esc(date(p.foreclosure.saleDate)) : ''}</td><td style="padding:6px;width:220px">☐ ${esc(t('route.no_answer'))} ☐ ${esc(t('route.talked'))}<br/>☐ ${esc(t('route.note'))} ☐ ${esc(t('route.vacant'))}</td></tr>`).join('')}</table>`
    setTimeout(() => { window.print(); sh.hidden = true }, 60)
  }
  await drawMap($('#rmap', el), stops)
}

async function drawMap(box, stops) {
  if (!L) { const [mod] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]); L = mod.default || mod }
  const map = L.map(box, { scrollWheelZoom: true, wheelPxPerZoomLevel: 90 }).setView([OFFICE.lat, OFFICE.lng], 12)
  L.tileLayer(import.meta.env.VITE_MAP_TILES_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, className: import.meta.env.VITE_MAP_TILES_URL ? '' : 'dark-tiles', attribution: '&copy; OpenStreetMap contributors' }).addTo(map)
  const pin = (n, cls = '') => L.divIcon({ className: '', html: `<div class="num-pin ${cls}">${n}</div>`, iconSize: [24, 24], iconAnchor: [12, 12] })
  const pts = [[OFFICE.lat, OFFICE.lng], ...stops.map(s => [s.lat, s.lng])]
  L.marker(pts[0], { icon: pin('0', 'start') }).addTo(map).bindPopup(esc(OFFICE.label))
  stops.forEach((s, i) => L.marker([s.lat, s.lng], { icon: pin(i + 1) }).addTo(map).bindPopup(`<b>${i + 1}. ${esc(s.address)}</b><br/>${esc(s.owners?.[0]?.name || '')}`))
  L.polyline(pts, { color: '#d9a93a', weight: 3, opacity: .85, dashArray: '6 6' }).addTo(map)
  map.fitBounds(pts, { padding: [30, 30] })
  setTimeout(() => map.invalidateSize(), 80)
}
