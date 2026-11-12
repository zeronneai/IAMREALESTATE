import { t } from '../i18n.js'
import * as S from '../store.js'
import { esc, money, date, modal, toast, icon } from '../ui.js'

const STAT = ['acquisition', 'rehab', 'listed', 'rented', 'sold']
const statCls = { acquisition: 'blue', rehab: 'warn', listed: 'gold', rented: 'ok', sold: '' }
let filter = ''

export const invMath = v => {
  const months = v.acquiredOn ? Math.max(1, Math.round(((v.soldOn ? new Date(v.soldOn) : new Date()) - new Date(v.acquiredOn)) / (30.4 * 86400000))) : 1
  const holding = (v.holdingMonth || 0) * months
  const invested = (v.purchasePrice || 0) + (v.rehabActual || 0) + holding
  const exit = v.soldPrice || v.listPrice || v.arv || 0
  const sellCost = exit * 0.07
  const profit = exit - sellCost - invested
  return { months, holding, invested, exit, profit, roi: invested ? (profit / invested) * 100 : 0 }
}

export function inventoryView(el) {
  const all = S.inventory()
  const items = all.filter(v => !filter || v.status === filter)
  const active = all.filter(v => v.status !== 'sold')
  const tot = active.reduce((a, v) => { const m = invMath(v); a.inv += m.invested; a.arv += v.arv || 0; a.profit += m.profit; a.rent += v.rent || 0; return a }, { inv: 0, arv: 0, profit: 0, rent: 0 })

  el.innerHTML = `
  <div class="kpis fade-in" style="grid-template-columns:repeat(4,minmax(0,1fr))">
    <div class="kpi"><div class="l">${esc(t('inv.invested'))}</div><div class="v">${money(tot.inv, true)}</div><div class="s">${active.length} ${esc(t('lists.items'))}</div></div>
    <div class="kpi"><div class="l">${esc(t('inv.arv'))}</div><div class="v">${money(tot.arv, true)}</div></div>
    <div class="kpi hero"><div class="l">${esc(t('inv.profit'))}</div><div class="v">${money(tot.profit, true)}</div><div class="s">${esc(t('inv.roi'))} ${tot.inv ? Math.round((tot.profit / tot.inv) * 100) : 0}%</div></div>
    <div class="kpi"><div class="l">${esc(t('inv.rent'))}</div><div class="v">${money(tot.rent)}</div><div class="s">${all.filter(v => v.status === 'rented').length} ${esc(t('is.rented').toLowerCase())}</div></div>
  </div>
  <div class="toolbar">
    <div class="chips"><button class="chip ${!filter ? 'on' : ''}" data-s="">${esc(t('f.all'))} · ${all.length}</button>${STAT.map(s => `<button class="chip ${filter === s ? 'on' : ''}" data-s="${s}">${esc(t('is.' + s))} · ${all.filter(v => v.status === s).length}</button>`).join('')}</div>
    <span class="sp"></span><button class="btn gold" data-add>${icon('plus')}${esc(t('inv.add'))}</button>
  </div>
  <div class="inv-grid">${items.map(v => {
    const m = invMath(v); const over = (v.rehabActual || 0) > (v.rehabBudget || 0)
    return `<article class="inv fade-in" data-id="${esc(v.id)}">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:start"><h4>${esc(v.address)}</h4><span class="pill ${statCls[v.status]}">${esc(t('is.' + v.status))}</span></div>
      <div class="row"><span>${esc(t('inv.acquired'))}</span><b>${esc(date(v.acquiredOn))} · ${m.months} mo</b></div>
      <div class="row"><span>${esc(t('inv.purchase'))}</span><b>${money(v.purchasePrice)}</b></div>
      <div><div class="row"><span>${esc(t('inv.rehab'))}</span><b>${money(v.rehabActual)} / ${money(v.rehabBudget)}</b></div><div class="prog ${over ? 'over' : ''}" style="margin-top:6px"><i style="width:${Math.min(100, ((v.rehabActual || 0) / Math.max(1, v.rehabBudget || 1)) * 100)}%"></i></div></div>
      <div class="row"><span>${esc(t('inv.arv'))}${v.soldPrice ? ' / sold' : ''}</span><b>${money(v.soldPrice || v.arv)}</b></div>
      ${v.status === 'rented' ? `<div class="row"><span>${esc(t('inv.tenant'))}</span><b>${esc(v.tenant || 'n/a')} · ${money(v.rent)}/mo</b></div>` : ''}
      ${v.mortgage ? `<div class="row"><span>${esc(t('m.lender'))}</span><b>${esc(v.mortgage.lender)} ··${esc(v.mortgage.last4 || '')}</b></div>` : ''}
      <div class="row" style="border-top:1px solid var(--line);padding-top:10px"><span>${esc(t('inv.profit'))} · ${esc(t('inv.roi'))}</span><b style="color:${m.profit >= 0 ? 'var(--ok)' : 'var(--bad)'}">${money(m.profit)} · ${Math.round(m.roi)}%</b></div>
    </article>`
  }).join('')}</div>`

  el.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { filter = b.dataset.s; inventoryView(el) })
  el.querySelector('[data-add]').onclick = () => editInventory({ status: 'acquisition', acquiredOn: new Date().toISOString().slice(0, 10), docs: [], statements: [] })
  el.querySelectorAll('.inv').forEach(c => c.onclick = () => editInventory(S.inventory().find(v => v.id === c.dataset.id)))
}

