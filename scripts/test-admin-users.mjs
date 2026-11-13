// Unit test for api/admin/users.js auth guard and first run logic, with a mocked Supabase.
import assert from 'node:assert/strict'
import { handle } from '../api/admin/users.js'

const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc' }
const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222'
function mock(state) {
  const calls = []
  const res = (status, body) => ({ ok: status < 300, status, json: async () => body })
  const f = async (u, init = {}) => {
    const m = init.method || 'GET'; calls.push(`${m} ${u.replace(env.SUPABASE_URL, '')}`)
    if (u.endsWith('/auth/v1/user')) { const tok = init.headers.Authorization.slice(7); const usr = state.tokens[tok]; return usr ? res(200, usr) : res(401, {}) }
    if (u.includes('/rest/v1/team_members')) {
      if (m === 'GET') {
        const q = new URL(u).searchParams
        let rows = state.team
        if (q.get('user_id')) rows = rows.filter(r => 'eq.' + r.user_id === q.get('user_id'))
        if (q.get('role')) rows = rows.filter(r => 'eq.' + r.role === q.get('role'))
        return res(200, rows.slice(0, q.get('limit') ? +q.get('limit') : 99))
      }
      if (m === 'POST') { const b = JSON.parse(init.body); if (!state.team.some(r => r.user_id === b.user_id)) state.team.push({ ...b, created_at: 'now' }); return res(201, [b]) }
      if (m === 'PATCH') { const id = new URL(u).searchParams.get('user_id').slice(3); Object.assign(state.team.find(r => r.user_id === id), JSON.parse(init.body)); return res(204, null) }
      if (m === 'DELETE') { const id = new URL(u).searchParams.get('user_id').slice(3); state.team = state.team.filter(r => r.user_id !== id); return res(204, null) }
    }
    if (u.includes('/auth/v1/admin/users')) {
      if (m === 'POST') { const b = JSON.parse(init.body); assert.equal(b.email_confirm, true); assert.equal(init.headers.Authorization, 'Bearer svc'); if (state.taken?.includes(b.email)) return res(422, { msg: 'User already registered' }); return res(200, { id: B, email: b.email }) }
      return res(200, {})
    }
    return res(404, {})
  }
  return { f, calls }
}
const run = (state, args) => { const m = mock(state); return handle({ env, fetchImpl: m.f, ...args }).then(r => ({ ...r, calls: m.calls })) }

// no service key -> 503, no token -> 401, bad token -> 401
assert.equal((await handle({ method: 'GET', token: 't', env: { SUPABASE_URL: 'x' } })).status, 503)
assert.equal((await run({ tokens: {}, team: [] }, { method: 'GET' })).status, 401)
assert.equal((await run({ tokens: {}, team: [] }, { method: 'GET', token: 'bad' })).status, 401)

// first run: empty team -> caller becomes admin
let st = { tokens: { ta: { id: A, email: 'a@x.co' } }, team: [] }
let r = await run(st, { method: 'GET', query: { me: '1' }, token: 'ta' })
assert.equal(r.json.role, 'admin'); assert.equal(st.team[0].role, 'admin'); assert.equal(r.json.bootstrap, true)

// not empty team: a stranger does not become admin
st = { tokens: { ta: { id: A, email: 'a@x.co' }, tb: { id: B, email: 'b@x.co' } }, team: [{ user_id: A, email: 'a@x.co', role: 'admin' }] }
r = await run(st, { method: 'GET', query: { me: '1' }, token: 'tb' }); assert.equal(r.json.role, null); assert.equal(st.team.length, 1)
r = await run(st, { method: 'GET', token: 'tb' }); assert.equal(r.status, 403)

// agent cannot manage
st.team.push({ user_id: B, email: 'b@x.co', role: 'agent' })
r = await run(st, { method: 'POST', token: 'tb', body: { email: 'c@x.co', password: 'longenough', role: 'admin' } }); assert.equal(r.status, 403)
assert.ok(!r.calls.some(c => c.includes('/auth/v1/admin')), 'agent must not reach admin API')

// admin: list, create, validation, taken email
r = await run(st, { method: 'GET', token: 'ta' }); assert.equal(r.json.members.length, 2)
r = await run(st, { method: 'POST', token: 'ta', body: { email: 'nope', password: 'longenough' } }); assert.equal(r.json.code, 'invalid_email')
r = await run(st, { method: 'POST', token: 'ta', body: { email: 'c@x.co', password: 'short' } }); assert.equal(r.json.code, 'weak_password')
r = await run({ ...st, taken: ['c@x.co'] }, { method: 'POST', token: 'ta', body: { email: 'c@x.co', password: 'longenough' } }); assert.equal(r.json.code, 'email_taken')
st.team = st.team.filter(x => x.user_id !== B)
r = await run(st, { method: 'POST', token: 'ta', body: { name: 'Bea', email: 'B@X.co', password: 'longenough', role: 'viewer' } }); assert.equal(r.status, 200)
assert.equal(st.team.find(x => x.user_id === B).role, 'viewer')

// guards: self demote, last admin, self delete
r = await run(st, { method: 'PATCH', token: 'ta', body: { id: A, role: 'agent' } }); assert.equal(r.json.code, 'self')
r = await run(st, { method: 'DELETE', token: 'ta', body: { id: A } }); assert.equal(r.json.code, 'self')
r = await run(st, { method: 'PATCH', token: 'ta', body: { id: B, role: 'agent', password: 'newpassword' } }); assert.equal(r.status, 200)
assert.ok(r.calls.some(c => c === `PUT /auth/v1/admin/users/${B}`))
r = await run(st, { method: 'DELETE', token: 'ta', body: { id: B } }); assert.equal(r.status, 200); assert.equal(st.team.length, 1)
console.log('admin/users: all checks passed')
