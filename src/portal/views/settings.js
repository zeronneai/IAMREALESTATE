import { t, getLang } from '../i18n.js'
import * as S from '../store.js'
import { esc, toast, dropzone, icon, modal, date } from '../ui.js'
import * as DNC from '../dnc.js'
import * as EP from '../epcad.js'
import { colorFromLogo, normalizeLogo, applyBrand } from '../brand.js'
import { DEFAULT_TEMPLATES, DEFAULT_SENDER } from '../mail.js'
import { DEFAULT_PSF } from '../parse/epcad.js'

// Technical status, shown only to admins in advanced mode (?advanced).
const INTS = [
  ['supabase', 'Database and sign in', 'VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY'],
  ['skiptrace', 'Bulk skip trace (BatchData or REISkip)', 'SKIPTRACE_PROVIDER, BATCHDATA_API_KEY / REISKIP_API_KEY'],
  ['ghl_webhook', 'GoHighLevel inbound webhook', 'GHL_WEBHOOK_URL'],
  ['epcounty_source', 'County postings source', 'EPCOUNTY_SOURCE_URL'],
  ['epcad_export', 'EPCAD export auto download', 'EPCAD_EXPORT_URL'],
  ['llm', 'AI assist for odd PDFs', 'ANTHROPIC_API_KEY or GEMINI_API_KEY'],
  ['cron_secret', 'Daily refresh', 'CRON_SECRET'],
]
const KEYLESS = [
  ['PDF reader + OCR', 'Notices, county packets, statements, tax lists', 'ready'],
  ['Notice of Trustee Sale parser', 'Sale date, address, owners, lender, trustee, loan amount, legal', 'ready'],
  ['Mortgage statement parser', 'Lender, balance, rate, payment, escrow, due date', 'ready'],
  ['County records enrichment', 'Owner, mailing address, absentee, value, year built, sqft, deed date', 'epcad'],
  ['Do Not Call check', 'National DNC file for 915', 'dnc'],
]
const ROLES = ['admin', 'agent', 'finance', 'viewer']
const initials = s => String(s || '?').trim().split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('') || '?'
const suggestPw = () => { const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'; let s = ''; const r = crypto.getRandomValues(new Uint32Array(12)); for (const n of r) s += a[n % a.length]; return s }

export async function settingsView(el) {
  const adv = S.advanced()
  const admin = S.isAdmin()
  const w = S.weights()
  const dm = await DNC.ready().catch(() => null)
  const tpl = l => ({ ...DEFAULT_TEMPLATES[l], ...(S.settings().mailTemplates?.[l] || {}) })
  const snd = { ...DEFAULT_SENDER, ...(S.settings().mailSender || {}) }
  const fields = ['company', 'agent', 'phone', 'email', 'office']

  el.innerHTML = `
  ${adv ? `<div class="adv-banner fade-in">${icon('settings')}<span>${esc(t('s.adv_on'))}</span><a href="#/settings" data-advexit>${esc(t('s.adv_exit'))}</a></div><div id="advzone" style="display:grid;gap:24px"></div>` : ''}
  ${S.isPlatform() ? `<div class="card fade-in" id="orgs" style="margin-bottom:24px"><h3>${esc(t('org.title'))}</h3><p class="lead">${esc(t('org.lead'))}</p><div id="orglist"><p class="muted"><span class="spin"></span></p></div>
    <form data-orgadd style="margin-top:18px;padding-top:18px;border-top:1px solid var(--line)">
      <h4 style="margin:0 0 12px;font-size:15px">${esc(t('org.add'))}</h4>
      <div class="org-form">
        <div class="f"><label for="og-name">${esc(t('org.name'))}</label><input id="og-name" name="name" required autocomplete="off" /></div>
        <div class="f"><label for="og-an">${esc(t('org.admin_name'))}</label><input id="og-an" name="adminName" autocomplete="off" /></div>
        <div class="f"><label for="og-ae">${esc(t('org.admin_email'))}</label><input id="og-ae" name="adminEmail" type="email" required autocomplete="off" /></div>
        <div class="f"><label for="og-pw">${esc(t('org.admin_pw'))}</label><div style="display:flex;gap:6px"><input id="og-pw" name="adminPassword" minlength="8" required autocomplete="new-password" style="flex:1;min-width:0" /><button type="button" class="btn sm ghost" data-ogen style="height:40px">${esc(t('team.generate'))}</button></div></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:14px;flex-wrap:wrap"><small class="muted">${esc(t('org.create_hint'))}</small><button class="btn gold">${esc(t('org.add'))}</button></div>
    </form></div>` : ''}
  <div class="grid-2">
    <div style="display:grid;gap:24px;align-content:start">
      ${admin ? `<div class="card fade-in" id="brandcard"><h3>${esc(t('brand.title'))}</h3><p class="lead">${esc(t('brand.lead'))}</p>
        <div class="brand-row">
          <div><div class="brand-prev" data-bprev></div>
            <div style="display:flex;gap:8px;align-items:center;margin-top:12px"><input type="color" class="swatch" data-bcolor aria-label="${esc(t('brand.color'))}"><div style="display:grid;gap:2px"><small class="muted">${esc(t('brand.color'))}</small><button type="button" class="btn sm ghost" data-bauto style="height:26px;font-size:11px">${esc(t('brand.auto'))}</button></div></div>
          </div>
          <div style="display:grid;gap:12px">
            <div class="f"><label for="b-site">${esc(t('brand.site'))}</label><div style="display:flex;gap:6px"><input id="b-site" data-bsite placeholder="example.com" autocomplete="off" style="flex:1;min-width:0"><button type="button" class="btn sm" data-bfetch style="height:40px">${esc(t('brand.fetch'))}</button></div></div>
            <div data-bpicks></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="btn sm ghost" style="cursor:pointer">${esc(t('brand.upload'))}<input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" data-bfile hidden></label><button type="button" class="btn sm ghost" data-breset>${esc(t('brand.reset'))}</button></div>
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:16px"><button class="btn gold" data-bsave>${esc(t('brand.save'))}</button></div>
      </div>` : ''}
      ${admin ? `<div class="card fade-in" id="team"><h3>${esc(t('team.title'))}</h3><p class="lead">${esc(t('team.lead'))}</p><div id="members"><p class="muted"><span class="spin"></span></p></div>
        <form data-add style="margin-top:18px;padding-top:18px;border-top:1px solid var(--line)">
          <h4 style="margin:0 0 12px;font-size:15px">${esc(t('team.add'))}</h4>
          <div class="form-grid">
            <div class="f"><label for="tm-name">${esc(t('team.name'))}</label><input id="tm-name" name="name" required autocomplete="off" /></div>
            <div class="f"><label for="tm-email">${esc(t('team.email'))}</label><input id="tm-email" name="email" type="email" required autocomplete="off" /></div>
            <div class="f"><label for="tm-pw">${esc(t('team.temp_pw'))}</label><div style="display:flex;gap:6px"><input id="tm-pw" name="password" minlength="8" required autocomplete="new-password" style="flex:1;min-width:0" /><button type="button" class="btn sm ghost" data-gen style="height:40px">${esc(t('team.generate'))}</button></div></div>
            <div class="f"><label for="tm-role">${esc(t('team.role'))}</label><select id="tm-role" name="role">${ROLES.map(r => `<option value="${r}" ${r === 'agent' ? 'selected' : ''}>${esc(t('role.' + r))}</option>`).join('')}</select></div>
          </div>
          <div style="display:flex;justify-content:flex-end;margin-top:14px"><button class="btn gold">${esc(t('team.add'))}</button></div>
        </form></div>` : ''}
      <div class="card fade-in"><h3>${esc(t('dnc.title'))}<span class="r pill ${dm?.count ? 'ok' : ''}">${(dm?.count || 0).toLocaleString()} ${esc(t('dnc.numbers'))}</span></h3>
        <p class="lead">${esc(t('dnc.hint'))}</p>
        <div class="drop" id="dncdrop" tabindex="0" role="button">${icon('upload')}<div><b>${esc(t('dnc.import'))}</b></div><p>TXT · CSV</p></div>
        <div class="toolbar" style="margin-top:12px"><a class="btn sm ghost" href="https://telemarketing.donotcall.gov/" target="_blank" rel="noopener">${esc(t('dnc.site'))}</a>${dm?.count ? `<button class="btn sm ghost" data-dncclear>${esc(t('s.dnc_clear'))}</button>` : ''}</div>
        <p class="muted" style="font-size:12.5px;margin-bottom:0">${esc(t('dnc.reminder'))}</p>
      </div>
      <div class="card fade-in"><h3>${esc(t('s.weights'))}</h3><p class="lead">${esc(t('s.weights_lead'))}</p>
        <form data-w>${Object.keys(w).map(k => `<div class="w-row"><span>${esc(t('sc.' + k))}</span><input type="range" min="0" max="40" name="${k}" value="${w[k]}" aria-label="${esc(t('sc.' + k))}"/><b data-o="${k}" style="text-align:right">${w[k]}</b></div>`).join('')}
        <div style="display:flex;justify-content:flex-end;margin-top:14px"><button class="btn gold">${esc(t('s.save'))}</button></div></form>
      </div>
      <div class="card fade-in"><h3>${esc(t('s.psf'))}</h3>
        <p class="lead">${esc(t('s.psf_hint'))}</p>
        <form data-psf><textarea name="psf" class="notes" style="min-height:140px" aria-label="${esc(t('s.psf'))}">${esc(Object.entries({ ...DEFAULT_PSF, ...(S.settings().psfByZip || {}) }).map(([z, v]) => `${z}=${v}`).join('\n'))}</textarea>
        <div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn gold">${esc(t('s.save'))}</button></div></form>
      </div>
    </div>
    <div style="display:grid;gap:24px;align-content:start">
      <div class="card fade-in"><h3>${esc(t('acct.title'))}</h3>
        <div class="member" style="border:0;padding-top:0"><span class="av">${esc(initials(S.userEmail()))}</span><div class="who"><b>${esc(S.userEmail())}</b><small>${esc(t('role.' + (S.role() || 'viewer')))}</small></div></div>
        <form data-myphone style="display:grid;gap:10px;margin-bottom:16px">
          <div class="f"><label for="myph">${esc(t('call.my_phone'))}</label><input id="myph" name="phone" type="tel" placeholder="(915) 555-0123" autocomplete="tel" /></div>
          <label class="chk" style="font-size:13px"><input type="checkbox" name="jc" checked> ${esc(t('call.my_auto'))}</label>
          <div style="display:flex;gap:8px;align-items:center"><span class="muted" style="font-size:12.5px">${esc(t('call.my_hint'))}</span><button type="button" class="btn ghost" data-testcall style="margin-left:auto">${esc(t('call.me'))}</button><button class="btn">${esc(t('s.save'))}</button></div>
        </form>
        <form data-pw style="display:grid;gap:12px">
          <div class="form-grid">
            <div class="f"><label for="pw1">${esc(t('acct.new_pw'))}</label><input id="pw1" type="password" name="p1" minlength="8" required autocomplete="new-password" /></div>
            <div class="f"><label for="pw2">${esc(t('acct.confirm_pw'))}</label><input id="pw2" type="password" name="p2" minlength="8" required autocomplete="new-password" /></div>
          </div>
          <div style="display:flex;align-items:center;gap:10px"><span class="muted" style="font-size:12.5px">${esc(t('acct.pw_rule'))}</span><button class="btn" style="margin-left:auto">${esc(t('acct.change_pw'))}</button></div>
        </form>
      </div>
      <div class="card fade-in tpl"><h3>${esc(t('mail.templates'))}</h3><p class="lead">${esc(t('s.mail_lead'))}</p>
        <form data-mail>
          <div class="form-grid">${fields.map(k => `<div class="f ${k === 'office' ? 'full' : ''}"><label>${esc(t('mail.f_' + k))}</label><input name="s_${k}" value="${esc(snd[k])}" /></div>`).join('')}</div>
          ${['en', 'es'].map(l => `<details ${l === getLang() ? 'open' : ''} style="margin-top:16px"><summary style="cursor:pointer;font-weight:650;padding:6px 0">${esc(t('mail.lang_' + l))}</summary>
            <div style="display:grid;gap:10px;margin-top:10px">
            <div class="f"><label>${esc(t('mail.f_subject'))}</label><input name="${l}_letterSubject" value="${esc(tpl(l).letterSubject)}" /></div>
            <div class="f"><label>${esc(t('mail.f_letter'))}</label><textarea name="${l}_letter">${esc(tpl(l).letter)}</textarea></div>
            <div class="f"><label>${esc(t('mail.f_pc_front'))}</label><input name="${l}_postcardFront" value="${esc(tpl(l).postcardFront)}" /></div>
            <div class="f"><label>${esc(t('mail.f_pc_back'))}</label><textarea name="${l}_postcard" style="min-height:90px">${esc(tpl(l).postcard)}</textarea></div>
            <div class="f"><label>${esc(t('mail.f_disclaimer'))}</label><textarea name="${l}_disclaimer" style="min-height:70px">${esc(tpl(l).disclaimer)}</textarea></div></div></details>`).join('')}
          <p class="muted" style="font-size:12px">{{owner}} {{address}} {{city}} {{sale_date}} {{sale_line}} {{agent}} {{company}} {{phone}} {{email}} {{office}}</p>
          <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn ghost" data-mreset>${esc(t('s.default'))}</button><button class="btn gold">${esc(t('s.save'))}</button></div>
        </form>
      </div>
      ${S.MODE === 'demo' ? `<div class="card fade-in"><button class="btn ghost" data-reset>${esc(t('s.reset_demo'))}</button></div>` : ''}
    </div>
  </div>
  ${admin && !adv ? `<a class="adv-link" href="#/settings?advanced">${esc(t('s.advanced'))}</a>` : ''}`

  // weights
  const form = el.querySelector('[data-w]')
  form.addEventListener('input', e => { const o = el.querySelector(`[data-o="${e.target.name}"]`); if (o) o.textContent = e.target.value })
  form.onsubmit = async e => { e.preventDefault(); const nw = Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, +v])); await S.saveSettings({ weights: nw }); toast(t('s.saved')) }
  // value estimate
  el.querySelector('[data-psf]').addEventListener('submit', e => {
    e.preventDefault()
    const map = {}
    for (const line of String(new FormData(e.target).get('psf') || '').split(/\n/)) { const m = line.match(/^\s*(\d{5}|default)\s*[=:,]\s*([\d.]+)/i); if (m) map[m[1].toLowerCase()] = +m[2] }
    S.saveSettings({ psfByZip: map }); toast(t('s.saved'))
  })
  el.querySelector('[data-reset]')?.addEventListener('click', () => { S.resetDemo(); toast(t('s.saved')) })
  // do not call
  dropzone(el.querySelector('#dncdrop'), async files => { const r = await DNC.importFile(files[0]); toast(`+${r.added.toLocaleString()} · ${r.total.toLocaleString()} ${t('dnc.numbers')}`); settingsView(el) }, { multiple: false, accept: '.txt,.csv,text/plain,text/csv' })
  el.querySelector('[data-dncclear]')?.addEventListener('click', async () => { await DNC.clear(); settingsView(el) })
  // mail
  const mf = el.querySelector('[data-mail]')
  mf.onsubmit = async e => {
    e.preventDefault(); const fd = Object.fromEntries(new FormData(mf))
    const mailSender = Object.fromEntries(fields.map(k => [k, fd['s_' + k]]))
    const mailTemplates = Object.fromEntries(['en', 'es'].map(l => [l, Object.fromEntries(['letterSubject', 'letter', 'postcardFront', 'postcard', 'disclaimer'].map(k => [k, fd[`${l}_${k}`]]))]))
    await S.saveSettings({ mailSender, mailTemplates }); toast(t('s.saved'))
  }
  el.querySelector('[data-mreset]').onclick = async () => { await S.saveSettings({ mailSender: null, mailTemplates: null }); settingsView(el) }
  // own password
  const myf = el.querySelector('[data-myphone]')
  import('../calls.js').then(async C => {
    const me = await C.myCallSettings()
    if (me.ok && myf.isConnected) { myf.phone.value = me.phone || ''; myf.jc.checked = me.jarvis_call !== false }
    myf.onsubmit = async e => { e.preventDefault(); const r = await C.saveMyPhone(myf.phone.value.trim(), myf.jc.checked); toast(r.ok ? t('call.saved') : t('call.e_bad_number')) }
    myf.querySelector('[data-testcall]').onclick = async () => { if (myf.phone.value.trim()) await C.saveMyPhone(myf.phone.value.trim(), myf.jc.checked); C.callMe('They pressed "Call me" in Settings to test the call.') }
  })
  el.querySelector('[data-pw]').onsubmit = async e => {
    e.preventDefault(); const { p1, p2 } = Object.fromEntries(new FormData(e.target))
    if (p1 !== p2) return toast(t('acct.pw_mismatch'))
    try { await S.changePassword(p1); e.target.reset(); toast(t('acct.pw_done')) } catch (err) { toast(err.message) }
  }
  // team
  if (admin) {
    el.querySelector('[data-gen]').onclick = () => { el.querySelector('#tm-pw').value = suggestPw() }
    el.querySelector('[data-add]').onsubmit = async e => {
      e.preventDefault(); const btn = e.submitter; if (btn) btn.disabled = true
      try { await S.teamCreate(Object.fromEntries(new FormData(e.target))); e.target.reset(); toast(t('team.added')); renderMembers(el) } catch (err) { toast(err.message) } finally { if (btn) btn.disabled = false }
    }
    renderMembers(el)
  }
  if (admin) mountBrand(el)
  // companies (platform owner)
  if (S.isPlatform()) {
    el.querySelector('[data-ogen]').onclick = () => { el.querySelector('#og-pw').value = suggestPw() }
    el.querySelector('[data-orgadd]').onsubmit = async e => {
      e.preventDefault(); const btn = e.submitter; if (btn) btn.disabled = true
      try { await S.orgCreate(Object.fromEntries(new FormData(e.target))); e.target.reset(); toast(t('org.created')); renderOrgs(el) } catch (err) { toast(err.message) } finally { if (btn) btn.disabled = false }
    }
    renderOrgs(el)
  }
  el.querySelector('[data-advexit]')?.addEventListener('click', () => S.leaveAdvanced())
  if (adv) renderAdvanced(el.querySelector('#advzone'), dm)
}

