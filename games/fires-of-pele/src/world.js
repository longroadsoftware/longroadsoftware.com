// Terrain, water, sky, day/night cycle and island landmarks.
import * as THREE from 'three';
import { G, CFG } from './state.js';
import { fbm, clamp, lerp, smoothstep, mulberry32, part, merge, MAT, mesh, makeLabel } from './util.js';
import { addStatic } from './physics.js';

export const WORLD = 1024, SEG = 512;
const CW = WORLD / SEG;
export const K = 3.16;            // island scale vs. the first version (about 10x the land area)
export const VS = 2.4;            // volcano scale vs. the first version
export const VOLC = { x: 20, z: -110 };
export const LOC = {};
export const PATHS = [];          // trail segments [{ax,az,bx,bz}]
export const CAVES = [];          // hidden caves (geometry in caves.js)
let H = null;

const islandR = (ang) => K * (104 + 9 * Math.sin(ang * 3 + 1) + 6 * Math.sin(ang * 5 + 2) + 10 * fbm(Math.cos(ang) * 1.5 + 5, Math.sin(ang) * 1.5 + 5, 3));
const atAngle = (a, d) => ({ x: Math.cos(a) * d, z: Math.sin(a) * d, a });
export function segDist(x, z, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  let t = ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(x - (ax + vx * t), z - (az + vz * t));
}
// Fixed anchors that shape the terrain itself (highlands, offshore islet and the sandbar to it).
const A = (() => {
  const hl = atAngle(0.45, islandR(0.45) * 0.62);
  const ia = -0.75, ir = islandR(ia);
  const islet = atAngle(ia, ir + 78);
  return { hl, islet, bar0: atAngle(ia, ir - 6), bar1: atAngle(ia, ir + 60) };
})();

function baseHeight(x, z) {
  const ang = Math.atan2(z, x);
  const d = Math.hypot(x, z);
  const s = islandR(ang) - d;                      // metres inland from the shoreline
  let h;
  if (s < 0) h = -1.6 + s * 0.43;
  else {
    h = -1.6 + Math.pow(Math.min(s / 23, 1), 0.8) * 3.6
      + Math.max(0, s - 17) * 0.055 * (0.7 + 0.9 * fbm(x * 0.006 + 3, z * 0.006, 4))
      + fbm(x * 0.012 + 7, z * 0.012 - 3, 3) * 7 * clamp((s - 20) / 70, 0, 1);
  }
  h += fbm(x * 0.07, z * 0.07, 3) * 1.1 * clamp(s / 17, 0, 1);
  // eastern highlands: a raised plateau with a cliff edge (the Highland Falls drop off its west side)
  const dh = Math.hypot(x - A.hl.x, z - A.hl.z);
  if (dh < 92) h += smoothstep(90, 74, dh) * 16;
  // the volcano
  const dv = Math.hypot(x - VOLC.x, z - VOLC.z);
  const cone = Math.max(0, 1 - dv / 125);
  h += Math.pow(cone, 1.55) * 112 * (0.92 + 0.08 * fbm(x * 0.08, z * 0.08, 2));
  h -= smoothstep(17, 5, dv) * 30;
  // offshore islet and the sandbar that reaches it
  const di = Math.hypot(x - A.islet.x, z - A.islet.z);
  if (di < 40) h = Math.max(h, -6 + smoothstep(38, 8, di) * 13 + fbm(x * 0.08, z * 0.08, 2) * 1.2 * smoothstep(25, 10, di));
  const sb = segDist(x, z, A.bar0.x, A.bar0.z, A.bar1.x, A.bar1.z);
  if (sb < 7) h = Math.max(h, lerp(h, -0.3 + 0.4 * fbm(x * 0.15, z * 0.15, 2), smoothstep(7, 3, sb)));
  return Math.max(h, -14);
}

function shoreDist(angle) {
  const r0 = islandR(angle);
  for (let d = r0 * 0.6; d < r0 * 1.3; d += 0.5) if (baseHeight(Math.cos(angle) * d, Math.sin(angle) * d) < 0.3) return d;
  return r0;
}
const off = (p, dx, dz) => ({ x: p.x + dx, z: p.z + dz });
const norm = (x, z) => { const l = Math.hypot(x, z) || 1; return { x: x / l, z: z / l }; };

function computeLocations() {
  const sw = shoreDist(1.45);
  LOC.wreck = atAngle(1.45, sw + 3);
  LOC.camp = atAngle(1.45, sw - 18);
  const inward = { x: -Math.cos(1.45), z: -Math.sin(1.45) };
  LOC.spring = off(LOC.camp, inward.x * 55 - inward.z * 22, inward.z * 55 + inward.x * 22);
  const sc = shoreDist(2.5);
  LOC.cove = atAngle(2.5, sc - 9);
  const sv = shoreDist(-0.12);
  LOC.village = atAngle(-0.12, sv - 80);
  LOC.den = atAngle(2.95, shoreDist(2.95) * 0.6);
  LOC.volcano = { x: VOLC.x, z: VOLC.z };
  LOC.fishing = atAngle(-1.62, shoreDist(-1.62) - 24);
  LOC.fields = off(LOC.fishing, -Math.cos(-1.62) * 40 + 22, -Math.sin(-1.62) * 40);
  LOC.highlands = { x: A.hl.x, z: A.hl.z };
  const fd = norm(-A.hl.x, -A.hl.z);                       // from the plateau toward the island centre
  LOC.fallsDir = fd;
  LOC.falls = off(A.hl, fd.x * 100, fd.z * 100);            // the pool at the foot of the falls
  LOC.highPeak = off(A.hl, -fd.x * 30, -fd.z * 30);
  LOC.blackSand = atAngle(0.95, shoreDist(0.95) - 6);
  LOC.lavaField = atAngle(0.95, shoreDist(0.95) - 62);
  LOC.islet = { x: A.islet.x, z: A.islet.z };
  LOC.sandbar = { x: A.bar0.x, z: A.bar0.z };
  LOC.rim = off(VOLC, -14, 12);
  LOC.campH = baseHeight(LOC.camp.x, LOC.camp.z);
  LOC.villageH = baseHeight(LOC.village.x, LOC.village.z);
  LOC.springH = baseHeight(LOC.spring.x, LOC.spring.z);
  LOC.fishingH = Math.max(1.4, baseHeight(LOC.fishing.x, LOC.fishing.z));
  LOC.fallsH = baseHeight(LOC.falls.x, LOC.falls.z);
  // ---- hidden caves ----
  CAVES.length = 0;
  const lv = norm(-1, 0.25);
  const lt = off(VOLC, lv.x * 72, lv.z * 72);
  CAVES.push({ id: 'lava', name: 'Lava Tube', x: lt.x, z: lt.z, R: 9, H: 6, ex: lv.x, ez: lv.z, floor: baseHeight(lt.x, lt.z), area: 'the west flank of the volcano' });
  const wc = off(A.hl, fd.x * 86, fd.z * 86);
  CAVES.push({ id: 'falls', name: 'Cave behind the Falls', x: wc.x, z: wc.z, R: 8, H: 6, ex: fd.x, ez: fd.z, floor: LOC.fallsH + 0.4, area: 'the Highland Falls' });
  const sa = 0.27, sr = shoreDist(sa);
  const seaC = atAngle(sa, sr + 17);
  const out = norm(Math.cos(sa), Math.sin(sa)), tan = { x: -out.z, z: out.x };
  CAVES.push({ id: 'sea', name: 'Sea Cave', x: seaC.x, z: seaC.z, R: 8, H: 5.5, ex: out.x, ez: out.z, floor: 0.8, area: 'the eastern sea cliffs' });
  const sea = CAVES[2];
  const B = atAngle(sa + 0.105, shoreDist(sa + 0.105) - 3);
  const W = off(seaC, tan.x * (sea.R + 3.5) + out.x * 2, tan.z * (sea.R + 3.5) + out.z * 2);
  const E = off(seaC, out.x * (sea.R + 3) + tan.x * 2, out.z * (sea.R + 3) + tan.z * 2);
  sea.ledge = [[B, W], [W, E]];
  LOC.seaLedge = B;
}

