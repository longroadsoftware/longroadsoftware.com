// Base building: pieces, tiers, placement, upgrades, turrets, traps and inventions.
import * as THREE from 'three';
import { G, count, hasRes, payRes, costStr } from './state.js';
import { part, merge, mesh, MAT, HealthBar, clamp } from './util.js';
import { heightAt, LOC } from './world.js';
import { input, pressed } from './input.js';
import { burst, sfx } from './fx.js';
import { spawnProjectile } from './projectiles.js';
import { toast } from './ui.js';

const TIER_NAME = ['Wood', 'Stone', 'Obsidian'];
export const PIECES = {
  hearth: { name: 'Hearth', icon: '🔥', cost: [{ wood: 10, stone: 3 }], hp: [400], block: true, r: 1.0, desc: 'Heart of your base. Raiders are drawn to it.' },
  wall: { name: 'Wall', icon: '🧱', cost: [{ wood: 6 }, { stone: 8 }, { obsidian: 6 }], hp: [150, 450, 1000], block: true, seg: true, desc: 'Blocks raiders. Upgrade: wood → stone → obsidian.' },
  gate: { name: 'Gate', icon: '🚪', cost: [{ wood: 8, fiber: 2 }, { stone: 10 }, { obsidian: 8 }], hp: [140, 420, 950], block: true, seg: true, gate: true, desc: 'You and your animals pass. Raiders do not.' },
  spikes: { name: 'Spike Trap', icon: '⚔️', cost: [{ wood: 4, fiber: 2 }, { stone: 5 }, { obsidian: 4 }], hp: [80, 160, 320], dps: [12, 20, 32], desc: 'Hurts and slows raiders who step on it.' },
  tower: { name: 'Sling Tower', icon: '🗼', cost: [{ wood: 14, fiber: 5 }, { stone: 12 }, { obsidian: 8 }], hp: [200, 500, 1000], block: true, r: 1.1, range: 22, dmg: [8, 12, 18], cd: [1.6, 1.3, 1.0], desc: 'Automatically slings stones at raiders.' },
  torch: { name: 'Tiki Torch', icon: '🕯️', cost: [{ wood: 2, fiber: 1 }], hp: [40], desc: 'Lights up the night.' },
  rain: { name: 'Rain Catcher', icon: '💧', cost: [{ wood: 8, fiber: 6 }], hp: [90], block: true, r: 0.8, produce: 'water', every: 40, cap: 4, invention: true, desc: 'Collects fresh water over time.' },
  garden: { name: 'Taro Garden', icon: '🌱', cost: [{ wood: 6, fiber: 4, food: 2 }], hp: [70], produce: 'food', every: 55, cap: 4, invention: true, desc: 'Grows food over time.' },
  fishtrap: { name: 'Fish Trap', icon: '🐟', cost: [{ wood: 8, fiber: 8 }], hp: [70], produce: 'food', every: 35, cap: 4, shore: true, invention: true, desc: 'Must be placed at the shoreline. Catches fish.' },
  kennel: { name: 'Pet Hale', icon: '🐾', cost: [{ wood: 16, stone: 8 }], hp: [220], block: true, r: 1.3, invention: true, desc: 'Lets you keep 2 more animals and heals them faster.' },
  ballista: { name: 'Obsidian Ballista', icon: '🏹', cost: [{ wood: 15, obsidian: 10, fiber: 8 }], hp: [450], block: true, r: 0.95, range: 30, dmg: [45], cd: [2.4], invention: true, desc: 'Heavy turret. Huge damage, long range.' },
};
export const INVENTIONS = {
  rain: { research: { wood: 10, fiber: 10 }, minCh: 1 },
  garden: { research: { wood: 8, fiber: 6, food: 4 }, minCh: 1 },
  fishtrap: { research: { wood: 12, fiber: 12 }, minCh: 1 },
  kennel: { research: { wood: 20, stone: 10 }, minCh: 1 },
  ballista: { research: { obsidian: 12, wood: 20, fiber: 10 }, minCh: 2 },
};

const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const TC = [0x8a6038, 0x8e8c88, 0x2a2036];
const TC2 = [0x6b4a2e, 0x75736f, 0x5a3a8a];

