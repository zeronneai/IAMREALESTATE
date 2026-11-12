// EPCAD index in the browser: read the downloaded export files (they can be very large) line by line,
// keep a compact index in IndexedDB and enrich properties and notices by property ID or normalized address.
import { createIndex, addRow, headerMap, detectDelimiter, finalize, lookupMaps, matchParcel, toParcelPatch } from './parse/epcad.js'

import { kv } from './idb.js'

export const saveIndex = list => kv('readwrite', st => st.put({ list, at: new Date().toISOString() }, 'index'))
export const loadIndex = () => kv('readonly', st => st.get('index')).catch(() => null)
export const clearIndex = () => kv('readwrite', st => st.delete('index'))

let maps = null, meta = null
export async function ready() {
  if (maps) return { count: meta.count, at: meta.at }
  const v = await loadIndex()
  if (!v?.list?.length) return null
  maps = lookupMaps(v.list); meta = { count: v.list.length, at: v.at }
  return meta
}

async function* lines(file) {
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += value
    let i
    while ((i = buf.indexOf('\n')) >= 0) { yield buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1) }
  }
  if (buf) yield buf
}

// files: one or more EPCAD text files (Properties, Owners, Values, Deeds, Improvements...). Unzip first.
export async function buildFromFiles(files, onProgress) {
  const ix = createIndex()
  let n = 0
  for (const f of files) {
    let hm = null, delim = '~', seen = 0
    for await (const line of lines(f)) {
      if (!line.trim()) continue
      if (!hm) { delim = detectDelimiter(line); hm = headerMap(line.split(delim)); if (hm.id == null && hm.geo == null) throw new Error(`${f.name}: no property ID column in the first row`); continue }
      addRow(ix, hm, line.split(delim))
      if (++seen % 20000 === 0) { n += 20000; onProgress?.({ file: f.name, rows: seen }); await new Promise(r => setTimeout(r)) }
    }
    ix.files.push({ name: f.name, rows: seen, cols: Object.keys(hm || {}) })
  }
  const list = finalize(ix)
  await saveIndex(list).catch(() => {})
  maps = lookupMaps(list); meta = { count: list.length, at: new Date().toISOString() }
  return { count: list.length, files: ix.files }
}
export function useList(list, at) { maps = lookupMaps(list); meta = { count: list.length, at: at || new Date().toISOString() } }

export function match(p) { return maps ? matchParcel(maps, p) : null }
export function patchFor(p) { const r = match(p); return r ? toParcelPatch(r, p.zip) : null }
