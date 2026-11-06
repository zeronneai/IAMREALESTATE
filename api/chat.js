// Vercel serverless function: IAM Assistant brain.
// Set ANTHROPIC_API_KEY (preferred) or GEMINI_API_KEY in Vercel > Settings > Environment Variables.
// Returns { reply, intent } where intent is one of buy | sell | invest | manage | rent | null.

const SYSTEM = `You are the IAM Assistant for I AM Real Estate, an El Paso, Texas real estate company founded in 2017.
Services: buying homes, selling (cash offer or listing with a licensed agent), investing and joint ventures, property management, rentals.
Office: 1522 Montana Ave, El Paso, TX 79902. Hours Mon to Fri 9am to 5pm. Main line 855 305 2048.
Departments: Buying 915 268 0716, Selling 915 348 3560, Property Management and Rentals 915 465 3384, Investor Relations 855 305 2048.
Rules: reply in the user's language (English or Spanish), 1 to 3 short sentences, warm and direct. Never quote prices, offers,
legal or tax advice; say a specialist will confirm. Your goal is to understand the need and invite the user to share name and phone
so the right department calls back. Never use em dashes.
At the very end of your answer add a line exactly like: INTENT: buy|sell|invest|manage|rent|none`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' })
  const { messages = [], lang = 'en' } = req.body || {}
  const clean = messages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-12)
    .map(m => ({ role: m.role, content: m.content.slice(0, 800) }))
  while (clean.length && clean[0].role !== 'user') clean.shift()
  if (!clean.length) return res.status(400).json({ error: 'empty' })

  try {
    let text = ''
    if (process.env.ANTHROPIC_API_KEY) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5', max_tokens: 300, system: SYSTEM + `\nPreferred language: ${lang}.`, messages: clean }),
      })
      const j = await r.json()
      text = (j.content || []).map(c => c.text || '').join('')
    } else if (process.env.GEMINI_API_KEY) {
      const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM + `\nPreferred language: ${lang}.` }] },
          contents: clean.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
          generationConfig: { maxOutputTokens: 300 },
        }),
      })
      const j = await r.json()
      text = j?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || ''
    } else {
      return res.status(501).json({ error: 'no_key' })
    }
    const m = text.match(/INTENT:\s*(buy|sell|invest|manage|rent|none)/i)
    const intent = m && m[1].toLowerCase() !== 'none' ? m[1].toLowerCase() : null
    const reply = text.replace(/INTENT:.*$/im, '').replace(/[\u2014\u2013]/g, ',').trim()
    return res.status(200).json({ reply, intent })
  } catch (e) {
    return res.status(502).json({ error: 'upstream' })
  }
}
