// RentRedi payments export (Rent > Paid > Export Data, or Payments > Export Charges > Spreadsheets) -> rent received.
// Column names vary by report, so each one is found by meaning: date, amount, tenant, property, unit, status, type.
import { parseCsvText } from './ghl.js'

// First regex wins (in order), so 'Date Paid' beats 'Due Date' and 'Amount Paid' beats 'Amount Due'.
const col = (head, ...res) => { for (const r of res) { const i = head.findIndex(h => r.test(h)); if (i >= 0) return i } return -1 }
const money = s => { const v = +String(s || '').replace(/[^0-9.-]/g, ''); return isFinite(v) ? v : 0 }
function isoDate(s) {
  const v = String(s || '').trim(); if (!v) return null
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` }
  const d = new Date(v); return isNaN(d) ? null : d.toISOString().slice(0, 10)
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const cleanProp = s => String(s || '').replace(/^z\s*:?\s*(closed\s*:\s*)?/i, '').trim()
const cleanUnit = s => (/^(main|house|home|n\/?a)?$/i.test(String(s || '').trim()) ? '' : String(s).replace(/^(unit|apt|#)\s*/i, '').trim())

// RentRedi "Export Charges" (Spreadsheets): one row per charge (Rent, Mortgage, Deposit...) followed by its payment rows,
// linked by Charge ID. We keep rent and mortgage (wrap) charges, with what was paid toward each and when.
function parseCharges(rows, head) {
  const ix = { due: col(head, /^amount\s*due$/i), paid: col(head, /^amount\s*paid$/i), prop: col(head, /^property$/i), unit: col(head, /^unit$/i), ten: col(head, /^tenants?$/i), desc: col(head, /^description$/i), notes: col(head, /^notes$/i), dueDate: col(head, /^due\s*date$/i), paidDate: col(head, /^date\s*paid$/i), status: col(head, /^status$/i), charge: col(head, /^charge\s*id$/i) }
  const charges = new Map(), lastPay = new Map(), skipped = []
  for (const r of rows) {
    const g = k => (ix[k] >= 0 ? String(r[ix[k]] || '').trim() : '')
    const id = g('charge'); if (!id) continue
    if (g('dueDate')) { charges.set(id, { g: { ...Object.fromEntries(Object.keys(ix).map(k => [k, g(k)])) } }); continue }
    // a payment row: remember the latest successful one (date and method)
    if (/^paid$/i.test(g('status')) && money(g('paid')) > 0) { const d = isoDate(g('paidDate')); const prev = lastPay.get(id); if (d && (!prev || d > prev.date)) lastPay.set(id, { date: d, method: g('desc').replace(/^payment\s*-\s*/i, '') }) }
  }
  const pays = []
  for (const [id, { g }] of charges) {
    const desc = g.desc, paid = money(g.paid), owed = money(g.due)
    if (!/rent|mortgage|^payment$/i.test(desc) || /deposit/i.test(desc)) { skipped.push({ desc, property: g.prop, amount: paid + owed }); continue }
    let period = (isoDate(g.dueDate) || '').slice(0, 7) + '-01'
    const mi = MONTHS.findIndex(m => new RegExp('\\b' + m, 'i').test(desc))
    if (mi >= 0) { const y = +period.slice(0, 4), cm = +period.slice(5, 7) - 1; const yy = mi < cm - 6 ? y + 1 : y; period = `${yy}-${String(mi + 1).padStart(2, '0')}-01` }
    const lp = lastPay.get(id)
    pays.push({ charge: id, period, date: lp?.date || isoDate(g.dueDate), amount: paid, owed, total: paid + owed, tenant: g.ten, property: cleanProp(g.prop), unit: cleanUnit(g.unit), type: /mortgage/i.test(desc) ? 'wrap' : /^payment$/i.test(desc) ? 'loan' : 'rent', desc, status: g.status, ref: id, method: lp ? 'RentRedi · ' + lp.method : 'RentRedi', closed: /closed/i.test(g.prop) })
  }
  return { pays, skipped, format: 'charges' }
}

export function parseRentRedi(text) {
  const rows = parseCsvText(text)
  if (rows.length < 2) return { pays: [], error: 'empty' }
  const h0 = rows[0].map(h => String(h).trim())
  if (h0.some(h => /^charge\s*id$/i.test(h)) && h0.some(h => /^due\s*date$/i.test(h))) return parseCharges(rows.slice(1), h0)
  // Some exports start with a title line: use the first line that has an amount-like header.
  const hi = rows.findIndex(r => r.some(h => /amount|paid|total/i.test(h)) && r.some(h => /date/i.test(h)))
  if (hi < 0) return { pays: [], error: 'columns', head: rows[0] }
  const head = rows[hi].map(h => String(h).trim())
  const ix = {
    date: col(head, /paid\s*(on|date)/i, /payment\s*date/i, /date\s*paid/i, /deposit/i, /^date$/i, /date/i),
    amount: col(head, /amount\s*paid/i, /paid\s*amount/i, /^amount$/i, /payment\s*amount/i, /amount/i, /total/i),
    tenant: col(head, /tenant|renter|payer|resident/i, /^name$/i),
    property: col(head, /property|address/i),
    unit: col(head, /^unit/i, /unit/i),
    status: col(head, /status/i),
    type: col(head, /charge\s*type|category|^type$|description|memo|charge/i),
    ref: col(head, /transaction|reference|confirmation|^id$/i),
    method: col(head, /method/i),
  }
  if (ix.date < 0 || ix.amount < 0) return { pays: [], error: 'columns', head }
  const pays = [], skipped = []
  for (const r of rows.slice(hi + 1)) {
    const g = k => (ix[k] >= 0 ? String(r[ix[k]] || '').trim() : '')
    const amount = money(g('amount')), date = isoDate(g('date'))
    if (!amount || !date) continue
    const status = g('status'), type = g('type')
    if (/fail|declin|return|refund|reverse|cancel|void|pending|scheduled|processing/i.test(status) || /deposit|security|application|fee/i.test(type) && !/rent/i.test(type)) { skipped.push({ date, amount, status, type }); continue }
    let unit = g('unit').replace(/^(unit|apt|#)\s*/i, '').trim()
    let property = g('property')
    if (!unit) { const m = property.match(/(?:#|unit|apt)\s*([A-Za-z0-9-]+)/i); if (m) unit = m[1] }
    pays.push({ date, period: date.slice(0, 7) + '-01', amount, tenant: g('tenant'), property: cleanProp(property), unit: cleanUnit(unit), status, type: 'rent', ref: g('ref'), method: g('method') || 'RentRedi' })
  }
  return { pays, skipped }
}

// Match a RentRedi payment to a rent item in the Portfolio: same home and unit, or the tenant name, or the amount.
const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const words = s => norm(s).split(' ').filter(w => w.length > 2)
export function matchRent(pay, rentItems) {
  const prop = norm(pay.property), num = prop.match(/^\d+/)?.[0], street = words(prop.replace(/^\d+\s*/, ''))[0]
  const tw = words(pay.tenant)
  let best = null, bestScore = 0
  for (const it of rentItems) {
    const home = norm(it.inv?.address || ''), hn = home.match(/^\d+/)?.[0]
    let sc = 0
    if (num && hn === num) sc += 3
    if (street && home.includes(street)) sc += 2
    const u = String(it.ob.unit || '').replace('#', '')
    if (u && pay.unit && u.toUpperCase() === pay.unit.toUpperCase()) sc += 3
    else if (u && pay.unit) sc -= 3
    const pw = words(it.ob.party)
    if (tw.length && pw.length) sc += tw.filter(w => pw.includes(w)).length * 2
    if (Math.abs((it.ob.amount || 0) - (pay.total || pay.amount)) < 1) sc += 1
    if (pay.type && it.ob.kind === pay.type) sc += 1
    if (sc > bestScore) { best = it; bestScore = sc }
  }
  return bestScore >= 4 ? best : null
}
