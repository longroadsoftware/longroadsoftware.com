// Story: chapters, objectives, the hermit Malu, and the ending.
import * as THREE from 'three';
import { G, count, hasRes, payRes, costStr, fmt } from './state.js';
import { LOC, heightAt, VOLC, makeCanoe } from './world.js';
import { toast, setObjective, showDialogue, setBossBar } from './ui.js';
import { sfx, burst } from './fx.js';
import { spawnBoss } from './enemies.js';
import { spawnFieldBoars } from './animals.js';
import { spawnNPC, registerTalk, NPCS } from './npcs.js';
import { addCaveItem } from './caves.js';
import { part, merge, mesh } from './util.js';

const N = (t) => ({ who: '', text: t });
const M = (t) => ({ who: 'Kupuna Malu', text: t });
const S = (who) => (t) => ({ who, text: t });
const LEHUA = S('Aunty Lehua'), KIMO = S('Kimo');

// Text may use {P} (player), {D1} and {D2} (the dogs); ui.js fills them in.
export const CHAPTERS = [
  {
    title: 'Chapter 1 — Washed Ashore',
    intro: [
      N('The storm came out of nowhere. One moment the <i>Pualena</i> was running before the wind; the next, the reef tore her open.'),
      N('You wake on warm sand. The wreck groans in the surf behind you. Somewhere nearby, two frightened dogs are whimpering — <b>{D1}</b> and <b>{D2}</b> made it too.'),
      N('Beyond the palms, a volcano smoulders. At night, you hear drums.<br><br><i>Gather what you can. Build a fire. Survive.</i>'),
    ],
    objs: [
      { text: 'Chop palm trees for wood (left-click)', key: 'woodGathered', need: 10 },
      { text: 'Gather food from berry bushes or palms', key: 'foodGathered', need: 3 },
      { text: 'Quarry 3 stone from a boulder', key: 'stoneGathered', need: 3 },
      { text: 'Calm {D1} & {D2} near the wreck: feed them [E]', key: 'tamed_story', need: 2, loc: 'dogs' },
      { text: 'Light a Hearth near the wreck: Build menu [B]', key: 'built_hearth', need: 1, loc: 'camp' },
      { text: 'Build 4 walls around your camp', key: 'built_wall', need: 4, loc: 'camp' },
      { text: 'Survive your first night raid', key: 'raidsSurvived', need: 1, rel: true, hint: 'Tip: rest at the Hearth [T] to skip ahead to dusk.' },
    ],
    outro: [
      N('As the sun rises, the raiders melt back into the jungle. They wore carved masks… and they wanted your fire.'),
      N('Down the south-western beach, a thin line of smoke climbs into the morning sky. Someone else lives here. Follow the trail.'),
    ],
  },
  {
    title: 'Chapter 2 — The Kapu Warriors',
    objs: [
      { text: 'Follow the smoke to the western cove', flag: 'metMalu', npc: 'malu', loc: 'cove' },
      { text: 'Craft a Stone Spear [C]', key: 'crafted_spear', need: 1 },
      { text: 'Craft a Sling [C]', key: 'crafted_sling', need: 1 },
      { text: 'Quarry stone from boulders', key: 'stoneGathered', need: 20, rel: true },
      { text: 'Upgrade 3 walls to stone (Build mode, aim, [U])', key: 'upgraded_stone', need: 3, loc: 'camp' },
      { text: 'Build a Sling Tower', key: 'built_tower', need: 1, loc: 'camp' },
      { text: 'Survive 2 more night raids', key: 'raidsSurvived', need: 2, rel: true },
    ],
    outro: [
      N('Each night the raiders grow bolder: torchbearers that seek your weakest walls, slingers in the treeline.'),
      N('You need allies the jungle can give you, and tools the mountain can give you. Malu will know how.'),
    ],
  },
  {
    title: 'Chapter 3 — Spirits of the Forest',
    objs: [
      { text: 'Return to Malu at the cove', flag: 'malu2', npc: 'malu', loc: 'cove' },
      { text: 'Tame a Ghost Wolf: weaken it, then feed it [E]', key: 'tamed_wolf', need: 1, loc: 'den' },
      { text: 'Invent & build a Rain Catcher', key: 'built_rain', need: 1, loc: 'camp' },
      { text: 'Invent & build a Taro Garden', key: 'built_garden', need: 1, loc: 'camp' },
      { text: 'Mine obsidian on the volcano slopes (needs spear)', key: 'obsidianGathered', need: 10, loc: 'volcano' },
      { text: 'Forge an Obsidian Blade [C]', key: 'crafted_blade', need: 1 },
      { text: 'Survive 2 more raids — Lava Brutes are coming', key: 'raidsSurvived', need: 2, rel: true },
    ],
    outro: [
      N('The last brute falls at your gate. In its fist is a carving: three totems, and a burning crown above them.'),
      N('Malu was right. The chief draws his strength from the totems. It is time to end this.'),
    ],
  },
  {
    title: 'Chapter 4 — Fires of Pele',
    objs: [
      { text: 'Speak with Malu one last time', flag: 'malu3', npc: 'malu', loc: 'cove' },
      { text: 'Topple the 3 war totems in the Kapu village', key: 'totems', need: 3, loc: 'village' },
      { text: 'Climb into the crater and defeat Kaʻula, the Lava Chief', key: 'bossKilled', need: 1, loc: 'volcano' },
    ],
    outro: [
      N('Kaʻula crumbles into cooling stone. The lava in the crater darkens, hisses, and goes still.'),
      N('All across the island the masks fall. The Kapu people blink as if waking from a long, hot dream.'),
      M('The mountain is quiet, {P}. But not asleep. And the people of the north shore have suffered most of all.'),
    ],
  },
  {
    title: 'Chapter 5 — Kahakai',
    intro: [
      N('With Kaʻula gone, the drums are silent. For the first time, the island feels big, and open.'),
      M('Before you think of home, {P}: the people of Kahakai, on the north shore, need help. The raids took their food and burned their canoes.'),
      M('Take the trail past the spring and around the west side of the mountain. Take {D1} and {D2} with you.'),
    ],
    objs: [
      { text: 'Follow the trail north to Kahakai, the fishing village', reach: 'fishing', r: 30, flag: 'reachedFishing', loc: 'fishing' },
      { text: 'Talk to Aunty Lehua', npc: 'lehua', flag: 'lehua1', loc: 'npc:lehua' },
      { text: 'Bring Lehua 15 food', give: { food: 15 }, npc: 'lehua', flag: 'gaveFood', loc: 'npc:lehua' },
      { text: 'Chase the wild boars out of the taro fields', key: 'killed_boar', need: 3, rel: true, loc: 'fields', start: 'fieldBoars' },
      { text: 'Talk to Kimo the canoe builder', npc: 'kimo', flag: 'kimo1', loc: 'npc:kimo' },
      { text: 'Bring Kimo 40 wood, 20 fiber and 10 stone for a voyaging canoe', give: { wood: 40, fiber: 20, stone: 10 }, npc: 'kimo', flag: 'canoeBuilt', loc: 'npc:kimo', hint: 'Tip: the koa forests of the eastern highlands have plenty of wood.' },
    ],
    outro: [
      N('Kimo and his cousins work through the night. By morning a voyaging canoe rests in the shed, its hull rubbed smooth with kukui oil.'),
      KIMO('She is fast, {P}. Fast enough to take you home. But Lehua wants a word first. The ground still shakes at night.'),
    ],
  },
  {
    title: 'Chapter 6 — The Last Ember',
    intro: [
      LEHUA('Kaʻula stole fire from the mountain. Fire taken is fire owed. Until it goes home, the ground will keep shaking.'),
      LEHUA('North-east of here a sandbar runs out to Moku Iki, the little island. Our grandparents built a ring of stones there. Go and see it.'),
    ],
    objs: [
      { text: 'Walk the sandbar to Moku Iki, the little island', reach: 'islet', r: 22, flag: 'reachedIslet', loc: 'islet' },
      { text: 'Examine the stone ring on Moku Iki', flag: 'shrineFound', loc: 'shrine' },
      { text: "Find 3 embers: in the water, in the black sand, at the fire's lip", key: 'embers', need: 3, loc: 'ember', start: 'embers',
        hint: "The embers: one in the water (Highland Falls), one in the black sand (south-east beach), one at the fire's lip (the crater rim)." },
      { text: 'Place the embers in the stone ring', flag: 'shrineLit', loc: 'shrine' },
      { text: 'Survive the night of the ash spirits', key: 'raidsSurvived', need: 1, rel: true, hint: 'Ash spirits will come for your Hearth tonight. Rest at your Hearth [T] to bring the night sooner.' },
      { text: 'Return to Malu at the cove', flag: 'malu4', npc: 'malu', loc: 'cove' },
    ],
    outro: [
      N('At dawn a thin plume of steam rises from Moku Iki. Deep below, the mountain sighs and settles into sleep.'),
      M('You gave back what was taken, {P}. Pele is at peace, and so are we.'),
      M("Kimo's canoe is ready. Sail home with {D1} and {D2}… or stay a while. There will always be a place at our fire."),
      N('<b>The island is healed.</b> You can sail home… or stay a while longer, on island time.'),
    ],
  },
];