async function renderMembers(root) {
  const box = root.querySelector('#members'); if (!box) return
  let list
  try { list = await S.teamList() } catch (err) { box.innerHTML = `<div class="alert bad">${esc(t('team.err'))}</div>`; return }
  if (!list.length) { box.innerHTML = `<p class="muted">${esc(t('team.empty'))}</p>`; return }
  const me = S.myId()
  box.innerHTML = list.map(m => `<div class="member" data-id="${esc(m.id)}">
    <span class="av">${esc(initials(m.name || m.email))}</span>
    <div class="who"><b>${esc(m.name || m.email)}${m.id === me ? ` <span class="pill gold" style="margin-left:4px">${esc(t('team.you'))}</span>` : ''}</b><small>${esc(m.email)}${m.created_at ? ` · ${esc(t('team.joined'))} ${esc(date(m.created_at))}` : ''}</small></div>
    <select data-role aria-label="${esc(t('team.role'))}" ${m.id === me ? 'disabled' : ''}>${ROLES.map(r => `<option value="${r}" ${m.role === r ? 'selected' : ''}>${esc(t('role.' + r))}</option>`).join('')}</select>
    <div class="acts"><button class="btn sm ghost" data-resetpw>${esc(t('team.reset'))}</button>${m.id === me ? '' : `<button class="btn sm ghost danger" data-remove>${esc(t('team.remove'))}</button>`}</div>
  </div>`).join('')
  box.querySelectorAll('.member').forEach(row => {
    const id = row.dataset.id, m = list.find(x => x.id === id)
    row.querySelector('[data-role]').onchange = async e => { try { await S.teamUpdate(id, { role: e.target.value }); toast(t('team.role_saved')) } catch (err) { toast(err.message); renderMembers(root) } }
    row.querySelector('[data-remove]')?.addEventListener('click', () => confirmBox(t('team.remove_q'), t('team.remove'), async () => { await S.teamRemove(id); toast(t('team.removed')); renderMembers(root) }))
    row.querySelector('[data-resetpw]').onclick = () => modal(`<h3>${esc(t('team.reset'))}</h3><p class="muted" style="margin:0">${esc(t('team.reset_prompt'))} <b style="color:var(--text)">${esc(m.name || m.email)}</b></p>
      <form style="display:grid;gap:14px"><div style="display:flex;gap:8px"><input class="inp" name="pw" minlength="8" required style="flex:1" autocomplete="new-password" value="${esc(suggestPw())}" /></div>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn ghost" data-close>${esc(t('cancel'))}</button><button class="btn gold">${esc(t('team.reset'))}</button></div></form>`, (box2, close) => {
      box2.querySelector('form').onsubmit = async e => { e.preventDefault(); try { await S.teamUpdate(id, { password: new FormData(e.target).get('pw') }); close(); toast(t('team.reset_done')) } catch (err) { toast(err.message) } }
    })
  })
}

