// AI voice agent: set it up, talk to it from the browser, and review every call with its summary.
import { t, getLang } from '../i18n.js'
import * as S from '../store.js'
import { esc, toast, modal, date, icon, money } from '../ui.js'
import { openDrawer } from '../drawer.js'

const ASKS = ['address', 'motivation', 'timeline', 'condition', 'price', 'occupancy', 'mortgage', 'callback']
const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
let call = null   // live test call state
let cart = { state: 'idle', voices: [] }   // Cartesia voices: idle | loading | ready | off
async function loadVoices(rerender) {
  if (cart.state !== 'idle') return
  if (S.MODE === 'demo') { cart.state = 'off'; return }
  cart.state = 'loading'
  try {
    const r = await fetch('/api/voice/voices', { headers: S.authHeader() })
    if (!r.ok) throw 0
    cart = { state: 'ready', voices: (await r.json()).voices || [] }
  } catch { cart.state = 'off' }
  rerender()
}
const voiceFor = (cfg, lang) => cart.state === 'ready' ? (cfg['voice_' + lang] || cart.voices.find(v => v.language.startsWith(lang))?.id || '') : ''

const fill = (s, c) => String(s || '').replace(/\{\{(\w+)\}\}/g, (_, k) => c[k] ?? '')
const mmss = s => `${Math.floor((s || 0) / 60)}:${String((s || 0) % 60).padStart(2, '0')}`

