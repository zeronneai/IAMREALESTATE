// Parametric house specs and floor plan generator.
// Every sample listing carries a small "house" spec. planHouse() turns the listing
// (beds, baths, sqft, stories) plus that spec into rooms, walls and yard data that
// tour3d.js renders. Nothing here is hand modeled per listing.

export const STYLES = {
  modernWhite: { wall: 0xf1eee8, tex: 'stucco', trim: 0x1f1f1f, roof: 'overhang', roofColor: 0xf4f2ee, soffit: 0xb38a5e, glassy: true, door: 0x1d1c1a, name: ['Desert modern', 'Moderna desértica'] },
  modernWood: { wall: 0x2e2d2b, tex: 'panel', accent: 'wood', trim: 0x121212, roof: 'flat', coping: 0x1a1a1a, glassy: true, door: 0xb38a5e, name: ['Modern wood and steel', 'Moderna madera y acero'] },
  brick: { wall: 0xa86a4c, tex: 'brick', trim: 0xf2efe8, roof: 'hip', roofColor: 0x4b3f3a, door: 0x5a3f2c, name: ['Traditional brick', 'Tradicional de ladrillo'] },
  darkPanel: { wall: 0x27292c, tex: 'panel', accent: 'wood', trim: 0x111111, roof: 'flat', coping: 0x151515, door: 0xb38a5e, name: ['Modern fourplex', 'Fourplex moderno'] },
  luxWhite: { wall: 0xf4f2ee, tex: 'stucco', trim: 0x1b1b1b, roof: 'overhang', roofColor: 0xf7f5f1, soffit: 0x9c6b43, glassy: true, door: 0x1d1c1a, rooftop: true, name: ['Luxury contemporary', 'Contemporánea de lujo'] },
  townhouse: { wall: 0xeeebe4, tex: 'stucco', accent: 'wood', trim: 0x222222, roof: 'flat', coping: 0xd9d4ca, glassy: true, door: 0x2a2a2a, name: ['Two-story contemporary', 'Contemporánea de dos plantas'] },
  cabin: { wall: 0x8a5a3a, tex: 'siding', trim: 0x2b211b, roof: 'gable', pitch: 1.05, roofColor: 0x2d3440, door: 0x3a2a1e, chimney: true, name: ['Mountain cabin', 'Cabaña de montaña'] },
  pueblo: { wall: 0xd6a57e, tex: 'stucco', trim: 0x4a3322, roof: 'flat', coping: 0xb08664, vigas: true, door: 0x2f7f86, name: ['Pueblo revival', 'Estilo pueblo'] },
}

const W8 = { living: 1.6, kitchen: 1.25, dining: 1.0, primary: 1.45, bed: 1.0, bath: 0.62, pbath: 0.82, entry: 0.62, office: 0.95, stair: 0, flex: 0.9 }
const PUBLIC = new Set(['living', 'kitchen', 'dining'])