function mountBrand(el) {
  const cur = { ...S.brand() }
  const prev = el.querySelector('[data-bprev]'), col = el.querySelector('[data-bcolor]'), site = el.querySelector('[data-bsite]'), picks = el.querySelector('[data-bpicks]')
  site.value = cur.website || ''
  const paint = () => {
    prev.innerHTML = cur.logo ? `<img src="${esc(cur.logo)}" alt="">` : `<span class="muted" style="font-size:13px">${esc(t('brand.none'))}</span>`
    col.value = cur.color || '#121110'
    applyBrand(cur)
  }
  const useLogo = async data => {
    try { cur.logo = await normalizeLogo(data) } catch { cur.logo = data }
    try { cur.color = (await colorFromLogo(cur.logo)) || cur.color } catch {}
    paint()
  }
  col.oninput = () => { cur.color = col.value; applyBrand(cur) }
  el.querySelector('[data-bauto]').onclick = async () => { if (!cur.logo) return; try { cur.color = await colorFromLogo(cur.logo); paint() } catch {} }
  el.querySelector('[data-bfile]').onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => useLogo(r.result); r.readAsDataURL(f) }
  el.querySelector('[data-breset]').onclick = () => { cur.logo = null; cur.color = null; picks.innerHTML = ''; paint() }
  el.querySelector('[data-bfetch]').onclick = async e => {
    const btn = e.currentTarget; if (!site.value.trim()) return site.focus()
    btn.disabled = true; picks.innerHTML = `<p class="muted" style="margin:0"><span class="spin"></span> ${esc(t('brand.fetching'))}</p>`
    try {
      const j = await S.brandFromSite(site.value.trim())
      cur.website = j.website || site.value.trim()
      if (!j.logos?.length) { picks.innerHTML = `<div class="alert">${esc(t('brand.e_nologo'))}</div>`; return }
      picks.innerHTML = `<small class="muted">${esc(t('brand.found'))}</small><div class="brand-picks">${j.logos.map((l, i) => `<button type="button" data-i="${i}" class="${i === 0 ? 'on' : ''}"><img src="${esc(l.data)}" alt=""></button>`).join('')}</div>`
      picks.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { picks.querySelectorAll('[data-i]').forEach(x => x.classList.toggle('on', x === b)); useLogo(j.logos[+b.dataset.i].data) })
      await useLogo(j.logos[0].data)
      if (!cur.color && j.color) { cur.color = j.color; paint() }
    } catch (err) { picks.innerHTML = `<div class="alert bad">${esc(err.message)}</div>` } finally { btn.disabled = false }
  }
  el.querySelector('[data-bsave]').onclick = async e => {
    const btn = e.currentTarget; btn.disabled = true
    try { cur.website = site.value.trim() || null; await S.saveBrand(cur); toast(t('brand.saved')); setTimeout(() => location.reload(), 600) } catch (err) { toast(err.message) } finally { btn.disabled = false }
  }
  paint()
}

