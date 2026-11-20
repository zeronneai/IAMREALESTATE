// Portfolio: every home with its rent and bills for the month (paid, due, late). Finance: the to-do list of payments.
import { t, getLang } from '../i18n.js'
import * as S from '../store.js'
import { esc, money, date, toast, modal, icon } from '../ui.js'
import { parseGhlOpportunities } from '../parse/ghl.js'
import { parseRentRedi, matchRent } from '../parse/rentredi.js'
const SITS = ['normal', 'payment_plan', 'eviction', 'foreclosure', 'vacant', 'disconnected']

const KINDS = ['rent', 'mortgage', 'wrap', 'loan', 'tax', 'insurance', 'hoa', 'utility', 'repair', 'other']
const METHODS = ['ACH', 'Zelle', 'Check', 'Card', 'Cash', 'RentRedi', 'Autopay', 'Wire']
let month = S.monthStart()
const shiftMonth = (p, k) => { const d = new Date(+p.slice(0, 4), +p.slice(5, 7) - 1 + k, 1); return S.monthStart(d) }
const monthName = p => new Date(+p.slice(0, 4), +p.slice(5, 7) - 1, 1).toLocaleDateString(getLang() === 'es' ? 'es-MX' : 'en-US', { month: 'long', year: 'numeric' })
const CLS = { paid: 'ok', partial: 'gold', waived: '', late: 'bad', due: 'gold', upcoming: '', autopay: 'blue' }
export const pill = it => `<span class="pill ${CLS[it.status] || ''}">${esc(t((it.ob.dir === 'in' && it.status === 'paid') ? 'pf.st_received' : 'pf.st_' + it.status))}</span>`
const what = it => `${t('pf.k_' + it.ob.kind)}${it.ob.lien > 1 ? ' (' + t('pf.lien2') + ')' : ''}${it.ob.unit ? ' ' + it.ob.unit : ''}${it.ob.party ? ' · ' + it.ob.party : ''}${it.ob.situation && it.ob.situation !== 'normal' ? ' · ' + t('pf.s_' + it.ob.situation) : ''}`
const sum = (l, f) => l.reduce((a, x) => a + (f(x) || 0), 0)

