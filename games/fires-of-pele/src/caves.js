// Hidden caves: a rock shell you can walk into, dark inside (your torch lights it), with loot and lore.
import * as THREE from 'three';
import { G, count } from './state.js';
import { CAVES, heightAt } from './world.js';
import { addStatic } from './physics.js';
import { part, merge, mesh, lumpy, mulberry32, angleDiff, clamp, smoothstep, makeLabel } from './util.js';
import { toast } from './ui.js';
import { sfx, burst } from './fx.js';
import { Enemy } from './enemies.js';

export const CAVE_ITEMS = [];
const GAP = 0.3;                          // half-angle of the cave mouth
const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
let torchLight, torchFlame, bats, lavaPool;
const hintT = {};

export const caveById = (id) => CAVES.find((c) => c.id === id);
export const cavesFound = () => CAVES.filter((c) => G.flags['cave_' + c.id]).length;
export const ceilAt = (c, d) => c.floor + c.H * Math.sqrt(Math.max(0, 1 - (d / c.R) ** 2));
// a point inside cave c, given an angle offset from the mouth and a fraction of the radius
export function cavePoint(c, da, f) {
  const a = c.entA + da;
  return { x: c.x + Math.cos(a) * c.R * f, z: c.z + Math.sin(a) * c.R * f };
}

function fern(rng) {
  const ps = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + rng() * 0.3;
    ps.push(part(new THREE.SphereGeometry(0.5, 8, 6), k % 2 ? 0x2f7a2a : 0x3e8f34, { pos: [Math.cos(a) * 0.75, 0.55, Math.sin(a) * 0.75], rot: [0, -a, 0.7], scale: [1.9, 0.12, 0.45] }));
  }
  return ps;
}

