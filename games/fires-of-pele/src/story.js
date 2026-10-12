// Story: chapters, objectives, the hermit Malu, and the ending.
import * as THREE from 'three';
import { G, count } from './state.js';
import { LOC, heightAt, VOLC } from './world.js';
import { makeHumanoid, animHumanoid } from './models.js';
import { addStatic } from './physics.js';
import { toast, setObjective, showDialogue, setBossBar, showScreen } from './ui.js';
import { sfx } from './fx.js';
import { spawnBoss } from './enemies.js';
import { makeLabel } from './util.js';

const N = (t) => ({ who: '', text: t });
const M = (t) => ({ who: 'Kupuna Malu', text: t });

export const CHAPTERS = [
  {
    title: 'Chapter 1 — Washed Ashore',
    intro: [
      N('The storm came out of nowhere. One moment the <i>Pualena</i> was running before the wind; the next, the reef tore her open.'),
      N('You wake on warm sand. The wreck groans in the surf behind you. Somewhere nearby, two frightened dogs are whimpering — <b>Tippy</b> and <b>Izzy</b> made it too.'),
      N('Beyond the palms, a volcano smoulders. At night, you hear drums.<br><br><i>Gather what you can. Build a fire. Survive.</i>'),
    ],
    objs: [
      { text: 'Chop palm trees for wood (left-click)', key: 'woodGathered', need: 10 },
      { text: 'Gather food from berry bushes or palms', key: 'foodGathered', need: 3 },
      { text: 'Quarry 3 stone from a boulder', key: 'stoneGathered', need: 3 },
      { text: 'Calm Tippy & Izzy near the wreck: feed them [E]', key: 'tamed_story', need: 2, loc: 'dogs' },
      { text: 'Light a Hearth near the wreck: Build menu [B]', key: 'built_hearth', need: 1, loc: 'camp' },
      { text: 'Build 4 walls around your camp', key: 'built_wall', need: 4, loc: 'camp' },
      { text: 'Survive your first night raid', key: 'raidsSurvived', need: 1, rel: true, hint: 'Tip: rest at the Hearth [T] to skip ahead to dusk.' },
    ],
    outro: [
      N('As the sun rises, the raiders melt back into the jungle. They wore carved masks… and they wanted your fire.'),
      N('Down the western beach, a thin line of smoke climbs into the morning sky. Someone else lives here.'),
    ],
  },
  {
    title: 'Chapter 2 — The Kapu Warriors',
    objs: [
      { text: 'Follow the smoke to the western cove', flag: 'metMalu', loc: 'cove' },
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
      { text: 'Return to Malu at the cove', flag: 'malu2', loc: 'cove' },
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
      { text: 'Speak with Malu one last time', flag: 'malu3', loc: 'cove' },
      { text: 'Topple the 3 war totems in the Kapu village', key: 'totems', need: 3, loc: 'village' },
      { text: 'Climb into the crater and defeat Kaʻula, the Lava Chief', key: 'bossKilled', need: 1, loc: 'volcano' },
    ],
    outro: [
      N('Kaʻula crumbles into cooling stone. The lava in the crater darkens, hisses, and goes still.'),
      N('All across the island the masks fall. The Kapu people blink as if waking from a long, hot dream.'),
      { who: 'Kupuna Malu', text: 'The mountain is quiet again. The people will help you mend the <i>Pualena</i>, castaway — but there will always be a place at our fire for you, and for Tippy and Izzy.' },
      N('<b>The curse is lifted.</b> You can sail home… or stay a while longer, on island time.'),
    ],
  },
];

