import './style.css'
import { applyLang, initialLang, t, onLang, getLang } from './i18n.js'
import { initListings, LISTINGS } from './listings.js'
import { STYLES } from './houses.js'
import { initCashOffer } from './cashoffer.js'
import { initInvest } from './invest.js'
import { initChat } from './chat.js'
import { wireLeadForms } from './leads.js'

const TEAM = [
  { n: 'Gerardo "Jerry" Gonzalez', r: ['Founder', 'Fundador'], i: 'JG' },
  { n: 'Hugo Gomez', r: ['Co-Founder · Investor Relations', 'Cofundador · Inversionistas'], i: 'HG' },
  { n: 'Angeline Gomez', r: ['CEO · Licensed Real Estate Agent', 'CEO · Agente inmobiliaria con licencia'], i: 'AG' },
  { n: 'Miguel Franco', r: ['CMO · Brand & Growth', 'CMO · Marca y crecimiento'], i: 'MF' },
  { n: 'Robert "Bobby" Wiest', r: ['Property Specialist', 'Especialista en propiedades'], i: 'BW' },
  { n: 'Veronica "Vero" Delgado', r: ['Client Support', 'Atención a clientes'], i: 'VD' },
]
const FAQ = [
  [['What types of properties do you buy?', '¿Qué tipo de propiedades compran?'], ['Single-family homes, multi-family, land, commercial and industrial property in El Paso County, in any condition.', 'Casas unifamiliares, multifamiliares, terrenos, propiedades comerciales e industriales en el condado de El Paso, en cualquier condición.']],
  [['Is the online cash offer a real offer?', '¿La oferta en línea es una oferta real?'], ['It is an instant estimate based on El Paso averages. A specialist reviews the property and gives you a firm written offer, usually within 24 to 48 hours.', 'Es un estimado inmediato con promedios de El Paso. Un especialista revisa la propiedad y te da una oferta firme por escrito, normalmente en 24 a 48 horas.']],
  [['Can I invest with limited capital?', '¿Puedo invertir con poco capital?'], ['Yes. Through joint ventures and partnerships you can participate in deals while our team handles sourcing, renovation and management.', 'Sí. Con joint ventures y sociedades participas en los negocios mientras nuestro equipo se encarga de encontrar, remodelar y administrar.']],
  [['Do you offer property management?', '¿Ofrecen administración de propiedades?'], ['Yes, full service: tenant screening, leases, rent collection, maintenance and monthly owner statements.', 'Sí, servicio completo: evaluación de inquilinos, contratos, cobro de renta, mantenimiento y estados de cuenta mensuales.']],
  [['Can I tour homes from Juárez or out of state?', '¿Puedo ver casas desde Juárez o desde otro estado?'], ['Yes. Our listings include 3D tours and we run live video showings in English or Spanish.', 'Sí. Nuestras propiedades incluyen tours 3D y hacemos visitas en video en vivo en inglés o español.']],
  [['How do I get started?', '¿Cómo empiezo?'], ['Call 855 305 2048, use the assistant at the bottom right, or pick your path at the top of this page.', 'Llama al 855 305 2048, usa el asistente abajo a la derecha o elige tu camino arriba en esta página.']],
]
const L = v => v[getLang() === 'es' ? 1 : 0]

function renderTeam() {
  document.getElementById('team').innerHTML = TEAM.map((m, i) => `
    <li class="member" style="--i:${i}"><span class="avatar" aria-hidden="true">${m.i}</span><div><strong>${m.n}</strong><span>${L(m.r)}</span></div></li>`).join('')
}
function renderFaq() {
  document.getElementById('faqList').innerHTML = FAQ.map(([q, a]) => `<details><summary>${L(q)}<span class="plus" aria-hidden="true"></span></summary><p>${L(a)}</p></details>`).join('')
}

// language
document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => applyLang(b.dataset.lang)))
onLang(() => { renderTeam(); renderFaq(); setPath(currentPath) })

