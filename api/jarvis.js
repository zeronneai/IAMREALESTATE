// POST /api/jarvis { messages: [{ role, content }], context?: string, lang } -> { reply }
// Jarvis: the team's brainstorming partner (Claude). Signed in users only. Knows what I AM does and,
// when the user allows it, a short snapshot of the portal (counts, late items, listings) sent by the browser.
import { body as readBody, only, guard } from './_lib/util.js'
import { claude } from './_lib/voice.js'
export const config = { maxDuration: 60 }

const SYSTEM = `You are Jarvis, the in-house strategy and brainstorming partner of I AM Real Estate, a real estate investment company in El Paso, Texas.
What they do: buy houses (foreclosures, tax delinquent, absentee owners, probate, driving for dollars), sell with owner financing (wrap mortgages), rent homes and apartments (for example a 14 unit complex at 7211 Alameda), wholesale deals, and list homes on the MLS through their own agent.
How to help:
- Think like a seasoned investor and operator in El Paso and the Borderplex: offers, deal analysis (ARV, repairs, MAO, cash flow, wrap spreads), marketing ideas (Facebook and Instagram ads, mailers, texting scripts, door knocking), tenant and collections strategy, team processes and scripts.
- Be concrete: numbers, step by step plans, ready to use scripts and copy. Offer 2 or 3 options when brainstorming and say which one you would pick and why.
- Short paragraphs and bullet lists. No long dashes. Reply in the language the user writes in (English or Spanish).
- If a question needs legal, tax or lending advice, give useful general information and say to confirm with their attorney, CPA or lender. Never invent laws, rates or data; say when you are not sure.
- When a portal snapshot is included, use it; never claim to see data that is not in it.`

export default async function handler(req, res) {
  if (!only(req, res)) return
  if (!(await guard(req, res))) return
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ code: 'no_llm' })
  const b = readBody(req)
  const msgs = (b.messages || []).filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string' && m.content.trim()).slice(-24).map(m => ({ role: m.role, content: m.content.slice(0, 6000) }))
  while (msgs.length && msgs[0].role !== 'user') msgs.shift()
  if (!msgs.length) return res.status(400).json({ code: 'empty' })
  const ctx = String(b.context || '').slice(0, 6000)
  const system = SYSTEM + (ctx ? `\n\nPortal snapshot (today ${new Date().toISOString().slice(0, 10)}):\n${ctx}` : '')
  try {
    const reply = await claude({ system, messages: msgs, max: 1600, model: process.env.ANTHROPIC_JARVIS_MODEL || 'claude-sonnet-5-5' })
    return res.status(200).json({ reply: String(reply || '').replace(/[—–]/g, ', ').trim() })
  } catch {
    return res.status(502).json({ code: 'llm_failed' })
  }
}
