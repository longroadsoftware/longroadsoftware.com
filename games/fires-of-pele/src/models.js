// Low-poly character, animal and weapon models with simple limb animation.
import * as THREE from 'three';
import { part, merge, mesh, MAT } from './util.js';

const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);

export function makeWeapon(kind) {
  let g;
  if (kind === 'club') g = merge([
    part(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 5), 0x6b4a2e, { pos: [0, 0, 0.2], rot: [Math.PI / 2, 0, 0] }),
    part(new THREE.CylinderGeometry(0.12, 0.07, 0.5, 6), 0x8a5f38, { pos: [0, 0, 0.65], rot: [Math.PI / 2, 0, 0] }),
  ]);
  else if (kind === 'spear') g = merge([
    part(new THREE.CylinderGeometry(0.035, 0.035, 2.0, 5), 0x7a5a36, { pos: [0, 0, 0.55], rot: [Math.PI / 2, 0, 0] }),
    part(new THREE.ConeGeometry(0.08, 0.32, 4), 0x9a9a95, { pos: [0, 0, 1.68], rot: [Math.PI / 2, 0, 0] }),
    part(B(0.1, 0.1, 0.12), 0xc8b070, { pos: [0, 0, 1.48] }),
  ]);
  else if (kind === 'blade') g = merge([
    part(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 5), 0x4a3020, { pos: [0, 0, 0.1], rot: [Math.PI / 2, 0, 0] }),
    part(B(0.05, 0.16, 1.0), 0x241a33, { pos: [0, 0, 0.75] }),
    part(B(0.04, 0.06, 0.25), 0x8a60d0, { pos: [0, 0.07, 0.9] }),
  ]);
  else if (kind === 'torch') g = merge([
    part(new THREE.CylinderGeometry(0.04, 0.05, 0.9, 5), 0x6b4a2e, { pos: [0, 0, 0.3], rot: [Math.PI / 2 - 0.6, 0, 0] }),
  ]);
  else if (kind === 'warclub') g = merge([
    part(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 5), 0x4a3020, { pos: [0, 0, 0.45], rot: [Math.PI / 2, 0, 0] }),
    part(B(0.35, 0.18, 0.7), 0x2d2420, { pos: [0, 0, 1.1] }),
    part(new THREE.ConeGeometry(0.06, 0.2, 4), 0xdddddd, { pos: [0.2, 0, 1.0], rot: [0, 0, -Math.PI / 2] }),
    part(new THREE.ConeGeometry(0.06, 0.2, 4), 0xdddddd, { pos: [-0.2, 0, 1.2], rot: [0, 0, Math.PI / 2] }),
  ]);
  else g = merge([part(B(0.05, 0.05, 0.05), 0x000000)]);
  const m = mesh(g, kind === 'blade' ? MAT.shiny : MAT.std);
  if (kind === 'torch') {
    const fl = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), new THREE.MeshBasicMaterial({ color: 0xffa030 }));
    fl.position.set(0, 0.32, 0.55); fl.scale.y = 1.6;
    m.add(fl); m.userData.flame = fl;
  }
  return m;
}

