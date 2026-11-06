// IAM Assistant: scripted bilingual lead routing with optional LLM via /api/chat.
import { CHAT_USE_LLM, PHONES } from './config.js'
import { getLang, onLang } from './i18n.js'
import { submitLead } from './leads.js'

const S = {
  hi: ['Hi, I am the IAM Assistant. What can we help you with today?', 'Hola, soy el Asistente IAM. ¿En qué te podemos ayudar hoy?'],
  intents: { buy: ['Buy a home', 'Comprar casa'], sell: ['Sell my property', 'Vender mi propiedad'], invest: ['Invest / JV', 'Invertir / JV'], manage: ['Manage my rental', 'Administrar mi renta'], rent: ['Find a rental', 'Buscar renta'] },
  timeline: ['Great. What is your timeline?', 'Perfecto. ¿En cuánto tiempo?'],
  tl: [['Right away', 'Ya mismo'], ['1 to 3 months', '1 a 3 meses'], ['3 to 6 months', '3 a 6 meses'], ['Just looking', 'Solo viendo']],
  budget: {
    buy: ['What price range are you shopping in?', '¿En qué rango de precio buscas?'],
    rent: ['What monthly rent works for you?', '¿Qué renta mensual te funciona?'],
    invest: ['How much capital would you like to put to work?', '¿Cuánto capital te gustaría invertir?'],
    sell: ['What condition is the property in?', '¿En qué condición está la propiedad?'],
    manage: ['How many units do you own?', '¿Cuántas unidades tienes?'],
  },
  bopts: {
    buy: ['Under $250k', '$250k to $400k', '$400k to $600k', '$600k+'],
    rent: ['Under $1,200', '$1,200 to $1,600', '$1,600 to $2,200', '$2,200+'],
    invest: ['$25k to $50k', '$50k to $100k', '$100k to $250k', '$250k+'],
    sell: [['Move-in ready', 'Lista'], ['Light repairs', 'Detalles'], ['Needs work', 'Necesita trabajo'], ['Major repairs', 'Reparación mayor']],
    manage: ['1', '2 to 4', '5 to 10', '10+'],
  },
  name: ['What is your name?', '¿Cómo te llamas?'],
  phone: ['Thanks, {name}. What is the best phone number to reach you?', 'Gracias, {name}. ¿A qué número te podemos llamar?'],
  badPhone: ['That number looks short. Could you type it with area code?', 'Ese número se ve incompleto. ¿Lo puedes escribir con lada?'],
  done: ['Done. Your request is with our {dept} team. They usually call back within one business day. If it is urgent, call {phone}.', 'Listo. Tu solicitud está con nuestro equipo de {dept}. Normalmente te llaman en menos de un día hábil. Si es urgente, llama al {phone}.'],
  dept: { buy: ['Buying', 'Compras'], sell: ['Selling', 'Ventas'], invest: ['Investor Relations', 'Inversionistas'], manage: ['Property Management', 'Administración'], rent: ['Leasing', 'Rentas'] },
  restart: ['Start over', 'Empezar de nuevo'],
  call: ['Call now', 'Llamar ahora'],
  fallback: ['I can route you fastest if you pick one of these:', 'Te canalizo más rápido si eliges una opción:'],
  thinking: ['Typing', 'Escribiendo'],
}
const L = v => (Array.isArray(v) ? v[getLang() === 'es' ? 1 : 0] : v)
const deptPhone = { buy: PHONES.buy, sell: PHONES.sell, invest: PHONES.invest, manage: PHONES.manage, rent: PHONES.manage }

