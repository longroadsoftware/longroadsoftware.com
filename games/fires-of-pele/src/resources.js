// Harvestable resource nodes rendered with InstancedMesh.
import * as THREE from 'three';
import { G, count } from './state.js';
import { part, merge, MAT, mulberry32, lumpy } from './util.js';
import { heightAt, distVolcano, LOC, WORLD } from './world.js';
import { addStatic } from './physics.js';
import { burst, sfx } from './fx.js';

export const NODE_TYPES = {
  palm: { res: 'wood', per: 2, hits: 5, r: 0.38, tier: 1, sound: 'chop', bonus: { food: 1, water: 1 }, color: 0x8a6a44, label: 'Palm tree' },
  tree: { res: 'wood', per: 3, hits: 6, r: 0.55, tier: 1, sound: 'chop', color: 0x6b4a2e, label: 'Koa tree' },
  rock: { res: 'stone', per: 2, hits: 6, r: 1.05, tier: 1, sound: 'stone', color: 0x9a9a95, label: 'Boulder' },
  flax: { res: 'fiber', per: 2, hits: 3, r: 0, tier: 1, sound: 'rustle', color: 0x9bb54a, label: 'Flax' },
  berry: { res: 'food', per: 1, hits: 3, r: 0, tier: 1, sound: 'rustle', color: 0xd03040, label: 'Berry bush' },
  obsidian: { res: 'obsidian', per: 1, hits: 7, r: 0.85, tier: 2, sound: 'stone', color: 0x5a3a8a, label: 'Obsidian' },
};

function leafGeo(len = 2.6, w = 0.62, droop = 0.9) {
  // a frond: a thin strip that tapers and bends down along its length
  const g = new THREE.BoxGeometry(w, 0.035, len, 2, 1, 10);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getZ(i) + len / 2) / len;            // 0 at the trunk, 1 at the tip
    const taper = Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.05)) * 0.9 + 0.1;
    p.setX(i, p.getX(i) * taper);
    p.setY(i, p.getY(i) - droop * t * t * len * 0.45 + Math.abs(p.getX(i)) * 0.25);
  }
  g.translate(0, 0, len / 2);
  g.computeVertexNormals();
  return g;
}
const blob = (r, seed, amt = 0.22) => lumpy(new THREE.SphereGeometry(r, 14, 10), amt, 1.2 / r, seed);
const stone = (r, seed, amt = 0.16) => lumpy(new THREE.DodecahedronGeometry(r, 1), amt, 1.6 / r, seed);

