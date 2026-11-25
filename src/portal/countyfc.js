// Foreclosures from the El Paso County Clerk Foreclosure Map, semi automatic.
// The county site does not allow robots, so a person opens the map and accepts its notice. Then one click on the
// "IAM: traer remates" bookmark reads the pins already on screen and sends them to the portal. The portal does the
// rest: county owner and value (TxGIO), sale date, list of the month, map pins and the skip trace (automatic).
import { t, getLang } from './i18n.js'
import * as S from './store.js'
import { esc, toast, skipTrace } from './ui.js'
import { opportunities } from './alerts.js'

export const COUNTY_MAP = 'https://apps.epcountytx.gov/publicrecords/Foreclosures/Map'
const COUNTY_ORIGIN = 'https://apps.epcountytx.gov'
const LAST_KEY = 'iam_county_import_v1'
const SALE_PLACE = 'El Paso County Courthouse area, first Tuesday of the month (see the notice for the exact place and time)'

export const lastImport = () => { try { return localStorage.getItem(LAST_KEY) || '' } catch { return '' } }
const markImport = () => { try { localStorage.setItem(LAST_KEY, new Date().toISOString()) } catch { /* private mode */ } }

// The bookmark. Runs on the county map page: reads the pins and sends them to this portal.
export function bookmarklet() {
  const portal = location.origin + '/portal/#/import?county='
  const code = `(()=>{try{if(!window.map||!map.sources){alert('Abre primero el mapa de remates del condado y acepta el aviso.');return}var r=[];map.sources.getSources().forEach(function(s){if(!s.toJson)return;s.toJson().features.forEach(function(f){var d=f.properties.description||'',t=f.properties.title||'';var g=function(re){var m=d.match(re);return m?m[1].trim():''};r.push([(t.match(/foreclosureId=(\\d+)/)||[])[1]||'',g(/Property ID:\\s*([^<]*)/),g(/Address:\\s*([^<]*)/),g(/Sale Date:\\s*([^<]*)/),f.geometry.coordinates[1].toFixed(6),f.geometry.coordinates[0].toFixed(6)].join('|'))})});if(!r.length){alert('El mapa todavia no carga los remates. Espera unos segundos.');return}var data=r.join(';');if(window.opener){try{window.opener.postMessage({type:'iam-county-fc',data:data},'${location.origin}');alert(r.length+' remates enviados al portal. Ya puedes cerrar esta pestana.');return}catch(e){}}window.open('${portal}'+encodeURIComponent(data),'_blank')}catch(e){alert('No se pudo leer el mapa: '+e.message)}})()`
  return 'javascript:' + encodeURIComponent(code)
}

// Open the county map in a tab that can talk back to the portal.
export function openCountyMap() { window.open(COUNTY_MAP, 'iam_county_map') }

// Listen for the bookmark (when the map was opened from the portal).
let listening = false
export function listenCounty() {
  if (listening) return; listening = true
  window.addEventListener('message', e => {
    if (e.origin !== COUNTY_ORIGIN || e.data?.type !== 'iam-county-fc' || typeof e.data.data !== 'string') return
    runCountyImport(e.data.data)
  })
}

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const listName = iso => { const [y, m, d] = iso.split('-').map(Number); return getLang() === 'es' ? `Remates ${d} ${MONTHS_ES[m - 1]} ${y}` : `Foreclosures ${MONTHS_EN[m - 1]} ${d}, ${y}` }
const toIso = mdY => { const m = String(mdY).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null }
const title = s => String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())

function parse(data) {
  const seen = new Set(), out = []
  for (const line of String(data).split(';')) {
    const [fid, pid, addr, sale, lat, lng] = line.split('|')
    const saleDate = toIso(sale)
    if (!pid || !saleDate || seen.has(pid + saleDate)) continue
    seen.add(pid + saleDate)
    out.push({ fid, pid: pid.trim(), addr: (addr || '').trim(), saleDate, lat: +lat, lng: +lng })
  }
  return out
}

async function county(r) {
  try {
    const res = await fetch(`/api/txparcel?lat=${r.lat}&lng=${r.lng}&pid=${encodeURIComponent(r.pid)}`)
    return res.ok ? (await res.json()).parcel : null
  } catch { return null }
}