// What each story NPC says when an objective with that flag is active.
const TALK = {
  metMalu: [
    M('Aloha, {P}. I saw your ship break on the reef. You and your dogs are lucky the sea gave you back.'),
    M('I am Malu. Long ago I was keeper of the old ways on this island, before <b>Kaʻula</b> climbed the mountain and drank its fire.'),
    M('He carved three <b>war totems</b> and bound the Kapu warriors to his will. Now they serve the flame. Every night they hunt any fire that is not his.'),
    M('Your hearth called to them. They will come again, every night, more of them and more cunning.'),
    M('Wood will not hold them for long. Take stone from the boulders. Make a spear, and a sling. Build a tower so you can see them coming.'),
  ],
  malu2: [
    M('You still live, {P}! Good. The warriors fear you a little now.'),
    M('In the western forest live the <b>ghost wolves</b>. They are fierce, but they remember the old ways. Beat one until it submits, then show mercy: feed it. It will guard you with its life.'),
    M('Your people are clever. <b>Invent</b> ways to live: catch the rain, grow taro in a garden, trap fish at the shore. A full belly fights better.'),
    M('And go to the mountain. Its black glass, <b>obsidian</b>, cuts what wood cannot. You will need a stone spear to break it loose.'),
  ],
  malu3: [
    M('So. You are ready.'),
    M('The three totems stand in the Kapu village, far to the east. While they stand, Kaʻula cannot be harmed. Topple them.'),
    M('Then climb into the crater. He will throw fire and call his warriors from the ash. Watch for the red ring when he slams the earth, and step out of it.'),
    M("Go with {D1} and {D2}. Go with Pele's blessing, not her anger."),
  ],
  lehua1: [
    LEHUA('A stranger walking in from the south? You must be the one who toppled Kaʻula. Aloha, {P}. I am Lehua.'),
    LEHUA('The raids took everything. Our storehouses are empty and the keiki are hungry.'),
    LEHUA('If you can spare <b>15 food</b>, we will remember it for a long time.'),
  ],
  gaveFood: [LEHUA('Mahalo, {P}. Mahalo nui.'), LEHUA('Now if only the wild boars would stay out of our taro fields, just south of the village. They dig up everything.')],
  kimo1: [
    KIMO('Lehua says you need a way home. I build canoes. Or I did, before the raiders burned them.'),
    KIMO('A voyaging canoe needs <b>40 wood, 20 fiber and 10 stone</b> for the anchors and tools. Bring them and I will build her for you.'),
  ],
  canoeBuilt: [KIMO('This is good koa. Give us one night.')],
  malu4: [M('I felt it, {P}. The whole island let out its breath.')],
};
const NEED = { gaveFood: 'Lehua needs 15 food.', canoeBuilt: 'Kimo needs 40 wood, 20 fiber and 10 stone.' };
const MALU_IDLE = [
  'The drums are louder each night. Keep your walls strong and your hearth lit.',
  'Rest by your hearth [T] when your walls are ready, and the night will come sooner.',
  'Animals at your side can guard your base [P] while you gather.',
  'Upgrade your walls: stone, then obsidian. The torchbearers look for the weakest one.',
  "My grandfather carved a stone near the spring. He was always pointing at the mountain's west side. I never learned why.",
  'The trails are old, {P}. Walk them and you will move faster than through the bush.',
];

