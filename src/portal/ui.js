import { t, getLang } from './i18n.js'
import * as S from './store.js'
import { money, fmtDate } from './score.js'

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
export const $ = (sel, root = document) => root.querySelector(sel)
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]
export { money, fmtDate }
export const date = iso => fmtDate(iso, getLang())

export const ICON = {
  dashboard: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
  foreclosures: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/><path d="M15 7l3-3"/>',
  properties: '<path d="M4 21V8l8-5 8 5v13"/><path d="M9 21v-7h6v7"/>',
  lists: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
  inventory: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/>',
  mortgages: '<path d="M6 3h9l5 5v13H6z"/><path d="M14 3v6h6M9 13h8M9 17h5"/>',
  import: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 20h14"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M5 20h14"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
}
export const icon = (k, cls = '') => `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true">${ICON[k] || ''}</svg>`

export function scoreColor(s) {
  if (s >= 70) return 'linear-gradient(135deg,#f0cf74,#d9a93a)'
  if (s >= 50) return '#c9b27a'
  if (s >= 30) return '#8f8574'
  return '#5f584c'
}
export const scorePill = s => `<span class="score" style="background:${scoreColor(s)}">${s}</span>`
export const statusPill = st => {
  const cls = { new: 'blue', contacted: '', appointment: 'gold', offer: 'gold', under_contract: 'ok', dead: 'bad' }[st] || ''
  return `<span class="pill ${cls}">${esc(t('st.' + st))}</span>`
}
export const tagPill = tg => {
  const cls = { foreclosure: 'bad', tax_delinquent: 'warn', absentee: 'blue', high_equity: 'ok', vacant: '', probate: 'gold' }[tg] || ''
  return `<span class="pill ${cls}">${esc(t('tag.' + tg))}</span>`
}

let toastT
export function toast(msg) {
  let el = $('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.append(el) }
  el.textContent = msg; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2600)
}

export function modal(html, onMount) {
  const m = document.createElement('div'); m.className = 'modal'
  m.innerHTML = `<div class="box fade-in" role="dialog" aria-modal="true">${html}</div>`
  document.body.append(m)
  const close = () => m.remove()
  m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) close() })
  const onKey = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey) } }
  document.addEventListener('keydown', onKey)
  onMount?.(m.firstElementChild, close)
  return close
}

// ---------- selection + batch bar (shared across views) ----------
export const selection = new Set()
const selSubs = new Set()
export const onSel = f => selSubs.add(f)
export const selChanged = () => { selSubs.forEach(f => f()); renderBatch() }
export function renderBatch() {
  let bar = $('.batch')
  if (!bar) {
    bar = document.createElement('div'); bar.className = 'batch'; document.body.append(bar)
    bar.addEventListener('click', e => { const a = e.target.closest('[data-act]')?.dataset.act; if (a) batchAction(a, [...selection]) })
  }
  bar.innerHTML = `<span class="n">${selection.size} ${esc(t('sel.n'))}</span>
    <button class="btn dark" data-act="list">${esc(t('sel.add'))}</button>
    <button class="btn" data-act="skip">${esc(t('sel.skip'))}</button>
    <button class="btn" data-act="export">${esc(t('sel.export'))}</button>
    <button class="btn" data-act="crm">${esc(t('sel.crm'))}</button>
    <button class="btn" data-act="copy">${esc(t('sel.copy'))}</button>
    <button class="btn" data-act="clear">${esc(t('sel.clear'))}</button>`
  bar.classList.toggle('show', selection.size > 0)
}

const portalKey = () => { try { const k = localStorage.getItem('iam_portal_key'); return k ? { 'x-portal-key': k } : {} } catch { return {} } }
export async function api(path, payload) {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', ...S.authHeader(), ...portalKey() }, body: JSON.stringify(payload || {}) })
  let j = {}; try { j = await r.json() } catch {}
  return { status: r.status, ok: r.ok, data: j }
}

export async function batchAction(act, ids) {
  if (!ids.length) return
  if (act === 'clear') { selection.clear(); return selChanged() }
  if (act === 'list') return pickList(ids)
  if (act === 'export') return exportCSV(ids, 'generic')
  if (act === 'copy') return copyRows(ids)
  if (act === 'skip') return skipTrace(ids)
  if (act === 'crm') return pushCRM(ids)
}

