// HUD, toasts, crafting/invention panel, dialogue, screens and minimap.
import { G, RES_ICON, RES_NAME, hasRes, payRes, costStr, count } from './state.js';
import { timeInfo, LOC, heightAt, VOLC } from './world.js';
import { build, PIECES, INVENTIONS, structureHint } from './building.js';
import { sfx } from './fx.js';

const $ = (id) => document.getElementById(id);

// ---------- toasts ----------
export function toast(msg, kind = 'info', res = null, dur = 3.2) {
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
  if (!ti.isNight) until = `Night in ${fmt((0.65 - G.cycle) * cyc)}`;
  else until = `Dawn in ${fmt((1 - G.cycle) * cyc)}`;
  $('clock').innerHTML = `<b>Day ${G.day}</b> · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${ti.isNight ? '🌙' : '☀️'}<br><span class="${ti.isNight ? 'warn' : ''}">${until}</span>${G.raid.active ? `<br><span class="bad">⚔ Raid! ${G.enemies.filter((e) => e.raid && e.alive).length + G.raid.queue.length} raiders</span>` : ''}`;
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
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function setObjective(title, lines) {
  $('objective').innerHTML = `<div class="chap">${title}</div>` + lines.map((l) => `<div class="obj ${l.done ? 'done' : l.active ? 'active' : 'todo'}">${l.done ? '✔' : l.active ? '➤' : '•'} ${l.text}${l.prog ? ` <span class="prog">${l.prog}</span>` : ''}${l.dist ? ` <span class="dist">${l.dist}</span>` : ''}</div>`).join('');
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
export function showDialogue(lines, onDone) {
  dlg = { lines, i: 0, onDone };
  $('dialogue').style.display = 'block';
  renderDlg();
}
function renderDlg() {
  const l = dlg.lines[dlg.i];
  $('dlgwho').textContent = l.who || '';
  $('dlgwho').style.display = l.who ? 'block' : 'none';
  $('dlgtext').innerHTML = l.text;
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
  for (const s of ['title', 'pause', 'dead', 'victory', 'craft', 'help']) $(s).style.display = s === id ? 'flex' : 'none';
}

// ---------- minimap ----------
let mapBase = null;
const MAPR = 130;
export function drawMinimap(big = false) {
  const cv = $('minimap');
  const S = cv.width;
  const ctx = cv.getContext('2d');
  if (!mapBase) {
    mapBase = document.createElement('canvas'); mapBase.width = mapBase.height = 220;
    const m = mapBase.getContext('2d');
    const img = m.createImageData(220, 220);
    for (let j = 0; j < 220; j++) for (let i = 0; i < 220; i++) {
      const x = (i / 220 - 0.5) * 2 * MAPR, z = (j / 220 - 0.5) * 2 * MAPR;
      const h = heightAt(x, z);
      const dv = Math.hypot(x - VOLC.x, z - VOLC.z);
      let c;
      if (h < -2) c = [30, 90, 140]; else if (h < 0) c = [60, 150, 190]; else if (h < 1.9) c = [225, 210, 160];
      else if (dv < 9) c = [200, 70, 20]; else if (dv < 24) c = [70, 60, 58]; else if (dv < 40) c = [110, 100, 88];
      else c = [70 - h, 140 - h * 2, 60 - h];
      const o = (j * 220 + i) * 4;
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
    }
    m.putImageData(img, 0, 0);
  }
  ctx.clearRect(0, 0, S, S);
  ctx.save();
  ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); ctx.clip();
  ctx.drawImage(mapBase, 0, 0, S, S);
  const toMap = (x, z) => [(x / MAPR / 2 + 0.5) * S, (z / MAPR / 2 + 0.5) * S];
  const dot = (x, z, col, r = 3) => { const [a, b] = toMap(x, z); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(a, b, r, 0, Math.PI * 2); ctx.fill(); };
  const label = (x, z, t) => { const [a, b] = toMap(x, z); ctx.fillStyle = '#fff'; ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.fillText(t, a, b - 6); };
  dot(LOC.cove.x, LOC.cove.z, '#7ef', 3); label(LOC.cove.x, LOC.cove.z, 'Malu');
  dot(LOC.village.x, LOC.village.z, '#f44', 4); label(LOC.village.x, LOC.village.z, 'Kapu');
  dot(LOC.wreck.x, LOC.wreck.z, '#da7', 3);
  dot(LOC.spring.x, LOC.spring.z, '#4cf', 3);
  if (G.hearth) { dot(G.hearth.x, G.hearth.z, '#fa3', 4); }
  for (const s of G.structures) if (s.type !== 'hearth') dot(s.x, s.z, '#cb9', 1.2);
  for (const e of G.enemies) if (e.alive) dot(e.pos.x, e.pos.z, e.isBoss ? '#f0f' : '#f22', e.isBoss ? 5 : 2.5);
  for (const a of G.animals) if (a.tamed && a.active) dot(a.pos.x, a.pos.z, '#5cf', 2.5);
  if (G.objTarget) { const [a, b] = toMap(G.objTarget.x, G.objTarget.z); ctx.strokeStyle = '#ff0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(a, b, 6 + Math.sin(G.t * 4) * 2, 0, Math.PI * 2); ctx.stroke(); }
  const P = G.player;
  const [px, pz] = toMap(P.pos.x, P.pos.z);
  ctx.translate(px, pz); ctx.rotate(-P.camYaw);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); ctx.stroke();
}
