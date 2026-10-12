// Animals: wild dogs, ghost wolves, boars. Tame them and they defend you and your base.
import * as THREE from 'three';
import { G, count } from './state.js';
import { makeQuad, animQuad } from './models.js';
import { heightAt, LOC, distVolcano } from './world.js';
import { resolveCircle } from './physics.js';
import { burst, sfx } from './fx.js';
import { toast } from './ui.js';
import { HealthBar, makeLabel, angleDiff, rand, pick } from './util.js';
import { petCap } from './building.js';

export const AKINDS = {
  dog: { label: 'Wild Dog', hp: 60, speed: 6.0, dmg: 8, range: 1.3, cd: 0.8, tameCost: 2, color: 0xb08a5a, accent: 0xf0e8d8 },
  wolf: { label: 'Ghost Wolf', hp: 95, speed: 6.4, dmg: 13, range: 1.5, cd: 1.0, tameCost: 3, color: 0x9aa3b5, accent: 0xdde4f0 },
  boar: { label: 'Wild Boar', hp: 120, speed: 4.8, dmg: 11, range: 1.4, cd: 1.2, tameCost: 4, color: 0x4a3226, accent: 0x2a1a10 },
};
const NAMES = { dog: ['Koa', 'Poi', 'Lani', 'Kai'], wolf: ['Makani', 'Hina', 'Lono', 'Ao'], boar: ['Puaʻa Nui', 'Kalo', 'Moku'] };

