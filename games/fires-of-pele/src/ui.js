// HUD, toasts, crafting/invention panel, dialogue, screens and minimap.
import { G, RES_ICON, RES_NAME, hasRes, payRes, costStr, count, fmt, escHtml } from './state.js';
import { timeInfo, LOC, heightAt, VOLC, PATHS, CAVES, WORLD } from './world.js';
import { build, PIECES, INVENTIONS, structureHint } from './building.js';
import { sfx } from './fx.js';

const $ = (id) => document.getElementById(id);

// ---------- toasts ----------
export function toast(msg, kind = 'info', res = null, dur = 3.2) {
  msg = fmt(msg).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  if (kind === 'res') {
    const el = document.createElement('div');
    el.className = 'feed-item';
    el.textContent = (res ? RES_ICON[res] + ' ' : '') + msg;
    $('feed').prepend(el);
    setTimeout(() => el.classList.add('out'), 1800);
    setTimeout(() => el.remove(), 2400);
    while ($('feed').children.length > 6) $('feed').lastChild.remove();
    return;
  }
  const box = $('toasts');
  if ([...box.children].some((c) => c.dataset.msg === msg)) return;
  const el = document.createElement('div');
  el.className = 'toast ' + kind; el.dataset.msg = msg;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.classList.add('out'), dur * 1000);
  setTimeout(() => el.remove(), dur * 1000 + 500);
  while (box.children.length > 4) box.firstChild.remove();
}

export function flashDamage() {
  const v = $('vignette');
  v.style.opacity = 0.75;
  clearTimeout(flashDamage._t);
  flashDamage._t = setTimeout(() => (v.style.opacity = 0), 160);
}

export function setBossBar(name, pct) {
  const b = $('bossbar');
  if (!name) { b.style.display = 'none'; return; }
  b.style.display = 'block';
  $('bossname').textContent = name;
  $('bossfill').style.width = Math.max(0, pct * 100) + '%';
}

export function setPrompt(text) {
  const p = $('prompt');
  if (p.textContent !== text) p.textContent = text;
  p.style.display = text ? 'block' : 'none';
}

// ---------- HUD ----------
const bar = (id, v) => { $(id).style.width = Math.max(0, Math.min(100, v)) + '%'; };
export function updateHUD() {
  const P = G.player;
  bar('hpfill', (P.hp / P.maxHp) * 100); bar('stfill', P.stamina); bar('hufill', P.hunger); bar('thfill', P.thirst);
  $('hptext').textContent = Math.ceil(P.hp);
  const ti = timeInfo();
  const hh = Math.floor(ti.hour), mm = Math.floor((ti.hour - hh) * 60);
  const cyc = 300;
  let until;
  if (!ti.isNight) until = `Night in ${fmtT((0.65 - G.cycle) * cyc)}`;
  else until = `Dawn in ${fmtT((1 - G.cycle) * cyc)}`;
  $('clock').innerHTML = `<span class="pname">${escHtml(G.names.player)}</span> · <b>Day ${G.day}</b> · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${ti.isNight ? '🌙' : '☀️'}<br><span class="${ti.isNight ? 'warn' : ''}">${until}</span>${G.raid.active ? `<br><span class="bad">⚔ Raid! ${G.enemies.filter((e) => e.raid && e.alive).length + G.raid.queue.length} raiders</span>` : ''}`;
  const inv = G.inv;
  $('inv').innerHTML = ['wood', 'stone', 'fiber', 'obsidian', 'food', 'water', 'bandage'].map((k) => `<div class="slot" title="${RES_NAME[k]}"><span>${RES_ICON[k]}</span><b>${inv[k] || 0}</b></div>`).join('');
  const W = { club: 'Driftwood Club', spear: 'Stone Spear', blade: 'Obsidian Blade' };
  $('weapon').innerHTML = ['club', 'spear', 'blade'].map((w, i) => G.weapons[w] ? `<span class="${G.weapon === w ? 'sel' : ''}">${i + 1} ${W[w]}</span>` : '').join('') + (G.weapons.sling ? `<span>RMB Sling (${inv.stone}🪨)</span>` : '');
  const pets = G.animals.filter((a) => a.tamed);
  $('pets').style.bottom = ($('stats').offsetHeight + 26) + 'px';
  $('pets').innerHTML = pets.length ? `<div class="pethead">Companions · ${pets[0].mode === 'guard' ? '🛡 Guarding base' : '🐾 Following'} <small>[P]</small></div>` + pets.map((a) => `<div class="pet ${a.state === 'ko' ? 'ko' : ''}">${a.kind === 'boar' ? '🐗' : a.kind === 'wolf' ? '🐺' : '🐕'} ${a.name}<i style="width:${(a.hp / a.maxHp) * 100}%"></i></div>`).join('') : '';
  // build bar
  const bb = $('buildbar');
  if (G.mode === 'build') {
    bb.style.display = 'flex';
    const html = build.list.map((t, i) => {
      const d = PIECES[t];
      const ok = hasRes(d.cost[0]);
      return `<div class="bslot ${i === build.sel ? 'sel' : ''} ${ok ? '' : 'poor'}"><div class="bk">${(i + 1) % 10}</div><div class="bi">${d.icon}</div><div class="bn">${d.name}</div><div class="bc">${costStr(d.cost[0])}</div></div>`;
    }).join('');
    if (bb.dataset.h !== html) { bb.innerHTML = html; bb.dataset.h = html; }
    const sel = PIECES[build.list[build.sel]];
    $('buildinfo').style.display = 'block';
    $('buildinfo').innerHTML = `<b>${sel.icon} ${sel.name}</b> — ${sel.desc}${build.status ? `<br><span class="warn">${build.status}</span>` : ''}${build.target ? `<br><span class="tgt">🎯 ${structureHint(build.target)}</span>` : ''}<br><small>LMB place · R rotate · wheel/1-0 select · U upgrade/repair · V demolish · B exit</small>`;
  } else { bb.style.display = 'none'; $('buildinfo').style.display = 'none'; }
}
const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function setObjective(title, lines) {
  $('objective').innerHTML = `<div class="chap">${fmt(title)}</div>` + lines.map((l) => `<div class="obj ${l.done ? 'done' : l.active ? 'active' : 'todo'}">${l.done ? '✔' : l.active ? '➤' : '•'} ${fmt(l.text)}${l.prog ? ` <span class="prog">${l.prog}</span>` : ''}${l.dist ? ` <span class="dist">${l.dist}</span>` : ''}</div>`).join('');
}

