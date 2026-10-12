// Fires of Pele — main bootstrap, game loop, interaction and mode handling.
import * as THREE from 'three';
import { G, CFG, count } from './state.js';
import { buildTerrain, initSky, updateSky, heightAt, LOC } from './world.js';
import { initFX, updateFX, initAudio, sfx, burst } from './fx.js';
import { generateNodes, updateNodes } from './resources.js';
import { Player } from './player.js';
import { initInput, input, pressed, endFrame, lockPointer, unlockPointer } from './input.js';
import { initBuildingLights, updateBuildMode, updateStructures, hideGhost, collectFrom, relightHearth } from './building.js';
import { updateProjectiles } from './projectiles.js';
import { initTotems, updateEnemies, startNight, endNight } from './enemies.js';
import { spawnStoryDogs, spawnWildlife, updateAnimals, togglePetMode } from './animals.js';
import { initStory, updateStory, startChapter, talkToMalu } from './story.js';
import { toast, updateHUD, setPrompt, drawMinimap, renderCraft, showScreen, advanceDialogue, dialogueOpen } from './ui.js';
import { saveGame, loadGame, hasSave, clearSave } from './save.js';
import { makeLabel, part, merge, mesh } from './util.js';
import * as THREE_NS from 'three';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 1200);
G.scene = scene; G.camera = camera; G.renderer = renderer;

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});

// ---------- world setup ----------
buildTerrain(scene);
initSky(scene);
initFX(scene);
generateNodes(scene);
initBuildingLights(scene);
initTotems();
initStory();
const player = new Player(scene);
G.player = player;
const startPos = () => ({ x: LOC.wreck.x - Math.cos(LOC.wreck.a) * 12, z: LOC.wreck.z - Math.sin(LOC.wreck.a) * 12 });
{ const s = startPos(); player.spawnAt(s.x, s.z); player.camYaw = Math.atan2(-Math.cos(LOC.wreck.a), -Math.sin(LOC.wreck.a)) + 0.35; }
spawnStoryDogs();
spawnWildlife(true);
initInput(canvas);
player.updateCamera(1);

// ---------- modes ----------
const $ = (id) => document.getElementById(id);
function setMode(m) {
  const prev = G.mode;
  G.mode = m;
  if (prev === 'build' && m !== 'build') hideGhost();
  if (m === 'play' || m === 'build') { showScreen(null); lockPointer(); }
  else if (m === 'dialogue') { /* keep lock; click advances */ }
  else { G._suppressPause = true; unlockPointer(); setTimeout(() => (G._suppressPause = false), 100); }
  document.body.dataset.mode = m;
}
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && (G.mode === 'play' || G.mode === 'build') && !G._suppressPause) openPause();
});
function openPause() { setMode('pause'); showScreen('pause'); }

$('btnNew').onclick = () => { initAudio(); clearSave(); newGame(); };
$('btnContinue').onclick = () => { initAudio(); continueGame(); };
$('btnHelp').onclick = () => { showScreen('help'); };
$('btnHelpBack').onclick = () => { showScreen(G.started ? 'pause' : 'title'); };
$('btnResume').onclick = () => { setMode('play'); };
$('btnSave').onclick = () => { if (saveGame()) toast('Game saved.', 'good'); };
$('btnPauseHelp').onclick = () => showScreen('help');
$('btnRespawn').onclick = () => respawn();
$('btnKeepPlaying').onclick = () => { setMode('play'); };
$('btnCloseCraft').onclick = () => setMode('play');
$('dialogue').addEventListener('click', () => advanceDialogue());
if (hasSave()) $('btnContinue').style.display = 'inline-block';
canvas.addEventListener('click', () => { if ((G.mode === 'play' || G.mode === 'build') && !input.locked) lockPointer(); });

