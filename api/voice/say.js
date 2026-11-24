// GET /api/voice/say?id=<call>&n=<turn>&s=<signature>  The AI's words for one turn of a phone call, spoken by Cartesia.
// Twilio fetches this link from <Play>. The signature makes the link work only for that call and turn.
import { sb } from '../_lib/outreach.js'
import { sign, orgSettings, pickVoice } from '../_lib/calls.js'

export default async function handler(req, res) {
  const id = String(req.query?.id || ''), n = String(req.query?.n || ''), s = String(req.query?.s || '')
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^\d{1,3}$/.test(n) || s !== sign(id, n)) return res.status(403).end()
  const db = sb(); if (!db.ok || !process.env.CARTESIA_API_KEY) return res.status(503).end()
  const call = (await (await db.rest(`voice_calls?id=eq.${id}&select=org_id,lang,transcript`)).json().catch(() => []))?.[0]
  const text = String(call?.transcript?.[+n]?.text || '').replace(/[—–]/g, ', ').slice(0, 900)
  if (!text) return res.status(404).end()
  const lang = call.lang === 'es' ? 'es' : 'en'
  const { cfg } = await orgSettings(db, call.org_id)
  const voice = await pickVoice(cfg, lang)
  if (!voice) return res.status(503).end()
  const r = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CARTESIA_API_KEY}`, 'Cartesia-Version': process.env.CARTESIA_VERSION || '2026-08-14', 'Content-Type': 'application/json' },
    // 8 kHz mono WAV is what a phone line plays, so it starts faster.
    body: JSON.stringify({ model_id: process.env.CARTESIA_MODEL || 'sonic-3.6', transcript: text, voice: { id: voice }, language: lang, output_format: { container: 'wav', encoding: 'pcm_s16le', sample_rate: 8000 } }),
  }).catch(() => null)
  if (!r || !r.ok) return res.status(502).end()
  res.setHeader('Content-Type', 'audio/wav')
  res.setHeader('Cache-Control', 'private, max-age=600')
  res.status(200).send(Buffer.from(await r.arrayBuffer()))
}