function caveShape(c, x, z, h) {
  const d = Math.hypot(x - c.x, z - c.z);
  if (d > c.R + 7) return h;
  const w = h < c.floor ? smoothstep(c.R + 6, c.R - 1, d) : smoothstep(c.R + 0.4, c.R - 1.2, d);
  return lerp(h, c.floor, w);
}

function rawHeight(x, z) {
  let h = baseHeight(x, z);
  // flatten camp & villages so building is easier
  const dc = Math.hypot(x - LOC.camp.x, z - LOC.camp.z);
  if (dc < 24) h = lerp(h, Math.max(LOC.campH, 1.4), smoothstep(24, 12, dc));
  const dvl = Math.hypot(x - LOC.village.x, z - LOC.village.z);
  if (dvl < 24) h = lerp(h, LOC.villageH, smoothstep(24, 14, dvl));
  const df = Math.hypot(x - LOC.fishing.x, z - LOC.fishing.z);
  if (df < 30) h = lerp(h, LOC.fishingH, smoothstep(30, 17, df));
  const ds = Math.hypot(x - LOC.spring.x, z - LOC.spring.z);
  if (ds < 7) h -= smoothstep(6.5, 1, ds) * 2.2;
  const dp = Math.hypot(x - LOC.falls.x, z - LOC.falls.z);
  if (dp < 9) h -= smoothstep(8.5, 2, dp) * 2.4;
  // sea cave: deep water all round, a narrow rock ledge is the only way in
  const sea = CAVES[2];
  const dC = Math.hypot(x - sea.x, z - sea.z);
  if (dC < 38 && h < 0.8) h = Math.min(h, lerp(h, -3.8, smoothstep(38, 22, dC)));
  for (const [a, b] of sea.ledge) {
    const dl = segDist(x, z, a.x, a.z, b.x, b.z);
    if (dl < 2.6) h = Math.max(h, lerp(h, 0.75 + 0.15 * fbm(x * 0.4, z * 0.4, 2), smoothstep(2.6, 1.1, dl)));
  }
  for (const c of CAVES) h = caveShape(c, x, z, h);
  return h;
}

// ---------- trails ----------
function trail(a, b, wig = 6, seed = 1) {
  const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 25));
  const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz), px = -dz / L, pz = dx / L;
  let prev = a;
  for (let i = 1; i <= n; i++) {
    const t = i / n, w = i === n ? 0 : Math.sin(t * Math.PI * 2.3 + seed) * wig * Math.sin(t * Math.PI);
    const p = { x: a.x + dx * t + px * w, z: a.z + dz * t + pz * w };
    PATHS.push({ ax: prev.x, az: prev.z, bx: p.x, bz: p.z });
    prev = p;
  }
}
function computePaths() {
  PATHS.length = 0;
  const L = LOC;
  const vFootW = off(VOLC, -105, 70), vFootN = off(VOLC, -80, -95);
  const mid = { x: (L.camp.x + L.village.x) / 2 + 30, z: (L.camp.z + L.village.z) / 2 + 10 };
  trail(L.camp, L.spring, 3, 1);
  trail(L.camp, L.cove, 9, 2);
  trail(L.cove, L.den, 6, 3);
  trail(L.camp, L.blackSand, 7, 4);
  trail(L.camp, mid, 8, 5); trail(mid, L.village, 6, 6);
  trail(L.village, L.falls, 6, 7);
  trail(L.spring, vFootW, 9, 8); trail(vFootW, vFootN, 8, 9); trail(vFootN, L.fishing, 6, 10);
  trail(L.fishing, L.sandbar, 5, 11);
  trail(L.village, L.sandbar, 7, 12);
}
export function trailDist(x, z) {
  let best = 1e9;
  for (const p of PATHS) {
    if (x < Math.min(p.ax, p.bx) - 4 || x > Math.max(p.ax, p.bx) + 4 || z < Math.min(p.az, p.bz) - 4 || z > Math.max(p.az, p.bz) + 4) continue;
    const d = segDist(x, z, p.ax, p.az, p.bx, p.bz);
    if (d < best) best = d;
  }
  return best;
}

export function heightAt(x, z) {
  const fx = (x + WORLD / 2) / CW, fz = (z + WORLD / 2) / CW;
  if (fx < 0 || fz < 0 || fx >= SEG || fz >= SEG) return -14;
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
  const N = SEG + 1;
  const a = H[iz * N + ix], b = H[iz * N + ix + 1], c = H[(iz + 1) * N + ix], d = H[(iz + 1) * N + ix + 1];
  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
}
export const distVolcano = (x, z) => Math.hypot(x - VOLC.x, z - VOLC.z);