export function voiceView(el) {
  const c = S.voiceConfig()
  const calls = S.voiceCalls()
  el.innerHTML = `<div class="grid-2 fade-in">
    <div class="card"><h3>${esc(t('va.setup'))}</h3><p class="lead">${esc(t('va.setup_lead'))}</p>
      <form data-cfg style="display:grid;gap:12px">
        <div class="ib-row"><div class="f" style="flex:1"><label>${esc(t('va.name'))}</label><input name="name" value="${esc(c.name)}"></div>
          <div class="f" style="flex:1"><label>${esc(t('va.lang'))}</label><select name="lang">${['auto', 'en', 'es'].map(l => `<option value="${l}" ${c.lang === l ? 'selected' : ''}>${esc(t('va.lang_' + l))}</option>`).join('')}</select></div></div>
        <div class="f"><label>${esc(t('va.greet_en'))}</label><textarea name="greeting_en" rows="2">${esc(c.greeting_en)}</textarea></div>
        <div class="f"><label>${esc(t('va.greet_es'))}</label><textarea name="greeting_es" rows="2">${esc(c.greeting_es)}</textarea></div>
        <div class="f"><label>${esc(t('va.asks'))}</label><div class="va-asks">${ASKS.map(a => `<label class="chk"><input type="checkbox" name="ask" value="${a}" ${c.ask.includes(a) ? 'checked' : ''}> ${esc(t('va.ask_' + a))}</label>`).join('')}</div></div>
        ${cart.state === 'ready' ? ['en', 'es'].map(l => `<div class="f"><label>${esc(t('va.voice_' + l))}</label><div class="ib-row"><select name="voice_${l}">${cart.voices.filter(v => v.language.startsWith(l)).map(v => `<option value="${esc(v.id)}" ${voiceFor(c, l) === v.id ? 'selected' : ''}>${esc(v.name)}${v.gender ? ' · ' + esc(v.gender) : ''}</option>`).join('')}</select><button type="button" class="btn sm ghost" data-hear="${l}" style="height:40px">${esc(t('va.hear'))}</button></div></div>`).join('')
          : `<div class="alert" style="font-size:12.5px">${esc(cart.state === 'loading' ? t('va.cart_loading') : t('va.cart_off'))}</div>`}
        <div class="ib-row"><div class="f" style="flex:1"><label>${esc(t('va.hours'))}</label><input name="hours" value="${esc(c.hours)}"></div>
          <div class="f" style="flex:1"><label>${esc(t('va.transfer'))}</label><input name="transfer" value="${esc(c.transfer)}" placeholder="(915) 555-0123"></div></div>
        <div class="f"><label>${esc(t('va.notes'))}</label><textarea name="notes" rows="2" placeholder="${esc(t('va.notes_ph'))}">${esc(c.notes)}</textarea></div>
        <div style="display:flex;justify-content:flex-end"><button class="btn gold">${esc(t('org.save'))}</button></div>
      </form>
    </div>
    <div style="display:grid;gap:24px;align-content:start">
      <div class="card va-test"><h3>${esc(t('va.test'))}</h3><p class="lead">${esc(SR ? t('va.test_lead') : t('va.no_mic'))}</p>
        <div class="va-phone">
          <button class="va-call ${call ? 'live' : ''}" data-call ${SR ? '' : 'disabled'} aria-label="${esc(t('va.call'))}">${icon('phone')}</button>
          <div><b data-state>${esc(call ? t('va.live') : t('va.ready'))}</b><small class="muted" data-sub>${esc(call ? '' : t('va.press'))}</small></div>
          <select data-tlang aria-label="${esc(t('va.lang'))}"><option value="en" ${getLang() === 'en' ? 'selected' : ''}>English</option><option value="es" ${getLang() === 'es' ? 'selected' : ''}>Español</option></select>
        </div>
        <div class="va-live" data-live></div>
        <p class="muted" style="font-size:12px;margin:10px 0 0">${esc(cart.state === 'ready' ? t('va.voice_cart') : t('va.voice_note'))}</p>
      </div>
      <div class="card"><h3>${esc(t('va.calls'))}${calls.filter(x => !x.reviewed).length ? `<span class="r pill gold">${calls.filter(x => !x.reviewed).length} ${esc(t('msg.unread'))}</span>` : ''}</h3>
        ${calls.length ? `<div class="va-calls">${calls.map(x => { const p = x.parcelId && S.parcel(x.parcelId); return `<button class="va-row ${x.reviewed ? '' : 'new'}" data-c="${esc(x.id)}">
          <span class="pill ${{ hot: 'bad', warm: 'gold', cold: '' }[x.interest] || ''}">${esc(t('va.int_' + (x.interest || 'none')))}</span>
          <div><b>${esc(x.data?.name || x.phone || t('va.unknown'))}${p ? ` · ${esc(p.address)}` : x.data?.property_address ? ` · ${esc(x.data.property_address)}` : ''}</b><small>${esc((x.summary || '').slice(0, 140))}</small><small class="dim">${esc(t('va.src_' + (x.source || 'test')))} · ${esc(date(x.at))} · ${mmss(x.duration)}</small></div></button>` }).join('')}</div>` : `<p class="muted">${esc(t('va.no_calls'))}</p>`}
      </div>
    </div></div>`

  el.querySelector('[data-cfg]').onsubmit = async e => {
    e.preventDefault()
    const fd = new FormData(e.target)
    const cfg = { ...Object.fromEntries([...fd].filter(([k]) => k !== 'ask')), ask: fd.getAll('ask') }
    await S.saveSettings({ voiceAgent: cfg }); toast(t('org.saved'))
  }
  el.querySelectorAll('[data-hear]').forEach(b => b.onclick = async () => {
    const l = b.dataset.hear, sel = el.querySelector(`[name=voice_${l}]`)
    unlockAudio(); stopAudio()
    b.disabled = true
    try { await speak(fill(l === 'es' ? c.greeting_es : c.greeting_en, c), l, sel.value) } finally { b.disabled = false }
  })
  loadVoices(() => { if (document.body.contains(el) && !call) voiceView(el) })
  el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => showCall(b.dataset.c))
  el.querySelector('[data-call]').onclick = () => call ? hangUp(el) : startCall(el)
  if (call) { call.el = el; paintLive(el) }
}

