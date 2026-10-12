// Save / load to localStorage.
import { G } from './state.js';
import { placePiece } from './building.js';
import { Animal } from './animals.js';
import { makeLabel } from './util.js';
import { heightAt } from './world.js';

const KEY = 'firesOfPele.save.v1';
export const hasSave = () => { try { return !!localStorage.getItem(KEY); } catch (e) { return false; } };
export const clearSave = () => { try { localStorage.removeItem(KEY); } catch (e) { /* */ } };

export function saveGame() {
  const P = G.player;
  const flags = {};
  for (const k in G.flags) if (typeof G.flags[k] !== 'number' || k.startsWith('hint_')) flags[k] = G.flags[k];
  const data = {
    v: 1, t: G.t, cycle: G.cycle, day: G.day,
    inv: G.inv, weapons: G.weapons, weapon: G.weapon, inventions: G.inventions,
    counters: G.counters, flags, story: G.story, raidNight: G.raid.night, stats: G.stats,
    player: { x: P.pos.x, z: P.pos.z, hp: P.hp, hunger: P.hunger, thirst: P.thirst, yaw: P.camYaw },
    structures: G.structures.map((s) => ({ type: s.type, x: s.x, z: s.z, rot: s.rot, tier: s.tier, hp: s.hp, store: s.store, doused: !!s.doused })),
    pets: G.animals.filter((a) => a.tamed).map((a) => ({ kind: a.kind, name: a.name, mode: a.mode, story: a.story, colors: a.colors, x: a.pos.x, z: a.pos.z })),
    totems: G.totems.map((t) => t.alive),
  };
  try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
}

export function loadGame() {
  let d;
  try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) { return false; }
  if (!d) return false;
  G.t = d.t; G.cycle = Math.min(d.cycle, 0.6); G.day = d.day;
  Object.assign(G.inv, d.inv); Object.assign(G.weapons, d.weapons); G.inventions = d.inventions || {};
  G.counters = d.counters || {}; G.flags = d.flags || {}; G.story = d.story; G.raid.night = d.raidNight || 0;
  G.stats = d.stats || G.stats;
  for (const s of d.structures) {
    const st = placePiece(s.type, s.x, s.z, s.rot, s.tier, true);
    st.hp = s.hp; st.store = s.store || 0;
    if (s.doused) { st.doused = true; if (st.flame) st.flame.visible = false; }
  }
  // replace starting story dogs with saved companions
  for (const a of [...G.animals]) if (a.story) { G.scene.remove(a.q.g); a.alive = false; }
  G.animals = G.animals.filter((a) => a.alive);
  for (const p of d.pets) {
    const a = new Animal(p.kind, p.x, p.z, { name: p.name, color: p.colors?.color, accent: p.colors?.accent, story: p.story });
    a.tamed = true; a.state = 'idle'; a.mode = p.mode;
    a.label3d = makeLabel(a.name, '#bfe8ff'); a.label3d.position.y = 2.0; a.label3d.scale.set(1.6, 0.4, 1); a.q.g.add(a.label3d);
    G.animals.push(a);
  }
  if (!d.pets.some((p) => p.story) && (G.counters.tamed_story || 0) < 2) {
    // story dogs not tamed yet: respawn them (handled by caller)
    G.flags._respawnDogs = true;
  }
  d.totems.forEach((alive, i) => {
    const t = G.totems[i];
    if (t && !alive) { t.alive = false; t.mesh.rotation.x = Math.PI / 2 - 0.1; t.mesh.position.y += 0.5; t.bar.group.visible = false; }
  });
  if (G.counters.bossKilled) G.flags.lavaCooled = true;
  G.player.hp = d.player.hp; G.player.hunger = d.player.hunger; G.player.thirst = d.player.thirst; G.player.camYaw = d.player.yaw;
  G.player.spawnAt(d.player.x, d.player.z);
  if (heightAt(d.player.x, d.player.z) < -0.5 && G.hearth) G.player.spawnAt(G.hearth.x + 2, G.hearth.z + 2);
  if (G.weapons[d.weapon]) G.player.equip(d.weapon);
  return true;
}