// ---------- crafting & inventions ----------
export const RECIPES = [
  { id: 'sling', name: 'Sling', icon: '🪢', cost: { fiber: 8, wood: 2 }, desc: 'Right-click to hurl stones at enemies (uses 1 stone per throw).', have: () => G.weapons.sling, make: () => { G.weapons.sling = true; count('crafted_sling'); } },
  { id: 'spear', name: 'Stone Spear', icon: '🔱', cost: { wood: 6, stone: 6, fiber: 4 }, desc: 'Tier 2 weapon & tool: longer reach, more damage, can mine obsidian.', have: () => G.weapons.spear, make: () => { G.weapons.spear = true; count('crafted_spear'); G.player.equip('spear'); } },
  { id: 'blade', name: 'Obsidian Blade', icon: '🗡️', cost: { obsidian: 8, wood: 4, fiber: 4 }, desc: 'Tier 3: razor volcanic glass. Fast and deadly.', have: () => G.weapons.blade, make: () => { G.weapons.blade = true; count('crafted_blade'); G.player.equip('blade'); } },
  { id: 'bandage', name: 'Bandage', icon: '🩹', cost: { fiber: 5 }, desc: 'Heals 35 health. Use with [H].', repeat: true, make: () => { G.inv.bandage++; } },
];
const INV_NAMES = { rain: 'Rain Catcher', garden: 'Taro Garden', fishtrap: 'Fish Trap', kennel: 'Pet Hale (Kennel)', ballista: 'Obsidian Ballista' };

