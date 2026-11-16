// GET /api/voice/voices -> { voices: [{ id, name, language, gender, description }] } from the Cartesia library.
import { guard } from '../_lib/util.js'

export default async function handler(req, res) {
  if (!(await guard(req, res))) return
  const key = process.env.CARTESIA_API_KEY
  if (!key) return res.status(503).json({ code: 'no_cartesia' })
  const h = { Authorization: `Bearer ${key}`, 'Cartesia-Version': process.env.CARTESIA_VERSION || '2026-08-14' }
  const all = []
  let after = null
  for (let i = 0; i < 6; i++) {
    const u = new URL('https://api.cartesia.ai/voices'); u.searchParams.set('limit', '100'); if (after) u.searchParams.set('starting_after', after)
    const r = await fetch(u, { headers: h }).catch(() => null)
    if (!r || !r.ok) { if (!all.length) return res.status(502).json({ code: 'voices_failed', status: r?.status }); break }
    const j = await r.json()
    const list = Array.isArray(j) ? j : (j.data || j.voices || [])
    all.push(...list)
    if (Array.isArray(j) || !j.has_more || !list.length) break
    after = list[list.length - 1].id
  }
  const voices = all.map(v => ({ id: v.id, name: v.name, language: v.language || (v.languages || [])[0] || '', gender: v.gender || null, description: String(v.description || '').slice(0, 140) }))
    .filter(v => /^(en|es)/i.test(v.language || 'en'))
  res.setHeader('Cache-Control', 'private, max-age=600')
  res.status(200).json({ voices })
}
