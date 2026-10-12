// Projectiles: sling stones, tower shots, enemy stones, boss lava balls.
import * as THREE from 'three';
import { G } from './state.js';
import { heightAt } from './world.js';
import { burst, sfx } from './fx.js';
import { distToStructure } from './physics.js';

const geoStone = new THREE.IcosahedronGeometry(1, 0);
const geoBolt = new THREE.CylinderGeometry(0.15, 0.15, 6, 4).rotateX(Math.PI / 2);

export function spawnProjectile({ pos, vel, dmg, owner, grav = 9, color = 0x999999, size = 0.12, bolt = false, lava = false, splash = 0 }) {
  const m = new THREE.Mesh(bolt ? geoBolt : geoStone, new THREE.MeshBasicMaterial({ color }));
  m.scale.setScalar(size);
  m.position.copy(pos);
  G.scene.add(m);
  G.projectiles.push({ pos: m.position, vel: vel.clone(), dmg, owner, grav, mesh: m, life: 4, lava, splash, bolt });
}

function kill(p, hitPos) {
  p.dead = true;
  G.scene.remove(p.mesh);
  if (p.lava) { burst(hitPos, 0xff6a10, 14, 6, 0.2); if (p.splash) splashDamage(hitPos, p); }
}

function splashDamage(pos, p) {
  const pl = G.player;
  if (pos.distanceTo(pl.pos) < p.splash + 0.5) pl.hurt(p.dmg, 'lava');
  for (const a of G.animals) if (a.tamed && a.active && pos.distanceTo(a.pos) < p.splash) a.hurt(p.dmg * 0.7);
}

export function updateProjectiles(dt) {
  for (const p of G.projectiles) {
    p.life -= dt;
    p.vel.y -= p.grav * dt;
    p.pos.addScaledVector(p.vel, dt);
    if (p.bolt) p.mesh.lookAt(p.pos.clone().add(p.vel));
    else p.mesh.rotation.x += dt * 8;
    if (p.life <= 0) { kill(p, p.pos); continue; }
    if (p.pos.y < heightAt(p.pos.x, p.pos.z)) { kill(p, p.pos); if (!p.lava) burst(p.pos, 0x888888, 3, 2, 0.06); continue; }
    if (p.owner === 'player' || p.owner === 'tower') {
      for (const e of G.enemies) {
        if (!e.alive) continue;
        const r = e.radius + 0.35;
        const dy = p.pos.y - (e.pos.y + e.height * 0.5);
        if (Math.abs(dy) > e.height * 0.6 + 0.3) continue;
        if (Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z) < r) {
          e.hurt(p.dmg, p.owner, false, p.vel);
          kill(p, p.pos);
          break;
        }
      }
      if (p.dead) continue;
      if (p.owner === 'player') {
        for (const a of G.animals) {
          if (!a.alive || a.tamed) continue;
          if (p.pos.distanceTo(a.pos.clone().setY(a.pos.y + 0.6)) < 0.9) { a.hurt(p.dmg, 'player'); kill(p, p.pos); break; }
        }
        if (p.dead) continue;
        for (const t of G.totems) {
          if (!t.alive) continue;
          if (Math.hypot(p.pos.x - t.x, p.pos.z - t.z) < 1.0 && p.pos.y < t.y + 5) { t.hurt(p.dmg); kill(p, p.pos); break; }
        }
      }
    } else if (p.owner === 'enemy') {
      const pl = G.player;
      if (pl.alive && Math.hypot(p.pos.x - pl.pos.x, p.pos.z - pl.pos.z) < 0.6 && Math.abs(p.pos.y - pl.pos.y - 1) < 1.2) {
        if (p.lava && p.splash) kill(p, p.pos); else { pl.hurt(p.dmg, 'stone'); kill(p, p.pos); }
        continue;
      }
      for (const a of G.animals) {
        if (!a.tamed || !a.active) continue;
        if (Math.hypot(p.pos.x - a.pos.x, p.pos.z - a.pos.z) < 0.7 && p.pos.y < a.pos.y + 1.3) { a.hurt(p.dmg); kill(p, p.pos); break; }
      }
      if (p.dead) continue;
      for (const s of G.structures) {
        if (!s.alive || !s.block) continue;
        if (Math.abs(s.x - p.pos.x) > 3 || Math.abs(s.z - p.pos.z) > 3) continue;
        if (distToStructure(s, p.pos.x, p.pos.z) < 0.2 && p.pos.y < s.y + 3) { s.hurt(p.dmg * 0.5); kill(p, p.pos); burst(p.pos, 0x888888, 3, 2, 0.06); break; }
      }
    }
  }
  G.projectiles = G.projectiles.filter((p) => !p.dead);
}
