// Shared helpers for the IAM portal API (Vercel Node functions).
// Keys live only in Vercel environment variables, never in the browser.

export function body(req) {
  if (!req.body) return {}
  if (typeof req.body === 'string') { try { return JSON.parse(req.body) } catch { return {} } }
  return req.body
}

export function only(req, res, method = 'POST') {
  if (req.method !== method) { res.status(405).json({ error: 'method_not_allowed' }); return false }
  return true
}

// Who may call the paid endpoints: with Supabase configured, only signed in teammates (the portal sends the
// session token and we verify it). Before Supabase exists, set PORTAL_ACCESS_KEY so the endpoints are not open.
export async function authorize(req) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon) {
    // No Supabase yet: open in demo, unless PORTAL_ACCESS_KEY is set (then the portal must send it).
    const key = process.env.PORTAL_ACCESS_KEY
    if (key && req.headers['x-portal-key'] !== key) return { ok: false }
    return { ok: true, demo: true }
  }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return { ok: false }
  try {
    const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } })
    if (!r.ok) return { ok: false }
    const u = await r.json()
    return { ok: true, user: u }
  } catch { return { ok: false } }
}

export async function guard(req, res) {
  const a = await authorize(req)
  if (!a.ok) { res.status(401).json({ error: 'unauthorized' }); return null }
  return a
}

export function hasLLM() { return !!(process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY) }

// Extract structured JSON from a document (PDF or image, base64) with Claude, falling back to Gemini.
export async function extractJSON({ base64, mime, instructions }) {
  const prompt = `${instructions}\nReturn ONLY a JSON object, no markdown fences. Use null for unknown fields. Dates as YYYY-MM-DD. Money as numbers without symbols.`
  if (process.env.ANTHROPIC_API_KEY) {
    const block = mime === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } }
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_EXTRACT_MODEL || 'claude-sonnet-5-5',
        max_tokens: 2000,
        messages: [{ role: 'user', content: [block, { type: 'text', text: prompt }] }],
      }),
    })
    const j = await r.json()
    if (!r.ok) throw new Error(`anthropic ${r.status} ${j?.error?.message || ''}`)
    return parseJSON((j.content || []).map(c => c.text || '').join(''))
  }
  if (process.env.GEMINI_API_KEY) {
    const model = process.env.GEMINI_EXTRACT_MODEL || 'gemini-2.5-flash'
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime, data: base64 } }, { text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    })
    const j = await r.json()
    if (!r.ok) throw new Error(`gemini ${r.status} ${j?.error?.message || ''}`)
    return parseJSON((j?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join(''))
  }
  const e = new Error('no_llm_key'); e.code = 501; throw e
}

function parseJSON(t) {
  const s = t.indexOf('{'), e = t.lastIndexOf('}')
  if (s < 0 || e < 0) throw new Error('no_json')
  return JSON.parse(t.slice(s, e + 1))
}

const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
export function readUpload(b) {
  const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(b.file || '')
  if (!m) return { error: 'invalid_file' }
  if (!ALLOWED.includes(m[1])) return { error: 'unsupported_type' }
  if (m[2].length > 5_500_000) return { error: 'file_too_large' }
  return { mime: m[1], base64: m[2] }
}

export function notConfigured(res, what, envs) {
  return res.status(501).json({ error: 'not_configured', source: what, needs: envs })
}
