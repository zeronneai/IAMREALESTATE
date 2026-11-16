// The AI voice agent's brain: builds the phone script from the company's settings and talks through Claude.
export const DEFAULT_AGENT = {
  name: 'Ava', lang: 'auto', company: 'I AM Real Estate',
  greeting_en: 'Hi, thanks for calling {{company}}. This is {{name}}, the virtual assistant. Are you calling about a property you might want to sell?',
  greeting_es: 'Hola, gracias por llamar a {{company}}. Habla {{name}}, la asistente virtual. ¿Llama por una propiedad que le gustaría vender?',
  ask: ['address', 'motivation', 'timeline', 'condition', 'price', 'callback'],
  hours: 'Mon to Fri 9am to 5pm', transfer: '', notes: '',
}
const ASK = {
  address: 'the property address',
  motivation: 'why they are thinking about selling',
  timeline: 'how soon they want or need to sell (mention a sale date if they have one)',
  condition: 'the general condition of the house and any repairs needed',
  price: 'what price they have in mind, if any',
  occupancy: 'whether it is owner occupied, rented or vacant',
  mortgage: 'roughly how much is owed on the mortgage, if they are comfortable sharing',
  callback: 'their name and the best number and time for a person to call back',
}

export function systemPrompt(cfg = {}, lang = 'en') {
  const c = { ...DEFAULT_AGENT, ...cfg }
  const asks = (c.ask || []).map(k => ASK[k]).filter(Boolean)
  return `You are ${c.name}, the virtual phone assistant for ${c.company}, a real estate investment company in El Paso, Texas that buys houses for cash.
You are on a live phone call. Everything you write is spoken aloud by a voice engine.
How to talk:
- Speak ${lang === 'es' ? 'Spanish (Mexican, warm and respectful, use "usted")' : 'English'}; if the caller switches language, switch with them.
- One or two short sentences per turn, then stop and let them talk. Ask only one question at a time.
- Plain spoken words only: no lists, no symbols, no emojis, no markdown. Say numbers the way people say them.
- Be warm, calm and human. Never pushy. Acknowledge what they say before the next question.
- If asked, say clearly that you are an AI assistant and a person from the team will follow up.
Your goal: learn, in a natural order, ${asks.join('; ')}.
Rules:
- Never make an offer, quote a value, or give legal, tax or credit advice. Say a specialist will review and call back.
- If they want a person, say you will have someone call them back${c.transfer ? ' or that you can transfer them now' : ''}, collect their callback info, and wrap up.
- If they are not interested or ask not to be contacted, apologize, confirm they will not be contacted again, and end politely.
- Office hours: ${c.hours}.
${c.notes ? `Extra notes from the company: ${c.notes}\n` : ''}When the conversation is complete (you have what you need, or they want to end), say a short goodbye and put the token [END] at the very end.`
}

export async function claude({ system, messages, max = 220, model }) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: model || process.env.ANTHROPIC_VOICE_MODEL || 'claude-haiku-5-5', max_tokens: max, system, messages }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error?.message || 'llm_failed')
  return (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim()
}

export const SUMMARY_PROMPT = `You review a phone call between a real estate buyer's AI assistant and a caller.
Return ONLY a JSON object with these keys (null when unknown):
name, phone, property_address, motivation, timeline, condition, asking_price (number or null), occupancy, mortgage_owed (number or null),
best_time, wants_human (boolean), do_not_contact (boolean), interest ("hot" | "warm" | "cold"),
summary (2 or 3 plain sentences in the language given), next_step (one short sentence in the language given).
Interest: hot = wants to sell soon or has a sale date; warm = open to it; cold = not interested.`
