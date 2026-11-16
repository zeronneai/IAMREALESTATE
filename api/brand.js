// GET /api/brand?url=example.com  (signed in users only)
// Reads a company's public website and returns logo candidates (as data URLs) plus the site color and name.
// The portal then picks the main color from the logo itself.
const MAX_HTML = 1_500_000, MAX_IMG = 900_000

function isPublicHost(h) {
  h = h.toLowerCase()
  if (!h.includes('.') || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return false
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':')) return false
  return true
}
async function grab(url, max, accept) {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 6000)
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PortalBrand/1.0)', Accept: accept } })
    if (!r.ok) return null
    const len = +r.headers.get('content-length') || 0
    if (len > max) return null
    const buf = Buffer.from(await r.arrayBuffer())
    if (buf.length > max) return null
    return { buf, type: (r.headers.get('content-type') || '').split(';')[0].trim(), url: r.url }
  } catch { return null } finally { clearTimeout(tm) }
}
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')); return m ? (m[2] ?? m[3] ?? m[4] ?? '').trim() : '' }
const decode = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")

export function findCandidates(html, base) {
  const out = []
  const add = (src, kind, score) => {
    if (!src || src.startsWith('data:') && src.length > MAX_IMG) return
    try { const u = src.startsWith('data:') ? src : new URL(decode(src), base).href; if (!out.some(c => c.src === u)) out.push({ src: u, kind, score }) } catch {}
  }
  for (const tag of html.match(/<img\b[^>]*>/gi) || []) {
    const hay = `${attr(tag, 'src')} ${attr(tag, 'class')} ${attr(tag, 'alt')} ${attr(tag, 'id')}`.toLowerCase()
    if (/logo/.test(hay)) add(attr(tag, 'src') || attr(tag, 'data-src'), 'logo', /header|nav|site-logo|brand/.test(hay) ? 100 : 90)
  }
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    const rel = attr(tag, 'rel').toLowerCase(), href = attr(tag, 'href')
    if (rel.includes('apple-touch-icon')) add(href, 'icon', 70)
    else if (/\bicon\b/.test(rel)) add(href, 'icon', /\.svg|\.png/i.test(href) ? 60 : 40)
  }
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const p = (attr(tag, 'property') || attr(tag, 'name')).toLowerCase()
    if (p === 'og:image' || p === 'og:logo') add(attr(tag, 'content'), p === 'og:logo' ? 'logo' : 'image', p === 'og:logo' ? 95 : 30)
  }
  add('/favicon.ico', 'icon', 10)
  return out.sort((a, b) => b.score - a.score)
}
export function findMeta(html) {
  let color = null, name = null
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const p = (attr(tag, 'property') || attr(tag, 'name')).toLowerCase()
    if (p === 'theme-color' && /^#[0-9a-f]{6}$/i.test(attr(tag, 'content'))) color = attr(tag, 'content').toLowerCase()
    if (p === 'og:site_name') name = decode(attr(tag, 'content'))
  }
  if (!name) { const m = html.match(/<title[^>]*>([^<]{1,120})<\/title>/i); if (m) name = decode(m[1]).split(/\s[|\-–·]\s/)[0].trim() }
  return { color, name }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!token || !url) return res.status(401).json({ error: 'Please sign in again.' })
  const ur = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } }).catch(() => null)
  if (!ur?.ok) return res.status(401).json({ error: 'Please sign in again.' })

  let site = String(req.query.url || '').trim()
  if (!/^https?:\/\//i.test(site)) site = 'https://' + site
  let u; try { u = new URL(site) } catch { return res.status(400).json({ error: 'bad_url' }) }
  if (!/^https?:$/.test(u.protocol) || !isPublicHost(u.hostname)) return res.status(400).json({ error: 'bad_url' })

  const page = await grab(u.href, MAX_HTML, 'text/html')
  if (!page || !/html/.test(page.type)) return res.status(404).json({ error: 'not_found' })
  const html = page.buf.toString('utf8')
  const meta = findMeta(html)
  const logos = []
  for (const c of findCandidates(html, page.url).slice(0, 8)) {
    if (logos.length >= 4) break
    if (c.src.startsWith('data:')) { logos.push({ kind: c.kind, data: c.src }); continue }
    let cu; try { cu = new URL(c.src) } catch { continue }
    if (!isPublicHost(cu.hostname)) continue
    const img = await grab(cu.href, MAX_IMG, 'image/*')
    if (!img) continue
    const type = /svg/.test(img.type) || /\.svg(\?|$)/i.test(cu.pathname) ? 'image/svg+xml' : (img.type.startsWith('image/') ? img.type : 'image/png')
    if (type === 'image/svg+xml' && /<script/i.test(img.buf.toString('utf8'))) continue
    logos.push({ kind: c.kind, data: `data:${type};base64,${img.buf.toString('base64')}` })
  }
  return res.status(200).json({ name: meta.name, color: meta.color, logos, website: u.hostname })
}
