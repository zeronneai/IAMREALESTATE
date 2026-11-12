// GET /api/cron/epcad  (Vercel Cron, weekly). Downloads the EPCAD export files, builds the compact parcel index
// with the same parser the browser uses, and stores it in Supabase Storage (bucket "portal", epcad/index.json)
// so every teammate gets it without importing files. Needs EPCAD_EXPORT_URL (comma separated .txt or .zip URLs
// of the "Property Search Dataset" files) plus SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Protected by CRON_SECRET.
// Note: the full county roll is large. If a run hits the time limit, point EPCAD_EXPORT_URL at the smaller files
// (Owners, Properties, Values, Deeds) or run the browser import instead (Import center, card 03).
import { unzipSync, strFromU8 } from 'fflate'
import { createIndex, addRow, headerMap, detectDelimiter, finalize } from '../../src/portal/parse/epcad.js'

export const config = { maxDuration: 300 }

function ingest(ix, name, text) {
  let hm = null, delim = '~', rows = 0
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    if (!hm) { delim = detectDelimiter(line); hm = headerMap(line.split(delim)); if (hm.id == null && hm.geo == null) return { name, rows: 0, skipped: 'no id column' }; continue }
    addRow(ix, hm, line.split(delim)); rows++
  }
  return { name, rows }
}

export default async function handler(req, res) {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'unauthorized' })
  const urls = (process.env.EPCAD_EXPORT_URL || '').split(',').map(s => s.trim()).filter(Boolean)
  if (!urls.length) return res.status(501).json({ error: 'not_configured', needs: ['EPCAD_EXPORT_URL'] })
  const ix = createIndex(), files = []
  for (const u of urls) {
    try {
      const r = await fetch(u, { headers: { 'user-agent': 'IAM-Portal/1.0' } })
      if (!r.ok) { files.push({ name: u, error: `HTTP ${r.status}` }); continue }
      const buf = new Uint8Array(await r.arrayBuffer())
      if (/\.zip($|\?)/i.test(u) || (buf[0] === 0x50 && buf[1] === 0x4b)) {
        const z = unzipSync(buf, { filter: f => /\.(txt|csv)$/i.test(f.name) })
        for (const [name, data] of Object.entries(z)) files.push(ingest(ix, name, strFromU8(data)))
      } else files.push(ingest(ix, u.split('/').pop(), new TextDecoder().decode(buf)))
    } catch (e) { files.push({ name: u, error: e.message }) }
  }
  const list = finalize(ix)
  const out = { parcels: list.length, files }
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (url && key && list.length) {
    const r = await fetch(`${url}/storage/v1/object/portal/epcad/index.json`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json', 'x-upsert': 'true' }, body: JSON.stringify({ at: new Date().toISOString(), list }) })
    out.stored = r.ok; if (!r.ok) out.storeError = `HTTP ${r.status}`
  } else out.stored = false
  res.status(200).json(out)
}