export function mulberry(seed) {
  let a = 0
  for (const c of String(seed)) a = (a * 31 + c.charCodeAt(0)) | 0
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

// Builds rows of rooms that fill the floor width.
function layRow(list, W, z0, z1, win, level, out) {
  const fixed = list.filter(r => r.w).reduce((s, r) => s + r.w, 0)
  const sum = list.filter(r => !r.w).reduce((s, r) => s + (r.weight ?? W8[r.type] ?? 1), 0)
  let x = 0
  for (const r of list) {
    const w = r.w ? r.w : (W - fixed) * (r.weight ?? W8[r.type] ?? 1) / sum
    out.push({ ...r, x: [x, x + w], z: [z0, z1], win, level })
    x += w
  }
}

export function planHouse(l) {
  const h = l.house
  const style = STYLES[h.style]
  const stories = h.stories || 1
  const sqm = l.sqft / 10.764
  const A = (sqm / stories) * 0.97
  const D = clamp(Math.sqrt(A / (h.aspect || 1.7)), 7.4, 12)
  const W = A / D
  const hall = 1.25
  const backD = (D - hall) * 0.56
  const z = { back: [0, backD], hall: [backD, backD + hall], front: [backD + hall, D] }
  const rooms = []
  const levels = []
  const STAIR_W = 1.35

  let bedN = 2, bathN = 2
  const bed = (extra = {}) => ({ type: 'bed', n: bedN++, ...extra })
  const bath = (extra = {}) => ({ type: 'bath', n: bathN++, ...extra })

  if (h.multi) {
    // Fourplex: two units per floor, shared corridor and stair.
    const units = [['A', 'B'], ['C', 'D']]
    for (let lv = 0; lv < stories; lv++) {
      const [u1, u2] = units[lv]
      const back = [
        { type: 'living', unit: u1 }, { type: 'kitchen', unit: u1, weight: 1.05 },
        { type: 'kitchen', unit: u2, weight: 1.05 }, { type: 'living', unit: u2 },
      ]
      const front = [
        { type: 'bed', unit: u1, n: 1 }, { type: 'bath', unit: u1, n: 0 }, { type: 'bed', unit: u1, n: 2 },
        { type: 'stair', w: STAIR_W },
        { type: 'bed', unit: u2, n: 2 }, { type: 'bath', unit: u2, n: 0 }, { type: 'bed', unit: u2, n: 1 },
      ]
      layRow(back, W, ...z.back, 'n', lv, rooms)
      layRow([{ type: 'hall' }], W, ...z.hall, null, lv, rooms)
      layRow(front, W, ...z.front, 's', lv, rooms)
      levels.push(lv)
    }
  } else if (stories === 1) {
    const back = [{ type: 'living' }, { type: 'kitchen' }]
    if (l.sqft >= 2200) back.push({ type: 'dining' })
    back.push({ type: 'primary' })
    const front = [{ type: 'entry' }]
    const otherBeds = l.beds - 1
    let otherBaths = Math.max(0, Math.round(l.baths) - 1)
    for (let i = 0; i < otherBeds; i++) {
      front.push(bed())
      if (otherBaths > 0 && (i % 2 === 0 || i === otherBeds - 1)) { front.push(bath()); otherBaths-- }
    }
    if (l.sqft / l.beds > 640) front.splice(1, 0, { type: 'office' })
    front.push({ type: 'pbath' })
    layRow(back, W, ...z.back, 'n', 0, rooms)
    layRow([{ type: 'hall' }], W, ...z.hall, null, 0, rooms)
    layRow(front, W, ...z.front, 's', 0, rooms)
    levels.push(0)
  } else {
    // Two stories: public spaces down, bedrooms up.
    const back0 = [{ type: 'living' }, { type: 'kitchen' }, { type: 'dining' }]
    const front0 = [{ type: 'stair', w: STAIR_W }, { type: 'entry' }]
    let beds = l.beds - 1, baths = Math.max(0, Math.round(l.baths) - 1)
    if (l.beds >= 4) { front0.push(bed()); beds--; }
    if (baths > 0) { front0.push(bath()); baths-- }
    if (l.sqft >= 3000) front0.push({ type: 'office' })
    layRow(back0, W, ...z.back, 'n', 0, rooms)
    layRow([{ type: 'hall' }], W, ...z.hall, null, 0, rooms)
    layRow(front0, W, ...z.front, 's', 0, rooms)
    const back1 = [{ type: 'primary' }]
    const front1 = [{ type: 'stair', w: STAIR_W }]
    let side = 0
    while (beds > 0) { (side++ % 2 === 0 ? back1 : front1).push(bed()); beds-- }
    while (baths > 0) { front1.push(bath()); baths-- }
    front1.push({ type: 'pbath' })
    if (back1.length < 2) back1.push({ type: 'flex' })
    layRow(back1, W, ...z.back, 'n', 1, rooms)
    layRow([{ type: 'hall' }], W, ...z.hall, null, 1, rooms)
    layRow(front1, W, ...z.front, 's', 1, rooms)
    levels.push(0, 1)
  }

  rooms.forEach((r, i) => { r.id = `${r.type}${r.unit || ''}${r.n ?? ''}_${r.level}_${i}` })

  const garageW = h.garage ? 6.2 : 0
  const yardD = h.yard || (h.pool ? 10 : 8)
  const frontY = h.front || 6.5
  return {
    listing: l, spec: h, style, stories, W, D, hall, backD, z, rooms, levels, garageW, yardD, frontY,
    totalW: W + garageW,
    multi: !!h.multi,
    isOpen(a, b) { return !h.multi && PUBLIC.has(a.type) && PUBLIC.has(b.type) },
  }
}

const NAMES = {
  living: ['Living', 'Sala'], kitchen: ['Kitchen', 'Cocina'], dining: ['Dining', 'Comedor'],
  primary: ['Primary bed', 'Recámara principal'], bed: ['Bedroom', 'Recámara'], bath: ['Bath', 'Baño'],
  pbath: ['Primary bath', 'Baño principal'], entry: ['Entry', 'Entrada'], office: ['Office', 'Oficina'],
  flex: ['Loft / Flex', 'Estancia / Flex'], stair: ['Stairs', 'Escalera'], hall: ['Hall', 'Pasillo'],
  backyard: ['Backyard', 'Patio'], exterior: ['Exterior', 'Fachada'], overview: ['Dollhouse', 'Maqueta'],
}

export function roomLabel(r, lang) {
  const i = lang === 'es' ? 1 : 0
  let s = NAMES[r.type][i]
  if ((r.type === 'bed' || r.type === 'bath') && r.n > 0) s += ' ' + r.n
  if (r.unit) s = `${lang === 'es' ? 'Depto' : 'Unit'} ${r.unit} · ${s}`
  return s
}
export function namedLabel(key, lang) { return NAMES[key][lang === 'es' ? 1 : 0] }
