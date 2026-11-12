import { t } from '../i18n.js'
import * as S from '../store.js'
import { esc, money, date, table, scorePill, statusPill, exportCSV, skipTrace, pushCRM, toast, selection, selChanged, icon } from '../ui.js'
import { openDrawer } from '../drawer.js'

let active = null
export function lists(el) {
  const ls = S.lists()
  if (!ls.find(l => l.id === active)) active = ls[0]?.id || null
  const l = ls.find(x => x.id === active)
  const rows = l ? l.ids.map(S.parcel).filter(Boolean) : []
  const cols = [
    { key: 'address', label: t('c.address'), cls: 'addr', render: p => `<b>${esc(p.address)}</b><span>${esc(p.zip)}</span>` },
    { key: 'owner', label: t('c.owner'), render: p => esc(p.owners?.[0]?.name || 'n/a') },
    { key: 'phone', label: t('c.phone'), render: p => { const ph = (p.contacts || []).filter(c => c.kind === 'phone'); return ph.length ? ph.map(c => `<span class="mono" style="${c.dnc ? 'text-decoration:line-through;color:var(--dim)' : ''}">${esc(c.value)}</span>`).join('<br/>') : '<span class="dim">n/a</span>' } },
    { key: 'sale', label: t('c.sale'), render: p => p.foreclosure ? `<span class="mono">${esc(date(p.foreclosure.saleDate))}</span>` : '<span class="dim">n/a</span>' },
    { key: 'equity', label: t('c.equity'), num: true, render: p => money(p._d.equity, true) },
    { key: 'score', label: t('c.score'), num: true, render: p => scorePill(p._score) },
    { key: 'status', label: t('c.status'), render: p => statusPill(p.status) },
    { key: 'rm', label: '', render: p => `<button class="btn sm ghost" data-rm="${esc(p.id)}" aria-label="remove">${icon('x')}</button>` },
  ]
  const tb = table({ rows, cols, onRow: openDrawer })
  const traced = rows.filter(p => (p.contacts || []).some(c => c.kind === 'phone')).length

  el.innerHTML = `<div class="list-grid fade-in">
    <div class="card"><h3>${esc(t('lists.title'))}</h3>
      ${ls.map(x => `<button class="list-item ${x.id === active ? 'on' : ''}" data-l="${esc(x.id)}"><b>${esc(x.name)}</b><span>${x.ids.length} ${esc(t('lists.items'))} · ${esc(date(x.createdAt.slice(0, 10)))}</span></button>`).join('') || `<p class="muted">${esc(t('lists.empty'))}</p>`}
      <form class="inline-form" data-new><input name="n" placeholder="${esc(t('lists.name_ph'))}" required /><button class="btn sm gold">${esc(t('lists.new'))}</button></form>
      <h3 style="margin-top:22px">${esc(t('lists.saved'))}</h3>
      <div class="chips">
        <a class="chip" href="#/foreclosures">${esc(t('nav.foreclosures'))}</a>
        <a class="chip" href="#/properties?tag=tax_delinquent">${esc(t('tag.tax_delinquent'))}</a>
        <a class="chip" href="#/properties?tag=absentee">${esc(t('tag.absentee'))}</a>
        <a class="chip" href="#/properties?tag=high_equity">${esc(t('tag.high_equity'))}</a>
        <a class="chip" href="#/properties?tag=probate">${esc(t('tag.probate'))}</a>
        <a class="chip" href="#/properties?tag=vacant">${esc(t('tag.vacant'))}</a>
      </div>
    </div>
    <div style="display:grid;gap:14px;min-width:0">
      ${l ? `<div class="card"><h3>${esc(l.name)}<span class="r mono">${rows.length} · ${traced} ☎</span></h3>
        <div class="toolbar">
          <button class="btn gold" data-a="skip">${esc(t('sel.skip'))} (${rows.length})</button>
          <button class="btn" data-a="reiskip">${icon('download')}${esc(t('lists.export_reiskip'))}</button>
          <button class="btn" data-a="ghl">${icon('download')}${esc(t('lists.export_ghl'))}</button>
          <button class="btn" data-a="generic">${icon('download')}${esc(t('lists.export_generic'))}</button>
          <button class="btn" data-a="crm">${esc(t('sel.crm'))}</button>
          <button class="btn ghost" data-a="dedupe">${esc(t('lists.dedupe'))}</button>
          <button class="btn ghost" data-a="select">${esc(t('sel.all'))}</button>
          <span class="sp"></span>
          <button class="btn ghost" data-a="delete" style="color:var(--bad)">${esc(t('lists.delete'))}</button>
        </div></div>${tb.html}` : `<div class="card"><p class="muted">${esc(t('lists.empty'))}</p></div>`}
    </div></div>`

  if (l) tb.bind(el)
  el.querySelectorAll('[data-l]').forEach(b => b.onclick = () => { active = b.dataset.l; lists(el) })
  el.querySelector('[data-new]').onsubmit = async e => { e.preventDefault(); const nl = await S.createList(new FormData(e.target).get('n')); active = nl.id }
  el.querySelectorAll('[data-rm]').forEach(b => b.onclick = e => { e.stopPropagation(); S.removeFromList(l.id, b.dataset.rm) })
  el.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
    const a = b.dataset.a, ids = l.ids
    if (a === 'skip') return skipTrace(ids)
    if (['reiskip', 'ghl', 'generic'].includes(a)) return exportCSV(ids, a)
    if (a === 'crm') return pushCRM(ids)
    if (a === 'select') { ids.forEach(id => selection.add(id)); selChanged(); return lists(el) }
    if (a === 'dedupe') { const keep = S.dedupeIds(ids); for (const id of ids.filter(x => !keep.includes(x))) await S.removeFromList(l.id, id); return toast(`${t('toast.deduped')}: ${ids.length - keep.length}`) }
    if (a === 'delete' && confirm(t('lists.delete') + '?')) return S.deleteList(l.id)
  })
}
