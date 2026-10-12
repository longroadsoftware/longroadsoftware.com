import * as THREE from 'three';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const dist2D = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------- Perlin noise ----------
const perm = new Uint8Array(512);
(() => {
  const r = mulberry32(1337);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
})();
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
function grad(h, x, y) {
  switch (h & 7) {
    case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y;
    case 4: return x; case 5: return -x; case 6: return y; default: return -y;
  }
}
export function noise2(x, y) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
  x -= Math.floor(x); y -= Math.floor(y);
  const u = fade(x), v = fade(y);
  const aa = perm[perm[X] + Y], ab = perm[perm[X] + Y + 1], ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1];
  return lerp(lerp(grad(aa, x, y), grad(ba, x - 1, y), u), lerp(grad(ab, x, y - 1), grad(bb, x - 1, y - 1), u), v);
}
export function fbm(x, y, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise2(x * f, y * f); n += a; a *= 0.5; f *= 2; }
  return s / n;
}

// ---------- Low-poly geometry helpers ----------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
export function part(geo, color, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  _e.set(rot[0], rot[1], rot[2], rot[3] || 'XYZ');
  _m.compose(_v.set(pos[0], pos[1], pos[2]), _q.setFromEuler(_e), _s.set(scale[0], scale[1], scale[2]));
  g.applyMatrix4(_m);
  const n = g.attributes.position.count;
  const c = new THREE.Color(color);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
export function merge(parts) {
  let total = 0;
  for (const p of parts) total += p.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  for (const p of parts) {
    if (!p.attributes.normal) p.computeVertexNormals();
    pos.set(p.attributes.position.array, o * 3);
    nor.set(p.attributes.normal.array, o * 3);
    col.set(p.attributes.color.array, o * 3);
    o += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

export const MAT = {
  std: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  shiny: new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 90, specular: 0x8866cc }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
};
export function mesh(geo, mat = MAT.std, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow; m.receiveShadow = true;
  return m;
}
export function glowMesh(geo, color) {
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
  return m;
}

// Billboard health bar
const barGeo = new THREE.PlaneGeometry(1, 0.12).translate(0.5, 0, 0);
export class HealthBar {
  constructor(width = 1.2, y = 2.3, color = 0xe04030) {
    this.group = new THREE.Group();
    this.group.position.y = y;
    this.bg = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.6, depthWrite: false }));
    this.fg = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color, depthWrite: false }));
    this.bg.scale.x = width; this.bg.position.x = -width / 2;
    this.fg.scale.x = width; this.fg.position.x = -width / 2; this.fg.position.z = 0.01;
    this.width = width;
    this.group.add(this.bg, this.fg);
    this.group.visible = false;
    this.group.renderOrder = 10;
  }
  set(p, camera) {
    p = clamp(p, 0, 1);
    this.fg.scale.x = Math.max(0.001, this.width * p);
    this.group.visible = p < 0.999 && p > 0;
    if (this.group.visible && camera) this.group.quaternion.copy(camera.quaternion);
    // counter parent rotation so it faces camera in world space
    if (this.group.visible && this.group.parent) {
      const pq = new THREE.Quaternion();
      this.group.parent.getWorldQuaternion(pq);
      this.group.quaternion.premultiply(pq.invert());
    }
  }
}

export function makeLabel(text, color = '#fff', bg = 'rgba(0,0,0,0.45)') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.font = 'bold 34px system-ui, sans-serif';
  const w = Math.min(250, x.measureText(text).width + 24);
  x.fillStyle = bg;
  x.beginPath(); x.roundRect((256 - w) / 2, 8, w, 48, 14); x.fill();
  x.fillStyle = color; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  s.scale.set(2, 0.5, 1);
  return s;
}
