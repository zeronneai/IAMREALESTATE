import { t } from '../i18n.js'
import * as S from '../store.js'
import { esc, money, date, scoreColor } from '../ui.js'
import { firstTuesdays, today, daysUntil } from '../score.js'
import { openDrawer } from '../drawer.js'
import { mountMap } from '../map.js'

export function dashboard(el) {
  const ps = S.parcels()
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
      <div class="bars">${buckets.map((n, i) => `<div class="b"><em>${n}</em><i style="height:${(n / maxB) * 110}px;background:${scoreColor(i * 10 + 5)}"></i><span>${i * 10}</span></div>`).join('')}</div>
    </div>
  </div>
  <div class="grid-2">
    <div class="card fade-in"><h3>${esc(t('dash.map'))}</h3><div class="map" id="dmap"></div></div>
    <div style="display:grid;gap:18px;align-content:start">
      <div class="card fade-in"><h3>${esc(t('dash.pipeline'))}</h3><div class="funnel">${stages.map((s, i) => `<div class="funnel-row"><span>${esc(t('st.' + s))}</span><span class="b"><i style="width:${(stageN[i] / maxS) * 100}%"></i></span><span class="mono">${stageN[i]}</span></div>`).join('')}</div></div>
      <div class="card fade-in"><h3>${esc(t('dash.tasks'))}</h3>${tasks.length ? tasks.map(x => `<div class="task" data-open="${esc(x.p.id)}" style="cursor:pointer"><span class="pill ${daysUntil(x.due) < 0 ? 'bad' : ''}">${esc(x.due ? date(x.due) : '')}</span><span>${esc(x.title)}</span><span class="dim" style="font-size:12px">${esc(x.p.address)}</span></div>`).join('') : `<p class="muted">${esc(t('dash.none'))}</p>`}</div>
    </div>
  </div>`
  el.querySelectorAll('[data-sale]').forEach(r => r.onclick = () => { location.hash = '#/foreclosures?sale=' + r.dataset.sale })
  el.querySelectorAll('[data-open]').forEach(r => r.onclick = () => openDrawer(r.dataset.open))
  mountMap(el.querySelector('#dmap'), ps.filter(p => p.status !== 'dead'), { onOpen: openDrawer })
}
