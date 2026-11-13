// Team management for the portal (admins only). Email + password accounts, no emails sent.
// The service role key stays on the server: SUPABASE_SERVICE_ROLE_KEY in Vercel.
//   GET    /api/admin/users?me=1   -> { role, email } for the caller (any signed in user)
//   GET    /api/admin/users        -> { members: [{ id, name, email, role, created_at }] }
//   POST   /api/admin/users        { name, email, password, role }
//   PATCH  /api/admin/users        { id, role?, password? }
//   DELETE /api/admin/users        { id }
// First run: when team_members is empty, the first signed in user who calls this becomes admin.

const ROLES = ['admin', 'agent', 'viewer']
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID = /^[0-9a-f-]{36}$/i

function cfg(env) {
  return {
    url: (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/+$/, ''),
    anon: env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '',
    service: env.SUPABASE_SERVICE_ROLE_KEY || '',
  }
}

const out = (status, json) => ({ status, json })
const fail = (status, code, error) => out(status, { code, error })

// Core logic, separated from the HTTP wrapper so it can be tested with a mocked fetch.
export async function handle({ method, query = {}, body = {}, token, env = process.env, fetchImpl = fetch }) {
  const { url, anon, service } = cfg(env)
  if (!url || !service) return fail(503, 'not_configured', 'Team management is not available yet.')
  if (!token) return fail(401, 'unauthorized', 'Please sign in again.')

  const svc = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }
  const rest = (path, init = {}) => fetchImpl(`${url}/rest/v1/${path}`, { ...init, headers: { ...svc, ...(init.headers || {}) } })
  const admin = (path, init = {}) => fetchImpl(`${url}/auth/v1/admin/${path}`, { ...init, headers: { ...svc, ...(init.headers || {}) } })
  const json = async r => { try { return await r.json() } catch { return null } }

  // 1. Who is calling: verify the session token with Supabase Auth.
  const ur = await fetchImpl(`${url}/auth/v1/user`, { headers: { apikey: anon || service, Authorization: `Bearer ${token}` } })
  if (!ur.ok) return fail(401, 'unauthorized', 'Please sign in again.')
  const user = await json(ur)
  if (!user?.id) return fail(401, 'unauthorized', 'Please sign in again.')

  // 2. Caller's team row. First run bootstrap when the team is empty.
  let r = await rest(`team_members?user_id=eq.${encodeURIComponent(user.id)}&select=role,email,full_name`)
  if (!r.ok) return fail(500, 'db', 'Team storage is not ready.')
  let me = (await json(r))?.[0] || null
  if (!me) {
    const any = await rest('team_members?select=user_id&limit=1')
    const rows = any.ok ? await json(any) : null
    if (Array.isArray(rows) && rows.length === 0) {
      const ins = await rest('team_members', { method: 'POST', headers: { Prefer: 'return=representation,resolution=ignore-duplicates' }, body: JSON.stringify({ user_id: user.id, email: user.email, full_name: user.user_metadata?.full_name || null, role: 'admin' }) })
      if (ins.ok) me = { role: 'admin', email: user.email, bootstrap: true }
    }
  }
  if (method === 'GET' && (query.me === '1' || query.me === 1 || query.me === true)) return out(200, { role: me?.role || null, email: user.email, bootstrap: !!me?.bootstrap })
  if (!me) return fail(403, 'forbidden', 'Your account is not on the team yet.')
  if (me.role !== 'admin') return fail(403, 'forbidden', 'Only admins can manage the team.')

  const admins = async () => { const a = await rest('team_members?role=eq.admin&select=user_id'); return a.ok ? (await json(a)) || [] : [] }

  if (method === 'GET') {
    const l = await rest('team_members?select=user_id,email,full_name,role,created_at&order=created_at.asc')
    if (!l.ok) return fail(500, 'db', 'Could not load the team.')
    return out(200, { members: ((await json(l)) || []).map(m => ({ id: m.user_id, name: m.full_name || '', email: m.email, role: m.role, created_at: m.created_at })) })
  }

  if (method === 'POST') {
    const name = String(body.name || '').trim().slice(0, 120)
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    const role = ROLES.includes(body.role) ? body.role : 'agent'
    if (!EMAIL.test(email)) return fail(400, 'invalid_email', 'Enter a valid email.')
    if (password.length < 8) return fail(400, 'weak_password', 'The password needs at least 8 characters.')
    const c = await admin('users', { method: 'POST', body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: name } }) })
    const cu = await json(c)
    if (!c.ok) {
      const msg = String(cu?.msg || cu?.message || cu?.error_description || cu?.error || '')
      if (c.status === 422 || /already|registered|exists/i.test(msg)) return fail(409, 'email_taken', 'That email already has an account.')
      if (/password/i.test(msg)) return fail(400, 'weak_password', 'The password needs at least 8 characters.')
      return fail(502, 'auth', 'Could not create the account.')
    }
    const id = cu?.id || cu?.user?.id
    const ins = await rest('team_members', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ user_id: id, email, full_name: name || null, role }) })
    if (!ins.ok) { await admin(`users/${id}`, { method: 'DELETE' }); return fail(500, 'db', 'Could not add the member.') }
    return out(200, { ok: true, id })
  }

  const id = String(body.id || query.id || '')
  if (!UUID.test(id)) return fail(400, 'invalid', 'Unknown member.')

  if (method === 'PATCH') {
    if (body.role != null) {
      if (!ROLES.includes(body.role)) return fail(400, 'invalid', 'Unknown role.')
      if (id === user.id && body.role !== 'admin') return fail(400, 'self', 'You cannot change your own role.')
      if (body.role !== 'admin') { const a = await admins(); if (a.length <= 1 && a.some(x => x.user_id === id)) return fail(400, 'last_admin', 'The team needs at least one admin.') }
      const u = await rest(`team_members?user_id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ role: body.role }) })
      if (!u.ok) return fail(500, 'db', 'Could not update the role.')
    }
    if (body.password != null) {
      const pw = String(body.password)
      if (pw.length < 8) return fail(400, 'weak_password', 'The password needs at least 8 characters.')
      const p = await admin(`users/${id}`, { method: 'PUT', body: JSON.stringify({ password: pw }) })
      if (!p.ok) return fail(502, 'auth', 'Could not reset the password.')
    }
    return out(200, { ok: true })
  }

  if (method === 'DELETE') {
    if (id === user.id) return fail(400, 'self', 'You cannot remove yourself.')
    const a = await admins(); if (a.length <= 1 && a.some(x => x.user_id === id)) return fail(400, 'last_admin', 'The team needs at least one admin.')
    await rest(`team_members?user_id=eq.${id}`, { method: 'DELETE' })
    const d = await admin(`users/${id}`, { method: 'DELETE' })
    if (!d.ok && d.status !== 404) return fail(502, 'auth', 'Could not remove the account.')
    return out(200, { ok: true })
  }

  return fail(405, 'method_not_allowed', 'Not allowed.')
}

export default async function handler(req, res) {
  let body = req.body || {}
  if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  try {
    const r = await handle({ method: req.method, query: req.query || {}, body, token })
    res.setHeader('Cache-Control', 'no-store')
    res.status(r.status).json(r.json)
  } catch (e) {
    console.error('admin/users', e)
    res.status(500).json({ code: 'error', error: 'Something went wrong. Please try again.' })
  }
}