export function initChat() {
  const fab = document.getElementById('chatFab')
  const panel = document.getElementById('chatPanel')
  const log = document.getElementById('chatLog')
  const quick = document.getElementById('chatQuick')
  const form = document.getElementById('chatForm')
  const input = document.getElementById('chatText')
  let state = { step: 'intent', lead: {} }
  let history = []
  let llmOk = CHAT_USE_LLM
  let started = false

  function open(v) {
    panel.hidden = !v; fab.setAttribute('aria-expanded', String(v)); document.getElementById('chat').classList.toggle('open', v)
    if (v && !started) { started = true; restart() }
    if (v) setTimeout(() => input.focus({ preventScroll: true }), 50)
  }
  fab.addEventListener('click', () => open(panel.hidden))
  document.getElementById('chatClose').addEventListener('click', () => open(false))

  function msg(text, who = 'bot') {
    const d = document.createElement('div'); d.className = 'msg ' + who; d.textContent = text
    log.appendChild(d); log.scrollTop = log.scrollHeight
    history.push({ role: who === 'bot' ? 'assistant' : 'user', content: text })
    return d
  }
  function buttons(list) {
    quick.innerHTML = ''
    list.forEach(([label, fn, cls]) => {
      const b = typeof fn === 'string' ? document.createElement('a') : document.createElement('button')
      if (typeof fn === 'string') b.href = fn; else { b.type = 'button'; b.addEventListener('click', () => fn(label)) }
      b.className = 'qr ' + (cls || ''); b.textContent = label; quick.appendChild(b)
    })
  }
  function restart() {
    log.innerHTML = ''; history = []; state = { step: 'intent', lead: {} }
    msg(L(S.hi)); askIntent()
  }
  function askIntent() {
    buttons(Object.entries(S.intents).map(([k, v]) => [L(v), lab => { msg(lab, 'user'); pickIntent(k) }]))
  }
  function pickIntent(k) {
    state.lead.intent = k; state.step = 'timeline'
    msg(L(S.timeline))
    buttons(S.tl.map(o => [L(o), lab => { msg(lab, 'user'); state.lead.timeline = lab; askBudget() }]))
  }
  function askBudget() {
    const k = state.lead.intent; state.step = 'budget'
    msg(L(S.budget[k]))
    buttons(S.bopts[k].map(o => [L(o), lab => { msg(lab, 'user'); state.lead.budget = lab; askName() }]))
  }
  function askName() { state.step = 'name'; quick.innerHTML = ''; msg(L(S.name)) }
  function askPhone() { state.step = 'phone'; msg(L(S.phone).replace('{name}', state.lead.name.split(' ')[0])) }
  async function finish() {
    state.step = 'done'
    const k = state.lead.intent, p = deptPhone[k]
    msg(L(S.done).replace('{dept}', L(S.dept[k])).replace('{phone}', p.label))
    buttons([[L(S.call) + ' · ' + p.label, 'tel:' + p.tel, 'gold'], [L(S.restart), () => restart()]])
    await submitLead('chat', { ...state.lead, department: L(S.dept[k]) })
  }
  function detect(text) {
    const s = text.toLowerCase()
    if (/(sell|vend|cash offer|efectivo)/.test(s)) return 'sell'
    if (/(invest|invert|jv|joint|socio|flip)/.test(s)) return 'invest'
    if (/(manage|administr|landlord|propietario|tenant|inquilin)/.test(s)) return 'manage'
    if (/(rent|renta|alquil|lease)/.test(s)) return 'rent'
    if (/(buy|compr|home|casa|house)/.test(s)) return 'buy'
    return null
  }
  async function askLLM(text) {
    const dots = msg(L(S.thinking) + '...'); dots.classList.add('typing')
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang: getLang(), messages: history.slice(-12, -1) }) })
      if (!r.ok) throw new Error('chat ' + r.status)
      const j = await r.json()
      dots.remove(); history.pop()
      if (!j.reply) throw new Error('empty')
      msg(j.reply)
      if (j.intent && S.intents[j.intent] && state.step === 'intent') pickIntent(j.intent)
      return true
    } catch (e) {
      dots.remove(); history.pop(); llmOk = false
      return false
    }
  }

  form.addEventListener('submit', async e => {
    e.preventDefault()
    const text = input.value.trim(); if (!text) return
    input.value = ''
    msg(text, 'user')
    if (state.step === 'name') { state.lead.name = text; askPhone(); return }
    if (state.step === 'phone') {
      if (text.replace(/\D/g, '').length < 10) { msg(L(S.badPhone)); return }
      state.lead.phone = text; finish(); return
    }
    if (state.step === 'intent') {
      const k = detect(text)
      if (k) { pickIntent(k); return }
    }
    if (llmOk && await askLLM(text)) return
    const k = detect(text)
    if (k && state.step === 'intent') { pickIntent(k); return }
    msg(L(S.fallback)); if (state.step === 'intent' || state.step === 'done') askIntent()
  })
  onLang(() => { if (started && state.step === 'intent' && history.length <= 1) restart() })
}
