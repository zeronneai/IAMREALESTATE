import { t } from '../i18n.js'
import * as S from '../store.js'
import { esc, toast } from '../ui.js'

const INTS = [
  ['supabase', 'Supabase (database, login, files)', 'VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY'],
  ['anthropic', 'Claude AI (reads notices and statements)', 'ANTHROPIC_API_KEY'],
  ['gemini', 'Gemini AI (fallback reader)', 'GEMINI_API_KEY'],
  ['batchdata', 'BatchData skip trace', 'SKIPTRACE_PROVIDER=batchdata, BATCHDATA_API_KEY'],
  ['reiskip', 'REISkip skip trace', 'SKIPTRACE_PROVIDER=reiskip, REISKIP_API_KEY, REISKIP_API_URL'],
  ['ghl_webhook', 'GoHighLevel inbound webhook', 'GHL_WEBHOOK_URL'],
  ['epcounty_source', 'County foreclosure postings feed', 'FORECLOSURE_FEED_PROVIDER, EPCOUNTY_SOURCE_URL'],
  ['epcad', 'EPCAD lookup service', 'EPCAD_LOOKUP_URL'],
  ['taxes', 'Tax office lookup', 'TAX_LOOKUP_URL'],
  ['cron_secret', 'Daily refresh (Vercel Cron)', 'CRON_SECRET'],
]

export async function settingsView(el) {
  let health = null
  try { const r = await fetch('/api/health'); if (r.ok) health = await r.json() } catch {}
  const w = S.weights()
  const team = S.settings().team || []
  el.innerHTML = `
  <div class="grid-2">
    <div class="card fade-in"><h3>${esc(t('s.integrations'))}<span class="r pill ${S.MODE === 'demo' ? 'warn' : 'ok'}">${S.MODE === 'demo' ? 'DEMO MODE' : 'SUPABASE'}</span></h3>
      ${INTS.map(([k, label, env]) => { const on = health?.integrations?.[k]; return `<div class="int-row"><div><b style="font-weight:600">${esc(label)}</b><small class="mono">${esc(env)}</small></div><span class="pill ${on ? 'ok' : ''}">${esc(on ? t('s.on') : t('s.off'))}</span></div>` }).join('')}
      ${!health ? '<p class="muted" style="font-size:12px">/api/health not reachable (local preview). On Vercel this shows live status.</p>' : ''}
      <p class="muted" style="font-size:12px">${esc(t('s.webhook_hint'))}</p>
    </div>
    <div style="display:grid;gap:18px;align-content:start">
      <div class="card fade-in"><h3>${esc(t('s.weights'))}</h3>
        <form data-w>${Object.keys(w).map(k => `<div class="w-row"><span>${esc(t('sc.' + k))}</span><input type="range" min="0" max="40" name="${k}" value="${w[k]}"/><span class="mono" data-o="${k}">${w[k]}</span></div>`).join('')}
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px"><button class="btn gold">${esc(t('s.save'))}</button></div></form>
      </div>
      <div class="card fade-in"><h3>${esc(t('s.team'))}</h3>
        <table class="mini"><tr><th>Name</th><th>Email</th><th>Role</th></tr>${team.map(m => `<tr><td>${esc(m.name || '')}</td><td class="mono" style="font-size:12px">${esc(m.email)}</td><td><span class="pill">${esc(m.role)}</span></td></tr>`).join('')}</table>
        <form class="inline-form" data-team><input name="name" placeholder="Name" /><input name="email" type="email" placeholder="email@company.com" required /><select name="role" style="height:34px;border-radius:8px;border:1px solid var(--line);background:var(--ink-2);padding:0 8px"><option>agent</option><option>admin</option><option>viewer</option></select><button class="btn sm">${esc(t('d.add'))}</button></form>
        <p class="muted" style="font-size:12px">With Supabase, invite teammates in Supabase Auth and add them to team_members (see docs/PORTAL_README.md).</p>
      </div>
      ${S.MODE === 'demo' ? `<div class="card fade-in"><button class="btn ghost" data-reset>${esc(t('s.reset_demo'))}</button></div>` : ''}
    </div>
  </div>`
  const form = el.querySelector('[data-w]')
  form.addEventListener('input', e => { const o = el.querySelector(`[data-o="${e.target.name}"]`); if (o) o.textContent = e.target.value })
  form.onsubmit = async e => { e.preventDefault(); const nw = Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, +v])); await S.saveSettings({ weights: nw }); toast(t('s.saved')) }
  el.querySelector('[data-team]').onsubmit = async e => { e.preventDefault(); const m = Object.fromEntries(new FormData(e.target)); await S.saveSettings({ team: [...team, m] }); toast(t('s.saved')) }
  el.querySelector('[data-reset]')?.addEventListener('click', () => { S.resetDemo(); toast(t('s.saved')) })
}