// ---------- Portfolio ----------
export function portfolioView(el) {
  const items = S.periodItems(month)
  const inv = S.inventory().filter(v => v.status !== 'sold')
  const rentIt = items.filter(i => i.ob.dir === 'in'), outIt = items.filter(i => i.ob.dir === 'out')
  const got = sum(rentIt, i => i.pay?.paid), exp = sum(rentIt, i => i.amount)
  const paidOut = sum(outIt, i => i.pay?.paid), owed = sum(outIt, i => i.amount)
  const late = items.filter(i => i.status === 'late')
  const mort = outIt.filter(i => i.ob.kind === 'mortgage')
  const cell = list => list.length ? list.map(i => `<button class="pf-chip" data-it="${esc(i.ob.id)}" title="${esc(what(i))} · ${esc(date(i.due))}">${pill(i)}<small>${money(i.amount)}</small></button>`).join('') : '<span class="dim">n/a</span>'

  el.innerHTML = `
  <div class="pf-month fade-in"><button class="btn sm ghost" data-m="-1">‹</button><b>${esc(monthName(month))}</b><button class="btn sm ghost" data-m="1">›</button>${month !== S.monthStart() ? `<button class="btn sm ghost" data-m="0">${esc(t('pf.this_month'))}</button>` : ''}<span class="sp"></span><button class="btn sm ghost" data-ghl>${icon('upload')}${esc(t('pf.ghl'))}</button><a class="btn sm" href="#/finance">${esc(t('nav.finance'))} →</a></div>
  <div class="pf-kpis fade-in">
    <div class="pf-kpi"><small>${esc(t('pf.rent_collected'))}</small><b>${money(got)}</b><span class="muted">${esc(t('pf.of'))} ${money(exp)} · ${rentIt.filter(i => i.status === 'late').length} ${esc(t('pf.late'))}</span><div class="pf-bar"><i style="width:${exp ? Math.min(100, got / exp * 100) : 0}%"></i></div></div>
    <div class="pf-kpi"><small>${esc(t('pf.mortgages'))}</small><b>${mort.filter(i => ['paid', 'autopay'].includes(i.status)).length} / ${mort.length}</b><span class="muted">${esc(t('pf.paid_label'))} · ${mort.filter(i => i.status === 'late').length} ${esc(t('pf.late'))}</span><div class="pf-bar"><i style="width:${mort.length ? mort.filter(i => ['paid', 'autopay'].includes(i.status)).length / mort.length * 100 : 0}%"></i></div></div>
    <div class="pf-kpi"><small>${esc(t('pf.bills_paid'))}</small><b>${money(paidOut)}</b><span class="muted">${esc(t('pf.of'))} ${money(owed)}</span><div class="pf-bar"><i style="width:${owed ? Math.min(100, paidOut / owed * 100) : 0}%"></i></div></div>
    <div class="pf-kpi"><small>${esc(t('pf.net'))}</small><b class="${got - paidOut < 0 ? 'neg' : ''}">${money(got - paidOut)}</b><span class="muted">${esc(t('pf.net_hint'))} ${money(exp - owed)}</span></div>
  </div>
  ${late.length ? `<div class="alert bad fade-in pf-late"><b>${esc(t('pf.late_items'))} (${late.length}):</b> ${late.slice(0, 4).map(i => `<button class="linkish" data-it="${esc(i.ob.id)}">${esc(i.inv?.address || i.ob.party)} · ${esc(t('pf.k_' + i.ob.kind))}</button>`).join(' · ')}</div>` : ''}
  <div class="card fade-in" style="padding:0">
    <div class="tbl-wrap"><table class="seq-tbl pf-tbl"><thead><tr><th>${esc(t('c.address'))}</th><th>${esc(t('pf.tenant'))}</th><th>${esc(t('pf.income'))}</th><th>${esc(t('pf.k_mortgage'))}</th><th>${esc(t('pf.other'))}</th><th class="num">${esc(t('pf.month_net'))}</th><th></th></tr></thead><tbody>
    ${inv.map(v => {
      const mine = items.filter(i => i.ob.invId === v.id), r = mine.filter(i => i.ob.dir === 'in'), m = mine.filter(i => i.ob.kind === 'mortgage'), o = mine.filter(i => i.ob.dir === 'out' && i.ob.kind !== 'mortgage')
      const has = S.obligations().some(x => x.invId === v.id)
      const net = sum(r, i => i.pay?.paid) - sum(mine.filter(i => i.ob.dir === 'out'), i => i.pay?.paid)
      return `<tr data-v="${esc(v.id)}"><td><b style="display:block">${esc(v.address)}</b><small class="dim">${esc(t('is.' + v.status))}</small></td>
        <td>${esc(r[0]?.ob.party || v.tenant || '') || '<span class="dim">n/a</span>'}</td><td>${cell(r)}</td><td>${cell(m)}</td><td>${cell(o)}</td>
        <td class="num ${net < 0 ? 'neg' : ''}">${has ? money(net) : ''}</td>
        <td>${has ? `<button class="btn sm ghost" data-ledger="${esc(v.id)}">${esc(t('pf.ledger'))}</button>` : `<button class="btn sm gold" data-setup="${esc(v.id)}">${icon('plus')}${esc(t('pf.setup'))}</button>`}</td></tr>` }).join('') || `<tr><td colspan="7" class="muted" style="padding:20px">${esc(t('pf.no_homes'))}</td></tr>`}
    </tbody></table></div>
  </div>`

  el.querySelector('[data-ghl]').onclick = () => ghlModal(() => portfolioView(el))
  el.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { month = b.dataset.m === '0' ? S.monthStart() : shiftMonth(month, +b.dataset.m); portfolioView(el) })
  el.querySelectorAll('[data-it]').forEach(b => b.onclick = e => { e.stopPropagation(); const it = items.find(i => i.ob.id === b.dataset.it); if (it) payModal(it, () => portfolioView(el)) })
  el.querySelectorAll('[data-ledger]').forEach(b => b.onclick = e => { e.stopPropagation(); ledger(S.inventory().find(v => v.id === b.dataset.ledger), () => portfolioView(el)) })
  el.querySelectorAll('[data-setup]').forEach(b => b.onclick = e => { e.stopPropagation(); setup(S.inventory().find(v => v.id === b.dataset.setup), () => portfolioView(el)) })
  el.querySelectorAll('tr[data-v]').forEach(r => r.onclick = () => { const v = S.inventory().find(x => x.id === r.dataset.v); S.obligations().some(x => x.invId === v.id) ? ledger(v, () => portfolioView(el)) : setup(v, () => portfolioView(el)) })
}