function pieceGeo(type, tier) {
  const c = TC[tier], c2 = TC2[tier];
  const ps = [];
  switch (type) {
    case 'wall':
      if (tier === 0) {
        for (let i = 0; i < 5; i++) {
          const x = -0.8 + i * 0.4;
          ps.push(part(new THREE.CylinderGeometry(0.2, 0.22, 2.9, 6), i % 2 ? c : c2, { pos: [x, 0.55, 0] }));
          ps.push(part(new THREE.ConeGeometry(0.2, 0.45, 6), c, { pos: [x, 2.22, 0] }));
        }
        ps.push(part(B(2.0, 0.14, 0.5), 0xc8b070, { pos: [0, 1.4, 0] }), part(B(2.0, 0.14, 0.5), 0xc8b070, { pos: [0, 0.5, 0] }));
      } else {
        const h = tier === 2 ? 3.0 : 2.7;
        ps.push(part(B(2.02, h, 0.62), c, { pos: [0, h / 2 - 0.6, 0] }));
        for (let i = 0; i < 6; i++) ps.push(part(B(0.6, 0.35, 0.66), i % 2 ? c2 : c, { pos: [-0.7 + (i % 3) * 0.7, 0.2 + Math.floor(i / 3) * 0.8, 0] }));
        if (tier === 1) for (let i = 0; i < 3; i++) ps.push(part(B(0.42, 0.4, 0.66), c, { pos: [-0.7 + i * 0.7, h - 0.4, 0] }));
        else for (let i = 0; i < 4; i++) ps.push(part(new THREE.ConeGeometry(0.16, 0.7, 4), 0x7a4ac0, { pos: [-0.75 + i * 0.5, h - 0.25, 0] }));
      }
      break;
    case 'gate':
      ps.push(part(B(0.3, 3.0, 0.6), c, { pos: [-0.86, 0.9, 0] }), part(B(0.3, 3.0, 0.6), c, { pos: [0.86, 0.9, 0] }));
      ps.push(part(B(2.0, 0.35, 0.6), c, { pos: [0, 2.3, 0] }));
      ps.push(part(B(1.4, 2.0, 0.18), tier === 0 ? 0xb08050 : c2, { pos: [0, 0.95, 0] }));
      ps.push(part(B(1.4, 0.12, 0.22), 0x3a2a1a, { pos: [0, 1.3, 0] }), part(B(1.4, 0.12, 0.22), 0x3a2a1a, { pos: [0, 0.5, 0] }));
      break;
    case 'spikes':
      ps.push(part(B(1.9, 0.18, 1.9), tier === 0 ? 0x6b4a2e : c2, { pos: [0, 0.05, 0] }));
      for (let i = 0; i < 9; i++) ps.push(part(new THREE.ConeGeometry(0.09, 0.7, 4), tier === 2 ? 0x7a4ac0 : c, { pos: [-0.6 + (i % 3) * 0.6, 0.45, -0.6 + Math.floor(i / 3) * 0.6] }));
      break;
    case 'tower':
      for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) ps.push(part(new THREE.CylinderGeometry(0.13, 0.16, 3.8, 6), c2, { pos: [x, 1.4, z] }));
      ps.push(part(B(2.0, 0.25, 2.0), c, { pos: [0, 3.2, 0] }));
      ps.push(part(B(2.0, 0.6, 0.12), c, { pos: [0, 3.6, 0.95] }), part(B(2.0, 0.6, 0.12), c, { pos: [0, 3.6, -0.95] }));
      ps.push(part(B(0.12, 0.6, 2.0), c, { pos: [0.95, 3.6, 0] }), part(B(0.12, 0.6, 2.0), c, { pos: [-0.95, 3.6, 0] }));
      ps.push(part(new THREE.ConeGeometry(1.6, 1.1, 4), 0xc9a45a, { pos: [0, 4.9, 0], rot: [0, Math.PI / 4, 0] }));
      for (const x of [-0.7, 0.7]) ps.push(part(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 4), c2, { pos: [x, 3.9, x] }));
      break;
    case 'torch':
      ps.push(part(new THREE.CylinderGeometry(0.07, 0.09, 2.0, 5), 0x6b4a2e, { pos: [0, 0.9, 0] }));
      ps.push(part(new THREE.CylinderGeometry(0.16, 0.1, 0.35, 6), 0xc8b070, { pos: [0, 1.95, 0] }));
      break;
    case 'hearth':
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ps.push(part(new THREE.DodecahedronGeometry(0.28, 0), 0x777777, { pos: [Math.cos(a) * 0.85, 0.15, Math.sin(a) * 0.85] })); }
      ps.push(part(new THREE.CylinderGeometry(0.1, 0.1, 1.3, 5), 0x5a3d24, { pos: [0, 0.25, 0], rot: [0, 0, Math.PI / 2 - 0.2] }));
      ps.push(part(new THREE.CylinderGeometry(0.1, 0.1, 1.3, 5), 0x5a3d24, { pos: [0, 0.25, 0], rot: [Math.PI / 2 - 0.2, 0, 0] }));
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; ps.push(part(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 5), 0x7a5a36, { pos: [Math.cos(a) * 1.1, 1.0, Math.sin(a) * 1.1], rot: [Math.sin(a) * -0.25, 0, Math.cos(a) * 0.25] })); }
      break;
    case 'rain':
      ps.push(part(new THREE.CylinderGeometry(0.45, 0.45, 1.0, 8), 0x7a5a36, { pos: [0, 0.5, 0] }));
      ps.push(part(new THREE.CylinderGeometry(0.47, 0.47, 0.08, 8), 0x3a2a1a, { pos: [0, 0.3, 0] }), part(new THREE.CylinderGeometry(0.47, 0.47, 0.08, 8), 0x3a2a1a, { pos: [0, 0.75, 0] }));
      ps.push(part(new THREE.ConeGeometry(1.2, 0.8, 8, 1, true), 0x5aa040, { pos: [0, 1.5, 0], rot: [Math.PI, 0, 0] }));
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; ps.push(part(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 4), 0x6b4a2e, { pos: [Math.cos(a) * 0.8, 0.95, Math.sin(a) * 0.8] })); }
      break;
    case 'garden':
      ps.push(part(B(1.9, 0.25, 1.9), 0x4a3020, { pos: [0, 0.05, 0] }));
      for (const x of [-0.95, 0.95]) ps.push(part(B(0.1, 0.35, 1.95), 0x8a6038, { pos: [x, 0.12, 0] }));
      for (let i = 0; i < 6; i++) {
        const x = -0.5 + (i % 3) * 0.5, z = -0.4 + Math.floor(i / 3) * 0.8;
        ps.push(part(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 4), 0x5a9a3a, { pos: [x, 0.45, z] }));
        ps.push(part(new THREE.ConeGeometry(0.32, 0.1, 5), 0x3f8a2f, { pos: [x, 0.78, z + 0.1], rot: [0.5, i, 0] }));
      }
      break;
    case 'fishtrap':
      for (let i = 0; i < 4; i++) ps.push(part(new THREE.TorusGeometry(0.5 - i * 0.1, 0.04, 4, 8), 0xc8a060, { pos: [0, 0.3, -0.4 + i * 0.3] }));
      ps.push(part(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 4), 0x6b4a2e, { pos: [0.7, 0.6, 0] }), part(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 4), 0x6b4a2e, { pos: [-0.7, 0.6, 0] }));
      ps.push(part(B(1.5, 0.08, 0.08), 0x6b4a2e, { pos: [0, 1.5, 0] }));
      break;
    case 'kennel':
      ps.push(part(B(2.0, 1.3, 1.8), 0x8a6038, { pos: [0, 0.6, 0] }));
      ps.push(part(new THREE.ConeGeometry(1.7, 1.0, 4), 0xc9a45a, { pos: [0, 1.75, 0], rot: [0, Math.PI / 4, 0] }));
      ps.push(part(B(0.8, 0.8, 0.1), 0x2a1a10, { pos: [0, 0.4, 0.9] }));
      ps.push(part(new THREE.CylinderGeometry(0.25, 0.2, 0.12, 8), 0x9a3a2a, { pos: [0.7, 0.06, 1.3] }));
      break;
    case 'ballista':
      ps.push(part(new THREE.CylinderGeometry(0.7, 0.85, 0.7, 8), 0x2a2036, { pos: [0, 0.35, 0] }));
      ps.push(part(B(0.25, 0.8, 0.25), 0x5a3d24, { pos: [0, 1.0, 0] }));
      break;
  }
  return merge(ps);
}

