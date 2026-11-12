// EPCAD (El Paso Central Appraisal District) export reader. Pure functions shared by browser and server.
// EPCAD's Open Government page offers "Property Search Dataset Downloads" (Deeds, Improvements, Lands, Owners,
// Properties, Rolls, Values) as flat text files: newline rows, "~" between columns. Each file is classified by its
// header row and joined on the property ID. Column names are matched loosely so a layout change does not break it.
// The certified "Appraisal Export" (fixed width) is also supported through a positions layout (see FIXED below).
import { normStreet, addrKey } from './address.js'

const F = {
  id: /^(prop(erty)?[_ ]?id|pid|account(_?(no|num|number))?|prop_id)$/i,
  geo: /^(geo[_ ]?id|parcel[_ ]?id)$/i,
  owner: /^(owner[_ ]?name|name|py_owner_name|owner)$/i,
  mail1: /^(mail(ing)?[_ ]?(addr(ess)?)?[_ ]?(line)?[_ ]?1?|addr[_ ]?line[_ ]?1|py_addr_line1|owner[_ ]?addr(ess)?(1)?)$/i,
  mail2: /^(mail(ing)?[_ ]?(addr(ess)?)?[_ ]?(line)?[_ ]?2|addr[_ ]?line[_ ]?2|py_addr_line2)$/i,
  mailCity: /^(mail(ing)?[_ ]?city|addr[_ ]?city|py_addr_city|owner[_ ]?city)$/i,
  mailState: /^(mail(ing)?[_ ]?state|addr[_ ]?state|py_addr_state|owner[_ ]?state)$/i,
  mailZip: /^(mail(ing)?[_ ]?zip|addr[_ ]?zip|py_addr_zip|owner[_ ]?zip)$/i,
  situsNum: /^(situs[_ ]?(street[_ ]?)?num(ber)?|situs[_ ]?no|street[_ ]?num(ber)?)$/i,
  situsPre: /^(situs[_ ]?(street[_ ]?)?pre(fix|fx)?|street[_ ]?prefix)$/i,
  situsStreet: /^(situs[_ ]?street([_ ]?name)?|street[_ ]?name|situs_street)$/i,
  situsSuf: /^(situs[_ ]?(street[_ ]?)?suf(fix)?|street[_ ]?suffix)$/i,
  situs: /^(situs([_ ]?addr(ess)?)?|property[_ ]?address|location|site[_ ]?address)$/i,
  situsZip: /^(situs[_ ]?zip|prop(erty)?[_ ]?zip|zip)$/i,
  legal: /^(legal([_ ]?desc(ription)?)?|legal_desc)$/i,
  market: /^(market([_ ]?val(ue)?)?|appraised([_ ]?val(ue)?)?|total[_ ]?(market|value|appraised)|apprais)$/i,
  yearBuilt: /^(yr[_ ]?blt|year[_ ]?built|actual[_ ]?year[_ ]?built|eff[_ ]?yr[_ ]?blt|year_built)$/i,
  living: /^(living[_ ]?area|liv[_ ]?area|sq[_ ]?ft|square[_ ]?footage|main[_ ]?area|imprv[_ ]?sqft)$/i,
  land: /^(land[_ ]?(sq[_ ]?ft|area|acres?)|lot[_ ]?(size|sqft))$/i,
  deedDate: /^(deed[_ ]?date|sale[_ ]?date|recorded[_ ]?date|deed_dt)$/i,
  hs: /^(hs|homestead|hs[_ ]?exempt|exempt[_ ]?hs)$/i,
  ov65: /^(ov65|over[_ ]?65|ov65[_ ]?exempt)$/i,
  exemptions: /^(exemptions?|exempt[_ ]?codes?)$/i,
}

