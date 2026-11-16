// Data layer. Two backends with the same API:
//  - Supabase (production): set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Team signs in with email and password.
//  - Demo (default): fictional seed data kept in this browser (localStorage, wrapped in try/catch).
import { seed } from './seed.js'
import { t } from './i18n.js'
import { score, derive, DEFAULT_WEIGHTS } from './score.js'

const KEY = 'iam_portal_demo_v1'
const SB_URL = import.meta.env.VITE_SUPABASE_URL
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
// ?demo in the URL always forces the sample-data demo (for sales presentations), even when Supabase is configured.
const FORCE_DEMO = (() => { try { return new URLSearchParams(location.search).has('demo') } catch { return false } })()
export const MODE = SB_URL && SB_KEY && !FORCE_DEMO ? 'supabase' : 'demo'

let db = null          // { parcels, inventory, lists, imports, settings }
let sb = null
let session = null
const subs = new Set()
export const onChange = f => { subs.add(f); return () => subs.delete(f) }
const emit = () => subs.forEach(f => f())
const uid = p => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

export const weights = () => ({ ...DEFAULT_WEIGHTS, ...(db?.settings?.weights || {}) })

function enrich(p) {
  const s = score(p, weights())
  p._score = s.score; p._parts = s.parts; p._d = s.d
  const tags = new Set(p.tags || [])
  if (s.d.equityPct >= 40) tags.add('high_equity'); else tags.delete('high_equity')
  if (s.d.absentee) tags.add('absentee')
  if (s.d.taxDue > 0) tags.add('tax_delinquent')
  if (p.foreclosure) tags.add('foreclosure')
  if (p.homestead) tags.add('homestead')
  if (p.over65) tags.add('over65')
  if (p.valueEstimated) tags.add('value_est'); else tags.delete('value_est')
  p.tags = [...tags]
  return p
}
export const rescoreAll = () => { db.parcels.forEach(enrich); persist(); emit() }

function persist() {
  if (MODE !== 'demo') return
  try {
    const clean = { ...db, parcels: db.parcels.map(({ _score, _parts, _d, ...p }) => p) }
    localStorage.setItem(KEY, JSON.stringify(clean))
  } catch { /* storage full or blocked: keep working in memory */ }
}

// ---------- init / auth ----------
export async function init() {
  if (MODE === 'demo') {
    try { const raw = localStorage.getItem(KEY); if (raw) db = JSON.parse(raw) } catch { db = null }
    if (!db || !Array.isArray(db.parcels)) db = seed()
    db.parcels.forEach(enrich)
    persist()
    return { ready: true }
  }
  const { createClient } = await import('@supabase/supabase-js')
  sb = createClient(SB_URL, SB_KEY)
  const { data } = await sb.auth.getSession()
  session = data.session
  sb.auth.onAuthStateChange((_e, s) => { session = s })
  if (!session) return { ready: false, needsLogin: true }
  await loadRole()
  await loadRemote()
  loadMessages().catch(() => {})
  loadSequences().catch(() => {})
  loadVoiceCalls().catch(() => {})
  setInterval(() => { if (!document.hidden) loadMessages().catch(() => {}) }, 30000)
  return { ready: true }
}
export const client = () => sb
export const authHeader = () => (session ? { Authorization: `Bearer ${session.access_token}` } : {})
export async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email: String(email).trim(), password })
  if (error) throw error
  session = data.session
}
export async function changePassword(password) {
  if (MODE === 'demo') return
  const { error } = await sb.auth.updateUser({ password })
  if (error) throw error
}
export async function signOut(stay = false) { if (sb) await sb.auth.signOut(); session = null; if (!stay) location.reload() }
// Role of the signed in user: admin / agent / viewer. Demo acts as admin.
let myRole = MODE === 'demo' ? 'admin' : null
export const role = () => myRole
let myOrg = MODE === 'demo' ? 'I AM Real Estate' : null, platform = MODE === 'demo', myOrgId = null
export const orgName = () => myOrg
let myBrand = {}
export const brand = () => (MODE === 'demo' ? (db.settings.demoBrand || {}) : myBrand)
export async function saveBrand(b) {
  const clean = { logo: b.logo || null, color: b.color || null, website: b.website || null }
  if (MODE === 'demo') { db.settings.demoBrand = clean; persist(); emit(); return }
  const { error } = await sb.rpc('set_brand', { p_logo: clean.logo, p_color: clean.color, p_website: clean.website })
  if (error) throw new Error(/function|schema/i.test(error.message) ? t('brand.e_sql') : t('team.e_error'))
  myBrand = clean; emit()
}
export async function brandFromSite(url) {
  if (MODE === 'demo') throw new Error(t('brand.e_demo'))
  const r = await fetch('/api/brand?url=' + encodeURIComponent(url), { headers: authHeader() })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(t('brand.e_site'))
  return j
}
export const isPlatform = () => platform
export const isAdmin = () => myRole === 'admin'
// Technical tools only for admins who open the portal with ?advanced (or #advanced).
const ADV = 'iam_adv'
export function advanced() {
  if (!isAdmin()) return false
  try {
    if (/[?&]advanced\b/.test(location.search) || /[?&]advanced\b/.test(location.hash)) sessionStorage.setItem(ADV, '1')
    return sessionStorage.getItem(ADV) === '1'
  } catch { return /advanced/.test(location.search + location.hash) }
}
export function leaveAdvanced() { try { sessionStorage.removeItem(ADV) } catch {} }