let running = false
export async function runCountyImport(data, onStep) {
  if (running) return; running = true
  const step = m => { onStep?.(m); }
  try {
    const recs = parse(data)
    if (!recs.length) { toast(t('fc.none')); return }
    step(t('fc.reading').replace('{n}', recs.length))
    const today = new Date().toISOString().slice(0, 10)
    const live = recs.filter(r => r.saleDate >= today)
    // County data with 4 lookups at a time.
    const info = new Map(); let i = 0
    await Promise.all(Array.from({ length: 4 }, async () => { while (i < live.length) { const r = live[i++]; info.set(r, await county(r)); step(t('fc.owners').replace('{n}', info.size).replace('{t}', live.length)) } }))
    const rows = live.map(r => {
      const a = info.get(r) || {}
      const street = (a.situs_addr || r.addr.split(',')[0] || '').toUpperCase().trim()
      const city = title(a.situs_city || (r.addr.split(',')[1] || 'El Paso').replace(/\d{5}/, '').trim())
      const zip = a.situs_zip || (r.addr.match(/\b(\d{5})\b/) || [])[1] || ''
      const mail = (a.mail_line1 || '').toUpperCase().trim()
      const absentee = !!mail && mail.replace(/\s+/g, ' ') !== street.replace(/\s+/g, ' ')
      return {
        address: street, city, zip, lat: r.lat, lng: r.lng, epcadId: r.pid, legal: a.legal_desc || undefined,
        marketValue: +a.mkt_value || undefined,
        owners: a.owner_name ? [{ name: a.owner_name, mailing: mail, mailingCity: title(a.mail_city), mailingState: a.mail_stat || 'TX', mailingZip: a.mail_zip || '', absentee }] : [],
        tags: ['foreclosure', ...(absentee ? ['absentee'] : [])],
        foreclosure: { saleDate: r.saleDate, saleLocation: SALE_PLACE, sourceUrl: r.fid ? `${COUNTY_ORIGIN}/publicrecords/Foreclosures/DisplayMap?foreclosureId=${r.fid}` : null },
        _sale: r.saleDate,
      }
    })
    step(t('fc.saving'))
    const res = await S.quietly(() => S.importParcels(rows.map(({ _sale, ...x }) => x), { tag: 'foreclosure', source: 'county_map' }))
    // One list per sale date.
    const bySale = new Map()
    rows.forEach((r, k) => { const id = res.ids[k]; if (!id) return; if (!bySale.has(r._sale)) bySale.set(r._sale, []); bySale.get(r._sale).push(id) })
    for (const [sale, ids] of bySale) {
      const name = listName(sale)
      const l = S.lists().find(x => x.name === name)
      if (l) await S.addToList(l.id, ids); else await S.createList(name, ids)
    }
    markImport()
    // Phones for the new ones, automatic (skips homes that already have phones or were looked up).
    step(t('fc.phones'))
    const found = await skipTrace(res.ids, { quiet: true }).catch(() => 0)
    const opp = await syncOpportunities()
    const msg = t('fc.done').replace('{n}', rows.length).replace('{a}', res.added).replace('{p}', found || 0) + (opp ? ' ' + t('fc.opp').replace('{n}', opp) : '')
    step(msg); toast(msg)
    return { ...res, total: rows.length, phones: found || 0 }
  } finally { running = false }
}

// Automatic phones for upcoming foreclosures that have none yet (for example homes loaded by SQL).
// Runs once per session, tries each home only once per browser, and never repeats a home already looked up.
const TRIED_KEY = 'iam_auto_trace_v1'
let autoDone = false
export async function autoTraceForeclosures() {
  if (autoDone || S.MODE === 'demo' || !['admin', 'agent'].includes(S.role())) return
  autoDone = true
  let tried = {}; try { tried = JSON.parse(localStorage.getItem(TRIED_KEY)) || {} } catch { /* none */ }
  const today = new Date().toISOString().slice(0, 10)
  const ids = S.parcels().filter(p => p.foreclosure?.saleDate >= today && !tried[p.id]
    && !(p.contacts || []).some(c => c.kind === 'phone') && !(p.activities || []).some(a => a.kind === 'skiptrace')).map(p => p.id)
  if (!ids.length) return
  ids.forEach(id => { tried[id] = today })
  try { localStorage.setItem(TRIED_KEY, JSON.stringify(tried)) } catch { /* private mode */ }
  const n = await skipTrace(ids, { quiet: true }).catch(() => 0)
  if (n) toast(t('fc.auto').replace('{n}', n))
}

// Jarvis keeps a list of the best upcoming foreclosures ("Oportunidades de Jarvis"). New ones are added, never twice.
export async function syncOpportunities() {
  if (S.MODE === 'demo' || !['admin', 'agent'].includes(S.role())) return 0
  const ids = opportunities().slice(0, 40).map(p => p.id)
  if (!ids.length) return 0
  const name = 'Oportunidades de Jarvis', l = S.lists().find(x => x.name === name)
  const fresh = l ? ids.filter(id => !l.ids.includes(id)) : ids
  if (!fresh.length) return 0
  await S.quietly(() => l ? S.addToList(l.id, fresh) : S.createList(name, fresh))
  return fresh.length
}