// Humanoid: faces +Z. Returns limb pivots for animation.
export function makeHumanoid(o = {}) {
  const skin = o.skin ?? 0xc89a72, top = o.top ?? skin, bottom = o.bottom ?? 0x6b4a2e, hair = o.hair ?? 0x3a2a1a;
  const bulk = o.bulk ?? 1;
  const g = new THREE.Group();
  const root = new THREE.Group(); g.add(root);
  root.scale.setScalar(o.scale ?? 1);
  const hips = new THREE.Group(); hips.position.y = 0.95; root.add(hips);
  const torsoParts = [
    part(B(0.62 * bulk, 0.72, 0.34 * bulk), top, { pos: [0, 0.42, 0] }),
    part(B(0.64 * bulk, 0.34, 0.38 * bulk), bottom, { pos: [0, 0.02, 0] }),
  ];
  if (o.necklace) torsoParts.push(part(B(0.5 * bulk, 0.08, 0.38 * bulk), o.necklace, { pos: [0, 0.72, 0.02] }));
  if (o.paint) torsoParts.push(part(B(0.64 * bulk, 0.08, 0.36 * bulk), o.paint, { pos: [0, 0.45, 0.01] }));
  if (o.glow) torsoParts.push(part(B(0.08, 0.5, 0.36 * bulk + 0.02), o.glow, { pos: [0.12, 0.42, 0] }), part(B(0.3, 0.06, 0.36 * bulk + 0.02), o.glow, { pos: [-0.05, 0.3, 0] }));
  const torso = mesh(merge(torsoParts)); hips.add(torso);
  const head = new THREE.Group(); head.position.y = 0.98; hips.add(head);
  const hp = [
    part(B(0.38, 0.4, 0.38), skin, { pos: [0, 0.2, 0] }),
    part(B(0.06, 0.06, 0.02), 0x111111, { pos: [0.09, 0.24, 0.2] }),
    part(B(0.06, 0.06, 0.02), 0x111111, { pos: [-0.09, 0.24, 0.2] }),
  ];
  if (hair !== null) hp.push(part(B(0.42, 0.14, 0.42), hair, { pos: [0, 0.42, -0.01] }), part(B(0.42, 0.25, 0.1), hair, { pos: [0, 0.3, -0.17] }));
  if (o.cap) hp.push(part(B(0.44, 0.12, 0.44), o.cap, { pos: [0, 0.44, 0] }), part(B(0.36, 0.04, 0.22), o.cap, { pos: [0, 0.39, 0.3] }));
  if (o.beard) hp.push(part(B(0.34, 0.18, 0.08), o.beard, { pos: [0, 0.06, 0.2] }));
  if (o.mask) {
    hp.push(part(B(0.44, 0.48, 0.06), o.mask, { pos: [0, 0.2, 0.22] }));
    hp.push(part(B(0.1, 0.06, 0.02), o.maskEye ?? 0xff3020, { pos: [0.1, 0.27, 0.26] }), part(B(0.1, 0.06, 0.02), o.maskEye ?? 0xff3020, { pos: [-0.1, 0.27, 0.26] }));
    hp.push(part(B(0.3, 0.05, 0.02), 0x8a1a10, { pos: [0, 0.08, 0.26] }));
  }
  if (o.headdress) for (let i = -2; i <= 2; i++) hp.push(part(B(0.08, 0.5, 0.04), i % 2 ? o.headdress : 0xffd040, { pos: [i * 0.1, 0.6, -0.1], rot: [0, 0, i * 0.18] }));
  head.add(mesh(merge(hp), o.glow ? MAT.std : MAT.std));
  const mkLimb = (w, h, color, color2) => {
    const pv = new THREE.Group();
    const geo = merge([part(B(w, h, w), color, { pos: [0, -h / 2, 0] }), part(B(w * 1.05, h * 0.2, w * 1.05), color2 ?? color, { pos: [0, -h * 0.92, 0] })]);
    pv.add(mesh(geo));
    return pv;
  };
  const armL = mkLimb(0.17 * bulk, 0.66, skin, skin); armL.position.set(0.41 * bulk, 0.74, 0); hips.add(armL);
  const armR = mkLimb(0.17 * bulk, 0.66, skin, skin); armR.position.set(-0.41 * bulk, 0.74, 0); hips.add(armR);
  const legL = mkLimb(0.21 * bulk, 0.92, o.legs ?? skin, o.feet ?? 0x3a2a1a); legL.position.set(0.16 * bulk, -0.05, 0); hips.add(legL);
  const legR = mkLimb(0.21 * bulk, 0.92, o.legs ?? skin, o.feet ?? 0x3a2a1a); legR.position.set(-0.16 * bulk, -0.05, 0); hips.add(legR);
  const hand = new THREE.Group(); hand.position.y = -0.62; armR.add(hand);
  const handL = new THREE.Group(); handL.position.y = -0.62; armL.add(handL);
  return { g, root, hips, torso, head, armL, armR, legL, legR, hand, handL, weapon: null };
}

export function setWeapon(h, kind) {
  if (h.weapon) h.hand.remove(h.weapon);
  h.weapon = kind ? makeWeapon(kind) : null;
  if (h.weapon) h.hand.add(h.weapon);
}

// attack: -1 none, else 0..1 progress
export function animHumanoid(h, phase, move, attack = -1, throwing = -1) {
  const s = Math.sin(phase) * 0.75 * move;
  h.legL.rotation.x = s; h.legR.rotation.x = -s;
  h.armL.rotation.x = -s * 0.8; h.armR.rotation.x = s * 0.8;
  h.armL.rotation.z = 0.08; h.armR.rotation.z = -0.08;
  h.hips.position.y = 0.95 + Math.abs(Math.cos(phase)) * 0.06 * move;
  h.hips.rotation.y = Math.sin(phase) * 0.08 * move;
  if (attack >= 0) {
    const a = attack < 0.35 ? -2.7 * (attack / 0.35) : -2.7 + 2.3 * Math.min(1, (attack - 0.35) / 0.4);
    h.armR.rotation.x = a;
    h.hips.rotation.y = attack < 0.35 ? -0.3 * attack / 0.35 : -0.3 + 0.6 * Math.min(1, (attack - 0.35) / 0.4);
  }
  if (throwing >= 0) {
    h.armL.rotation.x = throwing < 0.5 ? -3 * throwing * 2 : -3 + 2 * (throwing - 0.5) * 2;
  }
}

