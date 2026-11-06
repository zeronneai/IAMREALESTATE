// Procedural 3D tour engine. One shared environment (sky, ground, mountains, lights)
// and a parametric house that is rebuilt for each listing from planHouse().
// Dollhouse cutaway, exterior view, floor selector, room fly-to, walk mode,
// lighting presets, virtual staging and room measure.
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { t, getLang, onLang } from './i18n.js'
import { planHouse, roomLabel, namedLabel, mulberry } from './houses.js'

const H_INT = 2.8
const FH = 3.1
const CUT = 0.6
const E = 0.24
const I = 0.12
const PIN_TYPES = ['living', 'kitchen', 'primary', 'pbath', 'flex']

export function createTour(opts) {
  const { canvas, stage, pinsEl, measureEl, loadingEl, padEl, hintEl } = opts
  const isMobile = matchMedia('(max-width: 760px)').matches || navigator.maxTouchPoints > 1

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 1.75))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(48, 1, 0.08, 600)
  const world = new THREE.Group()
  scene.add(world)

  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.maxPolarAngle = 1.38
  controls.screenSpacePanning = false

  // ---------- textures ----------
  const texCache = {}
  function canvasTex(name, size, draw) {
    if (texCache[name]) return texCache[name]
    const c = document.createElement('canvas'); c.width = c.height = size
    const g = c.getContext('2d'); draw(g, size)
    const tx = new THREE.CanvasTexture(c)
    tx.colorSpace = THREE.SRGBColorSpace
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping
    tx.anisotropy = 4
    texCache[name] = tx
    return tx
  }
  const rnd = (a, b) => a + Math.random() * (b - a)
  const hex = c => '#' + c.toString(16).padStart(6, '0')
  const shadeHex = (c, k) => { const col = new THREE.Color(c); col.offsetHSL(0, 0, k); return '#' + col.getHexString() }
  function noise(g, s, base, amt, n = 9000, r = 1.2) {
    g.fillStyle = base; g.fillRect(0, 0, s, s)
    for (let i = 0; i < n; i++) {
      const v = Math.floor(rnd(-amt, amt))
      g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 255})`
      g.fillRect(Math.random() * s, Math.random() * s, r, r)
    }
  }
  function planks(g, s, hue, sat, l0, l1, rows) {
    const h = s / rows
    for (let r = 0; r < rows; r++) {
      let x = -Math.random() * s
      while (x < s) {
        const w = rnd(s * 0.35, s * 0.7), l = rnd(l0, l1)
        g.fillStyle = `hsl(${hue}, ${sat}%, ${l}%)`; g.fillRect(x, r * h, w, h)
        for (let k = 0; k < 12; k++) { g.fillStyle = `hsla(${hue},${sat}%,${l - rnd(6, 12)}%,0.25)`; g.fillRect(x, r * h + rnd(0, h), w, rnd(0.6, 1.6)) }
        g.fillStyle = 'rgba(40,25,10,0.35)'; g.fillRect(x, r * h, 1.5, h); x += w
      }
      g.fillStyle = 'rgba(40,25,10,0.35)'; g.fillRect(0, r * h, s, 1.2)
    }
  }
  const T = {
    oak: () => canvasTex('oak', 512, (g, s) => planks(g, s, 32, 38, 58, 68, 8)),
    oakD: () => canvasTex('oakD', 512, (g, s) => planks(g, s, 26, 30, 36, 44, 8)),
    tile: () => canvasTex('tile', 256, (g, s) => {
      noise(g, s, '#d9d6d0', 14, 3000)
      g.strokeStyle = 'rgba(120,115,105,0.6)'; g.lineWidth = 2
      for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * s / 4, 0); g.lineTo(i * s / 4, s); g.stroke(); g.beginPath(); g.moveTo(0, i * s / 4); g.lineTo(s, i * s / 4); g.stroke() }
    }),
    polished: () => canvasTex('polished', 256, (g, s) => { noise(g, s, '#cfcac2', 10, 5000, 2); g.strokeStyle = 'rgba(90,85,80,.25)'; g.lineWidth = 1.5; g.strokeRect(0, 0, s, s) }),
    saltillo: () => canvasTex('saltillo', 256, (g, s) => {
      const n = 4, q = s / n
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = `hsl(${rnd(14, 22)}, ${rnd(48, 58)}%, ${rnd(44, 52)}%)`; g.fillRect(i * q, j * q, q, q) }
      g.strokeStyle = '#d9c7ae'; g.lineWidth = 4
      for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * q, 0); g.lineTo(i * q, s); g.stroke(); g.beginPath(); g.moveTo(0, i * q); g.lineTo(s, i * q); g.stroke() }
    }),
    carpet: () => canvasTex('carpet', 256, (g, s) => noise(g, s, '#bfb4a4', 18, 14000, 1.3)),
    gravel: () => canvasTex('gravel', 512, (g, s) => {
      g.fillStyle = '#b9a48a'; g.fillRect(0, 0, s, s)
      for (let i = 0; i < 9000; i++) { g.fillStyle = `hsl(${rnd(20, 38)}, ${rnd(10, 30)}%, ${rnd(45, 78)}%)`; g.beginPath(); g.arc(Math.random() * s, Math.random() * s, rnd(0.8, 2.6), 0, 7); g.fill() }
    }),
    lawn: () => canvasTex('lawn', 512, (g, s) => {
      g.fillStyle = '#6f8f45'; g.fillRect(0, 0, s, s)
      for (let i = 0; i < 22000; i++) { g.fillStyle = `hsl(${rnd(78, 98)}, ${rnd(30, 50)}%, ${rnd(26, 46)}%)`; g.fillRect(Math.random() * s, Math.random() * s, 1, rnd(2, 5)) }
    }),
    sand: () => canvasTex('sand', 512, (g, s) => noise(g, s, '#cdb594', 22, 16000, 1.6)),
    plaster: () => canvasTex('plaster', 256, (g, s) => noise(g, s, '#f1ece4', 6, 4000, 1.2)),
    concrete: () => canvasTex('concrete', 256, (g, s) => { noise(g, s, '#c9c3ba', 14, 7000); g.strokeStyle = 'rgba(90,85,80,.35)'; g.lineWidth = 2; g.strokeRect(0, 0, s, s) }),
    asphalt: () => canvasTex('asphalt', 256, (g, s) => noise(g, s, '#3a3836', 24, 12000)),
    shingle: () => canvasTex('shingle', 256, (g, s) => {
      const rows = 10, h = s / rows
      for (let r = 0; r < rows; r++) { let x = (r % 2) * -16; while (x < s) { const l = rnd(22, 32); g.fillStyle = `hsl(20, 10%, ${l}%)`; g.fillRect(x, r * h, 30, h - 2); x += 32 } }
    }),
    seam: () => canvasTex('seam', 256, (g, s) => { g.fillStyle = '#2e3542'; g.fillRect(0, 0, s, s); g.fillStyle = 'rgba(255,255,255,.12)'; for (let x = 0; x < s; x += 32) g.fillRect(x, 0, 3, s) }),
    rug1: () => canvasTex('rug1', 256, (g, s) => {
      g.fillStyle = '#e7dccb'; g.fillRect(0, 0, s, s)
      g.strokeStyle = '#1b1a18'; g.lineWidth = 3
      for (let i = 16; i < s; i += 32) { g.beginPath(); g.moveTo(0, i); for (let x = 0; x <= s; x += 16) g.lineTo(x, i + ((x / 16) % 2 ? 8 : -8)); g.stroke() }
      g.strokeStyle = '#b8954a'; g.lineWidth = 8; g.strokeRect(6, 6, s - 12, s - 12)
    }),
    rug2: () => canvasTex('rug2', 256, (g, s) => {
      g.fillStyle = '#3d3a36'; g.fillRect(0, 0, s, s); g.fillStyle = '#c9b38a'
      for (let i = 0; i < s; i += 24) for (let j = 0; j < s; j += 24) if ((i + j) % 48 === 0) g.fillRect(i + 6, j + 6, 12, 12)
    }),
  }
  // Exterior wall textures baked with the style color, sampled in world meters.
  function wallTex(kind, color) {
    const key = kind + color
    return canvasTex(key, 512, (g, s) => {
      const base = hex(color)
      if (kind === 'brick') {
        g.fillStyle = shadeHex(color, 0.22); g.fillRect(0, 0, s, s)
        const rows = 16, h = s / rows, bw = s / 5
        for (let r = 0; r < rows; r++) for (let x = (r % 2) * -bw / 2; x < s; x += bw) { g.fillStyle = shadeHex(color, rnd(-0.07, 0.05)); g.fillRect(x + 2, r * h + 2, bw - 4, h - 4) }
      } else if (kind === 'siding') {
        const rows = 7, h = s / rows
        for (let r = 0; r < rows; r++) { g.fillStyle = shadeHex(color, rnd(-0.04, 0.04)); g.fillRect(0, r * h, s, h); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, r * h + h - 4, s, 4) }
        for (let i = 0; i < 3000; i++) { g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(Math.random() * s, Math.random() * s, rnd(8, 30), 1) }
      } else if (kind === 'panel') {
        noise(g, s, base, 8, 4000, 1.5)
        g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 3
        g.strokeRect(0, 0, s, s); g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.stroke()
      } else if (kind === 'wood') {
        for (let x = 0; x < s; x += 32) { g.fillStyle = `hsl(28, 42%, ${rnd(38, 50)}%)`; g.fillRect(x, 0, 30, s); g.fillStyle = 'rgba(30,15,5,.5)'; g.fillRect(x + 30, 0, 2, s) }
      } else {
        noise(g, s, base, 16, 9000, 1.4)
      }
    })
  }
  const TEX_M = { brick: 1.3, siding: 1.4, panel: 2.4, wood: 1.6, stucco: 2.0 }
  function texFor(kind, w, d) {
    const tx = T[kind]().clone(); tx.needsUpdate = true
    const scale = { oak: 3.2, oakD: 3.2, tile: 2.4, polished: 2.4, saltillo: 1.6, gravel: 3, lawn: 4, sand: 6, concrete: 2.5, carpet: 2 }[kind] || 3
    tx.repeat.set(w / scale, d / scale)
    return tx
  }

  // ---------- shared materials ----------
  const M = {
    plaster: new THREE.MeshStandardMaterial({ map: T.plaster(), roughness: 0.9 }),
    block: new THREE.MeshStandardMaterial({ color: 0xc7ab86, roughness: 0.95 }),
    blockCap: new THREE.MeshStandardMaterial({ color: 0xa8875f, roughness: 0.85 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fc4d6, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.22, emissive: 0x000000, depthWrite: false }),
    rail: new THREE.MeshStandardMaterial({ color: 0xbfd6e0, roughness: 0.05, transparent: true, opacity: 0.3, depthWrite: false }),
    slab: new THREE.MeshStandardMaterial({ color: 0x8d8478, roughness: 0.9 }),
    ceiling: new THREE.MeshStandardMaterial({ color: 0xf4f0ea, roughness: 1, emissive: 0xd8d0c2, emissiveIntensity: 0.32 }),
    quartz: new THREE.MeshStandardMaterial({ color: 0xf2efea, roughness: 0.25 }),
    cabinet: new THREE.MeshStandardMaterial({ color: 0x2f3a36, roughness: 0.6 }),
    cabinetW: new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.6 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xc9c9c9, roughness: 0.25, metalness: 0.85 }),
    black: new THREE.MeshStandardMaterial({ color: 0x1d1c1a, roughness: 0.55, metalness: 0.3 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb8954a, roughness: 0.3, metalness: 0.9 }),
    porcelain: new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.15 }),
    mirror: new THREE.MeshStandardMaterial({ color: 0xc9d6dc, roughness: 0.12, metalness: 0.2 }),
    fabric: new THREE.MeshStandardMaterial({ color: 0xd8cfc2, roughness: 1 }),
    fabricDark: new THREE.MeshStandardMaterial({ color: 0x48443e, roughness: 1 }),
    fabricBlue: new THREE.MeshStandardMaterial({ color: 0x3d5566, roughness: 1 }),
    leather: new THREE.MeshStandardMaterial({ color: 0x8a4f2a, roughness: 0.6 }),
    walnut: new THREE.MeshStandardMaterial({ color: 0x5a3f2c, roughness: 0.55 }),
    oakWood: new THREE.MeshStandardMaterial({ color: 0xb38a5e, roughness: 0.6 }),
    linen: new THREE.MeshStandardMaterial({ color: 0xf3efe7, roughness: 1 }),
    duvet: new THREE.MeshStandardMaterial({ color: 0xc8b79a, roughness: 1 }),
    duvet2: new THREE.MeshStandardMaterial({ color: 0x8fa3a8, roughness: 1 }),
    pot: new THREE.MeshStandardMaterial({ color: 0xb5603b, roughness: 0.9 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x55703f, roughness: 0.9 }),
    leafLush: new THREE.MeshStandardMaterial({ color: 0x3f6a34, roughness: 0.9 }),
    agave: new THREE.MeshStandardMaterial({ color: 0x7c9a83, roughness: 0.8 }),
    cactus: new THREE.MeshStandardMaterial({ color: 0x4f7a49, roughness: 0.8 }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x6b5442, roughness: 1 }),
    water: new THREE.MeshStandardMaterial({ color: 0x2aa3c4, roughness: 0.08, metalness: 0.15, emissive: 0x000000 }),
    stone: new THREE.MeshStandardMaterial({ color: 0xe6dccb, roughness: 0.8 }),
    shade: new THREE.MeshStandardMaterial({ color: 0xf1e6cf, roughness: 0.9, emissive: 0x000000 }),
    bulb: new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0x000000 }),
    door: new THREE.MeshStandardMaterial({ color: 0x6e4a2e, roughness: 0.55 }),
    garageDoor: new THREE.MeshStandardMaterial({ color: 0xe8e6e1, roughness: 0.6 }),
    car: new THREE.MeshStandardMaterial({ color: 0x5b6670, roughness: 0.3, metalness: 0.6 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }),
    concrete: new THREE.MeshStandardMaterial({ map: T.concrete(), roughness: 0.9 }),
    mountain: new THREE.MeshStandardMaterial({ color: 0x8c7b74, roughness: 1, flatShading: true }),
    stripe: new THREE.MeshStandardMaterial({ color: 0xe8d68a }),
  }
  M.concrete.userData.wuv = 2.5
  const nightGlow = [[M.shade, 0xffc27a, 0.9], [M.bulb, 0xffd59a, 2.5], [M.water, 0x0f6f8c, 0.9]]

  // ---------- geometry helpers ----------
  function worldUV(geom, pos, scale) {
    const p = geom.attributes.position, n = geom.attributes.normal, uv = geom.attributes.uv
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + pos.x, y = p.getY(i) + pos.y, z = p.getZ(i) + pos.z
      const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i))
      if (nx > 0.5) uv.setXY(i, z / scale, y / scale)
      else if (ny > 0.5) uv.setXY(i, x / scale, z / scale)
      else uv.setXY(i, x / scale, y / scale)
    }
    uv.needsUpdate = true
  }
  function box(parent, mat, x1, y1, z1, x2, y2, z2, { cast = true, receive = true } = {}) {
    const w = Math.max(0.001, Math.abs(x2 - x1)), h = Math.max(0.001, Math.abs(y2 - y1)), d = Math.max(0.001, Math.abs(z2 - z1))
    const geo = new THREE.BoxGeometry(w, h, d)
    const m = new THREE.Mesh(geo, mat)
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2)
    if (mat.userData && mat.userData.wuv) worldUV(geo, m.position, mat.userData.wuv)
    m.castShadow = cast; m.receiveShadow = receive
    parent.add(m); return m
  }
  function cyl(parent, mat, x, y, z, rt, rb, h, seg = 16) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat)
    m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true
    parent.add(m); return m
  }

  // ---------- environment ----------
  const skyUniforms = { top: { value: new THREE.Color(0x4a86c8) }, horizon: { value: new THREE.Color(0xcfe3f5) }, bottom: { value: new THREE.Color(0xd9c5a6) } }
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
    uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(min(h*2.2,1.0),0.7)) : mix(horizon, bottom, min(-h*6.0,1.0)); gl_FragColor = vec4(c,1.0); }',
  })))
  scene.fog = new THREE.Fog(0xcfe3f5, 70, 260)
  const groundTex = texFor('sand', 500, 500)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 }))
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; ground.position.y = -0.02
  scene.add(ground)
  for (const [x, z, r, h] of [[-120, -150, 60, 34], [-60, -170, 75, 46], [0, -185, 70, 40], [60, -170, 85, 52], [130, -160, 60, 30], [-170, -90, 50, 26], [190, -110, 55, 24]]) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7, 1), M.mountain)
    m.position.set(x, h / 2 - 2, z); m.rotation.y = x * 0.01; m.scale.z = 0.6; scene.add(m)
  }

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight(0xbcd7ff, 0xb89a74, 1.0); scene.add(hemi)
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.6)
  sun.castShadow = true
  sun.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048)
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03
  scene.add(sun); scene.add(sun.target)
  const interior = []
  for (let i = 0; i < 9; i++) { const p = new THREE.PointLight(0xffc98a, 0, 11, 1.6); scene.add(p); interior.push(p) }
  const poolLight = new THREE.PointLight(0x55d6ff, 0, 8, 1.5); scene.add(poolLight)

  const PRESETS = {
    day: { sun: [24, 34, 18], sunC: 0xfff3dd, sunI: 2.7, hemiS: 0xc4dcff, hemiG: 0xb69a76, hemiI: 1.05, top: 0x3f7dc4, hor: 0xd3e6f6, bot: 0xd9c5a6, fog: 0xd3e6f6, exp: 1.0, inner: 0, glow: 0, mtn: 0x9a8a84 },
    sunset: { sun: [-34, 9, -6], sunC: 0xff9a55, sunI: 2.4, hemiS: 0xf4b48a, hemiG: 0x5e4334, hemiI: 0.65, top: 0x2f3366, hor: 0xf59a5c, bot: 0x7a5440, fog: 0xe39a6c, exp: 1.05, inner: 4, glow: 0.45, mtn: 0x6d4f5a },
    night: { sun: [16, 30, -14], sunC: 0x8fa8ff, sunI: 0.35, hemiS: 0x22305a, hemiG: 0x0f0b09, hemiI: 0.32, top: 0x03060e, hor: 0x162038, bot: 0x0b0a0a, fog: 0x0e1424, exp: 1.25, inner: 11, glow: 1, mtn: 0x161a26 },
  }
  let lightMode = 'day'
  function setLight(mode) {
    lightMode = mode; const p = PRESETS[mode]
    sun.position.set(p.sun[0], p.sun[1], p.sun[2]); sun.color.setHex(p.sunC); sun.intensity = p.sunI
    hemi.color.setHex(p.hemiS); hemi.groundColor.setHex(p.hemiG); hemi.intensity = p.hemiI
    skyUniforms.top.value.setHex(p.top); skyUniforms.horizon.value.setHex(p.hor); skyUniforms.bottom.value.setHex(p.bot)
    scene.fog.color.setHex(p.fog); renderer.toneMappingExposure = p.exp
    M.mountain.color.setHex(p.mtn)
    interior.forEach(l => { l.intensity = l.userData.on ? p.inner : 0 }); poolLight.intensity = poolLight.userData.on ? p.glow * 6 : 0
    for (const [m, c, k] of nightGlow) { m.emissive.setHex(c); m.emissiveIntensity = k * p.glow }
    M.ceiling.emissiveIntensity = 0.32 - p.glow * 0.22
    M.glass.emissive.setHex(0xffb766); M.glass.emissiveIntensity = p.glow * 0.55
    M.glass.opacity = 0.22 + p.glow * 0.25
  }

  // ---------- house state ----------
  let H = null // current house: { plan, root, levels, floors, roofs, hm, pins, rooms, bounds }

  function disposeHouse() {
    if (!H) return
    world.remove(H.root)
    H.root.traverse(o => { if (o.geometry) o.geometry.dispose() })
    for (const m of H.hm) { if (m.map && !Object.values(texCache).includes(m.map)) m.map.dispose(); m.dispose() }
    pinsEl.innerHTML = ''
    H = null
  }

  function build(listing) {
    const P = planHouse(listing)
    const S = P.style
    const rng = mulberry(listing.id)
    const R = (a, b) => a + rng() * (b - a)
    const root = new THREE.Group(); world.add(root)
    const hm = []
    const mat = (o) => { const m = new THREE.MeshStandardMaterial(o); hm.push(m); return m }
    const extMat = mat({ map: wallTex(S.tex, S.wall), roughness: 0.9 }); extMat.userData.wuv = TEX_M[S.tex] || 2
    const accentMat = mat({ map: wallTex('wood', 0), roughness: 0.7 }); accentMat.userData.wuv = 1.6
    const trimMat = mat({ color: S.trim, roughness: 0.5, metalness: 0.3 })
    const copingMat = mat({ color: S.coping || S.wall, roughness: 0.85 })
    const doorMat = mat({ color: S.door, roughness: 0.5 })
    const roofColorMat = mat({ color: S.roofColor || 0xdddddd, roughness: 0.8 })
    const soffitMat = mat({ color: S.soffit || 0xb38a5e, roughness: 0.7 })
    const yardKind = P.spec.lawn ? 'lawn' : 'gravel'
    const glassy = !!S.glassy
    const publicFloor = P.spec.style === 'pueblo' ? 'saltillo' : (glassy || P.spec.style === 'darkPanel') ? 'polished' : 'oak'
    const roofType = S.roof
    const pitched = roofType === 'hip' || roofType === 'gable'

    const rugMat1 = mat({ map: T.rug1(), roughness: 1 })
    const rugMat2 = mat({ map: T.rug2(), roughness: 1 })
    const levels = P.levels.map(lv => {
      const group = new THREE.Group(); group.position.y = lv * FH; root.add(group)
      const walls = new THREE.Group(); group.add(walls)
      const staging = new THREE.Group(); group.add(staging)
      const ceilings = new THREE.Group(); group.add(ceilings)
      return { lv, group, walls, staging, ceilings, boxes: [], scale: CUT, target: CUT }
    })
    const floors = []
    const roofs = new THREE.Group(); roofs.visible = false; root.add(roofs)
    const yard = new THREE.Group(); root.add(yard)
    const yardStaging = new THREE.Group(); root.add(yardStaging)
    const lightSpots = []
    const topLevel = P.stories - 1
    const W = P.W, D = P.D

    // ---------- wall builder ----------
    function wall(L, axis, fixed, a, b, h, th, wmat, openings = [], { collide = true, coping = null, skin = false, copingFixed = fixed, copingTh = th } = {}) {
      const parent = L.walls
      const seg = (s, e, y1, y2) => {
        if (e - s < 0.01 || y2 - y1 < 0.01) return
        const m = axis === 'x' ? box(parent, wmat, s, y1, fixed - th / 2, e, y2, fixed + th / 2) : box(parent, wmat, fixed - th / 2, y1, s, fixed + th / 2, y2, e)
        if (collide && !skin && y1 < 0.5) L.boxes.push(axis === 'x' ? { x1: s, x2: e, z1: fixed - th / 2, z2: fixed + th / 2 } : { x1: fixed - th / 2, x2: fixed + th / 2, z1: s, z2: e })
        return m
      }
      const ops = openings.filter(o => o.b - o.a > 0.3 && o.a >= a && o.b <= b).sort((p, q) => p.a - q.a)
      let cur = a
      for (const o of ops) {
        if (o.a < cur) continue
        seg(cur, o.a, 0, h)
        const head = Math.min(o.head ?? 2.2, h - 0.05)
        seg(o.a, o.b, head, h)
        if (o.type === 'window') { seg(o.a, o.b, 0, o.sill ?? 0.9); if (!skin) pane(parent, axis, copingFixed, o.a, o.b, o.sill ?? 0.9, head) }
        else if (skin) { /* openings only */ }
        else if (o.type === 'glass') { pane(parent, axis, fixed, o.a, (o.a + o.b) / 2 + 0.03, 0.02, head); frameLine(parent, axis, fixed, o.a, o.b, head) }
        else if (o.type === 'door' && o.leaf) {
          const leaf = new THREE.Mesh(new THREE.BoxGeometry(o.b - o.a, head - 0.02, 0.05), o.front ? doorMat : M.door)
          leaf.castShadow = true
          const g = new THREE.Group()
          if (axis === 'x') { g.position.set(o.a, 0, fixed); leaf.position.set((o.b - o.a) / 2, head / 2, 0) }
          else { g.position.set(fixed, 0, o.a); g.rotation.y = -Math.PI / 2; leaf.position.set((o.b - o.a) / 2, head / 2, 0) }
          g.add(leaf); g.rotation.y += o.leaf
          parent.add(g)
        }
        cur = o.b
      }
      seg(cur, b, 0, h)
      if (coping) {
        const c = 0.05
        if (axis === 'x') box(parent, coping, a - c, h, copingFixed - copingTh / 2 - c, b + c, h + 0.08, copingFixed + copingTh / 2 + c)
        else box(parent, coping, copingFixed - copingTh / 2 - c, h, a - c, copingFixed + copingTh / 2 + c, h + 0.08, b + c)
      }
    }
    // exterior wall = outer skin in the style material + inner plaster lining
    function extWall(L, axis, fixed, out, a, b, h, openings, coping) {
      const so = 0.07, si = E - so
      wall(L, axis, fixed + out * (E / 2 - so / 2), a, b, h, so, extMat, openings, { coping, copingFixed: fixed, copingTh: E, skin: true })
      wall(L, axis, fixed - out * (E / 2 - si / 2), a, b, Math.min(h, H_INT + 0.02), si, M.plaster, openings, { copingFixed: fixed })
      if (h > H_INT + 0.02) {
        const f = fixed - out * (E / 2 - si / 2)
        if (axis === 'x') box(L.walls, extMat, a, H_INT + 0.02, f - si / 2, b, h, f + si / 2)
        else box(L.walls, extMat, f - si / 2, H_INT + 0.02, a, f + si / 2, h, b)
      }
    }
    function pane(parent, axis, fixed, a, b, y1, y2) {
      const g = axis === 'x' ? box(parent, M.glass, a, y1, fixed - 0.015, b, y2, fixed + 0.015, { cast: false, receive: false }) : box(parent, M.glass, fixed - 0.015, y1, a, fixed + 0.015, y2, b, { cast: false, receive: false })
      g.renderOrder = 2
      const f = 0.05
      const fr = (s, e, u1, u2) => axis === 'x' ? box(parent, trimMat, s, u1, fixed - 0.04, e, u2, fixed + 0.04) : box(parent, trimMat, fixed - 0.04, u1, s, fixed + 0.04, u2, e)
      fr(a, b, y1, y1 + f); fr(a, b, y2 - f, y2); fr(a, a + f, y1, y2); fr(b - f, b, y1, y2)
      if (b - a > 1.6) fr((a + b) / 2 - 0.025, (a + b) / 2 + 0.025, y1, y2)
    }
    function frameLine(parent, axis, fixed, a, b, head) {
      const fr = (s, e, u1, u2) => axis === 'x' ? box(parent, trimMat, s, u1, fixed - 0.04, e, u2, fixed + 0.04) : box(parent, trimMat, fixed - 0.04, u1, s, fixed + 0.04, u2, e)
      fr(a, b, head - 0.05, head); fr(a, a + 0.05, 0, head); fr(b - 0.05, b, 0, head); fr((a + b) / 2, (a + b) / 2 + 0.05, 0, head)
    }

    // exterior openings for a room on a given wall
    function extOpening(r, a, b, onBack, lvl) {
      const w = b - a, c = (a + b) / 2
      if (w < 1.0) return []
      const T2 = r.type
      if (T2 === 'hall') return []
      if (T2 === 'entry' && lvl === 0 && !onBack) {
        const out = [{ a: c - 0.5, b: c + 0.5, type: 'door', head: 2.4, leaf: 1.15, front: true }]
        if (w > 2.2) out.push({ a: c + 0.65, b: c + 1.05, type: 'window', sill: 0.3, head: 2.4 })
        return out
      }
      if (T2 === 'stair') return [{ a: c - 0.3, b: c + 0.3, type: 'window', sill: 0.7, head: 2.6 }]
      if (T2 === 'bath' || T2 === 'pbath') return [{ a: c - Math.min(0.5, w / 2 - 0.3), b: c + Math.min(0.5, w / 2 - 0.3), type: 'window', sill: 1.55, head: 2.2 }]
      const big = (T2 === 'living' || T2 === 'dining' || (glassy && T2 !== 'kitchen')) && onBack
      if (big) return [{ a: a + 0.55, b: b - 0.55, type: 'glass', head: glassy ? 2.55 : 2.4 }]
      if (T2 === 'kitchen') { const hw = Math.min(1.1, w / 2 - 0.5); return [{ a: c - hw, b: c + hw, type: 'window', sill: 1.05, head: 2.25 }] }
      const hw = Math.min(glassy ? 1.2 : 0.95, w / 2 - 0.45)
      return [{ a: c - hw, b: c + hw, type: 'window', sill: glassy ? 0.45 : 0.85, head: 2.3 }]
    }

    // ---------- per level shell ----------
    for (const L of levels) {
      const lv = L.lv
      const rooms = P.rooms.filter(r => r.level === lv)
      const isTop = lv === topLevel
      const extH = !isTop ? FH : roofType === 'flat' ? 3.35 : roofType === 'overhang' ? 3.02 : 2.95
      const cop = isTop && roofType === 'flat' ? copingMat : null
      const backRooms = rooms.filter(r => r.win === 'n'), frontRooms = rooms.filter(r => r.win === 's'), hallR = rooms.find(r => r.type === 'hall')

      // slab
      if (lv === 0) box(L.group, M.slab, -0.12, -0.32, -0.12, W + 0.12, 0.02, D + 0.12, { cast: false })
      else {
        const st = rooms.find(r => r.type === 'stair')
        const sx = st ? st.x : [0, 0], sz = st ? st.z : [0, 0]
        const y1 = -0.24, y2 = 0.02
        box(L.group, M.slab, -0.12, y1, -0.12, W + 0.12, y2, sz[0])
        box(L.group, M.slab, -0.12, y1, sz[1], W + 0.12, y2, D + 0.12)
        box(L.group, M.slab, -0.12, y1, sz[0], sx[0], y2, sz[1])
        box(L.group, M.slab, sx[1], y1, sz[0], W + 0.12, y2, sz[1])
      }

      // floors and ceilings
      for (const r of rooms) {
        if (r.type === 'stair' && lv > 0) continue
        const w = r.x[1] - r.x[0], d = r.z[1] - r.z[0]
        const kind = r.type === 'bath' || r.type === 'pbath' ? 'tile'
          : ['primary', 'bed', 'flex'].includes(r.type) ? (P.multi || S.tex === 'brick' ? 'carpet' : 'oakD')
          : r.type === 'kitchen' && S.tex === 'brick' ? 'tile' : publicFloor
        const fm = mat({ map: texFor(kind, w, d), roughness: kind === 'tile' || kind === 'polished' ? 0.35 : 0.8, emissive: 0x000000 })
        const f = new THREE.Mesh(new THREE.PlaneGeometry(w, d), fm)
        f.rotation.x = -Math.PI / 2
        f.position.set((r.x[0] + r.x[1]) / 2, 0.026, (r.z[0] + r.z[1]) / 2)
        f.receiveShadow = true; f.userData.room = r
        L.group.add(f); floors.push(f)
        if (r.type !== 'stair') {
          const c = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.ceiling)
          c.rotation.x = Math.PI / 2; c.position.set(f.position.x, H_INT, f.position.z)
          L.ceilings.add(c)
        }
      }

      // exterior walls
      const backOps = backRooms.flatMap(r => extOpening(r, r.x[0], r.x[1], true, lv))
      const frontOps = frontRooms.flatMap(r => extOpening(r, r.x[0], r.x[1], false, lv))
      extWall(L, 'x', 0, -1, -E / 2, W + E / 2, extH, backOps, cop)
      extWall(L, 'x', D, 1, -E / 2, W + E / 2, extH, frontOps, cop)
      const sideOps = (r0, r1, hasGarage) => {
        const ops = []
        if (hasGarage) return ops
        if (r0) ops.push(...extOpening(r0, r0.z[0], r0.z[1], false, -1))
        if (P.multi && lv === 0 && hallR) ops.push({ a: hallR.z[0] + 0.15, b: hallR.z[1] - 0.15, type: 'door', head: 2.3, leaf: 0.9, front: true })
        if (r1 && !hasGarage) ops.push(...extOpening(r1, r1.z[0], r1.z[1], false, -1))
        return ops.filter(o => o.type !== 'door' || P.multi)
      }
      const firstB = backRooms[0], lastB = backRooms[backRooms.length - 1], firstF = frontRooms[0], lastF = frontRooms[frontRooms.length - 1]
      extWall(L, 'z', 0, -1, E / 2, D - E / 2, extH, sideOps(firstB, firstF, false), cop)
      extWall(L, 'z', W, 1, E / 2, D - E / 2, extH, sideOps(lastB, lastF, P.garageW > 0 && lv === 0), cop)

      // accent cladding on the street face of the entry or first front room
      if (S.accent === 'wood') {
        const r = frontRooms.find(x => x.type === 'entry') || frontRooms[Math.floor(frontRooms.length / 2)]
        if (r) box(L.walls, accentMat, r.x[0] + 0.05, 0, D + E / 2, r.x[1] - 0.05, extH, D + E / 2 + 0.05)
      }

      // interior walls between rooms of the same row
      for (const row of [backRooms, frontRooms]) {
        for (let i = 0; i < row.length - 1; i++) {
          const a = row[i], b = row[i + 1]
          if (P.isOpen(a, b)) continue
          const unitSplit = P.multi && a.unit !== b.unit
          wall(L, 'z', a.x[1], a.z[0], a.z[1], H_INT, unitSplit ? 0.2 : I, M.plaster)
        }
      }
      // walls along the hall
      const doorOp = (r, wide) => {
        const w = r.x[1] - r.x[0]
        const dw = wide ? Math.min(1.8, w - 0.6) : 0.85
        if (w < dw + 0.5) return { a: r.x[0] + (w - dw) / 2, b: r.x[0] + (w + dw) / 2, type: 'door', head: 2.15 }
        return r.win === 'n'
          ? { a: r.x[0] + 0.3, b: r.x[0] + 0.3 + dw, type: 'door', head: 2.15 }
          : { a: r.x[1] - 0.3 - dw, b: r.x[1] - 0.3, type: 'door', head: 2.15 }
      }
      for (const r of backRooms) {
        if (!P.multi && ['living', 'kitchen', 'dining'].includes(r.type)) continue
        wall(L, 'x', P.z.back[1], r.x[0], r.x[1], H_INT, I, M.plaster, [doorOp(r, r.type === 'flex')])
      }
      for (const r of frontRooms) {
        if (r.type === 'entry' || r.type === 'stair') continue
        wall(L, 'x', P.z.front[0], r.x[0], r.x[1], H_INT, I, M.plaster, [doorOp(r)])
      }

      // built-ins and staging per room
      for (const r of rooms) furnish(L, r)
      // stair side walls on the ground floor so the run reads clearly
      // light spots
      for (const r of rooms) if (['living', 'kitchen', 'dining', 'primary', 'bed', 'flex', 'office'].includes(r.type)) lightSpots.push([(r.x[0] + r.x[1]) / 2, lv * FH + 2.45, (r.z[0] + r.z[1]) / 2, r.type])
    }

    // ---------- room frame helpers ----------
    function frame(r) {
      const w = r.x[1] - r.x[0], d = r.z[1] - r.z[0]
      const g = new THREE.Group()
      if (r.win === 's') { g.position.set(r.x[1], 0, r.z[1]); g.rotation.y = Math.PI }
      else g.position.set(r.x[0], 0, r.z[0])
      // door sits near local u = 0 (back rooms) or near u = w (front rooms are mirrored, door near x1 which is local u = 0 too)
      return { g, w, d, doorLow: true }
    }
    function toWorld(r, u, v) {
      return r.win === 's' ? [r.x[1] - u, r.z[1] - v] : [r.x[0] + u, r.z[0] + v]
    }

    // ---------- furniture kit (local room coords: u across, v from window wall into room) ----------
    function sofa(parent, x, z, w, rot, m = M.fabric) {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot
      box(g, M.black, -w / 2 + 0.05, 0, -0.4, -w / 2 + 0.1, 0.12, 0.4); box(g, M.black, w / 2 - 0.1, 0, -0.4, w / 2 - 0.05, 0.12, 0.4)
      box(g, m, -w / 2, 0.12, -0.45, w / 2, 0.42, 0.45)
      box(g, m, -w / 2, 0.42, 0.2, w / 2, 0.85, 0.45)
      box(g, m, -w / 2, 0.42, -0.45, -w / 2 + 0.18, 0.62, 0.45); box(g, m, w / 2 - 0.18, 0.42, -0.45, w / 2, 0.62, 0.45)
      const n = Math.max(1, Math.round(w / 0.9))
      for (let i = 0; i < n; i++) { const cw = (w - 0.36) / n; box(g, m, -w / 2 + 0.18 + i * cw + 0.02, 0.42, -0.4, -w / 2 + 0.18 + (i + 1) * cw - 0.02, 0.52, 0.2) }
      parent.add(g); return g
    }
    function table(parent, x, z, w, d, h, top = M.oakWood, leg = M.black) {
      box(parent, top, x - w / 2, h - 0.04, z - d / 2, x + w / 2, h, z + d / 2)
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(parent, leg, x + sx * (w / 2 - 0.06) - 0.025, 0, z + sz * (d / 2 - 0.06) - 0.025, x + sx * (w / 2 - 0.06) + 0.025, h - 0.04, z + sz * (d / 2 - 0.06) + 0.025)
    }
    function chair(parent, x, z, rot, m = M.walnut) {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot
      box(g, m, -0.22, 0.44, -0.22, 0.22, 0.48, 0.22); box(g, m, -0.22, 0.48, 0.18, 0.22, 0.92, 0.22)
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(g, M.black, sx * 0.19 - 0.02, 0, sz * 0.19 - 0.02, sx * 0.19 + 0.02, 0.44, sz * 0.19 + 0.02)
      parent.add(g)
    }
    function stool(parent, x, z) { cyl(parent, M.black, x, 0, z, 0.02, 0.02, 0.65, 6); cyl(parent, M.leather, x, 0.65, z, 0.19, 0.17, 0.06, 16) }
    function lamp(parent, x, z, h = 1.6) {
      cyl(parent, M.black, x, 0, z, 0.14, 0.14, 0.03, 16); cyl(parent, M.brass, x, 0.03, z, 0.012, 0.012, h - 0.3, 6)
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.3, 20, 1, true), M.shade); s.position.set(x, h - 0.15, z); parent.add(s)
    }
    function tableLamp(parent, x, y, z) {
      cyl(parent, M.brass, x, y, z, 0.05, 0.08, 0.28, 12)
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 0.2, 18, 1, true), M.shade); s.position.set(x, y + 0.36, z); parent.add(s)
    }
    function rug(parent, x, z, w, d, kind) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, d), kind === 'rug1' ? rugMat1 : rugMat2)
      m.position.set(x, 0.035, z); m.receiveShadow = true; parent.add(m)
    }
    function potPlant(parent, x, z, s = 1) {
      cyl(parent, M.pot, x, 0, z, 0.2 * s, 0.15 * s, 0.4 * s, 12)
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35 * s, 1), M.leaf); b.position.set(x, 0.75 * s, z); b.castShadow = true; parent.add(b)
    }
    function bed(parent, u0, u1, vc, bw, headHigh, duvet) {
      // bed runs along u, headboard at u1 when headHigh else at u0
      const len = 2.05, hb = headHigh ? u1 : u0
      const s = headHigh ? -1 : 1
      const foot = hb + s * len
      const ua = Math.min(hb, foot), ub = Math.max(hb, foot)
      box(parent, M.walnut, headHigh ? hb - 0.1 : hb, 0, vc - bw / 2 - 0.12, headHigh ? hb : hb + 0.1, 1.2, vc + bw / 2 + 0.12)
      box(parent, M.walnut, ua + (headHigh ? 0 : 0.1), 0, vc - bw / 2, ub - (headHigh ? 0.1 : 0), 0.3, vc + bw / 2)
      box(parent, M.linen, ua + 0.12, 0.3, vc - bw / 2 + 0.03, ub - 0.12, 0.54, vc + bw / 2 - 0.03)
      const dA = headHigh ? ua + 0.05 : hb + 0.75, dB = headHigh ? hb - 0.75 : ub - 0.05
      box(parent, duvet, dA, 0.48, vc - bw / 2 - 0.02, dB, 0.6, vc + bw / 2 + 0.02)
      const pu = headHigh ? hb - 0.5 : hb + 0.1
      box(parent, M.linen, pu, 0.54, vc - bw / 2 + 0.12, pu + 0.4, 0.7, vc - 0.05); box(parent, M.linen, pu, 0.54, vc + 0.05, pu + 0.4, 0.7, vc + bw / 2 - 0.12)
      for (const sv of [-1, 1]) {
        const v = vc + sv * (bw / 2 + 0.38)
        const ua2 = headHigh ? hb - 0.5 : hb + 0.05
        box(parent, M.walnut, ua2, 0, v - 0.24, ua2 + 0.45, 0.52, v + 0.24)
        tableLamp(parent, ua2 + 0.22, 0.52, v)
      }
    }
    function furnish(L, r) {
      const { g, w, d } = frame(r)
      const st = new THREE.Group(); st.position.copy(g.position); st.rotation.copy(g.rotation)
      L.group.add(g); L.staging.add(st)
      const cu = w / 2
      switch (r.type) {
        case 'living': {
          const sw = Math.min(2.6, w - 1.4)
          rug(st, cu, d * 0.5, Math.min(3.4, w - 0.8), Math.min(2.6, d - 1.2), 'rug1')
          sofa(st, cu, Math.min(d - 1.35, d * 0.5 + 1.0), sw, 0, P.multi ? M.fabricBlue : M.fabric)
          table(st, cu, d * 0.5, Math.min(1.3, sw * 0.5), 0.7, 0.4, M.walnut, M.walnut)
          if (w > 3.6) { sofa(st, cu - sw / 2 - 0.35, d * 0.5 - 0.2, 0.95, Math.PI / 2, M.leather); sofa(st, cu + sw / 2 + 0.35, d * 0.5 - 0.2, 0.95, -Math.PI / 2, M.leather) }
          lamp(st, 0.45, d - 0.45)
          potPlant(st, 0.5, 0.5, 1.0); potPlant(st, w - 0.5, 0.5, 0.85)
          break
        }
        case 'kitchen': {
          const cab = S.tex === 'brick' || S.tex === 'siding' ? M.cabinetW : M.cabinet
          const runEnd = w - 1.05
          box(g, cab, 0.2, 0, 0.13, runEnd, 0.88, 0.75); box(g, M.quartz, 0.17, 0.88, 0.12, runEnd + 0.03, 0.93, 0.78)
          box(g, M.steel, runEnd + 0.1, 0, 0.14, w - 0.15, 2.0, 0.85)
          box(g, M.steel, cu - 0.4, 0.93, 0.25, cu + 0.4, 0.95, 0.65)
          box(g, cab, 0.2, 1.55, 0.13, Math.max(0.3, cu - 1.2), 2.35, 0.48)
          if (d >= 3.9 && w >= 3.2) {
            const iw = Math.min(2.5, w - 1.6), iv = Math.min(2.2, d - 1.9)
            box(g, cab, cu - iw / 2, 0, iv - 0.45, cu + iw / 2, 0.88, iv + 0.45); box(g, M.quartz, cu - iw / 2 - 0.1, 0.88, iv - 0.55, cu + iw / 2 + 0.1, 0.94, iv + 0.65)
            for (const k of [-1, 0, 1]) {
              const u = cu + k * iw * 0.33
              cyl(g, M.black, u, 1.75, iv, 0.005, 0.005, 1.05, 6)
              const p = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), M.bulb); p.position.set(u, 1.7, iv); g.add(p)
              stool(st, u, iv + 1.0)
            }
          } else {
            table(st, cu, Math.min(d - 0.9, 2.2), 1.1, 0.75, 0.76)
            chair(st, cu - 0.35, Math.min(d - 0.9, 2.2) + 0.55, 0); chair(st, cu + 0.35, Math.min(d - 0.9, 2.2) + 0.55, 0)
          }
          potPlant(st, 0.45, d - 0.45, 0.7)
          break
        }
        case 'dining': {
          const tw = Math.min(2.0, w - 1.4), vc = d * 0.5
          table(st, cu, vc, tw, 0.95, 0.76)
          const n = tw > 1.6 ? [-0.6, 0, 0.6] : [-0.35, 0.35]
          for (const dx of n) { chair(st, cu + dx, vc - 0.65, Math.PI); chair(st, cu + dx, vc + 0.65, 0) }
          cyl(g, M.black, cu, 2.1, vc, 0.005, 0.005, 0.7, 6)
          const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.25, 20, 1, true), M.shade); ch.position.set(cu, 1.95, vc); g.add(ch)
          potPlant(st, w - 0.45, d - 0.45, 0.8)
          break
        }
        case 'primary': case 'bed': {
          const primary = r.type === 'primary'
          const bw = primary ? Math.min(1.95, d - 1.6) : Math.min(1.5, d - 1.5)
          const vc = d * 0.5
          rug(st, w - 1.3, vc, Math.min(2.8, w - 0.6), Math.min(2.6, d - 0.8), primary ? 'rug2' : 'rug1')
          bed(st, 0, w - 0.06, vc, Math.max(1.1, bw), true, primary ? M.duvet : (r.n % 2 ? M.duvet2 : M.duvet))
          if (w > 3.2) box(st, M.oakWood, 0.08, 0, 0.35, 0.58, 0.85, Math.min(1.9, d - 1.4))
          potPlant(st, 0.5, d - 0.5, 0.7)
          break
        }
        case 'flex': case 'office': {
          table(st, cu, 0.85, Math.min(1.5, w - 0.8), 0.65, 0.75, M.oakWood)
          chair(st, cu, 1.45, 0, M.fabricDark)
          box(st, M.walnut, w - 0.4, 0, 1.4, w - 0.08, 1.8, Math.min(d - 0.5, 2.4))
          if (r.type === 'flex' && d > 3.6) sofa(st, cu, d - 0.8, Math.min(2.2, w - 1), 0, M.fabricDark)
          potPlant(st, 0.45, d - 0.45, 0.7)
          break
        }
        case 'bath': case 'pbath': {
          const vw = Math.min(r.type === 'pbath' ? 1.9 : 1.2, w - 0.7)
          box(g, M.walnut, cu - vw / 2, 0.25, 0.1, cu + vw / 2, 0.85, 0.56)
          box(g, M.quartz, cu - vw / 2 - 0.05, 0.85, 0.06, cu + vw / 2 + 0.05, 0.9, 0.58)
          const sinks = vw > 1.4 ? [-0.45, 0.45] : [0]
          for (const s of sinks) box(g, M.porcelain, cu + s - 0.25, 0.9, 0.18, cu + s + 0.25, 0.96, 0.48)
          box(g, M.mirror, cu - vw / 2, 1.15, 0.06, cu + vw / 2, 1.5, 0.08)
          if (d >= 2.6) {
            const tv0 = Math.max(0.9, d - 1.75)
            box(g, M.porcelain, w - 0.86, 0, tv0, w - 0.1, 0.58, Math.min(d - 0.1, tv0 + 1.6))
            const wtr = box(g, M.water, w - 0.76, 0.5, tv0 + 0.1, w - 0.2, 0.55, Math.min(d - 0.2, tv0 + 1.5), { cast: false })
            wtr.castShadow = false
          }
          box(g, M.porcelain, 0.1, 0, d * 0.5 - 0.22, 0.55, 0.42, d * 0.5 + 0.22)
          box(g, M.porcelain, 0.08, 0.42, d * 0.5 - 0.22, 0.22, 0.8, d * 0.5 + 0.22)
          break
        }
        case 'entry': {
          if (w > 1.6) { box(st, M.walnut, 0.1, 0.7, d * 0.4, 0.5, 0.75, d * 0.4 + 1.2); box(st, M.walnut, 0.12, 0, d * 0.4, 0.16, 0.7, d * 0.4 + 1.2); box(st, M.walnut, 0.44, 0, d * 0.4, 0.48, 0.7, d * 0.4 + 1.2) }
          potPlant(st, w - 0.4, 0.45, 0.8)
          break
        }
        case 'stair': {
          if (r.level > 0) {
            // railing around the opening on the hall side
            box(g, M.rail, 0.05, 0, d - 0.04, w - 0.05, 1.0, d, { cast: false })
            box(g, trimMat, 0.05, 1.0, d - 0.05, w - 0.05, 1.05, d + 0.01)
            break
          }
          const n = 15, run = d - 0.45, tread = run / n, rise = FH / n
          for (let i = 0; i < n; i++) {
            const v1 = d - (i + 1) * tread, v2 = d - i * tread
            box(g, M.oakWood, 0.08, (i + 1) * rise - 0.06, v1, w - 0.08, (i + 1) * rise, v2)
            box(g, M.plaster, 0.08, 0, v1, w - 0.08, (i + 1) * rise - 0.06, v2, { cast: false })
          }
          box(g, trimMat, w - 0.1, 0.9, 0.3, w - 0.06, 0.95, d)
          const [ax, az] = toWorld(r, w / 2, d / 2)
          L.boxes.push({ x1: Math.min(r.x[0], r.x[1]), x2: Math.max(r.x[0], r.x[1]), z1: r.z[0], z2: r.z[1], ax, az })
          break
        }
        case 'hall': {
          const hw = r.x[1] - r.x[0]
          if (hw > 3) { const m = new THREE.Mesh(new THREE.BoxGeometry(Math.min(hw * 0.6, 6), 0.012, 0.7), rugMat2); m.position.set(r.x[0] + hw / 2, 0.035, (r.z[0] + r.z[1]) / 2); L.staging.add(m) }
          break
        }
      }
    }

    // ---------- garage ----------
    const gx0 = W, gx1 = W + P.garageW, gz0 = Math.max(0, D - 6.5), gz1 = D
    if (P.garageW) {
      const L0 = levels[0]
      const gh = 2.95
      wall(L0, 'x', gz0, gx0, gx1 + E / 2, gh, E, extMat, [], { coping: roofType === 'flat' ? copingMat : null })
      wall(L0, 'z', gx1, gz0, gz1, gh, E, extMat, [{ a: gz0 + 1.5, b: gz0 + 2.6, type: 'window', sill: 1.2, head: 2.1 }], { coping: roofType === 'flat' ? copingMat : null })
      wall(L0, 'x', gz1, gx0, gx1 + E / 2, gh, E, extMat, [{ a: gx0 + 0.55, b: gx1 - 0.55, type: 'gap', head: 2.3 }], { coping: roofType === 'flat' ? copingMat : null })
      const gd = box(L0.walls, M.garageDoor, gx0 + 0.55, 0, gz1 + 0.02, gx1 - 0.55, 2.3, gz1 + 0.06)
      gd.castShadow = false
      for (let y = 0.55; y < 2.3; y += 0.55) box(L0.walls, trimMat, gx0 + 0.55, y, gz1 + 0.06, gx1 - 0.55, y + 0.025, gz1 + 0.075)
      box(root, M.concrete, gx0, 0, gz0, gx1, 0.03, gz1, { cast: false })
      const gr = new THREE.Group(); gr.position.set(gx0 + 2.2, 0, gz0 + 3.4); L0.staging.add(gr)
      box(gr, M.car, -0.9, 0.3, -2.2, 0.9, 0.95, 2.2); box(gr, M.car, -0.82, 0.95, -1.2, 0.82, 1.45, 1.0); box(gr, M.glass, -0.8, 0.98, -1.15, 0.8, 1.4, 0.95)
      for (const [x, z] of [[-0.85, -1.4], [0.85, -1.4], [-0.85, 1.4], [0.85, 1.4]]) { const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 16), M.tire); tr.rotation.z = Math.PI / 2; tr.position.set(x, 0.33, z); gr.add(tr) }
      // garage roof
      if (pitched) roofs.add(hipRoof(gx0 - 0.05, gx1 + 0.35, gz0 - 0.35, gz1 + 0.35, gh, 0.55, roofMaterial()))
      else box(roofs, roofType === 'overhang' ? roofColorMat : M.slab, gx0, gh - 0.25, gz0, gx1 + E / 2, gh - 0.02, gz1 + (roofType === 'overhang' ? 0.6 : 0))
    }

    // ---------- roofs (exterior view only) ----------
    function roofMaterial() {
      const tx = (S.roof === 'gable' ? T.seam() : T.shingle()).clone(); tx.needsUpdate = true
      const m = mat({ map: tx, color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide })
      return m
    }
    function hipRoof(x0, x1, z0, z1, y, pitch, m) {
      const w = x1 - x0, d = z1 - z0
      const v = [], uv = []
      const quad = (a, b, c, e) => { v.push(...a, ...b, ...c, ...a, ...c, ...e) }
      const tri = (a, b, c) => { v.push(...a, ...b, ...c) }
      if (w >= d) {
        const rise = d / 2 * pitch, zc = (z0 + z1) / 2, r0 = x0 + d / 2, r1 = x1 - d / 2
        quad([x0, y, z1], [x1, y, z1], [r1, y + rise, zc], [r0, y + rise, zc])
        quad([x1, y, z0], [x0, y, z0], [r0, y + rise, zc], [r1, y + rise, zc])
        tri([x0, y, z0], [x0, y, z1], [r0, y + rise, zc]); tri([x1, y, z1], [x1, y, z0], [r1, y + rise, zc])
      } else {
        const rise = w / 2 * pitch, xc = (x0 + x1) / 2, r0 = z0 + w / 2, r1 = z1 - w / 2
        quad([x1, y, z1], [x1, y, z0], [xc, y + rise, r0], [xc, y + rise, r1])
        quad([x0, y, z0], [x0, y, z1], [xc, y + rise, r1], [xc, y + rise, r0])
        tri([x0, y, z1], [x1, y, z1], [xc, y + rise, r1]); tri([x1, y, z0], [x0, y, z0], [xc, y + rise, r0])
      }
      for (let i = 0; i < v.length; i += 3) uv.push((v[i] + v[i + 2] * 0.3) / 2.2, v[i + 1] * 1.4 / 2.2)
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.computeVertexNormals()
      const mesh = new THREE.Mesh(geo, m); mesh.castShadow = true; mesh.receiveShadow = true
      return mesh
    }
    function gableRoof(x0, x1, z0, z1, y, pitch, m) {
      const d = z1 - z0, rise = d / 2 * pitch, zc = (z0 + z1) / 2
      const v = []
      const quad = (a, b, c, e) => { v.push(...a, ...b, ...c, ...a, ...c, ...e) }
      quad([x0, y, z1], [x1, y, z1], [x1, y + rise, zc], [x0, y + rise, zc])
      quad([x1, y, z0], [x0, y, z0], [x0, y + rise, zc], [x1, y + rise, zc])
      const uv = []
      for (let i = 0; i < v.length; i += 3) uv.push(v[i] / 2.2, (v[i + 1] - y) * 1.6 / 2.2)
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.computeVertexNormals()
      const mesh = new THREE.Mesh(geo, m); mesh.castShadow = true
      const g = new THREE.Group(); g.add(mesh)
      // gable end triangles in wall material
      for (const x of [x0 + 0.35, x1 - 0.35]) {
        const tv = [x, y - 0.01, z0 + 0.35, x, y - 0.01, z1 - 0.35, x, y + rise - 0.3, zc]
        const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(tv, 3)); tg.computeVertexNormals()
        const tm = new THREE.Mesh(tg, extTri); tm.castShadow = true; g.add(tm)
      }
      return { g, rise }
    }
    const extTri = mat({ color: S.wall, roughness: 0.9, side: THREE.DoubleSide })
    const topY = topLevel * FH
    if (roofType === 'flat') {
      box(roofs, M.slab, 0.1, topY + 2.95, 0.1, W - 0.1, topY + 3.1, D - 0.1, { cast: false })
    } else if (roofType === 'overhang') {
      box(roofs, roofColorMat, -0.9, topY + 3.02, -1.7, W + 0.9, topY + 3.3, D + 1.0)
      box(roofs, soffitMat, -0.85, topY + 2.98, -1.65, W + 0.85, topY + 3.02, D + 0.95, { cast: false })
      if (P.stories > 1) {
        // cantilevered upper volume reads as a floating slab between floors
        box(levels[0].walls, roofColorMat, -0.6, FH - 0.32, -1.4, W + 0.6, FH - 0.02, 0)
        box(levels[0].walls, soffitMat, -0.55, FH - 0.36, -1.35, W + 0.55, FH - 0.32, 0)
      }
      if (S.rooftop) {
        box(roofs, M.rail, 0.2, topY + 3.3, 0.2, W - 0.2, topY + 4.3, 0.25, { cast: false })
        box(roofs, M.rail, 0.2, topY + 3.3, 0.2, 0.25, topY + 4.3, D * 0.6, { cast: false })
        box(roofs, M.rail, W - 0.25, topY + 3.3, 0.2, W - 0.2, topY + 4.3, D * 0.6, { cast: false })
        box(roofs, extMat, W * 0.68, topY + 3.3, D * 0.55, W - 0.4, topY + 5.6, D - 0.4)
        box(roofs, M.oakWood, 0.4, topY + 3.32, 0.4, W * 0.6, topY + 3.36, D * 0.55, { cast: false })
        sofa(roofs, W * 0.3, 1.2 + 0, 2.0, Math.PI, M.fabric).position.y = topY + 3.36
      }
    } else if (roofType === 'hip') {
      roofs.add(hipRoof(-0.45, W + 0.45, -0.45, D + 0.45, topY + 2.95, S.pitch || 0.5, roofMaterial()))
    } else if (roofType === 'gable') {
      const { g, rise } = gableRoof(-0.45, W + 0.45, -0.55, D + 0.55, topY + 2.95, S.pitch || 0.9, roofMaterial())
      roofs.add(g)
      if (S.chimney) box(roofs, extMat, W * 0.22, topY + 2.5, D * 0.5 - 0.5, W * 0.22 + 1.0, topY + 2.95 + rise + 0.8, D * 0.5 + 0.5)
    }
    if (S.vigas) {
      for (let x = 0.6; x < W - 0.3; x += 0.95) for (const [z0, z1] of [[D, D + 0.45], [-0.45, 0]]) {
        const v = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, z1 - z0, 8), M.walnut)
        v.rotation.x = Math.PI / 2; v.position.set(x, topY + 2.78, (z0 + z1) / 2); v.castShadow = true; levels[topLevel].walls.add(v)
      }
    }

    // ---------- yard ----------
    const X0 = -1.2, X1 = P.totalW + 1.2
    const yardMat = mat({ map: texFor(yardKind, X1 - X0, P.yardD), roughness: 1 })
    const by = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, P.yardD), yardMat); by.rotation.x = -Math.PI / 2; by.position.set((X0 + X1) / 2, 0.006, -P.yardD / 2); by.receiveShadow = true; yard.add(by)
    const fyMat = mat({ map: texFor(yardKind, X1 - X0, P.frontY), roughness: 1 })
    const fy = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, P.frontY), fyMat); fy.rotation.x = -Math.PI / 2; fy.position.set((X0 + X1) / 2, 0.006, D + P.frontY / 2); fy.receiveShadow = true; yard.add(fy)
    const yardFloor = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, P.yardD), new THREE.MeshBasicMaterial({ visible: false }))
    yardFloor.rotation.x = -Math.PI / 2; yardFloor.position.copy(by.position); yardFloor.position.y = 0.03
    const backyardRoom = { type: 'backyard', id: 'backyard', x: [X0, X1], z: [-P.yardD, 0], level: 0, outdoor: true }
    yardFloor.userData.room = backyardRoom; yard.add(yardFloor); floors.push(yardFloor)
    hm.push(yardFloor.material)

    // block walls
    const YL = { walls: yard, boxes: levels[0].boxes }
    wall(YL, 'x', -P.yardD, X0, X1, 1.7, 0.2, M.block, [], { coping: M.blockCap })
    wall(YL, 'z', X0, -P.yardD, 0, 1.7, 0.2, M.block, [], { coping: M.blockCap })
    wall(YL, 'z', X1, -P.yardD, P.garageW ? gz0 : 0, 1.7, 0.2, M.block, [], { coping: M.blockCap })

    // patio + pergola
    const patioW = Math.min(W * 0.55, 8.5)
    box(yard, M.concrete, 0.2, 0, -3.9, patioW, 0.05, -0.12, { cast: false })
    if (P.spec.pergola) {
      const pm = S.tex === 'panel' || S.roof === 'overhang' ? M.black : M.walnut
      for (const x of [0.5, patioW - 0.3]) box(yard, pm, x - 0.09, 0, -3.7, x + 0.09, 2.75, -3.52)
      box(yard, pm, 0.3, 2.75, -3.8, patioW - 0.1, 2.95, -3.6); box(yard, pm, 0.3, 2.75, -0.35, patioW - 0.1, 2.95, -0.15)
      for (let x = 0.5; x <= patioW - 0.2; x += 0.32) box(yard, pm, x, 2.95, -3.9, x + 0.07, 3.05, -0.1)
      for (let x = 0.7; x <= patioW - 0.4; x += 0.55) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), M.bulb); b.position.set(x, 2.6 - Math.sin((x - 0.7) / (patioW - 1) * Math.PI) * 0.25, -2.0); yard.add(b) }
    }
    sofa(yardStaging, Math.min(3, patioW / 2), -3.1, Math.min(2.2, patioW - 2), 0, M.fabricDark)
    table(yardStaging, Math.min(3.6, patioW / 2 + 0.6), -1.9, 1.0, 0.6, 0.38, M.oakWood)
    let poolOn = false
    if (P.spec.pool) {
      const px0 = Math.max(patioW + 1.0, W * 0.5), px1 = Math.min(P.totalW + 0.4, px0 + Math.min(10, P.totalW * 0.45))
      const pz0 = -P.yardD + 1.6, pz1 = Math.min(-2.2, pz0 + 4.0)
      box(yard, M.stone, px0 - 0.4, 0, pz0 - 0.4, px1 + 0.4, 0.07, pz1 + 0.4, { cast: false })
      box(yard, M.water, px0, 0.071, pz0, px1, 0.075, pz1, { cast: false })
      box(yard, M.stone, px0 - 0.4, 0, pz1 + 0.4, px1 + 0.4, 0.05, -0.12, { cast: false })
      for (const x of [px0 + 0.8, px0 + 2.2]) { const g = new THREE.Group(); g.position.set(x, 0, pz1 + 1.6); box(g, M.linen, -0.32, 0.18, -0.95, 0.32, 0.32, 0.95); yardStaging.add(g) }
      poolLight.position.set((px0 + px1) / 2, 0.4, (pz0 + pz1) / 2); poolOn = true
      P.poolRect = [px0, px1, pz0, pz1]
    } else {
      cyl(yard, M.stone, Math.min(patioW + 2.2, X1 - 2), 0, -P.yardD + 2.2, 0.6, 0.65, 0.35, 20)
    }
    if (P.spec.casita) {
      const cx0 = X1 - 5.2, cx1 = X1 - 0.6, cz0 = -P.yardD + 0.6, cz1 = cz0 + 4.2
      const CL = { walls: yard, boxes: levels[0].boxes }
      wall(CL, 'x', cz1, cx0, cx1, 3.0, E, extMat, [{ a: cx0 + 0.8, b: cx0 + 1.8, type: 'door', head: 2.2, leaf: 0.8, front: true }, { a: cx0 + 2.4, b: cx0 + 3.8, type: 'window', sill: 0.9, head: 2.1 }], { coping: copingMat })
      wall(CL, 'x', cz0, cx0, cx1, 3.0, E, extMat, [], { coping: copingMat })
      wall(CL, 'z', cx0, cz0, cz1, 3.0, E, extMat, [], { coping: copingMat })
      wall(CL, 'z', cx1, cz0, cz1, 3.0, E, extMat, [], { coping: copingMat })
      box(yard, M.slab, cx0, 2.7, cz0, cx1, 2.85, cz1)
    }
    if (P.spec.rv) box(yard, M.concrete, X1 - 4.2, 0, -P.yardD + (P.spec.casita ? 5.4 : 0.5), X1 - 0.6, 0.03, -0.5, { cast: false })

    // courtyard
    if (P.spec.courtyard) {
      const cx1 = Math.min(W * 0.48, 7.5), cz1 = D + 3.6
      const cm = mat({ map: texFor('saltillo', cx1, 3.6), roughness: 0.8 })
      const cf = new THREE.Mesh(new THREE.PlaneGeometry(cx1, 3.6), cm); cf.rotation.x = -Math.PI / 2; cf.position.set(cx1 / 2, 0.012, D + 1.8); cf.receiveShadow = true; yard.add(cf)
      const CL = { walls: yard, boxes: levels[0].boxes }
      wall(CL, 'z', 0, D, cz1, 1.35, 0.3, extMat, [], { coping: copingMat })
      wall(CL, 'x', cz1, -0.15, cx1 + 0.15, 1.35, 0.3, extMat, [{ a: cx1 * 0.4, b: cx1 * 0.4 + 1.5, type: 'gap', head: 1.35 }], { coping: copingMat })
      wall(CL, 'z', cx1, D, cz1, 1.35, 0.3, extMat, [], { coping: copingMat })
      cyl(yard, M.stone, cx1 / 2, 0, D + 1.9, 0.55, 0.6, 0.45, 20)
    }

    // street, sidewalk, driveway
    const sz = D + P.frontY
    const asphaltMat = mat({ map: texFor('sand', 1, 1), color: 0x3a3836, roughness: 1 })
    box(yard, asphaltMat, -60, -0.005, sz + 1.8, 80, 0.01, sz + 9, { cast: false })
    box(yard, M.concrete, -60, 0, sz, 80, 0.04, sz + 1.6, { cast: false })
    for (let x = -58; x < 80; x += 6) box(yard, M.stripe, x, 0.011, sz + 5.3, x + 3, 0.014, sz + 5.5, { cast: false })
    if (P.garageW) box(yard, M.concrete, gx0 + 0.2, 0, D, gx1 - 0.2, 0.03, sz, { cast: false })
    else if (P.multi) { box(yard, M.concrete, -0.5, 0, D + 1.0, W + 0.5, 0.03, sz, { cast: false }); for (let x = 0.4; x < W; x += 2.8) box(yard, M.stripe, x, 0.031, D + 1.2, x + 0.08, 0.035, sz - 0.4, { cast: false }) }
    else box(yard, M.concrete, W + 0.4, 0, D - 4.5, Math.min(X1 - 0.2, W + 3.6), 0.03, sz, { cast: false })
    // front walk
    const entry = P.rooms.find(r => r.type === 'entry' && r.level === 0)
    if (entry && !P.spec.courtyard) { const c = (entry.x[0] + entry.x[1]) / 2; box(yard, M.concrete, c - 0.6, 0, D, c + 0.6, 0.035, sz, { cast: false }) }

    // plants
    function agave(x, z, s = 1) {
      const g = new THREE.Group()
      for (let i = 0; i < 11; i++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.07 * s, 0.75 * s, 5), M.agave)
        const a = (i / 11) * Math.PI * 2, tilt = R(0.5, 1.1)
        c.position.set(Math.cos(a) * 0.12 * s, 0.32 * s, Math.sin(a) * 0.12 * s)
        c.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt); c.castShadow = true; g.add(c)
      }
      g.position.set(x, 0, z); yard.add(g)
    }
    function barrel(x, z, s = 1) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.22 * s, 12, 10), M.cactus); m.scale.y = 1.25; m.position.set(x, 0.22 * s, z); m.castShadow = true; yard.add(m) }
    function ocotillo(x, z) {
      for (let i = 0; i < 8; i++) {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.035, R(2.0, 2.9), 5), M.trunk)
        const a = R(0, 6.28), tilt = R(0.1, 0.35)
        c.position.set(x + Math.cos(a) * 0.25, 1.2, z + Math.sin(a) * 0.25); c.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt); c.castShadow = true; yard.add(c)
      }
    }
    function tree(x, z, s = 1, lush = false) {
      cyl(yard, M.trunk, x, 0, z, 0.08 * s, 0.13 * s, 2.1 * s, 7)
      for (let i = 0; i < 4; i++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(R(0.8, 1.15) * s, 0), lush ? M.leafLush : M.leaf)
        b.position.set(x + R(-0.7, 0.7) * s, (2.4 + R(0, 0.7)) * s, z + R(-0.7, 0.7) * s); b.castShadow = true; yard.add(b)
      }
    }
    function palm(x, z) {
      cyl(yard, M.trunk, x, 0, z, 0.1, 0.16, 5.2, 7)
      for (let i = 0; i < 8; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.18, 2.2, 4), M.leafLush); const a = i / 8 * 6.28; f.position.set(x + Math.cos(a) * 0.8, 5.0, z + Math.sin(a) * 0.8); f.rotation.set(Math.sin(a) * 1.9, 0, -Math.cos(a) * 1.9); f.castShadow = true; yard.add(f) }
    }
    const lawn = yardKind === 'lawn'
    const free = (x, z) => !(x > -0.5 && x < P.totalW + 0.5 && z > -0.5 && z < D + 0.5) && !(P.poolRect && x > P.poolRect[0] - 0.8 && x < P.poolRect[1] + 0.8 && z > P.poolRect[2] - 0.8 && z < P.poolRect[3] + 0.8)
    const nFront = Math.round(R(4, 8))
    for (let i = 0; i < nFront; i++) {
      const x = R(X0 + 0.6, X1 - 0.6), z = R(D + 0.8, sz - 0.8)
      if (P.garageW && x > gx0 - 0.3 && x < gx1 + 0.3) continue
      if (entry && Math.abs(x - (entry.x[0] + entry.x[1]) / 2) < 1.2) continue
      if (P.spec.courtyard && x < Math.min(W * 0.48, 7.5) + 0.5 && z < D + 4) continue
      if (lawn) { if (rng() < 0.4) tree(x, z, R(0.8, 1.15), true); else { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(R(0.3, 0.5), 1), M.leafLush); b.position.set(x, 0.3, z); b.castShadow = true; yard.add(b) } }
      else { const k = rng(); if (k < 0.45) agave(x, z, R(0.7, 1.2)); else if (k < 0.75) barrel(x, z, R(0.7, 1.1)); else ocotillo(x, z) }
    }
    const nBack = Math.round(R(5, 9))
    for (let i = 0; i < nBack; i++) {
      const edge = rng() < 0.5
      const x = edge ? (rng() < 0.5 ? X0 + 0.7 : X1 - 0.7) : R(X0 + 0.7, X1 - 0.7)
      const z = edge ? R(-P.yardD + 0.7, -4.5) : -P.yardD + 0.7
      if (!free(x, z)) continue
      if (P.spec.casita && x > X1 - 5.6 && z < -P.yardD + 5.2) continue
      if (lawn) tree(x, z, R(0.9, 1.25), true)
      else { const k = rng(); if (k < 0.35) agave(x, z, R(0.8, 1.3)); else if (k < 0.55) barrel(x, z); else if (k < 0.75) ocotillo(x, z); else tree(x, z, R(0.9, 1.2)) }
    }
    if (P.spec.palms) { palm(X0 + 1, -P.yardD + 1.2); palm(X1 - 1, D + P.frontY - 1.2) }
    for (const [x, z] of [[-6, D * 0.3], [P.totalW + 6, D * 0.6], [-5, -P.yardD - 3], [P.totalW + 5, -P.yardD - 2]]) tree(x, z, R(0.9, 1.3), lawn)

    // ---------- lights ----------
    const pick = lightSpots.slice(0, 8)
    interior.forEach((l, i) => {
      const s = pick[i]
      l.userData.on = !!s
      if (s) l.position.set(s[0], s[1], s[2])
    })
    interior[8].userData.on = !!P.spec.pergola
    interior[8].position.set(Math.min(4.4, patioW / 2), 2.45, -2)
    poolLight.userData.on = poolOn

    // center the house on the origin
    world.position.set(-P.totalW / 2, 0, -D / 2)

    H = { plan: P, root, levels, floors, roofs, hm, rooms: P.rooms, backyardRoom, yardStaging, rng }
    // shadow camera fits the lot
    const ext = Math.max(P.totalW + 4, D + P.yardD + P.frontY) * 0.62
    Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 160 })
    sun.shadow.camera.updateProjectionMatrix()
    buildPins()
    setStaging(stagingOn)
    setLight(lightMode)
    return H
  }

  // ---------- pins ----------
  let pins = []
  function buildPins() {
    pinsEl.innerHTML = ''
    const P = H.plan
    const chosen = []
    for (const lv of P.levels) {
      const rs = P.rooms.filter(r => r.level === lv)
      const seen = new Set()
      for (const ty of PIN_TYPES) {
        const r = rs.find(x => x.type === ty && (!x.unit || x.unit === rs.find(y => y.unit)?.unit))
        if (r && !seen.has(ty)) { chosen.push(r); seen.add(ty) }
      }
      if (!seen.has('pbath')) { const b = rs.find(x => x.type === 'bath'); if (b) chosen.push(b) }
      if (!seen.has('primary')) { const b = rs.find(x => x.type === 'bed'); if (b) chosen.push(b) }
    }
    chosen.push(H.backyardRoom)
    pins = chosen.map(r => {
      const b = document.createElement('button')
      b.type = 'button'; b.className = 'pin'; b.dataset.room = r.id
      b.innerHTML = '<span class="pin-dot"></span><span class="pin-label"></span>'
      b.addEventListener('click', () => goRoom(r.id))
      pinsEl.appendChild(b)
      const y = r.outdoor ? 1.2 : r.level * FH + 2.2
      const z = r.outdoor ? -2.6 : (r.z[0] + r.z[1]) / 2
      const x = r.outdoor ? H.plan.W * 0.75 : (r.x[0] + r.x[1]) / 2
      return { el: b, anchor: new THREE.Vector3(x, y, z), room: r }
    })
    labelPins()
  }
  const label = r => r.type === 'backyard' ? namedLabel('backyard', getLang()) : roomLabel(r, getLang())
  function labelPins() { pins.forEach(p => { p.el.querySelector('.pin-label').textContent = label(p.room) }) }
  onLang(() => { if (H) { labelPins(); if (measured) showMeasure(measured) } })

  // ---------- measure ----------
  const outline = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xe0b44c, depthTest: false }))
  outline.renderOrder = 10; outline.visible = false; world.add(outline)
  let hovered = null
  function highlight(f) {
    if (hovered === f) return
    if (hovered && hovered.material.emissive) hovered.material.emissive.setHex(0x000000)
    hovered = f
    if (f && f.material.emissive) { f.material.emissive.setHex(0x3a2a08); f.material.emissiveIntensity = 0.5 }
  }
  function fmtFt(m) { const totalIn = Math.round(m * 39.3701); const ft = Math.floor(totalIn / 12), inch = totalIn % 12; return inch ? `${ft}' ${inch}"` : `${ft}'` }
  let measured = null
  function showMeasure(r) {
    if (!r || !H) { measureEl.hidden = true; outline.visible = false; measured = null; return }
    measured = r
    const w = r.x[1] - r.x[0], d = r.z[1] - r.z[0], y = (r.level || 0) * FH + 0.07
    outline.geometry.setFromPoints([new THREE.Vector3(r.x[0], y, r.z[0]), new THREE.Vector3(r.x[1], y, r.z[0]), new THREE.Vector3(r.x[1], y, r.z[1]), new THREE.Vector3(r.x[0], y, r.z[1])])
    outline.visible = true
    measureEl.hidden = false
    measureEl.querySelector('#mName').textContent = label(r)
    const sqft = Math.round(w * d * 10.7639)
    if (getLang() === 'es') {
      measureEl.querySelector('#mDims').textContent = `${w.toFixed(1)} m x ${d.toFixed(1)} m`
      measureEl.querySelector('#mArea').textContent = `${(w * d).toFixed(1)} m² · ${fmtFt(w)} x ${fmtFt(d)}`
    } else {
      measureEl.querySelector('#mDims').textContent = `${fmtFt(w)} x ${fmtFt(d)}`
      measureEl.querySelector('#mArea').textContent = `${sqft.toLocaleString()} sq ft · ${w.toFixed(1)} x ${d.toFixed(1)} m`
    }
  }

  // ---------- camera modes ----------
  let mode = 'overview', anim = null, curFloor = 0
  const worldPt = (x, y, z) => new THREE.Vector3(x, y, z).add(world.position)
  function fitView(dir, cx, cy, cz, radiusW, radiusH, uiShift = 0) {
    const vf = THREE.MathUtils.degToRad(camera.fov) / 2
    const hf = Math.atan(Math.tan(vf) * camera.aspect)
    const dist = Math.max(radiusW / Math.tan(hf), radiusH / Math.tan(vf)) * 1.22
    const d = dir.clone().normalize()
    const target = worldPt(cx, cy, cz)
    // shift the framing so the house sits in the free area between the top bar and the bottom controls
    if (uiShift) {
      const right = new THREE.Vector3().crossVectors(d.clone().negate(), new THREE.Vector3(0, 1, 0)).normalize()
      const up = new THREE.Vector3().crossVectors(right, d.clone().negate()).normalize()
      target.addScaledVector(up, -uiShift * dist * Math.tan(vf))
    }
    return { pos: target.clone().addScaledVector(d, dist), target }
  }
  function overviewView() {
    const P = H.plan
    const portrait = camera.aspect < 0.9
    const cx = P.totalW / 2, cz = (D_() - P.yardD * 0.45) / 2 + 0.6
    const rW = Math.max(P.totalW + 2, 10) * 0.5, rH = (P.D + P.yardD * 0.6) * 0.42 + 2
    const ui = stage.clientWidth < 760 ? 0.12 : 0.06
    return fitView(new THREE.Vector3(0.55, portrait ? 1.25 : 0.95, 1.0), cx, curFloor * FH, cz, rW, rH, ui)
  }
  const D_ = () => H.plan.D
  function exteriorView() {
    const P = H.plan
    const top = P.stories * FH + (P.style.roof === 'gable' ? 3 : P.style.roof === 'hip' ? 1.5 : 0.6)
    const ui = stage.clientWidth < 760 ? 0.18 : 0.04
    return fitView(new THREE.Vector3(0.42, 0.2, 1.0), P.totalW / 2, top * 0.42, P.D * 0.7, Math.max(P.totalW, 9) * 0.64, top * 0.72 + 1.6, ui)
  }
  function roomView(r) {
    const base = r.level * FH
    if (r.outdoor) {
      const P = H.plan
      return { pos: worldPt(P.totalW + 0.6, 2.4, -P.yardD + 0.8), target: worldPt(P.W * 0.45, 0.7, -1.8) }
    }
    const w = r.x[1] - r.x[0], d = r.z[1] - r.z[0]
    const loc = (u, v) => { const [x, z] = r.win === 's' ? [r.x[1] - u, r.z[1] - v] : [r.x[0] + u, r.z[0] + v]; return [x, z] }
    const small = w < 2.4
    const openPlan = !H.plan.multi && ['living', 'kitchen', 'dining'].includes(r.type)
    const [px, pz] = openPlan ? loc(w * 0.3, d + 0.6) : loc(small ? w / 2 : Math.min(0.55, w * 0.18), Math.max(0.5, d - 0.4))
    const [tx, tz] = loc(small ? w / 2 : w - Math.min(0.9, w * 0.25), Math.min(0.7, d * 0.25))
    return { pos: worldPt(px, base + (openPlan ? 1.75 : 1.62), pz), target: worldPt(tx, base + 0.85, tz) }
  }
  function flyTo(pos, target, dur = 1300, done) {
    anim = { from: camera.position.clone(), to: pos.clone(), tf: controls.target.clone(), tt: target.clone(), t0: performance.now(), dur, done }
    controls.enabled = false
  }
  function applyFloorVisibility() {
    if (!H) return
    for (const L of H.levels) {
      if (mode === 'exterior' || mode === 'walk') { L.group.visible = true; L.target = 1; continue }
      if (mode === 'room') { L.group.visible = L.lv <= curFloor; L.target = 1; continue }
      L.group.visible = L.lv <= curFloor
      L.target = L.lv < curFloor ? 1 : CUT
    }
    H.roofs.visible = mode === 'exterior'
    H.yardStaging.visible = stagingOn
  }
  function findRoom(id) { return id === 'backyard' ? H.backyardRoom : H.rooms.find(r => r.id === id) }
  function goRoom(id) {
    if (!H) return
    exitWalk(false)
    opts.onRoom && opts.onRoom(id)
    if (id === 'overview' || id === 'exterior') {
      mode = id; showMeasure(null)
      applyFloorVisibility()
      controls.minDistance = 6; controls.maxDistance = 90; controls.maxPolarAngle = id === 'exterior' ? 1.5 : 1.38
      const v = id === 'overview' ? overviewView() : exteriorView()
      flyTo(v.pos, v.target)
      return
    }
    const r = findRoom(id); if (!r) return
    mode = 'room'
    if (!r.outdoor && r.level !== curFloor) { curFloor = r.level; opts.onFloor && opts.onFloor(curFloor) }
    applyFloorVisibility()
    const v = roomView(r)
    flyTo(v.pos, v.target, 1500, () => {
      const look = v.target.clone().sub(v.pos).normalize()
      controls.target.copy(v.pos.clone().add(look.multiplyScalar(0.6)))
      controls.minDistance = 0.3; controls.maxDistance = 0.9; controls.maxPolarAngle = Math.PI - 0.2
      controls.update()
    })
    showMeasure(r)
  }
  function setFloor(f) {
    if (!H) return
    curFloor = Math.max(0, Math.min(H.plan.stories - 1, f))
    opts.onFloor && opts.onFloor(curFloor)
    if (mode !== 'overview') goRoom('overview')
    else { applyFloorVisibility(); const v = overviewView(); flyTo(v.pos, v.target, 900) }
  }

  // ---------- walk mode ----------
  let walking = false, yaw = 0, pitch = 0, walkLevel = 0
  const keys = {}
  const pad = { f: 0, b: 0, l: 0, r: 0 }
  function enterWalk() {
    if (!H) return
    walking = true; mode = 'walk'; anim = null
    controls.enabled = false
    applyFloorVisibility()
    const P = H.plan
    const inside = camera.position.y - world.position.y
    const inRoom = inside > 1.0 && inside < FH * P.stories && Math.abs(((inside) % FH) - 1.62) < 0.3
    let p
    if (inRoom) { p = camera.position.clone(); walkLevel = Math.floor(inside / FH) }
    else {
      walkLevel = curFloor
      const entry = P.rooms.find(r => r.type === 'entry' && r.level === walkLevel)
      const hall = P.rooms.find(r => r.type === 'hall' && r.level === walkLevel)
      if (entry) { p = worldPt((entry.x[0] + entry.x[1]) / 2, 0, P.D - 0.9); yaw = 0 }
      else { p = worldPt(0.9, 0, (hall.z[0] + hall.z[1]) / 2); yaw = -Math.PI / 2 }
    }
    p.y = walkLevel * FH + 1.62 + world.position.y; camera.position.copy(p)
    if (inRoom) { const dir = new THREE.Vector3(); camera.getWorldDirection(dir); yaw = Math.atan2(-dir.x, -dir.z) }
    pitch = 0
    padEl.hidden = false; hintEl.hidden = false
    stage.classList.add('walking'); opts.onWalk && opts.onWalk(true)
    showMeasure(null)
  }
  function exitWalk(fly = true) {
    if (!walking) return
    walking = false; padEl.hidden = true; hintEl.hidden = true
    stage.classList.remove('walking'); opts.onWalk && opts.onWalk(false)
    if (fly) goRoom('overview')
  }
  window.addEventListener('keydown', e => {
    if (!walking) return
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault()
    keys[e.key.toLowerCase()] = true
    if (e.key === 'Escape') exitWalk()
  })
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false })
  padEl.querySelectorAll('[data-move]').forEach(b => {
    const k = b.dataset.move
    const on = e => { e.preventDefault(); pad[k] = 1 }, off = () => { pad[k] = 0 }
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off)
  })
  function collide(p) {
    const r = 0.28, P = H.plan
    let x = p.x - world.position.x, z = p.z - world.position.z
    const boxes = H.levels[walkLevel].boxes
    for (const w of boxes) {
      const cx = Math.max(w.x1, Math.min(x, w.x2)), cz = Math.max(w.z1, Math.min(z, w.z2))
      const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz
      if (d2 < r * r) {
        if (d2 > 1e-6) { const d = Math.sqrt(d2); x = cx + dx / d * r; z = cz + dz / d * r }
        else {
          const pushes = [[w.x1 - r - x, 0], [w.x2 + r - x, 0], [0, w.z1 - r - z], [0, w.z2 + r - z]]
          pushes.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1])); x += pushes[0][0]; z += pushes[0][1]
        }
      }
    }
    if (walkLevel > 0) { x = Math.max(0.3, Math.min(P.W - 0.3, x)); z = Math.max(0.3, Math.min(P.D - 0.3, z)) }
    else { x = Math.max(-1.0, Math.min(P.totalW + 1.0, x)); z = Math.max(-P.yardD + 0.3, Math.min(P.D + P.frontY, z)) }
    p.x = x + world.position.x; p.z = z + world.position.z
  }

  // ---------- pointer ----------
  const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2()
  let down = null, dragging = false
  canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; dragging = walking; if (walking) canvas.setPointerCapture(e.pointerId) })
  canvas.addEventListener('pointermove', e => {
    if (walking && dragging && down) {
      yaw -= (e.clientX - down.x) * 0.0045; pitch -= (e.clientY - down.y) * 0.0035
      pitch = Math.max(-1.1, Math.min(1.1, pitch)); down = { x: e.clientX, y: e.clientY }
      return
    }
    if (e.pointerType === 'mouse' && !walking) pick(e, false)
  })
  canvas.addEventListener('pointerup', e => {
    if (!walking && down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) pick(e, true)
    down = null; dragging = false
  })
  canvas.addEventListener('pointerleave', () => highlight(null))
  function visibleChain(o) { while (o) { if (!o.visible) return false; o = o.parent } return true }
  function pick(e, click) {
    if (!H || mode === 'exterior') return
    const rect = canvas.getBoundingClientRect()
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const hit = ray.intersectObjects(H.floors.filter(f => visibleChain(f.parent)), false)[0]
    const f = hit ? hit.object : null
    highlight(f && !f.userData.room.outdoor ? f : null)
    canvas.style.cursor = f ? 'pointer' : ''
    if (click) showMeasure(f ? f.userData.room : null)
  }

  // ---------- staging ----------
  let stagingOn = true
  function setStaging(on) { stagingOn = on; if (H) { H.levels.forEach(L => { L.staging.visible = on }); H.yardStaging.visible = on } }

  // ---------- loop ----------
  let visible = false, raf = 0
  const clock = new THREE.Clock()
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight
    renderer.setSize(w, h, false); camera.aspect = w / h
    camera.fov = w < 640 ? 60 : 46
    camera.updateProjectionMatrix()
  }
  new ResizeObserver(resize).observe(stage)
  resize()

  const tmp = new THREE.Vector3()
  function frame() {
    raf = requestAnimationFrame(frame)
    const rect = stage.getBoundingClientRect()
    const nowVisible = rect.bottom > 0 && rect.top < innerHeight && !document.hidden
    if (nowVisible && !visible) clock.getDelta()
    visible = nowVisible
    if (!visible || !H) return
    const dt = Math.min(clock.getDelta(), 0.05)
    if (anim) {
      const k = Math.min(1, (performance.now() - anim.t0) / anim.dur)
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
      camera.position.lerpVectors(anim.from, anim.to, e)
      controls.target.lerpVectors(anim.tf, anim.tt, e)
      camera.lookAt(controls.target)
      if (k >= 1) { const d = anim.done; anim = null; controls.enabled = true; d && d() }
    } else if (walking) {
      const fw = (keys.w || keys.arrowup || pad.f ? 1 : 0) - (keys.s || keys.arrowdown || pad.b ? 1 : 0)
      const st = (keys.d || pad.r ? 1 : 0) - (keys.a || pad.l ? 1 : 0)
      const turn = (keys.arrowleft ? 1 : 0) - (keys.arrowright ? 1 : 0)
      yaw += turn * dt * 1.8
      const sp = 2.1 * dt
      const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), r = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw))
      camera.position.addScaledVector(f, fw * sp).addScaledVector(r, st * sp)
      collide(camera.position)
      camera.rotation.set(pitch, yaw, 0, 'YXZ')
    } else {
      controls.update()
    }
    for (const L of H.levels) {
      L.scale += (L.target - L.scale) * Math.min(1, dt * 5)
      L.walls.scale.y = L.scale
      L.ceilings.visible = mode === 'room' || mode === 'walk'
    }
    sun.target.position.copy(world.position).add(new THREE.Vector3(H.plan.totalW / 2, 0, H.plan.D / 2))
    sun.position.copy(PRESETS[lightMode].sun.reduce((v, c, i) => (v.setComponent(i, c), v), new THREE.Vector3())).add(sun.target.position)
    const showPins = mode === 'overview' && !anim
    const w = stage.clientWidth, h = stage.clientHeight
    for (const p of pins) {
      tmp.copy(p.anchor).add(world.position).project(camera)
      const lvOk = p.room.outdoor || p.room.level === curFloor
      const vis = showPins && lvOk && tmp.z < 1
      p.el.style.opacity = vis ? '1' : '0'; p.el.style.pointerEvents = vis ? 'auto' : 'none'
      p.el.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * w}px, ${(-tmp.y * 0.5 + 0.5) * h}px)`
    }
    renderer.render(scene, camera)
  }
  frame()

  function load(listing, { first = false } = {}) {
    exitWalk(false)
    showMeasure(null); highlight(null)
    disposeHouse()
    curFloor = 0
    build(listing)
    mode = 'overview'
    applyFloorVisibility()
    H.levels.forEach(L => { L.scale = L.target; L.walls.scale.y = L.scale })
    const v = overviewView()
    if (first) { camera.position.copy(v.pos).add(new THREE.Vector3(10, 8, 6)); controls.target.copy(v.target) }
    controls.minDistance = 6; controls.maxDistance = 90; controls.maxPolarAngle = 1.38
    flyTo(v.pos, v.target, first ? 1800 : 1100)
    opts.onRoom && opts.onRoom('overview')
    opts.onFloor && opts.onFloor(0)
    loadingEl && loadingEl.classList.add('done')
    return H.plan
  }

  return {
    load,
    goRoom,
    setFloor,
    setLight,
    setStaging,
    toggleWalk() { walking ? exitWalk() : enterWalk(); return walking },
    roomList() {
      if (!H) return []
      const out = [{ id: 'overview', label: namedLabel('overview', getLang()) }, { id: 'exterior', label: namedLabel('exterior', getLang()) }]
      for (const r of H.rooms) if (!['hall', 'stair', 'entry'].includes(r.type)) out.push({ id: r.id, label: roomLabel(r, getLang()) + (H.plan.stories > 1 && !H.plan.multi ? (r.level ? ' · 2F' : '') : '') })
      out.push({ id: 'backyard', label: namedLabel('backyard', getLang()) })
      return out
    },
    get plan() { return H && H.plan },
    get walking() { return walking },
    get camera() { return camera },
    get lightMode() { return lightMode },
    get floor() { return curFloor },
    dispose() { cancelAnimationFrame(raf); disposeHouse(); renderer.dispose() },
  }
}
