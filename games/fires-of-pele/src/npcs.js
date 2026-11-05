// Friendly islanders: models, idle animation, talking, and escort-following.
import * as THREE from 'three';
import { G, fmt } from './state.js';
import { heightAt } from './world.js';
import { makeHumanoid, animHumanoid } from './models.js';
import { addStatic } from './physics.js';
import { makeLabel, angleDiff } from './util.js';
import { showDialogue } from './ui.js';

export const NPCS = {};
const handlers = [];
export const registerTalk = (fn) => handlers.push(fn);

export function spawnNPC(id, name, x, z, look, opts = {}) {
  const h = makeHumanoid(look);
  h.g.position.set(x, heightAt(x, z), z);
  h.g.rotation.y = opts.face ?? 0;
  G.scene.add(h.g);
  const lbl = makeLabel(name, '#c8ffe0'); lbl.position.y = 2.6 * (look.scale || 1) + 0.1; lbl.scale.set(1.6, 0.4, 1); h.g.add(lbl);
  const mark = makeLabel('!', '#ffd84a'); mark.position.y = 3.2 * (look.scale || 1); mark.scale.set(0.9, 0.9, 1); mark.visible = false; h.g.add(mark);
  const st = opts.noStatic ? null : { x, z, r: 0.5, h: 2 };
  if (st) addStatic(st);
  const n = { id, name, h, pos: h.g.position, home: { x, z }, face: opts.face ?? 0, idle: opts.idle || [], phase: Math.random() * 6, mark, st, follow: false, moving: 0 };
  NPCS[id] = n;
  return n;
}

export function talkNPC(id) {
  const n = NPCS[id];
  if (!n) return;
  for (const fn of handlers) if (fn(id, n)) return;
  if (n.idle.length) {
    n.idleI = ((n.idleI ?? -1) + 1) % n.idle.length;
    showDialogue([{ who: n.name, text: n.idle[n.idleI] }]);
  }
}

export function npcInteracts(consider) {
  for (const id in NPCS) {
    const n = NPCS[id];
    if (n.hidden) continue;
    consider(n.pos.x, n.pos.z, `Talk to ${fmt(n.name)}`, () => talkNPC(id), 3.3);
  }
}

export function updateNPCs(dt) {
  const P = G.player.pos;
  for (const id in NPCS) {
    const n = NPCS[id];
    if (n.hidden) { n.h.g.visible = false; continue; }
    let dx = P.x - n.pos.x, dz = P.z - n.pos.z, d = Math.hypot(dx, dz);
    if (n.follow && d > 40) { n.pos.set(P.x - 2, heightAt(P.x - 2, P.z - 2), P.z - 2); dx = 2; dz = 2; d = 2.83; }
    if (d > 120) { n.h.g.visible = false; continue; }
    n.h.g.visible = true;
    n.phase += dt;
    let moving = 0;
    if (n.follow) {
      // escort: trot after the player, and catch up if left far behind
      if (d > 2.6) {
        const sp = Math.min(d > 8 ? 9 : 6, d * 3) * dt;
        n.pos.x += (dx / d) * sp; n.pos.z += (dz / d) * sp; moving = 1;
        n.pos.y = Math.max(heightAt(n.pos.x, n.pos.z), -0.7);
      }
      if (n.st) { n.st.x = 1e6; n.st.z = 1e6; }
    }
    const want = d < 8 || moving ? Math.atan2(dx, dz) : n.face;
    n.h.g.rotation.y += angleDiff(n.h.g.rotation.y, want) * Math.min(1, dt * 4);
    n.walk = (n.walk || 0) + dt * 10 * moving;
    animHumanoid(n.h, n.walk, moving);
    if (!moving) n.h.head.rotation.y = Math.sin(n.phase * 0.5) * 0.35;
  }
}
