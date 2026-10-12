// Shared game state. Every module imports G.
export const CFG = { CYCLE: 300, DAY_FRAC: 0.65 };

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
};

export function count(k, n = 1) { G.counters[k] = (G.counters[k] || 0) + n; }
export function hasRes(cost) { for (const k in cost) if ((G.inv[k] || 0) < cost[k]) return false; return true; }
export function payRes(cost) { for (const k in cost) G.inv[k] -= cost[k]; }
export function costStr(cost) { return Object.entries(cost).map(([k, v]) => `${v} ${RES_ICON[k] || ''}${k}`).join(', '); }
