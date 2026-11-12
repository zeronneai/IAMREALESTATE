import './portal.css'
import { t, getLang, setLang, onLang } from './i18n.js'
import * as S from './store.js'
import { esc, icon, $, $$, renderBatch, onSel, toast } from './ui.js'
import { openDrawer } from './drawer.js'
import { dashboard } from './views/dashboard.js'
import { leads } from './views/leads.js'
import { lists } from './views/lists.js'
import { inventoryView } from './views/inventory.js'
import { mortgages } from './views/mortgages.js'
import { importer } from './views/importer.js'
import { settingsView } from './views/settings.js'

const ROUTES = {
  dashboard: { icon: 'dashboard', render: el => dashboard(el) },
  foreclosures: { icon: 'foreclosures', render: (el, q) => leads(el, 'foreclosures', q), count: () => S.parcels().filter(p => p.foreclosure && p._d.daysToSale >= 0).length },
  properties: { icon: 'properties', render: (el, q) => leads(el, 'properties', q), count: () => S.parcels().length },
  lists: { icon: 'lists', render: el => lists(el), count: () => S.lists().length },
  inventory: { icon: 'inventory', render: el => inventoryView(el), count: () => S.inventory().length },
  mortgages: { icon: 'mortgages', render: el => mortgages(el) },
  import: { icon: 'import', render: el => importer(el) },
  settings: { icon: 'settings', render: el => settingsView(el) },
}
const app = document.getElementById('app')

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '')
  const [path, qs] = h.split('?')
  const q = Object.fromEntries(new URLSearchParams(qs || ''))
  return { route: ROUTES[path] ? path : 'dashboard', q }
}

function shell() {
  app.className = ''
  app.innerHTML = `
  <div class="ribbon"><span>${esc(t('proposal.by'))}</span><span class="pra">PURPLE ROOTS</span>${S.MODE === 'demo' ? `<span class="sep hide-sm">·</span><span class="demo-tag">${esc(t('demo.banner').split('·')[0].trim())}</span><span class="hide-sm">${esc(t('demo.banner').split('·')[1] || '')}</span>` : ''}</div>
  <div class="shell">
    <aside class="side" id="side">
      <a class="brand" href="/" title="iamrealestate"><span class="mk"><span class="i">I</span>AM</span><small>${esc(t('brand.sub'))}</small></a>
      <nav class="nav" aria-label="Portal">${Object.entries(ROUTES).map(([k, r]) => `<a href="#/${k}" data-r="${k}">${icon(r.icon)}<span>${esc(t('nav.' + k))}</span>${r.count ? `<span class="count">${r.count()}</span>` : ''}</a>`).join('')}</nav>
      <div class="side-foot"><span class="mono" style="font-size:11px">${esc(S.userEmail())}</span>${S.MODE === 'supabase' ? `<button data-logout>${esc(t('logout'))}</button>` : ''}<a href="/">iamrealestate · site</a></div>
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
  $$('[data-lang]').forEach(b => b.onclick = () => setLang(b.dataset.lang))
  $('[data-burger]').onclick = () => $('#side').classList.toggle('open')
  $('[data-logout]')?.addEventListener('click', () => S.signOut())
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
function rerender() { clearTimeout(pend); pend = setTimeout(() => { refreshCounts(); const { route: r } = parseHash(); if (!$('.modal')) ROUTES[r].render($('#view'), {}) }, 60) }

function login() {
  app.className = ''
  app.innerHTML = `<div class="ribbon"><span>${esc(t('proposal.by'))}</span><span class="pra">PURPLE ROOTS</span></div>
  <div class="login"><form class="box"><span class="mk" style="font-size:28px"><span class="i">I</span>AM</span><h2>${esc(t('login.title'))}</h2><p class="muted" style="margin:0">${esc(t('login.hint'))}</p>
  <input type="email" name="email" required placeholder="you@iamrealestate.co" autocomplete="email" /><button class="btn gold" style="height:42px">${esc(t('login.send'))}</button><p class="muted" id="lmsg" style="margin:0"></p></form></div>`
  app.querySelector('form').onsubmit = async e => {
    e.preventDefault()
    try { await S.sendMagicLink(new FormData(e.target).get('email')); $('#lmsg').textContent = t('login.sent') } catch (err) { $('#lmsg').textContent = err.message }
  }
}

async function boot() {
  document.documentElement.lang = getLang()
  const r = await S.init().catch(e => { console.error(e); return { ready: false, error: e } })
  if (r.needsLogin) return login()
  if (!r.ready) { app.innerHTML = `<div class="login"><div class="box"><h2>Portal</h2><p class="muted">${esc(r.error?.message || 'Error')}</p></div></div>`; return }
  shell(); route(); renderBatch()
  window.addEventListener('hashchange', () => { if (!/[?&]p=/.test(location.hash) || parseHash().route !== lastRoute) route() })
  S.onChange(rerender)
  onSel(() => {})
  onLang(() => { shell(); route(); renderBatch() })
}
boot()
export { toast }
