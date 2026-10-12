// Enemy NPCs: Kapu raiders, village guards, war totems, the Lava Chief, and the night-raid director.
import * as THREE from 'three';
import { G, count } from './state.js';
import { makeHumanoid, animHumanoid, setWeapon } from './models.js';
import { heightAt, LOC, VOLC } from './world.js';
import { resolveCircle, distToStructure } from './physics.js';
import { spawnProjectile } from './projectiles.js';
import { burst, sfx } from './fx.js';
import { toast, setBossBar } from './ui.js';
import { HealthBar, angleDiff, rand, pick, part, merge, mesh, MAT } from './util.js';

export const ETYPES = {
  warrior: { name: 'Kapu Warrior', hp: 40, speed: 3.9, dmg: 9, sdmg: 1, range: 1.7, cd: 1.1, scale: 1, weapon: 'spear', prefers: 'player', drop: { food: 1 },
    look: { skin: 0x7a4a30, bottom: 0x8a2a1a, mask: 0xd8c070, hair: 0x1a1a1a, paint: 0xd02020, necklace: 0xf0e0c0 } },
  torch: { name: 'Torchbearer', hp: 32, speed: 4.2, dmg: 6, sdmg: 3.2, range: 1.6, cd: 1.0, scale: 0.95, weapon: 'torch', prefers: 'struct', drop: { fiber: 2 },
    look: { skin: 0x6a3a24, bottom: 0x3a2a1a, mask: 0x2a2a2a, maskEye: 0xffa020, hair: 0x1a1a1a, paint: 0xff8a20 } },
  slinger: { name: 'Slinger', hp: 26, speed: 3.7, dmg: 7, sdmg: 0.6, range: 15, cd: 2.3, ranged: true, scale: 0.9, weapon: null, prefers: 'player', drop: { stone: 3 },
    look: { skin: 0x8a5a3a, bottom: 0x5a6a2a, mask: 0x9ad0c0, maskEye: 0x102020, hair: 0x2a1a10, necklace: 0x40a0a0 } },
  brute: { name: 'Lava Brute', hp: 160, speed: 2.7, dmg: 22, sdmg: 2.6, range: 2.4, cd: 1.8, scale: 1.45, bulk: 1.3, weapon: 'warclub', prefers: 'struct', drop: { obsidian: 2, food: 2 },
    look: { skin: 0x4a2a20, bottom: 0x1a1a1a, mask: 0x1a1010, maskEye: 0xff5010, hair: null, glow: 0xff6a10 } },
  boss: { name: 'Kaʻula, the Lava Chief', hp: 1100, speed: 3.2, dmg: 21, sdmg: 2, range: 3.4, cd: 1.6, scale: 2.3, bulk: 1.35, weapon: 'warclub', prefers: 'player', boss: true, drop: {},
    look: { skin: 0x3b2420, bottom: 0x8a1a10, mask: 0x1a1010, maskEye: 0xffaa20, hair: null, glow: 0xff7a20, headdress: 0xd02020, necklace: 0xffd040 } },
};

let ringMesh = null;

export class Enemy {
  constructor(type, x, z, opts = {}) {
    this.type = type; this.def = ETYPES[type];
    const d = this.def;
    this.h = makeHumanoid({ ...d.look, scale: d.scale, bulk: d.bulk || 1 });
    setWeapon(this.h, d.weapon);
    G.scene.add(this.h.g);
    this.pos = this.h.g.position;
    this.pos.set(x, heightAt(x, z), z);
    this.vel = new THREE.Vector3();
    this.knock = new THREE.Vector3();
    this.radius = 0.45 * d.scale; this.height = 1.9 * d.scale;
    const hpMul = opts.hpMul || 1;
    this.maxHp = d.hp * hpMul; this.hp = this.maxHp;
    this.alive = true; this.facing = 0; this.phase = Math.random() * 6;
    this.cd = rand(0.5, 1.5); this.attackT = -1; this.retarget = 0;
    this.raid = !!opts.raid; this.guard = !!opts.guard; this.home = opts.home || { x, z };
    this.smart = opts.smart || 1; this.spawnPt = { x, z };
    this.slow = 1; this.isBoss = !!d.boss;
    this.bar = new HealthBar(1.0, 2.25, 0xe04030);
    this.h.root.add(this.bar.group);
    if (opts.flank) this.waypoint = opts.flank;
    if (this.isBoss) { this.slamT = 5; this.lavaT = 3; this.summons = 0; this.bar.group.visible = false; }
    if (type === 'torch' || type === 'brute') {
      this.light = null;
    }
  }