// ---------- terrain (8x8 chunks so off-screen and fogged-out parts are culled) ----------
const CH = 64;                       // cells per chunk side
const chunks = [];
function terrainColor(x, y, z, ny, c, C) {
  const dv = distVolcano(x, z);
  const n = fbm(x * 0.05, z * 0.05, 3), n2 = fbm(x * 0.21 + 9, z * 0.21, 2);
  const dBS = Math.hypot(x - LOC.blackSand.x, z - LOC.blackSand.z), dLF = Math.hypot(x - LOC.lavaField.x, z - LOC.lavaField.z);
  const blackK = smoothstep(75, 45, dBS);
  if (y < -0.4) c.copy(C.seabed).lerp(C.wetsand, smoothstep(-3, -0.4, y));
  else if (y < 1.9) c.copy(C.wetsand).lerp(C.sand, smoothstep(0.2, 0.9, y));
  else {
    c.copy(C.grass).lerp(C.grass2, clamp(n * 1.5 + 0.5, 0, 1));
    c.lerp(C.dry, clamp(n2 * 1.2, 0, 0.35));
    if (y > 6) c.lerp(C.jungle, clamp((y - 6) / 8, 0, 0.8));
    if (dv < 96) c.lerp(C.rock, smoothstep(96, 62, dv));
    if (dv < 53) c.lerp(C.basalt, smoothstep(53, 31, dv));
    if (dv < 24) c.lerp(C.ash, smoothstep(24, 14, dv));
    if (dv >= 53) c.lerp(C.cliff, smoothstep(0.8, 0.62, ny) * 0.75);
    if (dLF < 70) c.lerp(n2 > 0.1 ? C.ash : C.basalt, smoothstep(70, 40, dLF) * 0.92);
    c.lerp(C.sand, smoothstep(2.15, 1.85, y));
    if (y > 1.6 && trailDist(x, z) < 2.4) c.lerp(C.dirt, smoothstep(2.4, 1.1, trailDist(x, z)) * 0.8);
  }
  if (blackK > 0 && y < 3) c.lerp(y < -0.4 ? C.basalt : C.blacksand, blackK * smoothstep(3, 1.6, y));
  for (const cv of CAVES) if (Math.hypot(x - cv.x, z - cv.z) < cv.R + 1) c.copy(C.caveFloor).lerp(C.basalt, n2 * 0.5 + 0.3);
  return c;
}
let terrainMat;
export function buildTerrain(scene) {
  computeLocations();
  computePaths();
  const N = SEG + 1;
  H = new Float32Array(N * N);
  for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) H[iz * N + ix] = rawHeight(-WORLD / 2 + ix * CW, -WORLD / 2 + iz * CW);
  const C = {
    seabed: new THREE.Color(0x8a7a52), wetsand: new THREE.Color(0xc9b383), sand: new THREE.Color(0xecdcab),
    grass: new THREE.Color(0x3f8a22), grass2: new THREE.Color(0x2f7420), dry: new THREE.Color(0x7a9238), jungle: new THREE.Color(0x245c1c),
    rock: new THREE.Color(0x6e6258), basalt: new THREE.Color(0x3b3330), ash: new THREE.Color(0x2a2220), cliff: new THREE.Color(0x7d7468),
    dirt: new THREE.Color(0x9a7a52), blacksand: new THREE.Color(0x2e2b2a), caveFloor: new THREE.Color(0x4a4038),
  };
  terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
  terrainMat.onBeforeCompile = (sh) => {
    // fine ground detail: world-space value noise breaks up the flat vertex colours
    sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = `varying vec3 vWP;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1,0)), f.x), mix(h21(i + vec2(0,1)), h21(i + vec2(1,1)), f.x), f.y); }
    ` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float d1 = vn(vWP.xz * 1.7), d2 = vn(vWP.xz * 6.0), d3 = vn(vWP.xz * 0.35);
      diffuseColor.rgb *= 0.86 + 0.16 * d1 + 0.08 * d2 + 0.06 * (d3 - 0.5);`)
      // high ground (the volcano) shows through the haze from across the island
      .replace('#include <fog_fragment>', `#ifdef USE_FOG
        float fogFactor = smoothstep(fogNear, fogFar, vFogDepth) * (1.0 - 0.85 * smoothstep(10.0, 50.0, vWP.y));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
      #endif`);
  };
  // shared index for a CH x CH cell grid
  const VN = CH + 1, idx = [];
  for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) {
    const a = j * VN + i, b = a + 1, c2 = a + VN, d = c2 + 1;
    idx.push(a, c2, b, b, c2, d);
  }
  const index = new THREE.Uint32BufferAttribute(idx, 1);
  const c = new THREE.Color();
  const group = new THREE.Group(); group.name = 'terrain';
  const NC = SEG / CH;
  for (let cz = 0; cz < NC; cz++) for (let cx = 0; cx < NC; cx++) {
    const pos = new Float32Array(VN * VN * 3), nor = new Float32Array(VN * VN * 3), col = new Float32Array(VN * VN * 3);
    let maxH = -99, minH = 99;
    for (let j = 0; j < VN; j++) for (let i = 0; i < VN; i++) {
      const gx = cx * CH + i, gz = cz * CH + j, k = (j * VN + i) * 3;
      const x = -WORLD / 2 + gx * CW, z = -WORLD / 2 + gz * CW, y = H[gz * N + gx];
      pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
      const hl = H[gz * N + Math.max(0, gx - 1)], hr = H[gz * N + Math.min(SEG, gx + 1)];
      const hd = H[Math.max(0, gz - 1) * N + gx], hu = H[Math.min(SEG, gz + 1) * N + gx];
      let nx = hl - hr, ny = 2 * CW, nz = hd - hu; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      nor[k] = nx; nor[k + 1] = ny; nor[k + 2] = nz;
      if (y > maxH) maxH = y; if (y < minH) minH = y;
      terrainColor(x, y, z, ny, c, C);
      col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
    }
    if (maxH < -6) continue;                         // open ocean: nothing to draw
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(index);
    geo.computeBoundingSphere(); geo.computeBoundingBox();
    const m = new THREE.Mesh(geo, terrainMat);
    m.receiveShadow = true;
    m.userData = { cx: (geo.boundingBox.min.x + geo.boundingBox.max.x) / 2, cz: (geo.boundingBox.min.z + geo.boundingBox.max.z) / 2, tall: maxH > 30 };
    chunks.push(m);
    group.add(m);
  }
  scene.add(group);
  G.terrain = group;
  buildHeightTexture();
  buildGrass(scene);
  buildWater(scene);
  buildLandmarks(scene);
  return group;
}

// Per-frame world upkeep: cull far terrain chunks, keep water & grass around the player, animate the falls.
export function updateWorld(dt) {
  const cam = G.camera.position;
  const far = (G.scene.fog ? G.scene.fog.far : 300) + 100;
  for (const m of chunks) m.visible = m.userData.tall || Math.hypot(m.userData.cx - cam.x, m.userData.cz - cam.z) < far;
  const P = G.player ? G.player.pos : cam;
  if (G.water) { const st = 1800 / 240; G.water.position.x = Math.round(P.x / st) * st; G.water.position.z = Math.round(P.z / st) * st; }
  updateGrass(P);
  if (fallsTex) fallsTex.offset.y = (fallsTex.offset.y + dt * 1.6) % 1;
}