function geoFor(type) {
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  if (type === 'palm') {
    const ps = [];
    let x = 0;
    for (let i = 0; i < 5; i++) {
      const nx = 0.09 * Math.pow(i + 1, 1.5);
      ps.push(part(new THREE.CylinderGeometry(0.17 - i * 0.012, 0.22 - i * 0.012, 1.08, 10), i % 2 ? 0x8a6a44 : 0x7a5a38, { pos: [(x + nx) / 2, i + 0.5, 0], rot: [0, 0, -(nx - x) * 0.9] }));
      ps.push(part(new THREE.TorusGeometry(0.2 - i * 0.012, 0.025, 4, 10), 0x5e4630, { pos: [(x + nx) / 2, i + 1.0, 0], rot: [Math.PI / 2, 0, 0] }));
      x = nx;
    }
    const top = [x, 5.05, 0];
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + (k % 2) * 0.2;
      ps.push(part(leafGeo(2.4 + (k % 3) * 0.3, 0.6, 0.8 + (k % 2) * 0.3), k % 2 ? 0x3f9a3a : 0x52ad3f, { pos: top, rot: [-0.25 + (k % 3) * 0.12, a, 0, 'YXZ'] }));
    }
    for (let k = 0; k < 4; k++) ps.push(part(new THREE.SphereGeometry(0.16, 10, 8), 0x6a4a20, { pos: [x + Math.cos(k * 1.6) * 0.24, 4.82, Math.sin(k * 1.6) * 0.24] }));
    return merge(ps);
  }
  if (type === 'tree') return merge([
    part(new THREE.CylinderGeometry(0.24, 0.45, 3.4, 10), 0x5e4028, { pos: [0, 1.7, 0] }),
    part(new THREE.CylinderGeometry(0.08, 0.14, 1.6, 6), 0x5e4028, { pos: [0.55, 3.6, 0.1], rot: [0, 0, -0.7] }),
    part(new THREE.CylinderGeometry(0.08, 0.14, 1.5, 6), 0x5e4028, { pos: [-0.5, 3.5, -0.2], rot: [0.2, 0, 0.75] }),
    part(blob(2.0, 1), 0x2f7a2a, { pos: [0, 4.5, 0], scale: [1, 0.8, 1] }),
    part(blob(1.55, 2), 0x3b8a30, { pos: [0.95, 5.1, 0.4], scale: [1, 0.85, 1] }),
    part(blob(1.4, 3), 0x2a6e26, { pos: [-1.0, 4.9, -0.5], scale: [1, 0.85, 1] }),
    part(blob(1.25, 4), 0x46963a, { pos: [0.1, 5.8, -0.2], scale: [1, 0.8, 1] }),
  ]);
  if (type === 'rock') return merge([
    part(stone(1.0, 5), 0x8d8a84, { pos: [0, 0.45, 0], scale: [1.35, 0.85, 1.1] }),
    part(stone(0.5, 6), 0x7a7772, { pos: [0.9, 0.2, 0.5] }),
    part(blob(0.62, 9, 0.3), 0x5f7f3a, { pos: [-0.25, 0.92, -0.2], scale: [1.3, 0.25, 1.1] }),
  ]);
  if (type === 'flax') {
    const ps = [];
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      ps.push(part(leafGeo(1.5 + (k % 3) * 0.2, 0.12, 0.3), k % 2 ? 0x9bb54a : 0x7f9f3a, { pos: [Math.cos(a) * 0.12, 0.05, Math.sin(a) * 0.12], rot: [-1.2 + (k % 3) * 0.12, a, 0, 'YXZ'] }));
    }
    return merge(ps);
  }
  if (type === 'berry') {
    const ps = [part(blob(0.85, 7, 0.28), 0x2f6e2f, { pos: [0, 0.7, 0], scale: [1, 0.85, 1] })];
    for (let k = 0; k < 12; k++) {
      const a = k * 2.4, y = 0.45 + (k % 4) * 0.22;
      ps.push(part(new THREE.SphereGeometry(0.1, 8, 6), 0xd02a3a, { pos: [Math.cos(a) * 0.8, y, Math.sin(a) * 0.8] }));
    }
    return merge(ps);
  }
  if (type === 'obsidian') return merge([
    part(new THREE.OctahedronGeometry(0.7, 0), 0x1d1626, { pos: [0, 0.7, 0], scale: [0.8, 1.6, 0.8] }),
    part(new THREE.OctahedronGeometry(0.5, 0), 0x2a1f3a, { pos: [0.5, 0.45, 0.2], scale: [0.7, 1.3, 0.7], rot: [0, 0, -0.4] }),
    part(new THREE.OctahedronGeometry(0.4, 0), 0x241a30, { pos: [-0.45, 0.35, -0.2], scale: [0.7, 1.2, 0.7], rot: [0.3, 0, 0.4] }),
  ]);
}

const groups = {};
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

function nearZone(x, z) {
  const zones = [[LOC.camp, 17], [LOC.village, 22], [LOC.cove, 9], [LOC.spring, 7], [LOC.wreck, 7]];
  return zones.some(([p, r]) => Math.hypot(x - p.x, z - p.z) < r);
}

export function generateNodes(scene) {
  const rng = mulberry32(42);
  const want = { palm: 150, tree: 230, rock: 120, flax: 120, berry: 80, obsidian: 45 };
  const cand = {};
  for (const t in want) cand[t] = [];
  for (const t in want) {
    let tries = 0;
    while (cand[t].length < want[t] && tries < 40000) {
      tries++;
      const x = (rng() - 0.5) * WORLD * 0.75, z = (rng() - 0.5) * WORLD * 0.75;
      const h = heightAt(x, z);
      const dv = distVolcano(x, z);
      if (h < 0.4 || nearZone(x, z)) continue;
      let ok = false;
      if (t === 'palm') ok = h < 3.2 && dv > 40;
      else if (t === 'tree') ok = h > 2.6 && dv > 34;
      else if (t === 'rock') ok = h > 1.2 && (dv > 12);
      else if (t === 'flax') ok = h > 1.5 && h < 12 && dv > 32;
      else if (t === 'berry') ok = h > 2.5 && dv > 36;
      else if (t === 'obsidian') ok = dv > 10 && dv < 30;
      if (!ok) continue;
      if (cand[t].some((c) => Math.hypot(c.x - x, c.z - z) < 2.2)) continue;
      cand[t].push({ x, z, rot: rng() * Math.PI * 2, s: 0.8 + rng() * 0.45 });
    }
  }
  // guarantee a few starter nodes near the camp
  const near = (t, n, rmin, rmax) => {
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, r = rmin + rng() * (rmax - rmin);
      const x = LOC.camp.x + Math.cos(a) * r, z = LOC.camp.z + Math.sin(a) * r;
      if (heightAt(x, z) > 0.5) cand[t].push({ x, z, rot: rng() * 6, s: 1 });
    }
  };
  near('palm', 8, 18, 30); near('rock', 5, 18, 30); near('flax', 6, 18, 30); near('berry', 5, 18, 32);
  for (const t in cand) {
    const list = cand[t];
    const im = new THREE.InstancedMesh(geoFor(t), t === 'obsidian' ? MAT.shiny : MAT.std, list.length);
    im.castShadow = true; im.receiveShadow = true;
    groups[t] = im;
    list.forEach((c, i) => {
      const node = {
        type: t, def: NODE_TYPES[t], x: c.x, z: c.z, y: heightAt(c.x, c.z) - 0.05,
        rot: c.rot, s: c.s, hp: NODE_TYPES[t].hits, alive: true, idx: i, pulse: 0, respawnAt: 0,
      };
      G.nodes.push(node);
      setNodeMatrix(node, 1);
      if (node.def.r > 0) addStatic({ x: c.x, z: c.z, r: node.def.r * c.s, node });
    });
    im.instanceMatrix.needsUpdate = true;
    scene.add(im);
  }
}

