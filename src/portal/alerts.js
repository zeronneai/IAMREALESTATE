// Jarvis alerts: the portal checks itself and lists what needs attention (bell in the top bar).
// Rules run in the browser on the data already loaded, so they cost nothing. The daily summary
// is the only part that calls Claude (once a day, on demand, cached in this browser).
import { t, getLang } from './i18n.js'
import * as S from './store.js'
import { esc, money, date } from './ui.js'
import { firstTuesdays } from './score.js'
import { lastImport } from './countyfc.js'

const SEEN_KEY = 'iam_alerts_seen_v1', SUM_KEY = 'iam_alerts_summary_v1'
const load = k => { try { return JSON.parse(localStorage.getItem(k)) || {} } catch { return {} } }
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* private mode */ } }
const todayStr = () => new Date().toISOString().slice(0, 10)
const days = d => Math.round((new Date(d + 'T12:00:00') - new Date(todayStr() + 'T12:00:00')) / 86400e3)
const shift = (p, k) => S.monthStart(new Date(+p.slice(0, 4), +p.slice(5, 7) - 1 + k, 1))
const title = o => o.label || `${t('pf.k_' + o.kind)}${o.unit ? ' ' + o.unit : ''}`

// Every alert: { id, sev: bad | warn | info, area: money | deals | people | homes, text, go }
export function computeAlerts() {
  const out = [], finance = S.role() === 'finance'
  const add = (id, sev, area, text, go) => out.push({ id, sev, area, text, go })

  // Money: late and due soon (rent, wraps, mortgages, bills), last month and this month.
  const cur = S.monthStart()
  for (const it of [...S.periodItems(shift(cur, -1)), ...S.periodItems(cur)]) {
    const where = it.inv?.address || it.ob.party || ''
    if (it.status === 'late') add(`late:${it.ob.id}:${it.period}`, 'bad', 'money', `${t(it.ob.dir === 'in' ? 'al.late_in' : 'al.late_out')}: ${title(it.ob)} · ${where} · ${money(it.amount)}`, '#/finance')
    else if (!it.pay && it.status !== 'autopay' && it.due >= todayStr() && days(it.due) <= 3) add(`due:${it.ob.id}:${it.period}`, 'warn', 'money', `${t(it.ob.dir === 'in' ? 'al.due_in' : 'al.due_out')} ${date(it.due)}: ${title(it.ob)} · ${where} · ${money(it.amount)}`, '#/finance')
  }
  // Accounts in a special situation (eviction, payment plan, foreclosure, disconnected).
  for (const o of S.obligations().filter(o => o.active && ['eviction', 'payment_plan', 'foreclosure', 'disconnected'].includes(o.situation))) {
    const v = S.inventory().find(x => x.id === o.invId)
    add(`sit:${o.id}:${o.situation}`, o.situation === 'payment_plan' ? 'info' : 'warn', 'money', `${t('pf.s_' + o.situation)}: ${title(o)}${o.party ? ' · ' + o.party : ''}${v ? ' · ' + v.address : ''}`, '#/portfolio')
  }
  // Mortgage statements due within a week and not paid.
  for (const v of S.inventory()) for (const s of v.statements || []) {
    if (!s.paid && s.dueDate && days(s.dueDate) <= 7) add(`stmt:${s.id}`, days(s.dueDate) < 0 ? 'bad' : 'warn', 'money', `${t('al.stmt')} ${date(s.dueDate)}: ${v.address} · ${money(s.amountDue)}`, '#/mortgages')
  }

  if (!finance) {
    // Deals: auctions within 7 days for properties the team is working, and the next sale overall.
    const fcs = S.parcels().filter(p => p.foreclosure && (p._d?.daysToSale ?? -1) >= 0)
    for (const p of fcs.filter(p => p._d.daysToSale <= 7 && ['contacted', 'appointment', 'offer', 'under_contract'].includes(p.status)))
      add(`auc:${p.id}:${p.foreclosure.saleDate}`, 'bad', 'deals', `${t('al.auction')} ${p._d.daysToSale} ${t('k.days')}: ${p.address} (${t('st.' + p.status)})`, `#/foreclosures?p=${encodeURIComponent(p.id)}`)
    const next = fcs.map(p => p.foreclosure.saleDate).sort()[0]
    if (next && days(next) <= 10) add(`sale:${next}`, 'info', 'deals', `${t('al.next_sale')} ${date(next)}: ${fcs.filter(p => p.foreclosure.saleDate === next).length} ${t('al.records')}`, '#/foreclosures')
    // Reminder to bring the county foreclosure list (sale = first Tuesday; notices close 21 days before).
    const sale = firstTuesdays(new Date(Date.now() + 86400e3), 1)[0]
    if (sale && days(sale) <= 28) {
      const have = S.parcels().some(p => p.foreclosure?.saleDate === sale)
      const closed = new Date(new Date(sale + 'T12:00:00') - 21 * 86400e3).toISOString().slice(0, 10)
      const last = lastImport().slice(0, 10)
      if (!have) add(`county:${sale}:new`, 'warn', 'deals', `${t('al.county_new')} ${date(sale)}`, '#/import?county=go')
      else if (todayStr() > closed && (!last || last <= closed)) add(`county:${sale}:upd`, 'info', 'deals', `${t('al.county_upd')} ${date(sale)}`, '#/import?county=go')
    }
    // Open tasks that are due or overdue.
    for (const p of S.parcels()) for (const k of (p.tasks || []).filter(k => !k.done && k.due && days(k.due) <= 0))
      add(`task:${k.id}`, days(k.due) < 0 ? 'warn' : 'info', 'deals', `${t('al.task')}: ${k.title} · ${p.address}`, `#/properties?p=${encodeURIComponent(p.id)}`)

    // People: texts waiting for an answer, appointments today and tomorrow, calls to review.
    for (const th of S.threads().filter(th => th.unread)) {
      const who = S.personByPeer?.(th.last.peer)?.name || S.parcel?.(th.parcelId)?.address || th.last.peer
      add(`msg:${th.key}:${th.last.at}`, 'warn', 'people', `${t('al.unread')}: ${who}`, '#/inbox')
    }
    for (const a of S.appointments().filter(a => a.status !== 'cancelled' && a.start && days(a.start.slice(0, 10)) >= 0 && days(a.start.slice(0, 10)) <= 1)) {
      const when = new Date(a.start).toLocaleString(getLang() === 'es' ? 'es-MX' : 'en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
      add(`appt:${a.id}:${a.start}`, 'info', 'people', `${t('al.appt')} ${when}: ${a.title}${a.withName ? ' · ' + a.withName : ''}`, '#/calendar')
    }
    const calls = S.voiceCalls().filter(c => !c.reviewed).length
    if (calls) add(`calls:${calls}`, 'info', 'people', `${calls} ${t('al.calls')}`, '#/voice')

    // Homes for sale missing what the website needs.
    for (const v of S.inventory().filter(v => v.status === 'listed')) {
      const L = v.listing || {}
      if (!(L.photos || []).length) add(`nophoto:${v.id}`, 'info', 'homes', `${t('al.no_photos')}: ${v.address}`, '#/inventory')
      else if (!v.published) add(`unpub:${v.id}`, 'info', 'homes', `${t('al.unpublished')}: ${v.address}`, '#/inventory')
      else if (!L.price && !v.listPrice) add(`noprice:${v.id}`, 'info', 'homes', `${t('al.no_price')}: ${v.address}`, '#/inventory')
    }
  }
  // Jarvis watching for opportunities: upcoming foreclosures nobody has worked yet, with good equity or a high score.
  if (!finance) for (const p of opportunities().slice(0, 6)) {
    add(`opp:${p.id}:${p.foreclosure.saleDate}`, p._d.daysToSale <= 7 ? 'warn' : 'info', 'deals', `${t('al.opp')}: ${p.address} · ${t('al.opp_eq')} ${Math.round(p._d.equityPct || 0)}% · ${t('al.opp_sale')} ${date(p.foreclosure.saleDate)}`, '#/lists')
  }
  const rank = { bad: 0, warn: 1, info: 2 }
  return out.sort((a, b) => rank[a.sev] - rank[b.sev])
}

// Upcoming foreclosures still "new" (nobody contacted), with equity of 40% or more or a score of 60 or more, best first.
export function opportunities() {
  return S.parcels().filter(p => p.foreclosure && (p._d?.daysToSale ?? -1) >= 0 && (!p.status || p.status === 'new')
    && ((p._d?.equityPct || 0) >= 40 || (p._score || 0) >= 60) && !(p.tags || []).includes('tax_delinquent_heavy'))
    .sort((a, b) => (b._score || 0) - (a._score || 0) || (b._d.equityPct || 0) - (a._d.equityPct || 0))
}
export const unseen = list => { const seen = load(SEEN_KEY); return list.filter(a => !seen[a.id]) }
export function markSeen(ids) { const seen = load(SEEN_KEY); const now = todayStr(); ids.forEach(id => { seen[id] = now }); const keep = Object.entries(seen).filter(([, d]) => days(d) > -60); store(SEEN_KEY, Object.fromEntries(keep)) }

// Plain text of the alerts, for Jarvis (no phone numbers or emails).
export const alertsText = list => list.slice(0, 40).map(a => `- [${a.sev}] ${a.text}`).join('\n')

export const cachedSummary = () => { const s = load(SUM_KEY); return s.day === todayStr() && s.lang === getLang() ? s.text : '' }
export async function dailySummary(list) {
  if (S.MODE === 'demo') { store(SUM_KEY, { day: todayStr(), lang: getLang(), text: t('al.demo_sum') }); return t('al.demo_sum') }
  const q = t('al.sum_q') + '\n\n' + (alertsText(list) || t('al.none'))
  const r = await fetch('/api/jarvis', { method: 'POST', headers: { 'Content-Type': 'application/json', ...S.authHeader() }, body: JSON.stringify({ messages: [{ role: 'user', content: q }], context: '', lang: getLang(), mode: 'brief' }) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(t('jv.e_' + (j.code || 'llm_failed')) !== 'jv.e_' + (j.code || 'llm_failed') ? t('jv.e_' + j.code) : t('jv.e_llm_failed'))
  store(SUM_KEY, { day: todayStr(), lang: getLang(), text: j.reply })
  return j.reply
}

// ---------- Bell UI ----------
let open = false
export function bellHtml() { return `<div class="al-wrap"><button class="theme-tg al-bell" data-bell title="${esc(t('al.title'))}" aria-label="${esc(t('al.title'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg><span class="al-n" data-bell-n hidden></span></button><div class="al-panel" data-bell-panel hidden></div></div>` }

export function paintBell() {
  const n = document.querySelector('[data-bell-n]'); if (!n) return
  const list = computeAlerts(), u = unseen(list).filter(a => a.sev !== 'info').length
  n.hidden = !u; n.textContent = u > 99 ? '99+' : String(u)
  if (open) paintPanel(list)
}

const md = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').split('\n').map(l => /^\s*[-*•]\s+/.test(l) ? `<li>${l.replace(/^\s*[-*•]\s+/, '')}</li>` : (l.trim() ? `<p>${l}</p>` : '')).join('').replace(/(<li>.*?<\/li>)+/g, m => `<ul>${m}</ul>`)

function paintPanel(list = computeAlerts()) {
  const panel = document.querySelector('[data-bell-panel]'); if (!panel) return
  const seen = load(SEEN_KEY), sum = cachedSummary()
  const areas = ['money', 'deals', 'people', 'homes'].map(a => [a, list.filter(x => x.area === a)]).filter(([, l]) => l.length)
  panel.innerHTML = `<div class="al-head"><b>${esc(t('al.title'))}</b>${list.length ? `<button class="linkish" data-seen-all>${esc(t('al.seen_all'))}</button>` : ''}</div>
    <div class="al-sum">${sum ? `<div class="al-sum-text">${md(sum)}</div>` : `<button class="btn sm gold" data-sum>${esc(t('al.sum_btn'))}</button><small class="dim">${esc(t('al.sum_hint'))}</small>`}</div>
    <div class="al-list">${areas.length ? areas.map(([a, l]) => `<div class="al-area">${esc(t('al.a_' + a))}</div>${l.slice(0, 25).map(x => `<a class="al-item ${x.sev} ${seen[x.id] ? 'seen' : ''}" href="${esc(x.go)}" data-al="${esc(x.id)}"><i></i><span>${esc(x.text)}</span></a>`).join('')}`).join('') : `<p class="muted" style="padding:14px">${esc(t('al.none'))}</p>`}</div>`
  panel.querySelector('[data-seen-all]')?.addEventListener('click', () => { markSeen(list.map(a => a.id)); paintBell() })
  panel.querySelectorAll('[data-al]').forEach(a => a.addEventListener('click', () => { markSeen([a.dataset.al]); toggle(false) }))
  panel.querySelector('[data-sum]')?.addEventListener('click', async e => {
    const b = e.currentTarget; b.disabled = true; b.textContent = t('al.sum_wait')
    try { await dailySummary(list); paintPanel() } catch (err) { b.disabled = false; b.textContent = t('al.sum_btn'); panel.querySelector('.al-sum small').textContent = err.message }
  })
}
function toggle(v = !open) {
  open = v
  const panel = document.querySelector('[data-bell-panel]'); if (!panel) return
  panel.hidden = !open
  if (open) paintPanel()
}

let wired = false
export function mountBell() {
  document.querySelector('[data-bell]')?.addEventListener('click', e => { e.stopPropagation(); toggle() })
  document.querySelector('[data-bell-panel]')?.addEventListener('click', e => e.stopPropagation())
  open = false; paintBell()
  if (wired) return
  wired = true
  document.addEventListener('click', () => { if (open) toggle(false) })
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) toggle(false) })
  S.onChange(() => paintBell())
  // Appointments only load on the calendar; get them once so the bell knows about today's.
  S.loadAppointments?.().catch(() => {}).finally(() => paintBell())
  setInterval(() => { if (!document.hidden) paintBell() }, 5 * 60e3)
}
