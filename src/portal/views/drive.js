// Driving for Dollars: drive the area on the phone, tap to mark a house, snap photos, tag it. It lands in Properties.
import { t } from '../i18n.js'
import * as S from '../store.js'
import { esc, toast, modal, icon } from '../ui.js'
import { openDrawer } from '../drawer.js'
import * as EP from '../epcad.js'

const KEY = 'iam_drive_v1'
const SIGNS = ['vacant', 'tall_grass', 'boarded', 'damage', 'trash', 'mail_piling', 'fsbo', 'code_notice']
let st = load()
let watch = null, map = null, L = null, trail = null, me = null, layer = null, tick = null

function load() { try { return JSON.parse(localStorage.getItem(KEY)) || { on: false, path: [], marked: [], startedAt: null } } catch { return { on: false, path: [], marked: [], startedAt: null } } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(st)) } catch {} }
const R = 3958.8
const dist = (a, b) => { const r = x => x * Math.PI / 180, dLa = r(b[0] - a[0]), dLo = r(b[1] - a[1]); const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)) }
const miles = () => st.path.reduce((m, p, i) => (i ? m + dist(st.path[i - 1], p) : 0), 0)
const mins = () => (st.startedAt ? Math.round((Date.now() - new Date(st.startedAt)) / 60000) : 0)

function here() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error(t('dr.e_gps')))
    navigator.geolocation.getCurrentPosition(p => res([p.coords.latitude, p.coords.longitude]), () => rej(new Error(t('dr.e_gps'))), { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 })
  })
}

export function driveView(el) {
  const today = st.marked
  el.innerHTML = `<div class="drive fade-in">
    <div class="card drive-top">
      <div class="drive-stats"><div><b data-mi>${miles().toFixed(1)}</b><small>${esc(t('dr.miles'))}</small></div><div><b data-min>${mins()}</b><small>${esc(t('dr.minutes'))}</small></div><div><b>${today.length}</b><small>${esc(t('dr.marked'))}</small></div></div>
      <button class="btn ${st.on ? '' : 'gold'} drive-toggle" data-toggle>${esc(st.on ? t('dr.stop') : t('dr.start'))}</button>
    </div>
    <div class="drive-map" id="dmap"></div>
    <button class="drive-mark" data-mark>${icon('plus')}<span>${esc(t('dr.mark'))}</span></button>
    <div class="card"><h3>${esc(t('dr.today'))}</h3>
      ${today.length ? `<div class="drive-list">${today.map(m => { const p = S.parcel(m.id); return p ? `<button class="drive-item" data-open="${esc(p.id)}">${p.photos?.[0] ? `<img src="${esc(p.photos[0])}" alt="">` : `<span class="drive-ph">${icon('properties')}</span>`}<div><b>${esc(p.address)}</b><small>${esc((m.signs || []).map(s => t('dr.s_' + s)).join(' · '))}</small></div></button>` : '' }).join('')}</div>` : `<p class="muted">${esc(t('dr.empty'))}</p>`}
      ${today.length || st.path.length ? `<button class="btn sm ghost" data-clear style="margin-top:12px">${esc(t('dr.new_drive'))}</button>` : ''}
    </div>
    <p class="muted" style="font-size:12px;text-align:center">${esc(t('dr.safety'))}</p>
  </div>`

  el.querySelector('[data-toggle]').onclick = () => { st.on ? stopDrive() : startDrive(); driveView(el) }
  el.querySelector('[data-mark]').onclick = () => markHouse(el)
  el.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openDrawer(b.dataset.open))
  el.querySelector('[data-clear]')?.addEventListener('click', () => { stopDrive(); st = { on: false, path: [], marked: [], startedAt: null }; save(); driveView(el) })
  drawMap(el.querySelector('#dmap'))
  clearInterval(tick); tick = setInterval(() => { if (!document.body.contains(el)) return clearInterval(tick); const a = el.querySelector('[data-min]'); if (a) a.textContent = mins(); const b = el.querySelector('[data-mi]'); if (b) b.textContent = miles().toFixed(1) }, 15000)
  if (st.on && watch == null) startDrive()
}

function startDrive() {
  if (!navigator.geolocation) return toast(t('dr.e_gps'))
  if (!st.on) { st.on = true; st.startedAt = st.startedAt || new Date().toISOString() }
  save()
  watch = navigator.geolocation.watchPosition(p => {
    const pt = [+p.coords.latitude.toFixed(6), +p.coords.longitude.toFixed(6)]
    const last = st.path[st.path.length - 1]
    if (!last || dist(last, pt) > 0.01) { st.path.push(pt); if (st.path.length > 5000) st.path.shift(); save(); trail?.addLatLng(pt) }
    me?.setLatLng(pt); if (map && st.on) map.panTo(pt, { animate: true })
  }, () => {}, { enableHighAccuracy: true, maximumAge: 5000 })
}
function stopDrive() {
  if (watch != null) navigator.geolocation.clearWatch(watch); watch = null
  if (st.on && (st.marked.length || st.path.length > 2)) S.saveSettings({ lastDrive: { at: st.startedAt, miles: +miles().toFixed(1), minutes: mins(), marked: st.marked.length } }).catch(() => {})
  st.on = false; save()
}