// ---------- browser test call ----------
// Chrome only lets a page play sound right after a click. We open one audio channel when the call button is
// pressed (or Listen) and reuse it for every answer, so later replies are not silently blocked.
let actx = null, playing = null
function unlockAudio() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)()
    if (actx.state !== 'running') actx.resume()
    const b = actx.createBuffer(1, 1, 22050), src = actx.createBufferSource(); src.buffer = b; src.connect(actx.destination); src.start(0)
  } catch {}
  try { speechSynthesis.speak(new SpeechSynthesisUtterance('')) } catch {}
}
function stopAudio() { try { playing?.stop() } catch {} playing = null; try { speechSynthesis.cancel() } catch {} }
async function speak(text, lang, voiceId) {
  const v = voiceId || (cart.state === 'ready' ? voiceFor(S.voiceConfig(), lang) : '')
  if (v && actx) {
    try {
      const r = await fetch('/api/voice/tts', { method: 'POST', headers: { 'Content-Type': 'application/json', ...S.authHeader() }, body: JSON.stringify({ text, lang, voice: v }) })
      if (!r.ok) throw 0
      const buf = await actx.decodeAudioData(await r.arrayBuffer())
      if (actx.state !== 'running') await actx.resume()
      await new Promise(res => {
        const src = actx.createBufferSource(); src.buffer = buf; src.connect(actx.destination)
        playing = src
        const guard = setTimeout(res, (buf.duration + 2) * 1000)
        src.onended = () => { clearTimeout(guard); res() }
        src.start(0)
      })
      playing = null
      return
    } catch { /* fall back to the browser voice */ }
  }
  return browserSpeak(text, lang)
}
function browserSpeak(text, lang) {
  return new Promise(res => {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = lang === 'es' ? 'es-MX' : 'en-US'; u.rate = 1.04
    const vs = speechSynthesis.getVoices().filter(v => v.lang.startsWith(lang === 'es' ? 'es' : 'en'))
    u.voice = vs.find(v => /natural|neural|google|samantha|paulina|monica/i.test(v.name)) || vs[0] || null
    const guard = setTimeout(res, 4000 + text.length * 90)
    u.onend = u.onerror = () => { clearTimeout(guard); res() }
    speechSynthesis.cancel(); speechSynthesis.speak(u)
  })
}
function listen(lang, onPartial) {
  return new Promise(res => {
    const rec = new SR(); call.rec = rec
    rec.lang = lang === 'es' ? 'es-MX' : 'en-US'; rec.interimResults = true; rec.continuous = false
    let final = ''
    rec.onresult = e => { let txt = ''; for (const r of e.results) { txt += r[0].transcript; if (r.isFinal) final = txt } onPartial(txt) }
    rec.onerror = () => {}
    rec.onend = () => res(final.trim())
    try { rec.start() } catch { res('') }
  })
}
function paintLive(el) {
  const box = el.querySelector('[data-live]'); if (!box || !call) return
  box.innerHTML = call.lines.map(l => `<div class="bub ${l.role === 'agent' ? 'out' : 'in'}">${esc(l.text)}</div>`).join('') + (call.partial ? `<div class="bub in partial">${esc(call.partial)}</div>` : '')
  box.scrollTop = box.scrollHeight
  const st = el.querySelector('[data-state]'), sub = el.querySelector('[data-sub]')
  if (st) st.textContent = call.phase === 'listening' ? t('va.listening') : call.phase === 'thinking' ? t('va.thinking') : call.phase === 'speaking' ? t('va.speaking') : t('va.live')
  if (sub) sub.textContent = call.phase === 'listening' ? t('va.talk_now') : ''
}
async function startCall(el) {
  unlockAudio()
  const lang = el.querySelector('[data-tlang]').value
  const cfg = S.voiceConfig()
  call = { el, lang, cfg, lines: [], msgs: [], startedAt: new Date().toISOString(), phase: 'speaking', partial: '', on: true }
  el.querySelector('[data-call]').classList.add('live')
  const set = ph => { call.phase = ph; paintLive(call.el) }
  const greet = fill(lang === 'es' ? cfg.greeting_es : cfg.greeting_en, cfg)
  call.lines.push({ role: 'agent', text: greet }); call.msgs.push({ role: 'user', content: '(The call connects.)' }, { role: 'assistant', content: greet })
  set('speaking'); await speak(greet, lang)
  let quiet = 0
  while (call?.on) {
    set('listening')
    const heard = await listen(lang, p => { if (call) { call.partial = p; paintLive(call.el) } })
    if (!call?.on) break
    call.partial = ''
    if (!heard) {
      if (++quiet >= 3) break
      const nudge = lang === 'es' ? '¿Sigue ahí?' : 'Are you still there?'
      call.lines.push({ role: 'agent', text: nudge }); set('speaking'); await speak(nudge, lang); continue
    }
    quiet = 0
    call.lines.push({ role: 'caller', text: heard }); call.msgs.push({ role: 'user', content: heard })
    set('thinking')
    let r
    try { r = await S.voiceTurn(call.msgs, lang, cfg) } catch (err) { toast(err.message); break }
    if (!call?.on) break
    call.lines.push({ role: 'agent', text: r.reply }); call.msgs.push({ role: 'assistant', content: r.reply })
    set('speaking'); await speak(r.reply, lang)
    if (r.end) break
  }
  if (call) await hangUp(call.el)
}
async function hangUp(el) {
  if (!call) return
  const c = call; c.on = false; call = null
  try { c.rec?.abort() } catch {}
  stopAudio()
  const transcript = c.lines.map(l => ({ role: l.role, text: l.text }))
  if (transcript.filter(x => x.role === 'caller').length) {
    toast(t('va.saving'))
    try { const saved = await S.saveVoiceCall({ transcript, lang: c.lang, startedAt: c.startedAt }); voiceView(el); showCall(saved.id) } catch { toast(t('team.e_error')) }
  } else voiceView(el)
}

