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
    .replace(/,?\s*\b(?:A|AN)\s+SOLE\s+OWNERSHIP\b|,?\s*\bAN?\s+UNMARRIED\s+(?:MAN|WOMAN|PERSON)\b/gi, '')
    .replace(/,?\s*\b(?:HUSBAND\s+AND\s+WIFE|AS\s+HIS\s+SOLE\s+AND\s+SEPARATE\s+PROPERTY|AS\s+HER\s+SOLE\s+AND\s+SEPARATE\s+PROPERTY)\b/gi, '')
    .split(/\s*(?:;|\bAND\b|&|,(?=\s*[A-Z][A-Z]+\s+[A-Z]))\s*/i)
    .map(s => s.replace(/[.,]+$/, '').trim()).filter(s => s.length > 3 && !/^(?:N\/A|NONE)$/i.test(s))
}
export function splitTrustees(v) {
  if (!v) return []
  return v.split(/\s*(?:,|;|\n|\bOR\b|\bAND\b|&)\s*/i)
    .map(s => s.replace(/^(?:SUBSTITUTE\s+TRUSTEES?|ANY\s+OF\s+THEM)\s*/i, '').trim())
    .filter(s => /^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3}$/.test(s) && !/(?:LLC|LLP|P\.?C\.?|COUNTY|TEXAS|SUITE|DRIVE|STREET)$/i.test(s) && !/\b(?:LAW|GROUP|FIRM|ATTORNEYS?|BANK|MORTGAGE|SERVICING|ASSOCIATES|CORP|INC|COMPANY|LENDING|TRUST|ADDRESS|NOTICE|SALE|APPOINTMENT|INSTRUMENT|PROPERTY|IDENTIFIED|AUTHORIZED|AGENT|SELL|SIGNING|THE)\b/i.test(s))
    .slice(0, 12)
}
const conf = (v, ok) => (v == null || v === '' || (Array.isArray(v) && !v.length) ? 'low' : ok ? 'high' : 'med')

// El Paso County Clerk adds a cover page ("THIS PAGE IS PART OF THE INSTRUMENT", receipt, fees). Keep its
// "Recorded On" date (the filing date) and drop the page so its masked instrument number is never used.
export function stripCoverPages(raw) {
  const pages = String(raw || '').split('\f')
  let filed = null
  const keep = pages.filter(pg => {
    const isCover = /PART OF THE INSTRUMENT|File Information|Receipt Number|Number of Pages/i.test(pg) && !/(?:date|place)\s+of\s+sale|trustee'?s?\s+sale|foreclosure\s+sale/i.test(pg)
    if (isCover) { const m = pg.match(/Recorded\s+On\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i); if (m && !filed) filed = parseDate(m[1]) }
    return !isCover
  })
  return { text: keep.join('\n'), filed }
}

