// Keyless reader for Texas "Notice of (Substitute) Trustee's Sale" documents.
// Same idea as the ESC portal: take the PDF text (rows rebuilt by position) and read it with rules, no AI and no keys.
// Works in the browser and in Node (pure functions). Every field carries a confidence: high | med | low.
import { splitAddress } from './address.js'

const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12 }
const pad = n => String(n).padStart(2, '0')

// "December 1, 2026" | "12/01/2026" | "Tuesday, the 1st day of December, 2026" | "2026-12-01" -> "2026-12-01"
export function parseDate(s) {
  if (!s) return null
  const t = String(s).toUpperCase().replace(/\s+/g, ' ')
  let m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/)
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${pad(m[1])}-${pad(m[2])}` }
  m = t.match(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEPT?|OCT|NOV|DEC)[A-Z]*\.?\s+(\d{1,2})(?:ST|ND|RD|TH)?,?\s+(\d{4})\b/)
  if (m) return `${m[3]}-${pad(MONTHS[m[1]])}-${pad(m[2])}`
  m = t.match(/\b(\d{1,2})(?:ST|ND|RD|TH)?\s+(?:DAY\s+OF\s+)?(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEPT?|OCT|NOV|DEC)[A-Z]*,?\s+(\d{4})\b/)
  if (m) return `${m[3]}-${pad(MONTHS[m[2]])}-${pad(m[1])}`
  m = t.match(/\b(\d{4})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEPT?|OCT|NOV|DEC)[A-Z]*\s+(\d{1,2})\b/)
  if (m) return `${m[1]}-${pad(MONTHS[m[2]])}-${pad(m[3])}`
  return null
}
export const parseMoney = s => { const m = String(s || '').match(/\$?\s*([\d]{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+(?:\.\d{2})?)/); if (!m) return null; const n = Number(m[1].replace(/,/g, '')); return Number.isFinite(n) ? n : null }

// Labels seen in El Paso notices (law firms use different templates). Order does not matter.
const LABELS = {
  sale_date: [/date\s+of\s+(?:the\s+)?sale/i, /(?:^|\n)\s*date\s*:/i, /sale\s+date/i],
  sale_time: [/(?:^|\n)\s*time\s*:/i, /time\s+of\s+(?:the\s+)?sale/i, /earliest\s+time\s+(?:the\s+)?sale\s+will\s+begin/i],
  sale_place: [/(?:^|\n)\s*place\s*:/i, /place\s+of\s+(?:the\s+)?sale/i, /location\s+of\s+sale/i],
  grantors: [/grantor\(?s?\)?\s*\/\s*mortgagor\(?s?\)?/i, /original\s+(?:mortgagor|grantor)\(?s?\)?(?:\s*\/\s*grantor\(?s?\)?)?/i, /mortgagor\(?s?\)?/i, /grantor\(?s?\)?/i, /borrower\(?s?\)?/i],
  original_mortgagee: [/original\s+(?:beneficiary\s*\/\s*)?mortgagee/i, /original\s+beneficiary/i, /original\s+lender/i],
  mortgagee: [/current\s+(?:beneficiary\s*\/\s*)?mortgagee/i, /current\s+beneficiary/i, /current\s+holder/i, /(?:^|\n)\s*mortgagee\s*:/i, /(?:^|\n)\s*beneficiary\s*:/i],
  servicer: [/mortgage\s+servicer(?:'s)?(?:\s+name)?/i, /loan\s+servicer/i, /(?:^|\n)\s*servicer\s*:/i],
  dot_date: [/deed\s+of\s+trust\s+dated/i, /(?:^|\n)\s*(?:security\s+instrument|deed\s+of\s+trust)\s+date/i, /date\s+of\s+(?:the\s+)?(?:security\s+instrument|deed\s+of\s+trust)/i, /(?:^|\n)\s*dated\s*:/i],
  instrument: [/recorded\s+(?:in|under|as)(?:\s+instrument)?/i, /instrument\s*(?:no\.?|number|#)/i, /document\s*(?:no\.?|number|#)/i, /clerk'?s\s+file\s*(?:no\.?|number|#)/i, /recording\s+information/i],
  legal: [/legal\s+description/i, /property\s+description/i, /(?:^|\n)\s*property\s*:/i],
  address: [/property\s+address/i, /commonly\s+known\s+as/i, /street\s+address/i, /physical\s+address/i, /reported\s+address/i],
  county: [/property\s+county/i, /(?:^|\n)\s*county\s*:/i],
  trustees: [/substitute\s+trustee\(?s?\)?\s*(?:names?)?(?!\s*(?:address|sale|'s\s+sale))/i, /appointed\s+(?:as\s+)?substitute\s+trustees?/i, /(?:^|\n)\s*trustee\(?s?\)?\s*:/i],
  trustee_address: [/substitute\s+trustee(?:'s|s')?\s+address/i, /trustee(?:'s)?\s+address/i],
  amount: [/original\s+(?:principal\s+)?(?:loan\s+)?amount/i, /original\s+principal\s+(?:sum|balance)/i, /note\s+amount/i, /amount\s+of\s+(?:the\s+)?(?:note|loan)/i],
  ts_number: [/(?:^|\n)\s*(?:t\.?s\.?|trustee\s+sale|file|loan)\s*(?:no\.?|number|#)/i],
  terms: [/terms\s+of\s+sale/i, /obligations?\s+secured/i, /default\s+and\s+request/i, /notice\s+of\s+acceleration/i, /questions\s+concerning/i, /assert\s+and\s+protect/i, /active\s+military/i, /limitation\s+of\s+damages/i],
}
const ALL = Object.entries(LABELS).flatMap(([k, rs]) => rs.map(r => [k, r]))

// Find label hits with positions, then each value runs to the next label (or a blank line / max length).
export function labelHits(text) {
  const hits = []
  for (const [k, r] of ALL) {
    const g = new RegExp(r.source, r.flags.includes('g') ? r.flags : r.flags + 'g')
    let m
    while ((m = g.exec(text))) {
      let end = m.index + m[0].length
      const after = text.slice(end, end + 4).match(/^\s*[:.\-]?\s*/)
      end += after ? after[0].length : 0
      hits.push({ k, start: m.index + (m[0].startsWith('\n') ? 1 : 0), end })
      if (g.lastIndex === m.index) g.lastIndex++
    }
  }
  hits.sort((a, b) => a.start - b.start || b.end - a.end)
  // drop hits nested inside an earlier, longer label
  const out = []
  for (const h of hits) { const prev = out[out.length - 1]; if (prev && h.start < prev.end) continue; out.push(h) }
  return out
}
export function valueOf(text, hits, k, max = 400, valid = v => !!v, oneLine = false, keepLines = false) {
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i]
    if (h.k !== k) continue
    const next = hits[i + 1]?.start ?? text.length
    let v = text.slice(h.end, Math.min(next, h.end + max))
    v = oneLine ? v.split('\n').find(l => l.trim()) || '' : v.split(/\n\s*\n/)[0]
    v = keepLines ? v.split('\n').map(clean).filter(Boolean).join('\n') || null : clean(v)
    if (v && valid(v)) return v
  }
  return null
}
const clean = s => String(s || '').replace(/\s+/g, ' ').replace(/^(?:\s*\(\s*s\s*\))?[\s:;,.\-]+|[\s;,]+$/g, '').trim() || null

const ADDR_RE = /\b(\d{1,6}[A-Z]?\s+(?:[NSEW]\.?\s+)?[A-Z0-9][A-Z0-9 .'#-]{1,60}?\s(?:ST|STREET|DR|DRIVE|AVE|AVENUE|RD|ROAD|BLVD|BOULEVARD|LN|LANE|CT|COURT|CIR|CIRCLE|WAY|PL|PLACE|LOOP|TRL|TRAIL|PKWY|PARKWAY|CV|COVE|TER|TERRACE|PASS|PATH|HWY|PLZ)\b\.?(?:\s+[NSEW]{1,2}\b)?(?:\s*(?:#|APT|UNIT)\s*[A-Z0-9-]+)?)[,\s]+([A-Z .]{3,25}?)[,\s]+(?:TX|TEXAS)\.?\s*(\d{5})(?:-\d{4})?/i
const FIRMS_RE = /([A-Z][A-Za-z&.,' ]{2,60}?(?:Attorneys(?: at Law)?|Law Firm|Law Group|Law Offices?|& Associates|Associates)?,?\s*(?:LLP|L\.L\.P\.|P\.C\.|PC|PLLC|P\.L\.L\.C\.))(?=[\s,.]|$)|([A-Z][A-Za-z&.,' ]{2,60}?(?:Law Firm|Law Group|Law Offices?|Attorneys at Law))(?=[\s,.]|$)/

// Pull the sale time window: "between 10:00 AM and 1:00 PM" or "begin at 10:00 AM ... three hours"
const TIME = /(\d{1,2}(?::\d{2})?\s*[AP]\.?\s?M\.?)/gi
const HAS_TIME = /\d{1,2}(?::\d{2})?\s*[AP]\.?\s?M/i
function saleWindow(v, flat) {
  const t = String(v || '').replace(/\s+/g, ' ')
  const times = [...t.matchAll(TIME)].map(m => up(m[1]))
  const three = /three\s*\(?3?\)?\s*hours/i.test(t)
  if (times.length >= 2) return `${times[0]} to ${times[1]}`
  if (times.length === 1) return three ? `${times[0]} to ${plus3(times[0])}` : times[0]
  if (flat && flat !== v) return saleWindow((flat.match(/(?:between|begin|commence|earliest time)[^.]{0,90}/i) || [''])[0])
  return null
}
const up = s => s.toUpperCase().replace(/[.\s]/g, '').replace(/(AM|PM)$/, ' $1').replace(/^(\d{1,2}) /, '$1:00 ')
function plus3(s) {
  const m = s.match(/(\d{1,2}):(\d{2}) (AM|PM)/); if (!m) return s
  let h = (+m[1] % 12) + (m[3] === 'PM' ? 12 : 0) + 3
  const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12
  return `${h}:${m[2]} ${ap}`
}

function splitNames(v) {
  if (!v) return []
  return v.replace(/\b(?:AND|&)\s+(?:HIS|HER)\s+(?:WIFE|HUSBAND|SPOUSE)\b/gi, '')
    .replace(/,?\s*\b(?:A\s+)?(?:SINGLE|MARRIED|UNMARRIED)\s+(?:MAN|WOMAN|PERSON)\b/gi, '')
    .replace(/,?\s*\b(?:HUSBAND\s+AND\s+WIFE|AS\s+HIS\s+SOLE\s+AND\s+SEPARATE\s+PROPERTY|AS\s+HER\s+SOLE\s+AND\s+SEPARATE\s+PROPERTY)\b/gi, '')
    .split(/\s*(?:;|\bAND\b|&|,(?=\s*[A-Z][A-Z]+\s+[A-Z]))\s*/i)
    .map(s => s.replace(/[.,]+$/, '').trim()).filter(s => s.length > 3 && !/^(?:N\/A|NONE)$/i.test(s))
}
export function splitTrustees(v) {
  if (!v) return []
  return v.split(/\s*(?:,|;|\n|\bOR\b|\bAND\b|&)\s*/i)
    .map(s => s.replace(/^(?:SUBSTITUTE\s+TRUSTEES?|ANY\s+OF\s+THEM)\s*/i, '').trim())
    .filter(s => /^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3}$/.test(s) && !/(?:LLC|LLP|P\.?C\.?|COUNTY|TEXAS|SUITE|DRIVE|STREET)$/i.test(s) && !/\b(?:LAW|GROUP|FIRM|ATTORNEYS?|BANK|MORTGAGE|SERVICING|ASSOCIATES|CORP|INC|COMPANY|LENDING|TRUST|ADDRESS|NOTICE|SALE)\b/i.test(s))
    .slice(0, 12)
}
const conf = (v, ok) => (v == null || v === '' || (Array.isArray(v) && !v.length) ? 'low' : ok ? 'high' : 'med')

export function parseNotice(raw) {
  const text = String(raw || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/[’‘]/g, "'").replace(/[“”]/g, '"')
  const flat = text.replace(/\s+/g, ' ')
  const hits = labelHits(text)
  const f = {}, c = {}

  // Sale date
  let sd = parseDate(valueOf(text, hits, 'sale_date', 120, v => !!parseDate(v), true))
  let sdC = sd ? 'high' : 'low'
  if (!sd) {
    const m = flat.match(/(?:on|held)\s+(?:the\s+first\s+)?tuesday,?\s+(?:the\s+)?([^.;]{6,45}?\d{4})/i) || flat.match(/first\s+tuesday\s+(?:in|of)\s+([A-Z]+,?\s+\d{4})/i)
    if (m) { sd = parseDate(m[1]); sdC = sd ? 'med' : 'low' }
  }
  if (sd && !isFirstTuesday(sd)) sdC = 'med'
  f.sale_date = sd; c.sale_date = sdC

  f.sale_time_window = saleWindow(valueOf(text, hits, 'sale_time', 300, v => HAS_TIME.test(v)), flat)
  c.sale_time_window = conf(f.sale_time_window, true)
  const place = valueOf(text, hits, 'sale_place', 300)
  f.sale_location = place || (flat.match(/(?:at|in)\s+the\s+(El Paso County (?:Coliseum|Courthouse)[^.;]{0,140})/i) || [])[1] || null
  c.sale_location = conf(f.sale_location, !!place)

  // Property address
  const addrRaw = valueOf(text, hits, 'address', 160, v => /\d/.test(v), true)
  let am = addrRaw ? addrRaw.match(ADDR_RE) : null
  let addrC = am ? 'high' : 'low'
  if (am) { f.property_address = clean(am[1]).toUpperCase(); f.city = am[2].trim().toUpperCase(); f.zip = am[3] }
  else if (addrRaw) { const sp = splitAddress(addrRaw); f.property_address = (sp.street || addrRaw).toUpperCase(); f.city = sp.city.toUpperCase(); f.zip = sp.zip; addrC = 'med' }
  else {
    const all = [...flat.matchAll(new RegExp(ADDR_RE.source, 'gi'))].filter(x => !/COLISEUM|PAISANO|COURTHOUSE|SUITE|PLAZA/i.test(flat.slice(Math.max(0, x.index - 40), x.index + x[0].length)))
    if (all[0]) { f.property_address = clean(all[0][1]).toUpperCase(); f.city = all[0][2].trim().toUpperCase(); f.zip = all[0][3]; addrC = 'med' }
  }
  if (f.property_address) f.property_address = f.property_address.replace(/\s+/g, ' ')
  c.property_address = addrC; c.zip = conf(f.zip, /^79\d{3}|^88\d{3}/.test(f.zip || ''))

  // Legal description (Lot / Block / Addition)
  let legal = valueOf(text, hits, 'legal', 500)
  if (legal && !/\b(LOT|LOTS|BLOCK|TRACT|UNIT|ADDITION|SUBDIVISION|SURVEY)\b/i.test(legal)) legal = null
  if (!legal) { const m = flat.match(/\b((?:ALL OF\s+)?LOTS?\s+\d+[A-Z]?[^.]{0,240}?(?:ADDITION|SUBDIVISION|REPLAT|UNIT\s+\w+|SURVEY\s+\d+)[^.;]{0,160})/i); legal = m ? m[1] : null }
  f.legal_description = legal ? legal.replace(/\s+/g, ' ').slice(0, 400) : null
  c.legal_description = conf(f.legal_description, /\bLOT\b/i.test(f.legal_description || '') && /\bBLOCK\b/i.test(f.legal_description || ''))

  // People and companies
  const g = valueOf(text, hits, 'grantors', 220, v => /[A-Z]{2,}/i.test(v), true)
  let grantors = splitNames(g)
  if (!grantors.length) { const m = flat.match(/executed\s+by\s+([A-Z][^,]{3,120}?)(?:,|\s+to\s+|\s+as\s+grantor)/i); if (m) grantors = splitNames(m[1]) }
  f.grantors = grantors; c.grantors = conf(grantors, !!g)
  f.mortgagee = trimCo(valueOf(text, hits, 'mortgagee', 160, undefined, true))
  c.mortgagee = conf(f.mortgagee, true)
  f.original_mortgagee = trimCo(valueOf(text, hits, 'original_mortgagee', 160, undefined, true))
  f.servicer = trimCo(valueOf(text, hits, 'servicer', 160, undefined, true))
  c.servicer = conf(f.servicer, true)
  if (!f.mortgagee && f.servicer) { f.mortgagee = f.servicer; c.mortgagee = 'med' }
  const tv = valueOf(text, hits, 'trustees', 400, v => splitTrustees(v).length > 0, false, true)
  f.trustees = splitTrustees(tv); c.trustees = conf(f.trustees, !!tv)

  // Deed of trust / recording
  f.deed_of_trust_date = parseDate(valueOf(text, hits, 'dot_date', 80, v => !!parseDate(v), true)) || parseDate((flat.match(/\bon\s+([A-Z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+a\s+deed\s+of\s+trust/i) || [])[1]) || parseDate((flat.match(/deed\s+of\s+trust[^.]{0,60}?dated\s+([A-Z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})/i) || [])[1])
  c.deed_of_trust_date = conf(f.deed_of_trust_date, true)
  const instV = valueOf(text, hits, 'instrument', 200) || ''
  const inst = (instV.match(/\b(?:no\.?|number|#)?\s*:?\s*(\d{4}[-\s]?\d{4,10}|\d{7,14})\b/i) || flat.match(/(?:instrument|document|clerk'?s\s+file)\s*(?:no\.?|number|#)\s*:?\s*(\d{4}[-\s]?\d{4,10}|\d{7,14})/i) || [])[1]
  f.instrument_number = inst ? inst.replace(/\s/g, '') : null
  c.instrument_number = conf(f.instrument_number, !!instV)
  const volPage = flat.match(/volume\s+(\d+)[,\s]+page\s+(\d+)/i)
  f.volume_page = volPage ? `${volPage[1]}/${volPage[2]}` : null

  const amtV = valueOf(text, hits, 'amount', 80)
  f.original_loan_amount = parseMoney(amtV) || parseMoney((flat.match(/original\s+(?:principal\s+)?(?:amount|sum)\s+of\s+(\$\s*[\d,]+(?:\.\d{2})?)/i) || [])[1])
  c.original_loan_amount = conf(f.original_loan_amount, !!amtV)

  // County, filing stamp, firm
  const cv = valueOf(text, hits, 'county', 40, undefined, true)
  f.county = cv ? cv.replace(/\s*COUNTY.*$/i, '').toUpperCase() : (/el\s+paso\s+county/i.test(flat) ? 'EL PASO' : null)
  c.county = conf(f.county, !!cv)
  const filed = flat.match(/FILED[^A-Z0-9]{0,6}(?:FOR\s+RECORD\s*)?(?:ON\s*)?((?:\d{4}\s+[A-Z]{3}\s+\d{1,2})|(?:[A-Z]{3,9}\.?\s+\d{1,2},?\s+\d{4})|(?:\d{1,2}\/\d{1,2}\/\d{2,4}))/i)
  f.filing_date = filed ? parseDate(filed[1]) : null
  c.filing_date = conf(f.filing_date, true)
  let firm = null
  for (const line of text.split('\n').reverse()) { const fm = line.trim().match(FIRMS_RE); if (fm) { firm = fm[1] || fm[2]; break } }
  f.attorney_or_firm = firm ? clean(firm) : null
  c.attorney_or_firm = conf(f.attorney_or_firm, true)
  const ts = valueOf(text, hits, 'ts_number', 40)
  f.ts_number = ts ? (ts.match(/[A-Z0-9-]{4,}/i) || [])[0] || null : null

  const keyFields = ['sale_date', 'property_address', 'grantors', 'mortgagee', 'trustees', 'legal_description']
  const score = Math.round(keyFields.reduce((a, k) => a + (c[k] === 'high' ? 1 : c[k] === 'med' ? 0.6 : 0), 0) / keyFields.length * 100)
  return { fields: f, confidence: c, score }
}
function trimCo(v) {
  if (!v) return null
  return v.replace(/\s*(?:,\s*)?(?:whose\s+address|located\s+at|c\/o\s|by\s+and\s+through|as\s+(?:the\s+)?(?:current\s+)?(?:mortgagee|beneficiary)|which\s+is).*$/i, '').replace(/[.,]+$/, '').trim().slice(0, 140) || null
}
export function isFirstTuesday(iso) {
  const d = new Date(iso + 'T12:00:00Z')
  return d.getUTCDay() === 2 && d.getUTCDate() <= 7
}

// A monthly packet from the county can hold dozens of notices. Split on each notice heading.
const HEAD_RE = /(?:^|\n)[ \t]*(?:\d+[ \t]*)?(NOTICE\s+OF\s+(?:SUBSTITUTE\s+)?TRUSTEE'?S?\s+SALE|NOTICE\s+OF\s+FORECLOSURE\s+SALE|NOTICE\s+OF\s+(?:SUBSTITUTE\s+)?TRUSTEE\s+SALE|NOTICE\s+OF\s+SALE)\b/gi
export function splitNotices(raw) {
  const text = String(raw || '').replace(/\r/g, '')
  const idx = []
  let m
  while ((m = HEAD_RE.exec(text))) idx.push(m.index)
  if (idx.length <= 1) return [text]
  const parts = idx.map((s, i) => text.slice(s, idx[i + 1] ?? text.length))
  if (idx[0] > 0) parts[0] = text.slice(0, idx[0]) + parts[0]
  // merge fragments that are too short to be a notice (a repeated heading or a cover line)
  const out = []
  for (const p of parts) {
    const isReal = p.length > 350 && /(sale|deed of trust|mortgag)/i.test(p)
    if (!isReal && out.length) out[out.length - 1] += p
    else out.push(p)
  }
  return out.filter(p => p.trim().length > 80)
}
export function parseNotices(raw) { return splitNotices(raw).map(t => ({ ...parseNotice(t), text: t })) }