// ---------- team (admins) ----------
// Production: /api/admin/users (service role stays on the server). Demo: a local mock list.
async function adminApi(method, payload, query = '') {
  const r = await fetch('/api/admin/users' + query, { method, headers: { 'Content-Type': 'application/json', ...authHeader() }, body: payload ? JSON.stringify(payload) : undefined })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) { const k = 'team.e_' + (j.code || 'error'); throw new Error(t(k) !== k ? t(k) : t('team.e_error')) }
  return j
}
const demoTeam = () => {
  if (!db.settings.demoTeam) db.settings.demoTeam = [
    { id: 'u-1', name: 'Nadim', email: 'nadim@iamrealestate.co', role: 'admin', created_at: '2026-10-02T15:00:00Z' },
    { id: 'u-2', name: 'Andrea Ruiz', email: 'andrea@iamrealestate.co', role: 'agent', created_at: '2026-10-20T15:00:00Z' },
    { id: 'u-3', name: 'Luis Ortega', email: 'luis@iamrealestate.co', role: 'viewer', created_at: '2026-11-04T15:00:00Z' },
  ]
  return db.settings.demoTeam
}
export async function teamList() {
  if (MODE === 'demo') return demoTeam().map(m => ({ ...m }))
  return (await adminApi('GET')).members || []
}
export async function teamCreate(m) {
  if (MODE === 'demo') { demoTeam().push({ id: uid('u'), name: m.name, email: m.email, role: m.role, created_at: new Date().toISOString() }); persist(); return }
  await adminApi('POST', m)
}
export async function teamUpdate(id, patch) {
  if (MODE === 'demo') { const m = demoTeam().find(x => x.id === id); if (m && patch.role) m.role = patch.role; persist(); return }
  await adminApi('PATCH', { id, ...patch })
}
export async function teamRemove(id) {
  if (MODE === 'demo') { db.settings.demoTeam = demoTeam().filter(x => x.id !== id); persist(); return }
  await adminApi('DELETE', { id })
}
// ---------- companies (platform owner) ----------
async function orgApi(method, payload) {
  const r = await fetch('/api/admin/orgs', { method, headers: { 'Content-Type': 'application/json', ...authHeader() }, body: payload ? JSON.stringify(payload) : undefined })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) { const k = 'org.e_' + (j.code || 'error'); throw new Error(t(k) !== k ? t(k) : (t('team.e_' + (j.code || 'error')) !== 'team.e_' + (j.code || 'error') ? t('team.e_' + j.code) : t('team.e_error'))) }
  return j
}
const demoOrgs = () => {
  if (!db.settings.demoOrgs) db.settings.demoOrgs = [
    { id: 'o-1', name: 'I AM Real Estate', active: true, members: 3, properties: 42, current: true, created_at: '2026-10-02T15:00:00Z' },
    { id: 'o-2', name: 'Sun City Home Buyers', active: true, members: 2, properties: 0, current: false, created_at: '2026-11-15T15:00:00Z' },
  ]
  return db.settings.demoOrgs
}
export async function orgList() { return MODE === 'demo' ? demoOrgs().map(o => ({ ...o })) : (await orgApi('GET')).orgs || [] }
export async function orgCreate(o) {
  if (MODE === 'demo') { demoOrgs().push({ id: uid('o'), name: o.name, active: true, members: 1, properties: 0, current: false, created_at: new Date().toISOString() }); persist(); return }
  await orgApi('POST', o)
}
export async function orgEnter(id) {
  if (MODE === 'demo') { demoOrgs().forEach(o => { o.current = o.id === id }); persist(); return }
  await orgApi('POST', { action: 'enter', id }); location.reload()
}
export async function orgUpdate(id, patch) {
  if (MODE === 'demo') { const o = demoOrgs().find(x => x.id === id); if (o) Object.assign(o, patch); persist(); return }
  await orgApi('PATCH', { id, ...patch })
}
export async function orgRemove(id, confirm) {
  if (MODE === 'demo') { db.settings.demoOrgs = demoOrgs().filter(x => x.id !== id); persist(); return }
  await orgApi('DELETE', { id, confirm })
}
export const myId = () => session?.user?.id || (MODE === 'demo' ? 'u-1' : null)
async function loadRole() {
  try {
    // First run: the API makes the first signed in user admin when the team is empty.
    const r = await fetch('/api/admin/users?me=1', { headers: authHeader() })
    if (r.ok) { const j = await r.json(); myRole = j.role || null; myOrg = j.org || null; myOrgId = j.orgId || null; platform = !!j.platform; myBrand = j.brand || {}; return }
  } catch {}
  try {
    const { data } = await sb.from('team_members').select('role').eq('user_id', session.user.id).maybeSingle()
    myRole = data?.role || null
  } catch { myRole = null }
}
export const userEmail = () => session?.user?.email || (MODE === 'demo' ? 'demo@iam.portal' : '')

export function resetDemo() { try { localStorage.removeItem(KEY) } catch {} db = seed(); db.parcels.forEach(enrich); persist(); emit() }

// ---------- reads ----------
export const parcels = () => db.parcels
export const parcel = id => db.parcels.find(p => p.id === id)
export const inventory = () => db.inventory
export const lists = () => db.lists
export const imports = () => db.imports
export const settings = () => db.settings

// ---------- writes ----------
export async function updateParcel(id, patch) {
  const p = parcel(id); if (!p) return
  Object.assign(p, patch); enrich(p)
  if (sb) await sbUpdateParcel(p, patch)
  persist(); emit()
}
export async function addActivity(id, kind, body) {
  const p = parcel(id); if (!p) return
  const a = { id: uid('a'), kind, body, at: new Date().toISOString(), by: userEmail() }
  p.activities = [a, ...(p.activities || [])]
  if (sb) await sb.from('activities').insert({ parcel_id: id, kind, body })
  persist(); emit()
}
export async function addTask(id, title, due) {
  const p = parcel(id); if (!p) return
  const tk = { id: uid('t'), title, due: due || null, done: false }
  p.tasks = [...(p.tasks || []), tk]
  if (sb) { const { data } = await sb.from('tasks').insert({ parcel_id: id, title, due_on: due || null }).select('id').single(); if (data) tk.id = data.id }
  persist(); emit()
}
export async function toggleTask(id, taskId) {
  const p = parcel(id); const tk = p?.tasks?.find(x => x.id === taskId); if (!tk) return
  tk.done = !tk.done
  if (sb) await sb.from('tasks').update({ done: tk.done }).eq('id', taskId)
  persist(); emit()
}
export async function addContacts(id, contacts) {
  const p = parcel(id); if (!p) return
  const have = new Set((p.contacts || []).map(c => c.value))
  const fresh = contacts.filter(c => !have.has(c.value))
  p.contacts = [...(p.contacts || []), ...fresh]
  if (sb && fresh.length) await sb.from('contacts').insert(fresh.map(c => ({ parcel_id: id, kind: c.kind, value: c.value, phone_type: c.phoneType, dnc: c.dnc, litigator: c.litigator, confidence: c.confidence, provider: c.provider })))
  persist(); emit()
}

