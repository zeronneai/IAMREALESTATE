// POST /api/sources/epcounty { month: "YYYY-MM" }
// Pulls Notices of Trustee's Sale from a configured source and reads them with the SAME keyless parser the
// browser uses (pdf.js text + rules, no AI, no keys). In Texas the notices are filed with the County Clerk
// 21 days before the sale held the first Tuesday of each month.
//
// IMPORTANT: the El Paso County public records site (apps.epcountytx.gov) publishes a robots.txt that disallows
// all automated access. This robot respects robots.txt and will not crawl it. Use one of these instead:
//   - The county grants bulk access (a feed or a shared folder): put that URL in EPCOUNTY_SOURCE_URL.
//   - The team downloads the month's PDFs by hand and drops them in Import center (card 01), which reads them the same way.
//   - A licensed data provider that returns JSON notices.
//
// EPCOUNTY_SOURCE_URL: one or more URLs separated by commas. {YYYY}, {MM} and {YYYY-MM} are replaced by the month.
// Each URL may return: a PDF (one notice or a packet), an HTML/JSON index that links to PDFs, or JSON notices.
import { body, only, guard, notConfigured } from '../_lib/util.js'
import { pdfLinesNode } from '../_lib/pdf.js'
import { parseNotices, parseNotice } from '../../src/portal/parse/notice.js'
import { normStreet } from '../../src/portal/parse/address.js'

export const config = { maxDuration: 60 }
const UA = 'IAM-Portal/1.0 (team tool; respects robots.txt)'
const MAX_PDFS = 40

const robotsCache = new Map()
async function allowed(url) {
  const u = new URL(url)
  if (!robotsCache.has(u.host)) {
    let rules = []
    try {
      const r = await fetch(`${u.protocol}//${u.host}/robots.txt`, { headers: { 'user-agent': UA } })
      if (r.ok) {
        let applies = false
        for (const line of (await r.text()).split(/\r?\n/)) {
          const [k, ...v] = line.split(':'); const val = v.join(':').trim()
          if (/^user-agent$/i.test(k.trim())) applies = val === '*' || /iam-portal/i.test(val)
          else if (applies && /^disallow$/i.test(k.trim()) && val) rules.push(val)
        }
      }
    } catch { rules = [] }
    robotsCache.set(u.host, rules)
  }
  return !robotsCache.get(u.host).some(p => u.pathname.startsWith(p))
}

const fill = (u, month) => u.replace(/\{YYYY-MM\}/g, month).replace(/\{YYYY\}/g, month.slice(0, 4)).replace(/\{MM\}/g, month.slice(5, 7))

function fromJsonNotice(n, src) {
  // already structured (from a feed): keep it, but run the parser on any raw text to fill gaps
  if (n.text) { const p = parseNotice(n.text); return { ...p, fields: { ...p.fields, ...stripEmpty(n) }, text: String(n.text).slice(0, 5000), source_url: src } }
  const f = stripEmpty(n)
  return { fields: f, confidence: Object.fromEntries(Object.keys(f).map(k => [k, 'med'])), score: 70, text: '', source_url: src }
}
const stripEmpty = o => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length)))

export async function fetchNotices(month) {
  const raw = process.env.EPCOUNTY_SOURCE_URL
  if (!raw) return null
  const started = Date.now()
  const out = [], errors = [], blocked = []
  const pdfQueue = []
  for (const u0 of raw.split(',').map(s => s.trim()).filter(Boolean)) {
    const url = fill(u0, month)
    if (!(await allowed(url))) { blocked.push(url); continue }
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA, ...(process.env.EPCOUNTY_SOURCE_KEY ? { Authorization: `Bearer ${process.env.EPCOUNTY_SOURCE_KEY}` } : {}) } })
      if (!r.ok) { errors.push(`${url}: HTTP ${r.status}`); continue }
      const type = r.headers.get('content-type') || ''
      if (/pdf/i.test(type) || /\.pdf($|\?)/i.test(url)) pdfQueue.push({ url, buf: Buffer.from(await r.arrayBuffer()) })
      else if (/json/i.test(type)) {
        const j = await r.json()
        const list = Array.isArray(j) ? j : j.notices || []
        list.forEach(n => out.push(fromJsonNotice(n, url)))
        ;(j.pdfs || j.urls || []).forEach(p => pdfQueue.push({ url: new URL(p, url).href }))
      } else {
        const html = await r.text()
        const links = [...html.matchAll(/href=["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi)].map(m => new URL(m[1].replace(/&amp;/g, '&'), url).href)
        ;[...new Set(links)].forEach(l => pdfQueue.push({ url: l }))
      }
    } catch (e) { errors.push(`${url}: ${e.message}`) }
  }
  for (const item of pdfQueue.slice(0, MAX_PDFS)) {
    if (Date.now() - started > 48_000) { errors.push('time budget reached, run again to continue'); break }
    try {
      if (!item.buf) {
        if (!(await allowed(item.url))) { blocked.push(item.url); continue }
        const r = await fetch(item.url, { headers: { 'user-agent': UA } })
        if (!r.ok) { errors.push(`${item.url}: HTTP ${r.status}`); continue }
        item.buf = Buffer.from(await r.arrayBuffer())
      }
      const pages = await pdfLinesNode(item.buf)
      const text = pages.map(p => p.join('\n')).join('\n\f\n')
      if (text.replace(/\s/g, '').length < 40) { errors.push(`${item.url}: scanned PDF (no text layer); drop it in Import center to OCR it`); continue }
      parseNotices(text).filter(n => /trustee|foreclos|deed of trust/i.test(n.text) && (n.fields.sale_date || n.fields.property_address)).forEach(n => out.push({ ...n, text: n.text.slice(0, 5000), source_url: item.url }))
    } catch (e) { errors.push(`${item.url}: ${e.message}`) }
  }
  // dedupe by instrument number, else normalized address + sale date
  const seen = new Set(), notices = []
  let skipped = 0
  for (const n of out) {
    const f = n.fields || {}
    const k = f.instrument_number || `${normStreet(f.property_address)}|${f.sale_date}`
    if (seen.has(k)) { skipped++; continue }
    seen.add(k); notices.push(n)
  }
  return { notices, skipped, errors, blocked }
}

export default async function handler(req, res) {
  if (!only(req, res)) return
  if (!(await guard(req, res))) return
  const month = String(body(req).month || new Date().toISOString().slice(0, 7))
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'invalid_month' })
  try {
    const r = await fetchNotices(month)
    if (!r) return notConfigured(res, 'epcounty', ['EPCOUNTY_SOURCE_URL (a source the county allows, see docs/PORTAL_README.md)'])
    if (!r.notices.length && r.blocked.length) return res.status(451).json({ error: 'robots_disallow', detail: `robots.txt disallows automated access: ${r.blocked.slice(0, 3).join(', ')}`, needs: ['a permitted source in EPCOUNTY_SOURCE_URL'] })
    res.status(200).json({ month, count: r.notices.length, notices: r.notices, skipped: r.skipped, errors: r.errors, blocked: r.blocked })
  } catch (e) {
    console.error(e)
    res.status(502).json({ error: 'source_error', detail: String(e.message || e).slice(0, 300) })
  }
}