export function initStory() {
  const x = LOC.cove.x - 1, z = LOC.cove.z;
  spawnNPC('malu', 'Malu', x, z, { skin: 0x9a6a4a, top: 0x9a6a4a, bottom: 0x2f6f4f, hair: 0xeeeeee, beard: 0xeeeeee, necklace: 0xf4d27a },
    { face: Math.atan2(-LOC.cove.x, -LOC.cove.z), idle: MALU_IDLE });
  G.malu = NPCS.malu;
  registerTalk(storyTalk);
  // the voyaging canoe (appears when Kimo finishes it)
  G.canoe = makeCanoe(8.5);
  G.canoe.position.set(LOC.canoe.x, heightAt(LOC.canoe.x, LOC.canoe.z) + 0.05, LOC.canoe.z);
  G.canoe.rotation.y = Math.atan2(Math.cos(-1.62), Math.sin(-1.62));
  G.canoe.visible = false;
  G.scene.add(G.canoe);
  // embers for chapter 6: one in the cave behind the falls, one on the black sand, one at the crater rim
  const emberLook = () => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), new THREE.MeshStandardMaterial({ color: 0xff7a20, emissive: 0xff5a10, emissiveIntensity: 2.2 }));
    m.position.y = 0.45; g.add(m);
    g.add(mesh(merge([part(new THREE.CylinderGeometry(0.45, 0.55, 0.25, 8), 0x3a3330, { pos: [0, 0.12, 0] })])));
    return g;
  };
  addCaveItem('falls', 'ember_falls', Math.PI - 0.6, 0.5, 'Take the glowing ember', emberLook, () => { count('embers'); toast(`Ember found: in the water (${G.counters.embers}/3)`, 'good'); }, { ember: true });
  G.embers = [];
  const bs = { x: LOC.blackSand.x - Math.cos(LOC.blackSand.a) * 4, z: LOC.blackSand.z - Math.sin(LOC.blackSand.a) * 4 };
  for (const [id, p, name] of [['ember_sand', bs, 'in the black sand'], ['ember_rim', LOC.rim, "at the fire's lip"]]) {
    const m = emberLook(); m.position.set(p.x, heightAt(p.x, p.z), p.z); G.scene.add(m);
    G.embers.push({ id, x: p.x, z: p.z, mesh: m, name });
  }
  // the shrine's ember glow, lit near the end
  G.shrineGlow = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), new THREE.MeshStandardMaterial({ color: 0xff7a20, emissive: 0xff5a10, emissiveIntensity: 2.5 }));
  G.shrineGlow.position.set(LOC.shrine.x, G.shrineY + 0.2, LOC.shrine.z);
  G.shrineGlow.visible = false;
  G.scene.add(G.shrineGlow);
}