function setNodeMatrix(n, k) {
  const s = n.alive ? n.s * k : 0;
  _q.setFromAxisAngle(_up, n.rot);
  _m.compose(_v.set(n.x, n.y, n.z), _q, _s.set(s, s * (2 - k), s));
  groups[n.type].setMatrixAt(n.idx, _m);
  groups[n.type].instanceMatrix.needsUpdate = true;
}

// Find a node the player can hit from (px,pz) facing dir (fx,fz)
export function findNodeInFront(px, pz, fx, fz, range) {
  let best = null, bd = 1e9;
  for (const n of G.nodes) {
    if (!n.alive) continue;
    const dx = n.x - px, dz = n.z - pz;
    if (Math.abs(dx) > 6 || Math.abs(dz) > 6) continue;
    const d = Math.hypot(dx, dz);
    const reach = range + n.def.r * n.s + 0.4;
    if (d > reach) continue;
    const dot = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
    if (dot < 0.35) continue;
    const score = d - dot;
    if (score < bd) { bd = score; best = n; }
  }
  return best;
}

export function harvest(n, tier, toast) {
  const d = n.def;
  const hitPos = new THREE.Vector3(n.x, n.y + 1, n.z);
  if (tier < d.tier) {
    burst(hitPos, 0xffffff, 4, 3, 0.08);
    sfx('stone');
    toast('Too hard! You need a Stone Spear (tier 2 tool) to mine obsidian.', 'warn');
    return;
  }
  n.hp--;
  n.pulse = 0.15;
  let amt = d.per + (d.res === 'wood' || d.res === 'stone' ? Math.max(0, tier - 1) : 0);
  G.inv[d.res] = (G.inv[d.res] || 0) + amt;
  count(d.res + 'Gathered', amt);
  burst(hitPos, d.color, 7, 4, 0.13);
  sfx(d.sound);
  toast(`+${amt} ${d.res}`, 'res', d.res);
  if (n.hp <= 0) {
    n.alive = false;
    n.respawnAt = G.t + 150 + Math.random() * 60;
    setNodeMatrix(n, 1);
    burst(hitPos, d.color, 14, 6, 0.18);
    if (d.bonus) for (const k in d.bonus) {
      G.inv[k] += d.bonus[k]; count(k + 'Gathered', d.bonus[k]);
      toast(`+${d.bonus[k]} ${k} (coconut)`, 'res', k);
    }
  }
}

export function updateNodes(dt) {
  const P = G.player.pos;
  for (const n of G.nodes) {
    if (n.pulse > 0) {
      n.pulse -= dt;
      setNodeMatrix(n, n.pulse > 0 ? 0.92 + (0.15 - n.pulse) * 0.5 : 1);
    }
    if (!n.alive && G.t > n.respawnAt && Math.hypot(P.x - n.x, P.z - n.z) > 30) {
      const blocked = G.structures.some((s) => s.alive && Math.hypot(s.x - n.x, s.z - n.z) < 2.5);
      if (blocked) { n.respawnAt = G.t + 120; continue; }
      n.alive = true; n.hp = n.def.hits; setNodeMatrix(n, 1);
    }
  }
}