export function renderCraft() {
  const nearHearth = G.hearth && Math.hypot(G.player.pos.x - G.hearth.x, G.player.pos.z - G.hearth.z) < 14;
  let html = '<h2>Crafting</h2><div class="grid">';
  for (const r of RECIPES) {
    const have = r.have && r.have();
    const ok = hasRes(r.cost) && !have;
    html += `<div class="card ${have ? 'owned' : ''}"><div class="ci">${r.icon}</div><div><b>${r.name}</b><p>${r.desc}</p><small>${costStr(r.cost)}</small></div>
      <button data-craft="${r.id}" ${ok ? '' : 'disabled'}>${have ? 'Owned' : 'Craft'}</button></div>`;
  }
  html += '</div><h2>Inventions <small>' + (nearHearth ? '' : '(must be near your Hearth)') + '</small></h2><div class="grid">';
  for (const k in INVENTIONS) {
    const inv = INVENTIONS[k], d = PIECES[k];
    const locked = G.story.ch < inv.minCh;
    const have = G.inventions[k];
    const ok = !locked && !have && nearHearth && hasRes(inv.research);
    html += `<div class="card ${have ? 'owned' : ''} ${locked ? 'locked' : ''}"><div class="ci">${d.icon}</div><div><b>${INV_NAMES[k]}</b><p>${locked && !have ? '🔒 Unlocks in a later chapter.' : d.desc}</p><small>Research: ${costStr(inv.research)}${have ? ' · Build cost: ' + costStr(d.cost[0]) : ''}</small></div>
      <button data-invent="${k}" ${ok ? '' : 'disabled'}>${have ? 'Invented' : 'Invent'}</button></div>`;
  }
  html += '</div><div class="hint">Invented items appear in the Build menu [B]. Press C or Esc to close.</div>';
  $('craftbody').innerHTML = html;
  $('craftbody').querySelectorAll('button[data-craft]').forEach((b) => b.onclick = () => {
    const r = RECIPES.find((x) => x.id === b.dataset.craft);
    if (!hasRes(r.cost)) return;
    payRes(r.cost); r.make(); sfx('craft'); toast(`Crafted ${r.name}!`, 'good'); renderCraft();
  });
  $('craftbody').querySelectorAll('button[data-invent]').forEach((b) => b.onclick = () => {
    const k = b.dataset.invent;
    if (!hasRes(INVENTIONS[k].research)) return;
    payRes(INVENTIONS[k].research); G.inventions[k] = true; count('invented_' + k);
    sfx('craft'); toast(`Invented the ${INV_NAMES[k]}! Find it in the Build menu [B].`, 'good', null, 4); renderCraft();
  });
}

// ---------- dialogue ----------
let dlg = null;
G.showDialogue = (l, f) => showDialogue(l, f);
export function showDialogue(lines, onDone) {
  dlg = { lines, i: 0, onDone };
  $('dialogue').style.display = 'block';
  renderDlg();
}
function renderDlg() {
  const l = dlg.lines[dlg.i];
  $('dlgwho').innerHTML = fmt(l.who || '');
  $('dlgwho').style.display = l.who ? 'block' : 'none';
  $('dlgtext').innerHTML = fmt(l.text);
  $('dlgnext').textContent = dlg.i < dlg.lines.length - 1 ? 'Continue ▸' : 'Close ▸';
}
export function advanceDialogue() {
  if (!dlg) return;
  dlg.i++;
  if (dlg.i >= dlg.lines.length) {
    $('dialogue').style.display = 'none';
    const d = dlg; dlg = null;
    if (d.onDone) d.onDone();
  } else renderDlg();
}
export const dialogueOpen = () => !!dlg;

// ---------- screens ----------
export function showScreen(id) {
  for (const s of ['title', 'pause', 'dead', 'victory', 'craft', 'help', 'newgame', 'load', 'questlog']) $(s).style.display = s === id ? 'flex' : 'none';
}