function storyTalk(id) {
  const o = currentObj();
  if (!o || o.npc !== id) return false;
  const f = o.flag;
  if (o.give) {
    if (!hasRes(o.give)) { showDialogue([{ who: NPCS[id].name, text: NEED[f] || `I need ${costStr(o.give)}.` }]); return true; }
    showDialogue(TALK[f] || [N('...')], () => { if (hasRes(o.give) && !G.flags[f]) { payRes(o.give); G.flags[f] = true; } });
    return true;
  }
  showDialogue(TALK[f] || [N('...')], () => { G.flags[f] = true; });
  return true;
}

// Story interactions that are not people: embers and the stone ring.
export function storyInteracts(consider) {
  const o = currentObj();
  if (G.emberActive) for (const e of G.embers) {
    if (G.flags['item_' + e.id]) continue;
    consider(e.x, e.z, 'Take the glowing ember', () => { G.flags['item_' + e.id] = true; e.mesh.visible = false; count('embers'); sfx('craft'); toast(`Ember found: ${e.name} (${G.counters.embers}/3)`, 'good'); }, 3);
  }
  if (o && o.flag === 'shrineFound') consider(LOC.shrine.x, LOC.shrine.z, 'Examine the stone ring', () => showDialogue([
    N('A ring of standing stones around a stone basin. The basin is black with old soot, and three small hollows are worn into its rim.'),
    N('Carved on the largest stone: three flames, a mountain, and a wave. Somebody has left fresh flowers here.'),
  ], () => { G.flags.shrineFound = true; }), 5);
  if (o && o.flag === 'shrineLit') consider(LOC.shrine.x, LOC.shrine.z, 'Place the 3 embers in the stone basin', () => {
    G.flags.shrineLit = true; G.shrineGlow.visible = true; sfx('victory');
    burst(new THREE.Vector3(LOC.shrine.x, G.shrineY + 1, LOC.shrine.z), 0xff8a30, 40, 6, 0.15, 2);
    showDialogue([N('The embers flare as they touch the stone, then sink into it like coals into sand. The ground trembles, hard.'),
      N("Out on the slopes, ash lifts into the air and takes shape. The mountain's last anger is coming for your hearth tonight.")]);
  }, 5);
}

