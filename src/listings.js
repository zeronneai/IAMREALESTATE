// Sample listings for the proposal. Fictional streets and prices. Replace with IAM inventory / IDX feed.
import { t, getLang, onLang } from './i18n.js'

export const LISTINGS = [
  { id: 'L1', type: 'sale', area: 'West Side', street: '0000 Calle Ocotillo (Demo)', price: 489000, beds: 4, baths: 3, sqft: 2680, year: 2019, img: ['ext1', 'int-living', 'int-kitchen', 'int-bed'], tour: true, house: { style: 'modernWhite', pool: true, pergola: true, garage: true, palms: true }, es: 'Moderna de una planta con alberca, patio cubierto y vista a la montaña.', en: 'Modern single-story with pool, covered patio and mountain views.' },
  { id: 'L2', type: 'sale', area: 'Eastside', street: '0000 Desert Sage Ct (Demo)', price: 312500, beds: 3, baths: 2, sqft: 1840, year: 2012, img: ['ext4', 'int-living2', 'int-kitchen', 'int-bath'], tour: true, house: { style: 'modernWood', pergola: true, aspect: 1.9 }, es: 'Remodelada por el equipo IAM: pisos nuevos, cocina de cuarzo y xeriscape.', en: 'Renovated by the IAM team: new floors, quartz kitchen and xeriscape.' },
  { id: 'L3', type: 'sale', area: 'Horizon City', street: '0000 Mesa Lumbre Loop (Demo)', price: 268000, beds: 3, baths: 2, sqft: 1620, year: 2016, img: ['ext7', 'int-stair', 'int-kitchen', 'int-bed'], tour: true, house: { style: 'brick', garage: true, lawn: true, pitch: 0.5 }, es: 'Ideal para primer comprador o familia militar, cerca de escuelas. Cochera doble.', en: 'Great for first-time buyers and military families, near schools. Two-car garage.' },
  { id: 'L4', type: 'multi', area: 'Central', street: '0000 Aztec Fourplex St (Demo)', price: 645000, beds: 8, baths: 4, sqft: 3900, year: 1984, img: ['ext9', 'int-apt2', 'int-apt', 'int-bath'], tour: true, house: { style: 'darkPanel', stories: 2, multi: true, aspect: 1.5, front: 8 }, es: 'Fourplex rentado al 100% con potencial de aumento de rentas.', en: 'Fully leased fourplex with upside on rents.' },
  { id: 'L5', type: 'sale', area: 'West Side', street: '0000 Cerro Alto Dr (Demo)', price: 735000, beds: 5, baths: 4, sqft: 3650, year: 2021, img: ['ext6', 'int-living2', 'int-stair', 'int-bed'], tour: true, house: { style: 'luxWhite', stories: 2, pool: true, pergola: true, garage: true, palms: true, yard: 11.5, front: 8 }, es: 'Alberca, terraza en azotea y acabados de lujo en el Westside.', en: 'Pool, rooftop terrace and luxury finishes on the Westside.' },
  { id: 'L6', type: 'rent', area: 'Northeast', street: '0000 Agave Bend (Demo)', price: 1450, beds: 3, baths: 2, sqft: 1500, year: 2008, img: ['ext3', 'int-apt', 'int-kitchen', 'int-bath'], tour: true, house: { style: 'townhouse', stories: 2, garage: true, lawn: true, aspect: 1.25 }, es: 'Renta de dos plantas con jardín trasero, cochera y mascotas permitidas.', en: 'Two-story rental with backyard, garage, pets welcome.' },
  { id: 'L7', type: 'rent', area: 'Socorro', street: '0000 Mission Trail Way (Demo)', price: 1180, beds: 2, baths: 2, sqft: 1120, year: 2015, img: ['ext8', 'int-apt2', 'int-kitchen', 'int-bed'], tour: true, house: { style: 'cabin', lawn: true, pergola: true, aspect: 1.45 }, es: 'Casa estilo cabaña, acogedora, cerca de Mission Trail.', en: 'Cozy cabin-style rental close to the Mission Trail.' },
  { id: 'L8', type: 'sale', area: 'Socorro', street: '0000 Valle Dorado Rd (Demo)', price: 389000, beds: 4, baths: 3, sqft: 2400, year: 2018, img: ['ext5', 'int-living', 'int-kitchen', 'int-bath'], tour: true, house: { style: 'pueblo', courtyard: true, pergola: true, casita: true, rv: true, yard: 14 }, es: 'Estilo pueblo en lote grande con casita y espacio para RV.', en: 'Pueblo-style home on a large lot with casita and RV pad.' },
]

const money = n => '$' + Math.round(n).toLocaleString('en-US')
const typeLabel = ty => t(ty === 'rent' ? 'type.rent' : ty === 'multi' ? 'type.multi' : 'type.sale')