function newGame() {
  G.started = true;
  setMode('play');
  startChapter(0, true);
}
function continueGame() {
  if (!loadGame()) return newGame();
  if (G.flags._respawnDogs) {
    delete G.flags._respawnDogs;
    spawnStoryDogs();
    const names = new Set(G.animals.filter((a) => a.tamed).map((a) => a.name));
    for (const a of G.animals) if (a.story && !a.tamed && names.has(a.name)) { G.scene.remove(a.q.g); a.alive = false; }
    G.animals = G.animals.filter((a) => a.alive);
  }
  G.started = true;
  setMode('play');
  startChapter(G.story.ch, false);
  // restore objective index (startChapter resets it)
  const saved = JSON.parse(localStorage.getItem('firesOfPele.save.v1')).story;
  Object.assign(G.story, saved);
  toast('Welcome back. Day ' + G.day + '.', 'good');
}
G.onAutosave = () => { if (saveGame()) toast('Progress saved.', 'info'); };
G.onVictory = () => {
  sfx('victory');
  setMode('victory'); showScreen('victory');
  $('vstats').innerHTML = `Days survived: <b>${G.day}</b><br>Raids repelled: <b>${G.counters.raidsSurvived || 0}</b><br>Enemies defeated: <b>${G.stats.kills}</b><br>Structures built: <b>${G.stats.built}</b><br>Companions: <b>${G.animals.filter((a) => a.tamed).map((a) => a.name).join(', ') || 'none'}</b>`;
  saveGame();
};

// ---------- death ----------
G.onPlayerDeath = (src) => {
  const lost = {};
  for (const k of ['wood', 'stone', 'fiber', 'obsidian', 'food', 'water']) {
    const n = Math.floor(G.inv[k] * 0.25);
    if (n > 0) { lost[k] = n; G.inv[k] -= n; }
  }
  if (Object.keys(lost).length) {
    const m = mesh(merge([part(new THREE.IcosahedronGeometry(0.45, 0), 0x8a6a44, { pos: [0, 0.35, 0], scale: [1, 0.8, 1] }), part(new THREE.CylinderGeometry(0.1, 0.15, 0.3, 5), 0xc8b070, { pos: [0, 0.8, 0] })]));
    m.position.set(player.pos.x, heightAt(player.pos.x, player.pos.z), player.pos.z);
    const l = makeLabel('Your supplies', '#ffd890'); l.position.y = 1.6; l.scale.set(1.8, 0.45, 1); m.add(l);
    scene.add(m);
    G.lootBags.push({ x: player.pos.x, z: player.pos.z, inv: lost, mesh: m });
  }
  setTimeout(() => {
    setMode('dead'); showScreen('dead');
    $('deadmsg').innerHTML = `You were overcome${src && typeof src === 'string' ? ' by ' + ({ lava: 'the lava', slam: "Kaʻula's fury", stone: 'a sling stone', wolf: 'a ghost wolf', boar: 'a wild boar', 'the elements': 'hunger and thirst' }[src] || src) : ''}.<br>${Object.keys(lost).length ? 'You dropped some supplies (' + Object.entries(lost).map(([k, v]) => v + ' ' + k).join(', ') + '). Return to recover them.' : ''}`;
  }, 1200);
};
function respawn() {
  const at = G.hearth ? { x: G.hearth.x + 2, z: G.hearth.z + 2 } : startPos();
  player.revive(at.x, at.z);
  setMode('play');
}

