// Particles (instanced) and procedural WebAudio sound effects.
import * as THREE from 'three';
import { G } from './state.js';
import { heightAt } from './world.js';

const MAX = 400;
let inst;
const parts = [];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color();

export function initFX(scene) {
  inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX);
  inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  inst.frustumCulled = false;
  for (let i = 0; i < MAX; i++) {
    parts.push({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 1, size: 0.1, grav: 12 });
    inst.setMatrixAt(i, _m.makeScale(0, 0, 0));
    inst.setColorAt(i, _c.set(0xffffff));
  }
  scene.add(inst);
}

let cursor = 0;
export function burst(pos, color, n = 8, speed = 4, size = 0.12, grav = 12, life = 0.8) {
  for (let k = 0; k < n; k++) {
    const p = parts[cursor]; const idx = cursor;
    cursor = (cursor + 1) % MAX;
    p.alive = true;
    p.p.copy(pos);
    p.v.set((Math.random() - 0.5) * speed, Math.random() * speed * 0.9 + 1, (Math.random() - 0.5) * speed);
    p.life = p.max = life * (0.6 + Math.random() * 0.6);
    p.size = size * (0.6 + Math.random() * 0.8);
    p.grav = grav;
    inst.setColorAt(idx, _c.set(color));
  }
  inst.instanceColor.needsUpdate = true;
}

export function updateFX(dt) {
  for (let i = 0; i < MAX; i++) {
    const p = parts[i];
    if (!p.alive) continue;
    p.life -= dt;
    if (p.life <= 0) { p.alive = false; inst.setMatrixAt(i, _m.makeScale(0, 0, 0)); continue; }
    p.v.y -= p.grav * dt;
    p.p.addScaledVector(p.v, dt);
    const gh = heightAt(p.p.x, p.p.z);
    if (p.p.y < gh + 0.05) { p.p.y = gh + 0.05; p.v.multiplyScalar(0.4); p.v.y = Math.abs(p.v.y) * 0.3; }
    const s = p.size * Math.min(1, (p.life / p.max) * 2);
    _q.setFromAxisAngle(p.v.clone().normalize(), p.life * 6);
    _m.compose(p.p, _q, _s.set(s, s, s));
    inst.setMatrixAt(i, _m);
  }
  inst.instanceMatrix.needsUpdate = true;
}

// ---------------- Audio ----------------
let ctx = null, master = null, noiseBuf = null, ambient = null;
export function initAudio() {
  if (ctx) { ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) { return; }
  master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // ocean ambience: looping filtered noise with slow swell
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
  const g = ctx.createGain(); g.gain.value = 0.05;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.12;
  const lg = ctx.createGain(); lg.gain.value = 0.035;
  lfo.connect(lg); lg.connect(g.gain);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(); lfo.start();
  ambient = g;
}

function noise(dur, freq, q = 1, vol = 0.4, type = 'bandpass') {
  if (!ctx) return;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); const t = ctx.currentTime;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
function tone(freq, dur, type = 'sine', vol = 0.3, slide = 0, delay = 0) {
  if (!ctx) return;
  const o = ctx.createOscillator(); o.type = type;
  const g = ctx.createGain(); const t = ctx.currentTime + delay;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

export function sfx(name) {
  if (!ctx) return;
  switch (name) {
    case 'chop': noise(0.12, 900, 2, 0.5); tone(140, 0.1, 'triangle', 0.25, 0.6); break;
    case 'stone': noise(0.08, 2800, 4, 0.4); tone(320, 0.06, 'square', 0.08, 0.5); break;
    case 'rustle': noise(0.18, 3500, 0.7, 0.25, 'highpass'); break;
    case 'swing': noise(0.15, 1200, 0.5, 0.15); break;
    case 'hit': tone(110, 0.15, 'sine', 0.5, 0.5); noise(0.08, 600, 1, 0.3); break;
    case 'hurt': tone(220, 0.25, 'sawtooth', 0.18, 0.5); break;
    case 'place': tone(180, 0.12, 'triangle', 0.3, 0.7); noise(0.1, 500, 1, 0.3); break;
    case 'sling': noise(0.22, 1800, 1.5, 0.2); break;
    case 'pickup': tone(660, 0.08, 'sine', 0.15); tone(990, 0.1, 'sine', 0.12, 0, 0.06); break;
    case 'craft': [523, 659, 784].forEach((f, i) => tone(f, 0.15, 'triangle', 0.18, 0, i * 0.08)); break;
    case 'tame': [440, 554, 659, 880].forEach((f, i) => tone(f, 0.2, 'sine', 0.2, 0, i * 0.1)); break;
    case 'error': tone(160, 0.15, 'square', 0.1); break;
    case 'drum': for (let i = 0; i < 6; i++) { tone(70, 0.35, 'sine', 0.7, 0.5, i * 0.38); noise(0.1, 200, 1, 0.3); } break;
    case 'dawn': [392, 523, 659, 784].forEach((f, i) => tone(f, 0.5, 'sine', 0.15, 0, i * 0.18)); break;
    case 'crumble': noise(0.5, 300, 0.6, 0.6, 'lowpass'); break;
    case 'roar': tone(90, 1.0, 'sawtooth', 0.35, 0.5); noise(0.9, 250, 0.8, 0.4, 'lowpass'); break;
    case 'bark': tone(500, 0.07, 'square', 0.12, 0.6); tone(450, 0.07, 'square', 0.12, 0.6, 0.12); break;
    case 'victory': [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.35, 'triangle', 0.2, 0, i * 0.16)); break;
  }
}
