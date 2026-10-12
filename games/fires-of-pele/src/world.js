// Terrain, water, sky, day/night cycle and island landmarks.
import * as THREE from 'three';
import { G, CFG } from './state.js';
import { fbm, clamp, lerp, smoothstep, mulberry32, part, merge, MAT, mesh, makeLabel } from './util.js';
import { addStatic } from './physics.js';

export const WORLD = 320, SEG = 170;
const CW = WORLD / SEG;
export const VOLC = { x: 8, z: -48 };
export const LOC = {};
let H = null;

function baseHeight(x, z) {
  const ang = Math.atan2(z, x);
  const d = Math.hypot(x, z);
  const R = 104 + 9 * Math.sin(ang * 3 + 1) + 6 * Math.sin(ang * 5 + 2) + 10 * fbm(Math.cos(ang) * 1.5 + 5, Math.sin(ang) * 1.5 + 5, 3);
  const e = 1 - d / R;
  let h;
  if (e < 0) h = -1.6 + e * 45;
  else h = -1.6 + Math.pow(Math.min(e * 4.5, 1), 0.8) * 3.6 + Math.max(0, e - 0.16) * 13 * (0.7 + 0.9 * fbm(x * 0.018 + 3, z * 0.018, 4));
  h += fbm(x * 0.07, z * 0.07, 3) * 1.1 * clamp(e * 6, 0, 1);
  const dv = Math.hypot(x - VOLC.x, z - VOLC.z);
  const cone = Math.max(0, 1 - dv / 46);
  h += Math.pow(cone, 1.55) * 40 * (0.92 + 0.08 * fbm(x * 0.2, z * 0.2, 2));
  h -= smoothstep(9.5, 3, dv) * 13;
  return Math.max(h, -14);
}

function shoreDist(angle) {
  for (let d = 25; d < 160; d += 0.5) if (baseHeight(Math.cos(angle) * d, Math.sin(angle) * d) < 0.3) return d;
  return 100;
}
const atAngle = (a, d) => ({ x: Math.cos(a) * d, z: Math.sin(a) * d, a });

function computeLocations() {
  const sw = shoreDist(1.45);
  LOC.wreck = atAngle(1.45, sw + 3);
  LOC.camp = atAngle(1.45, sw - 15);
  const sc = shoreDist(Math.PI * 0.97);
  LOC.cove = atAngle(Math.PI * 0.97, sc - 9);
  const sv = shoreDist(-0.12);
  LOC.village = atAngle(-0.12, sv - 30);
  const sd = shoreDist(-2.45);
  LOC.den = atAngle(-2.45, sd * 0.55);
  const ss = shoreDist(1.9);
  LOC.spring = atAngle(1.9, ss - 30);
  LOC.volcano = { x: VOLC.x, z: VOLC.z };
  LOC.campH = baseHeight(LOC.camp.x, LOC.camp.z);
  LOC.villageH = baseHeight(LOC.village.x, LOC.village.z);
  LOC.springH = baseHeight(LOC.spring.x, LOC.spring.z);
}