// ---------- Water ----------
export const waterUniforms = { uTime: { value: 0 }, uHeight: { value: null }, uWorld: { value: WORLD }, uSeg: { value: SEG } };
// The island's height field as a texture, so the water can tell shallow from deep and draw surf.
function buildHeightTexture() {
  const N = SEG + 1, data = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) data[i] = Math.round(clamp((H[i] + 6) / 8, 0, 1) * 255);   // -6..2 m
  const tex = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  waterUniforms.uHeight.value = tex;
}
function buildWater(scene) {
  const geo = new THREE.PlaneGeometry(1800, 1800, 240, 240);
  const mat = new THREE.MeshPhongMaterial({ color: 0x1f7fae, transparent: true, opacity: 0.9, shininess: 160, specular: 0xcfefff });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, waterUniforms);
    sh.vertexShader = 'uniform float uTime;\nvarying vec3 vWP;\n' + sh.vertexShader
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        { vec4 w0 = modelMatrix * vec4(position, 1.0);
          float dx = cos(w0.x * 0.17 + uTime * 1.3) * 0.17 * 0.18 + cos(w0.x * 0.41 - w0.z * 0.23 + uTime * 2.1) * 0.41 * 0.06;
          float dz = -sin(w0.z * 0.13 + uTime * 0.9) * 0.13 * 0.18 - cos(w0.x * 0.41 - w0.z * 0.23 + uTime * 2.1) * 0.23 * 0.06;
          objectNormal = normalize(vec3(-dx, dz, 1.0)); }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wpw = modelMatrix * vec4(position, 1.0);
        transformed.z += sin(wpw.x * 0.17 + uTime * 1.3) * 0.18 + cos(wpw.z * 0.13 + uTime * 0.9) * 0.18 + sin(wpw.x * 0.41 - wpw.z * 0.23 + uTime * 2.1) * 0.06;
        vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = 'uniform float uTime; uniform float uWorld; uniform float uSeg; uniform sampler2D uHeight;\nvarying vec3 vWP;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 uv = ((vWP.xz + uWorld * 0.5) / uWorld * uSeg + 0.5) / (uSeg + 1.0);
        float ground = (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? -6.0 : texture2D(uHeight, vec2(uv.x, uv.y)).r * 8.0 - 6.0;
        float depth = max(0.0, vWP.y - ground);
        vec3 shallow = vec3(0.30, 0.85, 0.82), mid = vec3(0.09, 0.55, 0.70), deep = vec3(0.04, 0.24, 0.42);
        vec3 wc = mix(shallow, mid, smoothstep(0.0, 1.6, depth));
        wc = mix(wc, deep, smoothstep(1.6, 6.0, depth));
        float foamBand = 1.0 - smoothstep(0.0, 0.45 + 0.15 * sin(uTime * 1.7 + vWP.x * 0.3), depth);
        float ripple = 0.5 + 0.5 * sin(vWP.x * 2.3 + uTime * 2.0) * sin(vWP.z * 2.1 - uTime * 1.6);
        wc = mix(wc, vec3(0.97), clamp(foamBand * (0.55 + 0.45 * ripple), 0.0, 1.0));
        diffuseColor.rgb = wc;
        diffuseColor.a = mix(0.55, 0.93, smoothstep(0.0, 2.5, depth)) + foamBand * 0.3;`)
  };
  const w = new THREE.Mesh(geo, mat);
  w.rotation.x = -Math.PI / 2;
  w.position.y = 0;
  w.receiveShadow = true;
  scene.add(w);
  G.water = w;
}

// ---------- Grass ----------
// Small instanced tufts swaying in the wind. A 7x7 grid of 16 m tiles follows the player; tiles that fall
// off one edge are refilled (a few per frame) on the other, so there is grass everywhere you walk.
export const grassUniforms = { uTime: { value: 0 } };
const GT = 16, GN = 7, GPER = 900;
let grassIM = null;
const gSlots = [];          // per slot: current tile coords
const gQueue = [];
const _gm = new THREE.Matrix4(), _gq = new THREE.Quaternion(), _gs = new THREE.Vector3(), _gp = new THREE.Vector3(), _gup = new THREE.Vector3(0, 1, 0), _gc = new THREE.Color();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
function grassOK(x, z, h) {
  if (h < 2.05 || distVolcano(x, z) < 72) return false;
  if (fbm(x * 0.09 + 3, z * 0.09, 2) < -0.25) return false;          // natural bare patches
  if (Math.hypot(x - LOC.lavaField.x, z - LOC.lavaField.z) < 62 || Math.hypot(x - LOC.blackSand.x, z - LOC.blackSand.z) < 50) return false;
  for (const c of CAVES) if (Math.hypot(x - c.x, z - c.z) < c.R + 1) return false;
  const e = 0.4, sl = Math.abs(heightAt(x + e, z) - heightAt(x - e, z)) + Math.abs(heightAt(x, z + e) - heightAt(x, z - e));
  if (sl > 0.5) return false;                                         // not on cliffs
  return trailDist(x, z) > 1.3;
}
function fillTile(slot, tx, tz) {
  gSlots[slot] = { tx, tz };
  const rng = mulberry32((tx * 73856093) ^ (tz * 19349663) ^ 2024);
  const base = slot * GPER;
  for (let i = 0; i < GPER; i++) {
    const x = (tx + rng()) * GT, z = (tz + rng()) * GT, r = rng() * Math.PI * 2, sc = 0.75 + rng() * 0.6;
    const h = heightAt(x, z);
    if (!grassOK(x, z, h)) { grassIM.setMatrixAt(base + i, _zero); continue; }
    _gm.compose(_gp.set(x, h - 0.02, z), _gq.setFromAxisAngle(_gup, r), _gs.set(sc, sc * (0.8 + (i % 5) * 0.1), sc));
    grassIM.setMatrixAt(base + i, _gm);
    _gc.setHSL(0.24 + fbm(x * 0.04, z * 0.04, 2) * 0.05, 0.55, 0.42 + (i % 7) * 0.02);
    grassIM.setColorAt(base + i, _gc.multiplyScalar(1.7));
  }
  grassIM.instanceMatrix.needsUpdate = true;
  grassIM.instanceColor.needsUpdate = true;
}
function updateGrass(P, all = false) {
  if (!grassIM) return;
  const ctx = Math.floor(P.x / GT), ctz = Math.floor(P.z / GT), half = (GN - 1) / 2;
  for (let j = -half; j <= half; j++) for (let i = -half; i <= half; i++) {
    const tx = ctx + i, tz = ctz + j;
    const slot = (((tz % GN) + GN) % GN) * GN + (((tx % GN) + GN) % GN);
    const cur = gSlots[slot];
    if (cur && cur.tx === tx && cur.tz === tz) continue;
    if (!gQueue.some((q) => q.slot === slot && q.tx === tx && q.tz === tz)) gQueue.push({ slot, tx, tz });
  }
  // nearest tiles first; a few per frame so walking never hitches
  gQueue.sort((a, b) => Math.hypot(a.tx - ctx, a.tz - ctz) - Math.hypot(b.tx - ctx, b.tz - ctz));
  let n = all ? 1e9 : 3;
  while (gQueue.length && n-- > 0) {
    const q = gQueue.shift();
    if (Math.abs(q.tx - ctx) > half || Math.abs(q.tz - ctz) > half) continue;   // stale
    fillTile(q.slot, q.tx, q.tz);
  }
}
export function refreshGrass(P) { gQueue.length = 0; gSlots.length = 0; updateGrass(P, true); }
function buildGrass(scene) {
  const blades = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI + (k % 2) * 0.3, h = 0.2 + (k % 3) * 0.07, w = 0.035;
    const lean = 0.06 * ((k % 3) - 1);
    const g = new THREE.BufferGeometry();
    const v = new Float32Array([-w, 0, 0, w, 0, 0, lean, h, 0.04]);
    g.setAttribute('position', new THREE.BufferAttribute(v, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array([0.1, 0.22, 0.06, 0.1, 0.22, 0.06, 0.34, 0.55, 0.17]), 3));
    g.rotateY(a); g.translate(Math.cos(a * 3) * 0.05, 0, Math.sin(a * 3) * 0.05);
    blades.push(g);
  }
  const geo = merge(blades);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = grassUniforms.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 ib = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float sway = sin(uTime * 1.8 + ib.x * 0.35 + ib.z * 0.27) * 0.18 + sin(uTime * 3.1 + ib.x * 1.3) * 0.05;
      transformed.x += sway * position.y; transformed.z += sway * 0.6 * position.y;`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n objectNormal = vec3(0.0, 1.0, 0.0);');
  };
  grassIM = new THREE.InstancedMesh(geo, mat, GN * GN * GPER);
  grassIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < GN * GN * GPER; i++) { grassIM.setMatrixAt(i, _zero); grassIM.setColorAt(i, _gc.set(0x55aa33)); }
  grassIM.receiveShadow = true; grassIM.castShadow = false;
  grassIM.frustumCulled = false;
  scene.add(grassIM);
  G.grass = grassIM;
  const s0 = { x: LOC.wreck.x - Math.cos(LOC.wreck.a) * 12, z: LOC.wreck.z - Math.sin(LOC.wreck.a) * 12 };
  refreshGrass(s0);
}