// ---------- minimap ----------
// Small map: a 150 m radius around you. Big map [M]: the whole island.
let mapBase = null;
const MAPR = 460, MB = 512;
function buildMapBase() {
  mapBase = document.createElement('canvas'); mapBase.width = mapBase.height = MB;
  const m = mapBase.getContext('2d');
  const img = m.createImageData(MB, MB);
  for (let j = 0; j < MB; j++) for (let i = 0; i < MB; i++) {
    const x = (i / MB - 0.5) * 2 * MAPR, z = (j / MB - 0.5) * 2 * MAPR;
    const h = heightAt(x, z);
    const dv = Math.hypot(x - VOLC.x, z - VOLC.z);
    const dbs = Math.hypot(x - LOC.blackSand.x, z - LOC.blackSand.z), dlf = Math.hypot(x - LOC.lavaField.x, z - LOC.lavaField.z);
    let c;
    if (h < -2) c = [30, 90, 140]; else if (h < 0) c = [60, 150, 190];
    else if (h < 1.9) c = dbs < 60 ? [60, 55, 55] : [225, 210, 160];
    else if (dv < 16) c = [200, 70, 20]; else if (dv < 53) c = [70, 60, 58]; else if (dv < 96) c = [110, 100, 88];
    else if (dlf < 60) c = [55, 45, 42];
    else c = [70 - h * 0.6, 140 - h * 1.2, 60 - h * 0.5];
    const o = (j * MB + i) * 4;
    img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
  }
  m.putImageData(img, 0, 0);
  m.strokeStyle = 'rgba(150,110,60,0.85)'; m.lineWidth = 1.4; m.setLineDash([3, 2]);
  const tp = (x, z) => [(x / MAPR / 2 + 0.5) * MB, (z / MAPR / 2 + 0.5) * MB];
  m.beginPath();
  for (const p of PATHS) { const [a, b] = tp(p.ax, p.az), [c2, d] = tp(p.bx, p.bz); m.moveTo(a, b); m.lineTo(c2, d); }
  m.stroke();
}
export function drawMinimap() {
  const cv = $('minimap');
  const big = cv.classList.contains('big');
  const S = big ? 520 : 220;
  if (cv.width !== S) { cv.width = cv.height = S; }
  const ctx = cv.getContext('2d');
  if (!mapBase) buildMapBase();
  const P = G.player;
  const view = big ? MAPR : 150, cx = big ? 0 : P.pos.x, cz = big ? 0 : P.pos.z;
  ctx.clearRect(0, 0, S, S);
  ctx.save();
  ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = 'rgb(30,90,140)'; ctx.fillRect(0, 0, S, S);
  const k = MB / (2 * MAPR);
  ctx.drawImage(mapBase, (cx - view + MAPR) * k, (cz - view + MAPR) * k, 2 * view * k, 2 * view * k, 0, 0, S, S);
  const toMap = (x, z) => [((x - cx) / view / 2 + 0.5) * S, ((z - cz) / view / 2 + 0.5) * S];
  const R0 = S / 2 - 8;
  const dot = (x, z, col, r = 3) => { const [a, b] = toMap(x, z); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(a, b, r, 0, Math.PI * 2); ctx.fill(); };
  const label = (x, z, t) => { const [a, b] = toMap(x, z); ctx.fillStyle = '#fff'; ctx.font = (big ? 12 : 10) + 'px system-ui'; ctx.textAlign = 'center'; ctx.fillText(t, a, b - 6); };
  // places
  const places = [[LOC.cove, '#7ef', 'Malu'], [LOC.village, '#f44', 'Kapu'], [LOC.fishing, '#7ef', 'Kahakai'], [LOC.falls, '#4cf', 'Falls'], [LOC.wreck, '#da7', big ? 'Pualena' : ''],
    [LOC.spring, '#4cf', big ? 'Spring' : ''], [LOC.blackSand, '#ccc', big ? 'Black Sand' : ''], [LOC.islet, '#da7', big ? 'Moku Iki' : '']];
  for (const [p, col, t] of places) { dot(p.x, p.z, col, 3); if (t) label(p.x, p.z, t); }
  for (const c of CAVES) if (G.flags['cave_' + c.id]) { dot(c.x, c.z, '#b9f', 4); label(c.x, c.z, big ? c.name : 'Cave'); }
  if (G.hearth) { dot(G.hearth.x, G.hearth.z, '#fa3', 4); }
  for (const s of G.structures) if (s.type !== 'hearth') dot(s.x, s.z, '#cb9', big ? 1 : 1.2);
  for (const e of G.enemies) if (e.alive) dot(e.pos.x, e.pos.z, e.isBoss ? '#f0f' : '#f22', e.isBoss ? 5 : 2.5);
  for (const a of G.animals) if (a.tamed && a.active) dot(a.pos.x, a.pos.z, '#5cf', 2.5);
  // markers: clamp to the rim of the small map so you always know which way to go
  const marker = (p, col, shape) => {
    let [a, b] = toMap(p.x, p.z);
    const dx = a - S / 2, dy = b - S / 2, d = Math.hypot(dx, dy);
    const out = d > R0;
    if (out) { a = S / 2 + dx / d * R0; b = S / 2 + dy / d * R0; }
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2;
    if (shape === 'ring') { ctx.beginPath(); ctx.arc(a, b, (out ? 4 : 6) + Math.sin(G.t * 4) * 2, 0, Math.PI * 2); ctx.stroke(); }
    else if (shape === 'diamond') { ctx.beginPath(); ctx.moveTo(a, b - 5); ctx.lineTo(a + 4, b); ctx.lineTo(a, b + 5); ctx.lineTo(a - 4, b); ctx.closePath(); ctx.stroke(); }
    else { ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText('!', a, b + 4); }
  };
  for (const g of G.questGivers || []) { const [a, b] = toMap(g.x, g.z); if (Math.hypot(a - S / 2, b - S / 2) < R0) marker(g, '#ffd84a', 'bang'); }
  for (const q of G.questTargets || []) marker(q, '#6ef', 'diamond');
  if (G.objTarget) marker(G.objTarget, '#ff0', 'ring');
  const [px, pz] = toMap(P.pos.x, P.pos.z);
  ctx.translate(px, pz); ctx.rotate(-P.camYaw);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); ctx.stroke();
  if (!big) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('N', S / 2, 14); }
}