export function detectDelimiter(line) {
  const c = ch => (line.split(ch).length - 1)
  return [['~', c('~')], ['|', c('|')], ['\t', c('\t')], [',', c(',')]].sort((a, b) => b[1] - a[1])[0][0]
}
export function headerMap(cells) {
  const m = {}
  cells.forEach((h, i) => { const k = String(h).trim().replace(/^"|"$/g, ''); for (const [f, r] of Object.entries(F)) if (m[f] == null && r.test(k)) m[f] = i })
  return m
}
const num = v => { const n = Number(String(v ?? '').replace(/[$,\s"]/g, '')); return Number.isFinite(n) && String(v).trim() !== '' ? n : null }
const iso = v => {
  const s = String(v || '').trim(); if (!s) return null
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/); if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return null
}
const truthy = v => /^(y|yes|t|true|1|x)$/i.test(String(v || '').trim())

// Index = Map(propId -> record). Feed it rows file by file (any order).
export function createIndex() { return { byId: new Map(), files: [] } }
function rec(ix, id) { let r = ix.byId.get(id); if (!r) { r = { id }; ix.byId.set(id, r) } return r }

// Add one row (array of cells) of a delimited file, using its header map.
export function addRow(ix, hm, c) {
  const g = k => (hm[k] != null ? String(c[hm[k]] ?? '').trim().replace(/^"|"$/g, '') : '')
  const id = g('id') || g('geo'); if (!id) return
  const r = rec(ix, id)
  if (g('geo')) r.geo = g('geo')
  if (g('owner') && !r.owner) r.owner = g('owner')
  const m1 = [g('mail1'), g('mail2')].filter(Boolean).join(' ')
  if (m1 && !r.mail) { r.mail = m1; r.mailCity = g('mailCity'); r.mailState = g('mailState'); r.mailZip = g('mailZip').slice(0, 5) }
  const situs = g('situs') || [g('situsNum'), g('situsPre'), g('situsStreet'), g('situsSuf')].filter(Boolean).join(' ')
  if (situs && !r.situs) { r.situs = situs.replace(/\s+/g, ' ').trim(); r.zip = (g('situsZip') || (situs.match(/\b(\d{5})\b\s*$/) || [])[1] || '').slice(0, 5) }
  if (g('legal') && !r.legal) r.legal = g('legal').slice(0, 300)
  const mv = num(g('market')); if (mv != null && (r.value == null || mv > r.value)) r.value = mv
  const yb = num(g('yearBuilt')); if (yb && yb > 1800 && (!r.yearBuilt || yb < r.yearBuilt)) r.yearBuilt = yb
  const la = num(g('living')); if (la) r.sqft = (r.sqft || 0) + la
  const ld = num(g('land')); if (ld && !r.lot) r.lot = ld
  const dd = iso(g('deedDate')); if (dd && (!r.deed || dd > r.deed)) r.deed = dd
  if (truthy(g('hs')) || /\bHS\b/i.test(g('exemptions'))) r.hs = true
  if (truthy(g('ov65')) || /\bOV65\b/i.test(g('exemptions'))) r.ov65 = true
}

// Optional fixed width layout: { id:[start,len], owner:[...], ... } using 1-based starts from the layout PDF.
export function addFixedRow(ix, layout, line) {
  const cells = {}; for (const [k, [s, l]] of Object.entries(layout)) cells[k] = line.substr(s - 1, l)
  const keys = Object.keys(cells); const hm = Object.fromEntries(keys.map((k, i) => [k, i]))
  addRow(ix, hm, keys.map(k => cells[k]))
}

// Compact array for storage, plus an address lookup.
export function finalize(ix) {
  const list = [...ix.byId.values()].filter(r => r.situs || r.owner)
  return list
}
export function lookupMaps(list) {
  const byId = new Map(), byAddr = new Map(), byStreet = new Map()
  for (const r of list) {
    byId.set(String(r.id), r); if (r.geo) byId.set(String(r.geo), r)
    if (r.situs) { byAddr.set(addrKey(r.situs, r.zip), r); const s = normStreet(r.situs); if (!byStreet.has(s)) byStreet.set(s, r); else byStreet.set(s, null) }
  }
  return { byId, byAddr, byStreet }
}
export function matchParcel(maps, { epcadId, address, zip }) {
  if (epcadId && maps.byId.get(String(epcadId))) return maps.byId.get(String(epcadId))
  return maps.byAddr.get(addrKey(address, zip)) || maps.byStreet.get(normStreet(address)) || null
}
// Turn an EPCAD record into portal fields.
export function toParcelPatch(r, propZip) {
  const absentee = !!(r.mailZip && propZip && r.mailZip !== String(propZip).slice(0, 5)) || !!(r.mail && r.situs && normStreet(r.mail) !== normStreet(r.situs) && r.mailZip !== String(propZip || '').slice(0, 5))
  return {
    epcadId: r.id, marketValue: r.value ?? undefined, yearBuilt: r.yearBuilt ?? undefined, sqft: r.sqft ?? undefined, lot: r.lot ?? undefined,
    lastDeedDate: r.deed ?? undefined, legal: r.legal ?? undefined, homestead: !!r.hs, over65: !!r.ov65,
    owner: r.owner ? { name: r.owner, mailing: r.mail || '', mailingCity: r.mailCity || '', mailingState: r.mailState || '', mailingZip: r.mailZip || '', absentee } : null,
  }
}