export class Animal {
  constructor(kind, x, z, opts = {}) {
    this.kind = kind; this.k = AKINDS[kind];
    this.q = makeQuad(kind, opts.color ?? this.k.color, opts.accent ?? this.k.accent);
    G.scene.add(this.q.g);
    this.pos = this.q.g.position;
    this.pos.set(x, heightAt(x, z), z);
    this.vel = new THREE.Vector3();
    this.maxHp = this.k.hp; this.hp = this.maxHp;
    this.alive = true; this.tamed = false; this.mode = 'follow'; this.fed = 0;
    this.radius = kind === 'boar' ? 0.55 : 0.45;
    this.home = { x, z }; this.wander = null; this.wanderT = 0;
    this.phase = 0; this.facing = rand(0, 6); this.cd = 0; this.attackT = -1;
    this.state = opts.state || 'wander';
    this.name = opts.name || null;
    this.story = !!opts.story;
    this.colors = { color: opts.color ?? this.k.color, accent: opts.accent ?? this.k.accent };
    this.tameCost = opts.tameCost ?? this.k.tameCost;
    this.bar = new HealthBar(0.9, 1.6, 0x50c0ff);
    this.q.root.add(this.bar.group);
    this.slot = Math.random() * Math.PI * 2;
  }
  get label() { return this.name || this.k.label; }
  get active() { return this.alive && this.state !== 'ko'; }
  canTame() {
    if (this.tamed || !this.alive) return false;
    if (this.kind === 'wolf') return this.state === 'submissive';
    if (this.kind === 'boar') return this.state !== 'aggro';
    return true;
  }
  feed() {
    if (G.inv.food < 1) { sfx('error'); toast('You need food to feed animals. Gather berries or coconuts.', 'warn'); return; }
    G.inv.food--;
    burst(this.pos.clone().setY(this.pos.y + 1.2), 0xff6080, 6, 2, 0.1, 2);
    if (this.tamed) { this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.5); toast(`${this.label} munches happily (+health)`, 'good'); sfx('pickup'); return; }
    this.fed++;
    sfx('pickup');
    if (this.fed >= this.tameCost) this.tame();
    else toast(`${this.label} sniffs the food... (${this.fed}/${this.tameCost})`, 'info');
  }
  tame() {
    const pets = G.animals.filter((a) => a.tamed).length;
    if (pets >= petCap()) { toast(`You can only keep ${petCap()} animals. Build a Pet Hale to keep more.`, 'warn'); this.fed = this.tameCost - 1; return; }
    this.tamed = true; this.state = 'idle'; this.hp = this.maxHp;
    if (!this.name) {
      const used = new Set(G.animals.map((a) => a.name));
      this.name = NAMES[this.kind].find((n) => !used.has(n)) || this.k.label;
    }
    this.label3d = makeLabel(this.name, '#bfe8ff');
    this.label3d.position.y = 2.0; this.label3d.scale.set(1.6, 0.4, 1);
    this.q.g.add(this.label3d);
    this.bar.fg.material.color.setHex(0x50c0ff);
    count('tamed_' + this.kind); count('tamed_any');
    sfx('tame'); if (this.kind === 'dog') sfx('bark');
    burst(this.pos.clone().setY(this.pos.y + 1.2), 0xff70a0, 16, 3, 0.12, 2);
    toast(`${this.name} the ${this.kind === 'wolf' ? 'ghost wolf' : this.kind} is now your companion! [P] toggles follow / guard base.`, 'good', null, 5);
  }
  hurt(n, src) {
    if (!this.alive || this.state === 'ko') return;
    this.hp -= n;
    this.lastHurt = G.t;
    burst(this.pos.clone().setY(this.pos.y + 0.8), 0xffd0a0, 4, 3, 0.08);
    if (!this.tamed) {
      if (this.kind === 'dog') { this.hp = Math.max(this.hp, 5); this.state = 'flee'; this.stateT = 5; return; }
      if (this.kind === 'wolf' && this.hp < this.maxHp * 0.3 && this.hp > 0 && this.state !== 'submissive') {
        this.state = 'submissive'; this.stateT = 22;
        toast('The ghost wolf cowers, submitting. Feed it [E] to tame it!', 'good', null, 4);
        return;
      }
      if (this.kind === 'boar' && src === 'player') { this.state = 'aggro'; this.stateT = 10; }
      if (this.kind === 'wolf' && this.state !== 'submissive') { this.state = 'aggro'; this.stateT = 15; }
      if (this.hp <= 0) {
        this.alive = false;
        const meat = this.kind === 'boar' ? 3 : 2;
        G.inv.food += meat; count('foodGathered', meat);
        toast(`+${meat} food`, 'res', 'food');
        this.q.g.rotation.z = Math.PI / 2;
        setTimeout(() => G.scene.remove(this.q.g), 1500);
      }
    } else if (this.hp <= 0) {
      this.state = 'ko'; this.hp = 0;
      this.q.g.visible = false;
      toast(`${this.name} was knocked out and limped home. Back at dawn.`, 'bad');
    }
  }
  reviveAtHome() {
    if (this.state !== 'ko') return;
    const H = G.hearth || G.player;
    const x = (H.x ?? H.pos.x) + rand(-2, 2), z = (H.z ?? H.pos.z) + rand(-2, 2);
    this.pos.set(x, heightAt(x, z), z);
    this.hp = this.maxHp; this.state = 'idle'; this.q.g.visible = true;
  }

  moveToward(x, z, dt, mul = 1) {
    const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.1) return false;
    const sp = this.k.speed * mul;
    const ox = this.pos.x, oz = this.pos.z;
    this.vel.set((dx / d) * sp, 0, (dz / d) * sp);
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    resolveCircle(this.pos, this.radius, this.tamed ? 'pet' : 'animal');
    const h = heightAt(this.pos.x, this.pos.z);
    if (h < -0.5) { this.pos.x = ox; this.pos.z = oz; this.wander = null; }
    const want = Math.atan2(dx, dz);
    this.facing += angleDiff(this.facing, want) * Math.min(1, dt * 10);
    return true;
  }

  update(dt) {
    if (!this.alive || this.state === 'ko') return;
    this.cd -= dt;
    let moving = false, sit = false;
    const P = G.player;
    const dP = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
    if (this.stateT !== undefined) this.stateT -= dt;
    if (this.tamed) {
      const kennel = G.structures.some((s) => s.type === 'kennel' && Math.hypot(s.x - this.pos.x, s.z - this.pos.z) < 12);
      if (!this.lastHurt || G.t - this.lastHurt > 4) this.hp = Math.min(this.maxHp, this.hp + dt * (kennel ? 6 : 2));
      const anchor = this.mode === 'guard' && G.hearth ? { x: G.hearth.x, z: G.hearth.z } : { x: P.pos.x, z: P.pos.z };
      const engage = this.mode === 'guard' ? 18 : 13;
      let tgt = null, bd = 1e9;
      for (const e of G.enemies) {
        if (!e.alive) continue;
        const da = Math.hypot(e.pos.x - anchor.x, e.pos.z - anchor.z);
        if (da > engage) continue;
        const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
        if (d < bd) { bd = d; tgt = e; }
      }
      if (!tgt && this.mode === 'follow') {
        for (const a of G.animals) if (!a.tamed && a.alive && a.state === 'aggro' && Math.hypot(a.pos.x - P.pos.x, a.pos.z - P.pos.z) < 10) { tgt = a; bd = Math.hypot(a.pos.x - this.pos.x, a.pos.z - this.pos.z); }
      }
      if (tgt) {
        const reach = this.k.range + (tgt.radius || 0.5);
        if (bd > reach) moving = this.moveToward(tgt.pos.x, tgt.pos.z, dt, 1.05);
        else {
          this.facing += angleDiff(this.facing, Math.atan2(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z)) * Math.min(1, dt * 10);
          if (this.cd <= 0) {
            this.cd = this.k.cd; this.attackT = 0;
            tgt.hurt(this.k.dmg, 'pet');
            if (this.kind === 'dog' && Math.random() < 0.3) sfx('bark');
          }
        }
      } else if (this.mode === 'follow') {
        const ox = P.pos.x + Math.sin(this.slot) * 2.6, oz = P.pos.z + Math.cos(this.slot) * 2.6;
        const d = Math.hypot(ox - this.pos.x, oz - this.pos.z);
        if (d > 25) { this.pos.set(ox, heightAt(ox, oz), oz); }
        else if (d > 1.2) moving = this.moveToward(ox, oz, dt, d > 6 ? 1.2 : 0.75);
        else sit = true;
      } else {
        // guard: patrol around the hearth
        if (!this.wander || this.wanderT <= 0) {
          const a = Math.random() * Math.PI * 2, r = rand(3, 9);
          this.wander = { x: anchor.x + Math.cos(a) * r, z: anchor.z + Math.sin(a) * r }; this.wanderT = rand(4, 9);
        }
        this.wanderT -= dt;
        if (Math.hypot(this.wander.x - this.pos.x, this.wander.z - this.pos.z) > 0.8) moving = this.moveToward(this.wander.x, this.wander.z, dt, 0.4);
        else sit = true;
      }
    } else {
      // ---------- wild behaviour ----------
      if (this.state === 'submissive') {
        sit = true;
        if (this.stateT <= 0) { this.state = 'aggro'; this.hp = this.maxHp * 0.6; this.stateT = 10; }
      } else if (this.state === 'scared') {
        sit = true;
        if (dP < 6) this.facing += angleDiff(this.facing, Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z)) * dt * 3;
      } else if (this.state === 'flee') {
        moving = this.moveToward(this.pos.x * 2 - P.pos.x, this.pos.z * 2 - P.pos.z, dt, 1);
        if (this.stateT <= 0) this.state = 'wander';
      } else {
        const hostileR = G.isNight ? 13 : 9;
        if (this.kind === 'wolf' && this.state !== 'aggro' && dP < hostileR && P.alive) { this.state = 'aggro'; this.stateT = 12; sfx('roar'); }
        if (this.state === 'aggro' && (this.stateT <= 0 || !P.alive || dP > 30)) this.state = 'wander';
        if (this.state === 'aggro') {
          if (dP > this.k.range + 0.4) moving = this.moveToward(P.pos.x, P.pos.z, dt, 1.05);
          else {
            this.facing += angleDiff(this.facing, Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z)) * Math.min(1, dt * 10);
            if (this.cd <= 0) { this.cd = this.k.cd; this.attackT = 0; P.hurt(this.k.dmg, this.kind); }
          }
        } else {
          if (!this.wander || this.wanderT <= 0) {
            const a = Math.random() * Math.PI * 2, r = rand(2, 12);
            this.wander = { x: this.home.x + Math.cos(a) * r, z: this.home.z + Math.sin(a) * r }; this.wanderT = rand(3, 8);
          }
          this.wanderT -= dt;
          if (Math.hypot(this.wander.x - this.pos.x, this.wander.z - this.pos.z) > 0.8) moving = this.moveToward(this.wander.x, this.wander.z, dt, 0.35);
        }
      }
    }
    this.pos.y = Math.max(heightAt(this.pos.x, this.pos.z), -0.6);
    this.q.g.rotation.y = this.facing;
    this.phase += dt * (moving ? 10 : 0);
    if (this.attackT >= 0) { this.attackT += dt * 4; if (this.attackT > 1) this.attackT = -1; }
    animQuad(this.q, this.phase, moving ? 1 : 0, this.attackT, sit);
    this.bar.set(this.hp / this.maxHp, G.camera);
  }
}

