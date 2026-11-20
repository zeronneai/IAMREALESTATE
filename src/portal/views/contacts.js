// Contacts: buyers, sellers, renters, investors and agents (the HighLevel contact list and its pipelines).
import { t, getLang } from '../i18n.js'
import * as S from '../store.js'
import { esc, money, toast, modal, icon } from '../ui.js'
import { parseGhlContacts, parseGhlPipelines, applyStages } from '../parse/ghl.js'
import { startPeerConversation } from './inbox.js'
import { apptModal } from './calendar.js'

const KINDS = ['buyer', 'seller', 'renter', 'investor', 'agent', 'other']
// Same stages I AM uses in HighLevel today.
export const STAGES = {
  buyer: ['New Buyer Lead', 'Fact Finding', 'Actively Looking', 'Under Contract', 'Closed', 'Not Ready Yet', 'Cold Lead', 'Dead Lead'],
  seller: ['New Seller Lead', 'Fact Finding', 'Deal Structuring', 'Offer Sent', 'Under Contract', 'Closed', 'Not Ready Yet'],
  renter: ['New Renter Lead', 'Pre-Screening', 'Showing Scheduled', 'Lease Signing Scheduled', 'Closed'],
  investor: [], agent: [], other: [],
}
const PAGE = 100
let kind = 'all', stage = '', q = '', page = 0, err = ''
const fmtPhone = s => { const d = String(s || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : s || '' }
const ago = iso => { if (!iso) return ''; const d = Math.round((Date.now() - new Date(iso)) / 864e5); return d <= 0 ? t('ppl.today') : d < 60 ? `${d} ${t('ppl.days')}` : new Date(iso).toLocaleDateString(getLang() === 'es' ? 'es-MX' : 'en-US', { month: 'short', year: 'numeric' }) }

export function contactsView(el) {
  if (S.MODE !== 'demo' && !el.dataset.loaded) {
    el.dataset.loaded = '1'; el.innerHTML = `<div class="card"><p class="muted">${esc(t('ppl.loading'))}</p></div>`
    S.loadPeople().then(() => { err = ''; paint(el) }).catch(e => { err = e.message; paint(el) })
    return
  }
  paint(el)
}

function paint(el) {
  const all = S.people()
  const ofKind = kind === 'all' ? all : all.filter(p => p.kind === kind)
  const stages = kind === 'all' ? [] : [...new Set([...(STAGES[kind] || []), ...ofKind.map(p => p.stage).filter(Boolean)])]
  const needle = q.trim().toLowerCase(), digits = needle.replace(/\D/g, '')
  const list = ofKind.filter(p => (!stage || p.stage === stage) && (!needle || `${p.name} ${p.email} ${p.business} ${p.tags.join(' ')}`.toLowerCase().includes(needle) || (digits.length >= 3 && p.phone.replace(/\D/g, '').includes(digits))))
  const pages = Math.max(1, Math.ceil(list.length / PAGE)); if (page >= pages) page = pages - 1
  const shown = list.slice(page * PAGE, page * PAGE + PAGE)
  const n = k => (k === 'all' ? all.length : all.filter(p => p.kind === k).length)
  el.innerHTML = `
  ${err ? `<div class="alert bad fade-in">${esc(err)}</div>` : ''}
  <div class="pf-month fade-in"><div class="seg-mini">${['all', ...KINDS].map(k => `<button data-kind="${k}" class="${kind === k ? 'on' : ''}">${esc(t('ppl.k_' + k))} <small class="dim">${n(k).toLocaleString()}</small></button>`).join('')}</div>
    <span class="sp"></span><button class="btn sm ghost" data-imp>${icon('upload')}${esc(t('ppl.import'))}</button><button class="btn sm gold" data-new>${icon('plus')}${esc(t('ppl.new'))}</button></div>
  ${stages.length ? `<div class="ppl-stages fade-in"><button class="chip ${!stage ? 'on' : ''}" data-st="">${esc(t('ppl.all_stages'))} · ${ofKind.length}</button>${stages.map(s => `<button class="chip ${stage === s ? 'on' : ''}" data-st="${esc(s)}">${esc(s)} · ${ofKind.filter(p => p.stage === s).length}</button>`).join('')}</div>` : ''}
  <div class="card fade-in" style="padding:0">
    <div class="ppl-bar"><input type="search" data-q placeholder="${esc(t('ppl.search'))}" value="${esc(q)}"><small class="muted">${list.length.toLocaleString()} ${esc(t('ppl.people'))}</small></div>
    <div class="tbl-wrap"><table class="seq-tbl"><thead><tr><th>${esc(t('ppl.name'))}</th><th>${esc(t('ppl.phone'))}</th><th>${esc(t('ppl.email'))}</th><th>${esc(t('ppl.type'))}</th><th>${esc(t('ppl.stage'))}</th><th>${esc(t('ppl.tags'))}</th><th>${esc(t('ppl.last'))}</th></tr></thead><tbody>
    ${shown.map(p => `<tr data-id="${esc(p.id)}" style="cursor:pointer"><td><b>${esc(p.name || fmtPhone(p.phone) || p.email)}</b>${p.business ? `<small class="dim" style="display:block">${esc(p.business)}</small>` : ''}</td><td>${esc(fmtPhone(p.phone))}${p.dnd ? ' <span class="pill bad">DND</span>' : ''}</td><td><small>${esc(p.email)}</small></td><td>${esc(t('ppl.k1_' + p.kind))}</td><td>${p.stage ? `<span class="pill">${esc(p.stage)}</span>` : ''}${p.value ? ` <small class="dim">${money(p.value)}</small>` : ''}</td><td><small class="dim">${esc(p.tags.slice(0, 3).join(', '))}</small></td><td><small class="dim">${esc(ago(p.lastActivity))}</small></td></tr>`).join('') || `<tr><td colspan="7" class="muted" style="padding:20px">${esc(all.length ? t('ppl.none_match') : t('ppl.empty'))}</td></tr>`}
    </tbody></table></div>
    ${pages > 1 ? `<div class="ppl-pager"><button class="btn sm ghost" data-pg="-1" ${page ? '' : 'disabled'}>‹</button><small>${page + 1} / ${pages}</small><button class="btn sm ghost" data-pg="1" ${page < pages - 1 ? '' : 'disabled'}>›</button></div>` : ''}
  </div>`
  el.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => { kind = b.dataset.kind; stage = ''; page = 0; paint(el) })
  el.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { stage = b.dataset.st; page = 0; paint(el) })
  el.querySelectorAll('[data-pg]').forEach(b => b.onclick = () => { page += +b.dataset.pg; paint(el) })
  const qi = el.querySelector('[data-q]'); let tm
  qi.oninput = () => { clearTimeout(tm); tm = setTimeout(() => { q = qi.value; page = 0; paint(el); const n2 = el.querySelector('[data-q]'); n2.focus(); n2.setSelectionRange(n2.value.length, n2.value.length) }, 250) }
  el.querySelector('[data-new]').onclick = () => personModal(null, () => paint(el))
  el.querySelector('[data-imp]').onclick = () => importModal(() => paint(el))
  el.querySelectorAll('tr[data-id]').forEach(r => r.onclick = () => personModal(S.people().find(p => p.id === r.dataset.id), () => paint(el)))
}

