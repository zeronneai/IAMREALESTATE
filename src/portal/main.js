import './portal.css'
import { t, getLang, setLang, onLang } from './i18n.js'
import * as S from './store.js'
import { esc, icon, $, $$, renderBatch, onSel, toast, modal } from './ui.js'
import { openDrawer } from './drawer.js'
import { dashboard } from './views/dashboard.js'
import { leads } from './views/leads.js'
import { lists } from './views/lists.js'
import { inventoryView } from './views/inventory.js'
import { mortgages } from './views/mortgages.js'
import { importer } from './views/importer.js'
import { settingsView } from './views/settings.js'
import { routeView } from './views/route.js'

const ROUTES = {
  dashboard: { icon: 'dashboard', render: el => dashboard(el) },
  foreclosures: { icon: 'foreclosures', render: (el, q) => leads(el, 'foreclosures', q), count: () => S.parcels().filter(p => p.foreclosure && p._d.daysToSale >= 0).length },
  properties: { icon: 'properties', render: (el, q) => leads(el, 'properties', q), count: () => S.parcels().length },
  lists: { icon: 'lists', render: el => lists(el), count: () => S.lists().length },
  inventory: { icon: 'inventory', render: el => inventoryView(el), count: () => S.inventory().length },
  mortgages: { icon: 'mortgages', render: el => mortgages(el) },
  route: { icon: 'route', render: el => routeView(el), still: true },
  import: { icon: 'import', render: el => importer(el), still: true },
  settings: { icon: 'settings', render: el => settingsView(el), still: true },
}
const app = document.getElementById('app')

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '')
  const [path, qs] = h.split('?')
  const q = Object.fromEntries(new URLSearchParams(qs || ''))
  return { route: ROUTES[path] ? path : 'dashboard', q }
}

const initials = e => String(e || '?').split(/[@.\s]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('') || '?'
const credit = () => `<span class="credit">${esc(t('credit.by'))} <b>PURPLE ROOTS</b></span>`

function shell() {
  app.className = ''
  const demo = S.MODE === 'demo'
  document.body.classList.toggle('has-ribbon', demo)
  app.innerHTML = `
  ${demo ? `<div class="ribbon"><span class="demo-tag">${esc(t('demo.banner').split('·')[0].trim())}</span><span class="hide-sm">${esc(t('demo.banner').split('·')[1] || '')}</span></div>` : ''}
  <div class="shell">
    <aside class="side" id="side">
      <a class="brand" href="/" title="iamrealestate"><span class="mk"><span class="i">I</span>AM</span><small>${esc(t('brand.sub'))}</small></a>
      <nav class="nav" aria-label="Portal">${Object.entries(ROUTES).map(([k, r]) => `<a href="#/${k}" data-r="${k}">${icon(r.icon)}<span>${esc(t('nav.' + k))}</span>${r.count ? `<span class="count">${r.count()}</span>` : ''}</a>`).join('')}</nav>
      <div class="side-foot">
        <button class="acct" data-acct aria-haspopup="menu"><span class="av">${esc(initials(S.userEmail()))}</span><span class="who"><b>${esc(S.userEmail())}</b><small>${esc(t('role.' + (S.role() || 'viewer')))}</small></span></button>
        ${credit()}
      </div>
    </aside>
    <div class="main">
      <header class="top">
        <button class="burger" aria-label="menu" data-burger>${icon('menu')}</button>
        <h1 id="title"></h1>
        <div class="search">${icon('search')}<input id="q" type="search" autocomplete="off" placeholder="${esc(t('search'))}" aria-label="${esc(t('search'))}" /><div class="search-res" id="qres" hidden></div></div>
        <div class="lang"><button data-lang="en" class="${getLang() === 'en' ? 'on' : ''}">EN</button><button data-lang="es" class="${getLang() === 'es' ? 'on' : ''}">ES</button></div>
      </header>
      <main class="view" id="view"></main>
    </div>
  </div>`
  $('[data-acct]').onclick = e => acctMenu(e.currentTarget)
  $$('[data-lang]').forEach(b => b.onclick = () => setLang(b.dataset.lang))
  $('[data-burger]').onclick = () => $('#side').classList.toggle('open')
  $$('.nav a').forEach(a => a.addEventListener('click', () => $('#side').classList.remove('open')))
  const q = $('#q'), res = $('#qres')
  q.addEventListener('input', () => {
    const s = q.value.trim().toLowerCase()
    if (s.length < 2) { res.hidden = true; return }
    const hits = S.parcels().filter(p => [p.address, p.zip, p.owners?.map(o => o.name).join(' '), p.foreclosure?.mortgagee, p.epcadId].join(' ').toLowerCase().includes(s)).slice(0, 8)
    res.innerHTML = hits.map(p => `<button data-id="${esc(p.id)}"><b>${esc(p.address)}</b> <span class="muted">${esc(p.zip)} · ${esc(p.owners?.[0]?.name || '')}</span></button>`).join('') || `<button disabled class="muted">0 ${esc(t('rows'))}</button>`
    res.hidden = false
  })
  res.addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) { openDrawer(b.dataset.id); res.hidden = true; q.value = '' } })
  document.addEventListener('click', e => { if (!e.target.closest('.search')) res.hidden = true })
}

