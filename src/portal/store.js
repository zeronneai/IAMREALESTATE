// Data layer. Two backends with the same API:
//  - Supabase (production): set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Team signs in by magic link.
//  - Demo (default): fictional seed data kept in this browser (localStorage, wrapped in try/catch).
import { seed } from './seed.js'
import { score, derive, DEFAULT_WEIGHTS } from './score.js'

const KEY = 'iam_portal_demo_v1'
const SB_URL = import.meta.env.VITE_SUPABASE_URL
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
export const MODE = SB_URL && SB_KEY ? 'supabase' : 'demo'

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
  await loadRemote()
  return { ready: true }
}
export const authHeader = () => (session ? { Authorization: `Bearer ${session.access_token}` } : {})
export async function sendMagicLink(email) {
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + '/portal/' } })
  if (error) throw error
}
export async function signOut() { if (sb) await sb.auth.signOut(); location.reload() }
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
    const row = { address: item.address, zip: item.zip, status: item.status, acquired_on: item.acquiredOn || null, purchase_price: item.purchasePrice, rehab_budget: item.rehabBudget, rehab_actual: item.rehabActual, arv: item.arv, list_price: item.listPrice || null, sold_price: item.soldPrice || null, sold_on: item.soldOn || null, tenant_name: item.tenant || null, monthly_rent: item.rent || null, holding_cost_month: item.holdingMonth || null, notes: item.notes || null }
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
  for (const f of ['epcadId', 'marketValue', 'yearBuilt', 'sqft', 'lot', 'lastDeedDate', 'legal']) if (patch[f] != null && patch[f] !== '' && (p[f] == null || p[f] === '' || p[f] === 0 || f === 'marketValue' || f === 'lastDeedDate')) p[f] = patch[f]
  if (patch.homestead) p.homestead = true
  if (patch.over65) p.over65 = true
  if (patch.owner) {
    const o = patch.owner
    if (!(p.owners || []).length) p.owners = [o]
    else {
      const first = p.owners[0]
      if (!first.mailing && o.mailing) Object.assign(first, { mailing: o.mailing, mailingCity: o.mailingCity, mailingState: o.mailingState, mailingZip: o.mailingZip, absentee: o.absentee })
      if (!p.owners.some(x => x.name.toUpperCase() === o.name.toUpperCase())) p.owners.push({ ...o, fromEpcad: true })
    }
  }
  enrich(p)
  if (sb && isUuid(id)) sbUpsertParcel(p)
  if (!silent) { persist(); emit() }
  return true
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
        id: v.id, address: v.address, zip: v.zip, status: v.status, acquiredOn: v.acquired_on, purchasePrice: +v.purchase_price || 0, rehabBudget: +v.rehab_budget || 0, rehabActual: +v.rehab_actual || 0, arv: +v.arv || 0, listPrice: v.list_price, soldPrice: v.sold_price, soldOn: v.sold_on, tenant: v.tenant_name || '', rent: +v.monthly_rent || 0, holdingMonth: +v.holding_cost_month || 0, docs: v.docs || [], notes: v.notes || '',
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
    vacant: r.vacant, tags: r.tags || [], status: r.status, notes: r.notes || '', source: r.source, demo: r.demo,
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
    if (p.owners?.length) await sb.from('owners').insert(p.owners.map(o => ({ parcel_id: p.id, name: o.name, mailing_address: o.mailing, mailing_city: o.mailingCity, mailing_state: o.mailingState, mailing_zip: o.mailingZip, is_absentee: !!o.absentee })))
    if (p.foreclosure) {
      const f = p.foreclosure
      await sb.from('foreclosures').insert({ parcel_id: p.id, sale_date: f.saleDate, sale_time_window: f.saleWindow, sale_location: f.saleLocation, filing_date: f.filingDate || null, trustees: f.trustees || [], mortgagee: f.mortgagee, servicer: f.servicer, original_loan_amount: f.originalLoan, deed_of_trust_date: f.dotDate || null, est_loan_balance: f.estBalance, instrument_number: f.instrument, attorney_firm: f.attorney })
    }
  }
}
export { derive }