const MALU_TALK = {
  metMalu: [
    M('Aloha, castaway. I saw your ship break on the reef. You and your dogs are lucky the sea gave you back.'),
    M('I am Malu. Long ago I was keeper of the old ways on this island, before <b>Kaʻula</b> climbed the mountain and drank its fire.'),
    M('He carved three <b>war totems</b> and bound the Kapu warriors to his will. Now they serve the flame. Every night they hunt any fire that is not his.'),
    M('Your hearth called to them. They will come again, every night, more of them and more cunning.'),
    M('Wood will not hold them for long. Take stone from the boulders. Make a spear, and a sling. Build a tower so you can see them coming.'),
  ],
  malu2: [
    M('You still live! Good. The warriors fear you a little now.'),
    M('In the western forest live the <b>ghost wolves</b>. They are fierce, but they remember the old ways. Beat one until it submits, then show mercy: feed it. It will guard you with its life.'),
    M('Your people are clever. <b>Invent</b> ways to live: catch the rain, grow taro in a garden, trap fish at the shore. A full belly fights better.'),
    M('And go to the mountain. Its black glass, <b>obsidian</b>, cuts what wood cannot. You will need a stone spear to break it loose.'),
  ],
  malu3: [
    M('So. You are ready.'),
    M('The three totems stand in the Kapu village, east of here. While they stand, Kaʻula cannot be harmed. Topple them.'),
    M('Then climb into the crater. He will throw fire and call his warriors from the ash. Watch for the red ring when he slams the earth, and step out of it.'),
    M('Go with your animals. Go with Pele\'s blessing, not her anger.'),
  ],
};
const MALU_IDLE = [
  M('The drums are louder each night. Keep your walls strong and your hearth lit.'),
  M('Rest by your hearth [T] when your walls are ready, and the night will come sooner.'),
  M('Animals at your side can guard your base [P] while you gather.'),
  M('Upgrade your walls: stone, then obsidian. The torchbearers look for the weakest one.'),
];

let malu = null;
export function initStory() {
  const h = makeHumanoid({ skin: 0x9a6a4a, top: 0x9a6a4a, bottom: 0x2f6f4f, hair: 0xeeeeee, beard: 0xeeeeee, necklace: 0xf4d27a });
  const x = LOC.cove.x - 1, z = LOC.cove.z;
  h.g.position.set(x, heightAt(x, z), z);
  h.g.rotation.y = Math.atan2(-LOC.cove.x, -LOC.cove.z);
  G.scene.add(h.g);
  const lbl = makeLabel('Malu', '#c8ffe0'); lbl.position.y = 2.6; lbl.scale.set(1.4, 0.35, 1); h.g.add(lbl);
  addStatic({ x, z, r: 0.5 });
  malu = { h, pos: h.g.position, phase: 0 };
  G.malu = malu;
}

export function talkToMalu() {
  const obj = currentObj();
  if (obj && obj.flag && MALU_TALK[obj.flag]) {
    const f = obj.flag;
    showDialogue(MALU_TALK[f], () => { G.flags[f] = true; });
  } else {
    showDialogue([MALU_IDLE[Math.floor(Math.random() * MALU_IDLE.length)]]);
  }
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
function locOf(o) {
  if (!o.loc) return null;
  if (o.loc === 'dogs') { const d = G.animals.find((a) => a.story && !a.tamed); return d ? { x: d.pos.x, z: d.pos.z } : LOC.wreck; }
  if (o.loc === 'camp') return G.hearth ? { x: G.hearth.x, z: G.hearth.z } : LOC.camp;
  if (o.loc === 'volcano') return { x: VOLC.x, z: VOLC.z };
  return LOC[o.loc];
}

export function startChapter(i, showIntro = true) {
  G.story.ch = i; G.story.obj = 0;
  activateObj();
  const ch = CHAPTERS[i];
  toast(ch.title, 'chapter', null, 5);
  if (showIntro && ch.intro) showDialogue(ch.intro);
}
function activateObj() {
  const o = currentObj();
  if (o && o.rel) G.story.start = G.counters[o.key] || 0;
}

let checkT = 0;
export function updateStory(dt) {
  if (malu) {
    malu.phase += dt;
    animHumanoid(malu.h, 0, 0);
    malu.h.head.rotation.y = Math.sin(malu.phase * 0.5) * 0.4;
  }
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
      if (ob.hint && !G.flags['hint_' + G.story.ch + '_' + i]) { G.flags['hint_' + G.story.ch + '_' + i] = 1; toast(ob.hint, 'info', null, 6); }
    }
    lines.push(line);
  });
  if (!o) G.objTarget = null;
  setObjective(ch.title, lines);
  if (!o || G.mode === 'dialogue') return;
  if (valueOf(o) >= (o.need || 1)) {
    sfx('craft');
    toast('✔ ' + o.text, 'good');
    G.story.obj++;
    if (G.story.obj >= ch.objs.length) {
      // chapter complete
      const next = G.story.ch + 1;
      G.onAutosave && G.onAutosave();
      showDialogue(ch.outro || [N('Chapter complete.')], () => {
        if (next < CHAPTERS.length) startChapter(next, true);
        else { G.story.done = true; G.onVictory && G.onVictory(); }
      });
    } else activateObj();
  }
}