// ---------- interaction ----------
let interact = null;
function findInteract() {
  const P = player.pos;
  let best = null, bd = 3.3;
  const consider = (x, z, label, action, r = 3.3) => {
    const d = Math.hypot(x - P.x, z - P.z);
    if (d < r && d < bd + (r - 3.3)) { bd = d; best = { label, action }; }
  };
  for (const a of G.animals) {
    if (!a.active) continue;
    if (!a.tamed && a.canTame()) consider(a.pos.x, a.pos.z, `Feed ${a.label} 🥥 (${a.fed}/${a.tameCost}) to tame`, () => a.feed());
    else if (!a.tamed && a.kind === 'wolf' && a.state !== 'aggro') consider(a.pos.x, a.pos.z, 'Ghost wolves must be weakened before they accept food', () => {});
    else if (a.tamed && a.hp < a.maxHp - 1) consider(a.pos.x, a.pos.z, `Feed ${a.name} to heal (1 🥥)`, () => a.feed(), 2.5);
  }
  if (G.malu) consider(G.malu.pos.x, G.malu.pos.z, 'Talk to Kupuna Malu', () => talkToMalu());
  for (const s of G.structures) if (s.def.produce && s.store > 0) consider(s.x, s.z, `Collect ${s.store} ${s.def.produce} from ${s.def.name}`, () => collectFrom(s));
  consider(LOC.spring.x, LOC.spring.z, 'Drink from the spring & fill gourds', () => {
    player.thirst = 100;
    if (!G.flags.springT || G.t - G.flags.springT > 45) { G.flags.springT = G.t; G.inv.water += 3; toast('+3 water (gourds filled)', 'res', 'water'); }
    else toast('You drink deeply. (Gourds refill again soon.)', 'info');
    sfx('pickup');
  }, 6.5);
  for (const b of G.lootBags) consider(b.x, b.z, 'Recover your dropped supplies', () => {
    for (const k in b.inv) G.inv[k] += b.inv[k];
    scene.remove(b.mesh); G.lootBags = G.lootBags.filter((x) => x !== b);
    toast('Recovered your supplies!', 'good'); sfx('pickup');
  });
  if (!G.flags.salvaged) consider(LOC.wreck.x, LOC.wreck.z, 'Salvage the wreck of the Pualena', () => {
    G.flags.salvaged = true;
    G.inv.wood += 6; G.inv.fiber += 6; G.inv.food += 2; G.inv.water += 2;
    count('woodGathered', 6); count('foodGathered', 2);
    toast('Salvaged planks, rope, and a few supplies from the Pualena.', 'good', null, 4);
    sfx('craft');
  }, 7);
  return best;
}

function handleKeys() {
  const m = G.mode;
  if (m === 'dialogue') {
    if (pressed('Space') || pressed('Enter') || pressed('KeyE') || input.lclick) advanceDialogue();
    return;
  }
  if (m === 'craft') { if (pressed('KeyC') || pressed('Escape')) setMode('play'); return; }
  if (m === 'pause') { if (pressed('Escape')) setMode('play'); return; }
  if (m !== 'play' && m !== 'build') return;
  if (pressed('Escape')) { openPause(); return; }
  if (pressed('KeyB')) { setMode(m === 'build' ? 'play' : 'build'); return; }
  if (pressed('KeyC')) { setMode('craft'); showScreen('craft'); renderCraft(); return; }
  if (pressed('KeyP')) togglePetMode();
  if (pressed('KeyM')) document.getElementById('minimap').classList.toggle('big');
  if (!player.alive) return;
  if (m === 'play') {
    if (pressed('Digit1')) player.equip('club');
    if (pressed('Digit2')) { if (G.weapons.spear) player.equip('spear'); else toast('Craft a Stone Spear first [C].', 'info'); }
    if (pressed('Digit3')) { if (G.weapons.blade) player.equip('blade'); else toast('Forge an Obsidian Blade first [C].', 'info'); }
  }
  if (pressed('KeyE') && interact) interact.action();
  if (pressed('KeyF')) {
    if (G.inv.food < 1) toast('No food! Gather berries, coconuts, or hunt boars.', 'warn');
    else if (player.hunger > 96) toast("You're not hungry.", 'info');
    else { G.inv.food--; player.hunger = Math.min(100, player.hunger + 28); player.hp = Math.min(player.maxHp, player.hp + 5); sfx('pickup'); toast('Ate some food (+hunger)', 'res', 'food'); }
  }
  if (pressed('KeyG')) {
    if (G.inv.water < 1) toast('No water! Drink at the spring, crack coconuts, or build a Rain Catcher.', 'warn');
    else if (player.thirst > 96) toast("You're not thirsty.", 'info');
    else { G.inv.water--; player.thirst = Math.min(100, player.thirst + 38); sfx('pickup'); toast('Drank water (+thirst)', 'res', 'water'); }
  }
  if (pressed('KeyH')) {
    if (G.inv.bandage < 1) toast('No bandages. Craft them from fiber [C].', 'warn');
    else if (player.hp >= player.maxHp) toast('You are not hurt.', 'info');
    else { G.inv.bandage--; player.hp = Math.min(player.maxHp, player.hp + 35); sfx('craft'); toast('Bandaged your wounds (+35 health)', 'good'); }
  }
  if (pressed('KeyT')) {
    const H = G.hearth;
    if (!H) toast('Build a Hearth first.', 'warn');
    else if (Math.hypot(H.x - player.pos.x, H.z - player.pos.z) > 7) toast('Rest beside your Hearth to pass the time.', 'info');
    else if (G.cycle >= CFG.DAY_FRAC - 0.03) toast('Night is already upon you!', 'warn');
    else if (G.enemies.some((e) => e.alive && Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) < 30)) toast("You can't rest with enemies nearby.", 'warn');
    else {
      G.cycle = CFG.DAY_FRAC - 0.025;
      player.hunger = Math.max(0, player.hunger - 12); player.thirst = Math.max(0, player.thirst - 15);
      for (const s of G.structures) if (s.def.produce) s.store = Math.min(s.def.cap, s.store + 2);
      toast('You rest by the fire until dusk… The drums will start soon.', 'info', null, 4);
      $('fade').classList.add('on'); setTimeout(() => $('fade').classList.remove('on'), 900);
    }
  }
}

