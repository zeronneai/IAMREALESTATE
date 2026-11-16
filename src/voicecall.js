// Website "Talk to us": a voice conversation with the same AI agent that answers the phone (Claude + Cartesia).
import { t, getLang } from './i18n.js'

const SR = window.SpeechRecognition || window.webkitSpeechRecognition
const api = (payload, raw = false) => fetch('/api/voice/public', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(r => { if (!r.ok) throw new Error(r.status); return raw ? r.arrayBuffer() : r.json() })

let actx = null, src = null, rec = null, live = null

function unlock() {
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); const b = actx.createBuffer(1, 1, 22050), s = actx.createBufferSource(); s.buffer = b; s.connect(actx.destination); s.start(0) } catch {}
  try { speechSynthesis.speak(new SpeechSynthesisUtterance('')) } catch {}
}
async function say(text, lang, useVoice) {
  if (useVoice && actx) {
    try {
      const buf = await actx.decodeAudioData(await api({ action: 'tts', lang, text }, true))
      if (actx.state !== 'running') await actx.resume()
      return await new Promise(res => { src = actx.createBufferSource(); src.buffer = buf; src.connect(actx.destination); const g = setTimeout(res, (buf.duration + 2) * 1000); src.onended = () => { clearTimeout(g); res() }; src.start(0) })
    } catch {}
  }
  return new Promise(res => { const u = new SpeechSynthesisUtterance(text); u.lang = lang === 'es' ? 'es-MX' : 'en-US'; const g = setTimeout(res, 4000 + text.length * 90); u.onend = u.onerror = () => { clearTimeout(g); res() }; speechSynthesis.cancel(); speechSynthesis.speak(u) })
}
function hear(lang, onPartial) {
  return new Promise(res => {
    rec = new SR(); rec.lang = lang === 'es' ? 'es-MX' : 'en-US'; rec.interimResults = true; rec.continuous = false
    let final = '', denied = false
    rec.onresult = e => { let txt = ''; for (const r of e.results) { txt += r[0].transcript; if (r.isFinal) final = txt } onPartial(txt) }
    rec.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') denied = true }
    rec.onend = () => res(denied ? null : final.trim())
    try { rec.start() } catch { res('') }
  })
}

export function initVoiceCall() {
  const $ = id => document.getElementById(id)
  const box = $('vc'), log = $('vcLog'), state = $('vcState'), orb = $('vcOrb'), btn = $('vcCall')
  if (!box) return
  const show = on => { box.hidden = !on; $('chatPanel')?.classList.toggle('voice', on) }
  const setState = (k, txt) => { state.textContent = txt || t('vc.' + k); orb.dataset.s = k }
  const add = (role, text, partial) => {
    let el = log.querySelector('.partial'); if (!partial && el) el.remove()
    if (partial) { if (!el) { el = document.createElement('div'); el.className = 'vc-b me partial'; log.append(el) } el.textContent = text }
    else { el = document.createElement('div'); el.className = 'vc-b ' + (role === 'agent' ? 'ai' : 'me'); el.textContent = text; log.append(el) }
    log.scrollTop = log.scrollHeight
  }

  $('vcOpen').onclick = () => { show(true); if (!SR) { setState('ready', t('vc.no_mic')); btn.disabled = true } }
  $('vcBack').onclick = () => { stop(); show(false) }
  btn.onclick = () => (live ? stop() : start())

  async function start() {
    unlock()
    const lang = getLang()
    live = { lang, lines: [], msgs: [], startedAt: new Date().toISOString(), on: true }
    btn.textContent = t('vc.hang'); btn.classList.add('on'); log.innerHTML = ''
    let cfg
    try { cfg = await api({ action: 'config', lang }) } catch { setState('ready', t('vc.busy')); return end(false) }
    if (!cfg.ready) { setState('ready', t('vc.busy')); return end(false) }
    $('vcName').textContent = cfg.name
    live.voice = cfg.voice
    live.lines.push({ role: 'agent', text: cfg.greeting }); live.msgs.push({ role: 'user', content: '(The visitor starts a voice conversation on the website.)' }, { role: 'assistant', content: cfg.greeting })
    add('agent', cfg.greeting); setState('speaking'); await say(cfg.greeting, lang, live.voice)
    let quiet = 0
    while (live?.on) {
      setState('listening')
      const heard = await hear(lang, p => live?.on && add('me', p, true))
      if (!live?.on) break
      if (heard === null) { setState('ready', t('vc.mic_denied')); break }
      if (!heard) { if (++quiet >= 3) break; continue }
      quiet = 0
      add('me', heard); live.lines.push({ role: 'caller', text: heard }); live.msgs.push({ role: 'user', content: heard })
      setState('thinking')
      let r; try { r = await api({ action: 'turn', lang, messages: live.msgs }) } catch { setState('ready', t('vc.busy')); break }
      if (!live?.on) break
      add('agent', r.reply); live.lines.push({ role: 'agent', text: r.reply }); live.msgs.push({ role: 'assistant', content: r.reply })
      setState('speaking'); await say(r.reply, lang, live.voice)
      if (r.end) break
    }
    end(true)
  }
  function stop() { if (!live) return; live.on = false; try { rec?.abort() } catch {} try { src?.stop() } catch {} try { speechSynthesis.cancel() } catch {} end(true) }
  function end(save) {
    if (!live) return
    const c = live; live = null
    btn.textContent = t('vc.start'); btn.classList.remove('on')
    if (save && c.lines.some(l => l.role === 'caller')) { setState('ready', t('vc.ended')); api({ action: 'end', lang: c.lang, transcript: c.lines, startedAt: c.startedAt }).catch(() => {}) }
    else if (orb.dataset.s !== 'ready') setState('ready')
  }
}