async function renderOrgs(root) {
  const box = root.querySelector('#orglist'); if (!box) return
  let list
  try { list = await S.orgList() } catch (err) { box.innerHTML = `<div class="alert bad">${esc(err.message)}</div>`; return }
  box.innerHTML = list.map(o => `<div class="member org-row" data-id="${esc(o.id)}">
    <span class="av">${esc(initials(o.name))}</span>
    <div class="who"><b>${esc(o.name)}${o.current ? ` <span class="pill gold" style="margin-left:4px">${esc(t('org.here'))}</span>` : ''}${o.active ? '' : ` <span class="pill bad" style="margin-left:4px">${esc(t('org.paused'))}</span>`}</b>
      <small>${o.members} ${esc(t('org.members'))} · ${o.properties} ${esc(t('org.props'))}${o.created_at ? ' · ' + esc(date(o.created_at)) : ''}</small></div>
    <div class="acts">${o.current ? '' : `<button class="btn sm" data-enter>${esc(t('org.enter'))}</button>`}<button class="btn sm ghost" data-msgcfg>${esc(t('org.msg'))}</button><button class="btn sm ghost" data-pause>${esc(t(o.active ? 'org.pause' : 'org.resume'))}</button>${o.current ? '' : `<button class="btn sm ghost danger" data-del>${esc(t('org.delete'))}</button>`}</div>
  </div>`).join('')
  box.querySelectorAll('.org-row').forEach(row => {
    const o = list.find(x => x.id === row.dataset.id)
    row.querySelector('[data-enter]')?.addEventListener('click', async () => { try { await S.orgEnter(o.id); toast(o.name); renderOrgs(root) } catch (err) { toast(err.message) } })
    row.querySelector('[data-msgcfg]').onclick = () => modal(`<h3>${esc(t('org.msg'))} · ${esc(o.name)}</h3><p class="muted" style="margin:0">${esc(t('org.msg_hint'))}</p>
      <form style="display:grid;gap:12px">
        <div class="f"><label>${esc(t('org.sms_number'))}</label><div class="ib-row"><input name="sms_number" value="${esc(o.sms_number || '')}" placeholder="(915) 555-0123" autocomplete="off" style="flex:1"><button type="button" class="btn ghost" data-connect title="${esc(t('org.connect_hint'))}">${esc(t('org.connect'))}</button></div><small class="muted">${esc(t('org.connect_hint'))}</small></div>
        <div class="f"><label>${esc(t('org.email_from'))}</label><input name="email_from" value="${esc(o.email_from || '')}" placeholder="${esc(o.name)} <hello@company.com>" autocomplete="off"></div>
        <div class="f"><label>${esc(t('org.reply_to'))}</label><input name="reply_to" type="email" value="${esc(o.reply_to || '')}" placeholder="office@company.com" autocomplete="off"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn ghost" data-close>${esc(t('cancel'))}</button><button class="btn gold">${esc(t('org.save'))}</button></div>
      </form>`, (b, close) => {
      b.querySelector('[data-connect]').onclick = async ev => {
        const btn = ev.currentTarget; btn.disabled = true
        try {
          const r = await fetch('/api/outreach/connect', { method: 'POST', headers: { 'Content-Type': 'application/json', ...S.authHeader() }, body: JSON.stringify({ number: b.querySelector('[name=sms_number]').value }) })
          const j = await r.json().catch(() => ({}))
          toast(r.ok ? t('org.connected') + ' ' + j.number : (j.error || t('org.connect_fail')))
        } catch (err) { toast(err.message) } finally { btn.disabled = false }
      }
      b.querySelector('form').onsubmit = async e => { e.preventDefault(); try { await S.orgUpdate(o.id, Object.fromEntries(new FormData(e.target))); close(); toast(t('org.saved')); renderOrgs(root) } catch (err) { toast(err.message) } }
    })
    row.querySelector('[data-pause]').onclick = async () => { try { await S.orgUpdate(o.id, { active: !o.active }); toast(t('org.saved')); renderOrgs(root) } catch (err) { toast(err.message) } }
    row.querySelector('[data-del]')?.addEventListener('click', () => modal(`<h3>${esc(t('org.delete'))} ${esc(o.name)}</h3><p class="muted" style="margin:0">${esc(t('org.delete_q'))}</p>
      <form style="display:grid;gap:12px"><input name="c" autocomplete="off" placeholder="${esc(o.name)}" required />
      <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn ghost" data-close>${esc(t('cancel'))}</button><button class="btn ghost danger">${esc(t('org.delete'))}</button></div></form>`, (b, close) => {
      b.querySelector('form').onsubmit = async e => { e.preventDefault(); try { await S.orgRemove(o.id, new FormData(e.target).get('c')); close(); toast(t('org.deleted')); renderOrgs(root) } catch (err) { toast(err.message) } }
    }))
  })
}

