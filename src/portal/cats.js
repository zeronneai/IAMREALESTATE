// One color per property category, used everywhere (map, tables, lists, the property drawer and the inventory).
//   own   blue    homes I AM has today (not sold, not sold with owner financing)
//   fin   purple  homes sold with owner financing (I AM holds the note)
//   work  green   leads they are working this month (contacted, appointment, offer, under contract)
//   fc    red     upcoming foreclosure auctions
//   other gray    every other lead
import { t } from './i18n.js'
import * as S from './store.js'
import { esc } from './ui.js'

export const CAT = { own: '#2f6fed', fin: '#8b5cf6', work: '#22a55a', fc: '#e5484d', other: '#9a9a9a' }
export const CATS = ['own', 'fin', 'work', 'fc', 'other']
const WORKING = ['contacted', 'appointment', 'offer', 'under_contract']

// Same home written two ways ("Paddlefoot" and "8533 Paddlefoot Ln"): compare the street number and name.
export const addrKey = a => String(a || '').toUpperCase().replace(/[.,#&-]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).join(' ')
export const ownedOf = p => S.inventoryFor(p.id) || S.inventory().find(v => v.status !== 'sold' && addrKey(v.address) === addrKey(p.address)) || null
export const invCat = v => v.status === 'sold' ? null : v.status === 'financed' ? 'fin' : 'own'

export function catOf(p) {
  const v = ownedOf(p)
  if (v && v.status !== 'sold') return invCat(v)
  if (WORKING.includes(p.status)) return 'work'
  if (p.foreclosure && (p._d?.daysToSale ?? -1) >= 0) return 'fc'
  return 'other'
}

export const catPill = k => k ? `<span class="pill cat" style="--c:${CAT[k]}"><i></i>${esc(t('cat.' + k))}</span>` : ''
export const catDot = k => `<i class="cat-dot" style="background:${CAT[k]}" title="${esc(t('cat.' + k))}"></i>`

// Auction urgency: 7 days or less red, 14 or less orange, later neutral.
export function saleCls(days) { return days == null || days < 0 ? '' : days <= 7 ? 'bad' : days <= 14 ? 'warn' : '' }
export const daysPill = days => days == null || days < 0 ? '' : `<span class="pill ${saleCls(days)} mono" style="font-size:11px">${days}d</span>`

// Our homes, one per address (duplicates from different imports count once).
export function ourHomes() {
  const seen = new Set(), out = []
  for (const v of S.inventory()) { if (v.status === 'sold') continue; const k = addrKey(v.address); if (seen.has(k)) continue; seen.add(k); out.push(v) }
  return out
}
