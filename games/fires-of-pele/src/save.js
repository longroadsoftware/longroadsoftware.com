// Save / load to localStorage: one slot per player name, plus migration of the old single save.
import { G } from './state.js';
import { placePiece } from './building.js';
import { Animal } from './animals.js';
import { makeLabel } from './util.js';
import { heightAt, LOC } from './world.js';

const OLD_KEY = 'firesOfPele.save.v1';
const PRE = 'firesOfPele.slot.';
export const slotKey = (name) => PRE + String(name).trim().toLowerCase();
const ls = () => { try { return window.localStorage; } catch (e) { return null; } };

// The first version kept a single save. Move it into a slot named 'Traveler' so nobody loses progress.
export function migrateOldSave() {
  const L = ls(); if (!L) return false;
  const old = L.getItem(OLD_KEY);
  if (!old) return false;
  try {
    const d = JSON.parse(old);
    let name = 'Traveler';
    if (L.getItem(slotKey(name))) name = 'Traveler (old save)';
    d.names = Object.assign({ dog1: 'Tippy', dog2: 'Izzy' }, d.names || {}, { player: name });
    d.savedAt = d.savedAt || Date.now();
    L.setItem(slotKey(name), JSON.stringify(d));
    L.removeItem(OLD_KEY);
    return true;
  } catch (e) { return false; }
}

export function listSaves() {
  const L = ls(); if (!L) return [];
  const out = [];
  for (let i = 0; i < L.length; i++) {
    const k = L.key(i);
    if (!k || !k.startsWith(PRE)) continue;
    try {
      const d = JSON.parse(L.getItem(k));
      out.push({ key: k, name: d.names?.player || k.slice(PRE.length), ch: d.story?.ch ?? 0, done: !!d.story?.done, day: d.day || 1, savedAt: d.savedAt || 0, dogs: d.names ? [d.names.dog1, d.names.dog2] : ['Tippy', 'Izzy'] });
    } catch (e) { /* skip a broken slot */ }
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}
export const hasSave = () => listSaves().length > 0;
export const slotExists = (name) => { const L = ls(); return !!(L && L.getItem(slotKey(name))); };
export function deleteSave(name) { const L = ls(); if (L) L.removeItem(slotKey(name)); }
export function peekSave(name) { try { return JSON.parse(ls().getItem(slotKey(name))); } catch (e) { return null; } }

export function saveGame() {
  if (!G.slot) return false;
  const P = G.player;
  const flags = {};
  for (const k in G.flags) if (typeof G.flags[k] !== 'number' || k.startsWith('hint_')) flags[k] = G.flags[k];
  const data = {
    v: 2, t: G.t, cycle: G.cycle, day: G.day, savedAt: Date.now(),
    names: G.names, quests: G.quests,
    inv: G.inv, weapons: G.weapons, weapon: G.weapon, inventions: G.inventions,
    counters: G.counters, flags, story: G.story, raidNight: G.raid.night, stats: G.stats,
    player: { x: P.pos.x, z: P.pos.z, hp: P.hp, hunger: P.hunger, thirst: P.thirst, yaw: P.camYaw },
    structures: G.structures.map((s) => ({ type: s.type, x: s.x, z: s.z, rot: s.rot, tier: s.tier, hp: s.hp, store: s.store, doused: !!s.doused })),
    pets: G.animals.filter((a) => a.tamed).map((a) => ({ kind: a.kind, name: a.name, mode: a.mode, story: a.story, colors: a.colors, x: a.pos.x, z: a.pos.z })),
    totems: G.totems.map((t) => t.alive),
  };
  try { ls().setItem(slotKey(G.slot), JSON.stringify(data)); G.lastSaved = data.savedAt; return true; } catch (e) { return false; }
}

export function loadGame(name) {
  const d = peekSave(name);
  if (!d) return false;
  G.slot = d.names?.player || name;
  G.names = Object.assign({ player: G.slot, dog1: 'Tippy', dog2: 'Izzy' }, d.names || {});
  G.quests = d.quests || {};
  G.lastSaved = d.savedAt || 0;
  G.t = d.t; G.cycle = Math.min(d.cycle, 0.6); G.day = d.day;
  Object.assign(G.inv, d.inv); Object.assign(G.weapons, d.weapons); G.inventions = d.inventions || {};
  G.counters = d.counters || {}; G.flags = d.flags || {}; G.story = d.story; G.raid.night = d.raidNight || 0;
  G.stats = d.stats || G.stats;
  // saves made before chapters 5-6 existed: the old ending now leads on into the new chapters
  if (G.story.done && G.story.ch === 3) { G.story = { ch: 4, obj: 0, start: 0, done: false }; G._newChapters = true; }
  // saves from the small island: move the base so its hearth sits at the new camp
  const oldWorld = !d.v || d.v < 2;
  let ox = 0, oz = 0;
  if (oldWorld && d.structures.length) {
    const h = d.structures.find((s) => s.type === 'hearth') || d.structures[0];
    ox = Math.round((LOC.camp.x - h.x) / 2) * 2; oz = Math.round((LOC.camp.z - h.z) / 2) * 2;
  }
  for (const s of d.structures) {
    const st = placePiece(s.type, s.x + ox, s.z + oz, s.rot, s.tier, true);
    st.hp = s.hp; st.store = s.store || 0;
    if (s.doused) { st.doused = true; if (st.flame) st.flame.visible = false; }
  }
  // replace starting story dogs with saved companions
  for (const a of [...G.animals]) if (a.story) { G.scene.remove(a.q.g); a.alive = false; }
  G.animals = G.animals.filter((a) => a.alive);
  for (const p of d.pets) {
    let px = p.x + ox, pz = p.z + oz;
    if (oldWorld && G.hearth) { px = G.hearth.x + 2; pz = G.hearth.z + 2; }
    const a = new Animal(p.kind, px, pz, { name: p.name, color: p.colors?.color, accent: p.colors?.accent, story: p.story });
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
  if (oldWorld) {
    const at = G.hearth ? { x: G.hearth.x + 2, z: G.hearth.z + 2 } : { x: LOC.camp.x, z: LOC.camp.z };
    G.player.spawnAt(at.x, at.z);
  } else {
    G.player.spawnAt(d.player.x, d.player.z);
    if (heightAt(d.player.x, d.player.z) < -0.5 && G.hearth) G.player.spawnAt(G.hearth.x + 2, G.hearth.z + 2);
  }
  if (G.weapons[d.weapon]) G.player.equip(d.weapon);
  return true;
}
