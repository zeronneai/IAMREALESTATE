// POST /api/sources/epcounty { month: "YYYY-MM" }
// Pulls this month's Notices of Trustee's Sale for El Paso County.
// Texas notices are filed with the County Clerk 21 days before the sale held the first Tuesday of each month.
// We have NOT verified how El Paso County publishes postings online, so this is an adapter:
//   FORECLOSURE_FEED_PROVIDER=custom  + EPCOUNTY_SOURCE_URL  -> any endpoint returning [{...notice fields}]
//   FORECLOSURE_FEED_PROVIDER=attom|batchdata|propertyradar  -> implement in providers below with that vendor's key
// Each provider must return normalized notices: { sale_date, property_address, zip, grantors[], mortgagee, trustees[], original_loan_amount, deed_of_trust_date, legal_description, source_url }
import { body, only, guard, notConfigured } from '../_lib/util.js'

export const config = { maxDuration: 60 }

export async function fetchNotices(month) {
  const provider = (process.env.FORECLOSURE_FEED_PROVIDER || '').toLowerCase()
  if (provider === 'custom' && process.env.EPCOUNTY_SOURCE_URL) {
    const r = await fetch(`${process.env.EPCOUNTY_SOURCE_URL}${process.env.EPCOUNTY_SOURCE_URL.includes('?') ? '&' : '?'}month=${month}`, {
      headers: process.env.EPCOUNTY_SOURCE_KEY ? { Authorization: `Bearer ${process.env.EPCOUNTY_SOURCE_KEY}` } : {},
    })
    if (!r.ok) throw new Error(`source ${r.status}`)
    const j = await r.json()
    return Array.isArray(j) ? j : j.notices || []
  }
  // TODO(provider): add attom / batchdata / propertyradar pre-foreclosure feeds here once an account is chosen.
  return null
}

export default async function handler(req, res) {
  if (!only(req, res)) return
  if (!(await guard(req, res))) return
  const month = String(body(req).month || new Date().toISOString().slice(0, 7))
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'invalid_month' })
  try {
    const notices = await fetchNotices(month)
    if (!notices) return notConfigured(res, 'epcounty', ['FORECLOSURE_FEED_PROVIDER', 'EPCOUNTY_SOURCE_URL (or a paid feed key)'])
    res.status(200).json({ month, count: notices.length, notices })
  } catch (e) {
    console.error(e)
    res.status(502).json({ error: 'source_error', detail: String(e.message || e).slice(0, 300) })
  }
}
