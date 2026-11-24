import { t } from '../i18n.js'
import * as S from '../store.js'
import { esc, money, date, scoreInk } from '../ui.js'
import { firstTuesdays, today, daysUntil } from '../score.js'
import { openDrawer } from '../drawer.js'
import { mountMap } from '../map.js'

// Map colors asked by I AM: red = foreclosures, green = working this month, blue = homes we own.
const PIN = { own: '#2f6fed', work: '#22a55a', fc: '#e5484d', other: '#9a9a9a' }
const mapShow = { own: true, work: true, fc: true, other: false }
const WORKING = ['contacted', 'appointment', 'offer', 'under_contract']
// Our homes: linked to the property, or same street number and street name.
const key = a => String(a || '').toUpperCase().replace(/[.,#&-]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).join(' ')
const ownedOf = p => S.inventoryFor(p.id) || S.inventory().find(v => v.status !== 'sold' && key(v.address) === key(p.address)) || null
function pinOf(p) {
  const v = ownedOf(p)
  if (v && v.status !== 'sold') return 'own'
  if (WORKING.includes(p.status)) return 'work'
  if (p.foreclosure && (p._d?.daysToSale ?? -1) >= 0) return 'fc'
  return 'other'
}
// Our homes with no mapped property: pin them from their own address (geocoded once and saved on the home).
const geoTried = new Set()
function homePins(ps) {
  const mapped = new Set(ps.filter(p => p.lat != null && p.status !== 'dead').map(p => ownedOf(p)?.id).filter(Boolean))
  return S.inventory().filter(v => v.status !== 'sold' && !mapped.has(v.id))
}
function homeHtml(v) {
  const ph = v.listing?.photos?.[0], note = v.notes || ''
  return `${ph ? `<img class="pop-ph" src="${esc(ph)}" alt="">` : ''}<span class="pop-k" style="background:${PIN.own}">${esc(t('dash.pin_own'))}</span>${note ? `<div class="pop-note">${esc(String(note).slice(0, 140))}</div>` : ''}<b>${esc(v.address)}</b><br/>${esc(t('is.' + v.status))}<br/><a href="#/inventory">${esc(t('dash.pin_open_home'))}</a>`
}
async function geocodeHomes(list, el) {
  if (S.MODE === 'demo') return
  const todo = list.filter(v => !v.listing?.geo && !geoTried.has(v.id) && v.address).slice(0, 12)
  if (!todo.length) return
  let n = 0
  for (const v of todo) {
    geoTried.add(v.id)
    try {
      const r = await fetch(`/api/geocode?address=${encodeURIComponent(v.address)}&zip=${encodeURIComponent(v.zip || '')}`, { headers: S.authHeader() })
      if (!r.ok) continue
      const g = await r.json()
      if (isFinite(g.lat) && isFinite(g.lng)) { await S.saveInventory({ ...v, listing: { ...(v.listing || {}), geo: { lat: g.lat, lng: g.lng } } }); n++ }
    } catch {}
  }
  if (n && el.isConnected) dashboard(el)
}

// Top of the pin popup: a photo (team photo or listing photo), the type and the latest note.
function popTop(p) {
  const v = ownedOf(p), ph = (p.photos || [])[0] || v?.listing?.photos?.[0]
  const k = pinOf(p), note = (p.activities || []).find(a => a.kind === 'note')?.body || p.notes || v?.notes || ''
  return `${ph ? `<img class="pop-ph" src="${esc(ph)}" alt="">` : ''}<span class="pop-k" style="background:${PIN[k]}">${esc(t('dash.pin_' + k))}</span>${note ? `<div class="pop-note">${esc(String(note).slice(0, 140))}</div>` : ''}`
}

export function dashboard(el) {
  const ps = S.parcels()
  const counts = { own: 0, work: 0, fc: 0, other: 0 }; ps.filter(p => p.status !== 'dead').forEach(p => counts[pinOf(p)]++)
  const homes = homePins(ps); counts.own += homes.length
  const fcs = ps.filter(p => p.foreclosure && p._d.daysToSale >= 0)
  const sales = firstTuesdays(today(), 3)
  const next = sales[0]
  const nextN = fcs.filter(p => p.foreclosure.saleDate === next).length
  const hot = ps.filter(p => p._score >= 70 && p.status !== 'dead').length
  const inv = S.inventory().filter(v => v.status !== 'sold')
  const invVal = inv.reduce((s, v) => s + (v.arv || 0), 0)
  const debt = inv.reduce((s, v) => s + (v.statements?.at(-1)?.balance || 0), 0)
  const due30 = inv.flatMap(v => (v.statements || []).filter(s => !s.paid && daysUntil(s.dueDate) <= 30).map(s => s.amountDue || 0)).reduce((a, b) => a + b, 0)
  const dNext = daysUntil(next)

  const bySale = sales.map(s => ({ s, items: fcs.filter(p => p.foreclosure.saleDate === s) }))
  const maxN = Math.max(1, ...bySale.map(x => x.items.length))
  const buckets = Array.from({ length: 10 }, (_, i) => ps.filter(p => Math.min(9, Math.floor(p._score / 10)) === i).length)
  const maxB = Math.max(1, ...buckets)
  const stages = ['new', 'contacted', 'appointment', 'offer', 'under_contract', 'dead']
  const stageN = stages.map(s => ps.filter(p => p.status === s).length)
  const maxS = Math.max(1, ...stageN)
  const tasks = ps.flatMap(p => (p.tasks || []).filter(x => !x.done).map(x => ({ ...x, p }))).sort((a, b) => (a.due || '9').localeCompare(b.due || '9')).slice(0, 7)

  el.innerHTML = `
  <div class="kpis fade-in">
    <div class="kpi hero"><div class="l">${esc(t('k.next_sale'))}</div><div class="v mono">${dNext}<span style="font-size:15px;color:var(--muted)"> ${esc(t('k.days'))}</span></div><div class="s">${esc(date(next))} · ${esc(t('k.first_tue'))}</div></div>
    <div class="kpi"><div class="l">${esc(t('k.fc_month'))}</div><div class="v">${nextN}</div><div class="s">${fcs.length} ${esc(t('rows'))} · ${esc(date(next))}</div></div>
    <div class="kpi"><div class="l">${esc(t('k.hot'))}</div><div class="v">${hot}</div><div class="s">${ps.length} ${esc(t('rows'))}</div></div>
    <div class="kpi"><div class="l">${esc(t('k.inv_value'))}</div><div class="v">${money(invVal, true)}</div><div class="s">${inv.length} ${esc(t('lists.items'))}</div></div>
    <div class="kpi"><div class="l">${esc(t('k.debt'))}</div><div class="v">${money(debt, true)}</div><div class="s">${inv.filter(v => v.mortgage).length} loans</div></div>
    <div class="kpi"><div class="l">${esc(t('k.payments'))}</div><div class="v">${money(due30, true)}</div><div class="s">${esc(t('nav.mortgages'))}</div></div>
  </div>
  <div class="grid-2">
    <div class="card fade-in"><h3>${esc(t('dash.timeline'))}<a class="r" href="#/foreclosures">${esc(t('nav.foreclosures'))} →</a></h3>
      <div class="tl">${bySale.map(({ s, items }) => {
        const eq = items.reduce((a, p) => a + Math.max(0, p._d.equity), 0)
        const top = [...items].sort((a, b) => b._score - a._score)[0]
        return `<div class="tl-row" data-sale="${s}"><div class="tl-date"><b>${esc(date(s).replace(/, \d{4}$/, ''))}</b><span>${daysUntil(s)} ${esc(t('k.days'))}</span></div>
          <div><div class="tl-bar"><i style="width:${(items.length / maxN) * 100}%"></i></div><div class="tl-meta">${items.length} ${esc(t('rows'))} · equity ${money(eq, true)}${top ? ` · top: ${esc(top.address)} (${top._score})` : ''}</div></div>
          <div class="tl-n">${items.length}</div></div>`
      }).join('')}</div>
    </div>
    <div class="card fade-in"><h3>${esc(t('dash.scores'))}</h3>
      <div class="bars">${buckets.map((n, i) => `<div class="b"><em>${n}</em><i style="height:${(n / maxB) * 110}px;background:${scoreInk(i * 10 + 5)}"></i><span>${i * 10}</span></div>`).join('')}</div>
    </div>
  </div>
  <div class="grid-2">
    <div class="card fade-in"><h3>${esc(t('dash.map'))}</h3><div class="map-legend">${Object.entries(PIN).map(([k, c]) => `<label class="${mapShow[k] ? 'on' : ''}"><input type="checkbox" data-pin="${k}" ${mapShow[k] ? 'checked' : ''}><i style="background:${c}"></i>${esc(t('dash.pin_' + k))} <span class="dim">${counts[k]}</span></label>`).join('')}</div><div class="map" id="dmap"></div></div>
    <div style="display:grid;gap:18px;align-content:start">
      <div class="card fade-in"><h3>${esc(t('dash.pipeline'))}</h3><div class="funnel">${stages.map((s, i) => `<div class="funnel-row"><span>${esc(t('st.' + s))}</span><span class="b"><i style="width:${(stageN[i] / maxS) * 100}%"></i></span><span class="mono">${stageN[i]}</span></div>`).join('')}</div></div>
      <div class="card fade-in"><h3>${esc(t('dash.tasks'))}</h3>${tasks.length ? tasks.map(x => `<div class="task" data-open="${esc(x.p.id)}" style="cursor:pointer"><span class="pill ${daysUntil(x.due) < 0 ? 'bad' : ''}">${esc(x.due ? date(x.due) : '')}</span><span>${esc(x.title)}</span><span class="dim" style="font-size:12px">${esc(x.p.address)}</span></div>`).join('') : `<p class="muted">${esc(t('dash.none'))}</p>`}</div>
    </div>
  </div>`
  el.querySelectorAll('[data-sale]').forEach(r => r.onclick = () => { location.hash = '#/foreclosures?sale=' + r.dataset.sale })
  el.querySelectorAll('[data-open]').forEach(r => r.onclick = () => openDrawer(r.dataset.open))
  el.querySelectorAll('[data-pin]').forEach(c => c.onchange = () => { mapShow[c.dataset.pin] = c.checked; dashboard(el) })
  const live = ps.filter(p => p.status !== 'dead')
  const extraPins = homes.filter(v => v.listing?.geo).map(v => ({ id: 'inv-' + v.id, _inv: v, lat: v.listing.geo.lat, lng: v.listing.geo.lng, _html: homeHtml(v) }))
  mountMap(el.querySelector('#dmap'), [...live, ...extraPins], { onOpen: openDrawer, colorOf: p => { if (p._inv) return mapShow.own ? PIN.own : null; const k = pinOf(p); return mapShow[k] ? PIN[k] : null }, extra: popTop })
  geocodeHomes(homes, el)
}
