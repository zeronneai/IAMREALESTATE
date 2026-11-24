// Twilio webhook for calls placed by the AI (see api/_lib/calls.js).
//   POST /api/voice/agent?id=<call>            each turn: what the person said comes in, the AI answers
//   POST /api/voice/agent?id=<call>&status=1   when the call ends: duration, summary, follow up
import { sb, twilioValid } from '../_lib/outreach.js'
import { claude, SUMMARY_PROMPT } from '../_lib/voice.js'
import { callPrompt, speakXml, orgSettings } from '../_lib/calls.js'

export const config = { maxDuration: 30 }
const MAX_TURNS = 40
const twiml = s => `<?xml version="1.0" encoding="UTF-8"?><Response>${s}</Response>`

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml')
  if (req.method !== 'POST') return res.status(405).send(twiml(''))
  let p = req.body || {}
  if (typeof p === 'string') p = Object.fromEntries(new URLSearchParams(p))
  const host = req.headers['x-forwarded-host'] || req.headers.host
  if (!twilioValid(req.headers['x-twilio-signature'], `https://${host}${req.url}`, p)) return res.status(403).send(twiml(''))
  const db = sb(), id = String(req.query?.id || '')
  if (!db.ok || !/^[0-9a-f-]{36}$/i.test(id)) return res.status(200).send(twiml('<Hangup/>'))
  const call = (await (await db.rest(`voice_calls?id=eq.${id}&select=*`)).json().catch(() => []))?.[0]
  if (!call) return res.status(200).send(twiml('<Hangup/>'))
  const patch = body => db.rest(`voice_calls?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(body) })
  const lang = call.lang === 'es' ? 'es' : 'en'
  const { cfg } = await orgSettings(db, call.org_id)

  // End of call: save how it went.
  if (String(req.query?.status || '') === '1') {
    const done = { status: p.CallStatus || 'completed', duration_sec: +p.CallDuration || 0 }
    const tr = call.transcript || []
    if (call.source === 'outbound' && tr.some(x => x.role === 'caller') && process.env.ANTHROPIC_API_KEY) {
      const lines = tr.map(x => `${x.role === 'agent' ? 'Assistant' : 'Person'}: ${x.text}`).join('\n')
      const out = await claude({ system: SUMMARY_PROMPT, messages: [{ role: 'user', content: `Language for summary and next_step: ${lang === 'es' ? 'Spanish' : 'English'}\n\n${lines}` }], max: 700 }).catch(() => '')
      const m = out.match(/\{[\s\S]*\}/); let data = null; try { data = m ? JSON.parse(m[0]) : null } catch { /* keep raw */ }
      if (data) Object.assign(done, { summary: data.summary || null, interest: data.interest || null, data: { ...(call.data || {}), ...data } })
    } else if (!call.summary) {
      done.summary = tr.some(x => x.role === 'caller') ? (lang === 'es' ? 'Llamada completada.' : 'Call completed.') : (lang === 'es' ? `No contestó (${p.CallStatus || 'sin respuesta'}).` : `No answer (${p.CallStatus || 'no answer'}).`)
    }
    await patch(done)
    return res.status(200).send(twiml(''))
  }

  // Answering machine on a customer call: short message, no conversation.
  if (call.source === 'outbound' && /machine|fax/i.test(p.AnsweredBy || '') && !(call.transcript || []).length) {
    const vm = lang === 'es'
      ? `Hola, le llama la asistente virtual de ${cfg.company}${call.data?.address ? ' sobre la propiedad en ' + call.data.address : ''}. Por favor llámenos o escríbanos al ${cfg.callback || 'nueve uno cinco, dos cero seis, dos nueve uno seis'}. Gracias.`
      : `Hi, this is the virtual assistant from ${cfg.company}${call.data?.address ? ' about the property at ' + call.data.address : ''}. Please call or text us back at ${cfg.callback || 'nine one five, two zero six, two nine one six'}. Thank you.`
    await patch({ transcript: [{ role: 'agent', text: vm }], summary: lang === 'es' ? 'Buzón de voz: se dejó mensaje.' : 'Voicemail: message left.' })
    return res.status(200).send(twiml(`${speakXml(host, id, 0, vm, lang)}<Hangup/>`))
  }

  const tr = [...(call.transcript || [])]
  const said = String(p.SpeechResult || '').trim()
  const silent = !!tr.length && !said
  if (said) tr.push({ role: 'caller', text: said.slice(0, 600) })
  const silences = (call.data?.silences || 0) + (silent ? 1 : 0)

  let reply = '', end = false, optout = false
  if (silent && silences >= 2) {
    reply = lang === 'es' ? 'Parece que no le escucho. Le dejo, que tenga buen día.' : "I can't hear you, so I'll let you go. Have a great day."
    end = true
  } else if (silent) {
    reply = lang === 'es' ? '¿Sigue ahí?' : 'Are you still there?'
  } else if (tr.filter(x => x.role === 'agent').length >= MAX_TURNS) {
    reply = lang === 'es' ? 'Gracias por su tiempo. Le dejo la información en el portal. ¡Hasta luego!' : 'Thanks for your time. Talk soon, goodbye!'
    end = true
  } else {
    if (!process.env.ANTHROPIC_API_KEY) return res.status(200).send(twiml('<Hangup/>'))
    const msgs = tr.map(x => ({ role: x.role === 'agent' ? 'assistant' : 'user', content: x.text }))
    if (!msgs.length || msgs[0].role !== 'user') msgs.unshift({ role: 'user', content: '(The call just connected. They answered the phone. Say your opening now.)' })
    const raw = await claude({ system: callPrompt(call, cfg), messages: msgs.slice(-30), max: 220 }).catch(() => '')
    end = /\[END\]/.test(raw); optout = /\[OPTOUT\]/.test(raw)
    reply = raw.replace(/\[(END|OPTOUT)\]/g, '').replace(/[—–]/g, ', ').trim() || (lang === 'es' ? 'Perdón, ¿me lo repite?' : 'Sorry, could you say that again?')
  }
  tr.push({ role: 'agent', text: reply })
  const n = tr.length - 1
  await patch({ transcript: tr, status: 'in-progress', data: { ...(call.data || {}), silences } })
  if (optout && call.phone) await db.rest('opt_outs', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ org_id: call.org_id, channel: 'call', peer: call.phone }) })

  const speech = speakXml(host, id, n, reply, lang)
  if (end) return res.status(200).send(twiml(`${speech}<Hangup/>`))
  const gather = `<Gather input="speech" language="${lang === 'es' ? 'es-MX' : 'en-US'}" speechTimeout="auto"${lang === 'en' ? ' speechModel="phone_call" enhanced="true"' : ''} actionOnEmptyResult="true" action="/api/voice/agent?id=${id}" method="POST">${speech}</Gather>`
  return res.status(200).send(twiml(gather))
}
