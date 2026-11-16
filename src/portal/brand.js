// Company branding: logo + main color. The color is read from the logo automatically.

const clamp = (n, a = 0, b = 255) => Math.max(a, Math.min(b, n))
const hex = (r, g, b) => '#' + [r, g, b].map(v => clamp(Math.round(v)).toString(16).padStart(2, '0')).join('')
const rgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
const mix = (h, w, t) => { const a = rgb(h), b = rgb(w); return hex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t) }
const lum = h => { const c = rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] }
const sat = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx }

const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src })

// Main color of a logo: the most common strong color, ignoring white, transparent and near-gray pixels.
// Logos that are only black or gray return their darkest common tone.
export async function colorFromLogo(src) {
  const img = await loadImg(src)
  const S = 72, c = document.createElement('canvas'); c.width = c.height = S
  const x = c.getContext('2d', { willReadFrequently: true })
  const k = Math.min(S / (img.naturalWidth || img.width || S), S / (img.naturalHeight || img.height || S))
  x.drawImage(img, 0, 0, (img.naturalWidth || S) * k, (img.naturalHeight || S) * k)
  const d = x.getImageData(0, 0, S, S).data
  const strong = new Map(), dark = new Map()
  for (let i = 0; i < d.length; i += 4) {
    const [r, g, b, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]]
    if (a < 140) continue
    const L = (r + g + b) / 3
    if (L > 238) continue
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const s = sat(r, g, b)
    const m = s > 0.22 && L > 25 ? strong : dark
    const e = m.get(key) || { n: 0, r: 0, g: 0, b: 0, s: 0 }
    e.n++; e.r += r; e.g += g; e.b += b; e.s += s; m.set(key, e)
  }
  const pick = (m, w) => { let best = null, bs = -1; for (const e of m.values()) { const sc = w(e); if (sc > bs) { bs = sc; best = e } } return best && hex(best.r / best.n, best.g / best.n, best.b / best.n) }
  const total = [...strong.values()].reduce((a, e) => a + e.n, 0)
  if (total >= 20) return pick(strong, e => e.n * (0.6 + e.s / e.n))
  return pick(dark, e => e.n * (1.2 - (e.r + e.g + e.b) / e.n / 765)) || null
}

// Shrink an uploaded logo so it stores light (max 360 px wide, PNG). SVGs stay as they are when small.
export async function normalizeLogo(dataUrl) {
  if (dataUrl.startsWith('data:image/svg') && dataUrl.length < 300000) return dataUrl
  const img = await loadImg(dataUrl)
  const w = img.naturalWidth || 360, h = img.naturalHeight || 120
  const k = Math.min(1, 360 / w, 160 / h)
  const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k)
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/png')
}

// Paint the portal with the company color. Too light colors get darkened so text stays readable.
export function applyBrand(b = {}) {
  const root = document.documentElement.style
  const props = ['--brand', '--brand-ink', '--gold', '--gold-2', '--gold-3', '--gold-soft']
  if (!b.color || !/^#[0-9a-f]{6}$/i.test(b.color)) props.forEach(p => root.removeProperty(p))
  else {
    let c = b.color.toLowerCase()
    while (lum(c) > 0.6) c = mix(c, '#000000', 0.15)
    root.setProperty('--brand', c)
    root.setProperty('--brand-ink', lum(c) > 0.42 ? '#121110' : '#ffffff')
    root.setProperty('--gold', c)
    root.setProperty('--gold-2', mix(c, '#000000', 0.3))
    root.setProperty('--gold-3', mix(c, '#ffffff', 0.55))
    root.setProperty('--gold-soft', mix(c, '#ffffff', 0.88))
  }
  let link = document.querySelector('link[rel="icon"]')
  if (b.logo) {
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.append(link) }
    if (!link.dataset.orig) link.dataset.orig = link.href || ''
    link.href = b.logo
  } else if (link?.dataset.orig) link.href = link.dataset.orig
}
