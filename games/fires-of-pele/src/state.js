// Shared game state. Every module imports G.
// Length of one full day + night in seconds. Players can change it in the pause menu (saved per browser).
export const DAY_LENGTHS = { short: 300, normal: 900, long: 1800 };
const savedLen = (() => { try { return localStorage.getItem('firesOfPele.dayLength'); } catch (e) { return null; } })();
export const CFG = { CYCLE: DAY_LENGTHS[savedLen] || DAY_LENGTHS.normal, DAY_FRAC: 0.65 };

export const RES_ICON = { wood: '🪵', stone: '🪨', fiber: '🌿', obsidian: '🔮', food: '🥥', water: '💧', bandage: '🩹' };
export const RES_NAME = { wood: 'Wood', stone: 'Stone', fiber: 'Fiber', obsidian: 'Obsidian', food: 'Food', water: 'Water', bandage: 'Bandage' };

export const G = {
  scene: null, camera: null, renderer: null,
  t: 0, cycle: 0.06, day: 1, isNight: false, light: 1,
  mode: 'title', // title | play | build | craft | dialogue | pause | dead | victory
  player: null,
  inv: { wood: 0, stone: 0, fiber: 0, obsidian: 0, food: 0, water: 0, bandage: 0 },
  weapons: { club: true, spear: false, blade: false, sling: false },
  weapon: 'club',
  inventions: {},
  nodes: [], enemies: [], animals: [], structures: [], projectiles: [], totems: [], lootBags: [],
  hearth: null,
  counters: {}, flags: {},
  story: { ch: 0, obj: 0, start: 0, done: false },
  raid: { active: false, night: 0, queue: [], spawnT: 0 },
  boss: null,
  stats: { kills: 0, deaths: 0, built: 0 },
  names: { player: 'Traveler', dog1: 'Tippy', dog2: 'Izzy' },
  slot: null,          // save-slot name (the player's name)
  quests: {},          // side quests: id -> { s: 'active' | 'done', step }
};

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Fill in the player's and the dogs' names: {P}, {D1}, {D2}.
export function fmt(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/\{P\}/g, esc(G.names.player)).replace(/\{D1\}/g, esc(G.names.dog1)).replace(/\{D2\}/g, esc(G.names.dog2));
}
export const escHtml = esc;

export function count(k, n = 1) { G.counters[k] = (G.counters[k] || 0) + n; }
export function hasRes(cost) { for (const k in cost) if ((G.inv[k] || 0) < cost[k]) return false; return true; }
export function payRes(cost) { for (const k in cost) G.inv[k] -= cost[k]; }
export function costStr(cost) { return Object.entries(cost).map(([k, v]) => `${v} ${RES_ICON[k] || ''}${k}`).join(', '); }