function acctMenu(anchor) {
  document.querySelector('.menu-pop')?.remove()
  const m = document.createElement('div'); m.className = 'menu-pop'; m.setAttribute('role', 'menu')
  m.innerHTML = `<div class="hd">${esc(t('acct.signed_in'))}<br/><b style="color:var(--text)">${esc(S.userEmail())}</b></div>
    <button role="menuitem" data-pw>${esc(t('acct.change_pw'))}</button>
    <button role="menuitem" data-go="settings">${esc(t('nav.settings'))}</button>
    <a role="menuitem" href="/" style="padding:10px 12px;border-radius:10px;color:var(--text);font-size:14px">iamrealestate.co</a>
    ${S.MODE === 'supabase' ? `<button role="menuitem" data-out style="color:var(--bad)">${esc(t('logout'))}</button>` : ''}`
  document.body.append(m)
  const r = anchor.getBoundingClientRect()
  m.style.left = Math.max(8, r.left) + 'px'; m.style.top = Math.max(8, r.top - m.offsetHeight - 8) + 'px'
  const close = () => { m.remove(); document.removeEventListener('mousedown', away) }
  const away = e => { if (!m.contains(e.target) && !anchor.contains(e.target)) close() }
  setTimeout(() => document.addEventListener('mousedown', away), 0)
  m.querySelector('[data-pw]').onclick = () => { close(); pwModal() }
  m.querySelector('[data-go]').onclick = () => { close(); $('#side').classList.remove('open'); location.hash = '#/settings' }
  m.querySelector('[data-out]')?.addEventListener('click', () => S.signOut())
}
function pwModal() {
  modal(`<h3>${esc(t('acct.change_pw'))}</h3><p class="muted" style="margin:0">${esc(t('acct.pw_rule'))}</p>
    <form style="display:grid;gap:12px"><div class="f"><label for="np1">${esc(t('acct.new_pw'))}</label><input id="np1" class="inp" type="password" name="p1" minlength="8" required autocomplete="new-password" style="height:44px" /></div>
    <div class="f"><label for="np2">${esc(t('acct.confirm_pw'))}</label><input id="np2" class="inp" type="password" name="p2" minlength="8" required autocomplete="new-password" style="height:44px" /></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px"><button type="button" class="btn ghost" data-close>${esc(t('cancel'))}</button><button class="btn gold">${esc(t('s.save'))}</button></div></form>`, (box, close) => {
    box.querySelector('form').onsubmit = async e => {
      e.preventDefault(); const { p1, p2 } = Object.fromEntries(new FormData(e.target))
      if (p1 !== p2) return toast(t('acct.pw_mismatch'))
      try { await S.changePassword(p1); close(); toast(t('acct.pw_done')) } catch (err) { toast(err.message) }
    }
  })
}