// ---------- Sky & lighting ----------
let fallsTex = null;
let hemi, sun, stars, sunMesh, moonMesh, lavaLight, lavaMesh, dome;
const skyUniforms = {
  uTop: { value: new THREE.Color(0x2f7fd8) }, uHorizon: { value: new THREE.Color(0x9fd8ff) },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(0xfff0c0) }, uTime: { value: 0 }, uCloud: { value: 1 },
};
export function initSky(scene) {
  scene.background = new THREE.Color(0x8fd3ff);
  scene.fog = new THREE.Fog(0x8fd3ff, 80, 340);
  // gradient sky dome with a sun glow and soft drifting clouds
  dome = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), new THREE.ShaderMaterial({
    uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uTop, uHorizon, uSunDir, uSunCol; uniform float uTime, uCloud; varying vec3 vDir;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1,0)), f.x), mix(h21(i + vec2(0,1)), h21(i + vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }
      void main(){
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -0.2, 1.0);
        vec3 col = mix(uHorizon, uTop, pow(max(h, 0.0), 0.55));
        float sd = max(dot(d, normalize(uSunDir)), 0.0);
        col += uSunCol * (pow(sd, 8.0) * 0.35 + pow(sd, 64.0) * 0.6);
        if (d.y > 0.02) {
          vec2 cp = d.xz / (d.y + 0.15) * 1.6 + vec2(uTime * 0.012, uTime * 0.006);
          float c = smoothstep(0.52, 0.78, fbm(cp));
          vec3 cloudCol = mix(uHorizon * 1.05, vec3(1.0), 0.6) * (0.75 + 0.35 * sd) * uCloud + uSunCol * pow(sd, 6.0) * 0.25;
          col = mix(col, cloudCol, c * smoothstep(0.02, 0.25, d.y) * 0.85);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  dome.renderOrder = -1;
  scene.add(dome);
  hemi = new THREE.HemisphereLight(0xcfeaff, 0x5a7040, 0.8);
  scene.add(hemi);
  sun = new THREE.DirectionalLight(0xfff2dd, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.radius = 3;
  const sc = sun.shadow.camera;
  sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 1; sc.far = 320;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const sg = new THREE.BufferGeometry();
  const sp = [];
  const rng = mulberry32(99);
  for (let i = 0; i < 900; i++) {
    const th = rng() * Math.PI * 2, ph = Math.acos(rng() * 0.95);
    sp.push(Math.sin(ph) * Math.cos(th) * 600, Math.cos(ph) * 600, Math.sin(ph) * Math.sin(th) * 600);
  }
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, fog: false }));
  scene.add(stars);
  sunMesh = new THREE.Mesh(new THREE.SphereGeometry(18, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff1b0, fog: false }));
  moonMesh = new THREE.Mesh(new THREE.SphereGeometry(12, 12, 8), new THREE.MeshBasicMaterial({ color: 0xe8eeff, fog: false }));
  scene.add(sunMesh, moonMesh);
}

const SKY_DAY = new THREE.Color(0xa8dcff), SKY_NIGHT = new THREE.Color(0x0a1230), SKY_SET = new THREE.Color(0xff9a5c), SKY_TOP = new THREE.Color(0x2c78d4);
const _c = new THREE.Color();
export function timeInfo() {
  const t = G.cycle, df = CFG.DAY_FRAC;
  let hour;
  if (t < df) hour = 6 + (t / df) * 13; else hour = 19 + ((t - df) / (1 - df)) * 11;
  hour %= 24;
  return { hour, isNight: t >= df, dayP: t < df ? t / df : -1, nightP: t >= df ? (t - df) / (1 - df) : -1 };
}
export function updateSky(dt) {
  const ti = timeInfo();
  const P = G.player ? G.player.pos : new THREE.Vector3();
  let elev, az, L;
  if (!ti.isNight) {
    elev = Math.sin(ti.dayP * Math.PI); az = ti.dayP * Math.PI;
    L = clamp(elev * 3.2, 0, 1);
  } else {
    elev = Math.sin(ti.nightP * Math.PI); az = ti.nightP * Math.PI;
    L = 0;
  }
  G.light = L;
  const dir = new THREE.Vector3(Math.cos(az), Math.max(0.15, elev), 0.35).normalize();
  sun.position.copy(P).addScaledVector(dir, 150);
  sun.target.position.copy(P);
  const sunset = !ti.isNight ? clamp(1 - elev * 3, 0, 1) : 0;
  _c.copy(SKY_NIGHT).lerp(SKY_DAY, L).lerp(SKY_SET, sunset * 0.55 * (ti.isNight ? 0 : 1));
  G.scene.background.copy(_c);
  G.scene.fog.color.copy(_c);
  skyUniforms.uHorizon.value.copy(_c);
  skyUniforms.uTop.value.copy(SKY_NIGHT).lerp(SKY_TOP, L).lerp(SKY_SET, sunset * 0.2);
  skyUniforms.uSunDir.value.set(Math.cos(az), elev, 0.35);
  skyUniforms.uSunCol.value.setHex(ti.isNight ? 0x9fb4ff : 0xfff0c0).lerp(SKY_SET, sunset).multiplyScalar(ti.isNight ? 0.25 : 1);
  skyUniforms.uCloud.value = lerp(0.18, 1, L);
  skyUniforms.uTime.value = G.t;
  dome.position.copy(P);
  grassUniforms.uTime.value = G.t;
  G.scene.fog.far = lerp(200, 340, L) * (1 - 0.6 * (G.caveDark || 0));
  G.scene.fog.near = lerp(60, 80, L);
  if (!ti.isNight) {
    sun.color.setHex(0xfff2dd).lerp(SKY_SET, sunset * 0.6);
    sun.intensity = lerp(0.25, 1.7, L);
  } else {
    sun.color.setHex(0x8fa8ff);
    sun.intensity = 0.32 * clamp(elev * 3, 0.3, 1);
  }
  hemi.intensity = lerp(0.28, 0.85, L) * (1 - 0.88 * (G.caveDark || 0));
  sun.intensity *= 1 - 0.95 * (G.caveDark || 0);
  hemi.color.setHex(ti.isNight ? 0x4a5f9a : 0xcfeaff);
  stars.material.opacity = clamp(1 - L * 1.5, 0, 1);
  stars.position.copy(P);
  sunMesh.visible = !ti.isNight; moonMesh.visible = ti.isNight;
  const body = ti.isNight ? moonMesh : sunMesh;
  body.position.copy(P).addScaledVector(new THREE.Vector3(Math.cos(az), elev, 0.35).normalize(), 520);
  waterUniforms.uTime.value = G.t;
  if (lavaMesh) {
    const cool = G.flags.lavaCooled;
    lavaMesh.material.color.setHSL(cool ? 0.55 : 0.05 + Math.sin(G.t * 1.7) * 0.012, cool ? 0.5 : 1, cool ? 0.45 : 0.5 + Math.sin(G.t * 2.3) * 0.05);
    lavaLight.intensity = cool ? 0 : 60 + Math.sin(G.t * 3) * 15;
  }
}

