// POST /api/skiptrace  { records: [{ id, owner, address, city, state, zip, mailing_address? }] }
// Provider chosen by SKIPTRACE_PROVIDER = tracerfy | batchdata | reiskip (tracerfy is used automatically when TRACERFY_API_KEY is set). Without keys returns 501 (portal falls back to demo data).
import { body, only, guard, notConfigured } from './_lib/util.js'

export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  if (!only(req, res)) return
  if (!(await guard(req, res))) return
  const recs = Array.isArray(body(req).records) ? body(req).records.slice(0, 250) : []
  if (!recs.length) return res.status(400).json({ error: 'no_records' })
  for (const r of recs) if (!r.id || !r.address || !r.zip) return res.status(400).json({ error: 'invalid_record', id: r.id || null })

  const provider = (process.env.SKIPTRACE_PROVIDER || (process.env.TRACERFY_API_KEY ? 'tracerfy' : '')).toLowerCase()
  try {
    if (provider === 'tracerfy' && process.env.TRACERFY_API_KEY) return res.status(200).json({ provider, results: await tracerfy(recs.slice(0, 40)) })
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

// Tracerfy instant lookup: one call per address, owner found from the address alone.
// 5 credits (about $0.10) per hit, nothing on a miss. Phones come ranked best first, with type and DNC flag.
async function tracerfy(recs) {
  const one = async rec => {
    const r = await fetch(process.env.TRACERFY_LOOKUP_URL || 'https://tracerfy.com/v1/api/trace/lookup/', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${process.env.TRACERFY_API_KEY}` },
      body: JSON.stringify({ address: rec.address, city: rec.city || 'El Paso', state: rec.state || 'TX', zip: rec.zip }),
    })
    const j = await r.json().catch(() => ({}))
    if (r.status === 401 || r.status === 403) throw new Error('tracerfy key rejected')
    if (r.status === 402) throw new Error('tracerfy has no credits left')
    if (!r.ok || !j.hit) return { id: rec.id, phones: [], emails: [], deceased: false, owner: null }
    // Only the owners (relatives and other household members are skipped), best numbers first.
    const all = j.persons || [], owners = all.filter(p => p.property_owner)
    const people = owners.length ? owners : all.slice(0, 1)
    const phones = [], emails = [], seen = new Set()
    for (const p of people) {
      const who = [p.first_name, p.last_name].filter(Boolean).join(' ')
      for (const n of (p.phones || []).sort((a, b) => (a.rank || 99) - (b.rank || 99))) {
        const num = String(n.number || '').replace(/\D/g, ''); if (!num || seen.has(num)) continue; seen.add(num)
        phones.push({ number: num, type: (n.type || '').toLowerCase(), dnc: !!n.dnc, litigator: !!(n.litigator || n.tcpa), score: n.rank ? Math.max(10, 100 - (n.rank - 1) * 15) : null, name: who, owner: !!p.property_owner })
      }
      for (const e of p.emails || []) if (e.email && !emails.includes(e.email)) emails.push(e.email)
    }
    const o = people[0]
    phones.splice(5)
    return { id: rec.id, phones, emails: emails.slice(0, 3), deceased: !!(o && o.deceased), owner: o ? [o.first_name, o.last_name].filter(Boolean).join(' ') : null, credits: j.credits_deducted || 0 }
  }
  const out = []
  for (let i = 0; i < recs.length; i += 4) out.push(...await Promise.all(recs.slice(i, i + 4).map(one)))
  return out
}