export function personModal(person, done) {
  const p = person ? { ...person } : { first: '', last: '', name: '', phone: '', email: '', business: '', kind: kind === 'all' ? 'buyer' : kind, stage: '', value: '', tags: [], source: 'Portal', notes: '', dnd: false }
  const stageOpts = k => [...new Set([...(STAGES[k] || []), p.stage].filter(Boolean))]
  modal(`<h3>${esc(person ? (p.name || fmtPhone(p.phone)) : t('ppl.new'))}</h3>
    <form class="form-grid" data-f>
      <div class="f"><label>${esc(t('ppl.first'))}</label><input name="first" value="${esc(p.first)}"></div>
      <div class="f"><label>${esc(t('ppl.lastn'))}</label><input name="last" value="${esc(p.last)}"></div>
      <div class="f"><label>${esc(t('ppl.phone'))}</label><input name="phone" value="${esc(fmtPhone(p.phone))}" placeholder="(915) 555-0123"></div>
      <div class="f"><label>${esc(t('ppl.email'))}</label><input name="email" type="email" value="${esc(p.email)}"></div>
      <div class="f"><label>${esc(t('ppl.type'))}</label><select name="kind">${KINDS.map(k => `<option value="${k}" ${p.kind === k ? 'selected' : ''}>${esc(t('ppl.k1_' + k))}</option>`).join('')}</select></div>
      <div class="f"><label>${esc(t('ppl.stage'))}</label><select name="stage"><option value="">n/a</option>${stageOpts(p.kind).map(s => `<option ${p.stage === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
      <div class="f"><label>${esc(t('ppl.business'))}</label><input name="business" value="${esc(p.business)}"></div>
      <div class="f"><label>${esc(t('ppl.value'))}</label><input name="value" type="number" step="1" value="${esc(p.value ?? '')}"></div>
      <div class="f full"><label>${esc(t('ppl.tags'))}</label><input name="tags" value="${esc(p.tags.join(', '))}" placeholder="owner financing, facebook"></div>
      <div class="f full"><label>${esc(t('d.notes'))}</label><textarea name="notes" rows="3">${esc(p.notes)}</textarea></div>
      <label class="chk full"><input type="checkbox" name="dnd" ${p.dnd ? 'checked' : ''}> ${esc(t('ppl.dnd'))}</label>
      <div class="full" style="display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap">
        <span style="display:flex;gap:8px">${person ? `<button type="button" class="btn ghost danger" data-del>${esc(t('org.delete'))}</button>` : ''}${person && p.phone && !p.dnd ? `<button type="button" class="btn ghost" data-text>${icon('inbox')}${esc(t('ppl.text'))}</button>` : ''}${person ? `<button type="button" class="btn ghost" data-appt>${icon('calendar')}${esc(t('cal.book'))}</button>` : ''}${person && p.email ? `<button type="button" class="btn ghost" data-mail>${icon('mail')}${esc(t('ppl.mail'))}</button>` : ''}</span>
        <span style="display:flex;gap:8px"><button type="button" class="btn ghost" data-close>${esc(t('cancel'))}</button><button class="btn gold">${esc(t('org.save'))}</button></span></div>
    </form>`, (box, close) => {
    const f = box.querySelector('[data-f]')
    f.kind.onchange = () => { f.stage.innerHTML = `<option value="">n/a</option>` + stageOpts(f.kind.value).map(s => `<option>${esc(s)}</option>`).join('') }
    box.querySelector('[data-del]')?.addEventListener('click', async () => { await S.deletePerson(p.id); close(); toast(t('org.deleted')); done() })
    box.querySelector('[data-text]')?.addEventListener('click', () => { close(); startPeerConversation(p.phone, 'sms') })
    box.querySelector('[data-appt]')?.addEventListener('click', () => { close(); apptModal(null, done, { personId: p.id, withName: p.name, withPhone: p.phone, title: (p.kind === 'renter' ? 'Rental showing' : p.kind === 'buyer' ? 'Showing' : 'Call') + ' · ' + (p.name || '') , kind: p.kind === 'seller' ? 'call' : 'showing' }) })
    box.querySelector('[data-mail]')?.addEventListener('click', () => { close(); startPeerConversation(p.email, 'email') })
    f.onsubmit = async e => {
      e.preventDefault()
      const v = Object.fromEntries(new FormData(f)), d = String(v.phone || '').replace(/\D/g, '')
      const phone = d.length === 10 ? '+1' + d : d.length === 11 && d[0] === '1' ? '+' + d : d ? '+' + d : ''
      if (!phone && !v.email && !v.first && !v.last) return toast(t('ppl.need'))
      try { await S.savePerson({ ...p, ...v, phone, name: [v.first, v.last].filter(Boolean).join(' ') || p.name, tags: String(v.tags || '').split(',').map(x => x.trim()).filter(Boolean), dnd: !!v.dnd }); close(); toast(t('org.saved')); done() } catch (err2) { toast(err2.message) }
    }
  })
}

function importModal(done) {
  let ppl = null, stages = null
  modal(`<h3>${esc(t('ppl.imp_title'))}</h3><p class="muted" style="margin:0">${esc(t('ppl.imp_lead'))}</p>
    <div class="ppl-two">
      <label class="drop" style="cursor:pointer">${icon('upload')}<div><b>1 · ${esc(t('ppl.imp_contacts'))}</b></div><p data-n1>CSV</p><input type="file" accept=".csv,text/csv" hidden data-f1></label>
      <label class="drop" style="cursor:pointer">${icon('upload')}<div><b>2 · ${esc(t('ppl.imp_opps'))}</b></div><p data-n2>CSV · ${esc(t('ppl.optional'))}</p><input type="file" accept=".csv,text/csv" hidden data-f2></label>
    </div><div data-prev></div>`, (box, close) => {
    const prev = box.querySelector('[data-prev]')
    const show = () => {
      if (!ppl) { prev.innerHTML = ''; return }
      const list = ppl.map(p => ({ ...p }))
      const hit = stages ? applyStages(list, stages) : 0
      const by = {}; for (const p of list) by[p.kind] = (by[p.kind] || 0) + 1
      prev.innerHTML = `<div class="alert">${esc(t('ppl.imp_found'))}: <b>${list.length.toLocaleString()}</b> ${esc(t('ppl.people'))} · ${KINDS.filter(k => by[k]).map(k => `${by[k].toLocaleString()} ${esc(t('ppl.k_' + k))}`).join(' · ')}${stages ? ` · ${hit} ${esc(t('ppl.imp_staged'))}` : ''}</div>
        ${S.MODE === 'demo' && list.length > 3000 ? `<p class="muted">${esc(t('ppl.demo_cap'))}</p>` : ''}
        <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn ghost" data-x>${esc(t('cancel'))}</button><button class="btn gold" data-go>${esc(t('pf.ghl_go'))} (${list.length.toLocaleString()})</button></div>`
      prev.querySelector('[data-x]').onclick = close
      prev.querySelector('[data-go]').onclick = async ev => {
        const b = ev.currentTarget; b.disabled = true
        try { const r = await S.importPeople(list, (n, tot) => { b.textContent = `${n.toLocaleString()} / ${tot.toLocaleString()}` }); close(); toast(`${t('pf.ghl_done')}: ${r.saved.toLocaleString()} ${t('ppl.people')}`); done() } catch (e) { b.disabled = false; b.textContent = t('pf.ghl_go'); toast(e.message) }
      }
    }
    box.querySelector('[data-f1]').onchange = async e => {
      const f = e.target.files[0]; if (!f) return
      const r = parseGhlContacts(await f.text())
      if (r.error) { prev.innerHTML = `<div class="alert bad">${esc(t('ppl.imp_bad'))}</div>`; return }
      ppl = r.people; box.querySelector('[data-n1]').textContent = `${f.name} · ${ppl.length.toLocaleString()}`; show()
    }
    box.querySelector('[data-f2]').onchange = async e => {
      const f = e.target.files[0]; if (!f) return
      const r = parseGhlPipelines(await f.text())
      if (r.error) { prev.innerHTML = `<div class="alert bad">${esc(t('pf.ghl_bad'))}</div>`; return }
      stages = r.stages; box.querySelector('[data-n2]').textContent = `${f.name} · ${stages.length.toLocaleString()}`; show()
    }
  }, { wide: true })
}
