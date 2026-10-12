// The player: movement, third-person camera, melee, sling and survival stats.
import * as THREE from 'three';
import { G, count } from './state.js';
import { makeHumanoid, animHumanoid, setWeapon } from './models.js';
import { input, held, pressed } from './input.js';
import { heightAt, distVolcano, LOC } from './world.js';
import { resolveCircle } from './physics.js';
import { findNodeInFront, harvest } from './resources.js';
import { spawnProjectile } from './projectiles.js';
import { burst, sfx } from './fx.js';
import { toast, flashDamage } from './ui.js';
import { clamp, angleDiff } from './util.js';

export const WEAPONS = {
  club: { name: 'Driftwood Club', dmg: 12, range: 2.4, cd: 0.55, tier: 1 },
  spear: { name: 'Stone Spear', dmg: 20, range: 3.2, cd: 0.65, tier: 2 },
  blade: { name: 'Obsidian Blade', dmg: 34, range: 2.8, cd: 0.45, tier: 3 },
};

const ray = new THREE.Raycaster();

export class Player {
  constructor(scene) {
    this.h = makeHumanoid({ skin: 0xd8a882, top: 0x3b6ea8, bottom: 0xb59a6a, hair: 0x5a3a20, cap: 0xc0392b, feet: 0x333333, legs: 0xd8a882 });
    scene.add(this.h.g);
    this.pos = this.h.g.position;
    this.vel = new THREE.Vector3();
    this.facing = 0;
    this.camYaw = 0; this.camPitch = 0.32; this.camDist = 7.5;
    this.maxHp = 100; this.hp = 100; this.stamina = 100; this.hunger = 100; this.thirst = 100;
    this.alive = true; this.radius = 0.4;
    this.attackT = -1; this.attackCd = 0; this.slingCd = 0; this.throwT = -1;
    this.phase = 0; this.lastHurt = -99; this.onGround = true;
    this.camPos = new THREE.Vector3();
    setWeapon(this.h, 'club');
  }
  get weapon() { return WEAPONS[G.weapon]; }
  camForward() { return new THREE.Vector3(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw)); }
  equip(w) {
    if (!G.weapons[w]) return;
    G.weapon = w; setWeapon(this.h, w);
    toast(`Equipped ${WEAPONS[w].name}`, 'info');
  }
  spawnAt(x, z) {
    this.pos.set(x, heightAt(x, z) + 0.5, z);
    this.vel.set(0, 0, 0);
  }

  update(dt, canAct) {
    // ----- camera look -----
    this.camYaw -= input.mdx * 0.0024;
    this.camPitch = clamp(this.camPitch + input.mdy * 0.0022, -0.3, 1.25);
    if (held('ArrowLeft')) this.camYaw += dt * 2.2;
    if (held('ArrowRight')) this.camYaw -= dt * 2.2;
    if (held('ArrowUp')) this.camPitch = clamp(this.camPitch - dt, -0.3, 1.25);
    if (held('ArrowDown')) this.camPitch = clamp(this.camPitch + dt, -0.3, 1.25);
    if (G.mode === 'play' && input.wheel) this.camDist = clamp(this.camDist + input.wheel * 0.8, 3.5, 14);

    if (!this.alive) { this.updateCamera(dt); return; }

    // ----- movement -----
    const f = this.camForward();
    const r = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
    let fw = 0, st = 0;
    if (canAct) {
      if (held('KeyW')) fw += 1; if (held('KeyS')) fw -= 1;
      if (held('KeyD')) st += 1; if (held('KeyA')) st -= 1;
    }
    const move = f.multiplyScalar(fw).add(r.multiplyScalar(st));
    const moving = move.lengthSq() > 0.01;
    if (moving) move.normalize();
    const ground0 = heightAt(this.pos.x, this.pos.z);
    const inWater = ground0 < -0.45;
    const sprint = moving && held('ShiftLeft') && this.stamina > 1 && !inWater;
    let speed = sprint ? 9.2 : 5.6;
    if (inWater) speed *= 0.55;
    if (this.attackT >= 0) speed *= 0.6;
    this.stamina = clamp(this.stamina + (sprint ? -22 : 14) * dt, 0, 100);
    const ox = this.pos.x, oz = this.pos.z;
    this.vel.x = move.x * speed; this.vel.z = move.z * speed;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    resolveCircle(this.pos, this.radius, 'player');
    if (heightAt(this.pos.x, this.pos.z) < -2.4) {
      this.pos.x = ox; this.pos.z = oz;
      if (!this._warnSea || G.t - this._warnSea > 4) { this._warnSea = G.t; toast('The reef currents are too strong to swim further.', 'warn'); }
    }
    const ground = heightAt(this.pos.x, this.pos.z);
    const floor = ground < -0.75 ? -0.75 : ground;
    this.vel.y -= 26 * dt;
    if (canAct && pressed('Space') && this.onGround) { this.vel.y = 8.5; this.onGround = false; }
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= floor) { this.pos.y = floor; this.vel.y = 0; this.onGround = true; }

    // ----- facing -----
    const aiming = this.attackT >= 0 || input.rmb || this.throwT >= 0;
    let want = this.facing;
    if (aiming) want = this.camYaw + Math.PI;
    else if (moving) want = Math.atan2(move.x, move.z);
    this.facing += angleDiff(this.facing, want) * Math.min(1, dt * 14);
    this.h.g.rotation.y = this.facing;

    // ----- combat -----
    this.attackCd -= dt; this.slingCd -= dt;
    const W = this.weapon;
    if (canAct && G.mode === 'play' && input.lmb && this.attackCd <= 0 && this.attackT < 0) {
      this.attackT = 0; this.attackCd = W.cd; this.hitDone = false;
      this.facing = this.camYaw + Math.PI;
      sfx('swing');
    }
    if (this.attackT >= 0) {
      this.attackT += dt / (W.cd * 0.95);
      if (this.attackT >= 0.45 && !this.hitDone) { this.hitDone = true; this.doHit(); }
      if (this.attackT >= 1) this.attackT = -1;
    }
    if (canAct && G.mode === 'play' && input.rclick && this.slingCd <= 0) this.sling();
    if (this.throwT >= 0) { this.throwT += dt * 3; if (this.throwT > 1) this.throwT = -1; }

    // ----- survival -----
    this.hunger = clamp(this.hunger - dt * (100 / 660), 0, 100);
    this.thirst = clamp(this.thirst - dt * (100 / 520), 0, 100);
    if (this.hunger <= 0 || this.thirst <= 0) {
      this.hp -= 1.5 * dt;
      if (!this._starveWarn || G.t - this._starveWarn > 10) { this._starveWarn = G.t; toast(this.hunger <= 0 ? 'You are starving! Eat food [F].' : 'You are dehydrated! Drink water [G].', 'bad'); }
      if (this.hp <= 0) this.die('the elements');
    } else if (this.hunger > 30 && this.thirst > 30 && G.t - this.lastHurt > 5) {
      this.hp = Math.min(this.maxHp, this.hp + 1.4 * dt);
    }
    if (!G.flags.lavaCooled && distVolcano(this.pos.x, this.pos.z) < 3.8 && this.pos.y < LOC.craterH + 1.2) {
      this.hurt(28 * dt, 'lava', true);
      if (Math.random() < dt * 10) burst(this.pos.clone(), 0xff6a10, 2, 3, 0.1);
    }

    // ----- animation -----
    const mv = moving ? (sprint ? 1.25 : 1) : 0;
    this.phase += dt * speed * 1.7 * (moving ? 1 : 0);
    animHumanoid(this.h, this.phase, mv, this.attackT, this.throwT);
    this.updateCamera(dt);
  }

  updateCamera(dt) {
    const target = this.pos.clone(); target.y += 1.6;
    const cy = Math.cos(this.camPitch);
    const off = new THREE.Vector3(Math.sin(this.camYaw) * cy, Math.sin(this.camPitch), Math.cos(this.camYaw) * cy).multiplyScalar(this.camDist);
    const right = new THREE.Vector3(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw)).multiplyScalar(0.65);
    const want = target.clone().add(off).add(right);
    const gh = heightAt(want.x, want.z) + 0.5;
    if (want.y < gh) want.y = gh;
    if (want.y < -0.2) want.y = -0.2;
    this.camPos.lerp(want, Math.min(1, dt * 18));
    if (this.camPos.lengthSq() === 0 || this.camPos.distanceTo(want) > 20) this.camPos.copy(want);
    G.camera.position.copy(this.camPos);
    G.camera.lookAt(target.add(right));
  }

  doHit() {
    const W = this.weapon;
    const f = this.camForward();
    let hitAny = false;
    const handPos = this.pos.clone(); handPos.y += 1.2;
    for (const e of G.enemies) {
      if (!e.alive) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > W.range + e.radius) continue;
      if (d > 0.5 && (dx * f.x + dz * f.z) / d < 0.35) continue;
      e.hurt(W.dmg, 'player', false, f.clone().multiplyScalar(6));
      hitAny = true;
    }
    for (const a of G.animals) {
      if (!a.alive || a.tamed) continue;
      const dx = a.pos.x - this.pos.x, dz = a.pos.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > W.range + 0.5) continue;
      if (d > 0.5 && (dx * f.x + dz * f.z) / d < 0.35) continue;
      a.hurt(W.dmg, 'player'); hitAny = true;
    }
    for (const t of G.totems) {
      if (!t.alive) continue;
      const dx = t.x - this.pos.x, dz = t.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < W.range + 0.8 && (d < 0.5 || (dx * f.x + dz * f.z) / d > 0.3)) { t.hurt(W.dmg); hitAny = true; }
    }
    if (hitAny) return;
    const n = findNodeInFront(this.pos.x, this.pos.z, f.x, f.z, Math.min(W.range, 2.6));
    if (n) harvest(n, W.tier, toast);
  }

  sling() {
    if (!G.weapons.sling) { if (!this._slingWarn) { this._slingWarn = true; toast('Craft a Sling [C] to throw stones with right-click.', 'info'); } return; }
    if (G.inv.stone < 1) { toast('No stones to sling!', 'warn'); sfx('error'); this.slingCd = 0.5; return; }
    G.inv.stone -= 1;
    this.slingCd = 0.75; this.throwT = 0;
    ray.setFromCamera({ x: 0, y: 0 }, G.camera);
    const from = this.pos.clone(); from.y += 1.6;
    let aim = ray.ray.origin.clone().addScaledVector(ray.ray.direction, 70);
    const hit = ray.intersectObject(G.terrain, false)[0];
    if (hit && hit.distance < 70) aim = hit.point;
    // prefer an enemy close to the crosshair ray
    let best = null, bs = 1.6;
    for (const e of G.enemies) {
      if (!e.alive) continue;
      const c = e.pos.clone(); c.y += e.height * 0.55;
      const dd = ray.ray.distanceToPoint(c);
      if (dd < bs && c.distanceTo(from) < 60) { bs = dd; best = c; }
    }
    if (best) aim = best;
    const speed = 42, grav = 7;
    const dist = aim.distanceTo(from), tt = dist / speed;
    const v = aim.clone().sub(from).normalize().multiplyScalar(speed);
    v.y += 0.5 * grav * tt;
    spawnProjectile({ pos: from, vel: v, dmg: 15, owner: 'player', grav, color: 0x8a8a86, size: 0.13 });
    sfx('sling');
  }

  hurt(n, src, silent) {
    if (!this.alive || G.mode === 'victory') return;
    this.hp -= n;
    this.lastHurt = G.t;
    if (!silent || Math.random() < 0.05) { flashDamage(); if (!this._hs || G.t - this._hs > 0.25) { this._hs = G.t; sfx('hurt'); } }
    if (this.hp <= 0) this.die(src);
  }
  die(src) {
    if (!this.alive) return;
    this.alive = false; this.hp = 0;
    this.h.g.rotation.z = Math.PI / 2;
    this.h.g.position.y += 0.3;
    G.stats.deaths++;
    count('deaths');
    if (G.onPlayerDeath) G.onPlayerDeath(src);
  }
  revive(x, z) {
    this.alive = true; this.hp = this.maxHp * 0.7; this.hunger = Math.max(this.hunger, 50); this.thirst = Math.max(this.thirst, 50);
    this.h.g.rotation.z = 0;
    this.spawnAt(x, z);
  }
}
