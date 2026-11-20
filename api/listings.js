// GET /api/listings  Homes the company marked "Public" in the portal inventory, for the website. No sign in.
// Only listing fields go out (never purchase price, rehab, tenant, mortgage or notes).
import { sb } from './_lib/outreach.js'

export default async function handler(req, res) {
  const db = sb()
  if (!db.ok) return res.status(200).json({ listings: [] })
  const slug = process.env.PUBLIC_ORG_SLUG || 'iam'
  const org = (await (await db.rest(`orgs?slug=eq.${encodeURIComponent(slug)}&select=id,active`)).json().catch(() => []))?.[0]
  if (!org || org.active === false) return res.status(200).json({ listings: [] })
  const r = await db.rest(`inventory?org_id=eq.${org.id}&published=eq.true&status=neq.sold&select=id,address,zip,status,listing,published_at&order=published_at.desc.nullslast`)
  if (!r.ok) return res.status(200).json({ listings: [] })
  const rows = await r.json()
  const num = v => (v === '' || v == null || isNaN(+v) ? null : +v)
  const listings = rows.map(v => {
    const l = v.listing || {}
    return {
      id: v.id, street: v.address, zip: v.zip || '', area: l.area || 'El Paso',
      type: ['sale', 'rent', 'multi'].includes(l.type) ? l.type : (v.status === 'rented' ? 'rent' : 'sale'),
      price: num(l.price) || 0, beds: num(l.beds) || 0, baths: num(l.baths) || 0, sqft: num(l.sqft) || 0, year: num(l.year),
      en: String(l.desc_en || '').slice(0, 1200), es: String(l.desc_es || l.desc_en || '').slice(0, 1200),
      terms: { ownerFinance: !!l.owner_finance, down: num(l.down), monthly: num(l.monthly), rate: num(l.rate), years: num(l.term_years), note: String(l.terms_note || '').slice(0, 200) },
      photos: (l.photos || []).filter(u => /^https:\/\//.test(u)).slice(0, 20),
    }
  })
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
  res.status(200).json({ listings })
}
