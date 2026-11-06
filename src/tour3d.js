// Procedural 3D tour of a single-story El Paso home.
// Dollhouse cutaway, room fly-to, walk mode, lighting presets, virtual staging and room measure.
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { t, getLang, onLang } from './i18n.js'

const H_INT = 2.8
const H_EXT = 3.3
const CUT = 0.6

// Floor plan in meters. x grows east, z grows toward the street (south). Backyard is z < 0.
const ROOMS = {
  living:   { x: [0, 7],    z: [0, 6],   floor: 'oak',  key: 'room.living',   view: { pos: [6.3, 1.62, 5.5], target: [1.6, 1.0, 1.0] } },
  kitchen:  { x: [7, 12],   z: [0, 6],   floor: 'oak',  key: 'room.kitchen',  view: { pos: [7.4, 1.62, 5.6], target: [10.6, 0.9, 1.0] } },
  bedroom:  { x: [12, 17],  z: [0, 5.5], floor: 'oakD', key: 'room.bedroom',  view: { pos: [12.5, 1.62, 0.5], target: [16.4, 0.7, 3.4] } },
  bath:     { x: [12, 17],  z: [5.5, 9], floor: 'tile', key: 'room.bath',     view: { pos: [12.6, 1.62, 5.9], target: [16.2, 0.8, 8.0] } },
  entry:    { x: [7, 9.5],  z: [6, 9],   floor: 'oak',  key: 'room.entry' },
  flex:     { x: [9.5, 12], z: [6, 9],   floor: 'oakD', key: 'room.flex' },
  courtyard:{ x: [0, 7],    z: [6, 11],  floor: 'saltillo', key: 'room.courtyard', outdoor: true },
  backyard: { x: [-1, 18],  z: [-9, 0],  floor: 'gravel', key: 'room.backyard', outdoor: true, view: { pos: [16.4, 2.3, -8.2], target: [6.5, 0.6, -2.2] } },
}
const PIN_ROOMS = ['living', 'kitchen', 'bedroom', 'bath', 'backyard']
const OFFSET = new THREE.Vector3(-8.5, 0, -1)

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
  world.position.copy(OFFSET)
  scene.add(world)

  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.maxPolarAngle = 1.38
  controls.screenSpacePanning = false

  // ---------- textures ----------
  const texCache = {}
  function canvasTex(name, size, draw, repeat = 1) {
    if (texCache[name]) return texCache[name]
    const c = document.createElement('canvas'); c.width = c.height = size
    const g = c.getContext('2d'); draw(g, size)
    const tx = new THREE.CanvasTexture(c)
    tx.colorSpace = THREE.SRGBColorSpace
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping
    tx.anisotropy = 4
    tx.repeat.set(repeat, repeat)
    texCache[name] = tx
    return tx
  }
  const rnd = (a, b) => a + Math.random() * (b - a)
  function noise(g, s, base, amt, n = 9000, r = 1.2) {
    g.fillStyle = base; g.fillRect(0, 0, s, s)
    for (let i = 0; i < n; i++) {
      const v = Math.floor(rnd(-amt, amt))
      g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 255})`
      g.fillRect(Math.random() * s, Math.random() * s, r, r)
    }
  }
  const T = {
    oak: () => canvasTex('oak', 512, (g, s) => {
      const rows = 8, h = s / rows
      for (let r = 0; r < rows; r++) {
        let x = -Math.random() * s
        while (x < s) {
          const w = rnd(s * 0.35, s * 0.7)
          const l = rnd(58, 68)
          g.fillStyle = `hsl(32, 38%, ${l}%)`; g.fillRect(x, r * h, w, h)
          for (let k = 0; k < 14; k++) { g.fillStyle = `hsla(30,35%,${l - rnd(6, 12)}%,0.25)`; g.fillRect(x, r * h + rnd(0, h), w, rnd(0.6, 1.6)) }
          g.fillStyle = 'rgba(60,40,20,0.35)'; g.fillRect(x, r * h, 1.5, h)
          x += w
        }
        g.fillStyle = 'rgba(60,40,20,0.35)'; g.fillRect(0, r * h, s, 1.2)
      }
    }),
    oakD: () => canvasTex('oakD', 512, (g, s) => {
      const rows = 8, h = s / rows
      for (let r = 0; r < rows; r++) {
        let x = -Math.random() * s
        while (x < s) {
          const w = rnd(s * 0.35, s * 0.7); const l = rnd(36, 44)
          g.fillStyle = `hsl(26, 30%, ${l}%)`; g.fillRect(x, r * h, w, h)
          for (let k = 0; k < 12; k++) { g.fillStyle = `hsla(24,30%,${l - 8}%,0.3)`; g.fillRect(x, r * h + rnd(0, h), w, 1) }
          g.fillStyle = 'rgba(20,10,5,0.4)'; g.fillRect(x, r * h, 1.5, h); x += w
        }
        g.fillStyle = 'rgba(20,10,5,0.4)'; g.fillRect(0, r * h, s, 1.2)
      }
    }),
    tile: () => canvasTex('tile', 256, (g, s) => {
      noise(g, s, '#d9d6d0', 14, 3000)
      g.strokeStyle = 'rgba(120,115,105,0.6)'; g.lineWidth = 2
      for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * s / 4, 0); g.lineTo(i * s / 4, s); g.stroke(); g.beginPath(); g.moveTo(0, i * s / 4); g.lineTo(s, i * s / 4); g.stroke() }
    }),
    saltillo: () => canvasTex('saltillo', 256, (g, s) => {
      const n = 4, q = s / n
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = `hsl(${rnd(14, 22)}, ${rnd(48, 58)}%, ${rnd(44, 52)}%)`; g.fillRect(i * q, j * q, q, q) }
      g.strokeStyle = '#d9c7ae'; g.lineWidth = 4
      for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * q, 0); g.lineTo(i * q, s); g.stroke(); g.beginPath(); g.moveTo(0, i * q); g.lineTo(s, i * q); g.stroke() }
    }),
    gravel: () => canvasTex('gravel', 512, (g, s) => {
      g.fillStyle = '#b9a48a'; g.fillRect(0, 0, s, s)
      for (let i = 0; i < 9000; i++) { g.fillStyle = `hsl(${rnd(20, 38)}, ${rnd(10, 30)}%, ${rnd(45, 78)}%)`; g.beginPath(); g.arc(Math.random() * s, Math.random() * s, rnd(0.8, 2.6), 0, 7); g.fill() }
    }),
    sand: () => canvasTex('sand', 512, (g, s) => noise(g, s, '#cdb594', 22, 16000, 1.6)),
    stucco: () => canvasTex('stucco', 256, (g, s) => noise(g, s, '#e2cdb0', 16, 9000, 1.4)),
    plaster: () => canvasTex('plaster', 256, (g, s) => noise(g, s, '#f1ece4', 6, 4000, 1.2)),
    concrete: () => canvasTex('concrete', 256, (g, s) => { noise(g, s, '#c9c3ba', 14, 7000); g.strokeStyle = 'rgba(90,85,80,.35)'; g.lineWidth = 2; g.strokeRect(0, 0, s, s) }),
    asphalt: () => canvasTex('asphalt', 256, (g, s) => noise(g, s, '#3a3836', 24, 12000)),
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
  function texFor(kind, w, d) {
    const base = T[kind]()
    const tx = base.clone(); tx.needsUpdate = true
    const scale = { oak: 3.2, oakD: 3.2, tile: 2.4, saltillo: 1.6, gravel: 3, sand: 6, concrete: 2.5 }[kind] || 3
    tx.repeat.set(w / scale, d / scale)
    return tx
  }

  // ---------- materials ----------
  const M = {
    stucco: new THREE.MeshStandardMaterial({ map: T.stucco(), roughness: 0.95 }),
    plaster: new THREE.MeshStandardMaterial({ map: T.plaster(), roughness: 0.9 }),
    coping: new THREE.MeshStandardMaterial({ color: 0xa8875f, roughness: 0.85 }),
    block: new THREE.MeshStandardMaterial({ color: 0xc7ab86, roughness: 0.95 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x2a241e, roughness: 0.5, metalness: 0.4 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fc4d6, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.22, emissive: 0x000000, depthWrite: false }),
    slab: new THREE.MeshStandardMaterial({ color: 0x8d8478, roughness: 0.9 }),
    ceiling: new THREE.MeshStandardMaterial({ color: 0xf4f0ea, roughness: 1, side: THREE.FrontSide, emissive: 0xd8d0c2, emissiveIntensity: 0.32 }),
    quartz: new THREE.MeshStandardMaterial({ color: 0xf2efea, roughness: 0.25 }),
    cabinet: new THREE.MeshStandardMaterial({ color: 0x2f3a36, roughness: 0.6 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xc9c9c9, roughness: 0.25, metalness: 0.85 }),
    black: new THREE.MeshStandardMaterial({ color: 0x1d1c1a, roughness: 0.55, metalness: 0.3 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb8954a, roughness: 0.3, metalness: 0.9 }),
    porcelain: new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.15 }),
    fabric: new THREE.MeshStandardMaterial({ color: 0xd8cfc2, roughness: 1 }),
    fabricDark: new THREE.MeshStandardMaterial({ color: 0x48443e, roughness: 1 }),
    leather: new THREE.MeshStandardMaterial({ color: 0x8a4f2a, roughness: 0.6 }),
    walnut: new THREE.MeshStandardMaterial({ color: 0x5a3f2c, roughness: 0.55 }),
    oakWood: new THREE.MeshStandardMaterial({ color: 0xb38a5e, roughness: 0.6 }),
    linen: new THREE.MeshStandardMaterial({ color: 0xf3efe7, roughness: 1 }),
    duvet: new THREE.MeshStandardMaterial({ color: 0xc8b79a, roughness: 1 }),
    pot: new THREE.MeshStandardMaterial({ color: 0xb5603b, roughness: 0.9 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x55703f, roughness: 0.9 }),
    agave: new THREE.MeshStandardMaterial({ color: 0x7c9a83, roughness: 0.8 }),
    cactus: new THREE.MeshStandardMaterial({ color: 0x4f7a49, roughness: 0.8 }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x6b5442, roughness: 1 }),
    water: new THREE.MeshStandardMaterial({ color: 0x2aa3c4, roughness: 0.08, metalness: 0.15, emissive: 0x000000 }),
    stone: new THREE.MeshStandardMaterial({ color: 0xe6dccb, roughness: 0.8 }),
    shade: new THREE.MeshStandardMaterial({ color: 0xf1e6cf, roughness: 0.9, emissive: 0x000000 }),
    bulb: new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0x000000 }),
    door: new THREE.MeshStandardMaterial({ color: 0x6e4a2e, roughness: 0.55 }),
    sidewalk: new THREE.MeshStandardMaterial({ map: texFor('concrete', 60, 2), roughness: 0.9 }),
    mountain: new THREE.MeshStandardMaterial({ color: 0x8c7b74, roughness: 1, flatShading: true }),
  }
  const nightGlow = [] // [material, color, intensity]
  nightGlow.push([M.shade, 0xffc27a, 0.9], [M.bulb, 0xffd59a, 2.5], [M.water, 0x0f6f8c, 0.9])

  // ---------- helpers ----------
  const wallBoxes = []
  const wallsGroup = new THREE.Group(); world.add(wallsGroup)
  const staging = new THREE.Group(); world.add(staging)
  const ceilings = new THREE.Group(); world.add(ceilings)
  const floors = []

  function box(parent, mat, x1, y1, z1, x2, y2, z2, { cast = true, receive = true } = {}) {
    const w = Math.abs(x2 - x1), h = Math.abs(y2 - y1), d = Math.abs(z2 - z1)
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2)
    m.castShadow = cast; m.receiveShadow = receive
    parent.add(m); return m
  }
  function cyl(parent, mat, x, y, z, rt, rb, h, seg = 16) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat)
    m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true
    parent.add(m); return m
  }

  // Wall along X (fixed z) or along Z (fixed x). Openings in local coordinate along the wall.
  function wall(axis, fixed, a, b, h, th, mat, openings = [], { collide = true, coping = false } = {}) {
    const seg = (s, e, y1, y2) => {
      if (e - s < 0.01 || y2 - y1 < 0.01) return
      const m = axis === 'x'
        ? box(wallsGroup, mat, s, y1, fixed - th / 2, e, y2, fixed + th / 2)
        : box(wallsGroup, mat, fixed - th / 2, y1, s, fixed + th / 2, y2, e)
      if (collide && y1 < 0.5) wallBoxes.push(axis === 'x' ? { x1: s, x2: e, z1: fixed - th / 2, z2: fixed + th / 2 } : { x1: fixed - th / 2, x2: fixed + th / 2, z1: s, z2: e })
      return m
    }
    const ops = [...openings].sort((p, q) => p.a - q.a)
    let cur = a
    for (const o of ops) {
      seg(cur, o.a, 0, h)
      const head = o.head ?? 2.2
      seg(o.a, o.b, head, h)
      if (o.type === 'window') {
        seg(o.a, o.b, 0, o.sill ?? 0.9)
        pane(axis, fixed, o.a, o.b, o.sill ?? 0.9, head)
      } else if (o.type === 'glass') {
        pane(axis, fixed, o.a, (o.a + o.b) / 2 + 0.05, 0.02, head)
        frameLine(axis, fixed, o.a, o.b, head)
      } else if (o.type === 'door' && o.leaf) {
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(o.b - o.a, head - 0.02, 0.05), M.door)
        leaf.castShadow = true
        const g = new THREE.Group()
        if (axis === 'x') { g.position.set(o.a, 0, fixed); leaf.position.set((o.b - o.a) / 2, head / 2, 0) }
        else { g.position.set(fixed, 0, o.a); g.rotation.y = -Math.PI / 2; leaf.position.set((o.b - o.a) / 2, head / 2, 0) }
        g.add(leaf); g.rotation.y += o.leaf
        wallsGroup.add(g)
      }
      cur = o.b
    }
    seg(cur, b, 0, h)
    if (coping) {
      const c = 0.06
      if (axis === 'x') box(wallsGroup, M.coping, a - c, h, fixed - th / 2 - c, b + c, h + 0.08, fixed + th / 2 + c)
      else box(wallsGroup, M.coping, fixed - th / 2 - c, h, a - c, fixed + th / 2 + c, h + 0.08, b + c)
    }
  }
  function pane(axis, fixed, a, b, y1, y2) {
    const g = axis === 'x'
      ? box(wallsGroup, M.glass, a, y1, fixed - 0.015, b, y2, fixed + 0.015, { cast: false, receive: false })
      : box(wallsGroup, M.glass, fixed - 0.015, y1, a, fixed + 0.015, y2, b, { cast: false, receive: false })
    g.renderOrder = 2
    const f = 0.05
    const fr = (s, e, u1, u2) => axis === 'x' ? box(wallsGroup, M.frame, s, u1, fixed - 0.04, e, u2, fixed + 0.04) : box(wallsGroup, M.frame, fixed - 0.04, u1, s, fixed + 0.04, u2, e)
    fr(a, b, y1, y1 + f); fr(a, b, y2 - f, y2); fr(a, a + f, y1, y2); fr(b - f, b, y1, y2)
  }
  function frameLine(axis, fixed, a, b, head) {
    const fr = (s, e, u1, u2) => axis === 'x' ? box(wallsGroup, M.frame, s, u1, fixed - 0.04, e, u2, fixed + 0.04) : box(wallsGroup, M.frame, fixed - 0.04, u1, s, fixed + 0.04, u2, e)
    fr(a, b, head - 0.05, head); fr(a, a + 0.05, 0, head); fr(b - 0.05, b, 0, head); fr((a + b) / 2, (a + b) / 2 + 0.05, 0, head)
  }

  // ---------- environment ----------
  const skyUniforms = { top: { value: new THREE.Color(0x4a86c8) }, horizon: { value: new THREE.Color(0xcfe3f5) }, bottom: { value: new THREE.Color(0xd9c5a6) } }
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
    uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(min(h*2.2,1.0),0.7)) : mix(horizon, bottom, min(-h*6.0,1.0)); gl_FragColor = vec4(c,1.0); }',
  }))
  scene.add(sky)
  scene.fog = new THREE.Fog(0xcfe3f5, 70, 260)

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ map: texFor('sand', 500, 500), roughness: 1 }))
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; ground.position.y = -0.01
  scene.add(ground)

  // Franklin-style mountain ridge to the north and west
  const ridge = new THREE.Group(); scene.add(ridge)
  const peaks = [[-120, -150, 60, 34], [-60, -170, 75, 46], [0, -185, 70, 40], [60, -170, 85, 52], [130, -160, 60, 30], [-170, -90, 50, 26], [190, -110, 55, 24]]
  for (const [x, z, r, h] of peaks) {
    const g = new THREE.ConeGeometry(r, h, 7, 1); const m = new THREE.Mesh(g, M.mountain)
    m.position.set(x, h / 2 - 2, z); m.rotation.y = Math.random() * 3; m.scale.z = 0.6; ridge.add(m)
  }

  // street, sidewalk, driveway
  box(world, new THREE.MeshStandardMaterial({ map: texFor('asphalt', 120, 7), roughness: 1 }), -50, -0.005, 14, 70, 0.01, 21, { cast: false })
  box(world, M.sidewalk, -50, 0, 12.2, 70, 0.04, 13.8, { cast: false })
  box(world, new THREE.MeshStandardMaterial({ map: texFor('concrete', 4, 5), roughness: 0.9 }), 8.2, 0, 9.05, 12.2, 0.03, 12.2, { cast: false })
  // stripes
  for (let x = -48; x < 70; x += 6) box(world, new THREE.MeshStandardMaterial({ color: 0xe8d68a }), x, 0.011, 17.4, x + 3, 0.014, 17.6, { cast: false })

  // ---------- house shell ----------
  box(world, M.slab, -0.1, -0.3, -0.1, 17.1, 0.02, 9.1, { cast: false })
  for (const [id, r] of Object.entries(ROOMS)) {
    const w = r.x[1] - r.x[0], d = r.z[1] - r.z[0]
    const mat = new THREE.MeshStandardMaterial({ map: texFor(r.floor, w, d), roughness: r.floor === 'tile' ? 0.35 : 0.75, emissive: 0x000000 })
    const f = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat)
    f.rotation.x = -Math.PI / 2
    f.position.set((r.x[0] + r.x[1]) / 2, r.outdoor ? 0.012 : 0.024, (r.z[0] + r.z[1]) / 2)
    f.receiveShadow = true; f.userData.room = id
    world.add(f); floors.push(f)
    if (!r.outdoor) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.ceiling)
      c.rotation.x = Math.PI / 2; c.position.set(f.position.x, H_INT, f.position.z)
      ceilings.add(c)
    }
  }

  // exterior walls (stucco, parapet height)
  const E = 0.24
  wall('x', 0, -E / 2, 17 + E / 2, H_EXT, E, M.stucco, [
    { a: 1.2, b: 5.6, type: 'glass', head: 2.45 },
    { a: 8.4, b: 10.6, type: 'window', sill: 1.05, head: 2.25 },
    { a: 13.6, b: 15.6, type: 'window', sill: 0.8, head: 2.25 },
  ], { coping: true })
  wall('z', 17, 0, 9, H_EXT, E, M.stucco, [
    { a: 1.6, b: 3.6, type: 'window', sill: 0.8, head: 2.25 },
    { a: 6.6, b: 7.6, type: 'window', sill: 1.6, head: 2.2 },
  ], { coping: true })
  wall('x', 9, 7, 17 + E / 2, H_EXT, E, M.stucco, [
    { a: 10.1, b: 11.5, type: 'window', sill: 0.9, head: 2.25 },
    { a: 14.6, b: 15.4, type: 'window', sill: 1.6, head: 2.2 },
  ], { coping: true })
  wall('z', 0, 0, 6, H_EXT, E, M.stucco, [{ a: 2, b: 4, type: 'window', sill: 0.8, head: 2.25 }], { coping: true })
  wall('x', 6, -E / 2, 7, H_EXT, E, M.stucco, [{ a: 1.6, b: 5.2, type: 'glass', head: 2.45 }], { coping: true })
  wall('z', 7, 6, 9, H_EXT, E, M.stucco, [{ a: 7.0, b: 8.0, type: 'door', head: 2.3, leaf: -1.2 }], { coping: true })

  // interior walls
  const I = 0.12
  wall('z', 12, 0, 5.5, H_INT, I, M.plaster, [{ a: 4.4, b: 5.3, type: 'door', head: 2.15 }])
  wall('x', 5.5, 12, 17, H_INT, I, M.plaster, [{ a: 12.5, b: 13.35, type: 'door', head: 2.15 }])
  wall('z', 12, 5.5, 9, H_INT, I, M.plaster)
  wall('z', 9.5, 6, 9, H_INT, I, M.plaster, [{ a: 6.35, b: 7.2, type: 'door', head: 2.15 }])
  wall('x', 6, 7, 12, H_INT, I, M.plaster, [{ a: 7.35, b: 9.1, type: 'door', head: 2.3 }])

  // courtyard walls (low) with gate
  const L = 0.3
  wall('z', 0, 6, 11, 1.35, L, M.stucco, [], { coping: true })
  wall('x', 11, -L / 2, 7 + L / 2, 1.35, L, M.stucco, [{ a: 2.8, b: 4.4, type: 'door', head: 1.35 }], { coping: true })
  wall('z', 7, 9, 11, 1.35, L, M.stucco, [], { coping: true })
  // backyard block walls
  wall('x', -9, -1, 18, 1.7, 0.2, M.block, [], { coping: true })
  wall('z', -1, -9, 0, 1.7, 0.2, M.block, [], { coping: true })
  wall('z', 18, -9, 0, 1.7, 0.2, M.block, [], { coping: true })

  // ---------- built-ins ----------
  // kitchen run
  box(world, M.cabinet, 7.25, 0, 0.13, 10.95, 0.88, 0.75)
  box(world, M.quartz, 7.22, 0.88, 0.12, 10.98, 0.93, 0.78)
  box(world, M.cabinet, 7.25, 1.55, 0.13, 8.3, 2.35, 0.48)
  box(world, M.cabinet, 10.7, 1.55, 0.13, 10.95, 2.35, 0.48)
  box(world, M.steel, 11.05, 0, 0.14, 11.88, 2.0, 0.85)
  box(world, M.steel, 9.1, 0.93, 0.25, 9.9, 0.95, 0.65)
  // island
  box(world, M.cabinet, 8.2, 0, 2.35, 10.7, 0.88, 3.25)
  box(world, M.quartz, 8.1, 0.88, 2.25, 10.8, 0.94, 3.55)
  // pendants
  for (const x of [8.7, 9.45, 10.2]) {
    cyl(world, M.black, x, 1.75, 2.85, 0.005, 0.005, 1.05, 6)
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), M.bulb); p.position.set(x, 1.7, 2.85); world.add(p)
  }
  // bath
  box(world, M.walnut, 13.8, 0.25, 8.42, 15.7, 0.85, 8.88)
  box(world, M.quartz, 13.75, 0.85, 8.38, 15.75, 0.9, 8.9)
  box(world, M.porcelain, 14.3, 0.9, 8.5, 14.8, 0.96, 8.8)
  box(world, M.porcelain, 15.0, 0.9, 8.5, 15.5, 0.96, 8.8)
  box(world, new THREE.MeshStandardMaterial({ color: 0xc9d6dc, roughness: 0.15, metalness: 0.15 }), 13.9, 1.2, 8.86, 15.6, 2.1, 8.89)
  box(world, M.porcelain, 15.3, 0, 5.75, 16.85, 0.58, 7.35)
  box(world, M.water, 15.42, 0.5, 5.87, 16.73, 0.55, 7.23, { cast: false })
  box(world, M.porcelain, 16.35, 0, 7.75, 16.85, 0.42, 8.2)
  box(world, M.porcelain, 16.7, 0.42, 7.75, 16.88, 0.8, 8.2)
  // front door stoop light and entry console
  box(world, M.walnut, 7.2, 0.7, 8.4, 8.7, 0.75, 8.85)
  box(world, M.walnut, 7.25, 0, 8.45, 7.3, 0.7, 8.8); box(world, M.walnut, 8.6, 0, 8.45, 8.65, 0.7, 8.8)

  // patio, pergola, pool
  box(world, new THREE.MeshStandardMaterial({ map: texFor('concrete', 8.4, 4.2), roughness: 0.85 }), 0.2, 0, -4.4, 8.6, 0.05, -0.12, { cast: false })
  for (const [x, z] of [[0.5, -4.1], [8.3, -4.1]]) box(world, M.walnut, x - 0.09, 0, z - 0.09, x + 0.09, 2.75, z + 0.09)
  box(world, M.walnut, 0.3, 2.75, -4.2, 8.5, 2.95, -4.0)
  box(world, M.walnut, 0.3, 2.75, -0.35, 8.5, 2.95, -0.15)
  for (let x = 0.5; x <= 8.4; x += 0.32) box(world, M.walnut, x, 2.95, -4.3, x + 0.07, 3.05, -0.1)
  for (let x = 0.7; x <= 8.2; x += 0.55) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), M.bulb); b.position.set(x, 2.6 - Math.sin((x - 0.7) / 7.5 * Math.PI) * 0.25, -2.2); world.add(b) }
  box(world, M.stone, 9.7, 0, -6.9, 15.9, 0.07, -2.6, { cast: false })
  box(world, M.water, 10.0, 0.071, -6.6, 15.6, 0.075, -2.9, { cast: false })
  box(world, M.stone, 8.6, 0, -2.6, 16.5, 0.05, -0.12, { cast: false })

  // ---------- plants ----------
  function agave(x, z, s = 1) {
    const g = new THREE.Group()
    for (let i = 0; i < 13; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.07 * s, 0.75 * s, 5), M.agave)
      const a = (i / 13) * Math.PI * 2, tilt = rnd(0.5, 1.1)
      c.position.set(Math.cos(a) * 0.12 * s, 0.32 * s, Math.sin(a) * 0.12 * s)
      c.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt); c.castShadow = true; g.add(c)
    }
    g.position.set(x, 0, z); world.add(g)
  }
  function barrel(x, z, s = 1) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.22 * s, 12, 10), M.cactus); m.scale.y = 1.25; m.position.set(x, 0.22 * s, z); m.castShadow = true; world.add(m) }
  function ocotillo(x, z) {
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.035, rnd(2.0, 2.9), 5), M.trunk)
      const a = Math.random() * 6.28, tilt = rnd(0.1, 0.35)
      c.position.set(x + Math.cos(a) * 0.25, 1.2, z + Math.sin(a) * 0.25); c.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt); c.castShadow = true; world.add(c)
    }
  }
  function tree(x, z, s = 1) {
    cyl(world, M.trunk, x, 0, z, 0.08 * s, 0.13 * s, 2.1 * s, 7)
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(rnd(0.8, 1.15) * s, 0), M.leaf)
      b.position.set(x + rnd(-0.7, 0.7) * s, (2.4 + rnd(0, 0.7)) * s, z + rnd(-0.7, 0.7) * s); b.castShadow = true; world.add(b)
    }
  }
  function potPlant(parent, x, z, s = 1) {
    cyl(parent, M.pot, x, 0, z, 0.2 * s, 0.15 * s, 0.4 * s, 12)
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35 * s, 1), M.leaf); b.position.set(x, 0.75 * s, z); b.castShadow = true; parent.add(b)
  }
  agave(1.2, 7.2); agave(5.9, 10.2, 0.8); barrel(0.8, 10.2); barrel(1.3, 10.4, 0.7); ocotillo(5.8, 7.0)
  tree(3.4, 8.4, 0.9)
  cyl(world, M.stone, 3.6, 0, 8.3 + 1.6, 0.55, 0.6, 0.45, 20)
  agave(-0.2, -8.2); agave(2, -8.3, 1.2); barrel(4.2, -8.4); barrel(4.7, -8.0, 0.8); ocotillo(17, -8.2); agave(17.2, -1, 0.9)
  tree(17.0, -5.0, 1.1); tree(-0.2, -5.6, 1)
  agave(13.4, 10.0); agave(16.4, 10.2, 0.8); barrel(15, 10.4); ocotillo(9.3, 10.6)
  for (const [x, z] of [[-3, 4], [20, 3], [21, 12], [-4, 13], [-6, -3]]) tree(x, z, rnd(0.8, 1.2))

  // ---------- staging (loose furniture) ----------
  function sofa(parent, x, z, w, rot, mat = M.fabric) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot
    box(g, M.black, -w / 2 + 0.05, 0, -0.4, -w / 2 + 0.1, 0.12, 0.4); box(g, M.black, w / 2 - 0.1, 0, -0.4, w / 2 - 0.05, 0.12, 0.4)
    box(g, mat, -w / 2, 0.12, -0.45, w / 2, 0.42, 0.45)
    box(g, mat, -w / 2, 0.42, 0.2, w / 2, 0.85, 0.45)
    box(g, mat, -w / 2, 0.42, -0.45, -w / 2 + 0.18, 0.62, 0.45); box(g, mat, w / 2 - 0.18, 0.42, -0.45, w / 2, 0.62, 0.45)
    const n = Math.max(1, Math.round(w / 0.9))
    for (let i = 0; i < n; i++) { const cw = (w - 0.36) / n; box(g, mat, -w / 2 + 0.18 + i * cw + 0.02, 0.42, -0.4, -w / 2 + 0.18 + (i + 1) * cw - 0.02, 0.52, 0.2) }
    parent.add(g); return g
  }
  function table(parent, x, z, w, d, h, top = M.oakWood, leg = M.black) {
    box(parent, top, x - w / 2, h - 0.04, z - d / 2, x + w / 2, h, z + d / 2)
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(parent, leg, x + sx * (w / 2 - 0.06) - 0.025, 0, z + sz * (d / 2 - 0.06) - 0.025, x + sx * (w / 2 - 0.06) + 0.025, h - 0.04, z + sz * (d / 2 - 0.06) + 0.025)
  }
  function chair(parent, x, z, rot, mat = M.walnut) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot
    box(g, mat, -0.22, 0.44, -0.22, 0.22, 0.48, 0.22)
    box(g, mat, -0.22, 0.48, 0.18, 0.22, 0.92, 0.22)
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
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, d), new THREE.MeshStandardMaterial({ map: T[kind](), roughness: 1 }))
    m.position.set(x, 0.03, z); m.receiveShadow = true; parent.add(m)
  }

  // living
  rug(staging, 3.5, 3.3, 3.6, 2.7, 'rug1')
  sofa(staging, 3.5, 4.55, 2.6, Math.PI)
  sofa(staging, 1.25, 3.1, 1.0, Math.PI / 2, M.leather)
  sofa(staging, 5.75, 3.1, 1.0, -Math.PI / 2, M.leather)
  table(staging, 3.5, 3.1, 1.3, 0.7, 0.4, M.walnut, M.walnut)
  cyl(staging, M.brass, 3.3, 0.4, 3.0, 0.08, 0.06, 0.14, 12)
  lamp(staging, 0.55, 5.4)
  potPlant(staging, 6.4, 0.6, 1.1); potPlant(staging, 0.6, 0.6, 0.9)
  box(staging, M.walnut, 0.15, 0, 1.0, 0.55, 0.6, 5.0)
  // dining
  table(staging, 9.4, 4.65, 1.9, 0.95, 0.76)
  for (const dx of [-0.6, 0, 0.6]) { chair(staging, 9.4 + dx, 4.0, Math.PI); chair(staging, 9.4 + dx, 5.3, 0) }
  for (const x of [8.7, 9.45, 10.2]) stool(staging, x, 3.85)
  potPlant(staging, 11.6, 5.5, 0.8)
  // bedroom
  rug(staging, 15.3, 2.75, 3.0, 2.6, 'rug2')
  box(staging, M.walnut, 16.78, 0, 1.6, 16.9, 1.25, 3.9)
  box(staging, M.walnut, 14.75, 0, 1.75, 16.8, 0.32, 3.75)
  box(staging, M.linen, 14.8, 0.32, 1.8, 16.75, 0.56, 3.7)
  box(staging, M.duvet, 14.75, 0.5, 1.78, 16.05, 0.6, 3.72)
  box(staging, M.linen, 16.25, 0.56, 1.95, 16.65, 0.72, 2.65); box(staging, M.linen, 16.25, 0.56, 2.85, 16.65, 0.72, 3.55)
  for (const z of [1.2, 4.3]) { box(staging, M.walnut, 16.3, 0, z - 0.25, 16.85, 0.55, z + 0.25); tableLamp(staging, 16.55, 0.55, z) }
  box(staging, M.oakWood, 12.12, 0, 0.6, 12.62, 0.85, 2.3)
  potPlant(staging, 12.5, 3.6, 0.8)
  // flex office
  table(staging, 10.7, 8.4, 1.4, 0.65, 0.75, M.oakWood)
  chair(staging, 10.7, 7.8, Math.PI, M.fabricDark)
  box(staging, M.walnut, 11.5, 0, 6.2, 11.88, 1.9, 7.6)
  // backyard
  sofa(staging, 3, -3.4, 2.2, 0, M.fabricDark)
  sofa(staging, 5.5, -2.2, 1.4, -Math.PI / 2, M.fabricDark)
  table(staging, 3.6, -2.2, 1.0, 0.6, 0.38, M.oakWood)
  cyl(staging, M.stone, 6.9, 0, -6.4, 0.6, 0.65, 0.35, 20)
  for (const x of [11, 12.4]) { const g = new THREE.Group(); g.position.set(x, 0, -1.3); box(g, M.linen, -0.32, 0.18, -0.95, 0.32, 0.32, 0.95); const back = box(g, M.linen, -0.32, 0.3, 0.55, 0.32, 0.38, 1.15); back.rotation.x = -0.7; back.position.y = 0.55; staging.add(g) }
  // courtyard bench
  box(staging, M.walnut, 0.3, 0.4, 7.4, 0.8, 0.46, 9.4); box(staging, M.black, 0.4, 0, 7.6, 0.7, 0.4, 7.7); box(staging, M.black, 0.4, 0, 9.1, 0.7, 0.4, 9.2)

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight(0xbcd7ff, 0xb89a74, 1.0); scene.add(hemi)
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.6)
  sun.castShadow = true
  sun.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048)
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 120 })
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03
  scene.add(sun); scene.add(sun.target)
  const interior = []
  for (const [x, z] of [[3.5, 3], [9.5, 3], [14.5, 2.7], [14.5, 7.2], [8.2, 7.5], [10.7, 7.5], [4.4, -2.2], [3.5, 8.5]]) {
    const p = new THREE.PointLight(0xffc98a, 0, 12, 1.6); p.position.set(x + OFFSET.x, 2.45, z + OFFSET.z); scene.add(p); interior.push(p)
  }
  const poolLight = new THREE.PointLight(0x55d6ff, 0, 7, 1.5); poolLight.position.set(12.8 + OFFSET.x, 0.4, -4.7 + OFFSET.z); scene.add(poolLight)

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
    interior.forEach(l => { l.intensity = p.inner }); poolLight.intensity = p.glow * 6
    for (const [m, c, k] of nightGlow) { m.emissive.setHex(c); m.emissiveIntensity = k * p.glow }
    M.ceiling.emissiveIntensity = 0.32 - p.glow * 0.22
    M.glass.emissive.setHex(0xffb766); M.glass.emissiveIntensity = p.glow * 0.55
    M.glass.opacity = 0.22 + p.glow * 0.25
  }
  setLight('day')

  // ---------- measure ----------
  const outline = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xe0b44c, linewidth: 2, depthTest: false }))
  outline.renderOrder = 10; outline.visible = false; world.add(outline)
  let hovered = null
  function highlight(f) {
    if (hovered === f) return
    if (hovered) hovered.material.emissive.setHex(0x000000)
    hovered = f
    if (f) { f.material.emissive.setHex(0x3a2a08); f.material.emissiveIntensity = 0.5 }
  }
  function fmtFt(m) { const totalIn = Math.round(m * 39.3701); const ft = Math.floor(totalIn / 12), inch = totalIn % 12; return inch ? `${ft}' ${inch}"` : `${ft}'` }
  let measuredRoom = null
  function showMeasure(id) {
    const r = ROOMS[id]; if (!r) { measureEl.hidden = true; outline.visible = false; measuredRoom = null; return }
    measuredRoom = id
    const w = r.x[1] - r.x[0], d = r.z[1] - r.z[0]
    const pts = [new THREE.Vector3(r.x[0], 0.06, r.z[0]), new THREE.Vector3(r.x[1], 0.06, r.z[0]), new THREE.Vector3(r.x[1], 0.06, r.z[1]), new THREE.Vector3(r.x[0], 0.06, r.z[1])]
    outline.geometry.setFromPoints(pts); outline.visible = true
    measureEl.hidden = false
    measureEl.querySelector('#mName').textContent = t(r.key)
    const sqft = Math.round(w * d * 10.7639)
    if (getLang() === 'es') {
      measureEl.querySelector('#mDims').textContent = `${w.toFixed(1)} m x ${d.toFixed(1)} m`
      measureEl.querySelector('#mArea').textContent = `${(w * d).toFixed(1)} m² · ${fmtFt(w)} x ${fmtFt(d)}`
    } else {
      measureEl.querySelector('#mDims').textContent = `${fmtFt(w)} x ${fmtFt(d)}`
      measureEl.querySelector('#mArea').textContent = `${sqft.toLocaleString()} sq ft · ${w.toFixed(1)} x ${d.toFixed(1)} m`
    }
  }

  // ---------- pins ----------
  const pins = PIN_ROOMS.map(id => {
    const r = ROOMS[id]
    const b = document.createElement('button')
    b.type = 'button'; b.className = 'pin'; b.dataset.room = id
    b.innerHTML = `<span class="pin-dot"></span><span class="pin-label"></span>`
    b.addEventListener('click', () => goRoom(id))
    pinsEl.appendChild(b)
    const anchor = new THREE.Vector3((r.x[0] + r.x[1]) / 2, id === 'backyard' ? 1.2 : 2.2, (r.z[0] + r.z[1]) / 2).add(OFFSET)
    if (id === 'backyard') anchor.z += 2
    return { el: b, anchor, id }
  })
  function labelPins() { pins.forEach(p => { p.el.querySelector('.pin-label').textContent = t(ROOMS[p.id].key) }) }
  labelPins()
  onLang(() => { labelPins(); if (measuredRoom) showMeasure(measuredRoom) })

  // ---------- camera modes ----------
  const center = new THREE.Vector3(8.5, 0, 3.5).add(OFFSET)
  const OV = new THREE.Vector3(9.5, 14.5, 16.5)
  const overview = { get pos() { const a = camera.aspect; return OV.clone().multiplyScalar(a < 0.8 ? 1.7 : a < 1.3 ? 1.3 : 1).add(center) }, target: center.clone() }
  let mode = 'overview'
  let anim = null
  let wallTarget = CUT
  function flyTo(pos, target, dur = 1300, done) {
    anim = { from: camera.position.clone(), to: pos.clone(), tf: controls.target.clone(), tt: target.clone(), t0: performance.now(), dur, done }
    controls.enabled = false
  }
  function goRoom(id) {
    exitWalk(false)
    setActiveButton(id)
    if (id === 'overview') {
      mode = 'overview'; wallTarget = CUT; showMeasure(null)
      controls.minDistance = 8; controls.maxDistance = 60; controls.maxPolarAngle = 1.38
      flyTo(overview.pos, overview.target)
      return
    }
    mode = 'room'; wallTarget = 1
    const v = ROOMS[id].view
    const pos = new THREE.Vector3(...v.pos).add(OFFSET), tgt = new THREE.Vector3(...v.target).add(OFFSET)
    // after the flight, orbit around a point just in front of the camera so it stays inside the room
    flyTo(pos, tgt, 1500, () => {
      const look = tgt.clone().sub(pos).normalize()
      controls.target.copy(pos.clone().add(look.multiplyScalar(0.6)))
      controls.minDistance = 0.3; controls.maxDistance = 0.9; controls.maxPolarAngle = Math.PI - 0.2
      controls.update()
    })
    showMeasure(id === 'backyard' ? 'backyard' : id)
  }
  function setActiveButton(id) { opts.onRoom && opts.onRoom(id) }

  // ---------- walk mode ----------
  let walking = false
  let yaw = 0, pitch = 0
  const keys = {}
  const pad = { f: 0, b: 0, l: 0, r: 0 }
  function enterWalk() {
    walking = true; mode = 'walk'; wallTarget = 1; anim = null
    controls.enabled = false
    // start near the front door inside, or the current room view
    const start = new THREE.Vector3(8.2, 1.62, 8.2).add(OFFSET)
    const inRoom = camera.position.y < 2.2 && camera.position.y > 1.0
    const p = inRoom ? camera.position.clone() : start
    p.y = 1.62; camera.position.copy(p)
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir)
    yaw = inRoom ? Math.atan2(-dir.x, -dir.z) : 0; pitch = 0
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
    const r = 0.28
    const lx = p.x - OFFSET.x, lz = p.z - OFFSET.z
    let x = lx, z = lz
    for (const w of wallBoxes) {
      const cx = Math.max(w.x1, Math.min(x, w.x2)), cz = Math.max(w.z1, Math.min(z, w.z2))
      const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz
      if (d2 < r * r) {
        if (d2 > 1e-6) { const d = Math.sqrt(d2); x = cx + dx / d * r; z = cz + dz / d * r }
        else { // inside the box: push along the smallest axis
          const pushes = [[w.x1 - r - x, 0], [w.x2 + r - x, 0], [0, w.z1 - r - z], [0, w.z2 + r - z]]
          pushes.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1])); x += pushes[0][0]; z += pushes[0][1]
        }
      }
    }
    x = Math.max(-0.7, Math.min(17.7, x)); z = Math.max(-8.7, Math.min(13.5, z))
    p.x = x + OFFSET.x; p.z = z + OFFSET.z
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
  function pick(e, click) {
    const rect = canvas.getBoundingClientRect()
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const hit = ray.intersectObjects(floors, false)[0]
    const f = hit ? hit.object : null
    highlight(f)
    canvas.style.cursor = f ? 'pointer' : ''
    if (click) showMeasure(f ? f.userData.room : null)
  }

  // ---------- loop ----------
  let visible = false, raf = 0
  const clock = new THREE.Clock()
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight
    renderer.setSize(w, h, false); camera.aspect = w / h
    camera.fov = w < 640 ? 62 : 48
    camera.updateProjectionMatrix()
  }
  new ResizeObserver(resize).observe(stage)
  resize()
  camera.position.copy(overview.pos).add(new THREE.Vector3(10, 8, 6)); controls.target.copy(overview.target)
  controls.minDistance = 8; controls.maxDistance = 60
  flyTo(overview.pos, overview.target, 1800)
  wallsGroup.scale.y = CUT

  const tmp = new THREE.Vector3()
  function frame() {
    raf = requestAnimationFrame(frame)
    const rect = stage.getBoundingClientRect()
    const nowVisible = rect.bottom > 0 && rect.top < innerHeight && !document.hidden
    if (nowVisible && !visible) clock.getDelta()
    visible = nowVisible
    if (!visible) return
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
    // cutaway walls
    const s = wallsGroup.scale.y; const ns = s + (wallTarget - s) * Math.min(1, dt * 5)
    wallsGroup.scale.y = ns
    ceilings.visible = mode !== 'overview'
    // sun follows the house
    sun.target.position.copy(center)
    // pins
    const showPins = mode === 'overview' && !anim
    const w = stage.clientWidth, h = stage.clientHeight
    for (const p of pins) {
      tmp.copy(p.anchor).project(camera)
      const vis = showPins && tmp.z < 1
      p.el.style.opacity = vis ? '1' : '0'; p.el.style.pointerEvents = vis ? 'auto' : 'none'
      p.el.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * w}px, ${(-tmp.y * 0.5 + 0.5) * h}px)`
    }
    renderer.render(scene, camera)
  }
  frame()
  loadingEl && loadingEl.classList.add('done')

  return {
    goRoom,
    setLight,
    setStaging(on) { staging.visible = on },
    toggleWalk() { walking ? exitWalk() : enterWalk(); return walking },
    get walking() { return walking },
    get camera() { return camera },
    get lightMode() { return lightMode },
    dispose() { cancelAnimationFrame(raf); renderer.dispose() },
  }
}