// mobile nav
const burger = document.querySelector('.burger')
burger.addEventListener('click', () => {
  const open = document.body.classList.toggle('nav-open'); burger.setAttribute('aria-expanded', String(open))
})
document.querySelectorAll('.nav-links a').forEach(a => a.addEventListener('click', () => { document.body.classList.remove('nav-open'); burger.setAttribute('aria-expanded', 'false') }))
window.addEventListener('scroll', () => document.body.classList.toggle('scrolled', scrollY > 30), { passive: true })

// hero path selector
let currentPath = 'buy'
const goKeys = { buy: 'path.goBuy', sell: 'path.goSell', invest: 'path.goInvest' }
function setPath(p) {
  currentPath = p
  document.querySelectorAll('[data-path]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.path === p)))
  document.querySelectorAll('.pf').forEach(el => { el.hidden = !el.classList.contains('pf-' + p) })
  document.getElementById('pathGoLabel').textContent = t(goKeys[p])
}
document.querySelectorAll('[data-path]').forEach(b => b.addEventListener('click', () => setPath(b.dataset.path)))

const listings = initListings({ onTour: l => openTour(l) })
const offer = initCashOffer()
initInvest()
initChat()
wireLeadForms()

document.getElementById('pathForm').addEventListener('submit', e => {
  e.preventDefault()
  if (currentPath === 'buy') {
    listings.setFilters({ type: document.getElementById('heroType').value, area: document.getElementById('heroArea').value, max: document.getElementById('heroMax').value })
    document.getElementById('homes').scrollIntoView({ behavior: 'smooth' })
  } else if (currentPath === 'sell') {
    offer.prefill(document.getElementById('heroAddress').value.trim())
    document.getElementById('sell').scrollIntoView({ behavior: 'smooth' })
  } else {
    document.getElementById('invCapital').value = document.getElementById('heroCapital').value
    document.getElementById('invest').scrollIntoView({ behavior: 'smooth' })
  }
})

// reveal on scroll
const rio = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); rio.unobserve(e.target) } }), { threshold: 0.12 })
document.querySelectorAll('.reveal, .pcard, .section-head, .lcard, .note, .man-card, .member, .ns-col').forEach(el => rio.observe(el))
new MutationObserver(() => document.querySelectorAll('.lcard:not(.in), .member:not(.in)').forEach(el => rio.observe(el))).observe(document.body, { childList: true, subtree: true })

// 3D tour: load three.js only when the section approaches the viewport
let tour = null, tourLoading = null, tourListing = LISTINGS[0]
const stage = document.getElementById('tourStage')
const roomBar = document.getElementById('roomBar')
const floorSeg = document.getElementById('floorSeg')
const switchEl = document.getElementById('tourSwitch')
const money = n => '$' + Math.round(n).toLocaleString('en-US')