// ---------- spawning ----------
function landPoint(cx, cz, rMin, rMax, test) {
  for (let i = 0; i < 60; i++) {
    const a = Math.random() * Math.PI * 2, r = rand(rMin, rMax);
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const h = heightAt(x, z);
    if (h > 0.6 && (!test || test(x, z, h))) return { x, z };
  }
  return null;
}

export function spawnStoryDogs() {
  const w = LOC.wreck;
  const inward = { x: -Math.cos(w.a), z: -Math.sin(w.a) };
  const side = { x: -inward.z, z: inward.x };
  const defs = [
    { name: 'Tippy', color: 0xd9b48f, accent: 0xffffff, s: 1 },
    { name: 'Izzy', color: 0x3a3a3a, accent: 0xf2f2f2, s: -1 },
  ];
  for (const d of defs) {
    const x = w.x + inward.x * 9 + side.x * 3 * d.s, z = w.z + inward.z * 9 + side.z * 3 * d.s;
    const a = new Animal('dog', x, z, { name: d.name, color: d.color, accent: d.accent, story: true, state: 'scared', tameCost: 1 });
    a.label3d = makeLabel(d.name + '?', '#ffe7b0'); a.label3d.position.y = 1.9; a.label3d.scale.set(1.6, 0.4, 1); a.q.g.add(a.label3d);
    G.animals.push(a);
  }
}
// Story dogs keep their real names once tamed
const _tame = Animal.prototype.tame;
Animal.prototype.tame = function () {
  if (this.story && this.label3d) { this.q.g.remove(this.label3d); this.label3d = null; }
  _tame.call(this);
  if (this.tamed && this.story) count('tamed_story');
};

