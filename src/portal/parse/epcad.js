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

// ---------------------------------------------------------------------------------------------------------
// EPCAD "Property Search Dataset" dumps (the real files from epcad.org/OpenGovernment, e.g. Owners2027Dump.txt).
// They have NO header row: "~" between columns and padded cells. Layout (0 based, verified with the 2027 files):
//   Properties  (19): 1 prop_id · 2 legal · 4 geo_id · 5 prop_type (R, P, MH) · 8 situs "123 MAIN ST EL PASO, TX 79928" · 18 acres
//   Owners      (9) : 1 owner name · 3 mailing "123 MAIN ST EL PASO TX 79928-1234" · 5 exemptions (HS, OV65, DV4...) · 6 prop_id
//   Improvements(14): 3 total living area · 5 description · 8 year built · 9 area · 11 prop_id · 13 type code (MA = main area)
//   Lands       (12): 3 acres · 4 land sqft · 9 prop_id
//   Deeds       (10): 1 date "2022-04-25 00:00:00" · 2 code · 3 description · 4 grantor · 5 grantee · 8 instrument · 9 prop_id
//   Values      (14): 1..11 value columns (EMPTY in the 2027 file, filled in prior years) · 12 tax year · 13 prop_id
import { splitAddress } from './address.js'

export const DUMP_KINDS = ['properties', 'owners', 'improvements', 'lands', 'values', 'deeds']
export function dumpKind(fileName, firstLine) {
  const n = String(fileName || '').toLowerCase()
  for (const k of DUMP_KINDS) if (n.includes(k.replace(/s$/, ''))) return k
  if (!firstLine || !firstLine.includes('~')) return null
  const c = firstLine.split('~'); const nf = c.length
  if (nf === 19) return 'properties'
  if (nf === 9) return 'owners'
  if (nf === 12) return 'lands'
  if (nf === 10 && /^\d{4}-\d{2}-\d{2}/.test(c[1].trim())) return 'deeds'
  if (nf === 14) return /^[A-Za-z]/.test(c[1].trim()) ? 'improvements' : 'values'
  return null
}
// A headerless dump starts with a number (row id); a header row starts with letters.
export const isHeaderless = line => /^\s*\d+\s*~/.test(line || '')

