// Calendar: showings, calls, inspections and closings. Each one can text the contact a reminder before it starts.
import { t, getLang } from '../i18n.js'
import * as S from '../store.js'
import { esc, toast, modal, icon } from '../ui.js'

const KINDS = ['showing', 'call', 'meeting', 'inspection', 'closing', 'other']
const STATUS = ['scheduled', 'confirmed', 'done', 'no_show', 'cancelled']
const H0 = 7, H1 = 21, PX = 44 // visible hours and pixels per hour
let weekStart = monday(new Date()), view = window.innerWidth < 760 ? 'list' : 'week', err = ''
function monday(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const loc = () => (getLang() === 'es' ? 'es-MX' : 'en-US')
const hm = iso => new Date(iso).toLocaleTimeString(loc(), { hour: 'numeric', minute: '2-digit' })
const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmtPhone = s => { const d = String(s || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : s || '' }

export function calendarView(el) {
  if (S.MODE !== 'demo' && !el.dataset.calLoaded) {
    el.dataset.calLoaded = '1'; el.innerHTML = `<div class="card"><p class="muted">${esc(t('ppl.loading'))}</p></div>`
    Promise.all([S.loadAppointments(), S.loadPeople().catch(() => {})]).then(() => { err = ''; paint(el) }).catch(e => { err = e.message; paint(el) })
    return
  }
  paint(el)
}

function paint(el) {
  const all = S.appointments()
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const wEnd = addDays(weekStart, 7)
  const inWeek = all.filter(a => new Date(a.start) >= weekStart && new Date(a.start) < wEnd)
  const today = dayKey(new Date())
  const range = `${days[0].toLocaleDateString(loc(), { month: 'short', day: 'numeric' })} · ${days[6].toLocaleDateString(loc(), { month: 'short', day: 'numeric', year: 'numeric' })}`
  const upcoming = all.filter(a => new Date(a.start) >= new Date(Date.now() - 3600e3) && a.status !== 'cancelled').sort((a, b) => a.start.localeCompare(b.start)).slice(0, 60)
  const card = a => `<button class="cal-ev k-${esc(a.kind)} s-${esc(a.status)}" data-a="${esc(a.id)}"><b>${esc(hm(a.start))} ${esc(a.title)}</b><small>${esc(a.withName || a.location || '')}</small></button>`
  el.innerHTML = `
  ${err ? `<div class="alert bad fade-in">${esc(err)}</div>` : ''}
  <div class="pf-month fade-in"><button class="btn sm ghost" data-w="-1">‹</button><b>${esc(range)}</b><button class="btn sm ghost" data-w="1">›</button><button class="btn sm ghost" data-w="0">${esc(t('cal.today'))}</button>
    <span class="sp"></span><div class="seg-mini"><button data-v="week" class="${view === 'week' ? 'on' : ''}">${esc(t('cal.week'))}</button><button data-v="list" class="${view === 'list' ? 'on' : ''}">${esc(t('cal.list'))}</button></div>
    <button class="btn sm gold" data-new>${icon('plus')}${esc(t('cal.new'))}</button></div>
  ${view === 'week' ? `<div class="card fade-in cal-wrap" style="padding:0"><div class="cal-grid">
    <div class="cal-hours"><div class="cal-dh"></div>${Array.from({ length: H1 - H0 }, (_, i) => `<div class="cal-h" style="height:${PX}px"><small>${new Date(2000, 0, 1, H0 + i).toLocaleTimeString(loc(), { hour: 'numeric' })}</small></div>`).join('')}</div>
    ${days.map(d => { const k = dayKey(d), evs = inWeek.filter(a => dayKey(new Date(a.start)) === k)
      return `<div class="cal-day ${k === today ? 'today' : ''}" data-day="${k}"><div class="cal-dh"><small>${esc(d.toLocaleDateString(loc(), { weekday: 'short' }))}</small><b>${d.getDate()}</b></div>
        <div class="cal-col" style="height:${(H1 - H0) * PX}px">${evs.map(a => { const s = new Date(a.start), e = a.end ? new Date(a.end) : new Date(s.getTime() + 45 * 60e3)
          const top = Math.max(0, (s.getHours() + s.getMinutes() / 60 - H0) * PX), h = Math.max(22, (e - s) / 3600e3 * PX)
          return `<div class="cal-pos" style="top:${top}px;height:${h}px">${card(a)}</div>` }).join('')}</div></div>` }).join('')}
  </div></div>` : `<div class="card fade-in">${upcoming.length ? (() => { let last = ''; return upcoming.map(a => { const k = dayKey(new Date(a.start)), head = k !== last ? `<h4 class="cal-lh">${esc(new Date(a.start).toLocaleDateString(loc(), { weekday: 'long', month: 'long', day: 'numeric' }))}</h4>` : ''; last = k; return head + `<div class="cal-li">${card(a)}<span class="pill ${a.status === 'confirmed' ? 'ok' : a.status === 'no_show' ? 'bad' : ''}">${esc(t('cal.s_' + a.status))}</span>${a.remind ? `<small class="dim">${esc(a.remindedAt ? t('cal.reminded') : t('cal.will_remind'))}</small>` : ''}</div>` }).join('') })() : `<p class="muted">${esc(t('cal.empty'))}</p>`}</div>`}`
  el.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { weekStart = b.dataset.w === '0' ? monday(new Date()) : addDays(weekStart, 7 * +b.dataset.w); paint(el) })
  el.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { view = b.dataset.v; paint(el) })
  el.querySelector('[data-new]').onclick = () => apptModal(null, () => paint(el))
  el.querySelectorAll('[data-a]').forEach(b => b.onclick = e => { e.stopPropagation(); apptModal(S.appointments().find(a => a.id === b.dataset.a), () => paint(el)) })
  el.querySelectorAll('.cal-col').forEach(c => c.onclick = e => {
    if (e.target !== c) return
    const day = c.parentElement.dataset.day, hr = Math.min(H1 - 1, H0 + Math.floor(e.offsetY / PX))
    apptModal(null, () => paint(el), { start: new Date(`${day}T${String(hr).padStart(2, '0')}:00:00`).toISOString() })
  })
}