let lastRoute = null
function route() {
  const { route: r, q } = parseHash()
  $$('.nav a').forEach(a => a.classList.toggle('on', a.dataset.r === r))
  $('#title').textContent = t('nav.' + r)
  document.title = `${t('nav.' + r)} · IAM Portal`
  const view = $('#view')
  if (lastRoute !== r) view.scrollTop = 0
  lastRoute = r
  ROUTES[r].render(view, q)
  const pid = new URLSearchParams(location.hash.split('?')[1] || '').get('p')
  if (pid && S.parcel(pid) && !$('.drawer.show')) openDrawer(pid)
}
function refreshCounts() { $$('.nav a').forEach(a => { const r = ROUTES[a.dataset.r]; const c = a.querySelector('.count'); if (c && r.count) c.textContent = r.count() }) }

let pend
function rerender() { clearTimeout(pend); pend = setTimeout(() => { refreshCounts(); const { route: r } = parseHash(); if (!$('.modal') && !ROUTES[r].still) ROUTES[r].render($('#view'), {}) }, 60) }

function login(opts = {}) {
  app.className = ''
  document.body.classList.remove('has-ribbon')
  app.innerHTML = `<div class="login"><form class="box fade-in" novalidate>
    <span class="mk" style="font-size:30px;justify-self:start">${'<span class="i">I</span>AM'}</span>
    <div style="display:grid;gap:6px;margin:8px 0 6px"><h2>${esc(t('login.title'))}</h2><p class="muted" style="margin:0">${esc(t('login.hint'))}</p></div>
    <div class="f"><label for="le">${esc(t('login.email'))}</label><input id="le" type="email" name="email" required autocomplete="username" inputmode="email" /></div>
    <div class="f"><label for="lp">${esc(t('login.password'))}</label><input id="lp" type="password" name="password" required autocomplete="current-password" /></div>
    <div class="alert bad" id="lmsg" role="alert" hidden></div>
    <button class="btn gold" style="margin-top:4px">${esc(t('login.send'))}</button>
    <button type="button" class="lnk" data-forgot>${esc(t('login.forgot'))}</button>
    <div class="foot">${esc(t('credit.by'))} <b>PURPLE ROOTS</b></div>
    <div class="lang" style="justify-self:center"><button type="button" data-lang="en" class="${getLang() === 'en' ? 'on' : ''}">EN</button><button type="button" data-lang="es" class="${getLang() === 'es' ? 'on' : ''}">ES</button></div>
  </form></div>`
  const msg = $('#lmsg'), show = (text, ok) => { msg.hidden = false; msg.className = 'alert ' + (ok ? '' : 'bad'); msg.textContent = text }
  if (opts.error) show(opts.error)
  $$('[data-lang]').forEach(b => b.onclick = () => { setLang(b.dataset.lang); login() })
  $('[data-forgot]').onclick = () => show(t('login.forgot_msg'), true)
  app.querySelector('form').onsubmit = async e => {
    e.preventDefault()
    const fd = new FormData(e.target), btn = e.target.querySelector('.btn.gold')
    if (!fd.get('email') || !fd.get('password')) return show(t('login.bad'))
    btn.disabled = true; btn.textContent = t('login.wait')
    try { await S.signIn(fd.get('email'), fd.get('password')); location.reload() } catch (err) { console.warn(err); show(t('login.bad')); btn.disabled = false; btn.textContent = t('login.send') }
  }
}

async function boot() {
  document.documentElement.lang = getLang()
  const r = await S.init().catch(e => { console.error(e); return { ready: false, error: e } })
  // ?login previews the sign in screen (used for screenshots in demo).
  if (r.needsLogin || (S.MODE === 'demo' && /[?&]login\b/.test(location.search))) return login()
  if (S.MODE === 'supabase' && !S.role()) { await S.signOut(true); return login({ error: t('login.no_access') }) }
  if (!r.ready) { app.innerHTML = `<div class="login"><div class="box"><h2>Portal</h2><p class="muted">${esc(r.error?.message || 'Error')}</p></div></div>`; return }
  shell(); route(); renderBatch()
  window.addEventListener('hashchange', () => { if (!/[?&]p=/.test(location.hash) || parseHash().route !== lastRoute) route() })
  S.onChange(rerender)
  onSel(() => {})
  onLang(() => { shell(); route(); renderBatch() })
}
boot()
export { toast }
