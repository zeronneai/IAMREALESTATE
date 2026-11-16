// POST /api/voice/tts { text, lang, voice } -> audio/mpeg spoken with Cartesia (Sonic). Key stays on the server.
import { body as readBody, only, guard } from '../_lib/util.js'

export default async function handler(req, res) {
  if (!only(req, res)) return
  if (!(await guard(req, res))) return
  const key = process.env.CARTESIA_API_KEY
  if (!key) return res.status(503).json({ code: 'no_cartesia' })
  const b = readBody(req)
  const text = String(b.text || '').replace(/[—–]/g, ', ').slice(0, 900).trim()
  const voice = String(b.voice || '').trim()
  if (!text || !/^[0-9a-f-]{20,}$/i.test(voice)) return res.status(400).json({ code: 'bad_request' })
  const r = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Cartesia-Version': process.env.CARTESIA_VERSION || '2026-08-14', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model_id: process.env.CARTESIA_MODEL || 'sonic-3.6', transcript: text, voice: { id: voice }, language: b.lang === 'es' ? 'es' : 'en', output_format: { container: 'mp3', sample_rate: 44100, bit_rate: 128000 } }),
  }).catch(() => null)
  if (!r || !r.ok) { const msg = r ? await r.text().catch(() => '') : ''; return res.status(502).json({ code: 'tts_failed', status: r?.status, detail: msg.slice(0, 200) }) }
  res.setHeader('Content-Type', r.headers.get('content-type') || 'audio/mpeg')
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).send(Buffer.from(await r.arrayBuffer()))
}