export function initListings({ onTour }) {
  const grid = document.getElementById('listingGrid')
  const form = document.getElementById('filters')
  const count = document.getElementById('listCount')
  const modal = document.getElementById('listingModal')
  const body = document.getElementById('lmBody')
  let current = null

  function filtered() {
    const f = new FormData(form)
    const type = f.get('type'), area = f.get('area'), beds = +f.get('beds'), max = +f.get('max')
    return LISTINGS.filter(l => (type === 'all' || l.type === type) && (area === 'all' || l.area === area) && l.beds >= beds && (!max || l.type === 'rent' || l.price <= max))
  }
  function priceLabel(l) { return l.type === 'rent' ? `${money(l.price)}<small>${t('homes.mo')}</small>` : money(l.price) }
  function render() {
    const list = filtered()
    count.textContent = t('homes.count', { n: list.length })
    grid.innerHTML = list.length ? list.map((l, i) => `
      <article class="lcard" style="--i:${i}">
        <button type="button" class="lcard-btn" data-id="${l.id}" aria-label="${t('homes.view')}: ${l.street}">
          <div class="lcard-img"><img src="/img/${l.img[0]}.webp" alt="" loading="lazy" width="800" height="533" />
            <span class="tag-demo mono">${t('homes.sample')}</span>
            ${l.tour ? `<span class="tag-3d"><span class="pulse"></span>${t('homes.tour3d')}</span>` : ''}
          </div>
          <div class="lcard-body">
            <div class="lcard-top"><span class="lprice">${priceLabel(l)}</span><span class="ltype">${typeLabel(l.type)}</span></div>
            <p class="lmeta mono">${l.beds} ${t('homes.bd')} · ${l.baths} ${t('homes.ba')} · ${l.sqft.toLocaleString()} ${t('tour.sqft')}</p>
            <p class="laddr">${l.street}<br/><span>${l.area}, TX</span></p>
          </div>
        </button>
      </article>`).join('') : `<p class="empty">${t('homes.none')}</p>`
  }
  function payment(price) {
    const loan = price * 0.965, r = 0.065 / 12, n = 360
    const pi = loan * r / (1 - Math.pow(1 + r, -n))
    const tax = price * 0.0225 / 12, ins = 140
    return pi + tax + ins
  }
  function open(id) {
    const l = LISTINGS.find(x => x.id === id); if (!l) return
    current = l
    body.innerHTML = `
      <div class="lm-gallery">
        <img class="lm-main" id="lmMain" src="/img/${l.img[0]}.webp" alt="" />
        <div class="lm-thumbs">${l.img.map((im, i) => `<button type="button" data-img="${im}" class="${i === 0 ? 'on' : ''}" aria-label="Photo ${i + 1}"><img src="/img/${im}.webp" alt="" loading="lazy" /></button>`).join('')}</div>
      </div>
      <div class="lm-info">
        <span class="tag-demo mono">${t('homes.sample')}</span>
        <h3 id="lmTitle" class="lm-price">${priceLabel(l)}</h3>
        <p class="laddr">${l.street}<br/><span>${l.area}, TX</span></p>
        <dl class="lm-specs">
          <div><dt>${t('offer.beds')}</dt><dd>${l.beds}</dd></div>
          <div><dt>${t('offer.baths')}</dt><dd>${l.baths}</dd></div>
          <div><dt>${t('offer.sqft')}</dt><dd>${l.sqft.toLocaleString()}</dd></div>
          <div><dt>${getLang() === 'es' ? 'Año' : 'Built'}</dt><dd>${l.year}</dd></div>
        </dl>
        <p>${getLang() === 'es' ? l.es : l.en}</p>
        ${l.type !== 'rent' ? `<div class="lm-pay"><span>${t('lm.est')}</span><strong>${money(payment(l.price))}${t('homes.mo')}</strong><small>${t('lm.estD')}</small></div>` : ''}
        <div class="lm-actions">
          <button type="button" class="btn btn-gold" id="lmTour">${t('lm.tour')} <span aria-hidden="true">→</span></button>
          <a class="btn btn-ghost-dark" href="tel:${l.type === 'rent' ? '+19154653384' : '+19152680716'}">${t('lm.sched')}</a>
        </div>
        <p class="fineprint">${t('lm.note')}</p>
      </div>`
    body.querySelectorAll('[data-img]').forEach(b => b.addEventListener('click', () => {
      body.querySelector('#lmMain').src = `/img/${b.dataset.img}.webp`
      body.querySelectorAll('[data-img]').forEach(x => x.classList.toggle('on', x === b))
    }))
    body.querySelector('#lmTour').addEventListener('click', () => { modal.close(); onTour && onTour(l) })
    if (!modal.open) modal.showModal()
  }
  grid.addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) open(b.dataset.id) })
  form.addEventListener('change', render)
  modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('[data-close]')) modal.close() })
  onLang(() => { render(); if (modal.open && current) open(current.id) })
  render()

  return {
    setFilters({ type, area, max }) {
      if (type) form.type.value = type
      if (area) form.area.value = area
      if (max !== undefined) form.max.value = String(max)
      render()
    },
  }
}
