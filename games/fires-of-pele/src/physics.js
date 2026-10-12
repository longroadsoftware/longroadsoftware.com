// Simple 2D (XZ) collision: static circles in a spatial hash + structures.
import { G } from './state.js';

const CELL = 8;
const hash = new Map();
const key = (cx, cz) => cx * 100003 + cz;

export function addStatic(c) { // {x, z, r, node:{alive}}
  const k = key(Math.floor(c.x / CELL), Math.floor(c.z / CELL));
  if (!hash.has(k)) hash.set(k, []);
  hash.get(k).push(c);
}
export function queryStatic(x, z, cb) {
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const a = hash.get(key(cx + i, cz + j));
    if (a) for (const c of a) cb(c);
  }
}

// distance from point to a structure's footprint (segment or circle), minus thickness
export function distToStructure(s, x, z) {
  if (s.seg) {
    const { ax, az, bx, bz } = s.seg;
    const vx = bx - ax, vz = bz - az;
    let t = ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz);
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(x - (ax + vx * t), z - (az + vz * t)) - s.thick;
  }
  return Math.hypot(x - s.x, z - s.z) - s.r;
}

// Push a mover out of obstacles. Returns the last blocking structure touched (or null).
export function resolveCircle(pos, r, mover) {
  queryStatic(pos.x, pos.z, (c) => {
    if (c.node && !c.node.alive) return;
    const dx = pos.x - c.x, dz = pos.z - c.z;
    const d = Math.hypot(dx, dz), m = r + c.r;
    if (d < m && d > 1e-5) { pos.x = c.x + (dx / d) * m; pos.z = c.z + (dz / d) * m; }
  });
  let hit = null;
  for (const s of G.structures) {
    if (!s.alive || !s.block) continue;
    if (s.gate && mover !== 'enemy') continue;
    const dxs = pos.x - s.x, dzs = pos.z - s.z;
    if (dxs * dxs + dzs * dzs > 20) continue;
    if (s.seg) {
      const { ax, az, bx, bz } = s.seg;
      const vx = bx - ax, vz = bz - az;
      let t = ((pos.x - ax) * vx + (pos.z - az) * vz) / (vx * vx + vz * vz);
      t = Math.max(0, Math.min(1, t));
      const px = ax + vx * t, pz = az + vz * t;
      const dx = pos.x - px, dz = pos.z - pz;
      const d = Math.hypot(dx, dz), m = r + s.thick;
      if (d < m) {
        if (d > 1e-5) { pos.x = px + (dx / d) * m; pos.z = pz + (dz / d) * m; }
        else { pos.x += -vz * 0.1; pos.z += vx * 0.1; }
        hit = s;
      }
    } else {
      const d = Math.hypot(dxs, dzs), m = r + s.r;
      if (d < m && d > 1e-5) { pos.x = s.x + (dxs / d) * m; pos.z = s.z + (dzs / d) * m; hit = s; }
    }
  }
  return hit;
}
