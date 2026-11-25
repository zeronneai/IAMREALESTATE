// GET /api/cron/jarvis  (Vercel Cron, mornings Mon to Sat). Jarvis calls each team member who turned it on,
// only when something urgent needs them: auctions in 3 days or less for homes they are working, appointments today,
// texts waiting for an answer, and hot calls from the AI agent not reviewed yet. Nothing urgent, no call.
import { sb } from '../_lib/outreach.js'
import { placeCall, TZ } from '../_lib/calls.js'
export const config = { maxDuration: 60 }

const WORKING = ['contacted', 'appointment', 'offer', 'under_contract']
const dayOf = d => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d)

export async function urgentItems(db, orgId, now = new Date()) {
  const today = dayOf(now), in3 = dayOf(new Date(now.getTime() + 3 * 86400e3))
  const items = []
  const fcs = await (await db.rest(`foreclosures?org_id=eq.${orgId}&sale_date=gte.${today}&sale_date=lte.${in3}&select=sale_date,parcels(address,status)`)).json().catch(() => [])
  for (const f of Array.isArray(fcs) ? fcs : []) if (f.parcels && WORKING.includes(f.parcels.status)) items.push(`Auction on ${f.sale_date} for ${f.parcels.address}, which the team is working (status ${f.parcels.status}).`)
  const end = new Date(now.getTime() + 24 * 3600e3).toISOString()
  const ap = await (await db.rest(`appointments?org_id=eq.${orgId}&status=in.(scheduled,confirmed)&starts_at=gte.${encodeURIComponent(now.toISOString())}&starts_at=lte.${encodeURIComponent(end)}&select=title,starts_at,with_name,location&order=starts_at.asc&limit=10`)).json().catch(() => [])
  for (const a of Array.isArray(ap) ? ap : []) {
    const t = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(a.starts_at))
    items.push(`Appointment ${t}: ${a.title}${a.with_name ? ' with ' + a.with_name : ''}${a.location ? ' at ' + a.location : ''}.`)
  }
  const since = new Date(now.getTime() - 24 * 3600e3).toISOString()
  const fresh = await (await db.rest(`parcels?org_id=eq.${orgId}&source=eq.county_foreclosure_map&created_at=gte.${encodeURIComponent(since)}&select=id&limit=500`)).json().catch(() => [])
  const fresh2 = await (await db.rest(`parcels?org_id=eq.${orgId}&source=eq.county_map&created_at=gte.${encodeURIComponent(since)}&select=id&limit=500`)).json().catch(() => [])
  const nNew = (Array.isArray(fresh) ? fresh.length : 0) + (Array.isArray(fresh2) ? fresh2.length : 0)
  if (nNew) items.push(`${nNew} new foreclosure ${nNew === 1 ? 'home was' : 'homes were'} added in the last 24 hours. The best ones are in the list "Oportunidades de Jarvis".`)
  const msgs = await (await db.rest(`messages?org_id=eq.${orgId}&direction=eq.in&read=eq.false&select=peer&limit=200`)).json().catch(() => [])
  const peers = new Set((Array.isArray(msgs) ? msgs : []).map(m => m.peer))
  if (peers.size) items.push(`${peers.size} ${peers.size === 1 ? 'person is' : 'people are'} waiting for an answer to a text or email.`)
  const hot = await (await db.rest(`voice_calls?org_id=eq.${orgId}&interest=eq.hot&reviewed=eq.false&select=data,phone&limit=20`)).json().catch(() => [])
  for (const c of Array.isArray(hot) ? hot : []) items.push(`Hot lead from the AI phone agent not reviewed yet: ${c.data?.name || c.phone || 'unknown'}${c.data?.property_address ? ' about ' + c.data.property_address : ''}.`)
  return items
}

export default async function handler(req, res) {
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'unauthorized' })
  const db = sb(); if (!db.ok) return res.status(503).json({ error: 'not_configured' })
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const orgs = await (await db.rest('orgs?active=is.true&select=id')).json().catch(() => [])
  const out = { orgs: 0, calls: 0, errors: [] }
  for (const o of Array.isArray(orgs) ? orgs : []) {
    const items = await urgentItems(db, o.id)
    if (!items.length) continue
    out.orgs++
    const team = await (await db.rest(`team_members?org_id=eq.${o.id}&jarvis_call=is.true&phone=not.is.null&role=in.(admin,agent)&select=user_id,full_name,email,phone,call_lang`)).json().catch(() => [])
    for (const m of Array.isArray(team) ? team : []) {
      const r = await placeCall({ db, host, orgId: o.id, to: m.phone, source: 'jarvis', lang: m.call_lang === 'es' ? 'es' : 'en', data: { name: m.full_name || m.email, reason: 'Morning call: there are urgent items today.', brief: items.map(x => '- ' + x).join('\n') } })
      if (r.ok) out.calls++; else out.errors.push(r.code)
    }
  }
  res.status(200).json(out)
}