// ---------- Landmarks ----------
export function makeHut(scale = 1, roof = 0xc9a45a, wall = 0x8a6038) {
  const g = merge([
    part(new THREE.CylinderGeometry(1.8, 1.9, 2, 8), wall, { pos: [0, 1, 0] }),
    part(new THREE.ConeGeometry(2.7, 2.4, 8), roof, { pos: [0, 3.1, 0] }),
    part(new THREE.BoxGeometry(0.9, 1.4, 0.3), 0x2a1a10, { pos: [0, 0.7, 1.8] }),
  ]);
  const m = mesh(g); m.scale.setScalar(scale);
  return m;
}

function placeAt(obj, x, z, yOff = 0) { obj.position.set(x, heightAt(x, z) + yOff, z); return obj; }

function buildLandmarks(scene) {
  // --- Wreck of the Pualena ---
  const w = new THREE.Group();
  const hull = merge([
    part(new THREE.BoxGeometry(4, 2.2, 12), 0x6b4a2e, { pos: [0, 1.1, 0] }),
    part(new THREE.BoxGeometry(3.6, 0.3, 11.6), 0x8a6a44, { pos: [0, 2.2, 0] }),
    part(new THREE.ConeGeometry(2.05, 4, 4), 0x6b4a2e, { pos: [0, 1.1, 7.6], rot: [Math.PI / 2, Math.PI / 4, 0] }),
    part(new THREE.BoxGeometry(4.2, 0.35, 12.2), 0xf2f0e6, { pos: [0, 1.6, 0] }),
    part(new THREE.CylinderGeometry(0.18, 0.22, 7, 6), 0x5a3d24, { pos: [0.4, 4.5, -1], rot: [0.3, 0, 0.5] }),
    part(new THREE.BoxGeometry(0.06, 3, 2.6), 0xe9e3d0, { pos: [1.7, 5.4, -0.4], rot: [0.3, 0, 0.5] }),
    part(new THREE.BoxGeometry(1.2, 0.8, 1.6), 0x5a3d24, { pos: [-0.6, 2.7, -3.5] }),
  ]);
  w.add(mesh(hull));
  const lbl = makeLabel('PUALENA', '#f8f0d8', 'rgba(60,35,15,0.85)');
  lbl.position.set(2.15, 1.3, 1); lbl.scale.set(3, 0.75, 1);
  w.add(lbl);
  w.rotation.set(0.12, LOC.wreck.a + 0.6, -0.22);
  placeAt(w, LOC.wreck.x, LOC.wreck.z, -0.9);
  scene.add(w);
  addStatic({ x: LOC.wreck.x, z: LOC.wreck.z, r: 3.2, h: 4 });
  // crates around the wreck
  for (let i = 0; i < 4; i++) {
    const cr = mesh(part(new THREE.BoxGeometry(0.9, 0.9, 0.9), 0x8a6a44, { rot: [0, i, 0.1 * i] }));
    const ax = LOC.wreck.x - Math.cos(LOC.wreck.a) * (5 + i * 1.3) + Math.sin(i * 2) * 2;
    const az = LOC.wreck.z - Math.sin(LOC.wreck.a) * (5 + i * 1.3) + Math.cos(i * 2) * 2;
    scene.add(placeAt(cr, ax, az, 0.3));
  }

  // --- Malu's hut at the cove ---
  const hut = makeHut(1, 0xd2b06a, 0x7a5434);
  const hx = LOC.cove.x - Math.cos(LOC.cove.a) * -3, hz = LOC.cove.z - Math.sin(LOC.cove.a) * -3;
  placeAt(hut, hx + 3, hz, -0.2);
  hut.rotation.y = -Math.PI / 2;
  scene.add(hut);
  addStatic({ x: hx + 3, z: hz, r: 2, h: 4.2 });
  const fire = mesh(merge([
    part(new THREE.CylinderGeometry(0.7, 0.8, 0.25, 8), 0x555555),
    part(new THREE.ConeGeometry(0.35, 0.8, 5), 0xff8a2a, { pos: [0, 0.5, 0] }),
  ]), MAT.glow);
  scene.add(placeAt(fire, LOC.cove.x - 2, LOC.cove.z + 2.5, 0.1));

  // --- Freshwater spring ---
  const pool = new THREE.Mesh(new THREE.CircleGeometry(4.6, 16), new THREE.MeshPhongMaterial({ color: 0x47c1e0, transparent: true, opacity: 0.85, shininess: 100 }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(LOC.spring.x, LOC.springH - 1.2, LOC.spring.z);
  scene.add(pool);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const r = mesh(part(new THREE.DodecahedronGeometry(0.7, 0), 0x8b8b86, { scale: [1, 0.7, 1] }));
    scene.add(placeAt(r, LOC.spring.x + Math.cos(a) * 5.2, LOC.spring.z + Math.sin(a) * 5.2, 0.1));
  }

  // --- Kapu village huts ---
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const x = LOC.village.x + Math.cos(a) * 13, z = LOC.village.z + Math.sin(a) * 13;
    const h = makeHut(1.15, 0x9a7a3a, 0x5a3a24);
    h.rotation.y = -a - Math.PI / 2;
    scene.add(placeAt(h, x, z, -0.2));
    addStatic({ x, z, r: 2.2, h: 4.6 });
  }
  const vfire = mesh(merge([
    part(new THREE.CylinderGeometry(1.4, 1.5, 0.3, 10), 0x444444),
    part(new THREE.ConeGeometry(0.7, 1.6, 5), 0xff6a1a, { pos: [0, 0.9, 0] }),
  ]), MAT.glow);
  scene.add(placeAt(vfire, LOC.village.x, LOC.village.z, 0.1));

  // --- Volcano lava pool & smoke ---
  const crH = heightAt(VOLC.x, VOLC.z);
  LOC.craterH = crH;
  lavaMesh = new THREE.Mesh(new THREE.CircleGeometry(5.6, 20), new THREE.MeshBasicMaterial({ color: 0xff5a10 }));
  lavaMesh.rotation.x = -Math.PI / 2;
  lavaMesh.position.set(VOLC.x, crH + 0.25, VOLC.z);
  scene.add(lavaMesh);
  lavaLight = new THREE.PointLight(0xff5a1a, 60, 60, 1.6);
  lavaLight.position.set(VOLC.x, crH + 4, VOLC.z);
  scene.add(lavaLight);
  buildRegions(scene);
}

