// Flip deal analyzer: profit, cash on cash ROI, 70% rule.
import { t, onLang } from './i18n.js'

const money = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US')

export function analyze(v) {
  const price = +v.price || 0, rehab = +v.rehab || 0, arv = +v.arv || 0, months = Math.max(1, +v.months || 1)
  const down = (+v.down || 0) / 100, rate = (+v.rate || 0) / 100, points = (+v.points || 0) / 100, hold = +v.hold || 0
  const buyClosing = price * 0.02
  const loan = price * (1 - down) + rehab // lender funds rehab draws
  const interest = loan * rate / 12 * months
  const pts = loan * points
  const holding = hold * months
  const selling = arv * 0.08
  const allIn = price + rehab + buyClosing + interest + pts + holding + selling
  const profit = arv - allIn
  const cash = price * down + buyClosing + pts + interest + holding
  const roi = cash > 0 ? profit / cash : 0
  const annual = roi * 12 / months
  const mao = arv * 0.7 - rehab
  return { loan, fin: interest + pts, selling, allIn, profit, cash, roi, annual, mao, pass: price <= mao, over: price - mao }
}

export function initInvest() {
  const form = document.getElementById('anForm')
  const out = document.getElementById('anOut')
  function render() {
    const r = analyze(Object.fromEntries(new FormData(form).entries()))
    const pct = n => (n * 100).toFixed(1) + '%'
    out.innerHTML = `
      <div class="an-kpis">
        <div class="kpi ${r.profit >= 0 ? 'pos' : 'neg'}"><span>${t('an.profit')}</span><strong>${money(r.profit)}</strong></div>
        <div class="kpi"><span>${t('an.cash')}</span><strong>${money(r.cash)}</strong></div>
        <div class="kpi"><span>${t('an.roi')}</span><strong>${pct(r.roi)}</strong><small>${t('an.annual')} ${pct(r.annual)}</small></div>
      </div>
      <div class="an-rule ${r.pass ? 'ok' : 'bad'}">
        <span>${t('an.mao')}: <strong class="mono">${money(r.mao)}</strong></span>
        <span class="pill">${r.pass ? '✓ ' + t('an.pass') : t('an.fail') + ' ' + money(r.over)}</span>
      </div>
      <dl class="an-break">
        <div><dt>${t('an.loan')}</dt><dd>${money(r.loan)}</dd></div>
        <div><dt>${t('an.fin')}</dt><dd>${money(r.fin)}</dd></div>
        <div><dt>${t('an.sellc')}</dt><dd>${money(r.selling)}</dd></div>
        <div><dt>${t('an.total')}</dt><dd>${money(r.allIn)}</dd></div>
      </dl>`
  }
  form.addEventListener('input', render)
  onLang(render)
  render()
}
