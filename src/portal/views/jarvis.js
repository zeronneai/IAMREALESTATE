// Jarvis: brainstorm with Claude. Chats are kept in this browser; the portal snapshot is optional.
import { t, getLang } from '../i18n.js'
import * as S from '../store.js'
import { esc, toast, icon } from '../ui.js'

const KEY = 'iam_jarvis_v1'
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { chats: [], cur: null, ctx: true } } catch { return { chats: [], cur: null, ctx: true } } }
const save = st => { try { localStorage.setItem(KEY, JSON.stringify({ ...st, chats: st.chats.slice(0, 40) })) } catch { /* storage full: keep in memory */ } }
let st = load(), busy = false, draft = ''

// ---------- Voice: talk with the mic (browser speech recognition) and hear answers (browser speech). Free, no keys.
const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window
let rec = null, listening = false, spokeLast = false
const MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>'
const vLang = () => (getLang() === 'es' ? 'es-MX' : 'en-US')
const plain = s => String(s).replace(/[*#`_>]/g, '').replace(/^\s*[-•]\s+/gm, '').replace(/\n{2,}/g, '. ').replace(/\n/g, ' ')
export function speak(text) {
  if (!canSpeak) return
  speechSynthesis.cancel()
  const lang = vLang(), voices = speechSynthesis.getVoices()
  const voice = voices.find(v => v.lang === lang) || voices.find(v => v.lang?.startsWith(lang.slice(0, 2)))
  // Chrome stops long utterances, so read it sentence by sentence.
  for (const part of plain(text).match(/[^.!?]+[.!?]*/g) || []) {
    if (!part.trim()) continue
    const u = new SpeechSynthesisUtterance(part.trim()); u.lang = lang; if (voice) u.voice = voice; u.rate = 1.03
    speechSynthesis.speak(u)
  }
}
function toggleMic(el) {
  if (!SR) return toast(t('jv.no_mic'))
  if (listening) { rec?.stop(); return }
  if (canSpeak) speechSynthesis.cancel()
  rec = new SR(); rec.lang = vLang(); rec.interimResults = true; rec.continuous = false
  let text = ''
  rec.onresult = e => { text = Array.from(e.results).map(r => r[0].transcript).join(' '); const ta = el.querySelector('[data-in]'); if (ta) ta.value = text }
  rec.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast(t('jv.mic_denied')) }
  rec.onend = () => { listening = false; rec = null; paintMic(el); const q = text.trim(); if (q) { spokeLast = true; ask(el, q) } }
  listening = true; paintMic(el); rec.start()
}
function paintMic(el) { const b = el.querySelector('[data-mic]'); if (b) { b.classList.toggle('on', listening); b.title = t(listening ? 'jv.listening' : 'jv.mic') } }

// Safe mini markdown: escape first, then bold, headings, bullets, numbered lists, paragraphs.
function md(s) {
  const lines = esc(s).split('\n'), out = []
  let list = null
  const close = () => { if (list) { out.push(`</${list}>`); list = null } }
  for (const raw of lines) {
    const l = raw.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    let m
    if ((m = l.match(/^\s*[-*•]\s+(.*)/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul' } out.push(`<li>${m[1]}</li>`) }
    else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol' } out.push(`<li>${m[1]}</li>`) }
    else if ((m = l.match(/^#{1,4}\s+(.*)/))) { close(); out.push(`<h4>${m[1]}</h4>`) }
    else if (!l.trim()) close()
    else { close(); out.push(`<p>${l}</p>`) }
  }
  close(); return out.join('')
}

// A short, numbers-only picture of the business for Jarvis (no phone numbers or emails).
function snapshot() {
  const m = S.monthStart(), items = S.periodItems(m)
  const late = items.filter(i => i.status === 'late'), inn = items.filter(i => i.ob.dir === 'in'), out = items.filter(i => i.ob.dir === 'out')
  const sum = l => Math.round(l.reduce((a, i) => a + (i.amount || 0), 0))
  const inv = S.inventory().filter(v => v.status === 'listed').slice(0, 15).map(v => `${v.address}${v.listPrice ? ' $' + Math.round(v.listPrice / 1000) + 'k' : ''}`)
  const ppl = S.people(), kinds = {}; for (const p of ppl) kinds[p.kind] = (kinds[p.kind] || 0) + 1
  const fc = S.parcels().filter(p => p.foreclosure && p._d?.daysToSale >= 0)
  const appts = S.appointments().filter(a => new Date(a.start) > new Date() && a.status !== 'cancelled')
  return [
    `This month: money in expected $${sum(inn).toLocaleString()} (${inn.length} items), bills and mortgages $${sum(out).toLocaleString()} (${out.length} items), ${late.length} late items.`,
    late.length ? `Late: ${late.slice(0, 12).map(i => `${i.inv?.address || i.ob.party} ${i.ob.kind} $${Math.round(i.amount)}`).join('; ')}` : '',
    `Homes for sale (${inv.length}): ${inv.join('; ') || 'none loaded'}`,
    `Contacts: ${ppl.length} total, ${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(', ')}.`,
    `Foreclosure leads with an upcoming sale: ${fc.length}. Upcoming appointments: ${appts.length}.`,
  ].filter(Boolean).join('\n')
}

const SUGGEST = {
  en: ['Give me 5 Facebook ad ideas to find motivated sellers in El Paso', 'How should we price an owner financed home at $230k?', 'Write a text script to follow up with late tenants', 'What should we focus on this week based on our numbers?'],
  es: ['Dame 5 ideas de anuncios de Facebook para encontrar vendedores motivados en El Paso', '¿Cómo estructuramos el financiamiento del dueño de una casa de $230k?', 'Escribe un texto para darle seguimiento a inquilinos atrasados', '¿En qué nos enfocamos esta semana según nuestros números?'],
}

export function jarvisView(el) {
  const chat = st.chats.find(c => c.id === st.cur) || null
  const lang = getLang()
  el.innerHTML = `<div class="jv fade-in">
    <aside class="jv-side card">
      <button class="btn gold" data-new style="width:100%">${icon('plus')}${esc(t('jv.new'))}</button>
      <div class="jv-list">${st.chats.map(c => `<button class="jv-item ${c.id === st.cur ? 'on' : ''}" data-c="${esc(c.id)}"><b>${esc(c.title || t('jv.untitled'))}</b><small>${esc(new Date(c.at).toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-US', { month: 'short', day: 'numeric' }))}</small></button>`).join('') || `<p class="muted" style="font-size:13px">${esc(t('jv.none'))}</p>`}</div>
      <label class="chk" style="font-size:13px"><input type="checkbox" data-ctx ${st.ctx ? 'checked' : ''}> ${esc(t('jv.ctx'))}</label>
      ${canSpeak ? `<label class="chk jv-voice"><input type="checkbox" data-voice ${st.voice ? 'checked' : ''}> ${esc(t('jv.voice'))}</label>` : ''}
      <small class="dim">${esc(t('jv.private'))}</small>
    </aside>
    <section class="jv-main card">
      <div class="jv-msgs" data-msgs>${chat?.msgs.length ? chat.msgs.map((m, i) => `<div class="jv-bub ${m.role}">${m.role === 'assistant' ? md(m.content) + (canSpeak ? `<button class="jv-say" data-say="${i}">▶ ${esc(t('jv.speak'))}</button>` : '') : esc(m.content).replace(/\n/g, '<br>')}</div>`).join('') : `
        <div class="jv-hello"><div class="jv-orb">J</div><h3>${esc(t('jv.hello'))}</h3><p class="muted">${esc(t('jv.hello_sub'))}</p>
        <div class="jv-sugg">${SUGGEST[lang === 'es' ? 'es' : 'en'].map(q => `<button class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div></div>`}
        ${busy ? `<div class="jv-bub assistant jv-typing"><i></i><i></i><i></i></div>` : ''}</div>
      <form class="jv-comp" data-f><textarea data-in rows="2" placeholder="${esc(t('jv.ph'))}" ${busy ? 'disabled' : ''}>${esc(draft)}</textarea><button type="button" class="btn ghost jv-mic ${listening ? 'on' : ''}" data-mic title="${esc(t(listening ? 'jv.listening' : 'jv.mic'))}" ${busy ? 'disabled' : ''}>${MIC}</button><button class="btn gold" ${busy ? 'disabled' : ''}>${esc(t('jv.send'))}</button></form>
    </section></div>`
  const box = el.querySelector('[data-msgs]'); box.scrollTop = box.scrollHeight
  el.querySelector('[data-new]').onclick = () => { st.cur = null; save(st); jarvisView(el); el.querySelector('[data-in]')?.focus() }
  el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { st.cur = b.dataset.c; save(st); jarvisView(el) })
  el.querySelector('[data-ctx]').onchange = e => { st.ctx = e.target.checked; save(st) }
  el.querySelector('[data-voice]')?.addEventListener('change', e => { st.voice = e.target.checked; save(st); if (!st.voice && canSpeak) speechSynthesis.cancel() })
  el.querySelector('[data-mic]').onclick = () => toggleMic(el)
  el.querySelectorAll('[data-say]').forEach(b => b.onclick = () => { if (canSpeak && speechSynthesis.speaking) { speechSynthesis.cancel(); return } speak(chat.msgs[+b.dataset.say].content) })
  el.querySelectorAll('[data-q]').forEach(b => b.onclick = () => ask(el, b.dataset.q))
  const ta = el.querySelector('[data-in]'), f = el.querySelector('[data-f]')
  ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); f.requestSubmit() } }
  f.onsubmit = e => { e.preventDefault(); const q = ta.value.trim(); if (q) ask(el, q) }
}

async function ask(el, q) {
  if (busy) return
  let chat = st.chats.find(c => c.id === st.cur)
  if (!chat) { chat = { id: 'c' + Date.now(), title: q.slice(0, 60), at: new Date().toISOString(), msgs: [] }; st.chats.unshift(chat); st.cur = chat.id }
  draft = ''
  chat.msgs.push({ role: 'user', content: q }); chat.at = new Date().toISOString(); save(st)
  busy = true; jarvisView(el)
  try {
    let reply
    if (S.MODE === 'demo') { await new Promise(r => setTimeout(r, 900)); reply = t('jv.demo') }
    else {
      const r = await fetch('/api/jarvis', { method: 'POST', headers: { 'Content-Type': 'application/json', ...S.authHeader() }, body: JSON.stringify({ messages: chat.msgs, context: st.ctx ? snapshot() : '', lang: getLang() }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(t('jv.e_' + (j.code || 'llm_failed')) !== 'jv.e_' + (j.code || 'llm_failed') ? t('jv.e_' + j.code) : t('jv.e_llm_failed'))
      reply = j.reply
    }
    chat.msgs.push({ role: 'assistant', content: reply })
    if (st.voice || spokeLast) speak(reply)
  } catch (e) { toast(e.message); chat.msgs.pop(); draft = q; if (!chat.msgs.length) { st.chats = st.chats.filter(c => c.id !== chat.id); st.cur = null } }
  busy = false; spokeLast = false; save(st)
  if (document.body.contains(el)) jarvisView(el)
}