export function buildCaves(scene) {
  const rng = mulberry32(31);
  for (const c of CAVES) {
    c.entA = Math.atan2(c.ez, c.ex); c.gap = GAP;
    // the shell: a lumpy half-dome with a wedge cut out for the mouth
    let shell = new THREE.SphereGeometry(1, 40, 14, GAP, Math.PI * 2 - GAP * 2, 0, Math.PI / 2);
    shell = lumpy(shell, 0.07, 2.4, c.id.length);
    const tint = c.id === 'lava' ? 0x3d3330 : c.id === 'sea' ? 0x6a6660 : 0x5f6058;
    const parts = [part(shell, tint, { scale: [c.R, c.H, c.R] })];
    // stalactites hanging from the ceiling
    for (let i = 0; i < 16; i++) {
      const a = rng() * Math.PI * 2, f = 0.15 + rng() * 0.7, d = c.R * f;
      if (Math.abs(angleDiff(a, Math.PI)) < GAP + 0.2) continue;   // keep the mouth clear (local frame: mouth at -x = angle PI)
      const len = 0.6 + rng() * 1.3, ceil = c.H * Math.sqrt(1 - f * f);
      parts.push(part(new THREE.ConeGeometry(0.18 + rng() * 0.15, len, 6), tint, { pos: [Math.cos(a) * d, ceil - len / 2 + 0.1, Math.sin(a) * d], rot: [Math.PI, 0, 0] }));
    }
    // boulders around the base so the dome sits naturally in the land
    for (let i = 0; i < 10; i++) {
      const a = rng() * Math.PI * 2;
      if (Math.abs(angleDiff(a, Math.PI)) < GAP + 0.25) continue;
      parts.push(part(new THREE.DodecahedronGeometry(0.9 + rng() * 1.2, 0), tint, { pos: [Math.cos(a) * (c.R + 0.4), 0.2, Math.sin(a) * (c.R + 0.4)], scale: [1.2, 0.7, 1] }));
    }
    const m = mesh(merge(parts), rockMat);
    m.castShadow = true; m.receiveShadow = true;
    m.position.set(c.x, c.floor - 0.05, c.z);
    m.rotation.y = Math.atan2(c.ez, -c.ex);
    scene.add(m);
    c.mesh = m;
    // walls for movement (the mouth stays open)
    for (let a = 0; a < Math.PI * 2; a += 1.25 / c.R) {
      if (Math.abs(angleDiff(a, c.entA)) < GAP + 0.06) continue;
      addStatic({ x: c.x + Math.cos(a) * (c.R + 0.35), z: c.z + Math.sin(a) * (c.R + 0.35), r: 0.95, h: c.H + 1, base: c.floor - 0.5 });
    }
    // hide the mouth
    const mx = c.x + c.ex * (c.R + 2.5), mz = c.z + c.ez * (c.R + 2.5), sx = -c.ez, sz = c.ex;
    const deco = [];
    if (c.id === 'lava') {
      // big boulders leave only a narrow, angled gap
      for (const [o, f, s] of [[-3.0, 0.5, 1.7], [3.1, 0.2, 1.9], [1.2, 3.2, 1.5], [-2.2, 3.6, 1.2]]) {
        const x = mx + sx * o + c.ex * f, z = mz + sz * o + c.ez * f;
        deco.push(part(new THREE.DodecahedronGeometry(s, 1), 0x4a403a, { pos: [x - c.x, heightAt(x, z) - c.floor + s * 0.4, z - c.z], scale: [1.2, 0.9, 1.1] }));
        addStatic({ x, z, r: s * 0.95, h: s * 1.6 });
      }
      for (let i = 0; i < 4; i++) {
        const x = mx + sx * (i - 1.5) * 1.6 + c.ex * 1.5, z = mz + sz * (i - 1.5) * 1.6 + c.ez * 1.5;
        for (const g of fern(rng)) { g.translate(x - c.x, heightAt(x, z) - c.floor, z - c.z); deco.push(g); }
      }
    } else if (c.id === 'sea') {
      for (const [o, f, s] of [[-3.2, 0, 1.4], [3.3, -0.5, 1.6]]) {
        const x = mx + sx * o + c.ex * f, z = mz + sz * o + c.ez * f;
        deco.push(part(new THREE.DodecahedronGeometry(s, 1), 0x6a6660, { pos: [x - c.x, s * 0.2, z - c.z], scale: [1.1, 1.2, 1] }));
      }
    }
    if (deco.length) {
      const dm = mesh(merge(deco), rockMat);
      dm.position.set(c.x, c.floor, c.z); dm.castShadow = true;
      scene.add(dm);
    }
    buildInterior(scene, c, rng);
  }
  G.camBlockers = G.camBlockers || [];
  G.camBlockers.push(caveCamBlock);
  // the player's torch
  torchLight = new THREE.PointLight(0xffa860, 0, 20, 1.3);
  scene.add(torchLight);
  G.torchLight = torchLight;
  torchFlame = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), new THREE.MeshBasicMaterial({ color: 0xffb040 }));
  torchFlame.scale.y = 1.7;
  scene.add(torchFlame);
  // bats circling over undiscovered cave mouths at dusk
  const wing = new THREE.BufferGeometry();
  wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.12, 0, 0, 0.12, -0.45, 0.05, 0, 0, 0, -0.12, 0, 0, 0.12, 0.45, 0.05, 0], 3));
  wing.computeVertexNormals();
  bats = new THREE.InstancedMesh(wing, new THREE.MeshBasicMaterial({ color: 0x141014, side: THREE.DoubleSide }), CAVES.length * 7);
  bats.frustumCulled = false;
  scene.add(bats);
}

function item(c, id, da, f, label, look, take, opts = {}) {
  const p = cavePoint(c, da, f);
  const y = c.floor;
  const m = look();
  m.position.set(p.x, y, p.z);
  G.scene.add(m);
  const it = { cave: c.id, id, x: p.x, z: p.z, y, label, mesh: m, take, ...opts };
  if (G.flags['item_' + id] && !opts.keep) m.visible = false;
  CAVE_ITEMS.push(it);
  return it;
}
const glowMat = (col) => new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.6, roughness: 0.3 });