export function spawnWildlife(initial = false) {
  const wild = (k) => G.animals.filter((a) => a.kind === k && !a.tamed && a.alive && !a.story).length;
  const want = { dog: 4, boar: 6, wolf: 5 };
  for (const k in want) {
    let n = want[k] - wild(k);
    while (n-- > 0) {
      let p;
      if (k === 'wolf') p = landPoint(LOC.den.x, LOC.den.z, 2, 16);
      else if (k === 'boar') p = landPoint(0, 0, 30, 90, (x, z, h) => h > 3 && distVolcano(x, z) > 40 && Math.hypot(x - LOC.camp.x, z - LOC.camp.z) > 30);
      else p = landPoint(0, 0, 40, 95, (x, z, h) => h < 6 && Math.hypot(x - LOC.camp.x, z - LOC.camp.z) > 25 && Math.hypot(x - LOC.village.x, z - LOC.village.z) > 30);
      if (!p) continue;
      if (!initial && Math.hypot(p.x - G.player.pos.x, p.z - G.player.pos.z) < 35) continue;
      G.animals.push(new Animal(k, p.x, p.z));
    }
  }
}

let wildT = 60;
export function updateAnimals(dt) {
  for (const a of G.animals) a.update(dt);
  G.animals = G.animals.filter((a) => a.alive);
  wildT -= dt;
  if (wildT <= 0) { wildT = 60; spawnWildlife(false); }
}

export function togglePetMode() {
  const pets = G.animals.filter((a) => a.tamed);
  if (!pets.length) { toast('You have no animal companions yet.', 'info'); return; }
  const next = pets[0].mode === 'follow' ? 'guard' : 'follow';
  if (next === 'guard' && !G.hearth) { toast('Build a Hearth first so your animals have a base to guard.', 'warn'); return; }
  for (const p of pets) { p.mode = next; p.wander = null; }
  toast(next === 'guard' ? `${pets.map((p) => p.name).join(', ')} will guard the base.` : `${pets.map((p) => p.name).join(', ')} will follow you.`, 'good');
  sfx('bark');
}