  dist(t) {
    if (t.seg || t.def?.cost) return distToStructure(t, this.pos.x, this.pos.z);
    const p = t.pos || t;
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z) - (t.radius || 0.4);
  }
  aimPoint(t) {
    if (t.seg) {
      const { ax, az, bx, bz } = t.seg; const vx = bx - ax, vz = bz - az;
      let k = ((this.pos.x - ax) * vx + (this.pos.z - az) * vz) / (vx * vx + vz * vz);
      k = Math.max(0, Math.min(1, k));
      return { x: ax + vx * k, z: az + vz * k };
    }
    if (t.pos) return { x: t.pos.x, z: t.pos.z };
    return { x: t.x, z: t.z };
  }

  chooseTarget() {
    const P = G.player;
    const dP = P.alive ? this.dist(P) : 1e9;
    let pet = null, dPet = 1e9;
    for (const a of G.animals) if (a.tamed && a.active) { const d = this.dist(a); if (d < dPet) { dPet = d; pet = a; } }
    const H = G.hearth && !G.hearth.doused ? G.hearth : null;
    if (this.isBoss) return P.alive ? P : (pet || null);
    if (this.guard) {
      if (dP < 30) return P;
      if (dPet < 20) return pet;
      return null;
    }
    if (this.aggroT > 0 && dP < 14) return P;
    if (this.def.prefers === 'struct') {
      let best = null, bs = 1e9;
      const ref = H || P.pos;
      for (const s of G.structures) {
        if (!s.alive || s.type === 'hearth' || s.type === 'torch' || s.type === 'spikes') continue;
        const dRef = Math.hypot(s.x - (ref.x ?? ref.pos?.x), s.z - (ref.z ?? ref.pos?.z));
        if (dRef > 40) continue;
        const d = this.dist(s);
        const score = this.smart >= 2 ? (s.hp / s.maxHp) * 22 + s.tier * 8 + d * 0.55 : d;
        if (score < bs) { bs = score; best = s; }
      }
      if (best && (this.smart >= 2 || bs < 25)) return best;
      return H || (P.alive ? P : pet);
    }
    if (this.def.ranged) {
      if (dP < 32) return P;
      if (dPet < 25) return pet;
      // slingers harass towers when smart
      if (this.smart >= 3) { const tw = G.structures.find((s) => s.alive && (s.type === 'tower' || s.type === 'ballista')); if (tw) return tw; }
      return H || (P.alive ? P : null);
    }
    if (dP < 22) return P;
    if (dPet < 12) return pet;
    return H || (P.alive ? P : pet);
  }

  update(dt) {
    if (!this.alive) return;
    const d = this.def;
    this.cd -= dt; this.retarget -= dt; this.aggroT = (this.aggroT || 0) - dt;
    if (this.isBoss) return this.updateBoss(dt);
    this.slow = Math.min(1, this.slow + dt * 1.5);
    // decide state
    if (this.state === 'flee') {
      this.moveToward(this.spawnPt.x, this.spawnPt.z, dt, 1.2);
      this.fleeT -= dt;
      if (this.fleeT <= 0 || Math.hypot(this.pos.x - this.spawnPt.x, this.pos.z - this.spawnPt.z) < 3) this.remove();
      return this.animate(dt, true);
    }
    if (this.state === 'retreat') {
      this.moveToward(this.spawnPt.x, this.spawnPt.z, dt, 1.1);
      this.retreatT -= dt;
      this.hp = Math.min(this.maxHp * 0.65, this.hp + dt * this.maxHp * 0.08);
      if (this.retreatT <= 0) { this.state = null; this.retarget = 0; }
      return this.animate(dt, true);
    }
    if (this.smart >= 4 && !this.retreated && this.hp < this.maxHp * 0.25 && !this.guard) {
      this.state = 'retreat'; this.retreated = true; this.retreatT = 6;
      return;
    }
    if (this.retarget <= 0 || !this.target || !this.target.alive || this.target.state === 'ko' || (this.target === G.hearth && G.hearth.doused)) {
      this.target = this.chooseTarget(); this.retarget = 0.8 + Math.random() * 0.4;
    }
    if (this.blockT > 0) this.blockT -= dt; else this.blocker = null;
    const tgt = (this.blocker && this.blocker.alive) ? this.blocker : this.target;
    let moving = false;
    if (!tgt) {
      // guards drift home
      if (this.guard && Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z) > 4) { this.moveToward(this.home.x, this.home.z, dt, 0.6); moving = true; }
      return this.animate(dt, moving);
    }
    if (this.guard && Math.hypot(this.pos.x - this.home.x, this.pos.z - this.home.z) > 42) { this.target = null; this.moveToward(this.home.x, this.home.z, dt, 1); return this.animate(dt, true); }
    const ap = this.aimPoint(tgt);
    const dist = this.dist(tgt);
    if (this.waypoint) {
      if (Math.hypot(this.pos.x - this.waypoint.x, this.pos.z - this.waypoint.z) < 4 || dist < 12) this.waypoint = null;
      else { this.moveToward(this.waypoint.x, this.waypoint.z, dt, 1); return this.animate(dt, true); }
    }
    if (d.ranged) {
      if (dist > d.range * 0.85) { this.moveToward(ap.x, ap.z, dt, 1); moving = true; }
      else if (dist < 6 && tgt === G.player) { this.moveToward(this.pos.x * 2 - ap.x, this.pos.z * 2 - ap.z, dt, 0.8); moving = true; }
    } else if (dist > d.range) {
      if (this.sidestep > 0) {
        this.sidestep -= dt;
        this.moveToward(this.pos.x + this.sideDir.x * 5, this.pos.z + this.sideDir.z * 5, dt, 1);
      } else this.moveToward(ap.x, ap.z, dt, 1);
      moving = true;
    }
    this.face(ap.x, ap.z, dt);
    if (dist <= d.range + 0.25 && this.cd <= 0) {
      this.attackT = 0; this.cd = d.cd * rand(0.9, 1.15); this.pendingTarget = tgt;
    }
    if (this.attackT >= 0) {
      const prev = this.attackT;
      this.attackT += dt / Math.min(0.8, d.cd * 0.7);
      if (prev < 0.5 && this.attackT >= 0.5) this.strike(this.pendingTarget);
      if (this.attackT >= 1) this.attackT = -1;
    }
    this.animate(dt, moving);
  }

  strike(t) {
    if (!t || !t.alive) return;
    const d = this.def;
    if (d.ranged) {
      const from = this.pos.clone(); from.y += 1.5 * d.scale;
      const ap = this.aimPoint(t);
      const ty = (t.pos ? t.pos.y : heightAt(ap.x, ap.z)) + 1;
      const to = new THREE.Vector3(ap.x, ty, ap.z);
      const speed = 24, grav = 8;
      const tt = from.distanceTo(to) / speed;
      const v = to.sub(from).normalize().multiplyScalar(speed);
      v.x += rand(-1, 1); v.y += 0.5 * grav * tt;
      spawnProjectile({ pos: from, vel: v, dmg: d.dmg, owner: 'enemy', grav, color: 0x777770, size: 0.12 });
      return;
    }
    if (this.dist(t) > d.range + 0.6) return;
    const isStruct = !!t.def?.cost;
    const dmg = isStruct ? d.dmg * d.sdmg : d.dmg;
    t.hurt(dmg, this);
    if (isStruct) burst(new THREE.Vector3(this.aimPoint(t).x, this.pos.y + 1, this.aimPoint(t).z), this.type === 'torch' ? 0xff8a20 : 0xa08060, 4, 3, 0.1);
    else sfx('hit');
  }

  moveToward(x, z, dt, mul) {
    const dx = x - this.pos.x, dz = z - this.pos.z, dd = Math.hypot(dx, dz);
    if (dd < 0.05) return;
    const sp = this.def.speed * mul * this.slow * (G.isNight ? 1 : 0.95);
    const ox = this.pos.x, oz = this.pos.z;
    this.vel.set((dx / dd) * sp, 0, (dz / dd) * sp);
    this.pos.x += this.vel.x * dt + this.knock.x * dt; this.pos.z += this.vel.z * dt + this.knock.z * dt;
    this.knock.multiplyScalar(Math.max(0, 1 - dt * 8));
    // separation
    for (const o of G.enemies) {
      if (o === this || !o.alive) continue;
      const sx = this.pos.x - o.pos.x, sz = this.pos.z - o.pos.z, s = Math.hypot(sx, sz), m = this.radius + o.radius;
      if (s < m && s > 0.001) { this.pos.x += (sx / s) * (m - s) * 0.5; this.pos.z += (sz / s) * (m - s) * 0.5; }
    }
    const hit = resolveCircle(this.pos, this.radius, 'enemy');
    if (heightAt(this.pos.x, this.pos.z) < -0.8 && this.state !== 'flee') { this.pos.x = ox; this.pos.z = oz; }
    if (hit && hit !== this.target && !this.isBoss) {
      if (this.smart >= 3 && hit.tier >= 1 && !this.triedSide && this.def.prefers !== 'struct') {
        this.triedSide = true; this.sidestep = 2.2;
        const sgn = Math.random() < 0.5 ? 1 : -1;
        this.sideDir = { x: -dz / dd * sgn, z: dx / dd * sgn };
      } else if (!(this.sidestep > 0)) { this.blocker = hit; this.blockT = 2.5; }
    }
    this.pos.y = Math.max(heightAt(this.pos.x, this.pos.z), -0.8);
    this.face(x, z, dt);
  }
  face(x, z, dt) {
    const want = Math.atan2(x - this.pos.x, z - this.pos.z);
    this.facing += angleDiff(this.facing, want) * Math.min(1, dt * 10);
    this.h.g.rotation.y = this.facing;
  }
  animate(dt, moving) {
    this.phase += dt * (moving ? this.def.speed * 1.8 * this.slow : 0);
    animHumanoid(this.h, this.phase, moving ? 1 : 0, this.attackT);
    if (this.flash > 0) this.flash -= dt;
    if (!this.isBoss) this.bar.set(this.hp / this.maxHp, G.camera);
    if (this.h.weapon?.userData.flame) this.h.weapon.userData.flame.scale.y = 1.4 + Math.sin(G.t * 14 + this.phase) * 0.3;
  }

  hurt(n, src, silent, knock) {
    if (!this.alive) return;
    this.hp -= n;
    if (src === 'player') { this.aggroT = 6; if (!this.isBoss) this.retarget = 0; }
    if (knock && !this.isBoss) this.knock.add(new THREE.Vector3(knock.x, 0, knock.z).normalize().multiplyScalar(this.def.scale > 1.2 ? 2 : 6));
    if (!silent) { burst(this.pos.clone().setY(this.pos.y + this.height * 0.6), 0xffd0a0, 5, 3, 0.09); sfx('hit'); }
    if (this.isBoss) setBossBar(this.def.name, this.hp / this.maxHp);
    if (this.hp <= 0) this.die(src);
  }
  die(src) {
    this.alive = false;
    G.stats.kills++; count('kills'); count('kill_' + this.type);
    burst(this.pos.clone().setY(this.pos.y + 1), this.def.look.glow || 0xc8a070, 16, 5, 0.15);
    for (const k in this.def.drop) G.inv[k] += this.def.drop[k];
    const dropStr = Object.entries(this.def.drop).map(([k, v]) => `${v} ${k}`).join(', ');
    if (dropStr && (src === 'player' || src === 'tower' || src === 'trap' || src === 'pet')) toast(`${this.def.name} defeated · +${dropStr}`, 'res');
    if (this.isBoss) { onBossDefeated(); }
    this.remove(0.8);
  }
  remove(delay = 0) {
    this.alive = false;
    const g = this.h.g;
    if (delay) {
      g.rotation.x = -Math.PI / 2; g.position.y += 0.3;
      setTimeout(() => G.scene.remove(g), delay * 1000);
    } else G.scene.remove(g);
  }

  // ---------------- Boss ----------------
  updateBoss(dt) {
    const P = G.player;
    const cx = VOLC.x, cz = VOLC.z;
    const tgt = this.chooseTarget();
    let moving = false;
    this.slamT -= dt; this.lavaT -= dt;
    if (this.slamming >= 0) {
      this.slamming += dt;
      ringMesh.scale.setScalar(0.3 + Math.min(1, this.slamming / 1.1) * 6.5);
      ringMesh.material.opacity = 0.25 + Math.min(1, this.slamming / 1.1) * 0.4;
      this.attackT = Math.min(0.49, this.slamming / 1.1 * 0.5);
      if (this.slamming >= 1.1) {
        this.attackT = 0.5;
        ringMesh.visible = false; this.slamming = -1;
        sfx('crumble'); burst(this.pos.clone().setY(this.pos.y + 0.3), 0xff6a10, 30, 9, 0.22);
        if (P.alive && Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z) < 6.8) P.hurt(26, 'slam');
        for (const a of G.animals) if (a.tamed && a.active && Math.hypot(a.pos.x - this.pos.x, a.pos.z - this.pos.z) < 6.8) a.hurt(30);
        this.cd = 1.2;
      }
      animHumanoid(this.h, this.phase, 0, this.attackT < 0.5 ? this.attackT : -1);
      return;
    }
    if (tgt) {
      const dist = this.dist(tgt);
      const homeD = Math.hypot(this.pos.x - cx, this.pos.z - cz);
      if (this.slamT <= 0 && dist < 8) {
        this.slamming = 0; this.slamT = 7 + rand(0, 2);
        ringMesh.visible = true; ringMesh.position.set(this.pos.x, this.pos.y + 0.15, this.pos.z);
        sfx('roar');
        return;
      }
      if (this.lavaT <= 0 && dist > 5 && dist < 34) {
        this.lavaT = this.hp < this.maxHp * 0.5 ? 2.2 : 3.4;
        const from = this.pos.clone(); from.y += 4;
        const to = tgt.pos.clone(); to.x += (tgt.vel?.x || 0) * 0.6; to.z += (tgt.vel?.z || 0) * 0.6;
        const tt = 1.3, grav = 14;
        const v = new THREE.Vector3((to.x - from.x) / tt, (to.y - from.y + 0.5 * grav * tt * tt) / tt, (to.z - from.z) / tt);
        spawnProjectile({ pos: from, vel: v, dmg: 15, owner: 'enemy', grav, color: 0xff6a10, size: 0.45, lava: true, splash: 2.6 });
        this.attackT = 0.3;
      }
      if (dist > this.def.range) {
        const ap = this.aimPoint(tgt);
        if (Math.hypot(ap.x - cx, ap.z - cz) < 22 || homeD > 18) { this.moveToward(homeD > 18 ? cx : ap.x, homeD > 18 ? cz : ap.z, dt, 1); moving = true; }
      } else {
        this.face(tgt.pos.x, tgt.pos.z, dt);
        if (this.cd <= 0) { this.attackT = 0; this.cd = this.def.cd; this.pendingTarget = tgt; }
      }
    }
    if (this.attackT >= 0) {
      const prev = this.attackT;
      this.attackT += dt / 0.9;
      if (prev < 0.5 && this.attackT >= 0.5 && this.pendingTarget) this.strike(this.pendingTarget);
      if (this.attackT >= 1) this.attackT = -1;
    }
    // summons
    const pct = this.hp / this.maxHp;
    if ((pct < 0.66 && this.summons === 0) || (pct < 0.33 && this.summons === 1)) {
      this.summons++;
      toast('Kaʻula calls his warriors from the ash!', 'bad');
      sfx('roar');
      for (let i = 0; i < 2 + this.summons; i++) {
        const a = Math.random() * Math.PI * 2;
        const e = new Enemy(i % 2 ? 'warrior' : 'slinger', cx + Math.cos(a) * 9, cz + Math.sin(a) * 9, { smart: 3, guard: true, home: { x: cx, z: cz } });
        G.enemies.push(e);
      }
    }
    this.animate(dt, moving);
  }
}