function tablet(col = 0x7a6f66, glyph = 0xff7a30) {
  const g = new THREE.Group();
  g.add(mesh(merge([part(new THREE.BoxGeometry(1.1, 1.5, 0.25), col, { pos: [0, 0.75, 0] }), part(new THREE.BoxGeometry(1.4, 0.25, 0.6), col, { pos: [0, 0.12, 0] })])));
  const gl = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.04, 6, 16), glowMat(glyph));
  gl.position.set(0, 0.9, 0.14); g.add(gl);
  return g;
}
function chest() {
  const g = new THREE.Group();
  g.add(mesh(merge([part(new THREE.BoxGeometry(1.0, 0.6, 0.7), 0x6b4a2e, { pos: [0, 0.3, 0] }), part(new THREE.CylinderGeometry(0.35, 0.35, 1.0, 10, 1, false, 0, Math.PI), 0x7a5634, { pos: [0, 0.6, 0], rot: [0, 0, Math.PI / 2] }), part(new THREE.BoxGeometry(0.15, 0.2, 0.05), 0xd8b040, { pos: [0, 0.55, 0.37] })])));
  return g;
}

function buildInterior(scene, c, rng) {
  const face = (m, p) => { m.rotation.y = Math.atan2(c.x - p.x, c.z - p.z); return m; };
  if (c.id === 'lava') {
    item(c, 'lava_lore', Math.PI, 0.72, 'Read the carved oath stone', () => tablet(0x4a3d36), () => {
      G.flags.lore_oath = true;
      return [{ who: 'Oath stone', text: 'Carved in hard black rock: <i>"I, Kaʻula, took the mountain\'s fire into my own chest. Let the people kneel, or let them burn."</i>' },
        { who: 'Oath stone', text: 'Below it, an older hand: <i>"Fire taken is fire owed. When the chief falls, the ember goes home to the little island."</i>' }];
    }, { keep: true });
    item(c, 'lava_reward', Math.PI + 0.9, 0.6, 'Open the old chest', chest, () => {
      G.flags.firewalk = true;
      toast('Found Fire-walker Sandals! Lava burns you far less.', 'good', null, 5);
    });
    // a small lava pool: the cave's hazard
    const lp = cavePoint(c, Math.PI - 1.0, 0.5);
    lavaPool = { x: lp.x, z: lp.z, r: 1.6 };
    const pm = new THREE.Mesh(new THREE.CircleGeometry(1.7, 16), new THREE.MeshBasicMaterial({ color: 0xff5a10 }));
    pm.rotation.x = -Math.PI / 2; pm.position.set(lp.x, c.floor + 0.06, lp.z);
    scene.add(pm);
    const pl = new THREE.PointLight(0xff6a20, 8, 9, 1.6); pl.position.set(lp.x, c.floor + 1.2, lp.z);
    scene.add(pl);
  } else if (c.id === 'sea') {
    item(c, 'sea_lore', Math.PI, 0.7, 'Pick up the old map fragment', () => {
      const g = new THREE.Group();
      g.add(mesh(merge([part(new THREE.BoxGeometry(0.9, 0.5, 0.6), 0x5a4a3a, { pos: [0, 0.25, 0] }), part(new THREE.BoxGeometry(0.7, 0.02, 0.5), 0xe8d8a8, { pos: [0, 0.52, 0], rot: [0, 0.3, 0] })])));
      return g;
    }, () => {
      G.flags.lore_map = true;
      return [{ who: 'Map fragment', text: 'A scrap of bark cloth with a map inked on it. Three marks: the mountain, a sea cave, and the high cliffs to the east.' },
        { who: 'Map fragment', text: 'Beside the cliff mark, a note: <i>"Where the water falls, walk through it. The ember sleeps behind."</i>' }];
    });
    item(c, 'sea_reward', Math.PI - 0.8, 0.62, 'Open the giant clam', () => {
      const g = new THREE.Group();
      g.add(mesh(merge([part(new THREE.SphereGeometry(0.7, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xd8d0c0, { scale: [1, 0.4, 0.8] }), part(new THREE.SphereGeometry(0.16, 10, 8), 0xf4f0ff, { pos: [0, 0.12, 0] })])));
      return g;
    }, () => {
      G.flags.pearl = true; G.player.maxHp = 125 + (G.flags.charm ? 20 : 0); G.player.hp += 25;
      toast('Found the Pearl of Kanaloa! Max health +25.', 'good', null, 5);
    });
    const tp = cavePoint(c, Math.PI + 0.7, 0.45);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1.8, 14), new THREE.MeshPhongMaterial({ color: 0x2a9ac0, transparent: true, opacity: 0.8, shininess: 120 }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(tp.x, c.floor + 0.05, tp.z);
    scene.add(pool);
  } else if (c.id === 'falls') {
    item(c, 'falls_lore', Math.PI, 0.72, 'Read the carvings on the wall', () => tablet(0x5f6058, 0x60e0ff), () => {
      G.flags.lore_song = true;
      return [{ who: 'The Ember Song', text: '<i>"Three embers fell when the mountain was young: one in the water, one in the black sand, one at the fire\'s lip."</i>' },
        { who: 'The Ember Song', text: '<i>"Bring them to the stone ring on the little island, and the mountain will sleep."</i>' }];
    }, { keep: true });
    item(c, 'falls_reward', Math.PI + 0.85, 0.6, 'Open the bundle wrapped in kapa cloth', chest, () => {
      G.flags.slingPlus = true;
      toast("Found Kahuna's Sling! Sling stones hit twice as hard.", 'good', null, 5);
    });
    // glow-worms on the ceiling
    const gw = [];
    for (let i = 0; i < 60; i++) {
      const a = rng() * Math.PI * 2, f = rng() * 0.85, d = f * c.R;
      gw.push(c.x + Math.cos(a) * d, ceilAt(c, d) - 0.15, c.z + Math.sin(a) * d);
    }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(gw, 3));
    scene.add(new THREE.Points(pg, new THREE.PointsMaterial({ color: 0x9ff8ff, size: 0.12 })));
  }
  // every cave has a cool faint glow from crystals so it is never pitch black
  const cl = new THREE.PointLight(c.id === 'lava' ? 0xb070ff : 0x70c8ff, 3, c.R * 1.4, 1.5);
  const cp = cavePoint(c, Math.PI + 0.3, 0.6);
  cl.position.set(cp.x, c.floor + 1.2, cp.z);
  scene.add(cl);
}

