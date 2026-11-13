// EPCAD index. Reads the real EPCAD "Property Search Dataset" dumps (Owners, Properties, Improvements, Lands,
// Deeds, Values; headerless, "~" delimited, up to 150 MB each) line by line in the browser, builds compact parcel
// records and either keeps them in IndexedDB (demo) or uploads them to Supabase table epcad_parcels (production),
// so every teammate can enrich properties without loading the files again.
// The older header based exports (CSV / "~" with a header row) still work through the legacy path.
import { createIndex, addRow, headerMap, detectDelimiter, finalize, lookupMaps, matchParcel, toParcelPatch,
  dumpKind, isHeaderless, DUMP_KINDS, createDumpIndex, addDumpLine, finishDumpIndex, dumpMaps, matchDump, pickByLegal,
  noticeLegalParts, patchFromDump, pickByZip, DEFAULT_PSF } from './parse/epcad.js'
import { normStreet } from './parse/address.js'
import { kv } from './idb.js'
import * as S from './store.js'

export const saveIndex = (list, kind = 'legacy') => kv('readwrite', st => st.put({ list, kind, at: new Date().toISOString() }, 'index'))
export const loadIndex = () => kv('readonly', st => st.get('index')).catch(() => null)
export const clearIndex = () => { mem = null; return kv('readwrite', st => st.delete('index')) }

// Large indexes are saved in chunks so the browser never clones 400k records at once.
const CHUNK = 25000
async function saveChunks(list) {
  const at = new Date().toISOString(), n = Math.ceil(list.length / CHUNK)
  for (let i = 0; i < n; i++) { const part = list.slice(i * CHUNK, (i + 1) * CHUNK); await kv('readwrite', st => st.put(part, 'dump_' + i)); await tick() }
  await kv('readwrite', st => st.put({ kind: 'dump', chunks: n, count: list.length, at }, 'index'))
}
async function loadChunks(meta) {
  const out = []
  for (let i = 0; i < meta.chunks; i++) { const part = await kv('readonly', st => st.get('dump_' + i)); if (part) out.push(...part) }
  return out
}
let mem = null      // { kind: 'dump'|'legacy', maps, count, at }
let lastBuilt = null // compact dump records waiting to be uploaded to the server
export const pendingUpload = () => lastBuilt

export async function ready() {
  if (mem) return { count: mem.count, at: mem.at, where: 'local' }
  const v = await loadIndex()
  if (v?.chunks) { const list = await loadChunks(v); if (!list.length) return null; mem = { kind: 'dump', maps: dumpMaps(list), count: list.length, at: v.at }; return { count: mem.count, at: mem.at, where: 'local' } }
  if (!v?.list?.length) return null
  mem = v.kind === 'dump' ? { kind: 'dump', maps: dumpMaps(v.list), count: v.list.length, at: v.at } : { kind: 'legacy', maps: lookupMaps(v.list), count: v.list.length, at: v.at }
  return { count: mem.count, at: mem.at, where: 'local' }
}

// Fast line reader: split each decoded chunk once, carry only the unfinished last line.
async function* lines(file, onBytes) {
  const reader = file.stream().getReader()
  const dec = new TextDecoder('latin1')
  let rest = '', read = 0
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    read += value.byteLength; onBytes?.(read)
    const parts = (rest + dec.decode(value, { stream: true })).split('\n')
    rest = parts.pop()
    for (const l of parts) yield l.endsWith('\r') ? l.slice(0, -1) : l
  }
  if (rest) yield rest
}
async function firstLine(file) { const t = await file.slice(0, 4096).text(); return t.split('\n')[0] || '' }
const tick = () => new Promise(r => setTimeout(r))

// files: the EPCAD .txt files (unzipped). onProgress({ file, pct, rows, step })
export async function buildFromFiles(files, onProgress) {
  const heads = await Promise.all(files.map(firstLine))
  const kinds = files.map((f, i) => (isHeaderless(heads[i]) ? dumpKind(f.name, heads[i]) : null))
  if (kinds.some(Boolean)) return buildFromDumps(files.filter((_, i) => kinds[i]).map((f, i) => ({ f, k: kinds.filter(Boolean)[i] })), files.filter((_, i) => !kinds[i]), onProgress)
  return buildLegacy(files, onProgress)
}