export function currentObj() {
  const ch = CHAPTERS[G.story.ch];
  if (!ch || G.story.done) return null;
  return ch.objs[G.story.obj];
}
function valueOf(o) {
  if (o.flag) return G.flags[o.flag] ? 1 : 0;
  const v = G.counters[o.key] || 0;
  return o.rel ? v - G.story.start : v;
}
export function locOf(o) {
  if (!o || !o.loc) return null;
  if (o.loc === 'dogs') { const d = G.animals.find((a) => a.story && !a.tamed); return d ? { x: d.pos.x, z: d.pos.z } : LOC.wreck; }
  if (o.loc === 'camp') return G.hearth ? { x: G.hearth.x, z: G.hearth.z } : LOC.camp;
  if (o.loc === 'volcano') return { x: VOLC.x, z: VOLC.z };
  if (o.loc.startsWith('npc:')) { const n = NPCS[o.loc.slice(4)]; return n ? { x: n.pos.x, z: n.pos.z } : null; }
  if (o.loc === 'ember') {
    // the general area of the nearest ember still out there (never the hidden cave itself)
    const left = [];
    if (!G.flags.item_ember_falls) left.push(LOC.falls);
    for (const e of G.embers) if (!G.flags['item_' + e.id]) left.push(e);
    const P = G.player.pos;
    left.sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z));
    return left[0] || LOC.shrine;
  }
  return LOC[o.loc];
}

export function startChapter(i, showIntro = true) {
  G.story.ch = i; G.story.obj = 0;
  if (i >= 4) G.flags.seenCh5 = true;
  activateObj();
  const ch = CHAPTERS[i];
  toast(ch.title, 'chapter', null, 5);
  if (showIntro && ch.intro) showDialogue(ch.intro);
}
function activateObj() {
  const o = currentObj();
  if (o && o.rel) G.story.start = G.counters[o.key] || 0;
  resumeObj(true);
}
// Side effects that must hold while an objective is active (re-applied after loading a save).
export function resumeObj(fresh = false) {
  const o = currentObj();
  const ch6 = G.story.ch === 5 && !G.story.done;
  G.emberActive = ch6 && G.story.obj === 2;
  for (const e of G.embers || []) e.mesh.visible = !G.flags['item_' + e.id] && !(ch6 && G.story.obj > 2) && !G.story.done;
  G.canoe.visible = !!G.flags.canoeBuilt;
  G.shrineGlow.visible = !!G.flags.shrineLit;
  if (!o) return;
  if (o.start === 'fieldBoars' && (fresh || !G.animals.some((a) => a.fieldBoar && a.alive))) spawnFieldBoars(3);
}

let checkT = 0;
export function updateStory(dt) {
  const ch = CHAPTERS[G.story.ch];
  const o = currentObj();
  // boss encounter
  if (o && o.key === 'bossKilled') {
    const d = Math.hypot(G.player.pos.x - VOLC.x, G.player.pos.z - VOLC.z);
    if (!G.boss && d < 30 && G.player.alive && (G.counters.totems || 0) >= 3) spawnBoss();
    if (G.boss && (d > 70 || !G.player.alive)) {
      const b = G.boss; b.remove(); G.enemies = G.enemies.filter((e) => e !== b); G.boss = null; setBossBar(null);
      toast('Kaʻula returns to the fire to wait for you.', 'info');
    }
  }
  if (o && o.reach && !G.flags[o.flag]) {
    const L = LOC[o.reach];
    if (Math.hypot(G.player.pos.x - L.x, G.player.pos.z - L.z) < o.r) G.flags[o.flag] = true;
  }
  checkT -= dt;
  if (checkT > 0) return;
  checkT = 0.25;
  if (!ch) return;
  const lines = [];
  ch.objs.forEach((ob, i) => {
    const line = { text: ob.text, done: i < G.story.obj || G.story.done, active: i === G.story.obj && !G.story.done };
    if (line.active && ob.need > 1) line.prog = `${Math.min(ob.need, Math.max(0, valueOf(ob)))}/${ob.need}`;
    if (line.active) {
      const L = locOf(ob);
      G.objTarget = L;
      if (L) { const dd = Math.hypot(L.x - G.player.pos.x, L.z - G.player.pos.z); if (dd > 12) line.dist = `${Math.round(dd)}m`; }
      if (ob.hint && !G.flags['hint_' + G.story.ch + '_' + i]) { G.flags['hint_' + G.story.ch + '_' + i] = 1; toast(fmt(ob.hint), 'info', null, 7); }
    }
    lines.push(line);
  });
  if (!o) G.objTarget = null;
  setObjective(ch.title, lines);
  if (!o || G.mode === 'dialogue') return;
  if (valueOf(o) >= (o.need || 1)) {
    sfx('craft');
    toast('✔ ' + fmt(o.text), 'good');
    G.story.obj++;
    if (G.story.obj >= ch.objs.length) {
      // chapter complete
      const next = G.story.ch + 1;
      G.onAutosave && G.onAutosave();
      showDialogue(ch.outro || [N('Chapter complete.')], () => {
        if (next < CHAPTERS.length) startChapter(next, true);
        else { G.story.done = true; resumeObj(); G.onVictory && G.onVictory(); }
      });
    } else activateObj();
  }
}