function onBossDefeated() {
  setBossBar(null);
  G.boss = null;
  count('bossKilled');
  G.flags.lavaCooled = true;
  sfx('victory');
  for (const e of G.enemies) if (e.alive && !e.isBoss) e.remove();
}

export function spawnBoss() {
  if (G.boss || G.counters.bossKilled) return;
  const b = new Enemy('boss', VOLC.x + 4, VOLC.z + 4, { smart: 5 });
  b.pos.y = heightAt(b.pos.x, b.pos.z);
  G.enemies.push(b); G.boss = b;
  if (!ringMesh) {
    ringMesh = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32), new THREE.MeshBasicMaterial({ color: 0xff3010, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
    ringMesh.rotation.x = -Math.PI / 2;
    G.scene.add(ringMesh);
  }
  ringMesh.visible = false;
  setBossBar(b.def.name, 1);
  sfx('roar');
}

// ---------------- War totems ----------------
export function initTotems() {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 1.2;
    const x = LOC.village.x + Math.cos(a) * 6.5, z = LOC.village.z + Math.sin(a) * 6.5;
    const y = heightAt(x, z);
    const ps = [];
    const cols = [0x6b4a2e, 0x7a3a2a, 0x5a3d24];
    for (let k = 0; k < 3; k++) {
      ps.push(part(new THREE.BoxGeometry(1.0, 1.4, 1.0), cols[k], { pos: [0, 0.7 + k * 1.4, 0] }));
      ps.push(part(new THREE.BoxGeometry(0.9, 0.25, 0.1), 0xf0e0c0, { pos: [0, 0.4 + k * 1.4, 0.52] }));
      ps.push(part(new THREE.BoxGeometry(0.2, 0.2, 0.1), 0xff2010, { pos: [0.22, 0.95 + k * 1.4, 0.52] }), part(new THREE.BoxGeometry(0.2, 0.2, 0.1), 0xff2010, { pos: [-0.22, 0.95 + k * 1.4, 0.52] }));
    }
    ps.push(part(new THREE.BoxGeometry(2.4, 0.2, 0.4), 0xd02020, { pos: [0, 4.0, 0] }));
    const m = mesh(merge(ps));
    m.position.set(x, y, z);
    m.rotation.y = Math.atan2(LOC.village.x - x, LOC.village.z - z) + Math.PI;
    G.scene.add(m);
    const bar = new HealthBar(1.6, 4.8, 0xd04030);
    m.add(bar.group);
    const t = {
      x, z, y, mesh: m, hp: 240, maxHp: 240, alive: true, bar, radius: 0.7,
      pos: new THREE.Vector3(x, y, z),
      hurt(n) {
        if (!this.alive) return;
        if (G.story.ch < 3) {
          if (!G.flags.totemWarn || G.t - G.flags.totemWarn > 6) { G.flags.totemWarn = G.t; toast('A powerful kapu protects the totem. Not yet...', 'warn'); }
          burst(new THREE.Vector3(x, y + 2, z), 0xff2010, 4, 2, 0.1); return;
        }
        this.hp -= n;
        burst(new THREE.Vector3(x, y + 2, z), 0x8a5a3a, 6, 4, 0.12); sfx('chop');
        if (this.hp <= 0) {
          this.alive = false; count('totems');
          this.mesh.rotation.x = Math.PI / 2 - 0.1; this.mesh.position.y += 0.5;
          burst(new THREE.Vector3(x, y + 2, z), 0xff2010, 30, 7, 0.18); sfx('crumble');
          toast(`War totem toppled! (${G.counters.totems}/3)`, 'good');
          bar.group.visible = false;
        }
      },
    };
    G.totems.push(t);
  }
}