// ---------- call detail ----------
function showCall(id) {
  const x = S.voiceCalls().find(c => c.id === id); if (!x) return
  const d = x.data || {}, p = x.parcelId && S.parcel(x.parcelId)
  const rows = [['va.f_name', d.name], ['va.f_address', d.property_address], ['va.f_motivation', d.motivation], ['va.f_timeline', d.timeline], ['va.f_condition', d.condition], ['va.f_price', d.asking_price != null ? money(d.asking_price) : null], ['va.f_best', d.best_time], ['va.f_next', d.next_step]].filter(([, v]) => v)
  modal(`<h3>${esc(d.name || x.phone || t('va.unknown'))} <span class="pill ${{ hot: 'bad', warm: 'gold', cold: '' }[x.interest] || ''}">${esc(t('va.int_' + (x.interest || 'none')))}</span></h3>
    <p style="margin:0">${esc(x.summary || '')}</p>
    ${rows.length ? `<div class="va-data">${rows.map(([k, v]) => `<div><small class="muted">${esc(t(k))}</small><b>${esc(v)}</b></div>`).join('')}</div>` : ''}
    <details><summary>${esc(t('va.transcript'))}</summary><div class="va-live" style="max-height:300px">${(x.transcript || []).map(l => `<div class="bub ${l.role === 'agent' ? 'out' : 'in'}">${esc(l.text)}</div>`).join('')}</div></details>
    <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">${p ? `<button class="btn" data-prop>${esc(t('msg.open_prop'))}</button>` : ''}<button class="btn gold" data-close>${esc(t('va.done'))}</button></div>`, (b, close) => {
    b.querySelector('[data-prop]')?.addEventListener('click', () => { close(); openDrawer(p.id) })
  }, { wide: true })
  if (!x.reviewed) S.markCallReviewed(id)
}
