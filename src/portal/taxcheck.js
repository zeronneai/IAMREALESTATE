// Property taxes from the El Paso Tax Office (actweb.acttax.com), semi automatic.
// The tax office has no API and its terms don't allow robots, so a person opens each account page. The portal
// opens them one after another in the same tab; on each page, one click on the "IAM" bookmark reads the amounts
// (current year, prior years owed, lawsuits, judgments) and sends them back. The portal saves them on the property
// (Taxes section, note, "Back taxes" tag) and opens the next account by itself.
import { t } from './i18n.js'
import * as S from './store.js'
import { toast } from './ui.js'

export const TAX_ORIGIN = 'https://actweb.acttax.com'
const ACT = can => `${TAX_ORIGIN}/act_webdev/elpaso/showdetail2.jsp?can=${encodeURIComponent(can)}`
const ENTITY = 'El Paso Tax Office (all entities)'

let queue = [], idx = 0, win = null, listening = false, onChange = null
export const taxState = () => ({ running: queue.length > 0 && idx < queue.length, done: idx, total: queue.length, current: queue[idx] || null })
const changed = () => { try { onChange?.(taxState()) } catch { /* view gone */ } ; window.dispatchEvent(new CustomEvent('iam-tax-progress', { detail: taxState() })) }
export const onTaxProgress = fn => { onChange = fn }

// County account number (geo id) of a property, from the state parcel data (free).
async function accountOf(p) {
  if (p.taxAccount) return p.taxAccount
  if (!p.lat || !p.lng) return null
  try {
    const r = await fetch(`/api/txparcel?lat=${p.lat}&lng=${p.lng}${p.epcadId ? '&pid=' + encodeURIComponent(p.epcadId) : ''}`)
    const geo = r.ok ? (await r.json()).parcel?.geo_id : null
    if (geo) p.taxAccount = String(geo).trim()
    return p.taxAccount || null
  } catch { return null }
}

async function openCurrent() {
  while (idx < queue.length) {
    const p = S.parcel(queue[idx])
    const can = p ? await accountOf(p) : null
    if (can) {
      if (!win || win.closed) win = window.open(ACT(can), 'iam_tax')
      else { try { win.location.href = ACT(can) } catch { win = window.open(ACT(can), 'iam_tax') } }
      changed(); return
    }
    idx++ // no account number: skip it
  }
  finish()
}

function finish() {
  const n = queue.length
  queue = []; idx = 0; changed()
  if (n) toast(t('tx.done').replace('{n}', n))
}

// Start checking taxes for these properties (one or many).
export function checkTaxes(ids) {
  const list = [...new Set(ids)].filter(id => S.parcel(id))
  if (!list.length) return toast(t('tx.none'))
  listenTaxes()
  queue = list; idx = 0
  toast(t('tx.start').replace('{n}', list.length), 6000)
  openCurrent()
}
export function skipTax() { if (idx < queue.length) { idx++; openCurrent() } }
export function stopTaxes() { queue = []; idx = 0; changed() }

const money = v => { const n = parseFloat(String(v || '').replace(/[$,]/g, '')); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0 }

// Save what the bookmark read on the tax office page.
export async function saveTaxData(d) {
  const pid = String(d.pid || '').trim(), can = String(d.can || '').trim()
  const p = (queue[idx] && S.parcel(queue[idx])) && (!pid || String(S.parcel(queue[idx]).epcadId || '') === pid || S.parcel(queue[idx]).taxAccount === can)
    ? S.parcel(queue[idx])
    : S.parcels().find(x => (pid && String(x.epcadId || '') === pid) || (can && x.taxAccount === can))
  if (!p) { toast(t('tx.nomatch').replace('{pid}', pid || can)); return false }
  const cur = money(d.cur), prior = money(d.prior)
  const day = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const year = new Date().getFullYear()
  const note = `Taxes (El Paso Tax Office, checked ${day}): ${year} bill $${cur.toFixed(2)}; prior years owed $${prior.toFixed(2)}${prior > 0 ? ' [DELINQUENT]' : ''}; tax lawsuits: ${d.law || 'None'}; tax judgments: ${d.jud || 'None'}.`
  await S.setCountyTaxes(p.id, { entity: ENTITY, year, cur, prior, note, account: can || p.taxAccount })
  toast(`${p.address}: ${prior > 0 ? t('tx.owes').replace('{m}', '$' + prior.toLocaleString('en-US')) : t('tx.clear')}`, 4000)
  if (queue[idx] === p.id) { idx++; openCurrent() }
  return true
}

// Messages from the bookmark (when the tax page was opened from the portal).
export function listenTaxes() {
  if (listening) return; listening = true
  window.addEventListener('message', e => {
    if (e.origin !== TAX_ORIGIN || e.data?.type !== 'iam-tax' || typeof e.data.data !== 'object') return
    saveTaxData(e.data.data)
  })
}

// Small bar at the bottom while the taxes are being checked: progress, open the page again, skip or stop.
export function mountTaxBar() {
  if (document.getElementById('taxbar')) return
  const bar = document.createElement('div')
  bar.id = 'taxbar'; bar.className = 'taxbar'; bar.hidden = true
  document.body.appendChild(bar)
  const paint = st => {
    bar.hidden = !st.running
    if (!st.running) return
    const p = S.parcel(st.current)
    bar.innerHTML = `<b>🧾 ${t('tx.bar').replace('{d}', st.done + 1).replace('{t}', st.total)}</b><span>${p ? p.address : ''} · ${t('tx.bar_hint')}</span>
      <button class="btn sm" data-tx="open">${t('tx.reopen')}</button><button class="btn sm ghost" data-tx="skip">${t('tx.skip')}</button><button class="btn sm ghost" data-tx="stop">${t('tx.stop')}</button>`
    bar.querySelector('[data-tx=open]').onclick = () => { win = null; openCurrent() }
    bar.querySelector('[data-tx=skip]').onclick = skipTax
    bar.querySelector('[data-tx=stop]').onclick = stopTaxes
  }
  window.addEventListener('iam-tax-progress', e => paint(e.detail))
}
