// POST /api/voice/outbound  Calls made by the AI, started from the portal. Signed in team only.
//   { action: 'me' }                                  -> { phone, jarvis_call, ready }
//   { action: 'my_phone', phone, jarvis_call }        -> saves where Jarvis calls me
//   { action: 'call_me', brief, lang, reason }        -> Jarvis calls my phone now
//   { action: 'call_lead', to, name, address, parcelId, consent, goal, lang } -> the AI agent calls a customer
// Customer calls are only allowed with permission on file, not on the do-not-call or opt-out list, 9 am to 8 pm El Paso time.
import { body as readBody, only, guard } from '../_lib/util.js'
import { sb, e164 } from '../_lib/outreach.js'
import { placeCall, localHour, twilioReady } from '../_lib/calls.js'

export default async function handler(req, res) {
  if (!only(req, res)) return
  const a = await guard(req, res); if (!a) return
  const db = sb(); if (!db.ok) return res.status(503).json({ code: 'not_configured' })
  const me = (await (await db.rest(`team_members?user_id=eq.${a.user.id}&select=user_id,org_id,role,email,full_name,phone,jarvis_call,call_lang`)).json().catch(() => []))?.[0]
  if (!me) return res.status(403).json({ code: 'forbidden' })
  const b = readBody(req)
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const lang = b.lang === 'es' ? 'es' : 'en'

  if (b.action === 'me') return res.status(200).json({ phone: me.phone || '', jarvis_call: me.jarvis_call !== false, lang: me.call_lang || 'en', ready: twilioReady() })

  if (b.action === 'my_phone') {
    const phone = b.phone ? e164(b.phone) : null
    if (b.phone && !phone) return res.status(400).json({ code: 'bad_number' })
    await db.rest(`team_members?user_id=eq.${a.user.id}`, { method: 'PATCH', body: JSON.stringify({ phone, jarvis_call: b.jarvis_call !== false, call_lang: lang }) })
    return res.status(200).json({ ok: true, phone })
  }

  if (b.action === 'call_me') {
    if (!me.phone) return res.status(400).json({ code: 'no_phone' })
    const out = await placeCall({ db, host, orgId: me.org_id, to: me.phone, source: 'jarvis', lang, createdBy: a.user.id,
      data: { name: me.full_name || me.email, reason: String(b.reason || 'They asked you to call them from the portal.').slice(0, 300), brief: String(b.brief || '').slice(0, 6000) } })
    return res.status(out.ok ? 200 : 400).json(out)
  }

  if (b.action === 'call_lead') {
    if (!['admin', 'agent'].includes(me.role)) return res.status(403).json({ code: 'forbidden' })
    const to = e164(b.to)
    if (!to) return res.status(400).json({ code: 'bad_number' })
    if (!b.consent) return res.status(400).json({ code: 'no_consent' })
    const h = localHour()
    if (h < 9 || h >= 20) return res.status(400).json({ code: 'quiet_hours' })
    const opted = await (await db.rest(`opt_outs?org_id=eq.${me.org_id}&channel=eq.call&peer=eq.${encodeURIComponent(to)}&select=peer`)).json().catch(() => [])
    if (opted?.length) return res.status(400).json({ code: 'opted_out' })
    if (b.dnc) return res.status(400).json({ code: 'dnc' })
    const out = await placeCall({ db, host, orgId: me.org_id, to, source: 'outbound', lang, createdBy: a.user.id, parcelId: /^[0-9a-f-]{36}$/i.test(b.parcelId || '') ? b.parcelId : null,
      data: { name: String(b.name || '').slice(0, 120), address: String(b.address || '').slice(0, 200), consent: String(b.consent).slice(0, 120), goal: String(b.goal || '').slice(0, 400), by: me.email } })
    return res.status(out.ok ? 200 : 400).json(out)
  }
  return res.status(400).json({ code: 'bad_action' })
}