// ---------------- Raid director ----------------
function findSpawn(angle, from) {
  for (let r = 62; r > 20; r -= 3) {
    for (let da = 0; da < 1.2; da += 0.2) {
      for (const s of [1, -1]) {
        const a = angle + da * s;
        const x = from.x + Math.cos(a) * r, z = from.z + Math.sin(a) * r;
        const h = heightAt(x, z);
        if (h > 0.6 && h < 9 && Math.hypot(x - LOC.village.x, z - LOC.village.z) > 25 && Math.hypot(x - VOLC.x, z - VOLC.z) > 30) return { x, z };
      }
    }
  }
  return { x: from.x + Math.cos(angle) * 30, z: from.z + Math.sin(angle) * 30 };
}

export function raidComposition(n) {
  const total = Math.min(3 + Math.floor((n - 1) * 2.3), 26);
  const list = [];
  const brutes = n >= 4 ? Math.min(4, Math.floor((n - 2) / 2)) : 0;
  const torches = n >= 2 ? Math.max(1, Math.floor(total * 0.2)) : 0;
  const slingers = n >= 3 ? Math.max(1, Math.floor(total * 0.2)) : 0;
  for (let i = 0; i < brutes; i++) list.push('brute');
  for (let i = 0; i < torches; i++) list.push('torch');
  for (let i = 0; i < slingers; i++) list.push('slinger');
  while (list.length < total) list.push('warrior');
  return list;
}

