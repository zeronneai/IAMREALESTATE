// Lead math: equity, tenure, taxes and the 0 to 100 lead score.
export const DEFAULT_WEIGHTS = { equity: 30, urgency: 20, absentee: 10, tax: 15, tenure: 10, liens: 15 }

const DAY = 86400000
export const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
export const daysUntil = iso => iso ? Math.round((new Date(iso + 'T00:00:00') - today()) / DAY) : null

export function derive(p) {
  const value = p.marketValue || 0
  const fc = p.foreclosure
  const mortgageBal = fc?.estBalance ?? (p.liens || []).filter(l => l.type === 'mortgage').reduce((s, l) => s + (l.amount || 0), 0)
  const otherLiens = (p.liens || []).filter(l => l.type !== 'mortgage').reduce((s, l) => s + (l.amount || 0), 0)
  const taxDue = (p.taxes || []).filter(x => x.delinquent).reduce((s, x) => s + (x.amount || 0), 0)
  const debt = mortgageBal + otherLiens + taxDue
  const equity = value ? value - debt : null // unknown until a value comes from EPCAD or the team
  const equityPct = value ? Math.round((equity / value) * 100) : 0
  const yearsOwned = p.lastDeedDate ? Math.max(0, Math.floor((today() - new Date(p.lastDeedDate)) / (365.25 * DAY))) : null
  const absentee = (p.owners || []).some(o => o.absentee)
  const daysToSale = fc ? daysUntil(fc.saleDate) : null
  return { value, mortgageBal, otherLiens, taxDue, debt, equity, equityPct, yearsOwned, absentee, daysToSale }
}

export function score(p, w = DEFAULT_WEIGHTS) {
  const d = derive(p)
  const clamp = x => Math.max(0, Math.min(1, x))
  const parts = {
    equity: clamp(d.equityPct / 50),
    urgency: d.daysToSale == null ? (p.tags || []).includes('probate') ? 0.4 : 0.15 : d.daysToSale < 0 ? 0 : clamp(1 - Math.abs(d.daysToSale - 14) / 60),
    absentee: d.absentee ? 1 : (p.vacant ? 0.6 : 0),
    tax: clamp(d.taxDue / 6000),
    tenure: d.yearsOwned == null ? 0 : clamp(d.yearsOwned / 20),
    liens: clamp(((p.liens || []).filter(l => l.type !== 'mortgage').length * 0.35) + ((p.tags || []).includes('probate') ? 0.4 : 0)),
  }
  const total = Object.keys(parts).reduce((s, k) => s + parts[k] * (w[k] ?? 0), 0)
  const max = Object.values(w).reduce((s, x) => s + x, 0) || 1
  const pts = {}
  for (const k in parts) pts[k] = Math.round(parts[k] * (w[k] ?? 0))
  return { score: Math.round((total / max) * 100), parts: pts, d }
}

export const money = (n, short) => {
  if (n == null || isNaN(n)) return 'n/a'
  if (short && Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M'
  if (short && Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K'
  return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US')
}
export const fmtDate = (iso, lang = 'en') => iso ? new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'n/a'

export function firstTuesdays(from, n) {
  const out = []
  let y = from.getFullYear(), m = from.getMonth()
  while (out.length < n) {
    const d = new Date(y, m, 1)
    while (d.getDay() !== 2) d.setDate(d.getDate() + 1)
    if (d >= today()) out.push(isoDate(d))
    m++; if (m > 11) { m = 0; y++ }
  }
  return out
}

export const isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