// A home's 12 month history and its recurring items.
function ledger(v, done) {
  const months = Array.from({ length: 12 }, (_, k) => shiftMonth(S.monthStart(), k - 9))
  const obs = S.obligations().filter(o => o.invId === v.id)
  modal(`<h3>${esc(v.address)}</h3><p class="muted" style="margin:0">${esc(t('pf.ledger_lead'))}</p>
    <div class="tbl-wrap"><table class="pf-grid"><thead><tr><th></th>${months.map(p => `<th>${esc(new Date(+p.slice(0, 4), +p.slice(5, 7) - 1, 1).toLocaleDateString(getLang() === 'es' ? 'es-MX' : 'en-US', { month: 'short' }))}</th>`).join('')}</tr></thead><tbody>
    ${obs.map(o => `<tr><td><b>${esc(t('pf.k_' + o.kind))}</b><small class="dim">${esc(o.party)} · ${money(o.amount)}${o.autopay ? ' · autopay' : ''}</small><button class="linkish" data-edit="${esc(o.id)}">${esc(t('seq.edit'))}</button></td>${months.map(p => { const it = S.periodItems(p).find(i => i.ob.id === o.id); return `<td>${it ? `<button class="pf-dot ${CLS[it.status] || ''}" data-p="${p}" data-o="${esc(o.id)}" title="${esc(t('pf.st_' + it.status))}"></button>` : ''}</td>` }).join('')}</tr>`).join('')}
    </tbody></table></div>
    <div class="pf-legend">${['paid', 'due', 'late', 'upcoming', 'autopay'].map(s => `<span><i class="pf-dot ${CLS[s]}"></i>${esc(t('pf.st_' + s))}</span>`).join('')}</div>
    <div style="display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap"><button class="btn" data-add>${icon('plus')}${esc(t('pf.add_item'))}</button><button class="btn gold" data-close>${esc(t('va.done'))}</button></div>`, (box, close) => {
    box.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { const it = S.periodItems(b.dataset.p).find(i => i.ob.id === b.dataset.o); close(); payModal(it, done) })
    box.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { close(); oblModal(S.obligations().find(o => o.id === b.dataset.edit), v.id, done) })
    box.querySelector('[data-add]').onclick = () => { close(); oblModal(null, v.id, done) }
  }, { wide: true })
}

// First time: confirm the suggested rent and mortgage (from Inventory), or add items one by one.
function setup(v, done) {
  const sug = S.suggestedObligations(v)
  if (!sug.length) return oblModal(null, v.id, done)
  modal(`<h3>${esc(t('pf.setup_title'))}</h3><p class="muted" style="margin:0">${esc(v.address)} · ${esc(t('pf.setup_lead'))}</p>
    <div style="display:grid;gap:8px">${sug.map((s, i) => `<label class="chk pf-sug"><input type="checkbox" data-s="${i}" checked> <b>${esc(t('pf.k_' + s.kind))}</b> · ${esc(s.party || '')} · ${money(s.amount)} · ${esc(t('pf.day'))} ${s.dueDay}</label>`).join('')}</div>
    <div style="display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap"><button class="btn ghost" data-more>${icon('plus')}${esc(t('pf.add_item'))}</button><span style="display:flex;gap:8px"><button class="btn ghost" data-close>${esc(t('cancel'))}</button><button class="btn gold" data-go>${esc(t('org.save'))}</button></span></div>`, (box, close) => {
    box.querySelector('[data-more]').onclick = () => { close(); oblModal(null, v.id, done) }
    box.querySelector('[data-go]').onclick = async () => {
      try { for (const c of box.querySelectorAll('[data-s]:checked')) await S.saveObligation(sug[+c.dataset.s]); close(); toast(t('org.saved')); done() } catch (err) { toast(err.message) }
    }
  })
}