export function startNight() {
  G.isNight = true;
  if (!G.hearth) { toast('Night falls. The jungle is quiet... for now.', 'info'); return; }
  const n = ++G.raid.night;
  const H = G.hearth;
  const comp = raidComposition(n);
  const dirs = n < 3 ? 1 : n < 5 ? 2 : 3;
  const base = Math.random() * Math.PI * 2;
  const pts = [];
  for (let k = 0; k < dirs; k++) pts.push(findSpawn(base + (k * Math.PI * 2) / dirs + rand(-0.3, 0.3), H));
  const smart = Math.min(5, n);
  // shuffle so brutes etc. are spread over waves
  comp.sort(() => Math.random() - 0.5);
  G.raid.queue = comp.map((type, i) => ({ type, at: 2 + Math.floor(i / 3) * 6 + Math.random() * 2, pt: pts[i % dirs], smart }));
  G.raid.active = true; G.raid.t = 0; G.raid.total = comp.length;
  sfx('drum');
  const smartTxt = smart >= 4 ? ' They are learning — expect flanks, retreats and siege brutes.' : smart >= 3 ? ' They come from several directions.' : smart >= 2 ? ' Torchbearers will target your weakest walls.' : '';
  toast(`Night ${n}: war drums echo across the island! ${comp.length} raiders approach.${smartTxt}`, 'bad', null, 7);
}