function renderSwitch() {
  switchEl.innerHTML = `<span class="ts-label mono">${t('tour.pick')}</span><div class="ts-row">` + LISTINGS.map(l => `
    <button type="button" class="ts-item${l.id === tourListing.id ? ' on' : ''}" data-tour-id="${l.id}" aria-pressed="${l.id === tourListing.id}">
      <img src="/img/${l.img[0]}.webp" alt="" loading="lazy" width="96" height="64" />
      <span><strong>${l.street.replace(' (Demo)', '')}</strong><small>${l.type === 'rent' ? money(l.price) + t('homes.mo') : money(l.price)} · ${l.beds} ${t('homes.bd')} · ${l.sqft.toLocaleString()} ${t('tour.sqft')}</small></span>
    </button>`).join('') + '</div>'
}
function renderBadge() {
  const l = tourListing, es = getLang() === 'es'
  const st = STYLES[l.house.style].name[es ? 1 : 0]
  const size = es ? `${Math.round(l.sqft / 10.764)} M²` : `${l.sqft.toLocaleString()} SQ FT`
  document.getElementById('tourBadge').textContent = `${t('tour.demo')} · ${st.toUpperCase()} · ${size} · ${l.beds} ${es ? 'REC' : 'BD'} · ${l.baths} ${es ? 'BAÑOS' : 'BA'}`
  floorSeg.hidden = !(l.house.stories > 1)
}
function renderRooms(active = 'overview') {
  if (!tour) return
  roomBar.innerHTML = tour.roomList().map(r => `<button type="button" data-room="${r.id}" class="${r.id === active ? 'active' : ''}">${r.label}</button>`).join('')
}
function loadTour() {
  if (tourLoading) return tourLoading
  tourLoading = import('./tour3d.js').then(({ createTour }) => {
    try {
      tour = createTour({
        canvas: document.getElementById('tourCanvas'), stage,
        pinsEl: document.getElementById('tourPins'), measureEl: document.getElementById('measure'),
        loadingEl: document.getElementById('tourLoading'), padEl: document.getElementById('walkPad'), hintEl: document.getElementById('walkHint'),
        onRoom: id => roomBar.querySelectorAll('[data-room]').forEach(b => { const on = b.dataset.room === id; b.classList.toggle('active', on); if (on) b.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }),
        onFloor: f => floorSeg.querySelectorAll('[data-floor]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.floor === f))),
        onWalk: on => { const b = document.getElementById('walkToggle'); b.setAttribute('aria-pressed', String(on)); b.querySelector('span').textContent = t(on ? 'tour.exitWalk' : 'tour.walk') },
      })
      tour.load(tourListing, { first: true })
      tour.setLight('day')
      renderRooms()
    } catch (err) {
      console.warn('3D unavailable', err)
      document.getElementById('tourLoading').innerHTML = '<span>WebGL is not available on this device.</span>'
    }
    return tour
  })
  return tourLoading
}
function selectListing(l) {
  tourListing = l
  renderSwitch(); renderBadge()
  if (tour) { tour.load(l); renderRooms() }
}
new IntersectionObserver((es, o) => { if (es[0].isIntersecting) { loadTour(); o.disconnect() } }, { rootMargin: '600px' }).observe(stage)
async function openTour(l) {
  document.getElementById('tour').scrollIntoView({ behavior: 'smooth' })
  if (l && l.id !== tourListing.id) { tourListing = l; renderSwitch(); renderBadge() }
  const tr = await loadTour()
  if (tr && l && tr.plan && tr.plan.listing.id !== l.id) { tr.load(l); renderRooms() }
}
switchEl.addEventListener('click', e => { const b = e.target.closest('[data-tour-id]'); if (b) selectListing(LISTINGS.find(x => x.id === b.dataset.tourId)) })
roomBar.addEventListener('click', async e => { const b = e.target.closest('[data-room]'); if (!b) return; const tr = await loadTour(); tr && tr.goRoom(b.dataset.room) })
floorSeg.addEventListener('click', async e => { const b = e.target.closest('[data-floor]'); if (!b) return; const tr = await loadTour(); tr && tr.setFloor(+b.dataset.floor) })
document.querySelectorAll('[data-light]').forEach(b => b.addEventListener('click', async () => {
  const tr = await loadTour(); if (!tr) return
  tr.setLight(b.dataset.light)
  document.querySelectorAll('[data-light]').forEach(x => x.setAttribute('aria-pressed', String(x === b)))
}))
document.getElementById('stageToggle').addEventListener('change', async e => { const tr = await loadTour(); tr && tr.setStaging(e.target.checked) })
document.getElementById('walkToggle').addEventListener('click', async () => { const tr = await loadTour(); tr && tr.toggleWalk() })
onLang(() => {
  renderSwitch(); renderBadge()
  if (tour) { const a = roomBar.querySelector('.active'); renderRooms(a ? a.dataset.room : 'overview'); const b = document.getElementById('walkToggle'); b.querySelector('span').textContent = t(tour.walking ? 'tour.exitWalk' : 'tour.walk') }
})
renderSwitch(); renderBadge()

document.getElementById('year').textContent = new Date().getFullYear()
applyLang(initialLang())

// debug hook for automated screenshots
window.__iam = { loadTour, selectListing: id => selectListing(LISTINGS.find(x => x.id === id)), get tour() { return tour } }