// Create or edit a recurring item or a one time bill.
export function oblModal(ob, invId, done, preset = null) {
  const o = ob ? { ...ob } : { invId: invId || null, kind: invId ? 'mortgage' : 'other', party: '', amount: '', freq: invId ? 'monthly' : 'once', dueDay: 1, dueDate: '', grace: 5, autopay: false, account: '', payUrl: '', notes: '', lien: 1, unit: '', situation: 'normal', ...(preset || {}) }
  const homes = S.inventory().filter(v => v.status !== 'sold')
  modal(`<h3>${esc(ob ? t('pf.edit_item') : t('pf.add_item'))}</h3>
    <form class="form-grid" data-ob>
      <div class="f"><label>${esc(t('pf.type'))}</label><select name="kind">${KINDS.map(k => `<option value="${k}" ${o.kind === k ? 'selected' : ''}>${esc(t('pf.k_' + k))}</option>`).join('')}</select></div>
      <div class="f"><label>${esc(t('pf.home'))}</label><select name="invId"><option value="">${esc(t('pf.company_bill'))}</option>${homes.map(v => `<option value="${esc(v.id)}" ${o.invId === v.id ? 'selected' : ''}>${esc(v.address)}</option>`).join('')}</select></div>
      <div class="f"><label>${esc(t('pf.party'))}</label><input name="party" value="${esc(o.party)}" placeholder="${esc(t('pf.party_ph'))}"></div>
      <div class="f"><label>${esc(t('pf.amount'))}</label><input name="amount" type="number" step="0.01" value="${esc(o.amount)}" required></div>
      <div class="f"><label>${esc(t('pf.freq'))}</label><select name="freq">${['monthly', 'quarterly', 'yearly', 'once'].map(f => `<option value="${f}" ${o.freq === f ? 'selected' : ''}>${esc(t('pf.f_' + f))}</option>`).join('')}</select></div>
      <div class="f" data-dd><label>${esc(t('pf.due_day'))}</label><input name="dueDay" type="number" min="1" max="31" value="${esc(o.dueDay || 1)}"></div>
      <div class="f" data-dt><label>${esc(t('pf.due_date'))}</label><input name="dueDate" type="date" value="${esc(o.dueDate || '')}"></div>
      <div class="f"><label>${esc(t('pf.grace'))}</label><input name="grace" type="number" min="0" max="60" value="${esc(o.grace ?? 5)}"></div>
      <div class="f"><label>${esc(t('pf.account'))}</label><input name="account" value="${esc(o.account)}" placeholder="••1234"></div>
      <div class="f"><label>${esc(t('pf.pay_url'))}</label><input name="payUrl" value="${esc(o.payUrl)}" placeholder="https://"></div>
      <div class="f"><label>${esc(t('pf.unit'))}</label><input name="unit" value="${esc(o.unit || '')}" placeholder="#3"></div>
      <div class="f"><label>${esc(t('pf.lien'))}</label><select name="lien"><option value="1" ${+o.lien !== 2 ? 'selected' : ''}>${esc(t('pf.lien1'))}</option><option value="2" ${+o.lien === 2 ? 'selected' : ''}>${esc(t('pf.lien2'))}</option></select></div>
      <div class="f full"><label>${esc(t('pf.situation'))}</label><select name="situation">${SITS.map(x => `<option value="${x}" ${(o.situation || 'normal') === x ? 'selected' : ''}>${esc(t('pf.s_' + x))}</option>`).join('')}</select></div>
      <label class="chk full"><input type="checkbox" name="autopay" ${o.autopay ? 'checked' : ''}> ${esc(t('pf.autopay'))}</label>
      <div class="f full"><label>${esc(t('d.notes'))}</label><input name="notes" value="${esc(o.notes)}"></div>
      <div class="full" style="display:flex;gap:8px;justify-content:space-between">${ob ? `<button type="button" class="btn ghost danger" data-del>${esc(t('org.delete'))}</button>` : '<span></span>'}<span style="display:flex;gap:8px"><button type="button" class="btn ghost" data-close>${esc(t('cancel'))}</button><button class="btn gold">${esc(t('org.save'))}</button></span></div>
    </form>`, (box, close) => {
    const f = box.querySelector('[data-ob]')
    const sync = () => { const fr = f.freq.value; box.querySelector('[data-dd]').hidden = fr !== 'monthly'; box.querySelector('[data-dt]').hidden = fr === 'monthly' }
    f.freq.onchange = sync; sync()
    f.kind.onchange = () => { if (S.IN_KINDS.includes(f.kind.value) && f.freq.value === 'once') f.freq.value = 'monthly'; sync() }
    box.querySelector('[data-del]')?.addEventListener('click', async () => { await S.deleteObligation(ob.id); close(); toast(t('org.deleted')); done() })
    f.onsubmit = async e => {
      e.preventDefault()
      const v = Object.fromEntries(new FormData(f))
      if (v.freq !== 'monthly' && !v.dueDate) return toast(t('pf.need_date'))
      try { await S.saveObligation({ ...o, ...v, invId: v.invId || null, dir: S.dirOf(v.kind), autopay: !!v.autopay }); close(); toast(t('org.saved')); done() } catch (err) { toast(err.message) }
    }
  })
}

