// Do Not Call: the team downloads the National DNC Registry file for area code 915 (telemarketing.donotcall.gov,
// one number per line) and imports it here. Numbers are kept in IndexedDB as a sorted 10 digit list.
// Every phone in the portal is checked against it; flagged numbers cannot be called or texted from the portal.
import { kv } from './idb.js'

let set = null, meta = null
export const digits = s => { const d = String(s || '').replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? d.slice(1) : d }

export async function ready() {
  if (set) return meta
  const v = await kv('readonly', st => st.get('dnc')).catch(() => null)
  set = new Set(v?.list || []); meta = { count: set.size, at: v?.at || null, manual: v?.manual || [] }
  return meta
}
export function isDnc(phone) { return !!set && set.has(digits(phone)) }

export async function importFile(file, onProgress) {
  await ready()
  const text = await file.text()
  let added = 0
  const lines = text.split(/\r?\n/)
  lines.forEach((l, i) => {
    // FTC files: "9155550123" or "915,5550123" or "915-555-0123"; take the first 10 digit group per line
    const d = digits(l.split(/[;\t]/)[0])
    const ten = d.length >= 10 ? d.slice(-10) : null
    if (ten && !set.has(ten)) { set.add(ten); added++ }
    if (i % 50000 === 0) onProgress?.(i)
  })
  meta = { count: set.size, at: new Date().toISOString(), manual: meta.manual }
  await kv('readwrite', st => st.put({ list: [...set], at: meta.at, manual: meta.manual }, 'dnc')).catch(() => {})
  return { added, total: set.size }
}
export async function addManual(phone) {
  await ready(); const d = digits(phone).slice(-10); if (d.length !== 10) return
  set.add(d); meta.manual = [...new Set([...(meta.manual || []), d])]; meta.count = set.size
  await kv('readwrite', st => st.put({ list: [...set], at: meta.at, manual: meta.manual }, 'dnc')).catch(() => {})
}
export async function clear() { set = new Set(); meta = { count: 0, at: null, manual: [] }; await kv('readwrite', st => st.delete('dnc')).catch(() => {}) }
