// POST /api/skiptrace  { records: [{ id, owner, address, city, state, zip, mailing_address? }] }
// Provider chosen by SKIPTRACE_PROVIDER = batchdata | reiskip. Without keys returns 501 (portal falls back to demo data).
import { body, only, guard, notConfigured } from './_lib/util.js'

export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  if (!only(req, res)) return
  if (!(await guard(req, res))) return
  const recs = Array.isArray(body(req).records) ? body(req).records.slice(0, 250) : []
  if (!recs.length) return res.status(400).json({ error: 'no_records' })
  for (const r of recs) if (!r.id || !r.address || !r.zip) return res.status(400).json({ error: 'invalid_record', id: r.id || null })

  const provider = (process.env.SKIPTRACE_PROVIDER || '').toLowerCase()
  try {
    if (provider === 'batchdata' && process.env.BATCHDATA_API_KEY) return res.status(200).json({ provider, results: await batchdata(recs) })
    if (provider === 'reiskip' && process.env.REISKIP_API_KEY) return res.status(200).json({ provider, results: await reiskip(recs) })
  } catch (e) {
    console.error(e)
    return res.status(502).json({ error: 'provider_error', detail: String(e.message || e).slice(0, 300) })
  }
  return notConfigured(res, 'skiptrace', ['SKIPTRACE_PROVIDER', 'BATCHDATA_API_KEY or REISKIP_API_KEY'])
}

// BatchData property skip trace (v1). Confirm the endpoint/fields against your BatchData account docs.
async function batchdata(recs) {
  const r = await fetch(process.env.BATCHDATA_SKIPTRACE_URL || 'https://api.batchdata.com/api/v1/property/skip-trace', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${process.env.BATCHDATA_API_KEY}` },
    body: JSON.stringify({ requests: recs.map(r => ({ requestId: r.id, propertyAddress: { street: r.address, city: r.city || 'El Paso', state: r.state || 'TX', zip: r.zip } })) }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`batchdata ${r.status} ${j?.status?.message || ''}`)
  const persons = j?.results?.persons || []
  return recs.map((rec, i) => {
    const p = persons.find(x => x?.meta?.requestId === rec.id) || persons[i] || {}
    return {
      id: rec.id,
      phones: (p.phoneNumbers || []).map(n => ({ number: n.number, type: n.type, dnc: !!n.dnc, litigator: !!(p.litigator || n.tcpa), score: n.score ?? null })),
      emails: (p.emails || []).map(e => e.email || e).filter(Boolean),
      deceased: !!p.death?.deceased,
    }
  })
}

// REISkip: bulk is file based. Configure REISKIP_API_URL with the endpoint your REISkip account exposes.
async function reiskip(recs) {
  const url = process.env.REISKIP_API_URL
  if (!url) throw new Error('REISKIP_API_URL not set (REISkip API access is enabled per account)')
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${process.env.REISKIP_API_KEY}` },
    body: JSON.stringify({ records: recs }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`reiskip ${r.status}`)
  return (j.results || []).map(x => ({ id: x.id, phones: x.phones || [], emails: x.emails || [], deceased: !!x.deceased }))
}
