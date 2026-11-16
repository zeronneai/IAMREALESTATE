// Market map: homes for sale or rent anywhere in the US (Zillow style), and tap any house to see its owner (LandGlide style).
import { t, getLang } from '../i18n.js'
import * as S from '../store.js'
import { esc, money, toast, modal, icon, photoUrl } from '../ui.js'
import { openDrawer } from '../drawer.js'

let F = { place: 'El Paso, TX', mode: 'sale', priceMin: '', priceMax: '', beds: '', baths: '', type: '', daysMax: '' }
let R = { list: [], total: 0, loading: false, error: '', center: null, cached: false }
let map = null, L = null, pins = null, leadsLayer = null, base = null, sat = null, lots = null, hl = null, ownerMode = false, showLeads = true, satOn = false, lotsOn = true, hoverId = null
const inTexas = (la, lo) => la > 25.5 && la < 36.7 && lo > -106.8 && lo < -93.3
const TX_EXPORT = 'https://feature.geographic.texas.gov/arcgis/rest/services/Parcels/stratmap_land_parcels_48_most_recent/MapServer/export'
const TYPES = ['Single Family', 'Condo', 'Townhouse', 'Multi-Family', 'Manufactured', 'Land']
const short = n => (n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${n}`)
const nice = s => String(s || '').toLowerCase().replace(/(^|[\s\-'/])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())

function placeParams(p) {
  const s = String(p || '').trim()
  if (/^\d{5}$/.test(s)) return { zipCode: s }
  const m = s.match(/^(.+?)[,\s]+([A-Za-z]{2})$/)
  if (m) return { city: nice(m[1].trim()), state: m[2].toUpperCase() }
  return null
}
function filterParams() {
  const p = {}
  if (F.priceMin || F.priceMax) p.price = `${F.priceMin || 0}:${F.priceMax || '*'}`
  if (F.beds) p.bedrooms = `${F.beds}:*`
  if (F.baths) p.bathrooms = `${F.baths}:*`
  if (F.type) p.propertyType = F.type
  if (F.daysMax) p.daysOld = `1:${F.daysMax}`
  return p
}

// ---------- demo data (no key needed to show the screen) ----------
function demoListings(center, mode) {
  const [la, lo] = center || [31.795, -106.38]
  const st = ['Montana Ave', 'Dyer St', 'Zaragoza Rd', 'Pebble Hills Blvd', 'Hondo Pass Ave', 'Lee Trevino Dr', 'Mesa St', 'Yarbrough Dr', 'Alameda Ave', 'Resler Dr', 'Edgemere Blvd', 'Trawood Dr']
  const out = []
  for (let i = 0; i < 48; i++) {
    const a = Math.sin(i * 12.9898) * 43758.5453, r = a - Math.floor(a), b = Math.sin(i * 78.233) * 12543.1, r2 = b - Math.floor(b)
    const beds = 2 + (i % 4), sq = 1100 + Math.round(r * 2200)
    out.push({ id: 'demo-' + i, formattedAddress: `${1000 + Math.round(r * 9000)} ${st[i % st.length]}, El Paso, TX ${['79936', '79925', '79912', '79938', '79924'][i % 5]}`, addressLine1: `${1000 + Math.round(r * 9000)} ${st[i % st.length]}`, city: 'El Paso', state: 'TX', zipCode: ['79936', '79925', '79912', '79938', '79924'][i % 5],
      latitude: la + (r - .5) * .16, longitude: lo + (r2 - .5) * .22, propertyType: TYPES[i % 5 === 4 ? 1 : i % 7 === 0 ? 3 : 0], bedrooms: beds, bathrooms: Math.max(1, beds - 1 + (i % 2) * .5), squareFootage: sq, yearBuilt: 1960 + (i * 7) % 63,
      price: mode === 'rent' ? 1100 + Math.round(r * 1800 / 25) * 25 : Math.round((150000 + sq * 95 + r2 * 120000) / 1000) * 1000, daysOnMarket: 1 + (i * 11) % 120, listedDate: new Date(Date.now() - ((i * 11) % 120) * 86400e3).toISOString(),
      mlsName: 'GEPAR', mlsNumber: String(912300 + i), listingAgent: { name: ['Ana Ruiz', 'Mike Carter', 'Laura Gomez'][i % 3], phone: '9155550' + String(100 + i).slice(-3) }, listingOffice: { name: ['Sun City Realty', 'Desert Homes Group', 'Franklin Brokers'][i % 3] }, demo: true })
  }
  return out
}
function demoOwner(lat, lng) {
  const names = [['Maria', 'Gonzalez'], ['Robert', 'Smith'], ['Desert Rose Holdings LLC'], ['Luis', 'Hernandez']], k = Math.abs(Math.round((lat + lng) * 1000)) % 4
  const org = names[k].length === 1
  return { id: 'demo-own', formattedAddress: `${4000 + k * 111} Trawood Dr, El Paso, TX 79936`, latitude: lat, longitude: lng, propertyType: 'Single Family', bedrooms: 3, bathrooms: 2, squareFootage: 1640, lotSize: 6900, yearBuilt: 1994,
    ownerOccupied: !org && k !== 1, lastSaleDate: '2009-05-12T00:00:00.000Z', lastSalePrice: 128000, owner: { names: [org ? names[k][0] : names[k].join(' ')], type: org ? 'Organization' : 'Individual', mailingAddress: { formattedAddress: k === 1 ? '22 Elm St, Dallas, TX 75201' : `${4000 + k * 111} Trawood Dr, El Paso, TX 79936` } },
    taxAssessments: { 2025: { year: 2025, value: 198400 } }, propertyTaxes: { 2025: { year: 2025, total: 5120 } } }
}

async function api(op, params) {
  if (S.MODE === 'demo') return null
  const r = await fetch(`/api/market?op=${op}&${new URLSearchParams(params)}`, { headers: S.authHeader() })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(t('mk.e_' + (j.code || 'failed')) !== 'mk.e_' + (j.code || 'failed') ? t('mk.e_' + (j.code || 'failed')) : t('mk.e_failed'))
  return j
}

async function search(el, area = false) {
  const where = area && map ? (() => { const c = map.getCenter(), b = map.getBounds(); const mi = Math.min(100, Math.max(.5, map.distance(b.getNorthWest(), b.getSouthEast()) / 1609.34 / 2)); return { latitude: c.lat, longitude: c.lng, radius: mi.toFixed(2) } })() : placeParams(F.place)
  if (!where) return toast(t('mk.place_help'))
  R.loading = true; R.error = ''; paintList(el)
  try {
    if (S.MODE === 'demo') { await new Promise(r => setTimeout(r, 400)); R.list = demoListings(area && map ? [map.getCenter().lat, map.getCenter().lng] : null, F.mode).filter(x => (!F.beds || x.bedrooms >= +F.beds) && (!F.priceMin || x.price >= +F.priceMin) && (!F.priceMax || x.price <= +F.priceMax)); R.total = R.list.length; R.cached = false }
    else { const j = await api(F.mode === 'rent' ? 'rent' : 'sale', { ...where, ...filterParams() }); R.list = (j.data || []).filter(x => x.latitude && x.longitude); R.total = j.total || R.list.length; R.cached = !!j.cached }
  } catch (e) { R.error = e.message; R.list = [] }
  R.loading = false
  paintList(el); drawPins(true)
}

export function marketView(el) {
  el.innerHTML = `<div class="mkt fade-in">
    <div class="card mk-bar">
      <div class="mk-search"><span>${icon('search')}</span><input data-f="place" value="${esc(F.place)}" placeholder="${esc(t('mk.place_ph'))}"><button class="btn gold" data-go>${esc(t('cs.search'))}</button></div>
      <div class="seg-mini">${['sale', 'rent'].map(m => `<button data-mode="${m}" class="${F.mode === m ? 'on' : ''}">${esc(t('mk.m_' + m))}</button>`).join('')}</div>
      <input data-f="priceMin" type="number" placeholder="${esc(t('mk.min'))}" value="${esc(F.priceMin)}" class="mk-sm"><input data-f="priceMax" type="number" placeholder="${esc(t('mk.max'))}" value="${esc(F.priceMax)}" class="mk-sm">
      <select data-f="beds" class="mk-sm"><option value="">${esc(t('mk.beds'))}</option>${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${+F.beds === n ? 'selected' : ''}>${n}+ ${esc(t('mk.bd'))}</option>`).join('')}</select>
      <select data-f="baths" class="mk-sm"><option value="">${esc(t('mk.baths'))}</option>${[1, 2, 3].map(n => `<option value="${n}" ${+F.baths === n ? 'selected' : ''}>${n}+ ${esc(t('mk.ba'))}</option>`).join('')}</select>
      <select data-f="type" class="mk-sm"><option value="">${esc(t('mk.any_type'))}</option>${TYPES.map(x => `<option ${F.type === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
      <select data-f="daysMax" class="mk-sm"><option value="">${esc(t('mk.any_days'))}</option>${[7, 30, 90].map(n => `<option value="${n}" ${+F.daysMax === n ? 'selected' : ''}>${esc(t('mk.new_in'))} ${n} ${esc(t('mk.days'))}</option>`).join('')}</select>
    </div>
    <div class="mk-main">
      <div class="mk-mapwrap">
        <div id="mkmap" class="mk-map ${ownerMode ? 'owner' : ''}"></div>
        <div class="mk-tools">
          <button class="btn sm" data-area>${icon('search')}${esc(t('mk.search_area'))}</button>
          <button class="btn sm ${ownerMode ? 'gold' : ''}" data-owner title="${esc(t('mk.owner_hint'))}">${icon('properties')}${esc(t('mk.owner_mode'))}</button>
          <button class="btn sm ${satOn ? 'gold' : ''}" data-sat>${esc(t('mk.satellite'))}</button>
          <button class="btn sm ${showLeads ? 'gold' : ''}" data-leads>${esc(t('mk.my_leads'))}</button>
          <button class="btn sm ${lotsOn ? 'gold' : ''}" data-lots title="${esc(t('mk.lots_hint'))}">${esc(t('mk.lots'))}</button>
        </div>
        ${ownerMode ? `<div class="mk-tip">${esc(t('mk.owner_tip'))}</div>` : ''}
      </div>
      <aside class="mk-list" data-list></aside>
    </div></div>`
  el.querySelectorAll('[data-f]').forEach(x => x.onchange = () => { F[x.dataset.f] = x.value })
  el.querySelector('[data-f=place]').onkeydown = e => { if (e.key === 'Enter') { F.place = e.target.value; search(el) } }
  el.querySelector('[data-go]').onclick = () => { F.place = el.querySelector('[data-f=place]').value; search(el) }
  el.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { F.mode = b.dataset.mode; el.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === b)); search(el) })
  el.querySelector('[data-area]').onclick = () => search(el, true)
  el.querySelector('[data-owner]').onclick = () => { ownerMode = !ownerMode; marketView(el) }
  el.querySelector('[data-sat]').onclick = e => { satOn = !satOn; e.currentTarget.classList.toggle('gold', satOn); setBase() }
  el.querySelector('[data-lots]').onclick = e => { lotsOn = !lotsOn; e.currentTarget.classList.toggle('gold', lotsOn); setLots() }
  el.querySelector('[data-leads]').onclick = e => { showLeads = !showLeads; e.currentTarget.classList.toggle('gold', showLeads); drawLeads() }
  paintList(el)
  initMap(el).then(() => { if (!R.list.length && !R.loading) search(el); else drawPins(false) })
}

function paintList(el) {
  const box = el.querySelector('[data-list]'); if (!box) return
  box.innerHTML = R.loading ? `<p class="muted" style="padding:16px"><span class="spin"></span> ${esc(t('mk.searching'))}</p>`
    : R.error ? `<div class="alert bad" style="margin:12px">${esc(R.error)}</div>`
    : `<div class="mk-count"><b>${(+R.total).toLocaleString()} ${esc(F.mode === 'rent' ? t('mk.for_rent') : t('mk.for_sale'))}</b>${R.total > R.list.length ? `<span class="muted">${esc(t('cs.showing'))} ${R.list.length}</span>` : ''}${S.MODE === 'demo' ? `<span class="pill">${esc(t('mk.sample'))}</span>` : ''}</div>
      ${R.list.map(x => `<button class="mk-card" data-id="${esc(x.id)}">
        <img loading="lazy" alt="" src="${x.demo ? `/img/${['ext1', 'ext2', 'ext3', 'ext4', 'ext5', 'ext6', 'ext7', 'ext8', 'ext9'][Math.abs(x.id.length + +x.id.replace(/\D/g, '')) % 9]}.webp` : esc(photoUrl({ address: x.addressLine1, city: x.city, state: x.state, zip: x.zipCode }, 'street', 480, 300, true))}" onerror="this.style.visibility='hidden'">
        <div class="mk-info"><b>${money(x.price)}${F.mode === 'rent' ? `<small>/${esc(t('mk.mo'))}</small>` : ''}</b>
          <span>${[x.bedrooms != null ? `${x.bedrooms} ${t('mk.bd')}` : '', x.bathrooms != null ? `${x.bathrooms} ${t('mk.ba')}` : '', x.squareFootage ? `${(+x.squareFootage).toLocaleString()} ${t('cs.sqft')}` : ''].filter(Boolean).join(' · ')}</span>
          <small>${esc(x.formattedAddress || '')}</small>
          <small class="dim">${esc(x.propertyType || '')}${x.daysOnMarket != null ? ` · ${x.daysOnMarket} ${esc(t('mk.days_on'))}` : ''}</small></div></button>`).join('') || `<p class="muted" style="padding:16px">${esc(t('mk.none'))}</p>`}
      <p class="muted mk-note">${esc(t('mk.note'))}${R.cached ? ' · ' + esc(t('mk.cached')) : ''}</p>`
  box.querySelectorAll('[data-id]').forEach(c => {
    c.onclick = () => detail(R.list.find(x => x.id === c.dataset.id))
    c.onmouseenter = () => { hoverId = c.dataset.id; drawPins(false) }
    c.onmouseleave = () => { hoverId = null; drawPins(false) }
  })
}

async function initMap(el) {
  const box = el.querySelector('#mkmap')
  const mod = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]); L = mod[0].default || mod[0]
  if (map) { map.remove(); map = null }
  map = L.map(box, { zoomControl: true, scrollWheelZoom: true, wheelPxPerZoomLevel: 90 }).setView(R.center || [31.79, -106.40], 11)
  base = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, className: 'light-tiles', attribution: '&copy; OpenStreetMap' })
  sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagery &copy; Esri' })
  setBase()
  // Free Texas lot lines (TxGIO StratMap): drawn by the state server as images, visible when zoomed in.
  const Lots = L.TileLayer.extend({ getTileUrl(c) {
    const ts = 256, nw = map.unproject([c.x * ts, c.y * ts], c.z), se = map.unproject([(c.x + 1) * ts, (c.y + 1) * ts], c.z)
    const a = L.CRS.EPSG3857.project(nw), b = L.CRS.EPSG3857.project(se)
    return `${TX_EXPORT}?bbox=${a.x},${b.y},${b.x},${a.y}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&dpi=96&f=image`
  } })
  lots = new Lots('', { minZoom: 15, maxZoom: 20, opacity: .95, attribution: 'Lots &copy; TxGIO' })
  setLots()
  hl = L.geoJSON(null, { style: { color: '#c2432a', weight: 3, fillOpacity: .12 } }).addTo(map)
  pins = L.layerGroup().addTo(map); leadsLayer = L.layerGroup().addTo(map)
  drawLeads()
  map.on('moveend', () => { R.center = [map.getCenter().lat, map.getCenter().lng] })
  map.on('click', e => { if (ownerMode) ownerAt(e.latlng.lat, e.latlng.lng) })
}
function setLots() { if (!map || !lots) return; if (lotsOn) lots.addTo(map); else map.removeLayer(lots) }
function setBase() { if (!map) return; if (satOn) { map.removeLayer(base); sat.addTo(map) } else { map.removeLayer(sat); base.addTo(map) } }
function drawLeads() {
  if (!leadsLayer) return
  leadsLayer.clearLayers()
  if (!showLeads) return
  for (const p of S.parcels()) if (p.lat && p.lng) L.circleMarker([p.lat, p.lng], { radius: 6, color: '#fff', weight: 2, fillColor: '#2f8a4c', fillOpacity: 1 }).bindTooltip(esc(p.address)).on('click', () => openDrawer(p.id)).addTo(leadsLayer)
}
function drawPins(fit) {
  if (!pins) return
  pins.clearLayers()
  for (const x of R.list) {
    const on = x.id === hoverId
    L.marker([x.latitude, x.longitude], { zIndexOffset: on ? 1000 : 0, icon: L.divIcon({ className: '', html: `<div class="mk-pin ${on ? 'on' : ''}">${short(x.price)}</div>`, iconSize: null }) })
      .on('click', () => detail(x)).addTo(pins)
  }
  if (fit && R.list.length) map.fitBounds(L.latLngBounds(R.list.map(x => [x.latitude, x.longitude])), { padding: [30, 30], maxZoom: 14 })
}

// ---------- a listing ----------
function detail(x) {
  if (!x) return
  const q = encodeURIComponent(x.formattedAddress || '')
  modal(`<div class="mk-det">
    <div class="photos">${x.demo ? `<figure><img src="/img/ext4.webp" alt=""></figure>` : `<figure><img alt="" src="${esc(photoUrl({ address: x.addressLine1, city: x.city, state: x.state, zip: x.zipCode }, 'street', 640, 400))}" onerror="this.closest('figure').remove()"><figcaption>${esc(t('d.ph_street'))}</figcaption></figure><figure><img alt="" src="${esc(photoUrl({ address: x.addressLine1, city: x.city, state: x.state, zip: x.zipCode }, 'sat', 640, 400))}" onerror="this.closest('figure').remove()"><figcaption>${esc(t('d.ph_sat'))}</figcaption></figure>`}</div>
    <h3 style="margin:6px 0 0">${money(x.price)}${F.mode === 'rent' ? `<small class="muted">/${esc(t('mk.mo'))}</small>` : ''}</h3>
    <p style="margin:0"><b>${esc(x.formattedAddress || '')}</b></p>
    <div class="va-data">${[[t('mk.beds'), x.bedrooms], [t('mk.baths'), x.bathrooms], [t('cs.sqft'), x.squareFootage && (+x.squareFootage).toLocaleString()], [t('c.built'), x.yearBuilt], [t('mk.type'), x.propertyType], [t('mk.days_on_l'), x.daysOnMarket], [t('mk.agent'), x.listingAgent?.name && `${x.listingAgent.name}${x.listingAgent.phone ? ' · ' + x.listingAgent.phone : ''}`], [t('mk.office'), x.listingOffice?.name], ['MLS', x.mlsNumber && `${x.mlsName || ''} #${x.mlsNumber}`]].filter(([, v]) => v != null && v !== '').map(([k, v]) => `<div><small class="muted">${esc(k)}</small><b>${esc(v)}</b></div>`).join('')}</div>
    <div data-extra></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:space-between">
      <span style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-own>${icon('properties')}${esc(t('mk.owner_btn'))}</button>${F.mode === 'sale' ? `<button class="btn" data-val>${esc(t('mk.value_btn'))}</button>` : ''}
        <a class="btn ghost" target="_blank" rel="noopener" href="https://www.zillow.com/homes/${q}_rb/">Zillow ↗</a><a class="btn ghost" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${q}">Maps ↗</a></span>
      <button class="btn gold" data-add>${icon('plus')}${esc(t('cs.add'))}</button></div></div>`, (box, close) => {
    const extra = box.querySelector('[data-extra]')
    let rec = null
    box.querySelector('[data-own]').onclick = async e => {
      e.currentTarget.disabled = true
      try { rec = S.MODE === 'demo' ? demoOwner(x.latitude, x.longitude) : (await api('property', { address: x.formattedAddress })).data?.[0] || null; extra.innerHTML = rec ? ownerCard(rec) : `<p class="muted">${esc(t('mk.no_record'))}</p>` } catch (err) { toast(err.message) }
    }
    box.querySelector('[data-val]')?.addEventListener('click', async e => {
      e.currentTarget.disabled = true
      try {
        const v = S.MODE === 'demo' ? { price: Math.round(x.price * .97 / 1000) * 1000, priceRangeLow: Math.round(x.price * .9 / 1000) * 1000, priceRangeHigh: Math.round(x.price * 1.04 / 1000) * 1000 } : (await api('value', { address: x.formattedAddress, compCount: 5 })).data
        if (v?.price) extra.insertAdjacentHTML('beforeend', `<div class="alert" style="margin-top:8px"><b>${esc(t('mk.est_value'))}: ${money(v.price)}</b> <span class="muted">(${money(v.priceRangeLow)} a ${money(v.priceRangeHigh)})</span>${x.price ? ` · ${esc(t('mk.vs_list'))} ${x.price > v.price ? '+' : ''}${Math.round((x.price / v.price - 1) * 100)}%` : ''}</div>`)
      } catch (err) { toast(err.message) }
    })
    box.querySelector('[data-add]').onclick = async () => { await addLead(x, rec, ['listed']); close() }
  }, { wide: true })
}

function ownerCard(r) {
  const o = r.owner || {}, mail = o.mailingAddress?.formattedAddress || ''
  const absentee = r.ownerOccupied === false
  const tax = r.taxAssessments ? Object.values(r.taxAssessments).sort((a, b) => b.year - a.year)[0] : null
  const extra = [r.over65 ? '<span class="pill gold">65+</span>' : '', r.homestead ? '<span class="pill">Homestead</span>' : '', r.county ? `<span class="pill">${esc(r.county)} Co.</span>` : ''].join('')
  const yrs = r.lastSaleDate ? Math.floor((Date.now() - new Date(r.lastSaleDate)) / (365.25 * 86400e3)) : null
  return `<div class="mk-owner"><div class="mk-owner-h"><b>${esc((o.names || []).join(' & ') || t('va.unknown'))}</b><span class="pill ${o.type === 'Organization' ? 'blue' : ''}">${esc(o.type === 'Organization' ? t('mk.org') : t('mk.person'))}</span>${absentee ? `<span class="pill gold">${esc(t('cs.absentee'))}</span>` : r.ownerOccupied ? `<span class="pill">${esc(t('cs.lives_there'))}</span>` : ''}${extra}</div>
    <div class="va-data">${[[t('mk.mailing'), mail], [t('mk.last_sale'), r.lastSaleDate && `${String(r.lastSaleDate).slice(0, 4)}${r.lastSalePrice ? ' · ' + money(r.lastSalePrice) : ''}${yrs != null ? ` (${yrs} ${t('mk.years_ago')})` : ''}`], [t('mk.tax_value'), tax && `${money(tax.value)} (${tax.year})`], [t('mk.beds'), r.bedrooms], [t('cs.sqft'), r.squareFootage && (+r.squareFootage).toLocaleString()], [t('c.built'), r.yearBuilt]].filter(([, v]) => v).map(([k, v]) => `<div><small class="muted">${esc(k)}</small><b>${esc(v)}</b></div>`).join('')}</div></div>`
}

// ---------- tap anywhere: who owns it (LandGlide style) ----------
async function ownerAt(lat, lng) {
  const tip = L.popup({ maxWidth: 360 }).setLatLng([lat, lng]).setContent(`<span class="spin"></span> ${esc(t('mk.looking'))}`).openOn(map)
  if (inTexas(lat, lng) && S.MODE !== 'demo') {
    try {
      const r = await fetch(`/api/txparcel?lat=${lat}&lng=${lng}`); const j = await r.json()
      if (r.ok) {
        hl.clearLayers()
        if (!j.parcel) return tip.setContent(esc(t('mk.no_record')))
        const rec = await txRecord(j.parcel); rec.latitude = lat; rec.longitude = lng
        if (j.parcel.geometry) hl.addData(j.parcel.geometry)
        tip.setContent(`<div class="mk-pop"><b>${esc(rec.formattedAddress || '')}</b>${ownerCard(rec)}<small class="muted">${esc(t('mk.free_tx'))}</small><button class="btn sm gold" data-addown>${esc(t('cs.add'))}</button></div>`)
        tip.getElement()?.querySelector('[data-addown]')?.addEventListener('click', async () => { await addLead(rec, rec, rec.ownerOccupied === false ? ['absentee'] : []); map.closePopup() })
        return
      }
    } catch { /* fall back to the nationwide source */ }
  }
  try {
    const rec = S.MODE === 'demo' ? demoOwner(lat, lng) : (await api('property', { latitude: lat, longitude: lng, radius: 0.02, limit: 1 })).data?.[0]
    if (!rec) return tip.setContent(esc(t('mk.no_record')))
    tip.setContent(`<div class="mk-pop"><b>${esc(rec.formattedAddress || '')}</b>${ownerCard(rec)}<button class="btn sm gold" data-addown>${esc(t('cs.add'))}</button></div>`)
    tip.getElement()?.querySelector('[data-addown]')?.addEventListener('click', async () => { await addLead(rec, rec, rec.ownerOccupied === false ? ['absentee'] : []); map.closePopup() })
  } catch (err) { tip.setContent(esc(err.message)) }
}

async function addLead(x, rec, tags) {
  const o = rec?.owner
  const mail = o?.mailingAddress
  const absentee = rec?.ownerOccupied === false
  const tax = rec?.taxAssessments ? Object.values(rec.taxAssessments).sort((a, b) => b.year - a.year)[0] : null
  const row = { address: String(x.addressLine1 || x.formattedAddress || '').toUpperCase(), city: x.city || '', state: x.state || '', zip: x.zipCode || '', lat: x.latitude, lng: x.longitude,
    yearBuilt: x.yearBuilt || rec?.yearBuilt || null, sqft: x.squareFootage || rec?.squareFootage || null, beds: x.bedrooms ?? rec?.bedrooms ?? null, baths: x.bathrooms ?? rec?.bathrooms ?? null, lot: x.lotSize || rec?.lotSize || null,
    marketValue: tax?.value || (F.mode === 'sale' ? x.price : null) || null, lastDeedDate: rec?.lastSaleDate ? rec.lastSaleDate.slice(0, 10) : null, lastSalePrice: rec?.lastSalePrice || null,
    owners: (o?.names || []).map(n => ({ name: String(n).toUpperCase(), mailing: mail?.addressLine1 || mail?.formattedAddress || '', mailingCity: mail?.city || '', mailingState: mail?.state || '', mailingZip: mail?.zipCode || '', absentee })),
    tags: [...new Set([...(tags || []), ...(absentee ? ['absentee'] : [])])], notes: x.price && x.mlsNumber ? `${t('mk.listed_note')} ${money(x.price)} · MLS #${x.mlsNumber}` : '' }
  try {
    await S.importParcels([row], { tag: row.tags[0] || null, source: 'market' })
    S.touch(); drawLeads(); toast(t('cs.added'))
  } catch { toast(t('team.e_error')) }
}

// Texas parcel (free state data) shaped like a nationwide record; El Paso adds the county index (homestead, 65+, deed date).
async function txRecord(p) {
  const n = v => (v == null || v === '' || isNaN(+v) || +v === 0 ? null : +v)
  const situs = String(p.situs_addr || '').trim(), mail = String(p.mail_addr || [p.mail_line1, p.mail_city, p.mail_stat, p.mail_zip].filter(Boolean).join(' ')).trim()
  const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
  const absentee = !!(mail && situs && norm(mail) !== norm(situs))
  const org = /\b(LLC|INC|CORP|LTD|LP|TRUST|ESTATE|HOLDINGS|PROPERTIES|INVESTMENTS|CITY OF|COUNTY|ISD|CHURCH)\b/i.test(p.owner_name || '')
  const rec = { formattedAddress: [situs, p.situs_city, 'TX', p.situs_zip].filter(Boolean).join(', '), addressLine1: situs, city: p.situs_city || '', state: 'TX', zipCode: String(p.situs_zip || '').slice(0, 5),
    latitude: null, longitude: null, yearBuilt: n(p.year_built), ownerOccupied: situs && mail ? !absentee : null,
    owner: { names: [p.owner_name].filter(Boolean), type: org ? 'Organization' : 'Individual', mailingAddress: { formattedAddress: mail, addressLine1: p.mail_line1 || mail, city: p.mail_city || '', state: p.mail_stat || '', zipCode: String(p.mail_zip || '').slice(0, 5) } },
    taxAssessments: n(p.mkt_value) ? { [p.tax_year || 'now']: { year: p.tax_year || '', value: n(p.mkt_value) } } : null, county: p.county, propId: p.prop_id, legal: p.legal_desc }
  if (/el\s*paso/i.test(p.county || '') && p.prop_id && S.client()) {
    const { data } = await S.client().from('epcad_parcels').select('homestead,over65,last_deed_date,living_sqft,market_value').eq('prop_id', String(p.prop_id)).maybeSingle()
    if (data) { rec.squareFootage = data.living_sqft; rec.lastSaleDate = data.last_deed_date; rec.homestead = data.homestead; rec.over65 = data.over65 }
  }
  return rec
}