function editInventory(v) {
  const fld = (k, label, type = 'number', extra = '') => `<div class="f"><label>${esc(label)}</label><input name="${k}" type="${type}" value="${esc(v[k] ?? '')}" ${extra}/></div>`
  modal(`<h3>${esc(v.address || t('inv.add'))}</h3>
  <form class="form-grid" data-f>
    <div class="f full"><label>${esc(t('c.address'))}</label><input name="address" value="${esc(v.address || '')}" required /></div>
    ${fld('zip', 'ZIP', 'text')}
    <div class="f"><label>${esc(t('inv.status'))}</label><select name="status">${STAT.map(s => `<option value="${s}" ${v.status === s ? 'selected' : ''}>${esc(t('is.' + s))}</option>`).join('')}</select></div>
    ${fld('acquiredOn', t('inv.acquired'), 'date')}${fld('purchasePrice', t('inv.purchase'), 'number', 'step="1000"')}
    ${fld('rehabBudget', 'Rehab budget', 'number', 'step="500"')}${fld('rehabActual', 'Rehab actual', 'number', 'step="500"')}
    ${fld('arv', 'ARV', 'number', 'step="1000"')}${fld('listPrice', 'List price', 'number', 'step="1000"')}
    ${fld('soldPrice', 'Sold price', 'number', 'step="1000"')}${fld('soldOn', 'Sold on', 'date')}
    ${fld('tenant', t('inv.tenant'), 'text')}${fld('rent', t('inv.rent'), 'number', 'step="25"')}
    ${fld('holdingMonth', 'Holding cost / month', 'number', 'step="25"')}
    <div class="f full"><label>${esc(t('d.notes'))}</label><input name="notes" value="${esc(v.notes || '')}" /></div>
    <div class="full" style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn ghost" data-close>${esc(t('d.close'))}</button><button class="btn gold">${esc(t('s.save'))}</button></div>
  </form>`, (box, close) => {
    box.querySelector('[data-f]').onsubmit = async e => {
      e.preventDefault()
      const fd = Object.fromEntries(new FormData(e.target))
      for (const k of ['purchasePrice', 'rehabBudget', 'rehabActual', 'arv', 'listPrice', 'soldPrice', 'rent', 'holdingMonth']) fd[k] = fd[k] === '' ? null : +fd[k]
      await S.saveInventory({ ...v, ...fd }); toast(t('toast.saved')); close()
    }
  })
}