const DATE_SRC = String.raw`(?:\d{1,2}\/\d{1,2}\/\d{2,4}|(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEPT?|OCT|NOV|DEC)[A-Z]*\.?\s+\d{1,2}(?:ST|ND|RD|TH)?,?\s+\d{4}|\d{1,2}(?:ST|ND|RD|TH)?\s+DAY\s+OF\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEPT?|OCT|NOV|DEC)[A-Z]*,?\s+\d{4})`
const first = (str, res) => { for (const r of res) { const m = str.match(r); if (m && m[1] && m[1].trim()) return m[1].trim() } return null }
const tidy = v => v ? v.replace(/[\s:;.|,'"—-]+$/g, '').replace(/^[\s:;.|,—-]+/, '').replace(/\s+/g, ' ').trim() || null : null
const okCompany = v => !!v && /^[A-Z0-9]/.test(v) && !/^(?:if|is|for|the undersigned|of the|as|and|in|to)\b/i.test(v) && v.length >= 4
const ELP = s => s && /^EL\.?\s*PASO$/i.test(s.trim()) ? 'EL PASO' : s

function parseNoticeRules(raw) {
  const cover = stripCoverPages(String(raw || '').replace(/\r/g, ''))
  const text = cover.text.replace(/[ \t]+/g, ' ').replace(/[’‘]/g, "'").replace(/[“”]/g, '"')
  const flat = text.replace(/\s+/g, ' ')
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const f = {}, c = {}

  // ---- Sale date: labeled first, but it must be a "first Tuesday"; else any first-Tuesday date in the notice
  const labeled = first(flat, [
    new RegExp(String.raw`date\s+of\s+(?:the\s+)?sale\s*:?\s*(?:[A-Z]+day,?\s+(?:the\s+)?)?(` + DATE_SRC + ')', 'i'),
    new RegExp(String.raw`sale\s+information\s*:?\s*(?:[A-Z]+day,?\s+(?:the\s+)?)?(` + DATE_SRC + ')', 'i'),
    new RegExp(String.raw`place\s+of\s+sale\.?\s*date\s*:\s*(` + DATE_SRC + ')', 'i'),
    new RegExp(String.raw`(?:^|\s)date\s*:\s*(` + DATE_SRC + ')', 'i'),
  ])
  const allDates = [...flat.matchAll(new RegExp(DATE_SRC, 'gi'))].map(m => parseDate(m[0])).filter(Boolean)
  const tuesdays = allDates.filter(d => isFirstTuesday(d) && d >= '2020-01-01')
  let sd = parseDate(labeled), sdC = 'low'
  if (sd && isFirstTuesday(sd)) sdC = 'high'
  else if (tuesdays.length) { sd = tuesdays[0]; sdC = 'high' }
  else if (sd) sdC = 'med'
  f.sale_date = sd || null; c.sale_date = sd ? sdC : 'low'

  // ---- Time window
  const tm = flat.match(/(?:earliest\s+time[^.]{0,40}?|time\s+of\s+sale\s*:?[^0-9]{0,10}|time\s*:\s*[^0-9]{0,60}?|\bat\s+)(\d{1,2}(?::\d{2})?\s*[AP]\.?\s?M\.?)/i) || flat.match(/(\d{1,2}:\d{2}\s*[AP]\.?\s?M\.?)/i)
  if (tm) { const t0 = up(tm[1]); f.sale_time_window = /three\s*\(?3?\)?\s*hours/i.test(flat) ? `${t0} to ${plus3(t0)}` : t0 } else f.sale_time_window = null
  c.sale_time_window = f.sale_time_window ? 'high' : 'low'

  // ---- Place
  if (/coliseum/i.test(flat)) f.sale_location = 'El Paso County Coliseum, 4100 E. Paisano Dr, El Paso, TX 79905'
  else f.sale_location = tidy(first(flat, [/place\s+of\s+sale(?:\s+of\s+property)?\s*:\s*(.{10,160}?)(?:,?\s+or\s+(?:if|as)|\.\s)/i, /\bplace\s*:\s*(.{10,160}?)(?:,?\s+or\s+(?:if|as)|\.\s)/i, /at\s+the\s+(El Paso County Courthouse[^.;]{0,120})/i]))
  c.sale_location = f.sale_location ? 'high' : 'low'

  // ---- Property address: labeled line, else a header line that is only an address
  let addr = null, addrC = 'low'
  const lineAddr = l => { const m = l.match(ADDR_RE); return m && !/COLISEUM|PAISANO|SUITE|BOISE|DALLAS|IRVINE|GREENVILLE|ALPHARETTA|HUNTINGTON|FISHERS|VIRGINIA BEACH/i.test(l) ? m : null }
  for (let i = 0; i < lines.length && !addr; i++) {
    if (/property\s+address|mailing\s+address|commonly\s+known\s+as|reported\s+address|street\s+address|physical\s+address/i.test(lines[i])) {
      const m = lineAddr(lines[i].replace(/^.*?(?:address|known\s+as)[^:]*:?\s*/i, '')) || lineAddr(lines[i] + ' ' + (lines[i + 1] || ''))
      if (m) { addr = m; addrC = 'high' }
    }
  }
  if (!addr) for (const l of lines.slice(0, 15)) { const m = lineAddr(l); if (m) { addr = m; addrC = 'high'; break } }
  if (!addr) for (const l of lines) { const m = lineAddr(l); if (m) { addr = m; addrC = 'med'; break } }
  if (addr) { f.property_address = clean(addr[1]).toUpperCase().replace(/^\d{1,2}-\d+\s+/, ''); f.city = ELP(addr[2].trim().toUpperCase()); f.zip = addr[3] }
  else { f.property_address = null; f.city = null; f.zip = null }
  c.property_address = addrC; c.zip = conf(f.zip, /^79\d{3}|^88\d{3}/.test(f.zip || ''))

  // ---- Legal description
  const lg = flat.match(/((?:ALL\s+OF\s+)?LOTS?\s+\d+[A-Z]?\b[\s\S]{10,420}?(?:TEXAS|RECORDS|\d{6,}|THEREOF)\.)(?=\s|$)/i) || flat.match(/((?:ALL\s+OF\s+)?LOTS?\s+\d+[A-Z]?,?\s+(?:IN\s+)?BLOCK\s+\d+[^;]{10,300})/i) || flat.match(/((?:TRACT|PARCEL)\s+[\w.-]+[^;]{10,300}?(?:TEXAS|SURVEY)[^.]{0,80}\.)/i)
  f.legal_description = lg ? lg[1].replace(/\s+/g, ' ').slice(0, 420) : null
  c.legal_description = conf(f.legal_description, /\bLOT\b/i.test(f.legal_description || '') && /\bBLOCK\b/i.test(f.legal_description || ''))

  // ---- Owners (grantors)
  let gl = null
  for (let i = 0; i < lines.length && !gl; i++) {
    const m = lines[i].match(/(?:grantor\(?s?\)?|mortgagor\(?s?\)?(?:\s*\/\s*grantor\(?s?\)?)?|borrower\(?s?\)?)\s*:\s*(.+)$/i)
    if (m) { gl = m[1]; const nx = lines[i + 1] || ''; if (/^[A-Z][A-Z .,'-]{2,40}$/.test(nx) && !/:/.test(nx) && gl.split(/\s+/).length < 3) gl += ' ' + nx }
  }
  const ex = first(flat, [/executed\s+by\s+([A-Z][A-Z .,'-]{3,90}?)(?:,\s+(?=[a-z])|,?\s+(?:secures|and\s+payable|as\s+grantor|to\s+secure|to\s+the\s+order))/])
  let grantors = splitNames(gl)
  const exNames = splitNames(ex)
  if ((!grantors.length || grantors.every(n => n.split(/\s+/).length < 2)) && exNames.length) grantors = exNames
  f.grantors = grantors; c.grantors = conf(grantors, grantors.some(n => n.split(/\s+/).length >= 2))

  // ---- Lender, servicer, original mortgagee
  const lineVal = re => { for (const l of lines) { const m = l.match(re); if (m && okCompany(tidy(m[1]))) return tidy(m[1].split(/\s+\|\s+|\s{2,}|\s+Mortgage\s+Servicer'?s?\s+Address/i)[0]) } return null }
  f.mortgagee = trimCo(lineVal(/current\s+(?:beneficiary\s*\/\s*)?mortgagee\s*:\s*(.+)$/i) || lineVal(/current\s+beneficiary\s*:\s*(.+)$/i)
    || first(flat, [/\.\s+([A-Z][A-Za-z0-9 ,.&'-]{3,80}?),\s+whose\s+address\s+is\s+.{5,180}?,\s+is\s+the\s+current\s+mortgagee/, /([A-Z][A-Za-z0-9 .&'-]{3,60}?(?:,\s*(?:LLC|INC\.?|N\.A\.|CORP\.?))?)\s+is\s+the\s+current\s+mortgagee/]))
  c.mortgagee = f.mortgagee ? 'high' : 'low'
  f.servicer = trimCo(lineVal(/mortgage\s+servicer\s*:\s*(.+)$/i)
    || first(flat, [/(?:\band\s+|\.\s+)(?!Note\b)([A-Z][A-Za-z0-9.&'-]+(?:\s+[A-Z][A-Za-z0-9.&'-]+){0,4}(?:,\s*(?:LLC|INC\.?|N\.A\.))?)\s+is\s+the\s+current\s+mortgage\s+servicer/, /([A-Z][A-Za-z0-9 ,.&'-]{3,60}?)\s+as\s+Mortgage\s+Servicer/]))
  if (f.servicer && !okCompany(f.servicer)) f.servicer = null
  c.servicer = f.servicer ? 'high' : 'low'
  if (!f.mortgagee && f.servicer) { f.mortgagee = f.servicer; c.mortgagee = 'med' }
  f.original_mortgagee = trimCo(lineVal(/original\s+(?:beneficiary\s*\/\s*)?mortgagee\s*:\s*(.+)$/i) || tidy(first(flat, [/original\s+mortgagee\s*:\s*(.{5,160}?)(?:,?\s+its\s+successors|\s+Original\s+Principal|\s+Current)/i])))

  // ---- Substitute trustees (people or companies)
  const tsrc = first(flat, [
    /substitute\s+trustee\(?s?\)?\s*:\s*(.{5,400}?)(?:,?\s+any\s+to\s+act|\s+substitute\s+trustee\s+address|\s+c\/o\s)/i,
    /appoints\s+in\s+their\s+stead\s*:?\s*(.{5,400}?)(?:,?\s+or\s+any\s+one\s+of\s+them|\s+c\/o\s)/i,
    /removed\s+and\s+(.{5,400}?),?\s+any\s+to\s+act/i,
    /has\s+requested\s+(.{5,400}?)\s+to\s+sell\s+the\s+property/i,
    /appoint(?:s|ed)?\s+(.{5,300}?)\s+as\s+substitute\s+trustees?/i,
  ])
  f.trustees = splitTrusteesAny(tsrc); c.trustees = conf(f.trustees, !!tsrc)

  // ---- Deed of trust date, instrument number, amount
  f.deed_of_trust_date = parseDate(first(flat, [
    new RegExp(String.raw`deed\s+of\s+trust\s+dated\s+(` + DATE_SRC + ')', 'i'),
    new RegExp(String.raw`deed\s+of\s+trust\s+date\s*:?\s*(` + DATE_SRC + ')', 'i'),
    new RegExp(String.raw`deed\s+of\s+trust\s+in[^:]{0,15}:\s*date\s*:\s*(` + DATE_SRC + ')', 'i'),
    new RegExp(String.raw`security\s+instrument\s+dated\s+(` + DATE_SRC + ')', 'i'),
  ]))
  c.deed_of_trust_date = conf(f.deed_of_trust_date, true)
  let best = null
  for (const m of flat.matchAll(/\b((?:19|20)\d{2}[-\s]?\d{7})\b/g)) {
    const num = m[1].replace(/[-\s]/g, ''); if (/^0+\d?$/.test(num)) continue
    const before = flat.slice(Math.max(0, m.index - 170), m.index)
    let sc = 0
    if (/deed\s+of\s+trust|security\s+instrument|recording\s+information|instrument\s+to\s+be\s+foreclosed|recorded\s+(?:on|in|under)|instrument\s+(?:no|number|#)/i.test(before)) sc += 3
    if (/plat|according\s+to\s+the\s+map|thereof|correction/i.test(before.slice(-120))) sc -= 5
    if (!best || sc > best.sc) best = { num, sc }
  }
  f.instrument_number = best && best.sc > 0 ? best.num : null
  c.instrument_number = f.instrument_number ? 'high' : 'low'
  const volPage = flat.match(/volume\s+(\d+)[,\s]+page\s+(\d+)/i)
  f.volume_page = volPage ? `${volPage[1]}/${volPage[2]}` : null
  f.original_loan_amount = parseMoney(first(flat, [/original\s+principal(?:\s+amount)?(?:\s+of)?[^$\d]{0,8}(\$?\s*\d{1,3}(?:,\d{3})+(?:\.\d{2})?)/i, /in\s+the\s+(?:original\s+)?(?:principal\s+)?amount\s+of\s+(\$\s*[\d,]+(?:\.\d{2})?)/i, /original\s+(?:loan\s+)?amount\s*:?\s*(\$\s*[\d,]+(?:\.\d{2})?)/i]))
  c.original_loan_amount = conf(f.original_loan_amount, true)

  // ---- County, filing date, firm, file number
  f.county = tidy((flat.match(/property\s+county\s*:?\s*[—-]?\s*([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)/i) || [])[1]?.replace(/\s+(Volume|Property|Recorded).*$/i, '')) ?.toUpperCase() || (/el\s+paso/i.test(flat) ? 'EL PASO' : null)
  c.county = f.county ? 'high' : 'low'
  f.filing_date = cover.filed
  c.filing_date = conf(f.filing_date, true)
  let firm = null
  for (const line of text.split('\n').reverse()) { const fm = line.trim().match(FIRMS_RE); if (fm) { firm = fm[1] || fm[2]; break } }
  f.attorney_or_firm = firm ? clean(firm) : null
  c.attorney_or_firm = conf(f.attorney_or_firm, true)
  f.ts_number = first(flat, [/T\.?\s?S\.?\s*(?:#|No\.?|Number)\s*:?\s*([A-Z0-9][A-Z0-9-]{4,})/i]) || (lines[0] && (lines[0].match(/^(\d{2}-\d{4,8})\b/) || [])[1]) || null

  const keyFields = ['sale_date', 'property_address', 'grantors', 'mortgagee', 'trustees', 'legal_description']
  const score = Math.round(keyFields.reduce((a, k) => a + (c[k] === 'high' ? 1 : c[k] === 'med' ? 0.6 : 0), 0) / keyFields.length * 100)
  return { fields: f, confidence: c, score }
}
// Substitute trustees today are often companies ("Auction.com, LLC"), so keep both people and companies.
export function splitTrusteesAny(v) {
  if (!v) return []
  const raw = v.replace(/\s+/g, ' ').split(/\s*(?:;|,|\bOR\b|\bAND\b|&)\s*/i).map(s => s.trim()).filter(Boolean)
  const out = []
  for (const s of raw) {
    if (/^(?:LLC|L\.L\.C\.|INC\.?|LP|L\.P\.|PLLC|P\.C\.|CORP\.?)$/i.test(s) && out.length) { out[out.length - 1] += ', ' + s; continue }
    const t = s.replace(/^(?:SUBSTITUTE\s+TRUSTEES?|ANY\s+OF\s+THEM|AS\s+SUBSTITUTE\s+TRUSTEE)\s*/i, '').replace(/\s+whose\s+address\s+is.*$/i, '').trim()
    if (!t || /\d/.test(t) || t.split(/\s+/).length > 6 || t.length < 4) continue
    if (/^(?:SUITE|C\/O|ANY TO ACT|HUNTINGTON|DALLAS|TEXAS|CALIFORNIA|IRVINE)\b/i.test(t)) continue
    if (!/^[A-Z]/.test(t)) continue
    out.push(t)
  }
  return [...new Set(out)].slice(0, 14)
}
function parseNoticeLegacy(raw) {
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

// Two readers: the El Paso rules (tested with real county scans) and the generic label reader.
// Take the rules first and fill any gap from the label reader.
export function parseNotice(raw) {
  const A = parseNoticeRules(raw)
  const cover = stripCoverPages(String(raw || '').replace(/\r/g, ''))
  const B = parseNoticeLegacy(cover.text)
  const empty = v => v == null || v === '' || (Array.isArray(v) && !v.length)
  for (const k of Object.keys(B.fields)) {
    if (empty(A.fields[k]) && !empty(B.fields[k])) { A.fields[k] = B.fields[k]; A.confidence[k] = B.confidence[k] === 'high' ? 'med' : B.confidence[k] || 'med' }
    else if (k === 'sale_time_window' && A.fields[k] && B.fields[k] && /to/.test(B.fields[k]) && !/to/.test(A.fields[k])) A.fields[k] = B.fields[k]
  }
  if (!A.fields.filing_date && B.fields.filing_date) A.fields.filing_date = B.fields.filing_date
  const keyFields = ['sale_date', 'property_address', 'grantors', 'mortgagee', 'trustees', 'legal_description']
  A.score = Math.round(keyFields.reduce((a, k) => a + (A.confidence[k] === 'high' ? 1 : A.confidence[k] === 'med' ? 0.6 : 0), 0) / keyFields.length * 100)
  return A
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
