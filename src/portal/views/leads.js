// Foreclosures and Properties share this view; mode decides the default filters and columns.
import { t } from '../i18n.js'
import * as S from '../store.js'
import { esc, money, date, table, sortRows, scorePill, statusPill, tagPill, selection, selChanged } from '../ui.js'
import { openDrawer } from '../drawer.js'
import { mountMap } from '../map.js'

const state = {
  foreclosures: { f: { sale: '', zip: '', lender: '', eq: '', vmin: '', vmax: '', years: false, absentee: false, tax: false, score: '', status: '' }, sort: { key: 'sale', dir: 1 }, view: 'table' },
  properties: { f: { tag: '', zip: '', eq: '', vmin: '', vmax: '', years: false, absentee: false, tax: false, score: '', status: '' }, sort: { key: 'score', dir: -1 }, view: 'table' },
}

export function leads(el, mode, params = {}) {
  const st = state[mode]
  if (params.sale) st.f.sale = params.sale
  if (params.tag) st.f.tag = params.tag
  const all = S.parcels().filter(p => mode === 'foreclosures' ? !!p.foreclosure : true)
  const sales = [...new Set(all.filter(p => p.foreclosure).map(p => p.foreclosure.saleDate))].sort()
  const zips = [...new Set(all.map(p => p.zip).filter(Boolean))].sort()
  const lenders = [...new Set(all.map(p => p.foreclosure?.mortgagee).filter(Boolean))].sort()
  const tags = ['tax_delinquent', 'absentee', 'high_equity', 'vacant', 'probate', 'foreclosure']

  const f = st.f
  const rows = all.filter(p => {
    if (f.sale && p.foreclosure?.saleDate !== f.sale) return false
    if (f.tag && !(p.tags || []).includes(f.tag)) return false
    if (f.zip && p.zip !== f.zip) return false
    if (f.lender && p.foreclosure?.mortgagee !== f.lender) return false
    if (f.eq !== '' && p._d.equityPct < +f.eq) return false
    if (f.vmin !== '' && p.marketValue < +f.vmin) return false
    if (f.vmax !== '' && p.marketValue > +f.vmax) return false
    if (f.years && !(p._d.yearsOwned >= 10)) return false
    if (f.absentee && !p._d.absentee) return false
    if (f.tax && !(p._d.taxDue > 0)) return false
    if (f.score !== '' && p._score < +f.score) return false
    if (f.status && p.status !== f.status) return false
    return true
  })
  const getters = { sale: p => p.foreclosure?.saleDate, address: p => p.address, owner: p => p.owners?.[0]?.name, lender: p => p.foreclosure?.mortgagee, value: p => p.marketValue, balance: p => p._d.mortgageBal, equity: p => p._d.equityPct, years: p => p._d.yearsOwned, built: p => p.yearBuilt, taxes: p => p._d.taxDue, score: p => p._score, status: p => p.status }
  const sorted = sortRows(rows, st.sort, getters)

  const cols = [
    { key: 'address', label: t('c.address'), cls: 'addr', render: p => `<b>${esc(p.address)}</b><span>${esc(p.zip)} · ${esc(p.type || '')}</span>` },
    { key: 'owner', label: t('c.owner'), render: p => `${esc(p.owners?.[0]?.name || 'n/a')}${p._d.absentee ? ' <span class="pill blue">ABS</span>' : ''}${(p.contacts || []).some(c => c.kind === 'phone') ? ' <span class="pill ok">☎</span>' : ''}` },
    ...(mode === 'foreclosures' ? [
      { key: 'sale', label: t('c.sale'), render: p => `<span class="mono">${esc(date(p.foreclosure.saleDate))}</span> <span class="dim mono" style="font-size:11px">${p._d.daysToSale}d</span>` },
      { key: 'lender', label: t('c.lender'), render: p => `<span style="max-width:180px;display:inline-block;overflow:hidden;text-overflow:ellipsis;vertical-align:bottom">${esc(p.foreclosure.mortgagee || '')}</span>` },
    ] : [{ key: 'tags', label: t('c.tags'), render: p => (p.tags || []).filter(x => x !== 'high_equity').slice(0, 3).map(tagPill).join(' ') }]),
    { key: 'value', label: t('c.value'), num: true, render: p => money(p.marketValue) },
    { key: 'balance', label: t('c.balance'), num: true, render: p => money(p._d.mortgageBal) },
    { key: 'equity', label: t('c.equity'), num: true, render: p => `${p._d.equityPct}%<span class="eq-bar"><i style="width:${Math.max(0, Math.min(100, p._d.equityPct))}%;background:${p._d.equityPct < 15 ? 'var(--bad)' : 'var(--ok)'}"></i></span>` },
    { key: 'taxes', label: t('c.taxes'), num: true, render: p => p._d.taxDue ? `<span style="color:var(--warn)">${money(p._d.taxDue)}</span>` : '<span class="dim">0</span>' },
    { key: 'years', label: t('c.years'), num: true, render: p => p._d.yearsOwned ?? 'n/a' },
    { key: 'built', label: t('c.built'), num: true, render: p => p.yearBuilt || 'n/a' },
    { key: 'score', label: t('c.score'), num: true, render: p => scorePill(p._score) },
    { key: 'status', label: t('c.status'), render: p => statusPill(p.status) },
  ]
  const tb = table({ rows: sorted, cols, sort: st.sort, onSort: k => { st.sort = st.sort.key === k ? { key: k, dir: -st.sort.dir } : { key: k, dir: ['score', 'equity', 'value', 'taxes', 'years'].includes(k) ? -1 : 1 }; leads(el, mode) }, onRow: openDrawer })

  const opt = (v, label, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`
  el.innerHTML = `
  <div class="card fade-in" style="padding:14px">
    <div class="filters">
      ${mode === 'foreclosures'
        ? `<div class="f"><label>${esc(t('f.sale'))}</label><select data-f="sale">${opt('', t('f.all'), f.sale)}${sales.map(s => opt(s, date(s), f.sale)).join('')}</select></div>
           <div class="f"><label>${esc(t('f.lender'))}</label><select data-f="lender">${opt('', t('f.all'), f.lender)}${lenders.map(s => opt(s, s, f.lender)).join('')}</select></div>`
        : `<div class="f"><label>${esc(t('f.list'))}</label><select data-f="tag">${opt('', t('f.all'), f.tag)}${tags.map(s => opt(s, t('tag.' + s), f.tag)).join('')}</select></div>`}
      <div class="f"><label>${esc(t('f.zip'))}</label><select data-f="zip">${opt('', t('f.all'), f.zip)}${zips.map(s => opt(s, s, f.zip)).join('')}</select></div>
      <div class="f"><label>${esc(t('f.equity'))}</label><input type="number" data-f="eq" value="${esc(f.eq)}" placeholder="0" min="-100" max="100" /></div>
      <div class="f"><label>${esc(t('f.value'))} ${esc(t('f.min'))}</label><input type="number" data-f="vmin" value="${esc(f.vmin)}" step="10000" /></div>
      <div class="f"><label>${esc(t('f.value'))} ${esc(t('f.max'))}</label><input type="number" data-f="vmax" value="${esc(f.vmax)}" step="10000" /></div>
      <div class="f"><label>${esc(t('f.score'))}</label><input type="number" data-f="score" value="${esc(f.score)}" min="0" max="100" /></div>
      <div class="f"><label>${esc(t('f.status'))}</label><select data-f="status">${opt('', t('f.all'), f.status)}${['new', 'contacted', 'appointment', 'offer', 'under_contract', 'dead'].map(s => opt(s, t('st.' + s), f.status)).join('')}</select></div>
      <label class="check"><input type="checkbox" data-f="years" ${f.years ? 'checked' : ''}/>${esc(t('f.years'))}</label>
      <label class="check"><input type="checkbox" data-f="absentee" ${f.absentee ? 'checked' : ''}/>${esc(t('f.absentee'))}</label>
      <label class="check"><input type="checkbox" data-f="tax" ${f.tax ? 'checked' : ''}/>${esc(t('f.tax'))}</label>
      <button class="btn ghost" data-reset>${esc(t('f.reset'))}</button>
    </div>
  </div>
  <div class="toolbar">
    <span class="count-line">${sorted.length} ${esc(t('rows'))} · equity ${money(sorted.reduce((a, p) => a + Math.max(0, p._d.equity), 0), true)}</span>
    <button class="btn sm ghost" data-selall>${esc(t('sel.all'))}</button>
    <span class="sp"></span>
    <div class="seg"><button data-v="table" class="${st.view === 'table' ? 'on' : ''}">${esc(t('view.table'))}</button><button data-v="map" class="${st.view === 'map' ? 'on' : ''}">${esc(t('view.map'))}</button></div>
  </div>
  ${st.view === 'table' ? tb.html : '<div class="map big" id="lmap"></div>'}`

  if (st.view === 'table') tb.bind(el); else mountMap(el.querySelector('#lmap'), sorted, { onOpen: openDrawer })
  el.querySelectorAll('[data-f]').forEach(inp => inp.addEventListener('change', () => { f[inp.dataset.f] = inp.type === 'checkbox' ? inp.checked : inp.value; leads(el, mode) }))
  el.querySelector('[data-reset]').onclick = () => { for (const k in f) f[k] = typeof f[k] === 'boolean' ? false : ''; leads(el, mode) }
  el.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { st.view = b.dataset.v; leads(el, mode) })
  el.querySelector('[data-selall]').onclick = () => { sorted.forEach(p => selection.add(p.id)); selChanged(); leads(el, mode) }
}