export function makeCanoe(len = 6) {
  return mesh(merge([
    part(new THREE.CapsuleGeometry(0.45, len - 0.9, 4, 10), 0x6b4226, { pos: [0, 0.35, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.7] }),
    part(new THREE.BoxGeometry(0.7, 0.08, len - 1.2), 0x3a2414, { pos: [0, 0.62, 0] }),
    part(new THREE.CapsuleGeometry(0.16, len * 0.55, 3, 8), 0xb08a5a, { pos: [1.7, 0.18, 0], rot: [Math.PI / 2, 0, 0] }),
    part(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 5), 0x8a6a44, { pos: [0.85, 0.55, len * 0.18], rot: [0, 0, Math.PI / 2] }),
    part(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 5), 0x8a6a44, { pos: [0.85, 0.55, -len * 0.18], rot: [0, 0, Math.PI / 2] }),
  ]));
}
function stoneStack(n = 4, col = 0x8b8780) {
  const ps = [];
  for (let i = 0; i < n; i++) ps.push(part(new THREE.DodecahedronGeometry(0.55 - i * 0.08, 0), col, { pos: [Math.sin(i * 2) * 0.08, 0.35 + i * 0.62, 0], scale: [1.1, 0.65, 1] }));
  return mesh(merge(ps));
}

