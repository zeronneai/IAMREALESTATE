// Liens from the El Paso County Clerk (Official Public Records), semi automatic.
// The Clerk site does not allow robots (it has a "not a robot" check), so a person drives it: the portal opens the
// search page, the IAM bookmark fills the owner's name and searches (click 1), then on the results the bookmark
// sends the records back (click 2). The portal reads them: deeds of trust in the home's subdivision, sale notices,
// and judgments or tax liens against the owner; saves them on the property and opens the next search by itself.
import { t } from './i18n.js'
import * as S from './store.js'
import { toast } from './ui.js'

export const CLERK_ORIGIN = 'https://apps.epcountytx.gov'
const SEARCH = `${CLERK_ORIGIN}/publicrecords/OfficialPublicRecords`

let queue = [], idx = 0, win = null, listening = false
export const lienState = () => ({ running: queue.length > 0 && idx < queue.length, done: idx, total: queue.length, current: queue[idx] || null })
const changed = () => window.dispatchEvent(new CustomEvent('iam-lien-progress', { detail: lienState() }))

// Name as the Clerk indexes it: LAST FIRST (first owner only, no Jr/III).
export function searchName(p) {
  const o = String(p?.owners?.[0]?.name || '').split('&')[0].replace(/\b(JR|SR|II|III|IV)\b\.?/gi, '').replace(/\s+/g, ' ').trim().toUpperCase()
  return o.split(' ').slice(0, 2).join(' ')
}
const letters = s => String(s || '').toUpperCase().replace(/[^A-Z]/g, '')
// Subdivision from the legal description: "BLK 31 MESQUITE HILLS 4 LOT 2" -> MESQUI; "7 PAINTED DUNES LOT 56" -> PAINTE.
export function subdivKey(legal) {
  const words = String(legal || '').toUpperCase().replace(/^\s*(BLK|BLOCK)\s+\S+\s+/, '').replace(/^\s*\d+[A-Z]?\s+/, '').split(/\s+/)
  const out = []
  for (const w of words) { if (/^(LOT|LOTS|BLK|BLOCK|TR|TRACT|UNIT|\(|REPLAT|AMENDING|RPL)/.test(w) || /^\d/.test(w)) break; out.push(w) }
  return letters(out.join('').replace(/^THE(?=[A-Z]{4})/, '')).slice(0, 6)
}
const subName = legal => String(legal || '').toUpperCase().replace(/^\s*(BLK|BLOCK)\s+\S+\s+/, '').replace(/^\s*\d+[A-Z]?\s+/, '').split(/\s+(?=LOT|BLK|RPL|REPLAT|AMENDING|\d)/)[0].toLowerCase().replace(/\b\w/g, c => c.toUpperCase())

const MORT = /^(DOT|EDT|THE|MDT|ODT|CDT)$/, SALE = /^(NTS|AST|AOT)$/
const PERSON = { AOJ: ['judgment', 'abstract of judgment'], JUD: ['judgment', 'judgment'], FJT: ['judgment', 'final judgment'], FTL: ['irs', 'federal tax lien'], STL: ['tax', 'state tax lien'], LIE: ['other', 'lien'], MEL: ['mechanic', "mechanic's lien"], HOS: ['other', 'hospital lien'], LBL: ['mechanic', "laborer's lien"], LIP: ['other', 'lis pendens'] }
const toIso = mdY => { const m = String(mdY).match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[1]}-${m[2]}` : null }
const mmY = iso => iso ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : ''

// rows: [date mm/dd/yyyy, style code, subdivision, name, role]
export function analyze(p, rows, total) {
  const key = subdivKey(p.legal), sub = subName(p.legal) || 'its subdivision'
  const names = new Set(rows.map(r => r[3]))
  const common = total > 30 || names.size > 4
  const now = new Date().toISOString().slice(0, 10), yearAgo = new Date(Date.now() - 400 * 86400e3).toISOString().slice(0, 10), since = new Date(Date.now() - 15 * 365 * 86400e3).toISOString().slice(0, 10)
  const here = r => { const k = letters(r[2]).replace(/^THE(?=[A-Z]{4})/, '').slice(0, 6); return key && k && (k === key || (k.length >= 5 && key.startsWith(k.slice(0, 5)))) }
  const dots = rows.filter(r => MORT.test(r[1]) && here(r)).map(r => toIso(r[0])).filter(Boolean).sort()
  const sale = rows.filter(r => SALE.test(r[1])).map(r => toIso(r[0])).filter(d => d && d >= yearAgo && d <= now).sort()
  const pers = rows.filter(r => PERSON[r[1]]).map(r => ({ code: r[1], date: toIso(r[0]) })).filter(x => x.date && x.date >= since).sort((a, b) => a.date.localeCompare(b.date))
  const day = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const parts = [dots.length ? `${dots.length} deed(s) of trust in this subdivision (latest ${mmY(dots[dots.length - 1])})` : "no deed of trust found under the owner's name for this subdivision"]
  if (sale.length) parts.push(`substitute trustee or sale notice recorded ${mmY(sale[sale.length - 1])}`)
  if (pers.length) parts.push(`${common ? 'possible, common name, verify: ' : ''}${pers.map(x => `${PERSON[x.code][1]} ${mmY(x.date)}`).join(', ')}`)
  const note = `Clerk records (owner name search, ${day}, ${sub}): ${parts.join('; ')}.`
  const liens = []
  if (dots.length) liens.push({ type: 'mortgage', holder: 'Deed of trust (latest)', recorded: dots[dots.length - 1].slice(0, 7) + '-01' })
  if (!common) for (const x of pers) liens.push({ type: PERSON[x.code][0], holder: PERSON[x.code][1].replace(/^\w/, c => c.toUpperCase()), recorded: x.date.slice(0, 7) + '-01' })
  return { note, liens, dots: dots.length, flagged: pers.length }
}

async function openSearch() {
  while (idx < queue.length) {
    const p = S.parcel(queue[idx])
    if (p && searchName(p)) {
      if (!win || win.closed) win = window.open(SEARCH, 'iam_clerk')
      else { try { win.location.href = SEARCH } catch { win = window.open(SEARCH, 'iam_clerk') } }
      changed(); return
    }
    idx++
  }
  const n = queue.length; queue = []; idx = 0; changed()
  if (n) toast(t('ln.done').replace('{n}', n))
}

export function checkLiens(ids) {
  const list = [...new Set(ids)].filter(id => S.parcel(id))
  if (!list.length) return toast(t('tx.none'))
  listenLiens(); queue = list; idx = 0
  toast(t('ln.start').replace('{n}', list.length), 7000)
  openSearch()
}
export function skipLien() { if (idx < queue.length) { idx++; openSearch() } }
export function stopLiens() { queue = []; idx = 0; changed() }
export function reopenLien() { win = null; openSearch() }

export function listenLiens() {
  if (listening) return; listening = true
  window.addEventListener('message', async e => {
    if (e.origin !== CLERK_ORIGIN) return
    const p = queue[idx] ? S.parcel(queue[idx]) : null
    if (e.data?.type === 'iam-clerk-need') {
      if (!p) return e.source?.postMessage({ type: 'iam-clerk-name', name: '' }, CLERK_ORIGIN)
      e.source?.postMessage({ type: 'iam-clerk-name', name: searchName(p), address: p.address }, CLERK_ORIGIN)
    }
    if (e.data?.type === 'iam-clerk-rows' && Array.isArray(e.data.rows)) {
      if (!p) return toast(t('ln.noqueue'))
      const rows = e.data.rows.filter(r => Array.isArray(r) && r.length >= 5).map(r => r.map(x => String(x).slice(0, 120)))
      const a = analyze(p, rows, +e.data.total || rows.length)
      await S.setClerkLiens(p.id, a)
      toast(`${p.address}: ${a.dots ? t('ln.dots').replace('{n}', a.dots) : t('ln.nodots')}${a.flagged ? ' · ' + t('ln.flag').replace('{n}', a.flagged) : ''}`, 4500)
      idx++; openSearch()
    }
  })
}

export function mountLienBar() {
  if (document.getElementById('lienbar')) return
  const bar = document.createElement('div'); bar.id = 'lienbar'; bar.className = 'taxbar'; bar.hidden = true; bar.style.bottom = '72px'
  document.body.appendChild(bar)
  window.addEventListener('iam-lien-progress', e => {
    const st = e.detail; bar.hidden = !st.running; if (!st.running) return
    const p = S.parcel(st.current)
    bar.innerHTML = `<b>📜 ${t('ln.bar').replace('{d}', st.done + 1).replace('{t}', st.total)}</b><span>${p ? p.address + ' · ' + searchName(p) : ''} · ${t('ln.bar_hint')}</span>
      <button class="btn sm" data-ln="open">${t('tx.reopen')}</button><button class="btn sm ghost" data-ln="skip">${t('tx.skip')}</button><button class="btn sm ghost" data-ln="stop">${t('tx.stop')}</button>`
    bar.querySelector('[data-ln=open]').onclick = reopenLien
    bar.querySelector('[data-ln=skip]').onclick = skipLien
    bar.querySelector('[data-ln=stop]').onclick = stopLiens
  })
}