async function buildFromDumps(items, skipped, onProgress) {
  const order = DUMP_KINDS
  items.sort((a, b) => order.indexOf(a.k) - order.indexOf(b.k))
  if (!items.some(x => x.k === 'properties')) {
    const e = new Error('missing_properties'); e.code = 'missing_properties'; throw e
  }
  const ix = createDumpIndex()
  const files = []
  for (const { f, k } of items) {
    let rows = 0, lastPct = -1
    for await (const line of lines(f, b => { const pct = Math.floor((b / f.size) * 100); if (pct !== lastPct) { lastPct = pct; onProgress?.({ file: f.name, kind: k, pct, rows }) } })) {
      if (!line) continue
      addDumpLine(ix, k, line); rows++
      if (rows % 50000 === 0) await tick()
    }
    files.push({ name: f.name, kind: k, rows })
    await tick()
  }
  onProgress?.({ step: 'finish' })
  console.info('[epcad] parsed', Math.round(performance.now()))
  await tick()
  const list = finishDumpIndex(ix)
  console.info('[epcad] joined', list.length, Math.round(performance.now()))
  lastBuilt = list
  mem = { kind: 'dump', maps: dumpMaps(list), count: list.length, at: new Date().toISOString() }
  // Demo keeps the index in this browser. Production uploads it to the server (see uploadToServer).
  if (S.MODE === 'demo') saveChunks(list).catch(e => console.warn('epcad local save', e))
  return { count: list.length, files, valuesFilled: ix.valuesFilled, skipped: skipped.map(f => f.name), kind: 'dump' }
}

async function buildLegacy(files, onProgress) {
  const ix = createIndex()
  for (const f of files) {
    let hm = null, delim = '~', seen = 0
    for await (const line of lines(f)) {
      if (!line.trim()) continue
      if (!hm) { delim = detectDelimiter(line); hm = headerMap(line.split(delim)); if (hm.id == null && hm.geo == null) { const e = new Error('unknown_layout'); e.code = 'unknown_layout'; e.file = f.name; throw e } continue }
      addRow(ix, hm, line.split(delim))
      if (++seen % 20000 === 0) { onProgress?.({ file: f.name, rows: seen }); await tick() }
    }
    ix.files.push({ name: f.name, rows: seen, cols: Object.keys(hm || {}) })
  }
  const list = finalize(ix)
  await saveIndex(list, 'legacy').catch(() => {})
  mem = { kind: 'legacy', maps: lookupMaps(list), count: list.length, at: new Date().toISOString() }
  return { count: list.length, files: ix.files, kind: 'legacy' }
}

// ---------- server index (Supabase table epcad_parcels) ----------
const UP_KEY = 'iam_epcad_upload'
const BATCH = 500
export function uploadState() { try { return JSON.parse(localStorage.getItem(UP_KEY) || 'null') } catch { return null } }
const setUploadState = v => { try { localStorage.setItem(UP_KEY, JSON.stringify(v)) } catch {} }
let stopFlag = false
// Postgres rejects NUL and other control characters inside text (EPCAD deeds contain some): strip them.
const cleanStr = v => typeof v === 'string' ? (v.replace(/[\u0000-\u001f]+/g, ' ').trim() || null) : v
const sanitize = r => { const o = {}; for (const [k, v] of Object.entries(r)) o[k] = Array.isArray(v) ? v.map(cleanStr).filter(Boolean) : cleanStr(v); return o }
export const stopUpload = () => { stopFlag = true }