const NUMW = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8, NINE: 9, TEN: 10, ELEVEN: 11, TWELVE: 12, THIRTEEN: 13, FOURTEEN: 14, FIFTEEN: 15, SIXTEEN: 16, SEVENTEEN: 17, EIGHTEEN: 18, NINETEEN: 19, TWENTY: 20 }
// "THE PASEOS AT MISSION RIDGE 4" / "GATEWAY ESTATES UNIT ONE REPLAT "H"" / "PEYTON ESTATES #4" -> comparable token string
export function subKey(s) {
  let a = String(s || '').toUpperCase().replace(/["'`.,()]/g, ' ').replace(/\bUNIT\s+/g, '#').replace(/#\s+/g, '#')
  a = a.replace(/#([A-Z]+)\b/g, (m, w) => (NUMW[w] ? '#' + NUMW[w] : m))
  a = a.replace(/\(\s*[\d.]+\s*(?:SQ\s*FT|AC(?:RES?)?)\s*\)/g, ' ')
  const drop = new Set(['THE', 'OF', 'AN', 'A', 'AMENDING', 'AMENDED', 'SUBDIVISION', 'ADDITION', 'TO'])
  return a.split(/\s+/).filter(w => w && !drop.has(w)).map(w => w.replace(/^#(\d+)$/, '$1')).join(' ').trim()
}
// EPCAD legal: "BLK 61 THE PASEOS AT MISSION RIDGE 4 LOT 17" or older "75 CHAPARRAL PARK #19   LOT 1 (13000 SQ FT)"
export function epcadLegalParts(legal) {
  const s = String(legal || '').toUpperCase().replace(/\s+/g, ' ').trim()
  let m = s.match(/^BLK\s+(\S+)\s+(.+?)\s+LOTS?\s+([0-9A-Z]+)\b/)
  if (m) return { blk: norm0(m[1]), sub: subKey(m[2]), lot: norm0(m[3]) }
  m = s.match(/^(\d+[A-Z]?)\s+(.+?)\s+LOTS?\s+([0-9A-Z]+)\b/)
  if (m) return { blk: norm0(m[1]), sub: subKey(m[2]), lot: norm0(m[3]) }
  return null
}
// Notice legal: "LOT 17, BLOCK 61, THE PASEOS AT MISSION RIDGE 4, A SUBDIVISION IN EL PASO COUNTY..."
export function noticeLegalParts(legal) {
  const s = String(legal || '').toUpperCase().replace(/\s+/g, ' ')
  const lot = (s.match(/\bLOTS?\s+([0-9]+[A-Z]?)\b/) || [])[1]
  const bm = s.match(/\bBLOCK\s+([0-9]+[A-Z]?)\b[.,]?\s*(?:OF\s+)?(.+?)(?:,\s*(?:AN?\s+)?(?:ADDITION|SUBDIVISION)\b|,?\s+ACCORDING\b|,\s*(?:IN\s+)?(?:THE\s+)?(?:CITY|COUNTY|EL PASO)\b|$)/)
  if (!lot || !bm) return null
  return { blk: norm0(bm[1]), sub: subKey(bm[2]), lot: norm0(lot) }
}
const norm0 = v => String(v || '').replace(/^0+(?=\d)/, '')
export const legalKey = p => (p ? `${p.sub}|${p.blk}|${p.lot}` : null)
const tokens = s => new Set(String(s || '').split(' ').filter(Boolean))
export function subSimilarity(a, b) {
  const A = tokens(a), B = tokens(b); if (!A.size || !B.size) return 0
  let hit = 0; for (const w of A) if (B.has(w)) hit++
  return hit / Math.max(A.size, B.size)
}

const T = v => String(v ?? '').trim()
const n0 = v => { const x = Number(T(v).replace(/,/g, '')); return Number.isFinite(x) && T(v) !== '' ? x : null }
function streetZip(raw) {
  const s = T(raw).replace(/\s+/g, ' ')
  if (!s || /^[,\s]*\d{0,5}$/.test(s) || /^,/.test(s)) return { street: '', zip: (s.match(/\b(\d{5})\b/) || [])[1] || '' }
  const sp = splitAddress(s)
  return { street: sp.street, city: sp.city, zip: sp.zip }
}

// Builder: feed lines per file kind; finish() returns compact records (only real property, prop_type R/MH).
export function createDumpIndex() { return { byId: new Map(), counts: {}, valuesFilled: 0 } }
export function addDumpLine(ix, kind, line) {
  const c = line.split('~')
  ix.counts[kind] = (ix.counts[kind] || 0) + 1
  if (kind === 'properties') {
    const type = T(c[5]); if (type && !/^(R|MH)$/.test(type)) return
    const id = T(c[1]); if (!id) return
    const r = ix.byId.get(id) || { id }
    r.legal = T(c[2]).replace(/\s+/g, ' ').slice(0, 200)
    const sz = streetZip(c[8]); r.situs = sz.street; r.zip = sz.zip; r.city = sz.city || ''
    r.acres = n0(c[17]) ?? null
    ix.byId.set(id, r); return
  }
  const id = kind === 'owners' ? T(c[6]) : kind === 'improvements' ? T(c[11]) : kind === 'lands' ? T(c[9]) : kind === 'deeds' ? T(c[9]) : kind === 'values' ? T(c[13]) : ''
  const r = ix.byId.get(id); if (!r) return   // only properties we kept
  if (kind === 'owners') {
    const name = T(c[1]).replace(/\s+/g, ' ')
    if (name && !/^UNKNOWN OWNER$/i.test(name)) { r.owners = r.owners || []; if (!r.owners.includes(name) && r.owners.length < 4) r.owners.push(name) }
    const mail = T(c[3]).replace(/\s+/g, ' ')
    if (mail && !/^UNAVAILABLE$/i.test(mail) && !r.mailing) r.mailing = mail
    const ex = T(c[5]).toUpperCase()
    if (ex) { const set = new Set([...(r.ex ? r.ex.split(',') : []), ...ex.split(/\s*,\s*/).filter(Boolean)]); r.ex = [...set].join(',') }
  } else if (kind === 'improvements') {
    const total = n0(c[3]); if (total && (!r.living || total > r.living)) r.living = total
    const code = T(c[13]).toUpperCase(); const yb = n0(c[8])
    if ((code === 'MA' || /MAIN AREA/i.test(c[5])) && yb && yb > 1800 && (!r.yb || yb < r.yb)) r.yb = yb
    if ((code === 'MA' || /MAIN AREA/i.test(c[5])) && !total) r.living = (r.living || 0) + (n0(c[9]) || 0)
  } else if (kind === 'lands') {
    const sq = n0(c[4]); if (sq) r.land = (r.land || 0) + sq
    const ac = n0(c[3]); if (ac) r.landAcres = (r.landAcres || 0) + ac
  } else if (kind === 'deeds') {
    const d = T(c[1]).slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d > '1901-01-01' && (!r.deed || d >= r.deed)) { r.deed = d; r.deedType = T(c[3]) || T(c[2]); r.deedInst = T(c[8]); r.grantee = T(c[5]) }
  } else if (kind === 'values') {
    const vals = c.slice(1, 12).map(n0).filter(v => v != null && v > 0)
    if (vals.length) { r.value = Math.max(...vals); r.valYear = n0(c[12]); ix.valuesFilled++ }
  }
}
export function finishDumpIndex(ix) {
  const out = []
  for (const r of ix.byId.values()) {
    const sz = r.mailing ? splitAddress(r.mailing.replace(/(\d{5})-\d{4}$/, '$1')) : null
    const mailZip = sz?.zip || ''
    const lp = epcadLegalParts(r.legal)
    const addr_key = r.situs && /^\d/.test(r.situs) ? normStreet(r.situs) : null
    const ex = r.ex || ''
    const absentee = isAbsentee(r.situs, r.zip, r.mailing, mailZip, /\bHS\b|DVHS/.test(ex))
    out.push({
      prop_id: r.id, situs: r.situs || null, zip: r.zip || null, addr_key, legal: r.legal || null,
      sub_key: lp?.sub || null, blk: lp?.blk || null, lot: lp?.lot || null, legal_key: legalKey(lp),
      owners: r.owners || [], mailing: r.mailing || null, mailing_zip: mailZip || null, absentee,
      exemptions: ex || null, homestead: /\bHS\b/.test(ex.replace(/,/g, ' ')), over65: /\bOV65\b|\bOA\b/.test(ex.replace(/,/g, ' ')),
      year_built: r.yb || null, living_sqft: r.living ? Math.round(r.living) : null, land_sqft: r.land ? Math.round(r.land) : null, acres: r.landAcres || r.acres || null,
      last_deed_date: r.deed || null, last_deed_type: r.deedType || null, last_deed_instrument: r.deedInst || null, last_grantee: r.grantee || null,
      market_value: r.value || null, tax_year: r.valYear || null,
    })
  }
  return out
}
// Owner lives elsewhere? Homestead means the owner claims the house as residence, so never absentee.
// Otherwise: PO box, a different house number, a different street name start or a different ZIP.
export function isAbsentee(situs, zip, mailing, mailZip, homestead) {
  if (!mailing || homestead) return false
  const m = String(mailing).toUpperCase()
  if (/\bP\s*O\s*BOX\b|\bBOX\s+\d/.test(m)) return true
  if (!situs || !/^\d/.test(situs)) return !!(zip && mailZip && zip !== mailZip)
  const num = s => (String(s).match(/^\s*(\d+)/) || [])[1]
  const name = s => String(s).toUpperCase().replace(/^\s*\d+\s+/, '').replace(/^(N|S|E|W)\s+/, '').replace(/\s+/g, '').slice(0, 5)
  if (num(situs) !== num(m)) return true
  if (name(situs) !== name(m)) return true
  return !!(zip && mailZip && zip !== mailZip)
}
// Lookup maps over compact records (browser index).
export function dumpMaps(list) {
  const byId = new Map(), byAddr = new Map(), byBL = new Map()
  for (const r of list) {
    byId.set(String(r.prop_id), r)
    if (r.addr_key) { const a = byAddr.get(r.addr_key); if (a) a.push(r); else byAddr.set(r.addr_key, [r]) }
    if (r.blk && r.lot) { const k = `${r.blk}|${r.lot}`; const a = byBL.get(k); if (a) a.push(r); else byBL.set(k, [r]) }
  }
  return { byId, byAddr, byBL }
}
// Same street line can exist in two towns (El Paso, Socorro, Horizon): prefer the matching ZIP.
export function pickByZip(cands, zip) {
  if (!cands?.length) return null
  const z = String(zip || '').slice(0, 5)
  return (z && cands.find(r => r.zip === z)) || (cands.length === 1 || !z ? cands[0] : cands.find(r => !r.zip) || null)
}
// Pick the best record for a portal property: id, then address, then legal (block + lot + subdivision similarity).
export function pickByLegal(cands, legal) {
  const lp = noticeLegalParts(legal) || epcadLegalParts(legal); if (!lp || !cands?.length) return null
  let best = null, bs = 0
  for (const r of cands) { if (r.blk !== lp.blk || r.lot !== lp.lot) continue; const s = subSimilarity(r.sub_key, lp.sub); if (s > bs) { bs = s; best = r } }
  return bs >= 0.5 ? best : null
}
export function matchDump(maps, p) {
  if (p.epcadId && maps.byId.get(String(p.epcadId))) return maps.byId.get(String(p.epcadId))
  const hit = pickByZip(maps.byAddr.get(normStreet(p.address)), p.zip); if (hit) return hit
  const lp = noticeLegalParts(p.legal); if (!lp) return null
  return pickByLegal(maps.byBL.get(`${lp.blk}|${lp.lot}`), p.legal)
}
// Default $/sqft by ZIP for the estimated value when EPCAD has no market value yet (editable in Settings).
export const DEFAULT_PSF = { '79912': 180, '79932': 165, '79924': 115, '79904': 108, '79907': 103, '79936': 133, '79938': 138, '79925': 120, '79902': 155, '79903': 98, '79915': 108, '79927': 113, '79928': 123, '79911': 150, '79922': 175, '79935': 120, '79934': 135, '79905': 95, '79930': 105, '79901': 95, '79849': 110, '79835': 115, '79836': 100, '79821': 110 }
export function patchFromDump(r, p, psf = DEFAULT_PSF) {
  if (!r) return null
  let value = r.market_value || null, est = false
  if (!value && r.living_sqft) { const rate = Number(psf?.[String(p?.zip || r.zip || '').slice(0, 5)] ?? psf?.default ?? 120); value = Math.round(r.living_sqft * rate / 1000) * 1000; est = true }
  const mz = r.mailing ? splitAddress(r.mailing.replace(/(\d{5})-\d{4}$/, '$1')) : null
  const mailing = mz?.street || r.mailing || ''
  return {
    epcadId: r.prop_id, marketValue: value ?? undefined, valueEstimated: est, yearBuilt: r.year_built ?? undefined, sqft: r.living_sqft ?? undefined, lot: r.land_sqft ?? undefined,
    lastDeedDate: r.last_deed_date ?? undefined, lastDeed: r.last_deed_date ? { type: r.last_deed_type, instrument: r.last_deed_instrument, grantee: r.last_grantee } : undefined,
    legal: r.legal ?? undefined, homestead: !!r.homestead, over65: !!r.over65,
    owner: (r.owners && r.owners[0]) || r.mailing ? { name: (r.owners && r.owners[0]) || '', mailing, mailingCity: mz?.city || '', mailingState: mz?.state || '', mailingZip: r.mailing_zip || mz?.zip || '', absentee: !!r.absentee } : null,
    extraOwners: (r.owners || []).slice(1),
  }
}
