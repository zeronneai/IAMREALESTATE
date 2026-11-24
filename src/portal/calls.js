// AI phone calls from the portal: Jarvis calls me, and the AI agent calls a customer who gave permission.
import { t, getLang } from './i18n.js'
import * as S from './store.js'
import { esc, modal, toast } from './ui.js'
import { computeAlerts } from './alerts.js'

async function post(body) {
  if (S.MODE === 'demo') return { ok: false, code: 'demo' }
  const r = await fetch('/api/voice/outbound', { method: 'POST', headers: { 'Content-Type': 'application/json', ...S.authHeader() }, body: JSON.stringify(body) }).catch(() => null)
  const j = r ? await r.json().catch(() => ({})) : {}
  return { ok: !!r?.ok, ...j }
}
const why = code => { const k = 'call.e_' + (code || 'x'); const v = t(k); return v === k ? t('call.e_x') : v }

export const myCallSettings = () => post({ action: 'me' })
export const saveMyPhone = (phone, jarvis_call) => post({ action: 'my_phone', phone, jarvis_call, lang: getLang() })

// What Jarvis knows when it calls: the open alerts, written plainly.
export function alertsBrief() {
  const list = computeAlerts()
  return list.length ? list.slice(0, 25).map(a => `- ${a.text}`).join('\n') : 'Nothing urgent right now.'
}

export async function callMe(reason) {
  if (S.MODE === 'demo') return toast(t('call.demo'))
  const r = await post({ action: 'call_me', brief: alertsBrief(), lang: getLang(), reason })
  if (r.ok) toast(t('call.me_ok'))
  else if (r.code === 'no_phone') { toast(t('call.e_no_phone')); location.hash = '#/settings' }
  else toast(why(r.code))
}

// The AI agent calls a customer. Asks how they gave permission first (required).
export function callLeadModal(p, phone) {
  const o = p.owners?.[0]?.name || ''
  modal(`<h3>${esc(t('call.lead_title'))}</h3>
    <p class="muted" style="margin:0">${esc(t('call.lead_hint'))}</p>
    <form style="display:grid;gap:12px">
      <div class="form-grid">
        <div class="f"><label>${esc(t('call.to'))}</label><input class="inp" name="to" value="${esc(phone)}" required style="height:42px" /></div>
        <div class="f"><label>${esc(t('call.name'))}</label><input class="inp" name="name" value="${esc(o)}" style="height:42px" /></div>
      </div>
      <div class="form-grid">
        <div class="f"><label>${esc(t('call.lang'))}</label><select name="lang"><option value="es" ${getLang() === 'es' ? 'selected' : ''}>Español</option><option value="en" ${getLang() !== 'es' ? 'selected' : ''}>English</option></select></div>
        <div class="f"><label>${esc(t('call.consent'))}</label><select name="consent" required><option value="">${esc(t('call.consent_pick'))}</option><option value="web form">${esc(t('call.c_web'))}</option><option value="texted us first">${esc(t('call.c_text'))}</option><option value="verbal consent on a call">${esc(t('call.c_verbal'))}</option><option value="asked for a call back">${esc(t('call.c_callback'))}</option></select></div>
      </div>
      <div class="f"><label>${esc(t('call.goal'))}</label><input class="inp" name="goal" placeholder="${esc(t('call.goal_ph'))}" style="height:42px" /></div>
      <label class="chk" style="font-size:13px"><input type="checkbox" name="ok" required> ${esc(t('call.confirm'))}</label>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn ghost" data-close>${esc(t('cancel'))}</button><button class="btn gold">${esc(t('call.start'))}</button></div>
    </form>`, (box, close) => {
    box.querySelector('form').onsubmit = async e => {
      e.preventDefault()
      if (S.MODE === 'demo') { close(); return toast(t('call.demo')) }
      const fd = Object.fromEntries(new FormData(e.target))
      const btn = e.target.querySelector('.btn.gold'); btn.disabled = true
      const dnc = (p.contacts || []).some(c => c.value === fd.to && c.dnc)
      const r = await post({ action: 'call_lead', to: fd.to, name: fd.name, address: p.address, parcelId: p.id, consent: fd.consent, goal: fd.goal, lang: fd.lang, dnc })
      btn.disabled = false
      if (!r.ok) return toast(why(r.code))
      await S.addActivity(p.id, 'call', `${t('call.logged')} ${fd.to} (${fd.consent})`)
      close(); toast(t('call.lead_ok'))
    }
  })
}