function ballistaHead() {
  return mesh(merge([
    part(B(0.25, 0.25, 1.8), 0x5a3d24, { pos: [0, 0, 0.2] }),
    part(B(2.2, 0.12, 0.14), 0x2a2036, { pos: [0, 0, 0.8] }),
    part(new THREE.ConeGeometry(0.1, 0.3, 4), 0x7a4ac0, { pos: [0, 0.1, 1.25], rot: [Math.PI / 2, 0, 0] }),
    part(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 4), 0xdddddd, { pos: [0, 0.1, 0.5], rot: [Math.PI / 2, 0, 0] }),
  ]), MAT.shiny);
}

// ---------- torch light pool ----------
const lightPool = [];
export function initBuildingLights(scene) {
  for (let i = 0; i < 6; i++) {
    const l = new THREE.PointLight(0xff9a40, 0, 16, 1.6);
    scene.add(l); lightPool.push(l);
  }
}

let nextId = 1;
export class Structure {
  constructor(type, x, z, rot = 0, tier = 0) {
    this.id = nextId++;
    this.type = type; this.def = PIECES[type];
    this.x = x; this.z = z; this.rot = rot; this.tier = tier;
    this.alive = true;
    this.block = !!this.def.block; this.gate = !!this.def.gate;
    this.r = this.def.r || 1;
    this.thick = 0.38;
    if (this.def.seg) {
      const dx = Math.cos(rot), dz = -Math.sin(rot);
      this.seg = { ax: x - dx, az: z - dz, bx: x + dx, bz: z + dz };
    }
    this.y = this.def.seg ? Math.min(heightAt(x, z), heightAt(this.seg.ax, this.seg.az), heightAt(this.seg.bx, this.seg.bz)) : heightAt(x, z);
    this.pos = new THREE.Vector3(x, this.y + 1, z);
    this.group = new THREE.Group();
    this.group.position.set(x, this.y, z);
    this.group.rotation.y = rot;
    this.hp = this.maxHp;
    this.store = 0; this.prodT = 0; this.cd = 0;
    this.bar = new HealthBar(1.6, this.def.seg ? 3.0 : 2.6, 0x60d040);
    this.group.add(this.bar.group);
    this.build();
    G.scene.add(this.group);
  }
  get maxHp() { return this.def.hp[this.tier]; }
  get name() { return (this.def.cost.length > 1 ? TIER_NAME[this.tier] + ' ' : '') + this.def.name; }
  build() {
    if (this.body) this.group.remove(this.body);
    this.body = new THREE.Group();
    this.body.add(mesh(pieceGeo(this.type, this.tier), this.tier === 2 ? MAT.shiny : MAT.std));
    if (this.type === 'torch' || this.type === 'hearth') {
      const fl = new THREE.Mesh(new THREE.OctahedronGeometry(this.type === 'hearth' ? 0.5 : 0.22, 0), new THREE.MeshBasicMaterial({ color: 0xffa030 }));
      fl.position.y = this.type === 'hearth' ? 0.6 : 2.3; fl.scale.y = 1.7;
      this.flame = fl; this.body.add(fl);
    }
    if (this.type === 'ballista') { this.head = ballistaHead(); this.head.position.y = 1.5; this.body.add(this.head); }
    if (this.def.produce) {
      const ic = new THREE.Mesh(new THREE.OctahedronGeometry(0.25, 0), new THREE.MeshBasicMaterial({ color: this.def.produce === 'water' ? 0x40b0ff : 0xffb030 }));
      ic.position.y = 2.3; ic.visible = false; this.icon = ic; this.body.add(ic);
    }
    this.group.add(this.body);
  }
  hurt(n, src) {
    if (!this.alive) return;
    if (this.type === 'hearth' && this.doused) return;
    this.hp -= n;
    this.flash = 0.15;
    if (this.hp <= 0) {
      if (this.type === 'hearth') { douseHearth(); return; }
      this.destroy();
    }
  }
  destroy(silent) {
    this.alive = false;
    G.scene.remove(this.group);
    G.structures = G.structures.filter((s) => s !== this);
    if (!silent) {
      burst(this.pos, TC[this.tier], 18, 6, 0.2);
      sfx('crumble');
      toast(`Your ${this.name} was destroyed!`, 'bad');
    }
  }
  setTier(t) { const pct = this.hp / this.maxHp; this.tier = t; this.hp = Math.max(this.maxHp * pct, this.maxHp * 0.5); this.hp = this.maxHp; this.build(); }
}

