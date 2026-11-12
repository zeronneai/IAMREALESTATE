// USPS style address normalization shared by the browser and the API (no dependencies).
// Used to match notices, EPCAD parcels, tax lists and CSV imports to the same property.

const SUFFIX = {
  ALLEY: 'ALY', AVENUE: 'AVE', AV: 'AVE', AVEN: 'AVE', BOULEVARD: 'BLVD', BOUL: 'BLVD', BLV: 'BLVD', CIRCLE: 'CIR', CIRC: 'CIR', CRCL: 'CIR',
  COURT: 'CT', CRT: 'CT', COVE: 'CV', CRESCENT: 'CRES', DRIVE: 'DR', DRV: 'DR', EXPRESSWAY: 'EXPY', FREEWAY: 'FWY', HIGHWAY: 'HWY', HIWAY: 'HWY',
  LANE: 'LN', LOOP: 'LOOP', PARKWAY: 'PKWY', PKY: 'PKWY', PLACE: 'PL', PLAZA: 'PLZ', POINT: 'PT', ROAD: 'RD', SQUARE: 'SQ', STREET: 'ST', STR: 'ST',
  TERRACE: 'TER', TRAIL: 'TRL', TRL: 'TRL', WAY: 'WAY', PASS: 'PASS', PATH: 'PATH', RUN: 'RUN', TRACE: 'TRCE', CROSSING: 'XING', VIEW: 'VW', VISTA: 'VIS',
}
const DIR = { NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W', NORTHEAST: 'NE', NORTHWEST: 'NW', SOUTHEAST: 'SE', SOUTHWEST: 'SW' }
const UNIT_RE = /\s+(?:#|APT|APARTMENT|UNIT|STE|SUITE|BLDG|BUILDING|SPC|SPACE|LOT)\s*[A-Z0-9-]+\s*$/

// Full street line to a stable key, e.g. "4281 North Edgemere Boulevard, Apt 2" -> "4281 N EDGEMERE BLVD"
export function normStreet(s) {
  let a = String(s || '').toUpperCase()
    .replace(/,.*$/, '')                 // drop ", El Paso, TX 79938"
    .replace(/[.'`]/g, '')
    .replace(/[^A-Z0-9#\s-]/g, ' ')
    .replace(/\s+/g, ' ').trim()
  a = a.replace(UNIT_RE, '')
  const parts = a.split(' ').map((w, i, arr) => {
    if (DIR[w]) return DIR[w]
    if (i === arr.length - 1 && SUFFIX[w]) return SUFFIX[w]
    return w
  })
  return parts.join(' ').trim()
}
export const unitOf = s => (String(s || '').toUpperCase().match(/(?:#|APT|UNIT|STE|SUITE)\s*([A-Z0-9-]+)/) || [])[1] || ''

// Split "1234 MAIN ST, EL PASO, TX 79912" into parts. Tolerates missing commas.
export function splitAddress(s) {
  const raw = String(s || '').replace(/\s+/g, ' ').trim()
  const zip = (raw.match(/\b(\d{5})(?:-\d{4})?\s*$/) || raw.match(/\b(79\d{3}|88\d{3})\b/) || [])[1] || ''
  let rest = raw.replace(/\s*\b\d{5}(?:-\d{4})?\s*$/, '').trim()
  let state = ''
  const st = rest.match(/,?\s*\b(TX|TEXAS|NM|NEW MEXICO)\s*$/i)
  if (st) { state = /^N/i.test(st[1]) ? 'NM' : 'TX'; rest = rest.slice(0, st.index).trim() }
  let city = ''
  const cm = rest.match(/,\s*([^,]+)$/)
  if (cm) { city = cm[1].trim(); rest = rest.slice(0, cm.index).trim() }
  else {
    const known = rest.match(/\s(EL PASO|SOCORRO|HORIZON CITY|CANUTILLO|ANTHONY|SAN ELIZARIO|CLINT|FABENS|VINTON|SANTA TERESA|LAS CRUCES)$/i)
    if (known) { city = known[1]; rest = rest.slice(0, known.index).trim() }
  }
  return { street: rest.replace(/,\s*$/, ''), city: titleCase(city), state, zip }
}
export const titleCase = s => String(s || '').toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase())
export const addrKey = (street, zip) => `${normStreet(street)}|${String(zip || '').slice(0, 5)}`
