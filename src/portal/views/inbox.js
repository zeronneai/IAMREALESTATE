// Conversations: every text and email with owners, grouped by property, with replies.
import { t, getLang } from '../i18n.js'
import * as S from '../store.js'
import { esc, icon, toast, date } from '../ui.js'
import { openDrawer } from '../drawer.js'
import * as DNC from '../dnc.js'
import { DEFAULT_SENDER, recipient } from '../mail.js'

let cur = null, unsub = null, draft = { channel: 'sms', to: '', subject: '', body: '' }

const time = iso => { const d = new Date(iso), now = new Date(); return d.toDateString() === now.toDateString() ? d.toLocaleTimeString(getLang() === 'es' ? 'es-MX' : 'en-US', { hour: 'numeric', minute: '2-digit' }) : date(iso) }
const fmtPhone = v => { const all = String(v).replace(/\D/g, ''); if (all.length > 11 || (all.length === 11 && all[0] !== '1')) return '+' + all.slice(0, all.length - 10) + ' ' + all.slice(-10, -7) + ' ' + all.slice(-7, -4) + ' ' + all.slice(-4); const d = all.slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : v }
const sameNum = (a, b) => String(a).replace(/\D/g, '').slice(-10) === String(b).replace(/\D/g, '').slice(-10)

export function fill(tpl, p) {
  const snd = { ...DEFAULT_SENDER, ...(S.settings().mailSender || {}) }
  const r = p ? recipient(p) : { name: '' }
  const first = (r.name.split(/[\s&]+/)[0] || '').replace(/^Current$/, '')
  const nice = s => String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
  const vals = { first: first || (getLang() === 'es' ? 'buen día' : 'there'), owner: r.name, address: nice(p?.address), agent: snd.agent, company: S.orgName() || snd.company, phone: snd.phone }
  return String(tpl).replace(/\{\{(\w+)\}\}/g, (_, k) => vals[k] ?? '')
}

// Open Conversations on a property, optionally prefilled with a number or email.
export function startConversation(parcelId, to, channel = 'sms') {
  cur = parcelId; draft = { channel, to: to || '', subject: '', body: '' }
  location.hash = '#/inbox'
}

// Open Conversations with a contact (buyer, renter...) by phone or email, with or without earlier messages.
export function startPeerConversation(peer, channel = 'sms') {
  const d = String(peer || '').replace(/\D/g, '')
  const key = channel === 'email' ? String(peer).toLowerCase() : d.length === 10 ? '+1' + d : '+' + d
  cur = key; draft = { channel, to: key, subject: '', body: '' }
  location.hash = '#/inbox'
}

export function inbox(el) {
  unsub?.(); unsub = S.onChange(() => { if (document.body.contains(el)) paint(el, true); else { unsub?.(); unsub = null } })
  S.loadMessages().catch(() => {})
  S.loadPeople().catch(() => {})
  paint(el)
}

function contactsFor(p) {
  const all = (p?.contacts || []).map(c => ({ ...c, blocked: c.kind === 'phone' && (c.dnc || DNC.isDnc(c.value)) }))
  return { phones: all.filter(c => c.kind === 'phone'), emails: all.filter(c => c.kind === 'email') }
}