// Batched upserts with retries. Resumes from the last finished batch of the same build.
export async function uploadToServer(onProgress) {
  const sb = S.client(); if (!sb) throw new Error('no_server')
  const list = lastBuilt; if (!list?.length) throw new Error('nothing_to_upload')
  const builtAt = mem?.at
  const st = uploadState()
  let start = st && st.builtAt === builtAt && st.total === list.length ? st.done : 0
  stopFlag = false
  for (let i = start; i < list.length; i += BATCH) {
    if (stopFlag) return { done: i, total: list.length, stopped: true }
    const now = new Date().toISOString()
    const rows = list.slice(i, i + BATCH).map(({ legal_key, ...r }) => ({ ...sanitize(r), updated_at: now }))
    let err = null
    for (let a = 0; a < 5; a++) {
      // on a timeout (500) send the batch in smaller pieces
      const size = a < 2 ? rows.length : Math.max(50, Math.ceil(rows.length / (2 ** (a - 1))))
      err = null
      for (let j = 0; j < rows.length && !err; j += size) {
        const { error } = await sb.from('epcad_parcels').upsert(rows.slice(j, j + size), { onConflict: 'prop_id', returning: 'minimal' })
        if (error) err = error
      }
      if (!err) break
      await new Promise(r => setTimeout(r, 1000 * (a + 1)))
    }
    if (err) { setUploadState({ builtAt, total: list.length, done: i }); const e = new Error(err.message || 'upload_failed'); e.code = /relation .*epcad_parcels.* does not exist|schema cache/i.test(err.message || '') ? 'no_table' : 'upload_failed'; e.done = i; throw e }
    const done = Math.min(i + BATCH, list.length)
    setUploadState({ builtAt, total: list.length, done })
    onProgress?.({ done, total: list.length })
  }
  const finishedAt = new Date().toISOString()
  setUploadState({ builtAt, total: list.length, done: list.length, finishedAt })
  // Save the real total so every teammate sees it (counting 400k rows on the free plan times out).
  await S.saveSettings({ epcad_meta: { count: list.length, at: finishedAt } }).catch(() => {})
  return { done: list.length, total: list.length }
}
export async function serverStatus() {
  const sb = S.client(); if (!sb) return null
  const { count: est, error } = await sb.from('epcad_parcels').select('prop_id', { count: 'estimated', head: true })
  if (error) return { error: /does not exist|schema cache/i.test(error.message || '') ? 'no_table' : error.message }
  const meta = S.settings()?.epcad_meta
  if (meta?.count) return { count: meta.count, at: meta.at, done: true }
  const count = est
  if (!count) return { count: 0 }
  const { data } = await sb.from('epcad_parcels').select('updated_at').order('updated_at', { ascending: false }).limit(1)
  return { count, at: data?.[0]?.updated_at || null }
}

// ---------- matching ----------
async function matchServer(p) {
  const sb = S.client(); if (!sb) return null
  if (p.epcadId) { const { data } = await sb.from('epcad_parcels').select('*').eq('prop_id', String(p.epcadId)).limit(1); if (data?.[0]) return data[0] }
  if (p.address) { const { data } = await sb.from('epcad_parcels').select('*').eq('addr_key', normStreet(p.address)).limit(20); const hit = pickByZip(data, p.zip); if (hit) return hit }
  const lp = noticeLegalParts(p.legal)
  if (lp) { const { data } = await sb.from('epcad_parcels').select('*').eq('blk', lp.blk).eq('lot', lp.lot).limit(400); return pickByLegal(data || [], p.legal) }
  return null
}
// Returns a patch for applyEnrichment, or null. Uses the local index when loaded, else the server.
export async function patchForAsync(p) {
  const psf = { ...DEFAULT_PSF, ...(S.settings()?.psfByZip || {}) }
  if (!mem) await ready().catch(() => null)
  if (mem?.kind === 'dump') { const r = matchDump(mem.maps, p); if (r) return patchFromDump(r, p, psf) }
  if (mem?.kind === 'legacy') { const r = matchParcel(mem.maps, p); if (r) return toParcelPatch(r, p.zip) }
  if (S.MODE === 'supabase') { const r = await matchServer(p).catch(() => null); if (r) return patchFromDump(r, p, psf) }
  return null
}
// Kept for old callers: local index only.
export function patchFor(p) {
  if (!mem) return null
  const psf = { ...DEFAULT_PSF, ...(S.settings()?.psfByZip || {}) }
  if (mem.kind === 'dump') { const r = matchDump(mem.maps, p); return r ? patchFromDump(r, p, psf) : null }
  const r = matchParcel(mem.maps, p); return r ? toParcelPatch(r, p.zip) : null
}
export function useList(list, at) { mem = { kind: 'legacy', maps: lookupMaps(list), count: list.length, at: at || new Date().toISOString() } }
export const hasLocal = () => !!mem