// Camera: keep it inside the shell when you are in a cave, and outside it when you are not.
function caveCamBlock(p, from) {
  for (const c of CAVES) {
    const dx = p.x - c.x, dz = p.z - c.z;
    if (Math.abs(dx) > c.R + 1.5 || Math.abs(dz) > c.R + 1.5) continue;
    const d = Math.hypot(dx, dz);
    if (d > c.R + 1.2) continue;
    const inside = Math.hypot(from.x - c.x, from.z - c.z) < c.R;
    const ceil = ceilAt(c, Math.min(d, c.R));
    const inGap = Math.abs(angleDiff(Math.atan2(dz, dx), c.entA)) < GAP - 0.04 && p.y < c.floor + c.H * 0.55;
    if (inside) {
      if (d < c.R && p.y > ceil - 0.65) return true;
      if (d > c.R - 0.75 && !inGap) return true;
    } else if (d < c.R + 0.7 && p.y < ceil + 0.7 && !inGap) return true;
  }
  return false;
}

export function caveInteracts(consider) {
  for (const it of CAVE_ITEMS) {
    if (it.ember) {
      if (G.flags['item_' + it.id] || !G.emberActive) continue;
      consider(it.x, it.z, it.label, () => takeItem(it), 2.6);
      continue;
    }
    if (G.flags['item_' + it.id] && !it.keep) continue;
    consider(it.x, it.z, it.label, () => takeItem(it), 2.6);
  }
}
function takeItem(it) {
  const lines = it.take();
  if (!it.keep) { G.flags['item_' + it.id] = true; it.mesh.visible = false; }
  sfx('craft');
  burst(new THREE.Vector3(it.x, it.y + 1, it.z), 0xffd070, 12, 3, 0.1, 2);
  if (lines && G.showDialogue) G.showDialogue(lines);
}
// re-apply looted items after loading a save
export function applyCaveFlags() {
  for (const it of CAVE_ITEMS) if (G.flags['item_' + it.id] && !it.keep) it.mesh.visible = false;
  G.player.maxHp = 100 + (G.flags.pearl ? 25 : 0) + (G.flags.charm ? 20 : 0);
}
export function addCaveItem(caveId, id, da, f, label, look, take, opts) { return item(caveById(caveId), id, da, f, label, look, take, opts); }

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
export function updateCaves(dt) {
  const P = G.player.pos;
  let inC = null, dark = 0;
  for (const c of CAVES) {
    const d = Math.hypot(P.x - c.x, P.z - c.z);
    if (d < c.R - 0.4) { inC = c; }
    if (d < c.R + 2) dark = Math.max(dark, smoothstep(c.R + 1.5, c.R - 3, d));
    // discovery
    if (d < c.R - 1 && !G.flags['cave_' + c.id] && G.player.alive) {
      G.flags['cave_' + c.id] = true;
      count('cavesFound');
      sfx('tame');
      toast(`Discovered: ${c.name}! (caves found ${cavesFound()}/${CAVES.length})`, 'chapter', null, 5);
      if (c.id === 'lava' && !G.flags.lavaGuardian) {
        G.flags.lavaGuardian = true;
        const gp = cavePoint(c, Math.PI + 0.4, 0.45);
        const e = new Enemy('brute', gp.x, gp.z, { guard: true, smart: 3, home: { x: c.x, z: c.z } });
        e.caveGuard = true;
        G.enemies.push(e);
        toast('Something huge stirs in the heat...', 'bad');
      }
    }
    // hints: a cool draft and a whisper of wind when you are close to a hidden mouth
    if (!G.flags['cave_' + c.id]) {
      const mx = c.x + c.ex * (c.R + 2), mz = c.z + c.ez * (c.R + 2);
      const dm = Math.hypot(P.x - mx, P.z - mz);
      if (dm < 26 && (!hintT[c.id] || G.t - hintT[c.id] > 80)) {
        hintT[c.id] = G.t;
        sfx('draft');
        toast(c.id === 'falls' ? 'Behind the roar of the falls, the air feels strangely cool...' : 'A cool draft brushes past you, smelling of wet stone. Something is close.', 'info', null, 4.5);
      }
    }
  }
  G.inCave = inC ? inC.id : null;
  G.caveDark = (G.caveDark || 0) + (dark - (G.caveDark || 0)) * Math.min(1, dt * 3);
  // lava pool hazard
  if (lavaPool && Math.hypot(P.x - lavaPool.x, P.z - lavaPool.z) < lavaPool.r && G.player.alive) G.player.hurt((G.flags.firewalk ? 6 : 24) * dt, 'lava', true);
  // torch: lit in caves and at night
  const want = Math.max(G.caveDark, (1 - G.light) * 0.55);
  const fl = 0.9 + Math.sin(G.t * 13) * 0.06 + Math.sin(G.t * 7.3) * 0.05;
  torchLight.intensity = want * 16 * fl;
  const f = G.player.facing;
  torchLight.position.set(P.x + Math.sin(f) * 0.9 - Math.cos(f) * 0.5, P.y + 2.7, P.z + Math.cos(f) * 0.9 + Math.sin(f) * 0.5);
  torchFlame.visible = want > 0.15 && G.player.h.g.visible;
  torchFlame.position.set(P.x + Math.cos(f) * -0.38 + Math.sin(f) * 0.25, P.y + 1.55, P.z - Math.sin(f) * -0.38 + Math.cos(f) * 0.25);
  torchFlame.scale.set(1, 1.6 * fl, 1);
  // bats at dusk and night over undiscovered mouths
  const dusk = G.cycle > 0.55 || G.cycle < 0.04;
  let i = 0;
  for (const c of CAVES) {
    const show = dusk && !G.flags['cave_' + c.id];
    for (let k = 0; k < 7; k++, i++) {
      if (!show) { bats.setMatrixAt(i, _m.makeScale(0, 0, 0)); continue; }
      const a = G.t * (0.9 + k * 0.07) + k * 0.9;
      const r = 4 + (k % 3) * 1.5;
      _p.set(c.x + c.ex * (c.R + 1) + Math.cos(a) * r, c.floor + c.H + 3.5 + Math.sin(G.t * 2 + k) * 1.2, c.z + c.ez * (c.R + 1) + Math.sin(a) * r);
      _q.setFromEuler(_e.set(0, -a, 0));
      const flap = 0.4 + Math.abs(Math.sin(G.t * 14 + k)) * 0.8;
      bats.setMatrixAt(i, _m.compose(_p, _q, _s.set(flap, 1, 1)));
    }
  }
  bats.instanceMatrix.needsUpdate = true;
}
