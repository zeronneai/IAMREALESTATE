// Keyless reader for mortgage statements (rules, no AI). Generic labels plus known servicer names.
import { parseDate, parseMoney } from './notice.js'

export const SERVICERS = [
  ['Mr. Cooper', /\bMR\.?\s*COOPER\b|NATIONSTAR/i],
  ['Rocket Mortgage', /\bROCKET\s+MORTGAGE\b|QUICKEN\s+LOANS/i],
  ['Wells Fargo Home Mortgage', /\bWELLS\s+FARGO\b/i],
  ['Chase', /\bCHASE\b|JPMORGAN/i],
  ['PennyMac', /\bPENNY\s?MAC\b/i],
  ['Freedom Mortgage', /\bFREEDOM\s+MORTGAGE\b/i],
  ['LoanCare', /\bLOAN\s?CARE\b/i],
  ['Lakeview Loan Servicing', /\bLAKEVIEW\s+LOAN\b/i],
  ['Shellpoint Mortgage Servicing', /\bSHELLPOINT\b/i],
  ['Newrez', /\bNEW\s?REZ\b/i],
  ['Carrington Mortgage Services', /\bCARRINGTON\b/i],
  ['U.S. Bank Home Mortgage', /\bU\.?S\.?\s+BANK\b/i],
  ['Truist', /\bTRUIST\b/i],
  ['Flagstar', /\bFLAGSTAR\b/i],
  ['Cenlar', /\bCENLAR\b/i],
  ['Midland Mortgage', /\bMIDLAND\s+MORTGAGE\b/i],
  ['Selene Finance', /\bSELENE\b/i],
  ['Planet Home Lending', /\bPLANET\s+HOME\b/i],
  ['GECU', /\bGECU\b/i],
]

// Each field: list of label regexes. The value is the first $ amount / date / % after the label on that line (or the next line).
const MONEY = {
  balance: [/(?:unpaid\s+|outstanding\s+|current\s+)?principal\s+balance/i, /outstanding\s+principal/i, /principal\s+outstanding/i, /loan\s+balance/i],
  payment: [/(?:regular\s+|current\s+)?monthly\s+payment(?:\s+amount)?/i, /principal\s*(?:&|and)\s*interest(?:\s+payment)?/i, /regular\s+payment/i],
  escrow: [/escrow(?:\s+payment|\s+\(for\s+taxes\s+(?:and|&)\s+insurance\))?/i, /taxes\s+(?:and|&)\s+insurance/i],
  amountDue: [/total\s+(?:amount|payment)\s+due/i, /amount\s+due/i, /total\s+due/i, /please\s+pay/i],
  lateFee: [/late\s+(?:charge|fee)(?:\s+of)?/i],
  pastDue: [/past\s+due(?:\s+(?:amount|payments?))?/i, /overdue\s+payments?/i, /unpaid\s+(?:late\s+charges|amounts)/i],
}
const DATES = {
  dueDate: [/payment\s+due\s+date/i, /due\s+date/i, /payment\s+due/i],
  statementDate: [/statement\s+date/i, /date\s+of\s+(?:this\s+)?statement/i, /billing\s+date/i],
}

function after(lines, res, pick) {
  for (let i = 0; i < lines.length; i++) {
    for (const r of res) {
      const m = lines[i].match(r)
      if (!m) continue
      const rest = lines[i].slice(m.index + m[0].length)
      const v = pick(rest) ?? pick(lines[i + 1] || '')
      if (v != null) return v
    }
  }
  return null
}
const pickMoney = s => /\$|\d+\.\d{2}/.test(s) ? parseMoney(s.replace(/\(.*?\)/g, ' ')) : null
const pickDate = s => parseDate(s)

export function parseStatement(raw) {
  const text = String(raw || '').replace(/\r/g, '')
  const lines = text.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const flat = lines.join(' ')
  const f = {}, c = {}
  const sv = SERVICERS.find(([, r]) => r.test(flat))
  f.lender = sv ? sv[0] : ((lines.slice(0, 6).find(l => /mortgage|servic|bank|lending|loan|credit union|financial/i.test(l)) || '').replace(/\s{2,}.*$/, '').slice(0, 60) || null)
  c.lender = sv ? 'high' : f.lender ? 'med' : 'low'
  const loan = flat.match(/(?:loan|account)\s*(?:no\.?|number|#)\s*:?\s*([X*\d-]{4,20})/i)
  f.loanNumber = loan ? loan[1] : null
  f.last4 = f.loanNumber ? f.loanNumber.replace(/\D/g, '').slice(-4) || null : null
  c.last4 = f.last4 ? 'high' : 'low'
  for (const [k, res] of Object.entries(MONEY)) { f[k] = after(lines, res, pickMoney); c[k] = f[k] != null ? 'high' : 'low' }
  for (const [k, res] of Object.entries(DATES)) { f[k] = after(lines, res, pickDate); c[k] = f[k] ? 'high' : 'low' }
  const rate = flat.match(/interest\s+rate(?:\s*\(?(?:until|as\s+of)[^)]*\)?)?\s*:?\s*(\d{1,2}\.\d{1,4})\s*%/i) || flat.match(/(\d{1,2}\.\d{2,4})\s*%/)
  f.rate = rate ? Number(rate[1]) : null; c.rate = f.rate ? 'high' : 'low'
  if (f.amountDue == null && f.payment != null) { f.amountDue = +(f.payment + (f.escrow || 0)).toFixed(2); c.amountDue = 'med' }
  if (f.pastDue == null) { f.pastDue = 0; c.pastDue = 'med' }
  if (f.lateFee == null) { const m = flat.match(/late\s+(?:fee|charge)\s+of\s+\$?([\d,]+\.\d{2})/i); f.lateFee = m ? Number(m[1].replace(/,/g, '')) : null; c.lateFee = f.lateFee != null ? 'med' : 'low' }
  const keys = ['lender', 'balance', 'payment', 'dueDate', 'rate']
  const score = Math.round(keys.reduce((a, k) => a + (c[k] === 'high' ? 1 : c[k] === 'med' ? 0.6 : 0), 0) / keys.length * 100)
  return { fields: f, confidence: c, score }
}