function paint(el, soft = false) {
  const ths = S.threads()
  if (!cur && ths.length) cur = ths[0].key
  const th = ths.find(x => x.key === cur)
  const p = th?.parcelId ? S.parcel(th.parcelId) : (cur ? S.parcel(cur) : null)
  const keepScroll = el.querySelector('.ib-list')?.scrollTop || 0
  const person = !p ? S.personByPeer(th ? th.last.peer : cur) : null
  const loose = !p && !th && cur && (/^\+\d{8,}$/.test(cur) || cur.includes('@')) ? cur : ''

  const list = ths.map(x => { const xp = x.parcelId && S.parcel(x.parcelId); const xper = !xp && S.personByPeer(x.last.peer); const who = xp ? (xp.owners?.[0]?.name || xp.address) : (xper?.name || fmtPhone(x.last.peer))
    return `<button class="ib-th ${x.key === cur ? 'on' : ''}" data-k="${esc(x.key)}">
      <div class="ib-top"><b>${esc(who)}</b><small>${esc(time(x.last.at))}</small></div>
      <div class="ib-sub">${esc(xp ? xp.address : xper ? t('ppl.k1_' + xper.kind) + (xper.stage ? ' · ' + xper.stage : '') : '')}</div>
      <div class="ib-last">${x.last.dir === 'out' ? `<span class="dim">${esc(t('msg.you'))}: </span>` : ''}${esc(x.last.body.slice(0, 90))}${x.unread ? `<span class="ib-dot">${x.unread}</span>` : ''}</div>
    </button>` }).join('') || `<p class="muted" style="padding:16px">${esc(t('msg.empty'))}</p>`

  const { phones, emails } = contactsFor(p)
  const optedOut = new Set(S.messages().filter(m => m.dir === 'in' && /^\s*(stop|stopall|unsubscribe|cancel|end|quit|remove|alto|parar|baja)\b/i.test(m.body)).map(m => m.peer.replace(/\D/g, '').slice(-10)))
  const peers = draft.channel === 'sms' ? phones.map(c => ({ v: c.value, label: fmtPhone(c.value) + (c.phoneType ? ' · ' + c.phoneType : ''), blocked: c.blocked || optedOut.has(c.value.replace(/\D/g, '').slice(-10)) })) : emails.map(c => ({ v: c.value, label: c.value, blocked: false }))
  if (th) for (const pe of th.peers) if (!peers.some(x => draft.channel === 'sms' ? sameNum(x.v, pe) : x.v.toLowerCase() === pe)) if ((draft.channel === 'sms') === pe.startsWith('+')) peers.push({ v: pe, label: draft.channel === 'sms' ? fmtPhone(pe) : pe, blocked: optedOut.has(pe.replace(/\D/g, '').slice(-10)) })
  if (!p && person) { if (draft.channel === 'sms' && person.phone && !peers.some(x => sameNum(x.v, person.phone))) peers.push({ v: person.phone, label: fmtPhone(person.phone), blocked: person.dnd || optedOut.has(person.phone.replace(/\D/g, '').slice(-10)) }); if (draft.channel === 'email' && person.email && !peers.some(x => x.v === person.email)) peers.push({ v: person.email, label: person.email, blocked: false }) }
  if (loose && !peers.some(x => x.v === loose) && (draft.channel === 'sms') === loose.startsWith('+')) peers.push({ v: loose, label: draft.channel === 'sms' ? fmtPhone(loose) : loose, blocked: optedOut.has(loose.replace(/\D/g, '').slice(-10)) })
  if (!draft.to || !peers.some(x => x.v === draft.to)) draft.to = (peers.find(x => !x.blocked) || peers[0])?.v || ''
  const sel = peers.find(x => x.v === draft.to)
  const tpls = (S.settings().smsTemplates?.[getLang()] || S.DEFAULT_SMS[getLang()])

  const bubbles = (th?.items || []).map(m => `<div class="bub ${m.dir}">
      ${m.channel === 'email' && m.subject ? `<b class="bub-subj">${esc(m.subject)}</b>` : ''}<div>${esc(m.body).replace(/\n/g, '<br>')}</div>
      <small>${m.channel === 'email' ? '✉ ' : ''}${esc(time(m.at))}${m.dir === 'out' ? ' · ' + esc(t('msg.st_' + (m.status || 'sent')) !== 'msg.st_' + m.status ? t('msg.st_' + m.status) : m.status) : ''}${m.error ? ' · ' + esc(m.error) : ''}</small>
    </div>`).join('')

  el.innerHTML = `<div class="inbox card fade-in" style="padding:0">
    <aside class="ib-side"><div class="ib-head"><b>${esc(t('msg.threads'))}</b>${S.unreadCount() ? `<span class="pill gold">${S.unreadCount()} ${esc(t('msg.unread'))}</span>` : ''}</div><div class="ib-list">${list}</div></aside>
    <section class="ib-main">
      ${p || th || loose ? `<header class="ib-mhead"><div><b>${esc(p ? (p.owners?.[0]?.name || p.address) : person?.name || fmtPhone(th ? th.last.peer : loose))}</b><small>${esc(p ? `${p.address}, ${p.city || 'El Paso'} ${p.zip || ''}` : person ? t('ppl.k1_' + person.kind) + (person.stage ? ' · ' + person.stage : '') : '')}</small></div>${p ? `<button class="btn sm ghost" data-open>${esc(t('msg.open_prop'))}</button>` : ''}</header>
      <div class="ib-msgs" data-msgs>${bubbles || `<p class="muted" style="margin:auto;text-align:center">${esc(t('msg.start'))}</p>`}</div>
      <form class="ib-comp" data-send>
        <div class="ib-row">
          <div class="seg"><button type="button" data-ch="sms" class="${draft.channel === 'sms' ? 'on' : ''}">SMS</button><button type="button" data-ch="email" class="${draft.channel === 'email' ? 'on' : ''}">Email</button></div>
          <select data-to aria-label="${esc(t('msg.to'))}" ${peers.length ? '' : 'disabled'}>${peers.map(x => `<option value="${esc(x.v)}" ${x.v === draft.to ? 'selected' : ''}>${esc(x.label)}${x.blocked ? ' · ' + esc(t('msg.blocked')) : ''}</option>`).join('') || `<option>${esc(draft.channel === 'sms' ? t('msg.no_phone') : t('msg.no_email'))}</option>`}</select>
          <select data-tpl aria-label="${esc(t('msg.template'))}"><option value="">${esc(t('msg.template'))}</option>${tpls.map((x, i) => `<option value="${i}">${esc(x.name)}</option>`).join('')}</select>
        </div>
        ${draft.channel === 'email' ? `<input data-subj placeholder="${esc(t('msg.subject'))}" value="${esc(draft.subject)}">` : ''}
        ${sel?.blocked ? `<div class="dnc-note">${esc(t('msg.blocked_note'))}</div>` : ''}
        <div class="ib-row"><textarea data-body rows="3" placeholder="${esc(t('msg.write'))}">${esc(draft.body)}</textarea><button class="btn gold" ${!peers.length || sel?.blocked ? 'disabled' : ''}>${icon('mail')}${esc(t('msg.send'))}</button></div>
        ${draft.channel === 'sms' ? `<small class="muted" data-count></small>` : ''}
      </form>` : `<div class="ib-none"><p class="muted">${esc(t('msg.pick'))}</p></div>`}
    </section></div>`

  const ml = el.querySelector('[data-msgs]'); if (ml) ml.scrollTop = ml.scrollHeight
  el.querySelector('.ib-list').scrollTop = keepScroll
  el.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { cur = b.dataset.k; draft = { channel: 'sms', to: '', subject: '', body: '' }; paint(el); S.markThreadRead(cur) })
  if (th?.unread && !document.hidden) S.markThreadRead(th.key)
  el.querySelector('[data-open]')?.addEventListener('click', () => openDrawer(p.id))
  const f = el.querySelector('[data-send]'); if (!f) return
  const body = f.querySelector('[data-body]'), cnt = f.querySelector('[data-count]')
  const count = () => { if (cnt) { const n = body.value.length; cnt.textContent = `${n} · ${Math.max(1, Math.ceil(n / 153))} SMS` } }
  body.oninput = () => { draft.body = body.value; count() }; count()
  f.querySelector('[data-subj]')?.addEventListener('input', e => { draft.subject = e.target.value })
  f.querySelectorAll('[data-ch]').forEach(b => b.onclick = () => { draft.channel = b.dataset.ch; draft.to = ''; draft.body = body.value; paint(el) })
  f.querySelector('[data-to]').onchange = e => { draft.to = e.target.value; draft.body = body.value; paint(el) }
  f.querySelector('[data-tpl]').onchange = e => { if (e.target.value === '') return; body.value = fill(tpls[+e.target.value].body, p); draft.body = body.value; count(); e.target.value = '' }
  f.onsubmit = async e => {
    e.preventDefault(); const btn = f.querySelector('button.gold'); if (!body.value.trim() || !draft.to) return
    btn.disabled = true
    try {
      await S.sendMessage({ parcelId: p?.id || null, channel: draft.channel, to: draft.to, subject: draft.subject, body: body.value.trim(), dnc: !!sel?.blocked })
      draft.body = ''; body.value = ''; toast(t('msg.sent')); paint(el)
    } catch (err) { toast(err.message) } finally { btn.disabled = false }
  }
}
