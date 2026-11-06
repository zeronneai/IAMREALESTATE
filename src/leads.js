// Lead capture: every form posts JSON to the Google Apps Script web app.
import { LEAD_ENDPOINT } from './config.js'
import { t, getLang } from './i18n.js'

export async function submitLead(type, data) {
  const payload = {
    type,
    lang: getLang(),
    page: location.href,
    submittedAt: new Date().toISOString(),
    ...data,
  }
  if (!LEAD_ENDPOINT) {
    console.info('[IAM demo lead]', payload)
    return { ok: true, demo: true }
  }
  try {
    // text/plain avoids a CORS preflight; Apps Script reads e.postData.contents
    await fetch(LEAD_ENDPOINT, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) })
    return { ok: true }
  } catch (err) {
    console.warn('Lead send failed', err)
    return { ok: false }
  }
}

let toastTimer
export function toast(msg) {
  const el = document.getElementById('toast')
  el.textContent = msg; el.hidden = false
  requestAnimationFrame(() => el.classList.add('show'))
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { el.classList.remove('show'); setTimeout(() => { el.hidden = true }, 300) }, 4200)
}

export function wireLeadForms() {
  document.querySelectorAll('form[data-lead]').forEach(form => {
    form.addEventListener('submit', async e => {
      e.preventDefault()
      const data = Object.fromEntries(new FormData(form).entries())
      if (!data.name || !data.phone) { toast(t('form.err')); return }
      const btn = form.querySelector('[type=submit]'); btn.disabled = true
      const res = await submitLead(form.dataset.lead, data)
      btn.disabled = false
      toast(res.demo ? t('form.demo') : t('form.sent'))
      if (res.ok) form.reset()
    })
  })
}