export function endNight() {
  G.isNight = false;
  if (!G.raid.active) return;
  G.raid.active = false;
  G.raid.queue = [];
  for (const e of G.enemies) if (e.alive && e.raid) { e.state = 'flee'; e.fleeT = 10; }
  count('raidsSurvived');
  sfx('dawn');
  toast(`Dawn breaks — you survived night ${G.raid.night}! The raiders retreat to the sea.`, 'good', null, 5);
}

let villageCD = 0;
export function updateEnemies(dt) {
  // raid spawning
  if (G.raid.active) {
    G.raid.t += dt;
    const H = G.hearth;
    while (G.raid.queue.length && G.raid.queue[0].at <= G.raid.t) {
      const q = G.raid.queue.shift();
      const x = q.pt.x + rand(-3, 3), z = q.pt.z + rand(-3, 3);
      let flank = null;
      if (q.smart >= 3 && H && Math.random() < 0.5) {
        const dx = H.x - x, dz = H.z - z, d = Math.hypot(dx, dz) || 1;
        const s = Math.random() < 0.5 ? 1 : -1;
        flank = { x: H.x - dx / d * 10 + (-dz / d) * 16 * s, z: H.z - dz / d * 10 + (dx / d) * 16 * s };
        if (heightAt(flank.x, flank.z) < 0.6) flank = null;
      }
      const hpMul = 1 + Math.max(0, G.raid.night - 3) * 0.08;
      G.enemies.push(new Enemy(q.type, x, z, { raid: true, smart: q.smart, flank, hpMul }));
    }
    G.raid.queue.sort((a, b) => a.at - b.at);
  }
  // village guards
  villageCD -= dt;
  const P = G.player;
  const dV = Math.hypot(P.pos.x - LOC.village.x, P.pos.z - LOC.village.z);
  if (dV < 30 && villageCD <= 0 && P.alive && !G.counters.bossKilled) {
    const alive = G.enemies.filter((e) => e.alive && e.guard && !e.isBoss).length;
    if (alive === 0) {
      villageCD = 75;
      const n = 3 + G.story.ch + (G.story.ch >= 3 ? 2 : 0);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const type = i === 0 && G.story.ch >= 2 ? 'brute' : i % 3 === 2 ? 'slinger' : 'warrior';
        G.enemies.push(new Enemy(type, LOC.village.x + Math.cos(a) * 9, LOC.village.z + Math.sin(a) * 9, { guard: true, smart: 2 + G.story.ch, home: LOC.village }));
      }
      toast('Kapu guards spot you! The village defends itself.', 'bad');
      sfx('drum');
    }
  }
  for (const e of G.enemies) e.update(dt);
  G.enemies = G.enemies.filter((e) => e.alive);
  for (const t of G.totems) if (t.alive) t.bar.set(t.hp / t.maxHp, G.camera);
}