export function pickList(ids) {
  modal(`<h3>${esc(t('sel.add'))}</h3><p class="muted" style="margin:0">${ids.length} ${esc(t('sel.n'))}. ${esc(t('lists.pick'))}</p>
    <div>${S.lists().map(l => `<button class="list-item" data-l="${esc(l.id)}"><b>${esc(l.name)}</b><span>${l.ids.length} ${esc(t('lists.items'))}</span></button>`).join('')}</div>
    <div class="inline-form"><input id="nl" placeholder="${esc(t('lists.name_ph'))}" /><button class="btn gold" id="nlb">${esc(t('lists.new'))}</button></div>
    <div style="text-align:right"><button class="btn ghost" data-close>${esc(t('d.close'))}</button></div>`, (box, close) => {
    box.addEventListener('click', async e => {
      const l = e.target.closest('[data-l]')
      if (l) { await S.addToList(l.dataset.l, ids); toast(t('toast.added')); close() }
    })
    $('#nlb', box).onclick = async () => {
      const name = $('#nl', box).value.trim() || `List ${new Date().toLocaleDateString()}`
      await S.createList(name, ids); toast(t('toast.added')); close()
    }
  })
}

// ---------- CSV ----------
const csvCell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
export const toCSV = rows => rows.map(r => r.map(csvCell).join(',')).join('\n')
export function download(name, text, type = 'text/csv') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
const split = n => { const p = String(n || '').trim().split(/\s+/); return [p[0] || '', p.slice(1).join(' ')] }
export function exportCSV(ids, fmt) {
  const ps = ids.map(S.parcel).filter(Boolean)
  let rows
  if (fmt === 'reiskip') {
    rows = [['First Name', 'Last Name', 'Property Address', 'Property City', 'Property State', 'Property Zip', 'Mailing Address', 'Mailing City', 'Mailing State', 'Mailing Zip']]
    ps.forEach(p => { const o = p.owners?.[0] || {}; const [f, l] = split(o.name); rows.push([f, l, p.address, p.city, p.state, p.zip, o.mailing || p.address, o.mailingCity || p.city, o.mailingState || p.state, o.mailingZip || p.zip]) })
  } else if (fmt === 'ghl') {
    rows = [['First Name', 'Last Name', 'Phone', 'Email', 'Address1', 'City', 'State', 'Postal Code', 'Tags', 'Source', 'Lead Score', 'Sale Date', 'Est Equity']]
    ps.forEach(p => { const o = p.owners?.[0] || {}; const [f, l] = split(o.name); const ph = (p.contacts || []).find(c => c.kind === 'phone' && !c.dnc); const em = (p.contacts || []).find(c => c.kind === 'email'); rows.push([f, l, ph?.value || '', em?.value || '', p.address, p.city, p.state, p.zip, (p.tags || []).join(','), 'IAM Portal', p._score, p.foreclosure?.saleDate || '', Math.round(p._d.equity)]) })
  } else {
    rows = [['Address', 'City', 'State', 'ZIP', 'Owner(s)', 'Mailing address', 'Absentee', 'Phones', 'Emails', 'Sale date', 'Lender', 'Trustees', 'Original loan', 'Est. value', 'Est. balance', 'Est. equity', 'Equity %', 'Taxes due', 'Liens', 'Years owned', 'Year built', 'Sqft', 'Beds', 'Baths', 'Lists', 'Status', 'Score', 'Demo']]
    ps.forEach(p => { const o = p.owners?.[0] || {}; const f = p.foreclosure || {}; rows.push([p.address, p.city, p.state, p.zip, (p.owners || []).map(x => x.name).join(' & '), [o.mailing, o.mailingCity, o.mailingState, o.mailingZip].filter(Boolean).join(' '), p._d.absentee ? 'Y' : 'N', (p.contacts || []).filter(c => c.kind === 'phone').map(c => c.value + (c.dnc ? ' (DNC)' : '')).join(' | '), (p.contacts || []).filter(c => c.kind === 'email').map(c => c.value).join(' | '), f.saleDate || '', f.mortgagee || '', (f.trustees || []).join(' | '), f.originalLoan || '', p.marketValue, Math.round(p._d.mortgageBal), Math.round(p._d.equity), p._d.equityPct, Math.round(p._d.taxDue), (p.liens || []).map(l => `${l.type}:${l.amount}`).join(' | '), p._d.yearsOwned ?? '', p.yearBuilt || '', p.sqft || '', p.beds || '', p.baths || '', (p.tags || []).join(' '), p.status, p._score, p.demo ? 'Y' : 'N']) })
  }
  download(`iam-leads-${fmt}-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows))
}
async function copyRows(ids) {
  const text = ids.map(S.parcel).filter(Boolean).map(p => [p.owners?.[0]?.name || '', `${p.address}, ${p.city} ${p.zip}`, (p.contacts || []).filter(c => c.kind === 'phone').map(c => c.value).join(' / '), p.foreclosure?.saleDate || '', money(p._d.equity)].join('\t')).join('\n')
  try { await navigator.clipboard.writeText(text); toast(t('toast.copied')) } catch { download('iam-leads.tsv', text, 'text/tab-separated-values') }
}

const FAKE_SUFFIX = () => String(Math.floor(Math.random() * 100)).padStart(2, '0')
export async function skipTrace(ids) {
  const ps = ids.map(S.parcel).filter(Boolean)
  const res = await api('/api/skiptrace', { records: ps.map(p => ({ id: p.id, owner: p.owners?.[0]?.name || '', address: p.address, city: p.city, state: p.state, zip: p.zip })) }).catch(() => ({ status: 0 }))
  if (res.ok && Array.isArray(res.data.results)) {
    for (const r of res.data.results) {
      const contacts = [...(r.phones || []).map(ph => ({ kind: 'phone', value: ph.number, phoneType: ph.type, dnc: !!ph.dnc, litigator: !!ph.litigator, confidence: ph.score, provider: res.data.provider })), ...(r.emails || []).map(em => ({ kind: 'email', value: em, provider: res.data.provider }))]
      await S.addContacts(r.id, contacts)
      await S.addActivity(r.id, 'skiptrace', `Skip trace (${res.data.provider}): ${contacts.length} contacts`)
    }
    return toast(t('toast.skip_ok'))
  }
  if (S.MODE === 'demo' || res.status === 501 || res.status === 404 || res.status === 0) {
    for (const p of ps) {
      const n = Math.random() < 0.8 ? 2 : 1
      const contacts = Array.from({ length: n }, (_, k) => ({ kind: 'phone', value: `(915) 555-01${FAKE_SUFFIX()}`, phoneType: k ? 'landline' : 'mobile', dnc: Math.random() < 0.12, litigator: Math.random() < 0.03, confidence: 60 + Math.floor(Math.random() * 38), provider: 'demo' }))
      contacts.push({ kind: 'email', value: `owner.${p.id.replace(/\W/g, '')}@example.com`, provider: 'demo' })
      await S.addContacts(p.id, contacts)
      await S.addActivity(p.id, 'skiptrace', 'Demo skip trace: fictional contacts')
    }
    return toast(t('toast.skip_demo'))
  }
  toast(t('toast.err'))
}
export async function pushCRM(ids) {
  const ps = ids.map(S.parcel).filter(Boolean)
  const leads = ps.map(p => { const o = p.owners?.[0] || {}; const ph = (p.contacts || []).find(c => c.kind === 'phone' && !c.dnc); return { name: o.name, phone: ph?.value || '', address1: p.address, city: p.city, state: p.state, postalCode: p.zip, tags: p.tags, leadScore: p._score, saleDate: p.foreclosure?.saleDate || '', equity: Math.round(p._d.equity) } })
  const res = await api('/api/crm-push', { leads }).catch(() => ({ status: 0 }))
  if (res.ok) { ps.forEach(p => S.addActivity(p.id, 'crm', 'Sent to GoHighLevel')); return toast(t('toast.crm_ok')) }
  exportCSV(ids, 'ghl'); toast(t('toast.crm_demo'))
}

// ---------- table ----------
export function table({ rows, cols, sort, onSort, onRow, selectable = true }) {
  const allSel = rows.length && rows.every(r => selection.has(r.id))
  const head = `<tr>${selectable ? `<th class="cb"><input type="checkbox" data-all ${allSel ? 'checked' : ''} aria-label="select all" /></th>` : ''}${cols.map(c => `<th class="${c.num ? 'num' : ''}" data-sort="${c.key}">${esc(c.label)}${sort?.key === c.key ? `<span class="ar">${sort.dir > 0 ? '↑' : '↓'}</span>` : ''}</th>`).join('')}</tr>`
  const body = rows.map(r => `<tr data-id="${esc(r.id)}" class="${selection.has(r.id) ? 'sel' : ''}">${selectable ? `<td class="cb"><input type="checkbox" data-cb ${selection.has(r.id) ? 'checked' : ''} aria-label="select" /></td>` : ''}${cols.map(c => `<td class="${c.num ? 'num' : ''} ${c.cls || ''}">${c.render(r)}</td>`).join('')}</tr>`).join('')
  const html = `<div class="tablewrap"><table class="dt"><thead>${head}</thead><tbody>${body || `<tr><td colspan="${cols.length + 1}" class="muted" style="padding:30px;text-align:center">0 ${esc(t('rows'))}</td></tr>`}</tbody></table></div>`
  const bind = root => {
    const tb = $('table.dt', root)
    tb.addEventListener('click', e => {
      const th = e.target.closest('th[data-sort]'); if (th) return onSort?.(th.dataset.sort)
      if (e.target.matches('[data-all]')) { rows.forEach(r => e.target.checked ? selection.add(r.id) : selection.delete(r.id)); $$('tbody tr', tb).forEach(tr => { tr.classList.toggle('sel', e.target.checked); const c = $('[data-cb]', tr); if (c) c.checked = e.target.checked }); return selChanged() }
      const tr = e.target.closest('tr[data-id]'); if (!tr) return
      if (e.target.matches('[data-cb]') || e.target.closest('.cb')) {
        const cb = $('[data-cb]', tr); if (!e.target.matches('[data-cb]')) cb.checked = !cb.checked
        cb.checked ? selection.add(tr.dataset.id) : selection.delete(tr.dataset.id); tr.classList.toggle('sel', cb.checked); return selChanged()
      }
      onRow?.(tr.dataset.id)
    })
  }
  return { html, bind }
}

export function sortRows(rows, sort, getters) {
  if (!sort) return rows
  const g = getters[sort.key] || (r => r[sort.key])
  return [...rows].sort((a, b) => { const x = g(a), y = g(b); return (x == null) - (y == null) || (x > y ? 1 : x < y ? -1 : 0) * sort.dir })
}

// ---------- CSV parsing ----------
export function parseCSV(text) {
  const delim = (text.split('\n')[0].match(/\t/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? '\t' : (text.split('\n')[0].includes('|') && !text.split('\n')[0].includes(',') ? '|' : ',')
  const rows = []; let row = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else q = false } else cell += ch; continue }
    if (ch === '"') q = true
    else if (ch === delim) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(c => c.trim() !== '')) rows.push(row); row = [] }
    else cell += ch
  }
  row.push(cell); if (row.some(c => c.trim() !== '')) rows.push(row)
  const head = (rows.shift() || []).map(h => h.trim())
  return { head, rows: rows.map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()]))) }
}
export const num = v => { if (v == null || v === '') return null; const n = Number(String(v).replace(/[$,\s]/g, '')); return Number.isFinite(n) ? n : null }
export const toIso = v => { if (!v) return null; const s = String(v).trim(); if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10); const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` } const d = new Date(s); return isNaN(d) ? null : d.toISOString().slice(0, 10) }
export const fileToDataURL = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f) })
export function dropzone(el, onFiles, { multiple = true, accept = '' } = {}) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = multiple; inp.accept = accept; inp.hidden = true; el.append(inp)
  el.addEventListener('click', e => { if (e.target !== inp) inp.click() })
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click() } })
  inp.addEventListener('change', () => { if (inp.files.length) onFiles([...inp.files]); inp.value = '' })
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('over') })
  el.addEventListener('dragleave', () => el.classList.remove('over'))
  el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('over'); if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]) })
}
