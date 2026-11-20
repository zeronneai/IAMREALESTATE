// HighLevel opportunities export (CSV) -> Portfolio items.
// Built for I AM's "Property Management" sub-account: pipelines Mortgages, Wrap Payments, Short Term Loans,
// Rental Payments and Utilities. Names look like "7211 Alameda #13 | Kambria Walton", "Paddlefoot 2nd Lien",
// "7211 Alameda | Water". The stage tells this month's status or the account situation.

export function parseCsvText(text) {
  const rows = [], s = String(text || '').replace(/^﻿/, '')
  let row = [], cell = '', q = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++ } else q = false } else cell += c; continue }
    if (c === '"') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.some(x => String(x).trim()))
}

const PIPES = [
  [/mortgage/i, { kind: 'mortgage', status: 'owned' }],
  [/wrap/i, { kind: 'wrap', status: 'financed' }],
  [/short\s*term|loan/i, { kind: 'loan', status: 'financed' }],
  [/rent/i, { kind: 'rent', status: 'rented' }],
  [/utilit/i, { kind: 'utility', status: 'owned' }],
]
const SITUATION = [
  [/payment\s*plan|arrangement/i, 'payment_plan'], [/evict/i, 'eviction'], [/foreclos/i, 'foreclosure'],
  [/vacant/i, 'vacant'], [/disconnect/i, 'disconnected'],
]
const UTIL = /^(water|electric|electricity|gas|el paso disposal|disposal|trash|internet|sewer)$/i

const col = (head, ...res) => head.findIndex(h => res.some(r => r.test(h)))

export function parseGhlOpportunities(text) {
  const rows = parseCsvText(text)
  if (rows.length < 2) return { items: [], skipped: [], error: 'empty' }
  const head = rows[0].map(h => String(h).trim())
  const ix = {
    name: col(head, /^opportunity\s*name$/i, /^name$/i, /opportunity name/i),
    pipe: col(head, /^pipeline(\s*name)?$/i, /pipeline/i),
    stage: col(head, /^stage(\s*name)?$/i, /pipeline\s*stage(?!\s*id)/i, /stage/i),
    value: col(head, /lead\s*value/i, /monetary/i, /^value$/i, /amount/i),
    id: col(head, /^opportunity\s*id$/i, /^id$/i),
    contact: col(head, /^contact\s*name$/i, /contact/i),
    phone: col(head, /^phone$/i),
    status: col(head, /^status$/i),
    tags: col(head, /^tags?$/i),
  }
  if (ix.name < 0 || ix.pipe < 0 || ix.stage < 0) return { items: [], skipped: [], error: 'columns', head }
  const items = [], skipped = []
  for (const r of rows.slice(1)) {
    const g = k => (ix[k] >= 0 ? String(r[ix[k]] || '').trim() : '')
    const name = g('name'), pipe = g('pipe'), stage = g('stage')
    const kind = PIPES.find(([re]) => re.test(pipe))?.[1]
    if (!kind || !name) { skipped.push({ name, pipe, stage }); continue }
    const amount = +String(g('value')).replace(/[^0-9.-]/g, '') || 0
    // "7211 Alameda #13 | Kambria Walton" -> base, unit, party. "Paddlefoot 2nd Lien" -> lien 2.
    let [left, ...rest] = name.split('|').map(x => x.trim())
    let party = rest.join(' | ')
    let lien = 1
    if (/\b(2nd|second)\s*lien\b/i.test(left)) { lien = 2; left = left.replace(/\b(2nd|second)\s*lien\b/i, '').trim() }
    left = left.replace(/\b(1st|first)\s*lien\b/i, '').replace(/\bfirst\b$/i, '').trim()
    const um = left.match(/\s#\s*([A-Za-z0-9-]+)\s*$/) || left.match(/\s(?:apt|unit)\s*([A-Za-z0-9-]+)\s*$/i)
    const unit = um ? '#' + um[1] : ''
    if (um) left = left.slice(0, um.index).trim()
    if (kind.kind === 'utility' && !party && UTIL.test(left)) { party = left; left = '' }
    if (!party && g('contact') && g('contact') !== name) party = g('contact')
    // A home is the part before "|": a street address, or a named place ("Flora Vista", "Paddlefoot").
    const home = left && (/^\d/.test(left) || rest.length || kind.kind !== 'rent') ? left.replace(/,\s*$/, '') : ''
    if (!home && left) party = party || left
    // Their tags carry the due day ("due on the 1st", "due on the 27th") and who collects ("prime escrow", "mills escrow").
    const tags = g('tags').split(/[,;]/).map(x => x.trim()).filter(Boolean)
    const dueTag = tags.map(x => x.match(/due\s*on\s*the\s*(\d{1,2})/i)).find(Boolean)
    const escrow = tags.find(x => /escrow|servic|bank|loan|mortgage/i.test(x)) || ''
    const closed = /^closed$|cancel/i.test(stage) || /lost|abandon/i.test(g('status'))
    const situation = SITUATION.find(([re]) => re.test(stage))?.[1] || 'normal'
    items.push({
      home, homeStatus: kind.status, source: { name, pipe, stage },
      paidThisMonth: /^paid$/i.test(stage) && !closed,
      ob: {
        kind: kind.kind, party, amount, freq: 'monthly',
        // HighLevel has no due day: "Late" shows as late now, "Due" as due later this month. They set the real day after.
        dueDay: dueTag ? Math.min(31, +dueTag[1]) : /late|evict|foreclos/i.test(stage) ? 1 : 28,
        grace: dueTag ? (kind.kind === 'mortgage' ? 15 : 5) : /late|evict|foreclos/i.test(stage) ? 0 : 3,
        account: escrow ? escrow.replace(/\b\w/g, c => c.toUpperCase()) : '', dueSet: !!dueTag,
        autopay: false, payUrl: '', active: !closed, lien, unit, situation,
        notes: `HighLevel: ${pipe} · ${stage}`, extRef: 'ghl:' + (g('id') || `${pipe}|${name}`),
      },
    })
  }
  return { items, skipped }
}
