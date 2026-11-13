import { t } from '../i18n.js'
import * as S from '../store.js'
import { esc, toast, dropzone, icon } from '../ui.js'
import * as DNC from '../dnc.js'
import * as EP from '../epcad.js'
import { DEFAULT_TEMPLATES, DEFAULT_SENDER } from '../mail.js'
import { DEFAULT_PSF } from '../parse/epcad.js'

const INTS = [
  ['supabase', 'Supabase (database, login, files)', 'VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY'],
  ['skiptrace', 'Bulk skip trace (BatchData or REISkip)', 'SKIPTRACE_PROVIDER, BATCHDATA_API_KEY / REISKIP_API_KEY'],
  ['ghl_webhook', 'GoHighLevel inbound webhook', 'GHL_WEBHOOK_URL'],
  ['epcounty_source', 'County postings source (bulk feed or permitted URL)', 'EPCOUNTY_SOURCE_URL'],
  ['epcad_export', 'EPCAD export auto download (server)', 'EPCAD_EXPORT_URL'],
  ['llm', 'AI assist for odd PDFs (optional)', 'ANTHROPIC_API_KEY or GEMINI_API_KEY'],
  ['cron_secret', 'Daily refresh (Vercel Cron)', 'CRON_SECRET'],
]
// Built in, no keys: what the portal does by itself.
const KEYLESS = [
  ['PDF reader + OCR', 'Notices, county packets, statements, tax lists (pdf.js + tesseract.js in the browser)', 'ready'],
  ['Notice of Trustee Sale parser', 'Sale date and time, address, owners, lender, servicer, trustees, deed of trust, instrument, loan amount, legal', 'ready'],
  ['Mortgage statement parser', 'Lender, loan, balance, rate, payment, escrow, due date, late fee, past due', 'ready'],
  ['EPCAD enrichment', 'Owner, mailing address, absentee, value, year built, sqft, deed date, homestead', 'epcad'],
  ['Direct mail', 'Letters, postcards, Avery 5160 labels, Lob / Click2Mail CSV', 'ready'],
  ['Free owner research', 'TruePeopleSearch, FastPeopleSearch, Whitepages, Google, Facebook, records, Street View', 'ready'],
  ['Field route', 'Optimized order, numbered map, Google Maps links, print sheet, visit log', 'ready'],
  ['Do Not Call check', 'National DNC file for 915 imported here', 'dnc'],
]