// Create or edit. preset can carry { personId, withName, withPhone, start, location, title }.
export function apptModal(appt, done = () => {}, preset = {}) {
  const now = new Date(); now.setMinutes(0, 0, 0); now.setHours(now.getHours() + 1)
  const a = appt ? { ...appt } : { title: '', kind: 'showing', start: now.toISOString(), end: null, location: '', personId: null, withName: '', withPhone: '', assigned: '', status: 'scheduled', remind: true, remindMin: 60, notes: '', ...preset }
  const s = new Date(a.start), dur = a.end ? Math.round((new Date(a.end) - s) / 60e3) : (a.kind === 'call' ? 15 : 45)
  const pad = n => String(n).padStart(2, '0')
  const homes = S.inventory().map(v => v.address)
  const names = [...new Set(S.appointments().map(x => x.assigned).filter(Boolean))]
  modal(`<h3>${esc(appt ? t('cal.edit') : t('cal.new'))}</h3>
    <form class="form-grid" data-f>
      <div class="f full"><label>${esc(t('cal.title'))}</label><input name="title" value="${esc(a.title)}" placeholder="${esc(t('cal.title_ph'))}" required></div>
      <div class="f"><label>${esc(t('ppl.type'))}</label><select name="kind">${KINDS.map(k => `<option value="${k}" ${a.kind === k ? 'selected' : ''}>${esc(t('cal.k_' + k))}</option>`).join('')}</select></div>
      <div class="f"><label>${esc(t('cal.status'))}</label><select name="status">${STATUS.map(k => `<option value="${k}" ${a.status === k ? 'selected' : ''}>${esc(t('cal.s_' + k))}</option>`).join('')}</select></div>
      <div class="f"><label>${esc(t('cal.date'))}</label><input name="date" type="date" value="${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}" required></div>
      <div class="f"><label>${esc(t('cal.time'))}</label><input name="time" type="time" step="900" value="${pad(s.getHours())}:${pad(s.getMinutes())}" required></div>
      <div class="f"><label>${esc(t('cal.duration'))}</label><select name="dur">${[15, 30, 45, 60, 90, 120, 180].map(m => `<option value="${m}" ${m === dur ? 'selected' : ''}>${m < 60 ? m + ' min' : m / 60 + ' h'}</option>`).join('')}</select></div>
      <div class="f"><label>${esc(t('cal.assigned'))}</label><input name="assigned" list="cal-who" value="${esc(a.assigned)}"><datalist id="cal-who">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist></div>
      <div class="f"><label>${esc(t('cal.with'))}</label><input name="withName" list="cal-ppl" value="${esc(a.withName)}" autocomplete="off" placeholder="${esc(t('cal.with_ph'))}"><datalist id="cal-ppl"></datalist></div>
      <div class="f"><label>${esc(t('ppl.phone'))}</label><input name="withPhone" value="${esc(fmtPhone(a.withPhone))}" placeholder="(915) 555-0123"></div>
      <div class="f full"><label>${esc(t('cal.where'))}</label><input name="location" list="cal-homes" value="${esc(a.location)}"><datalist id="cal-homes">${homes.map(h => `<option value="${esc(h)}">`).join('')}</datalist></div>
      <label class="chk"><input type="checkbox" name="remind" ${a.remind ? 'checked' : ''}> ${esc(t('cal.remind'))}</label>
      <div class="f"><select name="remindMin">${[30, 60, 120, 1440].map(m => `<option value="${m}" ${+a.remindMin === m ? 'selected' : ''}>${esc(t('cal.before_' + m))}</option>`).join('')}</select></div>
      ${a.remindedAt ? `<p class="muted full" style="margin:0">${esc(t('cal.reminded'))} · ${esc(new Date(a.remindedAt).toLocaleString(loc()))}</p>` : ''}
      <div class="f full"><label>${esc(t('d.notes'))}</label><textarea name="notes" rows="2">${esc(a.notes)}</textarea></div>
      <div class="full" style="display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap"><span>${appt ? `<button type="button" class="btn ghost danger" data-del>${esc(t('org.delete'))}</button>` : ''}</span>
        <span style="display:flex;gap:8px"><button type="button" class="btn ghost" data-close>${esc(t('cancel'))}</button><button class="btn gold">${esc(t('org.save'))}</button></span></div>
    </form>`, (box, close) => {
    const f = box.querySelector('[data-f]'), dl = box.querySelector('#cal-ppl')
    let personId = a.personId
    f.withName.oninput = () => {
      const q = f.withName.value.trim().toLowerCase()
      const hit = S.people().find(p => p.name && p.name.toLowerCase() === q)
      if (hit) { personId = hit.id; if (hit.phone) f.withPhone.value = fmtPhone(hit.phone); return }
      personId = null
      if (q.length < 2) { dl.innerHTML = ''; return }
      dl.innerHTML = S.people().filter(p => p.name && p.name.toLowerCase().includes(q)).slice(0, 15).map(p => `<option value="${esc(p.name)}">${esc(fmtPhone(p.phone))}</option>`).join('')
    }
    f.kind.onchange = () => { if (f.kind.value === 'call') f.dur.value = '15' }
    box.querySelector('[data-del]')?.addEventListener('click', async () => { await S.deleteAppointment(a.id); close(); toast(t('org.deleted')); done() })
    f.onsubmit = async e => {
      e.preventDefault()
      const v = Object.fromEntries(new FormData(f))
      const start = new Date(`${v.date}T${v.time}:00`), end = new Date(start.getTime() + +v.dur * 60e3)
      const d = String(v.withPhone || '').replace(/\D/g, ''), phone = d.length === 10 ? '+1' + d : d.length === 11 && d[0] === '1' ? '+' + d : ''
      if (v.remind && !phone) return toast(t('cal.need_phone'))
      try { await S.saveAppointment({ ...a, ...v, start: start.toISOString(), end: end.toISOString(), withPhone: phone, personId, remind: !!v.remind, remindMin: +v.remindMin }); close(); toast(t('org.saved')); done() } catch (err2) { toast(err2.message) }
    }
  }, { wide: true })
}
