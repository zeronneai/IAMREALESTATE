// Property detail drawer: everything the client asked to see on one screen.
import { t } from './i18n.js'
import * as S from './store.js'
import { esc, money, date, $, scorePill, statusPill, tagPill, icon, skipTrace, pickList, toast } from './ui.js'
import { researchLinks } from './research.js'
import * as DNC from './dnc.js'
import * as EP from './epcad.js'

DNC.ready().catch(() => {})
EP.ready().catch(() => {})

const STATUSES = ['new', 'contacted', 'appointment', 'offer', 'under_contract', 'dead']
let current = null

export function openDrawer(id) {
  current = id
  let scrim = $('.scrim'), dr = $('.drawer')
  if (!dr) {
    scrim = document.createElement('div'); scrim.className = 'scrim'
    dr = document.createElement('aside'); dr.className = 'drawer'; dr.setAttribute('aria-label', 'Property detail')
    document.body.append(scrim, dr)
    scrim.onclick = closeDrawer
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && dr.classList.contains('show')) closeDrawer() })
    S.onChange(() => { if (dr.classList.contains('show') && current) render(dr) })
  }
  render(dr)
  requestAnimationFrame(() => { scrim.classList.add('show'); dr.classList.add('show') })
  try { history.replaceState(null, '', location.hash.split('?')[0] + '?p=' + encodeURIComponent(id)) } catch {}
}
export function closeDrawer() {
  $('.scrim')?.classList.remove('show'); $('.drawer')?.classList.remove('show'); current = null
  try { history.replaceState(null, '', location.hash.split('?')[0]) } catch {}
}