function douseHearth() {
  const h = G.hearth;
  h.doused = true; h.hp = 0;
  if (h.flame) h.flame.visible = false;
  const lost = [];
  for (const k of ['wood', 'stone', 'fiber', 'obsidian', 'food']) {
    const n = Math.floor(G.inv[k] * 0.3);
    if (n > 0) { G.inv[k] -= n; lost.push(`${n} ${k}`); }
  }
  sfx('crumble');
  toast('The raiders doused your Hearth and stole supplies! ' + (lost.length ? '(' + lost.join(', ') + ')' : ''), 'bad', null, 5);
}
export function relightHearth() {
  const h = G.hearth;
  if (!h) return;
  if (h.doused) { h.doused = false; h.hp = h.maxHp * 0.5; if (h.flame) h.flame.visible = true; toast('You relit the Hearth.', 'good'); }
}

// ---------- placement ----------
const GRID = 2;
let ghost = null, ghostType = null, ghostRot = 0, ghostValid = false, ghostPos = { x: 0, z: 0 };
const ghostMatOk = new THREE.MeshBasicMaterial({ color: 0x40ff60, transparent: true, opacity: 0.45, depthWrite: false });
const ghostMatBad = new THREE.MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.45, depthWrite: false });
export const build = { sel: 0, list: [] };