// Record a payment (or a rent received). Paid ones can be edited or undone.
export function payModal(it, done) {
  const p = it.pay || {}, inbound = it.ob.dir === 'in'
  modal(`<h3>${esc(inbound ? t('pf.mark_received') : t('pf.mark_paid'))}</h3>
    <p class="muted" style="margin:0">${esc(what(it))}${it.inv ? ' · ' + esc(it.inv.address) : ''} · ${esc(t('pf.due'))} ${esc(date(it.due))} ${pill(it)}</p>
    ${it.ob.payUrl && !inbound ? `<a class="btn sm" href="${esc(it.ob.payUrl)}" target="_blank" rel="noopener">${esc(t('pf.open_pay'))} ↗</a>` : ''}
    <form class="form-grid" data-pay>
      <div class="f"><label>${esc(inbound ? t('pf.amount_received') : t('pf.amount_paid'))}</label><input name="paid" type="number" step="0.01" value="${esc(p.paid ?? it.amount)}" required></div>
      <div class="f"><label>${esc(t('pf.paid_on'))}</label><input name="paidOn" type="date" value="${esc(p.paidOn || new Date().toISOString().slice(0, 10))}"></div>
      <div class="f"><label>${esc(t('pf.method'))}</label><select name="method">${METHODS.map(m => `<option ${((p.method || (it.ob.autopay ? 'Autopay' : inbound ? 'RentRedi' : 'ACH')) === m) ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
      <div class="f"><label>${esc(t('pf.reference'))}</label><input name="reference" value="${esc(p.reference || '')}" placeholder="${esc(t('pf.reference_ph'))}"></div>
      <div class="f"><label>${esc(t('pf.late_fee'))}</label><input name="lateFee" type="number" step="0.01" value="${esc(p.lateFee || '')}"></div>
      <div class="f"><label>${esc(t('d.notes'))}</label><input name="notes" value="${esc(p.notes || '')}"></div>
      <div class="full" style="display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap">${it.pay ? `<button type="button" class="btn ghost danger" data-undo>${esc(t('pf.undo'))}</button>` : `<button type="button" class="btn ghost" data-waive>${esc(t('pf.waive'))}</button>`}
        <span style="display:flex;gap:8px"><button type="button" class="btn ghost" data-close>${esc(t('cancel'))}</button><button class="btn gold">${esc(t('org.save'))}</button></span></div>
    </form>`, (box, close) => {
    const f = box.querySelector('[data-pay]')
    box.querySelector('[data-undo]')?.addEventListener('click', async () => { await S.undoPayment(it); close(); done() })
    box.querySelector('[data-waive]')?.addEventListener('click', async () => { await S.recordPayment(it, { paid: 0, status: 'waived', paidOn: new Date().toISOString().slice(0, 10), notes: f.notes.value }); close(); done() })
    f.onsubmit = async e => { e.preventDefault(); try { await S.recordPayment(it, Object.fromEntries(new FormData(f))); close(); toast(inbound ? t('pf.saved_in') : t('pf.saved_out')); done() } catch (err) { toast(err.message) } }
  })
}

// ---------- Finance: what to pay, what to collect ----------
let finTab = 'out'
export function financeView(el) {
  const cur = S.monthStart(), prev = shiftMonth(cur, -1), next = shiftMonth(cur, 1)
  const all = [...S.periodItems(prev), ...S.periodItems(cur), ...S.periodItems(next)].filter(i => i.ob.dir === finTab)
  const td = new Date().toISOString().slice(0, 10), wk = new Date(Date.now() + 7 * 86400e3).toISOString().slice(0, 10), mo = new Date(Date.now() + 31 * 86400e3).toISOString().slice(0, 10)
  const open = all.filter(i => !i.pay && i.status !== 'autopay')
  const groups = [
    ['late', open.filter(i => i.status === 'late')],
    ['week', open.filter(i => i.status !== 'late' && i.due <= wk)],
    ['soon', open.filter(i => i.due > wk && i.due <= mo)],
    ['auto', all.filter(i => i.status === 'autopay' && i.due >= shiftMonth(cur, 0))],
    ['done', all.filter(i => i.pay && i.pay.paidOn && i.pay.paidOn >= new Date(Date.now() - 31 * 86400e3).toISOString().slice(0, 10)).sort((a, b) => b.pay.paidOn.localeCompare(a.pay.paidOn))],
  ]
  const row = i => `<div class="fin-row ${i.status}" data-k="${esc(i.ob.id)}|${i.period}">
      <div class="fin-date"><b>${esc(new Date(i.due + 'T12:00:00').toLocaleDateString(getLang() === 'es' ? 'es-MX' : 'en-US', { month: 'short', day: 'numeric' }))}</b>${pill(i)}</div>
      <div class="fin-what"><b>${esc(what(i))}</b><small>${esc(i.inv?.address || t('pf.company_bill'))}${i.ob.account ? ' · ' + esc(i.ob.account) : ''}${i.pay?.reference ? ' · #' + esc(i.pay.reference) : ''}${i.pay?.paidOn ? ' · ' + esc(t('pf.paid_on')) + ' ' + esc(date(i.pay.paidOn)) : ''}</small></div>
      <b class="fin-amt">${money(i.pay?.paid || i.amount)}</b>
      ${i.pay ? `<button class="btn sm ghost" data-k2>${esc(t('seq.edit'))}</button>` : `<button class="btn sm gold" data-k2>${esc(finTab === 'in' ? t('pf.mark_received') : t('pf.mark_paid'))}</button>`}
    </div>`
  el.innerHTML = `
  <div class="pf-month fade-in"><div class="seg-mini"><button data-tab="out" class="${finTab === 'out' ? 'on' : ''}">${esc(t('fin.to_pay'))}</button><button data-tab="in" class="${finTab === 'in' ? 'on' : ''}">${esc(t('fin.to_collect'))}</button></div>
    <span class="sp"></span>${finTab === 'in' ? `<button class="btn sm ghost" data-rr>${icon('upload')}${esc(t('rr.import'))}</button>` : ''}<button class="btn sm gold" data-bill>${icon('plus')}${esc(finTab === 'in' ? t('pf.add_item') : t('fin.add_bill'))}</button></div>
  <div class="pf-kpis fade-in">
    <div class="pf-kpi"><small>${esc(t('fin.g_late'))}</small><b class="${groups[0][1].length ? 'neg' : ''}">${money(sum(groups[0][1], i => i.amount))}</b><span class="muted">${groups[0][1].length} ${esc(t('fin.items'))}</span></div>
    <div class="pf-kpi"><small>${esc(t('fin.g_week'))}</small><b>${money(sum(groups[1][1], i => i.amount))}</b><span class="muted">${groups[1][1].length} ${esc(t('fin.items'))}</span></div>
    <div class="pf-kpi"><small>${esc(t('fin.g_soon'))}</small><b>${money(sum(groups[2][1], i => i.amount))}</b><span class="muted">${groups[2][1].length} ${esc(t('fin.items'))}</span></div>
    <div class="pf-kpi"><small>${esc(finTab === 'in' ? t('fin.g_done_in') : t('fin.g_done'))}</small><b>${money(sum(groups[4][1], i => i.pay.paid))}</b><span class="muted">${groups[4][1].length} ${esc(t('fin.items'))}</span></div>
  </div>
  ${groups.map(([g, l]) => l.length ? `<div class="card fade-in fin-group"><h3>${esc(t(g === 'done' && finTab === 'in' ? 'fin.g_done_in' : 'fin.g_' + g))} <span class="muted" style="font-weight:500">· ${l.length}</span></h3>${l.map(row).join('')}</div>` : '').join('') || `<div class="card"><p class="muted">${esc(t('fin.empty'))}</p></div>`}`
  el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { finTab = b.dataset.tab; financeView(el) })
  el.querySelector('[data-rr]')?.addEventListener('click', () => rentRediModal(() => financeView(el)))
  el.querySelector('[data-bill]').onclick = () => oblModal(null, finTab === 'in' ? S.inventory()[0]?.id || null : null, () => financeView(el), finTab === 'in' ? { kind: 'rent', freq: 'monthly' } : null)
  el.querySelectorAll('[data-k]').forEach(r => r.querySelector('[data-k2]').onclick = () => { const [oid, per] = r.dataset.k.split('|'); const it = S.periodItems(per).find(i => i.ob.id === oid); if (it) payModal(it, () => financeView(el)) })
}

// ---------- Import from HighLevel (Property Management > Opportunities > export CSV) ----------
function ghlModal(done) {
  modal(`<h3>${esc(t('pf.ghl_title'))}</h3><p class="muted" style="margin:0">${esc(t('pf.ghl_lead'))}</p>
    <label class="drop" style="cursor:pointer">${icon('upload')}<div><b>${esc(t('i.drop'))}</b></div><p>CSV</p><input type="file" accept=".csv,text/csv" hidden data-file></label>
    <div data-prev></div>`, (box, close) => {
    box.querySelector('[data-file]').onchange = async e => {
      const f = e.target.files[0]; if (!f) return
      const r = parseGhlOpportunities(await f.text())
      const prev = box.querySelector('[data-prev]')
      if (r.error) { prev.innerHTML = `<div class="alert bad">${esc(t('pf.ghl_bad'))}</div>`; return }
      const by = {}; for (const i of r.items) by[i.ob.kind] = (by[i.ob.kind] || 0) + 1
      const homes = new Set(r.items.map(i => i.home).filter(Boolean))
      prev.innerHTML = `<div class="alert">${esc(t('pf.ghl_found'))}: ${Object.entries(by).map(([k, n]) => `<b>${n}</b> ${esc(t('pf.k_' + k))}`).join(' · ')} · <b>${homes.size}</b> ${esc(t('pf.ghl_homes'))}${r.skipped.length ? ` · ${r.skipped.length} ${esc(t('pf.ghl_skip'))}` : ''}</div>
        <p class="muted" style="margin:0">${esc(t('pf.ghl_note'))}</p>
        <div class="tbl-wrap" style="max-height:260px;overflow:auto"><table class="seq-tbl"><tbody>${r.items.slice(0, 60).map(i => `<tr><td>${esc(i.home || 'n/a')}</td><td>${esc(t('pf.k_' + i.ob.kind))}${i.ob.unit ? ' ' + esc(i.ob.unit) : ''}${i.ob.lien > 1 ? ' · ' + esc(t('pf.lien2')) : ''}</td><td>${esc(i.ob.party)}</td><td class="num">${money(i.ob.amount)}</td><td><small class="dim">${esc(i.source.stage)}</small></td></tr>`).join('')}</tbody></table></div>
        <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn ghost" data-close>${esc(t('cancel'))}</button><button class="btn gold" data-go>${esc(t('pf.ghl_go'))} (${r.items.length})</button></div>`
      prev.querySelector('[data-close]').onclick = close
      prev.querySelector('[data-go]').onclick = async ev => {
        const b = ev.currentTarget; b.disabled = true
        try { const res = await S.importObligations(r.items, (n, tot) => { b.textContent = `${n} / ${tot}` }); close(); toast(`${t('pf.ghl_done')}: ${res.saved} · ${res.made} ${t('pf.ghl_homes')} · ${res.paid} ${t('pf.st_paid').toLowerCase()}`); done() } catch (err) { b.disabled = false; toast(err.message) }
      }
    }
  }, { wide: true })
}