function buildRegions(scene) {
  const rng = mulberry32(77);
  // --- Kahakai, the fishing village (north shore) ---
  const F = LOC.fishing, sea = { x: Math.cos(-1.62), z: Math.sin(-1.62) }, side = { x: -sea.z, z: sea.x };
  for (let i = 0; i < 6; i++) {
    const t = (i - 2.5) * 9;
    const x = F.x + side.x * t - sea.x * (6 + Math.abs(t) * 0.25), z = F.z + side.z * t - sea.z * (6 + Math.abs(t) * 0.25);
    const h = makeHut(1.05, 0xd8bb72, 0x9a6a3e);
    h.rotation.y = Math.atan2(sea.x, sea.z);
    scene.add(placeAt(h, x, z, -0.2));
    addStatic({ x, z, r: 2.1, h: 4.4 });
  }
  // canoe shed: a thatched roof on poles, with the voyaging canoe's slip under it
  LOC.canoe = { x: F.x + side.x * 30 + sea.x * 12, z: F.z + side.z * 30 + sea.z * 12 };
  const shed = mesh(merge([
    ...[[-2.5, -4], [2.5, -4], [-2.5, 4], [2.5, 4]].map(([a, b]) => part(new THREE.CylinderGeometry(0.12, 0.14, 3, 6), 0x6b4a2e, { pos: [a, 1.5, b] })),
    part(new THREE.ConeGeometry(4.6, 1.6, 4), 0xc9a45a, { pos: [0, 3.6, 0], rot: [0, Math.PI / 4, 0], scale: [0.85, 1, 1.5] }),
  ]));
  shed.rotation.y = Math.atan2(sea.x, sea.z);
  scene.add(placeAt(shed, LOC.canoe.x, LOC.canoe.z, 0));
  for (let i = 0; i < 3; i++) {
    const c = makeCanoe(5 + i * 0.6);
    const t = -14 + i * 7;
    c.rotation.y = Math.atan2(sea.x, sea.z) + 0.2 * i;
    scene.add(placeAt(c, F.x + side.x * t + sea.x * 16, F.z + side.z * t + sea.z * 16, 0));
  }
  for (let i = 0; i < 4; i++) {          // fish drying racks
    const r = mesh(merge([
      part(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 5), 0x6b4a2e, { pos: [-1, 0.9, 0] }), part(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 5), 0x6b4a2e, { pos: [1, 0.9, 0] }),
      part(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 5), 0x8a6a44, { pos: [0, 1.7, 0], rot: [0, 0, Math.PI / 2] }),
      ...[-0.6, -0.2, 0.2, 0.6].map((a) => part(new THREE.ConeGeometry(0.1, 0.45, 5), 0x9ab0c0, { pos: [a, 1.4, 0], rot: [Math.PI, 0, 0] })),
    ]));
    r.rotation.y = rng() * 3;
    scene.add(placeAt(r, F.x + side.x * (-22 + i * 5) + sea.x * 4, F.z + side.z * (-22 + i * 5) + sea.z * 4, 0));
  }
  const kfire = mesh(merge([part(new THREE.CylinderGeometry(1.1, 1.2, 0.25, 10), 0x555555), part(new THREE.ConeGeometry(0.55, 1.2, 5), 0xff8a2a, { pos: [0, 0.7, 0] })]), MAT.glow);
  scene.add(placeAt(kfire, F.x, F.z, 0.1));
  // taro fields
  for (let i = 0; i < 6; i++) for (let j = 0; j < 8; j++) {
    const x = LOC.fields.x + (i - 2.5) * 2.2, z = LOC.fields.z + (j - 3.5) * 1.6;
    const t = mesh(merge([part(new THREE.ConeGeometry(0.35, 0.7, 6), 0x2f7a2a, { pos: [0, 0.35, 0] }), part(new THREE.SphereGeometry(0.28, 8, 6), 0x3d8f34, { pos: [0, 0.75, 0], scale: [1.2, 0.4, 1.2] })]));
    scene.add(placeAt(t, x, z, 0));
  }
  scene.add(placeAt(makeLabelPost('KAHAKAI'), F.x + side.x * 4 - sea.x * 22, F.z + side.z * 4 - sea.z * 22, 0));

  // --- Highland Falls: a cascade over the cave mouth into a pool ---
  const cv = CAVES[1], fd = LOC.fallsDir;
  const top = heightAt(LOC.highlands.x + fd.x * 76, LOC.highlands.z + fd.z * 76);
  // two sheets: a long slide down the cliff over the cave roof, then a short curtain across the mouth
  const at = (r) => ({ x: LOC.highlands.x + fd.x * r, z: LOC.highlands.z + fd.z * r });
  const rMid = 86 + cv.R * 0.8, rBot = 86 + cv.R + 1.6;
  const pts = [{ ...at(77), y: top + 0.3 }, { ...at(rMid), y: cv.floor + cv.H * 0.62 + 0.9 }, { ...at(rBot), y: cv.floor - 0.4 }];
  const cvs = document.createElement('canvas'); cvs.width = 64; cvs.height = 256;
  const cx = cvs.getContext('2d');
  cx.fillStyle = 'rgba(200,235,255,0.55)'; cx.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 70; i++) { cx.fillStyle = `rgba(255,255,255,${0.3 + rng() * 0.6})`; cx.fillRect(rng() * 64, rng() * 256, 1 + rng() * 3, 20 + rng() * 60); }
  fallsTex = new THREE.CanvasTexture(cvs);
  fallsTex.wrapS = fallsTex.wrapT = THREE.RepeatWrapping; fallsTex.repeat.set(1, 2);
  fallsTex.colorSpace = THREE.SRGBColorSpace;
  const fmat = new THREE.MeshBasicMaterial({ map: fallsTex, transparent: true, opacity: 0.88, depthWrite: false, side: THREE.DoubleSide });
  for (let k = 0; k < 2; k++) {
    const p0 = pts[k], p1 = pts[k + 1];
    const run = Math.hypot(p1.x - p0.x, p1.z - p0.z), drop = p0.y - p1.y, len = Math.hypot(run, drop);
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(k ? 7.5 : 8.5, len + 0.6, 1, 1), fmat);
    sheet.position.set((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
    sheet.lookAt(sheet.position.x + fd.x * drop, sheet.position.y + run, sheet.position.z + fd.z * drop);
    sheet.renderOrder = 2;
    scene.add(sheet);
  }
  const p1 = pts[2];
  const pool = new THREE.Mesh(new THREE.CircleGeometry(7.5, 20), new THREE.MeshPhongMaterial({ color: 0x47c1e0, transparent: true, opacity: 0.85, shininess: 100 }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(LOC.falls.x, LOC.fallsH - 0.7, LOC.falls.z);
  scene.add(pool);
  const foam = mesh(merge(Array.from({ length: 9 }, (_, i) => part(new THREE.SphereGeometry(0.6 + rng() * 0.5, 8, 6), 0xffffff, { pos: [(i - 4) * 0.9, 0, rng() * 0.8], scale: [1, 0.45, 1] }))), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7 }));
  foam.position.set(p1.x + fd.x * 0.8, cv.floor - 0.5, p1.z + fd.z * 0.8); foam.rotation.y = Math.atan2(fd.x, fd.z);
  scene.add(foam);

  // --- Black-sand beach & the lava fields (south-east) ---
  for (let i = 0; i < 3; i++) {
    const tk = mesh(merge([
      part(new THREE.CylinderGeometry(0.45, 0.55, 2.6, 8), 0x5a3d24, { pos: [0, 1.3, 0] }),
      part(new THREE.BoxGeometry(0.8, 0.22, 0.12), 0xf0e0c0, { pos: [0, 1.6, 0.48] }),
      part(new THREE.SphereGeometry(0.12, 8, 6), 0x111111, { pos: [0.2, 2.0, 0.47] }), part(new THREE.SphereGeometry(0.12, 8, 6), 0x111111, { pos: [-0.2, 2.0, 0.47] }),
    ]));
    const a = LOC.blackSand.a + Math.PI + (i - 1) * 0.5;
    const x = LOC.blackSand.x + Math.cos(a) * 9, z = LOC.blackSand.z + Math.sin(a) * 9;
    tk.rotation.y = Math.atan2(LOC.blackSand.x - x, LOC.blackSand.z - z);
    scene.add(placeAt(tk, x, z, 0)); addStatic({ x, z, r: 0.6, h: 2.6 });
  }
  const cracks = [];
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2, r = 6 + rng() * 48;
    const x = LOC.lavaField.x + Math.cos(a) * r, z = LOC.lavaField.z + Math.sin(a) * r;
    cracks.push(part(new THREE.BoxGeometry(0.25 + rng() * 0.3, 0.08, 2 + rng() * 5), 0xff5a10, { pos: [x, heightAt(x, z) + 0.04, z], rot: [0, rng() * 3, 0] }));
  }
  scene.add(mesh(merge(cracks), MAT.glow));

  // --- The islet: a ring of old stones around Pele's shrine ---
  const I = LOC.islet;
  LOC.shrine = { x: I.x, z: I.z };
  const sh = mesh(merge([
    part(new THREE.CylinderGeometry(3.2, 3.6, 0.6, 14), 0x6e6a64, { pos: [0, 0.3, 0] }),
    part(new THREE.CylinderGeometry(1.1, 0.8, 0.9, 10), 0x4a4440, { pos: [0, 1.0, 0] }),
    ...Array.from({ length: 6 }, (_, i) => part(new THREE.BoxGeometry(0.6, 2.2 + (i % 2) * 0.6, 0.5), 0x7a756e, { pos: [Math.cos(i * 1.047) * 4.2, 1.1, Math.sin(i * 1.047) * 4.2], rot: [0, -i * 1.047, 0] })),
  ]));
  scene.add(placeAt(sh, I.x, I.z, -0.1));
  G.shrineY = heightAt(I.x, I.z) + 1.5;
  addStatic({ x: I.x, z: I.z, r: 1.2, h: 1.4 });

  // --- petroglyph stone near the spring: a hint toward the lava tube ---
  LOC.petro = { x: LOC.spring.x + 9, z: LOC.spring.z + 5 };
  const pg = mesh(merge([
    part(new THREE.DodecahedronGeometry(1.3, 1), 0x8a857c, { pos: [0, 0.7, 0], scale: [1.4, 0.8, 0.6] }),
    part(new THREE.TorusGeometry(0.35, 0.05, 4, 12), 0x3a2a20, { pos: [-0.5, 0.95, 0.66] }),
    part(new THREE.ConeGeometry(0.35, 0.6, 3), 0x3a2a20, { pos: [0.45, 0.95, 0.68], scale: [1, 1, 0.1] }),
    part(new THREE.BoxGeometry(0.9, 0.05, 0.05), 0x3a2a20, { pos: [0, 0.5, 0.7] }),
  ]));
  pg.rotation.y = rng() * 6;
  scene.add(placeAt(pg, LOC.petro.x, LOC.petro.z, 0)); addStatic({ x: LOC.petro.x, z: LOC.petro.z, r: 1.4, h: 1.4 });

  // --- lookout cairns ---
  for (const k of ['rim', 'highPeak', 'islet']) {
    const L = k === 'islet' ? { x: LOC.islet.x + 6, z: LOC.islet.z - 6 } : LOC[k];
    LOC['look_' + k] = L;
    scene.add(placeAt(stoneStack(5), L.x, L.z, 0));
  }
}

function makeLabelPost(text) {
  const g = new THREE.Group();
  g.add(mesh(merge([part(new THREE.CylinderGeometry(0.1, 0.12, 2.4, 6), 0x6b4a2e, { pos: [0, 1.2, 0] }), part(new THREE.BoxGeometry(2.4, 0.6, 0.1), 0x8a6a44, { pos: [0, 2.1, 0] })])));
  const l = makeLabel(text, '#f8f0d8', 'rgba(60,35,15,0.85)'); l.position.set(0, 2.1, 0.1); l.scale.set(2.2, 0.55, 1);
  g.add(l);
  return g;
}