export function availablePieces() {
  const l = [];
  if (!G.hearth) l.push('hearth');
  l.push('wall', 'gate', 'spikes', 'tower', 'torch');
  for (const k of ['rain', 'garden', 'fishtrap', 'kennel', 'ballista']) if (G.inventions[k]) l.push(k);
  return l;
}

function cellKey(x, z) { return `${Math.round(x / GRID)},${Math.round(z / GRID)}`; }

function validate(type, x, z, rot) {
  const def = PIECES[type];
  const h = heightAt(x, z);
  if (def.shore) { if (h > 0.9 || h < -1.4) return 'Fish traps go at the shoreline'; }
  else if (h < 0.35) return 'Too wet here';
  const hs = [heightAt(x - 0.9, z - 0.9), heightAt(x + 0.9, z - 0.9), heightAt(x - 0.9, z + 0.9), heightAt(x + 0.9, z + 0.9)];
  if (Math.max(...hs) - Math.min(...hs) > 2.2) return 'Too steep';
  const key = cellKey(x, z);
  for (const s of G.structures) if (s.alive && cellKey(s.x, s.z) === key) return 'Space occupied';
  for (const n of G.nodes) if (n.alive && n.def.r > 0 && Math.abs(n.x - x) < 2 && Math.abs(n.z - z) < 2 && Math.hypot(n.x - x, n.z - z) < 1.1 + n.def.r) return 'Blocked by ' + n.def.label.toLowerCase();
  if (type !== 'hearth' && !G.hearth) return 'Build a Hearth first';
  if (G.hearth && Math.hypot(x - G.hearth.x, z - G.hearth.z) > 45) return 'Too far from your Hearth';
  if (Math.hypot(x - LOC.village.x, z - LOC.village.z) < 30) return 'Too close to the Kapu village';
  const P = G.player.pos;
  if (def.block && Math.hypot(P.x - x, P.z - z) < 1.3) return 'You are standing there';
  return null;
}

function makeGhost(type) {
  if (ghost) G.scene.remove(ghost);
  ghost = new THREE.Group();
  ghost.add(new THREE.Mesh(pieceGeo(type, 0), ghostMatOk));
  ghostType = type;
  G.scene.add(ghost);
}
export function hideGhost() { if (ghost) { G.scene.remove(ghost); ghost = null; ghostType = null; } }

const ray = new THREE.Raycaster();
export function aimPoint(maxDist = 14) {
  ray.setFromCamera({ x: 0, y: 0 }, G.camera);
  ray.far = 60;
  const hit = ray.intersectObject(G.terrain, false)[0];
  const P = G.player.pos;
  let x, z;
  if (hit) { x = hit.point.x; z = hit.point.z; }
  else { const f = G.player.camForward(); x = P.x + f.x * 5; z = P.z + f.z * 5; }
  const dx = x - P.x, dz = z - P.z, d = Math.hypot(dx, dz);
  if (d > maxDist) { x = P.x + (dx / d) * maxDist; z = P.z + (dz / d) * maxDist; }
  if (d < 2.2) { const f = G.player.camForward(); x = P.x + f.x * 3; z = P.z + f.z * 3; }
  return { x, z };
}

