// GET /api/cron/refresh  (Vercel Cron, daily). Pulls the month's notices when a permitted source is configured, reads
// them with the keyless parser and
// stores them in Supabase (requires SUPABASE_SERVICE_ROLE_KEY). Protected by CRON_SECRET.
import { fetchNotices } from '../sources/epcounty.js'

export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'unauthorized' })
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const now = new Date()
  const months = [now, new Date(now.getFullYear(), now.getMonth() + 1, 1)].map(d => d.toISOString().slice(0, 7))
  const out = { months, pulled: 0, stored: 0, skipped: [] }
  for (const m of months) {
    let got = null
    try { got = await fetchNotices(m) } catch (e) { out.skipped.push(`${m}: ${e.message}`); continue }
    if (!got) { out.skipped.push('no source configured'); break }
    if (got.blocked.length) out.skipped.push(`robots.txt blocked ${got.blocked.length} URL(s)`)
    const notices = got.notices.map(n => ({ ...n.fields, confidence: n.confidence, score: n.score, source_url: n.source_url }))
    out.pulled += notices.length
    if (!url || !key) { out.skipped.push('supabase service key missing'); continue }
    const rows = notices.map(n => ({
      source_key: `${n.sale_date || m}|${(n.property_address || '').toUpperCase()}`,
      sale_date: n.sale_date || null, property_address: n.property_address || null, zip: n.zip || null,
      grantors: n.grantors || [], mortgagee: n.mortgagee || null, trustees: n.trustees || [],
      original_loan_amount: n.original_loan_amount || null, deed_of_trust_date: n.deed_of_trust_date || null,
      legal_description: n.legal_description || null, source_url: n.source_url || null, raw: n,
    }))
    const r = await fetch(`${url}/rest/v1/notice_inbox?on_conflict=source_key`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json', Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(rows),
    })
    if (r.ok) out.stored += rows.length; else out.skipped.push(`store ${r.status}`)
  }
  res.status(200).json(out)
}