// Quadruped: dog / wolf / boar. Faces +Z.
export function makeQuad(kind, color = 0xd9b48f, accent = 0xffffff) {
  const g = new THREE.Group();
  const root = new THREE.Group(); g.add(root);
  let bw = 0.42, bh = 0.42, bl = 0.95, legH = 0.48, hs = 0.36, sc = 1;
  if (kind === 'wolf') { bw = 0.48; bh = 0.48; bl = 1.15; legH = 0.62; hs = 0.4; sc = 1.15; }
  if (kind === 'boar') { bw = 0.62; bh = 0.6; bl = 1.15; legH = 0.36; hs = 0.46; sc = 1.1; }
  root.scale.setScalar(sc);
  const bodyY = legH + bh / 2;
  const bp = [part(B(bw, bh, bl), color, { pos: [0, bodyY, 0] })];
  if (kind === 'dog') bp.push(part(B(bw * 1.02, bh * 0.5, bl * 0.4), accent, { pos: [0, bodyY - 0.1, 0.25] }));
  if (kind === 'boar') bp.push(part(B(0.1, 0.25, bl * 0.8), 0x2a1a10, { pos: [0, bodyY + bh / 2 + 0.08, 0] }));
  if (kind === 'wolf') bp.push(part(B(bw * 1.1, bh * 1.1, 0.35), accent, { pos: [0, bodyY + 0.04, bl / 2 - 0.15] }));
  root.add(mesh(merge(bp)));
  const head = new THREE.Group(); head.position.set(0, bodyY + 0.18, bl / 2 + 0.1); root.add(head);
  const hp = [part(B(hs, hs, hs), color, { pos: [0, 0, hs / 2] })];
  hp.push(part(B(0.05, 0.05, 0.02), 0x111111, { pos: [0.1, 0.07, hs + 0.01] }), part(B(0.05, 0.05, 0.02), 0x111111, { pos: [-0.1, 0.07, hs + 0.01] }));
  if (kind === 'boar') {
    hp.push(part(B(0.26, 0.22, 0.2), 0xb08070, { pos: [0, -0.06, hs + 0.08] }));
    hp.push(part(new THREE.ConeGeometry(0.03, 0.18, 4), 0xf0eadc, { pos: [0.12, 0.02, hs + 0.08] }), part(new THREE.ConeGeometry(0.03, 0.18, 4), 0xf0eadc, { pos: [-0.12, 0.02, hs + 0.08] }));
    hp.push(part(B(0.08, 0.14, 0.06), color, { pos: [0.14, hs / 2 + 0.05, 0.1] }), part(B(0.08, 0.14, 0.06), color, { pos: [-0.14, hs / 2 + 0.05, 0.1] }));
  } else {
    hp.push(part(B(0.2, 0.18, 0.24), kind === 'dog' ? accent : color, { pos: [0, -0.06, hs + 0.1] }));
    hp.push(part(B(0.06, 0.05, 0.04), 0x111111, { pos: [0, -0.01, hs + 0.22] }));
    const earH = kind === 'wolf' ? 0.24 : 0.16;
    hp.push(part(new THREE.ConeGeometry(0.07, earH, 4), color, { pos: [0.12, hs / 2 + earH / 2, 0.12], rot: [0, 0, kind === 'dog' ? -0.5 : -0.1] }));
    hp.push(part(new THREE.ConeGeometry(0.07, earH, 4), color, { pos: [-0.12, hs / 2 + earH / 2, 0.12], rot: [0, 0, kind === 'dog' ? 0.5 : 0.1] }));
  }
  head.add(mesh(merge(hp)));
  const legs = [];
  for (const [x, z] of [[bw / 2 - 0.08, bl / 2 - 0.12], [-bw / 2 + 0.08, bl / 2 - 0.12], [bw / 2 - 0.08, -bl / 2 + 0.12], [-bw / 2 + 0.08, -bl / 2 + 0.12]]) {
    const pv = new THREE.Group(); pv.position.set(x, legH, z);
    pv.add(mesh(merge([part(B(0.13, legH, 0.13), color, { pos: [0, -legH / 2, 0] })])));
    root.add(pv); legs.push(pv);
  }
  const tail = new THREE.Group(); tail.position.set(0, bodyY + 0.12, -bl / 2); root.add(tail);
  tail.add(mesh(merge([part(B(0.08, 0.08, kind === 'boar' ? 0.15 : 0.45), kind === 'wolf' ? accent : color, { pos: [0, 0, -0.2], rot: [0.5, 0, 0] })])));
  return { g, root, head, legs, tail, kind };
}

export function animQuad(q, phase, move, attack = -1, sit = false) {
  const s = Math.sin(phase) * 0.8 * move;
  q.legs[0].rotation.x = s; q.legs[3].rotation.x = s;
  q.legs[1].rotation.x = -s; q.legs[2].rotation.x = -s;
  q.tail.rotation.y = Math.sin(phase * 1.5 + 1) * 0.5;
  q.root.rotation.x = sit ? -0.35 : 0;
  q.root.position.y = sit ? -0.12 : Math.abs(Math.cos(phase)) * 0.04 * move;
  q.head.rotation.x = attack >= 0 ? Math.sin(attack * Math.PI) * 0.6 : (sit ? 0.3 : 0);
}