export async function createList(name, ids = []) {
  const l = { id: uid('list'), name, desc: '', ids: [...new Set(ids)], createdAt: new Date().toISOString() }
  if (sb) {
    const { data } = await sb.from('lists').insert({ name }).select('id').single()
    if (data) l.id = data.id
    if (ids.length) await sb.from('list_items').insert(l.ids.map(parcel_id => ({ list_id: l.id, parcel_id })))
  }
  db.lists.unshift(l); persist(); emit(); return l
}
export async function addToList(listId, ids) {
  const l = db.lists.find(x => x.id === listId); if (!l) return
  const add = ids.filter(id => !l.ids.includes(id))
  l.ids.push(...add)
  if (sb && add.length) await sb.from('list_items').upsert(add.map(parcel_id => ({ list_id: listId, parcel_id })))
  persist(); emit()
}
export async function removeFromList(listId, id) {
  const l = db.lists.find(x => x.id === listId); if (!l) return
  l.ids = l.ids.filter(x => x !== id)
  if (sb) await sb.from('list_items').delete().eq('list_id', listId).eq('parcel_id', id)
  persist(); emit()
}
export async function deleteList(listId) {
  db.lists = db.lists.filter(x => x.id !== listId)
  if (sb) await sb.from('lists').delete().eq('id', listId)
  persist(); emit()
}
// Dedupe: same normalized address appearing twice in parcels collapses into the richer record.
export function dedupeIds(ids) {
  const seen = new Map()
  for (const id of ids) {
    const p = parcel(id); if (!p) continue
    const k = normAddr(p.address) + '|' + (p.zip || '')
    if (!seen.has(k)) seen.set(k, id)
  }
  return [...seen.values()]
}
export const normAddr = s => String(s || '').toUpperCase().replace(/[.,#]/g, '').replace(/\s+/g, ' ')
  .replace(/\bSTREET\b/g, 'ST').replace(/\bAVENUE\b/g, 'AVE').replace(/\bDRIVE\b/g, 'DR').replace(/\bROAD\b/g, 'RD').replace(/\bBOULEVARD\b/g, 'BLVD').trim()

export async function saveInventory(item) {
  const i = db.inventory.findIndex(x => x.id === item.id)
  if (!item.id) item.id = uid('inv')
  if (i >= 0) db.inventory[i] = item; else db.inventory.unshift(item)
  if (sb) {
    const row = { address: item.address, zip: item.zip, status: item.status, acquired_on: item.acquiredOn || null, purchase_price: item.purchasePrice, rehab_budget: item.rehabBudget, rehab_actual: item.rehabActual, arv: item.arv, list_price: item.listPrice || null, sold_price: item.soldPrice || null, sold_on: item.soldOn || null, tenant_name: item.tenant || null, monthly_rent: item.rent || null, holding_cost_month: item.holdingMonth || null, notes: item.notes || null, ...(item.listing ? { listing: item.listing } : {}), ...(isUuid(item.parcelId) ? { parcel_id: item.parcelId } : {}) }
    if (isUuid(item.id)) await sb.from('inventory').update(row).eq('id', item.id)
    else { const { data } = await sb.from('inventory').insert(row).select('id').single(); if (data) item.id = data.id }
  }
  persist(); emit(); return item
}
export async function addStatement(invId, st) {
  const v = db.inventory.find(x => x.id === invId); if (!v) return
  st.id = uid('st')
  v.statements = [...(v.statements || []), st].sort((a, b) => (a.statementDate || '').localeCompare(b.statementDate || ''))
  if (!v.mortgage && (st.lender || st.payment)) v.mortgage = { lender: st.lender, last4: st.last4, rate: st.rate, payment: st.payment, escrow: st.escrow, dueDay: st.dueDate ? +st.dueDate.slice(8, 10) : 1 }
  if (sb) await sb.from('statements').insert({ inventory_id: invId, statement_date: st.statementDate || null, payment_due_date: st.dueDate || null, amount_due: st.amountDue, principal_balance: st.balance, interest_rate: st.rate, escrow: st.escrow, late_fee: st.lateFee, past_due_amount: st.pastDue, paid: !!st.paid, file_path: st.filePath || null, extracted: st.extracted || null })
  persist(); emit()
}
export async function markPaid(invId, stId) {
  const v = db.inventory.find(x => x.id === invId); const st = v?.statements?.find(s => s.id === stId); if (!st) return
  st.paid = true
  if (sb && isUuid(stId)) await sb.from('statements').update({ paid: true }).eq('id', stId)
  persist(); emit()
}

// Import parcels (from notices, CSV lists). Returns { added, updated }.
export async function importParcels(rows, { tag, source }) {
  let added = 0, updated = 0
  const byAddr = new Map(db.parcels.map(p => [normAddr(p.address) + '|' + (p.zip || ''), p]))
  for (const row of rows) {
    const k = normAddr(row.address) + '|' + (row.zip || '')
    const ex = byAddr.get(k) || (row.zip ? null : db.parcels.find(p => normAddr(p.address) === normAddr(row.address)))
    if (ex) {
      for (const f of ['marketValue', 'yearBuilt', 'sqft', 'beds', 'baths', 'lastDeedDate', 'legal', 'epcadId', 'lot']) if (row[f] != null && row[f] !== '') ex[f] = row[f]
      if (row.owners?.length && !ex.owners?.length) ex.owners = row.owners
      if (row.foreclosure) ex.foreclosure = { ...(ex.foreclosure || {}), ...row.foreclosure }
      if (row.contacts?.length) { const have = new Set((ex.contacts || []).map(c => c.value)); ex.contacts = [...(ex.contacts || []), ...row.contacts.filter(c => !have.has(c.value))] }
      if (tag) ex.tags = [...new Set([...(ex.tags || []), tag])]
      enrich(ex); updated++
      if (sb) await sbUpsertParcel(ex)
      continue
    }
    const p = enrich({
      id: uid('p'), source, status: 'new', city: 'El Paso', state: 'TX', owners: [], contacts: [], liens: [], taxes: [], activities: [], tasks: [], tags: tag ? [tag] : [],
      ...row,
    })
    p.activities = [{ id: uid('a'), kind: 'import', body: `Imported from ${source}`, at: new Date().toISOString(), by: userEmail() }]
    db.parcels.unshift(p); byAddr.set(k, p); added++
    if (sb) await sbUpsertParcel(p)
  }
  return { added, updated }
}
// Enrich existing parcels from an EPCAD export (match by property id or address). No new parcels created.
export function enrichFromEpcad(rows) {
  let updated = 0
  const byId = new Map(db.parcels.filter(p => p.epcadId).map(p => [String(p.epcadId), p]))
  const byAddr = new Map(db.parcels.map(p => [normAddr(p.address), p]))
  for (const r of rows) {
    const p = (r.epcadId && byId.get(String(r.epcadId))) || byAddr.get(normAddr(r.address))
    if (!p) continue
    for (const f of ['marketValue', 'yearBuilt', 'sqft', 'lastDeedDate', 'legal', 'epcadId', 'lot']) if (r[f] != null && r[f] !== '' && !Number.isNaN(r[f])) p[f] = r[f]
    if (r.ownerName && !(p.owners || []).length) p.owners = [{ name: r.ownerName, mailing: r.mailing || '', mailingCity: r.mailingCity || '', mailingState: r.mailingState || '', mailingZip: r.mailingZip || '', absentee: !!(r.mailingZip && r.mailingZip !== p.zip) }]
    enrich(p); updated++
    if (sb) sbUpsertParcel(p)
  }
  persist(); emit()
  return { updated }
}

// ---------- phase 2 helpers ----------
export async function addLien(id, lien) {
  const p = parcel(id); if (!p) return
  p.liens = [...(p.liens || []), lien]; enrich(p)
  if (sb && isUuid(id)) await sb.from('liens').insert({ parcel_id: id, lien_type: lien.type, holder: lien.holder, amount: lien.amount, recorded_date: lien.recorded || null })
  persist(); emit()
}
export async function addTaxes(id, rows) {
  const p = parcel(id); if (!p) return
  const key = x => `${x.entity}|${x.year}|${x.amount}`
  const have = new Set((p.taxes || []).map(key))
  const fresh = rows.filter(x => !have.has(key(x)))
  p.taxes = [...(p.taxes || []), ...fresh]; enrich(p)
  if (sb && isUuid(id) && fresh.length) await sb.from('tax_bills').insert(fresh.map(x => ({ parcel_id: id, entity: x.entity, tax_year: x.year || null, amount_due: x.amount, delinquent: !!x.delinquent })))
  persist(); emit()
}
export async function setContactFlag(id, value, patch) {
  const p = parcel(id); const c = p?.contacts?.find(x => x.value === value); if (!c) return
  Object.assign(c, patch)
  if (sb && isUuid(id)) await sb.from('contacts').update({ dnc: c.dnc }).eq('parcel_id', id).eq('value', value)
  persist(); emit()
}
// Apply an EPCAD (or other public record) patch without overwriting what the team typed by hand.
export function applyEnrichment(id, patch, { silent = false } = {}) {
  const p = parcel(id); if (!p || !patch) return false
  for (const f of ['epcadId', 'yearBuilt', 'sqft', 'lot', 'lastDeedDate', 'legal']) if (patch[f] != null && patch[f] !== '' && (p[f] == null || p[f] === '' || p[f] === 0 || f === 'lastDeedDate')) p[f] = patch[f]
  // Value: a real EPCAD value always wins; an estimate (sqft x $/sqft) only fills an empty or earlier estimated value.
  if (patch.marketValue != null) {
    if (!patch.valueEstimated) { p.marketValue = patch.marketValue; p.valueEstimated = false }
    else if (!p.marketValue || p.valueEstimated) { p.marketValue = patch.marketValue; p.valueEstimated = true }
  }
  if (patch.lastDeed) p.lastDeed = patch.lastDeed
  if (patch.homestead) p.homestead = true
  if (patch.over65) p.over65 = true
  if (patch.owner) {
    const o = patch.owner
    if (!(p.owners || []).length) p.owners = [{ ...o, fromEpcad: true }]
    else {
      const first = p.owners[0]
      if (o.mailing && (!first.mailing || first.fromEpcad)) { Object.assign(first, { mailing: o.mailing, mailingCity: o.mailingCity, mailingState: o.mailingState, mailingZip: o.mailingZip, absentee: o.absentee }); first._dirty = true }
      const same = n => String(n || '').toUpperCase().replace(/[^A-Z]/g, '')
      const words = n => new Set(String(n || '').toUpperCase().split(/[^A-Z]+/).filter(w => w.length > 1))
      const isSame = (a, b) => { if (same(a) === same(b)) return true; const A = words(a), B = words(b); let h = 0; for (const w of A) if (B.has(w)) h++; return h >= 2 }
      if (o.name && !p.owners.some(x => isSame(x.name, o.name))) p.owners.push({ ...o, fromEpcad: true })
    }
    for (const n of patch.extraOwners || []) if (!p.owners.some(x => String(x.name).toUpperCase() === n.toUpperCase())) p.owners.push({ name: n, mailing: o.mailing, mailingCity: o.mailingCity, mailingState: o.mailingState, mailingZip: o.mailingZip, absentee: o.absentee, fromEpcad: true })
  }
  enrich(p)
  if (sb && isUuid(id)) { sbUpsertParcel(p); sbSyncOwners(p) }
  if (!silent) { persist(); emit() }
  return true
}
async function sbSyncOwners(p) {
  for (const o of p.owners || []) {
    const row = { parcel_id: p.id, name: o.name, mailing_address: o.mailing, mailing_city: o.mailingCity, mailing_state: o.mailingState, mailing_zip: o.mailingZip, is_absentee: !!o.absentee }
    if (o.id && isUuid(o.id)) { if (o._dirty) { await sb.from('owners').update(row).eq('id', o.id); o._dirty = false } }
    else { const { data } = await sb.from('owners').insert(row).select('id').single(); if (data) o.id = data.id }
  }
}

export function logImport(rec) { db.imports.unshift({ id: uid('imp'), at: new Date().toISOString(), ...rec }); if (sb) sb.from('imports').insert({ kind: rec.kind, file_name: rec.fileName, rows_in: rec.rowsIn, rows_ok: rec.rowsOk }); persist(); emit() }
export function done() { persist(); emit() }
export async function saveSettings(patch) {
  db.settings = { ...db.settings, ...patch }
  if (sb) for (const [key, value] of Object.entries(patch)) await sb.from('settings').upsert({ key, value })
  if (patch.weights) db.parcels.forEach(enrich)
  persist(); emit()
}

// ---------- Supabase mapping ----------
const isUuid = s => /^[0-9a-f-]{36}$/i.test(String(s || ''))
async function loadRemote() {
  const sel = '*, owners(*), contacts(*), foreclosures(*), liens(*), tax_bills(*), activities(*), tasks(*)'
  const [{ data: ps }, { data: ls }, { data: li }, { data: inv }, { data: ms }, { data: sts }, { data: imps }, { data: sets }] = await Promise.all([
    sb.from('parcels').select(sel).limit(5000),
    sb.from('lists').select('*'), sb.from('list_items').select('*'),
    sb.from('inventory').select('*'), sb.from('mortgages').select('*'), sb.from('statements').select('*'),
    sb.from('imports').select('*').order('created_at', { ascending: false }).limit(50), sb.from('settings').select('*'),
  ])
  db = {
    parcels: (ps || []).map(fromRow).map(enrich),
    lists: (ls || []).map(l => ({ id: l.id, name: l.name, desc: l.description || '', createdAt: l.created_at, ids: (li || []).filter(x => x.list_id === l.id).map(x => x.parcel_id) })),
    inventory: (inv || []).map(v => {
      const m = (ms || []).find(x => x.inventory_id === v.id)
      return {
        id: v.id, address: v.address, zip: v.zip, status: v.status, acquiredOn: v.acquired_on, purchasePrice: +v.purchase_price || 0, rehabBudget: +v.rehab_budget || 0, rehabActual: +v.rehab_actual || 0, arv: +v.arv || 0, listPrice: v.list_price, soldPrice: v.sold_price, soldOn: v.sold_on, tenant: v.tenant_name || '', rent: +v.monthly_rent || 0, holdingMonth: +v.holding_cost_month || 0, docs: v.docs || [], notes: v.notes || '', published: !!v.published, listing: v.listing || {}, parcelId: v.parcel_id || null,
        mortgage: m ? { lender: m.lender, last4: m.loan_last4, original: +m.original_amount, rate: +m.interest_rate, payment: +m.monthly_payment, escrow: +m.escrow, dueDay: m.due_day } : null,
        statements: (sts || []).filter(s => s.inventory_id === v.id).map(s => ({ id: s.id, statementDate: s.statement_date, dueDate: s.payment_due_date, amountDue: +s.amount_due, balance: +s.principal_balance, rate: +s.interest_rate, escrow: +s.escrow, lateFee: +s.late_fee, pastDue: +s.past_due_amount, paid: s.paid, fileName: s.file_path })).sort((a, b) => (a.statementDate || '').localeCompare(b.statementDate || '')),
      }
    }),
    imports: (imps || []).map(i => ({ id: i.id, kind: i.kind, fileName: i.file_name, rowsIn: i.rows_in, rowsOk: i.rows_ok, at: i.created_at })),
    settings: Object.fromEntries((sets || []).map(s => [s.key, s.value])),
  }
  db.settings.team = db.settings.team || []
}
function fromRow(r) {
  const f = (r.foreclosures || []).sort((a, b) => (b.sale_date || '').localeCompare(a.sale_date || ''))[0]
  return {
    id: r.id, address: r.address, city: r.city, state: r.state, zip: r.zip, lat: r.lat, lng: r.lng, epcadId: r.epcad_property_id, legal: r.legal_description, type: r.property_type,
    yearBuilt: r.year_built, sqft: r.sqft, beds: r.beds, baths: r.baths, lot: r.lot_sqft, marketValue: +r.market_value || 0, lastDeedDate: r.last_deed_date, lastSalePrice: r.last_sale_price,
    vacant: r.vacant, tags: r.tags || [], homestead: (r.tags || []).includes('homestead'), over65: (r.tags || []).includes('over65'), valueEstimated: (r.tags || []).includes('value_est'), status: r.status, notes: r.notes || '', source: r.source, demo: r.demo,
    owners: (r.owners || []).map(o => ({ id: o.id, name: o.name, mailing: o.mailing_address, mailingCity: o.mailing_city, mailingState: o.mailing_state, mailingZip: o.mailing_zip, absentee: o.is_absentee, deceased: o.deceased })),
    contacts: (r.contacts || []).map(c => ({ kind: c.kind, value: c.value, phoneType: c.phone_type, dnc: c.dnc, litigator: c.litigator, confidence: c.confidence, provider: c.provider })),
    foreclosure: f ? { id: f.id, saleDate: f.sale_date, saleWindow: f.sale_time_window, saleLocation: f.sale_location, filingDate: f.filing_date, trustees: f.trustees || [], mortgagee: f.mortgagee, servicer: f.servicer, originalLoan: +f.original_loan_amount || null, dotDate: f.deed_of_trust_date, estBalance: +f.est_loan_balance || null, instrument: f.instrument_number, attorney: f.attorney_firm, outcome: f.outcome } : null,
    liens: (r.liens || []).map(l => ({ type: l.lien_type, holder: l.holder, amount: +l.amount, recorded: l.recorded_date })),
    taxes: (r.tax_bills || []).map(x => ({ entity: x.entity, year: x.tax_year, amount: +x.amount_due, delinquent: x.delinquent })),
    activities: (r.activities || []).sort((a, b) => b.created_at.localeCompare(a.created_at)).map(a => ({ id: a.id, kind: a.kind, body: a.body, at: a.created_at })),
    tasks: (r.tasks || []).map(t => ({ id: t.id, title: t.title, due: t.due_on, done: t.done })),
  }
}
const parcelRow = p => ({ address: p.address, city: p.city, state: p.state, zip: p.zip, lat: p.lat, lng: p.lng, epcad_property_id: p.epcadId || null, legal_description: p.legal, property_type: p.type, year_built: p.yearBuilt, sqft: p.sqft, beds: p.beds, baths: p.baths, lot_sqft: p.lot, market_value: p.marketValue, last_deed_date: p.lastDeedDate || null, last_sale_price: p.lastSalePrice || null, vacant: !!p.vacant, tags: p.tags, status: p.status, score: p._score, score_breakdown: p._parts, notes: p.notes, source: p.source })
async function sbUpdateParcel(p, patch) {
  const row = parcelRow(p)
  const keep = Object.fromEntries(Object.entries(row).filter(([k]) => ['status', 'notes', 'tags', 'score', 'score_breakdown', ...Object.keys(patch).map(snake)].includes(k)))
  await sb.from('parcels').update(keep).eq('id', p.id)
}
const snake = s => s.replace(/[A-Z]/g, m => '_' + m.toLowerCase())
async function sbUpsertParcel(p) {
  const row = parcelRow(p)
  if (isUuid(p.id)) await sb.from('parcels').update(row).eq('id', p.id)
  else {
    const { data, error } = await sb.from('parcels').insert(row).select('id').single()
    if (error || !data) return
    p.id = data.id
    if (p.owners?.length) {
      const { data: os } = await sb.from('owners').insert(p.owners.map(o => ({ parcel_id: p.id, name: o.name, mailing_address: o.mailing, mailing_city: o.mailingCity, mailing_state: o.mailingState, mailing_zip: o.mailingZip, is_absentee: !!o.absentee }))).select('id')
      ;(os || []).forEach((r, i) => { if (p.owners[i]) p.owners[i].id = r.id })
    }
    if (p.foreclosure) {
      const f = p.foreclosure
      await sb.from('foreclosures').insert({ parcel_id: p.id, sale_date: f.saleDate, sale_time_window: f.saleWindow, sale_location: f.saleLocation, filing_date: f.filingDate || null, trustees: f.trustees || [], mortgagee: f.mortgagee, servicer: f.servicer, original_loan_amount: f.originalLoan, deed_of_trust_date: f.dotDate || null, est_loan_balance: f.estBalance, instrument_number: f.instrument, attorney_firm: f.attorney })
    }
  }
}
export { derive }

// ---------- conversations (texts + emails) ----------
let msgs = []
const msgRow = r => ({ id: r.id, parcelId: r.parcel_id || null, channel: r.channel, dir: r.direction, peer: r.peer, subject: r.subject || '', body: r.body, status: r.status, error: r.error || null, read: r.read !== false, at: r.created_at || new Date().toISOString() })
const demoMsgs = () => db.messages || (db.messages = demoSeedMsgs())
function demoSeedMsgs() {
  const withPhone = db.parcels.filter(p => (p.contacts || []).some(c => c.kind === 'phone' && !c.dnc)).slice(0, 4)
  const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString()
  const scripts = [
    [['out', 'Hi {f}, this is Angeline with I AM Real Estate. I saw your property at {a} and wanted to ask if you have ever thought about selling. Any interest in a cash offer?', 30], ['in', 'Maybe. What kind of number are we talking?', 29], ['out', 'Depends on condition. Could I take a quick look this week? Takes 15 minutes.', 28.5], ['in', 'Thursday after 4 works', 2, false]],
    [['out', 'Hola {f}, soy Angeline de I AM Real Estate. Vi su propiedad en {a}. ¿Ha pensado en venderla? Compramos en efectivo y como está.', 50], ['in', 'Sí, la casa era de mi mamá y ya no vivimos ahí. ¿Cuánto ofrecen?', 6, false]],
    [['out', 'Hi {f}, following up about {a}. We buy as is and can close before the sale date. Want me to send you a number?', 72], ['in', 'Not interested, thanks.', 70]],
    [['out', 'Hi {f}, this is Angeline with I AM Real Estate about {a}. Any interest in an offer?', 96]],
  ]
  const out = []
  withPhone.forEach((p, i) => {
    const ph = p.contacts.find(c => c.kind === 'phone' && !c.dnc).value
    const f = String(p.owners?.[0]?.name || '').split(/\s+/)[0].toLowerCase().replace(/^./, c => c.toUpperCase())
    const a = String(p.address).toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
    for (const [dir, body, h, read] of scripts[i]) out.push({ id: uid('m'), parcelId: p.id, channel: 'sms', dir, peer: ph, body: body.replace('{f}', f).replace('{a}', a), status: dir === 'out' ? 'delivered' : 'received', read: read !== false, at: ago(h) })
  })
  return out
}
export const messages = () => (MODE === 'demo' ? demoMsgs() : msgs)
export const unreadCount = () => messages().filter(m => m.dir === 'in' && !m.read).length
export async function loadMessages() {
  if (!sb) return
  const { data, error } = await sb.from('messages').select('*').order('created_at', { ascending: false }).limit(1500)
  if (error) return
  const fresh = (data || []).map(msgRow)
  const changed = fresh.length !== msgs.length || fresh[0]?.id !== msgs[0]?.id || fresh.some((m, i) => m.read !== msgs[i]?.read || m.status !== msgs[i]?.status)
  msgs = fresh
  if (changed) emit()
}
export function threads() {
  const map = new Map()
  for (const m of [...messages()].sort((a, b) => a.at.localeCompare(b.at))) {
    const key = m.parcelId || m.peer
    const th = map.get(key) || { key, parcelId: m.parcelId, peers: new Set(), items: [], unread: 0 }
    th.items.push(m); th.peers.add(m.peer); if (m.dir === 'in' && !m.read) th.unread++
    th.last = m; map.set(key, th)
  }
  return [...map.values()].sort((a, b) => b.last.at.localeCompare(a.last.at))
}
const FAKE_REPLIES = { en: ['Who is this?', 'How much would you offer?', 'Not interested, thanks.', 'Call me after 5.'], es: ['¿Quién habla?', '¿Cuánto ofrecen?', 'Llámeme después de las 5.'] }
export async function sendMessage({ parcelId, channel, to, subject, body, dnc }) {
  if (MODE === 'demo') {
    const peer = channel === 'sms' ? to : String(to).toLowerCase()
    demoMsgs().push({ id: uid('m'), parcelId, channel, dir: 'out', peer, subject, body, status: 'delivered', read: true, at: new Date().toISOString() })
    persist(); emit()
    if (channel === 'sms') setTimeout(() => {
      const list = FAKE_REPLIES[/[áéíóúñ¿]|hola|casa/i.test(body) ? 'es' : 'en']
      demoMsgs().push({ id: uid('m'), parcelId, channel, dir: 'in', peer, body: list[Math.floor(Math.random() * list.length)], status: 'received', read: false, at: new Date().toISOString() })
      persist(); emit()
    }, 2500)
    return
  }
  const r = await fetch('/api/outreach/send', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader() }, body: JSON.stringify({ parcelId: isUuid(parcelId) ? parcelId : null, channel, to, subject, body, dnc: !!dnc }) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) { const k = 'msg.e_' + (j.code || 'send_failed'); throw new Error(t(k) !== k ? t(k) : t('msg.e_send_failed')) }
  msgs.unshift(msgRow(j.message)); emit()
  if (parcelId) addActivity(parcelId, channel === 'sms' ? 'text' : 'email', body.slice(0, 280)).catch(() => {})
}
export async function markThreadRead(key) {
  const ids = messages().filter(m => (m.parcelId || m.peer) === key && m.dir === 'in' && !m.read)
  if (!ids.length) return
  ids.forEach(m => { m.read = true })
  if (sb) await sb.from('messages').update({ read: true }).in('id', ids.map(m => m.id))
  persist(); emit()
}
export const DEFAULT_SMS = {
  en: [
    { name: 'First touch', body: 'Hi {{first}}, this is {{agent}} with {{company}}. I saw your property at {{address}} and wanted to ask if you have ever thought about selling. Any interest in a cash offer?' },
    { name: 'Follow up', body: 'Hi {{first}}, following up about {{address}}. We buy as is, close on your timeline and cover closing costs. Want me to send you a number?' },
    { name: 'Appointment', body: 'Thanks {{first}}! Does tomorrow work for a quick walkthrough of {{address}}? Morning or afternoon?' },
  ],
  es: [
    { name: 'Primer contacto', body: 'Hola {{first}}, soy {{agent}} de {{company}}. Vi su propiedad en {{address}} y quería preguntarle si ha pensado en venderla. ¿Le interesaría una oferta en efectivo?' },
    { name: 'Seguimiento', body: 'Hola {{first}}, le doy seguimiento sobre {{address}}. Compramos como está, cerramos cuando usted quiera y cubrimos los gastos de cierre. ¿Le mando una cifra?' },
    { name: 'Cita', body: '¡Gracias {{first}}! ¿Le queda bien mañana para ver {{address}} rápido? ¿En la mañana o en la tarde?' },
  ],
}

// ---------- automatic follow ups (sequences) ----------
let seqs = [], enrs = []
const seqRow = r => ({ id: r.id, name: r.name, steps: r.steps || [], active: r.active !== false, stopOnReply: r.stop_on_reply !== false, at: r.created_at })
const enrRow = r => ({ id: r.id, sequenceId: r.sequence_id, parcelId: r.parcel_id, phone: r.phone, email: r.email, step: r.step, nextAt: r.next_at, status: r.status, error: r.last_error, at: r.created_at })
export const DEFAULT_SEQUENCES = [
  { name: 'Foreclosure · 3 touches', steps: [
    { day: 0, channel: 'sms', body: 'Hi {{first}}, this is {{agent}} with {{company}}. I saw your property at {{address}} and wanted to ask if you have ever thought about selling. Any interest in a cash offer?' },
    { day: 3, channel: 'sms', body: 'Hi {{first}}, following up about {{address}}. We buy as is, close on your timeline and cover closing costs. Want me to send you a number?' },
    { day: 7, channel: 'email', subject: 'Your property at {{address}}', body: 'Hi {{first}},\n\nI reached out by text about {{address}}. If selling could help, we can make a cash offer, buy as is and close before the sale date.\n\nReply to this email or call me at {{phone}}.\n\n{{agent}}\n{{company}}' },
  ] },
  { name: 'Ejecución · 3 toques (ES)', steps: [
    { day: 0, channel: 'sms', body: 'Hola {{first}}, soy {{agent}} de {{company}}. Vi su propiedad en {{address}}. ¿Ha pensado en venderla? Compramos en efectivo y como está.' },
    { day: 3, channel: 'sms', body: 'Hola {{first}}, le doy seguimiento sobre {{address}}. Cerramos cuando usted quiera y cubrimos los gastos de cierre. ¿Le mando una cifra?' },
    { day: 7, channel: 'email', subject: 'Su propiedad en {{address}}', body: 'Hola {{first}},\n\nLe escribí por mensaje sobre {{address}}. Si vender le ayuda, podemos hacer una oferta en efectivo, comprar como está y cerrar antes de la fecha de subasta.\n\nResponda este correo o llámeme al {{phone}}.\n\n{{agent}}\n{{company}}' },
  ] },
]
function demoSeq() {
  if (!db.sequences) {
    db.sequences = DEFAULT_SEQUENCES.map((s, i) => ({ id: 'q-' + (i + 1), ...s, active: true, stopOnReply: true, at: new Date().toISOString() }))
    const ps = db.parcels.filter(p => (p.contacts || []).some(c => c.kind === 'phone' && !c.dnc)).slice(4, 9)
    const day = 86400e3
    db.enrollments = ps.map((p, i) => ({ id: 'n-' + i, sequenceId: 'q-1', parcelId: p.id, phone: p.contacts.find(c => c.kind === 'phone' && !c.dnc).value, email: p.contacts.find(c => c.kind === 'email')?.value || null, step: i % 3, nextAt: new Date(Date.now() + ((i % 3) + 1) * day).toISOString(), status: i === 4 ? 'replied' : 'active', at: new Date(Date.now() - (i + 1) * day).toISOString() }))
  }
  return db
}
export const sequences = () => (MODE === 'demo' ? demoSeq().sequences : seqs)
export const enrollments = () => (MODE === 'demo' ? demoSeq().enrollments : enrs)
export async function loadSequences() {
  if (!sb) return
  const [a, b] = await Promise.all([sb.from('sequences').select('*').order('created_at'), sb.from('enrollments').select('*').order('created_at', { ascending: false }).limit(3000)])
  if (a.error) return
  seqs = (a.data || []).map(seqRow); enrs = (b.data || []).map(enrRow)
  if (!seqs.length) { for (const s of DEFAULT_SEQUENCES) await saveSequence({ ...s, active: true, stopOnReply: true }, { silent: true }); return loadSequences() }
  emit()
}
export async function saveSequence(s, { silent = false } = {}) {
  const row = { name: s.name, steps: s.steps, active: s.active !== false, stop_on_reply: s.stopOnReply !== false }
  if (MODE === 'demo') { const l = demoSeq().sequences; const ex = l.find(x => x.id === s.id); if (ex) Object.assign(ex, s); else l.push({ ...s, id: uid('q'), at: new Date().toISOString() }); persist(); emit(); return }
  if (s.id) { const { error } = await sb.from('sequences').update(row).eq('id', s.id); if (error) throw new Error(t('team.e_error')) }
  else { const { error } = await sb.from('sequences').insert(row); if (error) throw new Error(t('team.e_error')) }
  if (!silent) await loadSequences()
}
export async function deleteSequence(id) {
  if (MODE === 'demo') { db.sequences = db.sequences.filter(x => x.id !== id); db.enrollments = db.enrollments.filter(x => x.sequenceId !== id); persist(); emit(); return }
  await sb.from('sequences').delete().eq('id', id); await loadSequences()
}
// Enroll properties: first phone not on Do Not Call and first email. Returns { added, skipped }.
export async function enroll(seqId, ids, isBlocked = () => false) {
  const seq = sequences().find(s => s.id === seqId); if (!seq) return { added: 0, skipped: ids.length }
  const already = new Set(enrollments().filter(e => e.sequenceId === seqId).map(e => e.parcelId))
  const rows = []
  let skipped = 0
  for (const id of ids) {
    const p = parcel(id); if (!p || already.has(id)) { skipped++; continue }
    const phone = (p.contacts || []).find(c => c.kind === 'phone' && !c.dnc && !isBlocked(c.value))?.value || null
    const email = (p.contacts || []).find(c => c.kind === 'email')?.value || null
    const needs = new Set(seq.steps.map(s => s.channel))
    if (!(needs.has('sms') && phone) && !(needs.has('email') && email)) { skipped++; continue }
    rows.push({ parcelId: id, phone, email })
  }
  const first = +(seq.steps[0]?.day || 0)
  const nextAt = new Date(Date.now() + first * 86400e3).toISOString()
  if (MODE === 'demo') {
    for (const r of rows) {
      demoSeq().enrollments.unshift({ id: uid('n'), sequenceId: seqId, ...r, step: first === 0 ? 1 : 0, nextAt: seq.steps[1] ? new Date(Date.now() + (+seq.steps[1].day - first) * 86400e3).toISOString() : nextAt, status: first === 0 && !seq.steps[1] ? 'done' : 'active', at: new Date().toISOString() })
      const st = seq.steps[0], to = st.channel === 'sms' ? r.phone : r.email
      if (first === 0 && to) demoMsgs().push({ id: uid('m'), parcelId: r.parcelId, channel: st.channel, dir: 'out', peer: to, subject: st.subject || '', body: fillDemo(st.body, parcel(r.parcelId)), status: 'delivered', read: true, at: new Date().toISOString() })
    }
    persist(); emit(); return { added: rows.length, skipped }
  }
  if (rows.length) {
    const { error } = await sb.from('enrollments').insert(rows.map(r => ({ sequence_id: seqId, parcel_id: r.parcelId, phone: r.phone, email: r.email, next_at: nextAt })))
    if (error) throw new Error(t('team.e_error'))
    if (first === 0) await fetch('/api/outreach/run', { method: 'POST', headers: authHeader() }).catch(() => {})
    await Promise.all([loadSequences(), loadMessages()])
  }
  return { added: rows.length, skipped }
}
export async function stopEnrollment(id) {
  if (MODE === 'demo') { const e = demoSeq().enrollments.find(x => x.id === id); if (e) e.status = 'stopped'; persist(); emit(); return }
  await sb.from('enrollments').update({ status: 'stopped' }).eq('id', id); await loadSequences()
}
function fillDemo(tpl, p) {
  const s = { ...{ company: 'I AM Real Estate', agent: 'Angeline Gomez', phone: '(915) 348-3560' }, ...(db.settings.mailSender || {}) }
  const first = String(p?.owners?.[0]?.name || '').split(/\s+/)[0].toLowerCase().replace(/^./, c => c.toUpperCase()) || 'there'
  const vals = { first, owner: p?.owners?.[0]?.name || '', address: String(p?.address || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()), agent: s.agent, company: s.company, phone: s.phone }
  return String(tpl).replace(/\{\{(\w+)\}\}/g, (_, k) => vals[k] ?? '')
}

// ---------- AI voice agent ----------
export const VOICE_DEFAULT = {
  name: 'Ava', lang: 'auto',
  greeting_en: 'Hi, thanks for calling {{company}}. This is {{name}}, the virtual assistant. Are you calling about a property you might want to sell?',
  greeting_es: 'Hola, gracias por llamar a {{company}}. Habla {{name}}, la asistente virtual. ¿Llama por una propiedad que le gustaría vender?',
  ask: ['address', 'motivation', 'timeline', 'condition', 'price', 'callback'], hours: 'Mon to Fri 9am to 5pm', transfer: '', notes: '', voice_en: '', voice_es: '',
}
export const voiceConfig = () => ({ ...VOICE_DEFAULT, ...(db.settings.voiceAgent || {}), company: orgName() || (db.settings.mailSender?.company) || 'I AM Real Estate' })
let calls = []
const callRow = r => ({ id: r.id, parcelId: r.parcel_id, source: r.source, phone: r.phone, lang: r.lang, at: r.started_at, duration: r.duration_sec, transcript: r.transcript || [], summary: r.summary, data: r.data || {}, interest: r.interest, reviewed: r.reviewed })
function demoCalls() {
  if (!db.voiceCalls) {
    const p = db.parcels.find(x => x.foreclosure) || db.parcels[0]
    db.voiceCalls = [{ id: 'vc-1', parcelId: p?.id, source: 'phone', phone: '(915) 555-0142', lang: 'en', at: new Date(Date.now() - 5 * 3600e3).toISOString(), duration: 184, interest: 'hot', reviewed: false,
      summary: `Owner of ${p?.address || 'the property'} got the foreclosure notice and wants to sell before the sale date. House needs a roof and carpet. Hoping for around $180,000. Wants a call after 5 pm.`,
      data: { name: p?.owners?.[0]?.name, property_address: p?.address, motivation: 'Behind on payments, sale date next month', timeline: 'Before the sale date', condition: 'Needs roof and carpet', asking_price: 180000, best_time: 'After 5 pm', interest: 'hot', next_step: 'Call back today after 5 pm and set a walkthrough.' },
      transcript: [{ role: 'agent', text: 'Hi, thanks for calling I AM Real Estate. This is Ava, the virtual assistant. Are you calling about a property you might want to sell?' }, { role: 'caller', text: 'Yeah, I got a letter about my house going to auction.' }, { role: 'agent', text: 'I am sorry you are dealing with that. What is the address of the property?' }, { role: 'caller', text: String(p?.address || '').toLowerCase() }, { role: 'agent', text: 'Thank you. How soon would you like to sell?' }, { role: 'caller', text: 'Before the sale date for sure.' }] }]
  }
  return db.voiceCalls
}
export const voiceCalls = () => (MODE === 'demo' ? demoCalls() : calls)
export async function loadVoiceCalls() {
  if (!sb) return
  const { data, error } = await sb.from('voice_calls').select('*').order('started_at', { ascending: false }).limit(300)
  if (!error) { calls = (data || []).map(callRow); emit() }
}
async function voiceApi(payload) {
  const r = await fetch('/api/voice/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader() }, body: JSON.stringify(payload) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.code === 'no_llm' ? t('va.e_llm') : t('va.e_brain'))
  return j
}
// One turn of the conversation. In the demo the agent follows a simple script so it works without keys.
export async function voiceTurn(messages, lang, cfg) {
  if (MODE !== 'demo') return voiceApi({ mode: 'turn', messages, lang, config: cfg })
  const Q = { en: { address: 'Got it. What is the address of the property?', motivation: 'Thank you. What has you thinking about selling?', timeline: 'I understand. How soon would you like to sell?', condition: 'And how is the condition of the house? Any repairs needed?', price: 'Do you have a price in mind?', occupancy: 'Is anyone living there right now?', mortgage: 'Roughly how much is still owed on it, if you are comfortable sharing?', callback: 'Perfect. What is your name, and the best number and time for someone from our team to call you back?' },
    es: { address: 'Muy bien. ¿Cuál es la dirección de la propiedad?', motivation: 'Gracias. ¿Qué lo tiene pensando en vender?', timeline: 'Entiendo. ¿Qué tan pronto le gustaría vender?', condition: '¿Y cómo está la casa? ¿Necesita reparaciones?', price: '¿Tiene algún precio en mente?', occupancy: '¿Vive alguien ahí ahorita?', mortgage: '¿Más o menos cuánto se debe todavía, si gusta compartirlo?', callback: 'Perfecto. ¿Cuál es su nombre, y a qué número y hora le podemos llamar de nuestro equipo?' } }[lang]
  const asked = messages.filter(m => m.role === 'assistant').length - 1
  const next = cfg.ask[asked]
  await new Promise(r => setTimeout(r, 500))
  if (next) return { reply: Q[next], end: false }
  return { reply: lang === 'es' ? 'Muchas gracias. Alguien de nuestro equipo le va a llamar pronto. ¡Que tenga buen día!' : 'Thank you so much. Someone from our team will call you back shortly. Have a great day!', end: true }
}
export async function saveVoiceCall({ transcript, lang, startedAt, source = 'test' }) {
  let data = null
  if (MODE !== 'demo') { try { data = (await voiceApi({ mode: 'summary', lang, transcript })).data } catch {} }
  else {
    const said = transcript.filter(x => x.role === 'caller').map(x => x.text)
    data = { summary: (lang === 'es' ? 'Llamada de prueba. El cliente dijo: ' : 'Test call. The caller said: ') + said.join(' / ').slice(0, 300), interest: 'warm', next_step: lang === 'es' ? 'Revisar y devolver la llamada.' : 'Review and call back.', property_address: said[1] || null }
  }
  const addrKey = s => String(s || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/).slice(0, 2).join(' ')
  const p = data?.property_address ? db.parcels.find(x => addrKey(x.address) && addrKey(x.address) === addrKey(data.property_address)) : null
  const call = { id: uid('vc'), parcelId: p?.id || null, source, lang, at: startedAt, duration: Math.round((Date.now() - new Date(startedAt)) / 1000), transcript, summary: data?.summary || '', data: data || {}, interest: data?.interest || null, reviewed: false }
  if (MODE === 'demo') { demoCalls().unshift(call); persist() }
  else {
    const { data: row } = await sb.from('voice_calls').insert({ parcel_id: isUuid(call.parcelId) ? call.parcelId : null, source, lang, started_at: startedAt, duration_sec: call.duration, transcript, summary: call.summary, data: call.data, interest: call.interest }).select('id').single()
    if (row) call.id = row.id
    calls.unshift(call)
  }
  if (p) {
    await addActivity(p.id, 'call', `${t('va.activity')}: ${call.summary}`.slice(0, 500)).catch(() => {})
    if (['hot', 'warm'].includes(call.interest)) await addTask(p.id, call.data?.next_step || t('va.callback_task')).catch(() => {})
  }
  emit()
  return call
}
export async function markCallReviewed(id) {
  const c = voiceCalls().find(x => x.id === id); if (!c) return
  c.reviewed = true
  if (sb && isUuid(id)) await sb.from('voice_calls').update({ reviewed: true }).eq('id', id)
  persist(); emit()
}

// ---------- website listings (publish inventory homes) ----------
export async function setPublished(id, on) {
  const v = db.inventory.find(x => x.id === id); if (!v) return
  v.published = !!on
  if (sb && isUuid(id)) {
    const { error } = await sb.from('inventory').update({ published: !!on, published_at: on ? new Date().toISOString() : null }).eq('id', id)
    if (error) { v.published = !on; throw new Error(/column/i.test(error.message) ? t('pub.e_sql') : t('team.e_error')) }
  }
  persist(); emit()
}
export async function saveListing(id, listing) {
  const v = db.inventory.find(x => x.id === id); if (!v) return
  v.listing = listing
  if (sb && isUuid(id)) { const { error } = await sb.from('inventory').update({ listing }).eq('id', id); if (error) throw new Error(/column/i.test(error.message) ? t('pub.e_sql') : t('team.e_error')) }
  persist(); emit()
}
// Shrinks a photo in the browser (max 1600 px, JPEG) and uploads it. Demo keeps it in memory.
export async function uploadListingPhoto(invId, file) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file) })
  const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight))
  const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k)
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
  URL.revokeObjectURL(img.src)
  if (MODE === 'demo' || !sb) return c.toDataURL('image/jpeg', 0.82)
  const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.82))
  const path = `${myOrgId || 'org'}/${invId}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.jpg`
  const { error } = await sb.storage.from('listing-photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (error) throw new Error(t('pub.e_upload'))
  return sb.storage.from('listing-photos').getPublicUrl(path).data.publicUrl
}

// A lead the team bought: create its inventory record from the property data (price fields are optional).
export async function moveToInventory(parcelId, { acquiredOn, purchasePrice, rehabBudget, status }) {
  const p = parcel(parcelId); if (!p) return null
  const exists = db.inventory.find(v => v.parcelId === parcelId); if (exists) return exists
  const item = await saveInventory({ parcelId, address: p.address, zip: p.zip || '', status: status || 'acquisition', acquiredOn: acquiredOn || new Date().toISOString().slice(0, 10), purchasePrice: purchasePrice ?? null, rehabBudget: rehabBudget ?? null, rehabActual: null, arv: p.marketValue || null, docs: [], statements: [], notes: '', published: false, listing: {} })
  await addActivity(parcelId, 'status', t('own.activity')).catch(() => {})
  return item
}
export const inventoryFor = parcelId => db.inventory.find(v => v.parcelId === parcelId) || null
export const touch = () => { persist(); emit() }