function render(dr) {
  const p = S.parcel(current); if (!p) return closeDrawer()
  const d = p._d, f = p.foreclosure
  const keepScroll = $('.dr-body', dr)?.scrollTop || 0
  const debtTotal = Math.max(1, d.value)
  const seg = (v, c) => `<i style="width:${Math.max(0, Math.min(100, (v / debtTotal) * 100))}%;background:${c}"></i>`
  const gmaps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.address}, ${p.city}, ${p.state} ${p.zip}`)}`
  const why = Object.entries(p._parts).map(([k, v]) => { const max = S.weights()[k] || 1; return `<div class="why-row"><span>${esc(t('sc.' + k))}</span><span class="b"><i style="width:${(v / max) * 100}%"></i></span><span class="mono">${v}/${max}</span></div>` }).join('')

  dr.innerHTML = `
  <div class="dr-head">
    <button class="btn ghost sm x" data-x aria-label="${esc(t('d.close'))}">${icon('x')}</button>
    <div class="chips">${(p.tags || []).map(tagPill).join('')}${p.demo ? '<span class="pill">DEMO</span>' : ''}</div>
    <h2>${esc(p.address)}</h2>
    <div class="muted">${esc([`${p.city || ''}, ${p.state || ''} ${p.zip || ''}`.trim(), p.type, p.epcadId ? 'EPCAD ' + p.epcadId : ''].filter(Boolean).join(' · '))}</div>
    <div class="links" style="margin-top:12px">
      <button class="btn gold sm" data-skip>${icon('phone')}${esc(t('d.skip'))}</button>
      <button class="btn sm" data-list>${esc(t('sel.add'))}</button>
      <a class="btn sm ghost" href="${gmaps}" target="_blank" rel="noopener">${esc(t('d.maps'))}</a>
      <button class="btn sm ghost" data-epm>${esc(t('d.epcad_match'))}</button>
      <a class="btn sm ghost" href="https://actweb.acttax.com/act_webdev/elpaso/index.jsp" target="_blank" rel="noopener">${esc(t('d.taxoffice'))}</a>
    </div>
  </div>
  <div class="dr-body">
    ${f ? `<div class="countdown">
      <div class="big mono">${d.daysToSale < 0 ? '0' : d.daysToSale}</div>
      <div><small>${esc(d.daysToSale < 0 ? t('d.sold') : t('d.sale_in') + ' ' + t('k.days'))}</small><b>${esc(date(f.saleDate))}</b> · ${esc(f.saleWindow || '')}<div class="muted" style="font-size:12px">${esc(f.saleLocation || '')}</div></div>
      <div style="margin-left:auto;text-align:right"><small>${esc(t('d.score'))}</small>${scorePill(p._score)}</div>
    </div>` : `<div class="countdown"><div><small>${esc(t('d.score'))}</small>${scorePill(p._score)}</div><div class="muted" style="font-size:12.5px">${(p.tags || []).map(x => t('tag.' + x)).join(' · ')}</div></div>`}

    <div class="sec"><h4>${esc(t('d.pipeline'))}</h4>
      <div class="steps">${STATUSES.map(s => `<button data-st="${s}" class="${p.status === s ? 'on' : ''} ${s === 'dead' ? 'dead' : ''}">${esc(t('st.' + s))}</button>`).join('')}</div>
    </div>

    <div class="sec"><h4>${esc(t('d.owners'))}</h4>
      ${(p.owners || []).map(o => `<div class="owner"><b>${esc(o.name)}</b>${o.deceased ? ' <span class="pill gold">Probate</span>' : ''}
        <span class="muted" style="font-size:12.5px">${esc(t('d.mailing'))}: ${esc([o.mailing, o.mailingCity, o.mailingState, o.mailingZip].filter(Boolean).join(', ') || 'n/a')} ${o.absentee ? `<span class="pill blue">${esc(t('d.absentee'))}</span>` : ''}</span></div>`).join('') || `<p class="muted">n/a</p>`}
      <div style="display:grid;gap:8px;margin-top:10px">
        ${(p.contacts || []).length ? p.contacts.map(c => { const dnc = c.kind === 'phone' && (c.dnc || DNC.isDnc(c.value)); return `<div class="contact">${c.kind === 'phone' ? icon('phone', 'ic') : '@'} ${c.kind === 'phone' && !dnc ? `<a href="tel:${esc(c.value.replace(/\D/g, ''))}">${esc(c.value)}</a> <a class="dim" style="font-size:11px" href="sms:${esc(c.value.replace(/\D/g, ''))}">SMS</a>` : c.kind === 'email' ? `<a href="mailto:${esc(c.value)}">${esc(c.value)}</a>` : `<span class="mono dnc-off">${esc(c.value)}</span>`}
          ${c.phoneType ? `<span class="pill">${esc(c.phoneType)}</span>` : ''}${dnc ? `<span class="pill bad">${esc(t('d.dnc'))}</span>` : ''}${c.litigator ? `<span class="pill bad">${esc(t('d.litigator'))}</span>` : ''}${c.confidence ? `<span class="dim mono" style="font-size:11px">${c.confidence}%</span>` : ''}${c.provider ? `<span class="dim" style="font-size:11px">${esc(c.provider)}${c.foundAt ? ' · ' + esc(date(c.foundAt)) : ''}</span>` : ''}${c.kind === 'phone' && !dnc ? `<button class="btn sm ghost" style="height:24px;font-size:11px;margin-left:auto" data-dnc="${esc(c.value)}">${esc(t('dnc.flag'))}</button>` : ''}</div>` }).join('') : `<p class="muted" style="margin:0">${esc(t('d.no_contacts'))}</p>`}
        ${(p.contacts || []).some(c => c.kind === 'phone' && (c.dnc || DNC.isDnc(c.value))) ? `<div class="dnc-note">${esc(t('dnc.blocked'))}</div>` : ''}
        ${(p.contacts || []).some(c => c.kind === 'phone') ? `<div class="muted" style="font-size:11.5px">${esc(t('dnc.reminder'))}</div>` : ''}
      </div>
    </div>

    <div class="sec"><h4>${esc(t('r.title'))}</h4>
      <p class="muted" style="margin:0 0 8px;font-size:12px">${esc(t('r.hint'))}</p>
      <div class="research">${['people', 'records', 'place'].map(g => `<div class="grp"><span>${esc(t('r.' + g))}</span>${researchLinks(p).filter(l => l.group === g).map(l => `<a class="btn sm ghost" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" data-rl="${esc(l.label)}">${esc(l.label)}</a>`).join('')}</div>`).join('')}</div>
      <form class="inline-form" data-cf style="margin-top:10px"><input name="value" placeholder="${esc(t('r.value'))}" required /><input name="source" placeholder="${esc(t('r.source'))}" style="flex:0 0 150px" list="srcs" /><datalist id="srcs"><option>TruePeopleSearch</option><option>FastPeopleSearch</option><option>Whitepages</option><option>Facebook</option><option>Door knock</option><option>Owner called in</option></datalist><button class="btn sm">${esc(t('r.add'))}</button></form>
    </div>

    <div class="sec"><h4>${esc(t('d.money'))}</h4>
      <div class="money-row">
        <div><span>${esc(t('d.value'))}</span><b>${money(d.value)}${p.valueEstimated ? ` <small class="pill" title="${esc(t('d.value_est_hint'))}">${esc(t('d.value_est'))}</small>` : ''}</b></div>
        <div><span>${esc(t('d.balance'))}</span><b>${money(d.mortgageBal)}</b></div>
        <div><span>${esc(t('d.equity'))}</span><b style="color:${d.equity > 0 ? 'var(--ok)' : 'var(--bad)'}">${money(d.equity)}</b><span class="mono">${d.equityPct}%</span></div>
      </div>
      <div class="stack" role="img" aria-label="debt vs equity">${seg(d.mortgageBal, '#a77a1d')}${seg(d.otherLiens, '#e07a5f')}${seg(d.taxDue, '#e8b04a')}${seg(Math.max(0, d.equity), '#7fbf8a')}</div>
      <div class="legend"><span><i style="background:#a77a1d"></i>${esc(t('d.balance'))}</span><span><i style="background:#e07a5f"></i>${esc(t('d.other_liens'))} ${money(d.otherLiens)}</span><span><i style="background:#e8b04a"></i>${esc(t('d.taxes_due'))} ${money(d.taxDue)}</span><span><i style="background:#7fbf8a"></i>${esc(t('d.equity'))}</span></div>
    </div>

    ${f ? `<div class="sec"><h4>${esc(t('d.foreclosure'))}</h4><div class="kv">
      <div><span>${esc(t('d.mortgagee'))}</span><b>${esc(f.mortgagee || 'n/a')}</b></div>
      <div><span>${esc(t('d.servicer'))}</span><b>${esc(f.servicer || 'n/a')}</b></div>
      <div><span>${esc(t('d.trustees'))}</span><b>${esc((f.trustees || []).join(', ') || 'n/a')}</b></div>
      <div><span>${esc(t('d.attorney'))}</span><b>${esc(f.attorney || 'n/a')}</b></div>
      <div><span>${esc(t('d.orig'))}</span><b class="mono">${money(f.originalLoan)}</b></div>
      <div><span>${esc(t('d.dot'))}</span><b>${esc(date(f.dotDate))}</b></div>
      <div><span>${esc(t('d.filed'))}</span><b>${esc(date(f.filingDate))}</b></div>
      <div><span>Instrument</span><b class="mono">${esc(f.instrument || 'n/a')}</b></div>
    </div></div>` : ''}

    <div class="sec"><h4>${esc(t('d.property'))}</h4><div class="kv">
      <div><span>${esc(t('d.year_built'))}</span><b>${esc(p.yearBuilt || 'n/a')}</b></div>
      <div><span>${esc(t('d.owned'))}</span><b>${d.yearsOwned ?? 'n/a'} ${esc(t('yrs'))}</b></div>
      <div><span>${esc(t('d.last_deed'))}</span><b>${esc(date(p.lastDeedDate))}</b></div>
      <div><span>${esc(t('d.sqft'))}</span><b class="mono">${p.sqft ? p.sqft.toLocaleString() + ' sqft' : 'n/a'}</b></div>
      <div><span>${esc(t('d.bedbath'))}</span><b>${esc(p.beds ?? 'n/a')} / ${esc(p.baths ?? 'n/a')}</b></div>
      <div><span>${esc(t('d.lot'))}</span><b class="mono">${p.lot ? p.lot.toLocaleString() + ' sqft' : 'n/a'}</b></div>
      ${p.homestead || p.over65 ? `<div><span>EPCAD</span><b>${p.homestead ? esc(t('d.homestead')) : ''}${p.homestead && p.over65 ? ' · ' : ''}${p.over65 ? esc(t('d.over65')) : ''}</b></div>` : ''}
      <div style="grid-column:1/-1"><span>${esc(t('d.legal'))}</span><b class="mono" style="font-size:12px">${esc(p.legal || 'n/a')}</b></div>
    </div></div>

    <div class="sec"><h4>${esc(t('d.taxes'))}</h4>
      ${(p.taxes || []).length ? `<table class="mini"><tr><th>Entity</th><th>Year</th><th class="num">Amount</th><th></th></tr>${p.taxes.map(x => `<tr><td>${esc(x.entity)}</td><td class="mono">${esc(x.year || '')}</td><td class="num">${money(x.amount)}</td><td>${x.delinquent ? `<span class="pill bad">${esc(t('tag.tax_delinquent'))}</span>` : '<span class="pill ok">OK</span>'}</td></tr>`).join('')}</table>` : `<p class="muted" style="margin:0">${esc(t('d.none'))}</p>`}
    </div>

    <div class="sec"><h4>${esc(t('d.liens'))}</h4>
      ${(p.liens || []).length ? `<table class="mini"><tr><th>Type</th><th>Holder</th><th class="num">Amount</th><th>Recorded</th></tr>${p.liens.map(l => `<tr><td><span class="pill">${esc(l.type)}</span></td><td>${esc(l.holder || '')}</td><td class="num">${money(l.amount)}</td><td class="mono" style="font-size:11.5px">${esc(date(l.recorded))}</td></tr>`).join('')}</table>` : `<p class="muted" style="margin:0">${esc(t('d.none'))}</p>`}
      <form class="inline-form" data-lf style="margin-top:10px"><select name="type" class="inp" style="flex:0 0 120px"><option value="mortgage">mortgage</option><option value="heloc">HELOC</option><option value="judgment">judgment</option><option value="hoa">HOA</option><option value="mechanic">mechanic</option><option value="irs">IRS</option><option value="child_support">child support</option><option value="other">other</option></select><input name="holder" placeholder="${esc(t('l.holder'))}" /><input name="amount" type="number" step="any" placeholder="${esc(t('l.amount'))}" style="flex:0 0 110px" /><input name="recorded" type="date" style="flex:0 0 140px" /><button class="btn sm">${esc(t('l.add'))}</button></form>
    </div>

    <div class="sec"><h4>${esc(t('d.why'))} · ${p._score}/100</h4><div class="why">${why}</div></div>

    <div class="sec"><h4>${esc(t('d.tasks'))}</h4>
      ${(p.tasks || []).map(x => `<label class="task ${x.done ? 'done' : ''}"><input type="checkbox" data-task="${esc(x.id)}" ${x.done ? 'checked' : ''}/> <span>${esc(x.title)}</span> <small class="dim mono">${esc(x.due ? date(x.due) : '')}</small></label>`).join('')}
      <form class="inline-form" data-taskf><input name="title" placeholder="${esc(t('d.task_ph'))}" required /><input name="due" type="date" style="flex:0 0 150px" /><button class="btn sm">${esc(t('d.add'))}</button></form>
    </div>

    <div class="sec"><h4>${esc(t('d.notes'))}</h4><textarea class="notes" data-notes>${esc(p.notes || '')}</textarea></div>

    <div class="sec"><h4>${esc(t('d.activity'))}</h4>
      <form class="inline-form" data-actf style="margin:0 0 12px"><select name="kind" style="height:34px;border-radius:8px;border:1px solid var(--line);background:var(--ink-2);padding:0 8px"><option value="call">Call</option><option value="text">Text</option><option value="email">Email</option><option value="visit">Visit</option><option value="note">Note</option></select><input name="body" placeholder="${esc(t('d.note_ph'))}" required /><button class="btn sm">${esc(t('d.add'))}</button></form>
      <div class="log">${(p.activities || []).map(a => `<div class="log-item"><i></i><div><b style="font-weight:600">${esc(a.kind)}</b> · ${esc(a.body || '')}<small>${esc(new Date(a.at).toLocaleString())}${a.by ? ' · ' + esc(a.by) : ''}</small></div></div>`).join('')}</div>
    </div>
  </div>`

  $('.dr-body', dr).scrollTop = keepScroll
  $('[data-x]', dr).onclick = closeDrawer
  $('[data-skip]', dr).onclick = () => skipTrace([p.id])
  $('[data-list]', dr).onclick = () => pickList([p.id])
  dr.querySelectorAll('[data-st]').forEach(b => b.onclick = async () => { const st = b.dataset.st; await S.updateParcel(p.id, { status: st }); await S.addActivity(p.id, 'status', `Status: ${t('st.' + st)}`) })
  dr.querySelectorAll('[data-task]').forEach(c => c.onchange = () => S.toggleTask(p.id, c.dataset.task))
  $('[data-taskf]', dr).onsubmit = e => { e.preventDefault(); const fd = new FormData(e.target); S.addTask(p.id, fd.get('title'), fd.get('due')) }
  $('[data-actf]', dr).onsubmit = e => { e.preventDefault(); const fd = new FormData(e.target); S.addActivity(p.id, fd.get('kind'), fd.get('body')) }
  dr.querySelectorAll('[data-dnc]').forEach(b => b.onclick = async () => { await DNC.addManual(b.dataset.dnc); await S.setContactFlag(p.id, b.dataset.dnc, { dnc: true }); await S.addActivity(p.id, 'dnc', `DNC: ${b.dataset.dnc}`) })
  $('[data-cf]', dr).onsubmit = async e => {
    e.preventDefault(); const fd = new FormData(e.target); const v = String(fd.get('value')).trim(); const src = String(fd.get('source') || 'manual').trim() || 'manual'
    const isMail = /@/.test(v); const val = isMail ? v : v.replace(/[^\d+()\- ]/g, '')
    await S.addContacts(p.id, [{ kind: isMail ? 'email' : 'phone', value: val, provider: src, foundAt: new Date().toISOString().slice(0, 10), dnc: !isMail && DNC.isDnc(val) }])
    await S.addActivity(p.id, 'contact', `${isMail ? 'Email' : 'Phone'} ${val} (${src})`)
  }
  $('[data-lf]', dr).onsubmit = async e => { e.preventDefault(); const fd = new FormData(e.target); await S.addLien(p.id, { type: fd.get('type'), holder: fd.get('holder'), amount: +fd.get('amount') || 0, recorded: fd.get('recorded') || null }) }
  $('[data-epm]', dr).onclick = async () => { const patch = await EP.patchForAsync(p).catch(() => null); if (!patch) return toast(t('d.epcad_nomatch')); S.applyEnrichment(p.id, patch); S.addActivity(p.id, 'epcad', `EPCAD ${patch.epcadId}`); toast('EPCAD ✓') }
  dr.querySelectorAll('[data-rl]').forEach(a => a.addEventListener('click', () => S.addActivity(p.id, 'research', a.dataset.rl)))
  const notes = $('[data-notes]', dr)
  notes.onchange = () => { S.updateParcel(p.id, { notes: notes.value }); toast(t('toast.saved')) }
}