// ---------- day / night ----------
function updateCycle(dt) {
  const wasNight = G.isNight;
  G.cycle += dt / CFG.CYCLE;
  if (G.cycle >= 1) { G.cycle -= 1; G.day++; }
  const night = G.cycle >= CFG.DAY_FRAC;
  if (night && !wasNight) startNight();
  if (!night && wasNight) {
    endNight();
    for (const a of G.animals) if (a.tamed) a.reviveAtHome();
    relightHearth();
    G.onAutosave();
  }
}

// ---------- loop ----------
const timer = new THREE.Timer();
timer.connect(document);
let hudT = 0, mapT = 0;
function frame() {
  requestAnimationFrame(frame);
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  // dialogue polling
  if (dialogueOpen() && (G.mode === 'play' || G.mode === 'build')) { G.prevMode = G.mode; if (G.mode === 'build') hideGhost(); G.mode = 'dialogue'; document.body.dataset.mode = 'dialogue'; }
  else if (!dialogueOpen() && G.mode === 'dialogue') setMode('play');
  handleKeys();
  const sim = G.mode === 'play' || G.mode === 'build';
  if (sim) {
    G.t += dt;
    updateCycle(dt);
    player.update(dt, true);
    if (G.mode === 'build') updateBuildMode();
    updateNodes(dt);
    updateStructures(dt);
    updateAnimals(dt);
    updateEnemies(dt);
    updateProjectiles(dt);
    updateFX(dt);
    updateStory(dt);
    interact = player.alive ? findInteract() : null;
    let prompt = interact ? `[E] ${interact.label}` : '';
    if (!prompt && G.hearth && G.cycle < CFG.DAY_FRAC - 0.03 && Math.hypot(G.hearth.x - player.pos.x, G.hearth.z - player.pos.z) < 7) prompt = '[T] Rest by the fire until dusk';
    setPrompt(G.mode === 'build' ? '' : prompt);
  } else if (G.mode === 'title') {
    // slow orbit for the title screen
    G.t += dt * 0.5;
    const a = G.t * 0.05;
    camera.position.set(Math.cos(a) * 120, 45, Math.sin(a) * 120);
    camera.lookAt(0, 8, -10);
  }
  updateSky(dt);
  hudT -= dt;
  if (hudT <= 0 && G.mode !== 'title') { hudT = 0.1; updateHUD(); }
  mapT -= dt;
  if (mapT <= 0 && G.mode !== 'title') { mapT = 0.15; drawMinimap(); }
  renderer.render(scene, camera);
  endFrame();
}
document.body.dataset.mode = 'title';
showScreen('title');
frame();

// debug hook for automated testing
window.__G = G;
window.__debug = { setMode, startNight, endNight, saveGame, loadGame, respawn, THREE: THREE_NS };