function rawHeight(x, z) {
  let h = baseHeight(x, z);
  // flatten camp & village so building is easier
  const dc = Math.hypot(x - LOC.camp.x, z - LOC.camp.z);
  h = lerp(h, Math.max(LOC.campH, 1.4), smoothstep(24, 12, dc));
  const dvl = Math.hypot(x - LOC.village.x, z - LOC.village.z);
  h = lerp(h, LOC.villageH, smoothstep(24, 14, dvl));
  const ds = Math.hypot(x - LOC.spring.x, z - LOC.spring.z);
  h -= smoothstep(6.5, 1, ds) * 2.2;
  return h;
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

let terrain;
export function buildTerrain(scene) {
  computeLocations();
  const N = SEG + 1;
  H = new Float32Array(N * N);
  for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) H[iz * N + ix] = rawHeight(-WORLD / 2 + ix * CW, -WORLD / 2 + iz * CW);
  let geo = new THREE.PlaneGeometry(WORLD, WORLD, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const ix = Math.round((p.getX(i) + WORLD / 2) / CW), iz = Math.round((p.getZ(i) + WORLD / 2) / CW);
    p.setY(i, H[iz * N + ix]);
  }
  geo = geo.toNonIndexed();
  geo.computeVertexNormals();
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const rng = mulberry32(7);
  const c = new THREE.Color(), tmp = new THREE.Color();
  const C = {
    seabed: new THREE.Color(0x8a7a52), wetsand: new THREE.Color(0xcdb98a), sand: new THREE.Color(0xead9a6),
    grass: new THREE.Color(0x5e9e3c), grass2: new THREE.Color(0x46852f), jungle: new THREE.Color(0x356f2a),
    rock: new THREE.Color(0x6e6258), basalt: new THREE.Color(0x3b3330), ash: new THREE.Color(0x2a2220), cliff: new THREE.Color(0x7d7468),
  };
  for (let i = 0; i < pos.count; i += 3) {
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const ny = nor.getY(i);
    const dv = distVolcano(x, z);
    if (y < -0.4) c.copy(C.seabed);
    else if (y < 0.5) c.copy(C.wetsand);
    else if (y < 1.9) c.copy(C.sand);
    else {
      const n = fbm(x * 0.05, z * 0.05, 2);
      c.copy(C.grass).lerp(C.grass2, clamp(n * 1.5 + 0.5, 0, 1));
      if (y > 6) c.lerp(C.jungle, clamp((y - 6) / 8, 0, 0.8));
      if (dv < 40) c.lerp(C.rock, smoothstep(40, 26, dv));
      if (dv < 22) c.lerp(C.basalt, smoothstep(22, 13, dv));
      if (dv < 8) c.copy(C.ash);
      if (ny < 0.72 && dv >= 22) c.lerp(C.cliff, 0.6);
    }
    const j = 0.94 + rng() * 0.12;
    tmp.copy(c).multiplyScalar(j);
    for (let k = 0; k < 3; k++) { col[(i + k) * 3] = tmp.r; col[(i + k) * 3 + 1] = tmp.g; col[(i + k) * 3 + 2] = tmp.b; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  terrain.receiveShadow = true;
  terrain.name = 'terrain';
  scene.add(terrain);
  G.terrain = terrain;
  buildWater(scene);
  buildLandmarks(scene);
  return terrain;
}

// ---------- Water ----------
export const waterUniforms = { uTime: { value: 0 } };
function buildWater(scene) {
  const geo = new THREE.PlaneGeometry(1400, 1400, 140, 140);
  const mat = new THREE.MeshPhongMaterial({ color: 0x2b9cc4, transparent: true, opacity: 0.82, shininess: 120, specular: 0x99ddff, flatShading: true });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = waterUniforms.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 wpw = modelMatrix * vec4(position, 1.0);
      transformed.z += sin(wpw.x * 0.17 + uTime * 1.3) * 0.18 + cos(wpw.z * 0.13 + uTime * 0.9) * 0.18;`);
  };
  const w = new THREE.Mesh(geo, mat);
  w.rotation.x = -Math.PI / 2;
  w.position.y = 0;
  w.receiveShadow = true;
  scene.add(w);
  G.water = w;
}

// ---------- Sky & lighting ----------
let hemi, sun, stars, sunMesh, moonMesh, lavaLight, lavaMesh;
export function initSky(scene) {
  scene.background = new THREE.Color(0x8fd3ff);
  scene.fog = new THREE.Fog(0x8fd3ff, 70, 280);
  hemi = new THREE.HemisphereLight(0xcfeaff, 0x5a7040, 0.8);
  scene.add(hemi);
  sun = new THREE.DirectionalLight(0xfff2dd, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
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

const SKY_DAY = new THREE.Color(0x8fd3ff), SKY_NIGHT = new THREE.Color(0x0a1230), SKY_SET = new THREE.Color(0xff9a5c);
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
  G.scene.fog.far = lerp(170, 280, L);
  if (!ti.isNight) {
    sun.color.setHex(0xfff2dd).lerp(SKY_SET, sunset * 0.6);
    sun.intensity = lerp(0.25, 1.7, L);
  } else {
    sun.color.setHex(0x8fa8ff);
    sun.intensity = 0.32 * clamp(elev * 3, 0.3, 1);
  }
  hemi.intensity = lerp(0.28, 0.85, L);
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
  addStatic({ x: LOC.wreck.x, z: LOC.wreck.z, r: 3.2 });
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
  addStatic({ x: hx + 3, z: hz, r: 2 });
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
    addStatic({ x, z, r: 2.2 });
  }
  const vfire = mesh(merge([
    part(new THREE.CylinderGeometry(1.4, 1.5, 0.3, 10), 0x444444),
    part(new THREE.ConeGeometry(0.7, 1.6, 5), 0xff6a1a, { pos: [0, 0.9, 0] }),
  ]), MAT.glow);
  scene.add(placeAt(vfire, LOC.village.x, LOC.village.z, 0.1));

  // --- Volcano lava pool & smoke ---
  const crH = heightAt(VOLC.x, VOLC.z);
  LOC.craterH = crH;
  lavaMesh = new THREE.Mesh(new THREE.CircleGeometry(4.2, 18), new THREE.MeshBasicMaterial({ color: 0xff5a10 }));
  lavaMesh.rotation.x = -Math.PI / 2;
  lavaMesh.position.set(VOLC.x, crH + 0.25, VOLC.z);
  scene.add(lavaMesh);
  lavaLight = new THREE.PointLight(0xff5a1a, 60, 45, 1.6);
  lavaLight.position.set(VOLC.x, crH + 4, VOLC.z);
  scene.add(lavaLight);
}
