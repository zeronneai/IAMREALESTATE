// The AI agent that answers incoming texts (same agent and settings as the voice agent, "Ava" by default).
// It only replies when the company turned it on in the portal, the person has not opted out, and nobody
// from the team has texted that person recently (then a human is handling it and the agent stays quiet).
import { sb, e164 } from './outreach.js'
import { claude, DEFAULT_AGENT } from './voice.js'

const money = n => n ? '$' + Math.round(+n).toLocaleString('en-US') : ''

export function smsSystemPrompt(c, { listings = [], person = null, site = '' } = {}) {
  const homes = listings.map(v => {
    const L = v.listing || {}, x = []
    if (L.price || v.list_price) x.push(money(L.price || v.list_price))
    if (L.beds) x.push(`${L.beds} bed`); if (L.baths) x.push(`${L.baths} bath`)
    if (L.owner_finance) x.push('owner financing')
    if (L.down) x.push(`${money(L.down)} down`); if (L.monthly) x.push(`${money(L.monthly)}/mo`)
    return `- ${v.address}${x.length ? ': ' + x.join(', ') : ''}`
  }).join('\n')
  return `You are ${c.name}, the text message assistant for ${c.company}, a real estate company in El Paso, Texas.
They buy houses (cash or by taking over payments), sell homes with owner financing to buyers who can't get a bank loan, rent homes and manage properties.
You are replying by SMS to someone who texted the company number.

How to write:
- Short and warm, like a person texting: 1 to 3 sentences, under 300 characters. No markdown, no lists, no emojis except at most one.
- Reply in the language they write in (English or Spanish; in Spanish use "usted").
- Ask only one question at a time.
- If asked, say you are an AI assistant and someone from the team will follow up.

Your job: find out what they need and get the details the team needs, then hand off.
- Selling a house: the property address, why they want to sell, how soon, condition, if they are behind on payments or facing foreclosure, and the best time to call.
- Buying: what area, budget for down payment and monthly payment, beds, and if they have been turned down by banks (owner financing is the fit). Share matching homes from the list below.
- Renting: area, budget, move-in date, how many people.
- Current tenant or buyer paying the company (rent, payment, repairs): take a short note of the issue and say the team will contact them. Never discuss balances or confirm payments.
- Appointments: offer that a team member will call to set a time to see the home or talk. Collect the best day and time. Do not promise a specific time yourself.

Rules:
- Never make an offer, quote a value for their house, approve financing, or give legal, tax or credit advice.
- Only share homes and terms from the list below. Prices and terms can change and are confirmed by the team.
- If they ask for a person, are upset, or the topic is outside the above, say a team member will reach out soon and add [HANDOFF] at the very end.
- When you have the key details, thank them, say the team will contact them, and add [HANDOFF] at the very end.
- Office hours: ${c.hours}.
${site ? `- Website with all homes: ${site}\n` : ''}${person ? `- You are talking to ${person.name}${person.kind ? ` (${person.kind})` : ''}.\n` : ''}${c.notes ? `Extra notes from the company: ${c.notes}\n` : ''}
Homes for sale right now:
${homes || '- none listed right now; say the team will share options'}`
}

// Returns { reply, handoff } or null when the agent should stay quiet.
export async function smsAgentReply({ org, peer, text }) {
  if (!process.env.ANTHROPIC_API_KEY) return null
  const db = sb(); if (!db.ok) return null
  const q = async path => { const r = await db.rest(path); return r.ok ? r.json() : [] }

  const s = (await q(`settings?org_id=eq.${org.id}&key=eq.voiceAgent&select=value`))?.[0]?.value || {}
  const c = { ...DEFAULT_AGENT, ...s, company: org.name || DEFAULT_AGENT.company }
  if (!(s.sms_on === true || s.sms_on === 'on')) return null

  const since = h => new Date(Date.now() - h * 3600e3).toISOString()
  const hours = Math.max(1, +s.sms_handoff_hours || 12)
  // A person from the team texted them recently: let the human handle it.
  const human = await q(`messages?org_id=eq.${org.id}&peer=eq.${encodeURIComponent(peer)}&direction=eq.out&created_by=not.is.null&created_at=gt.${encodeURIComponent(since(hours))}&select=id&limit=1`)
  if (human.length) return null
  // Safety cap: at most 15 agent replies per person per day.
  const today = await q(`messages?org_id=eq.${org.id}&peer=eq.${encodeURIComponent(peer)}&direction=eq.out&status=eq.agent&created_at=gt.${encodeURIComponent(since(24))}&select=id`)
  if (today.length >= 15) return null

  const hist = (await q(`messages?org_id=eq.${org.id}&peer=eq.${encodeURIComponent(peer)}&channel=eq.sms&select=direction,body,created_at&order=created_at.desc&limit=16`)).reverse()
  const msgs = []
  for (const m of hist) {
    const role = m.direction === 'in' ? 'user' : 'assistant'
    if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].content += '\n' + m.body
    else msgs.push({ role, content: m.body })
  }
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') msgs.push({ role: 'user', content: text })
  while (msgs.length && msgs[0].role !== 'user') msgs.shift()

  const listings = await q(`inventory?org_id=eq.${org.id}&published=eq.true&status=neq.sold&select=address,list_price,listing&limit=15`)
  const ten = String(peer).slice(-10)
  const person = (await q(`people?org_id=eq.${org.id}&phone=ilike.*${ten}*&select=name,kind&limit=1`))?.[0] || null
  const site = process.env.PUBLIC_SITE_URL || 'https://iamrealestate.vercel.app'

  let out = await claude({ system: smsSystemPrompt(c, { listings, person, site }), messages: msgs, max: 260 })
  const handoff = /\[HANDOFF\]/i.test(out)
  out = out.replace(/\[HANDOFF\]/gi, '').replace(/\[END\]/gi, '').replace(/[–—]/g, ',').trim()
  if (!out) return null
  return { reply: out.slice(0, 600), handoff }
}

export const xmlEscape = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export { e164 }