// ---------- Import from RentRedi (all of I AM's rents are collected there) ----------
function rentRediModal(done) {
  modal(`<h3>${esc(t('rr.title'))}</h3><p class="muted" style="margin:0">${esc(t('rr.lead'))}</p>
    <label class="drop" style="cursor:pointer">${icon('upload')}<div><b>${esc(t('i.drop'))}</b></div><p>CSV</p><input type="file" accept=".csv,text/csv" hidden data-file></label>
    <div data-prev></div>`, (box, close) => {
    box.querySelector('[data-file]').onchange = async e => {
      const f = e.target.files[0]; if (!f) return
      const r = parseRentRedi(await f.text()), prev = box.querySelector('[data-prev]')
      if (r.error) { prev.innerHTML = `<div class="alert bad">${esc(t('rr.bad'))}</div>`; return }
      // Match against every money-in item (rent, wrap, loan), whatever month it started in.
      const rentOpts = S.obligations().filter(o => S.dirOf(o.kind) === 'in')
      const cands = rentOpts.map(o => ({ ob: o, inv: S.inventory().find(h => h.id === o.invId) || null }))
      const owing = r.pays.filter(x => !(x.amount > 0))
      const rows = r.pays.filter(x => x.amount > 0).map(x => { const it = matchRent(x, cands); return { ...x, obId: it?.ob.id || '' } })
      const label = o => { const v = S.inventory().find(h => h.id === o.invId); return `${v?.address || ''}${o.unit ? ' ' + o.unit : ''} · ${t('pf.k_' + o.kind)}${o.party ? ' · ' + o.party : ''}` }
      const opts = sel => `<option value="">${esc(t('rr.skip'))}</option>` + rentOpts.map(o => `<option value="${esc(o.id)}" ${o.id === sel ? 'selected' : ''}>${esc(label(o))}</option>`).join('')
      const mon = p => new Date(+p.slice(0, 4), +p.slice(5, 7) - 1, 1).toLocaleDateString(getLang() === 'es' ? 'es-MX' : 'en-US', { month: 'short', year: 'numeric' })
      const ok = rows.filter(x => x.obId).length
      prev.innerHTML = `<div class="alert">${rows.length} ${esc(t('rr.pays'))} · <b>${ok}</b> ${esc(t('rr.matched'))} · ${rows.length - ok} ${esc(t('rr.unmatched'))}${r.skipped.length ? ` · ${r.skipped.length} ${esc(t('rr.ignored'))}` : ''}${owing.length ? ` · ${owing.length} ${esc(t('rr.owing'))}` : ''}</div>
        <p class="muted" style="margin:0">${esc(t('rr.note'))}</p>
        <div class="tbl-wrap" style="max-height:320px;overflow:auto"><table class="seq-tbl"><tbody>${rows.map((x, i) => `<tr><td><b>${esc(mon(x.period))}</b><small class="dim" style="display:block">${esc(t('pf.paid_on'))} ${esc(date(x.date))}</small></td><td><b>${esc(x.tenant)}</b><small class="dim" style="display:block">${esc(x.property)}${x.unit ? ' #' + esc(x.unit) : ''}</small></td><td class="num">${money(x.amount)}${x.owed > 0 ? `<small class="dim" style="display:block">${esc(t('rr.still'))} ${money(x.owed)}</small>` : ''}</td><td><select data-i="${i}" style="max-width:300px">${opts(x.obId)}</select></td></tr>`).join('')}</tbody></table></div>
        <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn ghost" data-x>${esc(t('cancel'))}</button><button class="btn gold" data-go>${esc(t('rr.go'))}</button></div>`
      prev.querySelectorAll('[data-i]').forEach(s2 => s2.onchange = () => { rows[+s2.dataset.i].obId = s2.value })
      prev.querySelector('[data-x]').onclick = close
      prev.querySelector('[data-go]').onclick = async ev => {
        const b = ev.currentTarget; b.disabled = true; let n = 0, skip = rows.filter(x => !x.obId).length
        try {
          // One payment per item and month: charges in the same month (rent + prorated) add up.
          const groups = new Map()
          for (const x of rows.filter(x => x.obId)) { const k = x.obId + '|' + x.period, g = groups.get(k) || { obId: x.obId, period: x.period, paid: 0, owed: 0, date: x.date, refs: [], method: x.method }; g.paid += x.amount; g.owed += x.owed || 0; if (x.date > g.date) g.date = x.date; g.refs.push(x.ref); groups.set(k, g) }
          for (const g of groups.values()) {
            let it = S.periodItems(g.period).find(i => i.ob.id === g.obId)
            if (!it) { // item starts later than this payment: move its start back so the month exists
              const ob = S.obligations().find(o => o.id === g.obId); if (!ob) continue
              await S.saveObligation({ ...ob, dueDate: `${g.period.slice(0, 8)}${String(Math.min(ob.dueDay || 1, 28)).padStart(2, '0')}` })
              it = S.periodItems(g.period).find(i => i.ob.id === g.obId); if (!it) continue
            }
            await S.recordPayment(it, { paid: Math.round(g.paid * 100) / 100, paidOn: g.date, method: g.method.slice(0, 40), reference: g.refs.join(' ').slice(0, 200), status: g.owed > 0.5 ? 'partial' : 'paid', notes: 'RentRedi' })
            n++; b.textContent = `${n} / ${groups.size}`
          }
          close(); toast(`${t('rr.done')}: ${n}${skip ? ` · ${skip} ${t('rr.unmatched')}` : ''}`); done()
        } catch (err) { b.disabled = false; toast(err.message) }
      }
    }
  }, { wide: true })
}