function confirmBox(msg, label, fn) {
  modal(`<h3>${esc(label)}</h3><p class="muted" style="margin:0">${esc(msg)}</p><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn ghost" data-close>${esc(t('cancel'))}</button><button class="btn gold" data-ok>${esc(label)}</button></div>`, (b, close) => {
    b.querySelector('[data-ok]').onclick = async () => { try { await fn(); close() } catch (err) { toast(err.message) } }
  })
}

async function renderAdvanced(box, dm) {
  let health = null
  try { const r = await fetch('/api/health'); if (r.ok) health = await r.json() } catch {}
  const em = await EP.ready().catch(() => null)
  box.innerHTML = `<div class="grid-2">
    <div class="card fade-in"><h3>${esc(t('s.keyless'))}</h3>
      ${KEYLESS.map(([n, d, st]) => { const ok = st === 'ready' || (st === 'dnc' && dm?.count) || (st === 'epcad' && em); return `<div class="kl-row"><div><b style="font-weight:600">${esc(n)}</b><small>${esc(d)}</small></div><span class="pill ${ok ? 'ok' : 'warn'}">${esc(ok ? t('s.ready') : t('s.needs_files'))}</span></div>` }).join('')}
    </div>
    <div class="card fade-in"><h3>${esc(t('s.external'))}<span class="r pill ${S.MODE === 'demo' ? 'warn' : 'ok'}">${S.MODE}</span></h3>
      ${INTS.map(([k, label, env]) => { const on = health?.integrations?.[k]; return `<div class="int-row"><div><b style="font-weight:600">${esc(label)}</b><small>${esc(env)}</small></div><span class="pill ${on ? 'ok' : ''}">${esc(on ? t('s.on') : t('s.off'))}</span></div>` }).join('')}
      ${!health ? '<p class="muted" style="font-size:12px">/api/health not reachable here.</p>' : ''}
      <p class="muted" style="font-size:12px">${esc(t('s.webhook_hint'))}</p>
    </div></div>`
}
