// Multi-step cash offer estimator with side by side net sheet.
import { OFFER, PHONES } from './config.js'
import { t, onLang } from './i18n.js'
import { submitLead, toast } from './leads.js'

const money = n => '$' + Math.max(0, Math.round(n / 100) * 100).toLocaleString('en-US')

export function estimate({ sqft, condition }) {
  const s = Math.max(300, +sqft || 1500)
  const c = OFFER.conditions[condition] || OFFER.conditions.light
  const arv = Math.max(OFFER.minSqftPrice, OFFER.arvPerSqft) * s
  const repairs = c.repairPerSqft * s
  const cash = arv * OFFER.investorPctOfArv - repairs
  const listPrice = arv * c.listFactor
  const commission = listPrice * OFFER.commissionPct
  const closing = listPrice * OFFER.sellerClosingPct
  const months = (OFFER.listDays[0] + OFFER.listDays[1]) / 2 / 30
  const holding = listPrice * OFFER.monthlyHoldingPct * months
  const listNet = listPrice - commission - closing - c.sellerPrep - holding
  const sp = OFFER.rangeSpread
  return { arv, cash, cashLo: cash * (1 - sp), cashHi: cash * (1 + sp), listPrice, commission, closing, prep: c.sellerPrep, holding, listNet, listLo: listNet * (1 - sp), listHi: listNet * (1 + sp) }
}

export function initCashOffer() {
  const form = document.getElementById('offerForm')
  const steps = [...form.querySelectorAll('.step')]
  const dots = [...document.querySelectorAll('#offer .steps span')]
  const back = document.getElementById('offerBack')
  const next = document.getElementById('offerNext')
  const sheet = document.getElementById('netsheet')
  let step = 0, last = null

  function show(i) {
    step = i
    steps.forEach((s, k) => { s.hidden = k !== i })
    dots.forEach((d, k) => d.classList.toggle('on', k <= i))
    back.hidden = i === 0
    next.querySelector('span').textContent = t(i === steps.length - 1 ? 'offer.see' : 'offer.next')
    const first = steps[i].querySelector('input, select'); if (first && i > 0) first.focus({ preventScroll: true })
  }
  back.addEventListener('click', () => show(Math.max(0, step - 1)))
  form.addEventListener('submit', async e => {
    e.preventDefault()
    const data = Object.fromEntries(new FormData(form).entries())
    if (step === 0 && !data.address.trim()) { toast(t('offer.addrReq')); form.address.focus(); return }
    if (step < steps.length - 1) { show(step + 1); return }
    if (!data.name.trim() || !data.phone.trim()) { toast(t('offer.contactReq')); return }
    last = { data, est: estimate(data) }
    renderSheet()
    const res = await submitLead('cash_offer', { ...data, estCashLow: Math.round(last.est.cashLo), estCashHigh: Math.round(last.est.cashHi), estListNetLow: Math.round(last.est.listLo), estListNetHigh: Math.round(last.est.listHi) })
    if (res.demo) toast(t('form.demo'))
  })

  function renderSheet() {
    if (!last) return
    const { data, est } = last
    form.hidden = true; document.querySelector('#offer .steps').hidden = true
    sheet.hidden = false
    sheet.innerHTML = `
      <div class="ns-head">
        <p class="mono ns-kicker">${t('ns.title')}</p>
        <h3>${data.address}</h3>
        <p class="ns-sub mono">${data.beds} ${t('homes.bd')} · ${data.baths} ${t('homes.ba')} · ${(+data.sqft).toLocaleString()} ${t('tour.sqft')} · ${t('cond.' + data.condition)}</p>
      </div>
      <div class="ns-cols">
        <div class="ns-col cash">
          <span class="ns-flag">${t('ns.best')}</span>
          <h4>${t('ns.cash')}</h4>
          <p class="ns-range">${money(est.cashLo)} <span>${t('ns.to')}</span> ${money(est.cashHi)}</p>
          <dl>
            <div><dt>${t('ns.commission')}</dt><dd>$0</dd></div>
            <div><dt>${t('ns.closing')}</dt><dd>${t('ns.covered')}</dd></div>
            <div><dt>${t('ns.repairs')}</dt><dd>${t('ns.none')}</dd></div>
            <div><dt>${t('ns.days')}</dt><dd>${OFFER.cashDays[0]} ${t('ns.to')} ${OFFER.cashDays[1]}</dd></div>
            <div><dt>${t('ns.certainty')}</dt><dd>${t('ns.high')}</dd></div>
          </dl>
          <p class="ns-net"><span>${t('ns.net')}</span><strong>${money(est.cashLo)} ${t('ns.to')} ${money(est.cashHi)}</strong></p>
        </div>
        <div class="ns-col list">
          <span class="ns-flag alt">${t('ns.best2')}</span>
          <h4>${t('ns.list')}</h4>
          <p class="ns-range">${money(est.listPrice * 0.97)} <span>${t('ns.to')}</span> ${money(est.listPrice * 1.03)}</p>
          <dl>
            <div><dt>${t('ns.commission')} (${Math.round(OFFER.commissionPct * 100)}%)</dt><dd>-${money(est.commission)}</dd></div>
            <div><dt>${t('ns.closing')}</dt><dd>-${money(est.closing)}</dd></div>
            <div><dt>${t('ns.repairs')}</dt><dd>-${money(est.prep)}</dd></div>
            <div><dt>${t('ns.holding')}</dt><dd>-${money(est.holding)}</dd></div>
            <div><dt>${t('ns.days')}</dt><dd>${OFFER.listDays[0]} ${t('ns.to')} ${OFFER.listDays[1]}</dd></div>
            <div><dt>${t('ns.certainty')}</dt><dd>${t('ns.med')}</dd></div>
          </dl>
          <p class="ns-net"><span>${t('ns.net')}</span><strong>${money(est.listLo)} ${t('ns.to')} ${money(est.listHi)}</strong></p>
        </div>
      </div>
      <p class="ns-disc">${t('ns.disc')}</p>
      <p class="ns-sent">${t('ns.sent')}</p>
      <div class="ns-actions">
        <a class="btn btn-gold" href="tel:${PHONES.sell.tel}">${t('ns.call')} · <span class="mono">${PHONES.sell.label}</span></a>
        <button type="button" class="btn btn-ghost" id="nsAgain">${t('ns.again')}</button>
      </div>`
    sheet.querySelector('#nsAgain').addEventListener('click', () => {
      last = null; sheet.hidden = true; form.hidden = false; document.querySelector('#offer .steps').hidden = false; form.reset(); show(0)
    })
  }
  onLang(() => { show(step); renderSheet() })
  show(0)
  return {
    prefill(addr) { form.address.value = addr || ''; show(addr ? 1 : 0) },
  }
}