// ---------- appraisal roll values (EPCAD "Appraisal Roll" saved as CSV) ----------
// The yearly Dump files can come with empty values (the new year is not appraised yet). The Appraisal Roll
// (Excel from EPCAD, saved as CSV, or the compact values CSV) has prop_id, market_val, owner_tax_yr and
// ExemptionCodeList. We only update those columns on the server so the rest of the index stays as it is.
export const isValuesCsv = head => /(^|[,;\t])"?prop_id"?([,;\t]|$)/i.test(head) && /market_val/i.test(head)
function csvCells(line, d) {
  const out = []; let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += ch }
    else if (ch === '"') q = true
    else if (ch === d) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur); return out.map(s => s.trim())
}
export async function uploadValuesCsv(file, onProgress) {
  const sb = S.client(); if (!sb) { const e = new Error('no_server'); e.code = 'no_server'; throw e }
  const head = await firstLine(file)
  const d = head.includes('\t') ? '\t' : head.split(';').length > head.split(',').length ? ';' : ','
  const H = csvCells(head.replace(/^﻿/, ''), d).map(h => h.toLowerCase())
  const col = n => H.indexOf(n)
  const iId = col('prop_id'), iMv = col('market_val'), iAp = col('appraised_val'), iYr = col('owner_tax_yr'), iEx = H.findIndex(h => h === 'exemptioncodelist')
  if (iId < 0 || iMv < 0) { const e = new Error('unknown_layout'); e.code = 'unknown_layout'; e.file = file.name; throw e }
  const num = v => { const n = Number(String(v ?? '').replace(/[$,\s]/g, '')); return Number.isFinite(n) && n > 0 ? n : null }
  let batch = [], done = 0, first = true, lastPct = -1
  const seen = new Set()
  const flush = async () => {
    if (!batch.length) return
    const rows = batch; batch = []
    let err = null
    for (let a = 0; a < 5; a++) {
      const size = a < 2 ? rows.length : Math.max(50, Math.ceil(rows.length / (2 ** (a - 1))))
      err = null
      for (let j = 0; j < rows.length && !err; j += size) {
        const { error } = await sb.from('epcad_parcels').upsert(rows.slice(j, j + size), { onConflict: 'prop_id', returning: 'minimal' })
        if (error) err = error
      }
      if (!err) break
      await new Promise(r => setTimeout(r, 1000 * (a + 1)))
    }
    if (err) { const e = new Error(err.message || 'upload_failed'); e.done = done; throw e }
    done += rows.length
  }
  const now = new Date().toISOString()
  for await (const line of lines(file, b => { const pct = Math.floor((b / file.size) * 100); if (pct !== lastPct) { lastPct = pct; onProgress?.({ pct, done }) } })) {
    if (first) { first = false; continue }
    if (!line.trim()) continue
    const c = csvCells(line, d)
    const id = String(c[iId] || '').replace(/\.0+$/, '').trim()
    if (!/^\d+$/.test(id) || seen.has(id)) continue
    seen.add(id)
    const mv = num(c[iMv]) ?? (iAp >= 0 ? num(c[iAp]) : null)
    const ex = iEx >= 0 ? String(c[iEx] || '').toUpperCase() : ''
    batch.push({ prop_id: id, market_value: mv, tax_year: iYr >= 0 ? (Number(c[iYr]) || null) : null, over65: /\bOV65S?\b/.test(ex), updated_at: now })
    if (batch.length >= 500) await flush()
  }
  await flush()
  await S.saveSettings({ epcad_values: { count: done, at: now, file: file.name } }).catch(() => {})
  return { done }
}