async function drawMap(box) {
  const mod = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]); L = mod[0].default || mod[0]
  if (map) { map.remove(); map = null }
  const c = st.path[st.path.length - 1] || [31.80, -106.40]
  map = L.map(box, { zoomControl: false, attributionControl: false }).setView(c, st.path.length ? 16 : 11)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, className: 'light-tiles' }).addTo(map)
  trail = L.polyline(st.path, { color: '#2f6db0', weight: 5, opacity: .8 }).addTo(map)
  me = L.circleMarker(c, { radius: 8, color: '#fff', weight: 3, fillColor: '#2f6db0', fillOpacity: 1 }).addTo(map)
  layer = L.layerGroup().addTo(map)
  for (const m of st.marked) if (m.lat) L.circleMarker([m.lat, m.lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#c2432a', fillOpacity: 1 }).addTo(layer)
  if (st.path.length > 1) map.fitBounds(trail.getBounds(), { padding: [30, 30], maxZoom: 17 })
}

async function markHouse(el) {
  let pos = null, addr = { address: '', zip: '' }, note = ''
  const open = (msg) => modal(`<h3>${esc(t('dr.mark_title'))}</h3>
    <p class="muted" style="margin:0" data-where>${esc(msg)}</p>
    <form class="form-grid" data-dm>
      <div class="f full"><label>${esc(t('c.address'))}</label><input name="address" required value="${esc(addr.address)}" placeholder="1234 Montana Ave" autocomplete="off"></div>
      <div class="f"><label>ZIP</label><input name="zip" inputmode="numeric" maxlength="5" value="${esc(addr.zip)}"></div>
      <div class="f"><label>${esc(t('dr.photos'))}</label><label class="btn drive-cam">${icon('upload')}<span data-ncount>${esc(t('dr.take_photo'))}</span><input type="file" accept="image/*" capture="environment" multiple hidden data-cam></label></div>
      <div class="f full"><label>${esc(t('dr.signs'))}</label><div class="drive-signs">${SIGNS.map(s => `<label class="drive-sign"><input type="checkbox" name="signs" value="${s}"><span>${esc(t('dr.s_' + s))}</span></label>`).join('')}</div></div>
      <div class="f full"><label>${esc(t('d.notes'))}</label><textarea name="notes" rows="2" placeholder="${esc(t('np.notes_ph'))}"></textarea></div>
      <div class="full" style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn ghost" data-close>${esc(t('cancel'))}</button><button class="btn gold">${esc(t('dr.save'))}</button></div>
    </form>`, (box, close) => {
    const files = []
    box.querySelector('[data-cam]').onchange = e => { files.push(...e.target.files); box.querySelector('[data-ncount]').textContent = `${files.length} ${t('dr.photos_ready')}` }
    box.querySelector('[data-dm]').onsubmit = async e => {
      e.preventDefault(); const btn = e.submitter; if (btn) { btn.disabled = true; btn.textContent = t('dr.saving') }
      const fd = new FormData(e.target), v = Object.fromEntries(fd), signs = fd.getAll('signs')
      try {
        const photos = []
        for (const f of files.slice(0, 8)) photos.push(await S.uploadDrivePhoto(f))
        const tags = signs.includes('vacant') || signs.includes('boarded') || signs.includes('mail_piling') ? ['vacant'] : []
        const body = [signs.map(s => t('dr.s_' + s)).join(', '), v.notes.trim()].filter(Boolean).join(' · ')
        const row = { address: v.address.trim().toUpperCase(), zip: v.zip.trim(), tags, vacant: tags.includes('vacant'), photos, ...(pos ? { lat: pos[0], lng: pos[1] } : {}) }
        await S.importParcels([row], { tag: tags[0] || null, source: 'drive' })
        const p = S.parcels().find(x => x.address === row.address)
        if (p) {
          if (photos.length) await S.updateParcel(p.id, { photos: [...new Set([...(p.photos || []), ...photos])], ...(pos && !p.lat ? { lat: pos[0], lng: pos[1] } : {}) })
          await S.addActivity(p.id, 'drive', `${t('dr.activity')}${body ? ': ' + body : ''}`)
          const patch = await EP.patchForAsync(p).catch(() => null); if (patch) S.applyEnrichment(p.id, patch)
          st.marked.unshift({ id: p.id, lat: pos?.[0], lng: pos?.[1], signs, at: new Date().toISOString() }); save()
        }
        S.touch(); close(); toast(t('dr.saved')); driveView(el)
      } catch (err) { toast(err.message || t('team.e_error')); if (btn) { btn.disabled = false; btn.textContent = t('dr.save') } }
    }
  })
  try {
    pos = await here()
    const g = await S.reverseGeocode(pos[0], pos[1]).catch(err => { if (err.code === 'enable_geocoding') toast(t('dr.e_geocode')); return null })
    if (g) addr = g
    open(g ? t('dr.found') : t('dr.type_it'))
  } catch (err) { open(err.message) }
}
