// Simple table reader for delinquent tax lists and tax sale lists (PDF rows or text), no AI.
// Rows come from the PDF reader as text lines where columns are separated by 2+ spaces.
import { parseMoney } from './notice.js'

const COLS = {
  account: /\b(ACCOUNT|ACCT|PROPERTY\s*ID|PROP\s*ID|GEO\s*ID|CAUSE|SUIT)\b/i,
  owner: /\b(OWNER|NAME|DEFENDANT|TAXPAYER)\b/i,
  address: /\b(SITUS|ADDRESS|LOCATION|PROPERTY\s+ADDRESS|STREET)\b/i,
  amount: /\b(AMOUNT|TOTAL|DUE|BALANCE|JUDGMENT|OWED|MINIMUM\s+BID)\b/i,
  years: /\b(YEARS?|TAX\s+YEARS?)\b/i,
  legal: /\b(LEGAL)\b/i,
}
const ADDR = /\b\d{1,6}\s+[A-Z0-9][A-Z0-9 .'-]{2,40}\b(?:ST|DR|AVE|RD|BLVD|LN|CT|CIR|WAY|PL|LOOP|TRL|PKWY|CV|TER|PASS|HWY)\b\.?(?:\s+[NSEW]{1,2}\b)?/i

export function parseTaxLines(lines) {
  const rows = lines.map(l => String(l).trim()).filter(Boolean)
  const hi = rows.findIndex(l => Object.values(COLS).filter(r => r.test(l)).length >= 2 && l.split(/\s{2,}/).length >= 3)
  const out = []
  if (hi >= 0) {
    const head = rows[hi].split(/\s{2,}/)
    const map = Object.fromEntries(Object.entries(COLS).map(([k, r]) => [k, head.findIndex(h => r.test(h))]))
    for (const l of rows.slice(hi + 1)) {
      const c = l.split(/\s{2,}/)
      if (c.length < 3) continue
      const get = k => (map[k] >= 0 ? c[map[k]] : '') || ''
      const amount = parseMoney(get('amount')) ?? parseMoney(c[c.length - 1])
      const address = (get('address').match(ADDR) || l.match(ADDR) || [])[0] || get('address')
      if (!amount || !address) continue
      out.push({ account: get('account') || null, owner: get('owner') || null, address: address.toUpperCase(), amount, years: get('years') || null, legal: get('legal') || null })
    }
    return out
  }
  for (const l of rows) {
    const address = (l.match(ADDR) || [])[0]
    const amt = l.match(/\$?\s*\d{1,3}(?:,\d{3})*\.\d{2}\s*$/)
    if (!address || !amt) continue
    const account = (l.match(/^\s*([A-Z]?\d[\d-]{5,20})\b/) || [])[1] || null
    const owner = l.slice(account ? l.indexOf(account) + account.length : 0, l.indexOf(address)).replace(/\s{2,}/g, ' ').trim() || null
    out.push({ account, owner, address: address.toUpperCase(), amount: parseMoney(amt[0]), years: null, legal: null })
  }
  return out
}