export function targetStructure() {
  const a = aimPoint(10);
  let best = null, bd = 2.6;
  for (const s of G.structures) {
    const d = Math.hypot(s.x - a.x, s.z - a.z);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

function upgradeCost(s) {
  if (s.hp < s.maxHp - 0.5) {
    const c = {}; const base = s.def.cost[s.tier];
    for (const k in base) c[k] = Math.max(1, Math.ceil(base[k] * 0.3 * (1 - s.hp / s.maxHp) + 0.5));
    return { kind: 'repair', cost: c };
  }
  if (s.tier + 1 < s.def.cost.length) return { kind: 'upgrade', cost: s.def.cost[s.tier + 1] };
  return null;
}
export function structureHint(s) {
  if (!s) return '';
  const u = upgradeCost(s);
  let t = `${s.name} ${Math.ceil(s.hp)}/${s.maxHp}`;
  if (u) t += ` · [U] ${u.kind === 'repair' ? 'Repair' : 'Upgrade to ' + TIER_NAME[s.tier + 1]} (${costStr(u.cost)})`;
  t += ' · [V] Demolish';
  return t;
}

export function updateBuildMode() {
  build.list = availablePieces();
  if (build.sel >= build.list.length) build.sel = 0;
  if (input.wheel) build.sel = (build.sel + (input.wheel > 0 ? 1 : -1) + build.list.length) % build.list.length;
  for (let i = 0; i < 10; i++) if (pressed('Digit' + ((i + 1) % 10))) { if (i < build.list.length) build.sel = i; }
  if (pressed('KeyR')) ghostRot = ghostRot ? 0 : Math.PI / 2;
  const type = build.list[build.sel];
  if (ghostType !== type) makeGhost(type);
  const a = aimPoint(12);
  const gx = Math.round(a.x / GRID) * GRID, gz = Math.round(a.z / GRID) * GRID;
  ghostPos = { x: gx, z: gz };
  const err = validate(type, gx, gz, ghostRot);
  const cost = PIECES[type].cost[0];
  const afford = hasRes(cost);
  ghostValid = !err && afford;
  ghost.position.set(gx, heightAt(gx, gz), gz);
  ghost.rotation.y = ghostRot;
  ghost.children[0].material = ghostValid ? ghostMatOk : ghostMatBad;
  build.status = err || (!afford ? 'Need ' + costStr(cost) : '');
  const ts = targetStructure();
  build.target = ts;
  if (input.lclick) {
    if (ghostValid) placePiece(type, gx, gz, ghostRot);
    else { sfx('error'); toast(build.status, 'warn'); }
  }
  if (pressed('KeyU') && ts) {
    const u = upgradeCost(ts);
    if (!u) toast(`${ts.name} is already at full strength.`, 'info');
    else if (!hasRes(u.cost)) { sfx('error'); toast(`Need ${costStr(u.cost)}`, 'warn'); }
    else {
      payRes(u.cost);
      if (u.kind === 'repair') { ts.hp = ts.maxHp; if (ts.type === 'hearth') relightHearth(); toast(`Repaired ${ts.name}`, 'good'); }
      else { ts.setTier(ts.tier + 1); count('upgraded_' + ['wood', 'stone', 'obsidian'][ts.tier]); toast(`Upgraded to ${ts.name}!`, 'good'); }
      burst(ts.pos, 0xffe080, 12, 4, 0.12); sfx('place');
    }
  }
  if (pressed('KeyV') && ts) {
    if (ts.type === 'hearth') toast("You can't demolish your Hearth.", 'warn');
    else {
      const c = ts.def.cost[0];
      for (const k in c) G.inv[k] += Math.floor(c[k] / 2);
      ts.destroy(true); sfx('crumble'); toast(`Demolished ${ts.name} (50% refund)`, 'info');
    }
  }
}

export function placePiece(type, x, z, rot, tier = 0, free = false) {
  if (!free) payRes(PIECES[type].cost[0]);
  const s = new Structure(type, x, z, rot, tier);
  G.structures.push(s);
  if (type === 'hearth') { G.hearth = s; s.light = new THREE.PointLight(0xff8a30, 40, 22, 1.5); s.light.position.set(x, s.y + 1.5, z); G.scene.add(s.light); }
  if (!free) {
    count('built_' + type); G.stats.built++;
    burst(new THREE.Vector3(x, s.y + 0.5, z), 0xd8c090, 10, 3, 0.12); sfx('place');
  }
  return s;
}

export function petCap() { return 3 + 2 * G.structures.filter((s) => s.type === 'kennel').length; }

// ---------- per-frame structure logic ----------
export function updateStructures(dt) {
  const cam = G.camera;
  const torches = [];
  for (const s of G.structures) {
    s.bar.set(s.hp / s.maxHp, cam);
    if (s.flame) { s.flame.scale.y = 1.5 + Math.sin(G.t * 12 + s.id) * 0.25; s.flame.rotation.y += dt * 3; }
    if (s.type === 'torch') torches.push(s);
    if (s.type === 'hearth' && s.light) s.light.intensity = s.doused ? 0 : (6 + Math.sin(G.t * 9) * 2) + (1 - G.light) * (40 + Math.sin(G.t * 9) * 6);
    if (s.def.produce) {
      if (s.store < s.def.cap) { s.prodT += dt; if (s.prodT >= s.def.every) { s.prodT = 0; s.store++; } }
      s.icon.visible = s.store > 0;
      if (s.icon.visible) { s.icon.position.y = 2.3 + Math.sin(G.t * 3) * 0.15; s.icon.rotation.y += dt * 2; }
    }
    if (s.type === 'spikes') {
      for (const e of G.enemies) {
        if (!e.alive || e.isBoss) continue;
        if (Math.abs(e.pos.x - s.x) < 1.15 && Math.abs(e.pos.z - s.z) < 1.15) {
          e.hurt(s.def.dps[s.tier] * dt, 'trap', true);
          e.slow = 0.45;
          s.hp -= 3 * dt;
          if (Math.random() < dt * 6) burst(e.pos.clone().setY(e.pos.y + 0.3), 0xaa2020, 1, 2, 0.08);
        }
      }
      if (s.hp <= 0) s.destroy();
    }
    if (s.type === 'tower' || s.type === 'ballista') {
      s.cd -= dt;
      if (s.cd <= 0) {
        let tgt = null, bd = s.def.range;
        for (const e of G.enemies) {
          if (!e.alive) continue;
          const d = Math.hypot(e.pos.x - s.x, e.pos.z - s.z);
          if (d < bd) { bd = d; tgt = e; }
        }
        if (tgt) {
          const from = new THREE.Vector3(s.x, s.y + (s.type === 'tower' ? 3.9 : 1.6), s.z);
          const speed = s.type === 'ballista' ? 45 : 30;
          const tp = tgt.pos.clone(); tp.y += 1.0;
          const tt = from.distanceTo(tp) / speed;
          tp.addScaledVector(tgt.vel, tt);
          const v = tp.sub(from).normalize().multiplyScalar(speed);
          v.y += 4 * tt * 0.5 * 1.0;
          spawnProjectile({ pos: from, vel: v, dmg: s.def.dmg[s.tier] ?? s.def.dmg[0], owner: 'tower', grav: 4, color: s.type === 'ballista' ? 0x7a4ac0 : 0x999999, size: s.type === 'ballista' ? 0.22 : 0.14, bolt: s.type === 'ballista' });
          s.cd = s.def.cd[s.tier] ?? s.def.cd[0];
          if (s.head) s.head.rotation.y = Math.atan2(v.x, v.z) - s.rot;
          sfx('sling');
        } else s.cd = 0.3;
      }
    }
  }
  // assign the light pool to the torches nearest the player
  const P = G.player.pos;
  torches.sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z));
  for (let i = 0; i < lightPool.length; i++) {
    const t = torches[i], l = lightPool[i];
    if (t) { l.position.set(t.x, t.y + 2.4, t.z); l.intensity = (14 + Math.sin(G.t * 11 + i) * 3) * (0.3 + (1 - G.light) * 0.9); }
    else l.intensity = 0;
  }
}

export function collectFrom(s) {
  if (!s.store) return;
  G.inv[s.def.produce] += s.store;
  if (s.def.produce === 'food') G.counters.foodGathered = (G.counters.foodGathered || 0) + s.store;
  toast(`+${s.store} ${s.def.produce} from ${s.def.name}`, 'res', s.def.produce);
  s.store = 0; sfx('pickup');
}