export async function settingsView(el) {
  let health = null
  try { const r = await fetch('/api/health'); if (r.ok) health = await r.json() } catch {}
  const w = S.weights()
  const team = S.settings().team || []
  const [dm, em] = await Promise.all([DNC.ready().catch(() => null), EP.ready().catch(() => null)])
  const lang = 'en'
  const tpl = l => ({ ...DEFAULT_TEMPLATES[l], ...(S.settings().mailTemplates?.[l] || {}) })
  const snd = { ...DEFAULT_SENDER, ...(S.settings().mailSender || {}) }
  void lang
  el.innerHTML = `
  <div class="grid-2">
    <div style="display:grid;gap:18px;align-content:start">
    <div class="card fade-in"><h3>${esc(t('s.keyless'))}<span class="r pill ok">0 keys</span></h3>
      ${KEYLESS.map(([n, d, st]) => { const ok = st === 'ready' || (st === 'dnc' && dm?.count) || (st === 'epcad' && em); return `<div class="kl-row"><div><b style="font-weight:600">${esc(n)}</b><small>${esc(d)}</small></div><span class="pill ${ok ? 'ok' : 'warn'}">${esc(ok ? t('s.ready') : t('s.needs_files'))}</span></div>` }).join('')}
    </div>
    <div class="card fade-in"><h3>${esc(t('s.external'))}<span class="r pill ${S.MODE === 'demo' ? 'warn' : 'ok'}">${S.MODE === 'demo' ? 'DEMO MODE' : 'SUPABASE'}</span></h3>
      ${INTS.map(([k, label, env]) => { const on = health?.integrations?.[k]; return `<div class="int-row"><div><b style="font-weight:600">${esc(label)}</b><small class="mono">${esc(env)}</small></div><span class="pill ${on ? 'ok' : ''}">${esc(on ? t('s.on') : t('s.off'))}</span></div>` }).join('')}
      ${!health ? '<p class="muted" style="font-size:12px">/api/health not reachable (local preview). On Vercel this shows live status.</p>' : ''}
      <p class="muted" style="font-size:12px">${esc(t('s.webhook_hint'))}</p>
    </div>
    <div class="card fade-in"><h3>${esc(t('dnc.title'))}<span class="r pill ${dm?.count ? 'ok' : 'warn'}">${(dm?.count || 0).toLocaleString()} ${esc(t('dnc.numbers'))}</span></h3>
      <p class="muted" style="margin-top:0;font-size:12.5px">${esc(t('dnc.hint'))}</p>
      <div class="drop" id="dncdrop" tabindex="0" role="button">${icon('upload')}<div><b>${esc(t('dnc.import'))}</b></div><p>TXT · CSV</p></div>
      <div class="toolbar" style="margin-top:10px"><a class="btn sm ghost" href="https://telemarketing.donotcall.gov/" target="_blank" rel="noopener">telemarketing.donotcall.gov</a>${dm?.count ? `<button class="btn sm ghost" data-dncclear>Clear</button>` : ''}</div>
      <p class="muted" style="font-size:12px">${esc(t('dnc.reminder'))}</p>
    </div>
    </div>
    <div style="display:grid;gap:18px;align-content:start">
      <div class="card fade-in tpl"><h3>${esc(t('mail.templates'))}</h3>
        <form data-mail>
          <div class="form-grid">${['company', 'agent', 'phone', 'email', 'office'].map(k => `<div class="f"><label>${esc(t('mail.sender'))} · ${k}</label><input name="s_${k}" value="${esc(snd[k])}" /></div>`).join('')}</div>
          ${['en', 'es'].map(l => `<h4 style="margin:14px 0 6px">${l.toUpperCase()}</h4>
            <div class="f"><label>Letter subject</label><input name="${l}_letterSubject" value="${esc(tpl(l).letterSubject)}" /></div>
            <div class="f"><label>Letter</label><textarea name="${l}_letter">${esc(tpl(l).letter)}</textarea></div>
            <div class="f"><label>Postcard front</label><input name="${l}_postcardFront" value="${esc(tpl(l).postcardFront)}" /></div>
            <div class="f"><label>Postcard back</label><textarea name="${l}_postcard" style="min-height:90px">${esc(tpl(l).postcard)}</textarea></div>
            <div class="f"><label>Disclaimer / opt out</label><textarea name="${l}_disclaimer" style="min-height:70px">${esc(tpl(l).disclaimer)}</textarea></div>`).join('')}
          <p class="muted" style="font-size:11.5px">Merge fields: {{owner}} {{address}} {{city}} {{sale_date}} {{sale_line}} {{agent}} {{company}} {{phone}} {{email}} {{office}}</p>
          <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn ghost" data-mreset>Default</button><button class="btn gold">${esc(t('s.save'))}</button></div>
        </form>
      </div>
      <div class="card fade-in"><h3>${esc(t('s.weights'))}</h3>
        <form data-w>${Object.keys(w).map(k => `<div class="w-row"><span>${esc(t('sc.' + k))}</span><input type="range" min="0" max="40" name="${k}" value="${w[k]}"/><span class="mono" data-o="${k}">${w[k]}</span></div>`).join('')}
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px"><button class="btn gold">${esc(t('s.save'))}</button></div></form>
      </div>
      <div class="card fade-in"><h3>${esc(t('s.team'))}</h3>
        <table class="mini"><tr><th>Name</th><th>Email</th><th>Role</th></tr>${team.map(m => `<tr><td>${esc(m.name || '')}</td><td class="mono" style="font-size:12px">${esc(m.email)}</td><td><span class="pill">${esc(m.role)}</span></td></tr>`).join('')}</table>
        <form class="inline-form" data-team><input name="name" placeholder="Name" /><input name="email" type="email" placeholder="email@company.com" required /><select name="role" style="height:34px;border-radius:8px;border:1px solid var(--line);background:var(--ink-2);padding:0 8px"><option>agent</option><option>admin</option><option>viewer</option></select><button class="btn sm">${esc(t('d.add'))}</button></form>
        <p class="muted" style="font-size:12px">With Supabase, invite teammates in Supabase Auth and add them to team_members (see docs/PORTAL_README.md).</p>
      </div>
      <div class="card fade-in"><h3>${esc(t('s.psf'))}</h3>
        <p class="muted" style="margin-top:0;font-size:12.5px">${esc(t('s.psf_hint'))}</p>
        <form data-psf><textarea name="psf" style="min-height:140px;width:100%" class="mono">${esc(Object.entries({ ...DEFAULT_PSF, ...(S.settings().psfByZip || {}) }).map(([z, v]) => `${z}=${v}`).join('\n'))}</textarea>
        <div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn gold">${esc(t('s.save'))}</button></div></form>
      </div>
      ${S.MODE === 'demo' ? `<div class="card fade-in"><button class="btn ghost" data-reset>${esc(t('s.reset_demo'))}</button></div>` : ''}
    </div>
  </div>`
  const form = el.querySelector('[data-w]')
  form.addEventListener('input', e => { const o = el.querySelector(`[data-o="${e.target.name}"]`); if (o) o.textContent = e.target.value })
  form.onsubmit = async e => { e.preventDefault(); const nw = Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, +v])); await S.saveSettings({ weights: nw }); toast(t('s.saved')) }
  el.querySelector('[data-team]').onsubmit = async e => { e.preventDefault(); const m = Object.fromEntries(new FormData(e.target)); await S.saveSettings({ team: [...team, m] }); toast(t('s.saved')) }
  el.querySelector('[data-psf]')?.addEventListener('submit', e => {
    e.preventDefault()
    const map = {}
    for (const line of String(new FormData(e.target).get('psf') || '').split(/\n/)) { const m = line.match(/^\s*(\d{5}|default)\s*[=:,]\s*([\d.]+)/i); if (m) map[m[1].toLowerCase()] = +m[2] }
    S.saveSettings({ psfByZip: map }); toast(t('s.saved'))
  })
  el.querySelector('[data-reset]')?.addEventListener('click', () => { S.resetDemo(); toast(t('s.saved')) })
  dropzone(el.querySelector('#dncdrop'), async files => { const r = await DNC.importFile(files[0]); toast(`DNC +${r.added.toLocaleString()} · ${r.total.toLocaleString()}`); settingsView(el) }, { multiple: false, accept: '.txt,.csv,text/plain,text/csv' })
  el.querySelector('[data-dncclear]')?.addEventListener('click', async () => { await DNC.clear(); settingsView(el) })
  const mf = el.querySelector('[data-mail]')
  mf.onsubmit = async e => {
    e.preventDefault(); const fd = Object.fromEntries(new FormData(mf))
    const mailSender = Object.fromEntries(['company', 'agent', 'phone', 'email', 'office'].map(k => [k, fd['s_' + k]]))
    const mailTemplates = Object.fromEntries(['en', 'es'].map(l => [l, Object.fromEntries(['letterSubject', 'letter', 'postcardFront', 'postcard', 'disclaimer'].map(k => [k, fd[`${l}_${k}`]]))]))
    await S.saveSettings({ mailSender, mailTemplates }); toast(t('s.saved'))
  }
  el.querySelector('[data-mreset]').onclick = async () => { await S.saveSettings({ mailSender: null, mailTemplates: null }); settingsView(el) }
}
