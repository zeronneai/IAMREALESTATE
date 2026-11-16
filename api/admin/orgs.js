// Companies (multi-company portal). Platform owners only.
//   GET    /api/admin/orgs                       -> { orgs: [{ id, name, active, members, properties, created_at, current }] }
//   POST   /api/admin/orgs   { name, adminName, adminEmail, adminPassword }   create a company and its first admin
//   POST   /api/admin/orgs   { action: 'enter', id }                        switch the owner into that company
//   PATCH  /api/admin/orgs   { id, name?, active? }
//   DELETE /api/admin/orgs   { id, confirm }     confirm must equal the company name; deletes its data and accounts
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID = /^[0-9a-f-]{36}$/i
const out = (status, json) => ({ status, json })
const fail = (status, code, error) => out(status, { code, error })
const slugify = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

export async function handle({ method, body = {}, token, env = process.env, fetchImpl = fetch }) {
  const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || ''
  const service = env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!url || !service) return fail(503, 'not_configured', 'Not available yet.')
  if (!token) return fail(401, 'unauthorized', 'Please sign in again.')
  const svc = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }
  const rest = (path, init = {}) => fetchImpl(`${url}/rest/v1/${path}`, { ...init, headers: { ...svc, ...(init.headers || {}) } })
  const admin = (path, init = {}) => fetchImpl(`${url}/auth/v1/admin/${path}`, { ...init, headers: { ...svc, ...(init.headers || {}) } })
  const json = async r => { try { return await r.json() } catch { return null } }
  const count = async path => { const r = await rest(path, { headers: { Prefer: 'count=exact', Range: '0-0' } }); const m = String(r.headers.get('content-range') || '').match(/\/(\d+)/); return m ? +m[1] : 0 }

  const ur = await fetchImpl(`${url}/auth/v1/user`, { headers: { apikey: anon || service, Authorization: `Bearer ${token}` } })
  const user = ur.ok ? await json(ur) : null
  if (!user?.id) return fail(401, 'unauthorized', 'Please sign in again.')
  const pa = await rest(`platform_admins?user_id=eq.${user.id}&select=user_id`)
  if (!pa.ok) return fail(503, 'not_configured', 'Run orgs.sql first.')
  if (!((await json(pa)) || []).length) return fail(403, 'forbidden', 'Only the platform owner can manage companies.')
  const mine = (await json(await rest(`team_members?user_id=eq.${user.id}&select=org_id`)))?.[0]?.org_id || null

  if (method === 'GET') {
    let r = await rest('orgs?select=id,name,active,created_at,sms_number,email_from,reply_to&order=created_at.asc')
    if (!r.ok) r = await rest('orgs?select=id,name,active,created_at&order=created_at.asc')
    if (!r.ok) return fail(500, 'db', 'Could not load companies.')
    const orgs = (await json(r)) || []
    for (const o of orgs) {
      o.members = await count(`team_members?org_id=eq.${o.id}&select=user_id`)
      o.properties = await count(`parcels?org_id=eq.${o.id}&select=id`)
      o.current = o.id === mine
    }
    return out(200, { orgs })
  }

  if (method === 'POST' && body.action === 'enter') {
    const id = String(body.id || '')
    if (!UUID.test(id)) return fail(400, 'invalid', 'Unknown company.')
    const r = await rest('team_members?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ user_id: user.id, email: user.email, org_id: id, role: 'admin' }) })
    if (!r.ok) return fail(500, 'db', 'Could not switch company.')
    return out(200, { ok: true })
  }

  if (method === 'POST') {
    const name = String(body.name || '').trim().slice(0, 80)
    const adminName = String(body.adminName || '').trim().slice(0, 120)
    const email = String(body.adminEmail || '').trim().toLowerCase()
    const password = String(body.adminPassword || '')
    if (name.length < 2) return fail(400, 'invalid_name', 'Enter the company name.')
    if (!EMAIL.test(email)) return fail(400, 'invalid_email', 'Enter a valid email.')
    if (password.length < 8) return fail(400, 'weak_password', 'The password needs at least 8 characters.')
    const o = await rest('orgs', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ name, slug: `${slugify(name)}-${Date.now().toString(36)}` }) })
    const org = (await json(o))?.[0]
    if (!o.ok || !org?.id) return fail(500, 'db', 'Could not create the company.')
    const c = await admin('users', { method: 'POST', body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: adminName } }) })
    const cu = await json(c)
    if (!c.ok) {
      await rest(`orgs?id=eq.${org.id}`, { method: 'DELETE' })
      const msg = String(cu?.msg || cu?.message || cu?.error || '')
      if (c.status === 422 || /already|registered|exists/i.test(msg)) return fail(409, 'email_taken', 'That email already has an account.')
      return fail(502, 'auth', 'Could not create the account.')
    }
    const uid = cu?.id || cu?.user?.id
    const ins = await rest('team_members', { method: 'POST', body: JSON.stringify({ user_id: uid, email, full_name: adminName || null, role: 'admin', org_id: org.id }) })
    if (!ins.ok) { await admin(`users/${uid}`, { method: 'DELETE' }); await rest(`orgs?id=eq.${org.id}`, { method: 'DELETE' }); return fail(500, 'db', 'Could not add the admin.') }
    return out(200, { ok: true, id: org.id })
  }

  const id = String(body.id || '')
  if (!UUID.test(id)) return fail(400, 'invalid', 'Unknown company.')
  const orow = (await json(await rest(`orgs?id=eq.${id}&select=id,name,slug`)))?.[0]
  if (!orow) return fail(404, 'invalid', 'Unknown company.')

  if (method === 'PATCH') {
    const patch = {}
    if (body.name != null) { const n = String(body.name).trim().slice(0, 80); if (n.length < 2) return fail(400, 'invalid_name', 'Enter the company name.'); patch.name = n }
    if (body.sms_number !== undefined) {
      const d = String(body.sms_number || '').replace(/\D/g, '')
      patch.sms_number = !d ? null : d.length === 10 ? '+1' + d : d.length === 11 && d[0] === '1' ? '+' + d : undefined
      if (patch.sms_number === undefined) return fail(400, 'bad_number', 'Enter a 10 digit US number.')
    }
    if (body.email_from !== undefined) patch.email_from = String(body.email_from || '').trim().slice(0, 160) || null
    if (body.reply_to !== undefined) { const v = String(body.reply_to || '').trim().toLowerCase(); if (v && !EMAIL.test(v)) return fail(400, 'invalid_email', 'Enter a valid email.'); patch.reply_to = v || null }
    if (body.active != null) { if (orow.slug === 'iam' && !body.active) return fail(400, 'protected', 'The first company cannot be paused.'); patch.active = !!body.active }
    const r = await rest(`orgs?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
    if (!r.ok) return fail(500, 'db', 'Could not update the company.')
    return out(200, { ok: true })
  }

  if (method === 'DELETE') {
    if (orow.slug === 'iam') return fail(400, 'protected', 'The first company cannot be deleted.')
    if (String(body.confirm || '').trim() !== orow.name) return fail(400, 'confirm', 'Type the company name to confirm.')
    if (mine === id) return fail(400, 'inside', 'Switch to another company first.')
    const ms = (await json(await rest(`team_members?org_id=eq.${id}&select=user_id`))) || []
    const owners = new Set(((await json(await rest('platform_admins?select=user_id'))) || []).map(x => x.user_id))
    const d = await rest(`orgs?id=eq.${id}`, { method: 'DELETE' })
    if (!d.ok) return fail(500, 'db', 'Could not delete the company.')
    for (const m of ms) if (!owners.has(m.user_id)) await admin(`users/${m.user_id}`, { method: 'DELETE' })
    return out(200, { ok: true })
  }
  return fail(405, 'method_not_allowed', 'Not allowed.')
}

export default async function handler(req, res) {
  let body = req.body || {}
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  try {
    const r = await handle({ method: req.method, body, token })
    res.setHeader('Cache-Control', 'no-store')
    res.status(r.status).json(r.json)
  } catch (e) {
    console.error('admin/orgs', e)
    res.status(500).json({ code: 'error', error: 'Something went wrong. Please try again.' })
  }
}
