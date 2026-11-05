// Side quests, the people of Kahakai / the falls / the black sand, and the quest log [J].
import { G, hasRes, payRes, costStr, fmt, escHtml } from './state.js';
import { LOC, CAVES } from './world.js';
import { spawnNPC, registerTalk, NPCS } from './npcs.js';
import { showDialogue, toast } from './ui.js';
import { sfx } from './fx.js';
import { CHAPTERS, currentObj } from './story.js';
import { cavesFound } from './caves.js';

const say = (who) => (t) => ({ who, text: t });
const NALU = say('Nalu'), PUA = say('Pua'), HINA = say('Hina'), KALEO = say('Old Kaleo'), MAKOA = say('Makoa'), KEOLA = say('Keola');

// Each quest: giver, steps, reward. Step kinds: give (bring items to the giver), find (talk to someone),
// escort (bring someone to the giver), visit (walk to places), count (a counter reaches a number).
export const SIDE = [
  {
    id: 'nets', npc: 'nalu', title: 'Nets for Kahakai', reward: 'Nalu shares his catch: 8 food and 4 water.',
    offer: [NALU('Aloha! The raiders cut up every net we had. Fish are jumping in the bay and I cannot catch one.'), NALU('Bring me <b>12 fiber</b> from the flax plants and I will share the first catch with you.')],
    steps: [{ text: 'Bring Nalu 12 fiber', give: { fiber: 12 } }],
    done: [NALU('Mahalo! Good strong fiber. Here, take some of the catch.')],
    grant: () => { G.inv.food += 8; G.inv.water += 4; },
  },
  {
    id: 'carver', npc: 'pua', title: 'Black Glass', reward: 'Pua carves you a guardian charm: max health +20.',
    offer: [PUA('You have the look of someone who goes up the mountain. I carve charms from obsidian.'), PUA('Bring me <b>6 obsidian</b> and I will carve one for you. It will keep you on your feet.')],
    steps: [{ text: 'Bring Pua 6 obsidian (the black-sand beach)', give: { obsidian: 6 } }],
    done: [PUA('Beautiful glass. Wear this, and the island will know you.')],
    grant: () => { G.flags.charm = true; G.player.maxHp = 100 + (G.flags.pearl ? 25 : 0) + 20; G.player.hp += 20; },
  },
  {
    id: 'keiki', npc: 'hina', title: 'The Lost Keiki', reward: 'Hina gives you 4 bandages and 6 food.',
    offer: [HINA('Please, have you seen my boy, Keola? He went to look at the glowing rocks in the lava fields and he has not come back.'), HINA('The lava fields are south of here, near the black sand. Please bring him home.')],
    steps: [{ text: 'Find Keola in the lava fields', find: 'keola' }, { text: 'Bring Keola home to Hina at the Highland Falls', escort: 'keola' }],
    done: [HINA('Keola! Oh, you foolish, brave boy.'), HINA('Mahalo, {P}. Take these. You will need them more than we do.')],
    grant: () => { G.inv.bandage += 4; G.inv.food += 6; NPCS.keola.follow = false; },
  },
  {
    id: 'lookouts', npc: 'makoa', title: 'Three Lookouts', reward: 'Makoa gives you swift sandals: you move 10% faster.',
    offer: [MAKOA('I am training to be a lookout. My teacher says a lookout must know the three high places.'), MAKOA('Visit the stone cairns on the <b>crater rim</b>, the <b>highland peak</b>, and the top of <b>Moku Iki</b>, the little island. Then tell me what you saw.')],
    steps: [{ text: 'Visit the cairns: crater rim, highland peak, Moku Iki', visit: ['look_rim', 'look_highPeak', 'look_islet'] }],
    done: [MAKOA('You went to all three? Then you have earned these. My sandals are the fastest on the island.')],
    grant: () => { G.flags.swift = true; },
  },
  {
    id: 'caves', npc: 'kaleo', title: "Old Kaleo's Tales", reward: 'Kaleo gives you 15 obsidian and 15 stone.',
    offer: [KALEO('Sit, sit. When I was young, there were three hidden caves on this island. People forgot them, but I did not.'),
      KALEO('One is in the mountain, where fire once ran underground. One is in the sea cliffs to the east, where only a thin ledge leads. And one is where the water falls.'),
      KALEO('Find all three and come tell me. Look for bats at dusk, and feel for cold air. Caves breathe.')],
    steps: [{ text: 'Find the 3 hidden caves', count: 'cavesFound', need: 3 }],
    done: [KALEO('All three! Then the old stories live a little longer. Take these, from my own store.')],
    grant: () => { G.inv.obsidian += 15; G.inv.stone += 15; },
  },
];

const IDLE = {
  lehua: ['Kahakai means the seashore. We have always lived by the sea.', 'Mahalo for everything, {P}.'],
  kimo: ['A good canoe is made of patience, more than wood.', 'Koa trees grow tall up in the eastern highlands.'],
  nalu: ['Fishermen say there is a cave in the eastern sea cliffs. The sea hides it. Only a thin rock ledge leads there.', 'The bay is full of fish again.'],
  pua: ['Long ago, lava ran down the west side of the mountain in tubes under the ground. Some of the tubes are still open.', 'The black sand is old lava, ground fine by the sea.'],
  hina: ['When I was a girl, we used to dare each other to walk behind the falls.', 'The water here is the sweetest on the island.'],
  makoa: ['From the crater rim you can see the whole island, even Moku Iki.', 'At dusk, watch where the bats fly. They always go home to the same place.'],
  kaleo: ['Caves breathe, {P}. Cold air on a warm day means a hole in the ground.', 'Kaʻula was a fisherman once, did you know? Before the fire got into him.'],
  keola: ['I only wanted to see the glowing rocks!'],
};

export function initQuests() {
  const F = LOC.fishing, sea = { x: Math.cos(-1.62), z: Math.sin(-1.62) }, side = { x: -sea.z, z: sea.x };
  const at = (t, s) => ({ x: F.x + side.x * t + sea.x * s, z: F.z + side.z * t + sea.z * s });
  const face = Math.atan2(-sea.x, -sea.z) + Math.PI;
  const mk = (id, name, p, look, f = face) => spawnNPC(id, name, p.x, p.z, look, { face: f, idle: IDLE[id] || [] });
  mk('lehua', 'Aunty Lehua', at(3, 2), { skin: 0x9a6a4a, top: 0xc04a6a, bottom: 0xc04a6a, hair: 0x9a9a9a, necklace: 0xf4d27a });
  mk('kimo', 'Kimo', { x: LOC.canoe.x + side.x * 4, z: LOC.canoe.z + side.z * 4 }, { skin: 0x8a5a3a, top: 0x8a5a3a, bottom: 0x2f4f7f, hair: 0x1a1a1a, beard: 0x1a1a1a });
  mk('nalu', 'Nalu', at(-18, 6), { skin: 0x9a6a4a, top: 0x3a8ab0, bottom: 0xd8c08a, hair: 0x2a1a10 });
  mk('makoa', 'Makoa', at(10, -14), { skin: 0xa8784a, top: 0xd8a040, bottom: 0x5a3a24, hair: 0x2a1a10, scale: 0.92 });
  mk('kaleo', 'Old Kaleo', at(-6, -6), { skin: 0x8a5a3a, top: 0x8a5a3a, bottom: 0x6a5a3a, hair: 0xeeeeee, beard: 0xeeeeee });
  const bs = LOC.blackSand;
  mk('pua', 'Pua', { x: bs.x - Math.cos(bs.a) * 10, z: bs.z - Math.sin(bs.a) * 10 }, { skin: 0x9a6a4a, top: 0x6a3a8a, bottom: 0x2a2a2a, hair: 0x1a1a1a, necklace: 0x222222 }, bs.a);
  const fd = LOC.fallsDir;
  mk('hina', 'Hina', { x: LOC.falls.x + fd.x * 9 + fd.z * 5, z: LOC.falls.z + fd.z * 9 - fd.x * 5 }, { skin: 0xa8784a, top: 0x3a9a6a, bottom: 0x3a9a6a, hair: 0x2a1a10 }, Math.atan2(-fd.x, -fd.z));
  const lf = LOC.lavaField;
  spawnNPC('keola', 'Keola', lf.x + 30, lf.z + 12, { skin: 0xa8784a, top: 0xe0c060, bottom: 0x5a3a24, hair: 0x2a1a10, scale: 0.68 }, { idle: IDLE.keola, noStatic: false });
  registerTalk(questTalk);
}

export const quest = (id) => SIDE.find((q) => q.id === id);
const state = (id) => G.quests[id];

function stepDone(q, st) {
  const s = q.steps[st.step];
  if (!s) return true;
  if (s.visit) return s.visit.every((k) => G.flags['visit_' + k]);
  if (s.count) return (G.counters[s.count] || 0) >= s.need;
  return false;
}
function finish(q) {
  const st = state(q.id);
  st.s = 'done';
  q.grant();
  sfx('victory');
  showDialogue(q.done.concat([{ who: '', text: `<b>Quest complete: ${q.title}.</b> ${q.reward}` }]));
  G.onAutosave && G.onAutosave();
}

function questTalk(id) {
  // a step that needs someone else (find Keola)
  for (const q of SIDE) {
    const st = state(q.id);
    if (!st || st.s !== 'active') continue;
    const s = q.steps[st.step];
    if (s.find === id) {
      showDialogue([KEOLA('You know my mother? I got lost. The rocks all look the same here.'), KEOLA('Will you take me home? I will stay close, I promise.')], () => {
        NPCS[id].follow = true; st.step++;
        toast('Keola is following you. Bring him to Hina at the Highland Falls.', 'info', null, 5);
      });
      return true;
    }
  }
  const q = SIDE.find((x) => x.npc === id);
  if (!q) return false;
  // story comes first if this NPC is part of the current main objective
  const o = currentObj();
  if (o && o.npc === id) return false;
  const st = state(q.id);
  if (!st) {
    showDialogue(q.offer, () => { G.quests[q.id] = { s: 'active', step: 0 }; sfx('pickup'); toast(`New quest: ${q.title} [J]`, 'good', null, 4); });
    return true;
  }
  if (st.s === 'done') return false;            // idle chatter
  const s = q.steps[st.step];
  if (s.give) {
    if (!hasRes(s.give)) { showDialogue([{ who: NPCS[id].name, text: `Still looking for ${costStr(s.give)}?` }]); return true; }
    payRes(s.give); st.step++;
  } else if (s.escort) {
    const k = NPCS[s.escort];
    if (!(k.follow && Math.hypot(k.pos.x - NPCS[id].pos.x, k.pos.z - NPCS[id].pos.z) < 12)) { showDialogue([{ who: NPCS[id].name, text: 'Please, find Keola. He went toward the lava fields.' }]); return true; }
    st.step++;
  } else if (!stepDone(q, st)) {
    showDialogue([{ who: NPCS[id].name, text: s.count ? `How goes the search? (${G.counters[s.count] || 0}/${s.need})` : 'Not done yet? Take your time.' }]);
    return true;
  } else st.step++;
  if (st.step >= q.steps.length) finish(q);
  return true;
}

// per-frame: lookouts visited, escort arrival, quest markers for the minimap, "!" over quest givers
let qT = 0;
export function updateQuests(dt) {
  qT -= dt; if (qT > 0) return; qT = 0.25;
  const P = G.player.pos;
  const marks = [];
  for (const q of SIDE) {
    const st = state(q.id);
    const giver = NPCS[q.npc];
    giver.mark.visible = !st;
    if (!st) continue;
    if (st.s !== 'active') continue;
    const s = q.steps[st.step];
    if (!s) continue;
    if (s.visit) {
      for (const k of s.visit) {
        const L = LOC[k];
        if (!G.flags['visit_' + k] && Math.hypot(P.x - L.x, P.z - L.z) < 6) { G.flags['visit_' + k] = true; toast(`Lookout reached (${s.visit.filter((v) => G.flags['visit_' + v]).length}/3)`, 'good'); sfx('pickup'); }
        if (!G.flags['visit_' + k]) marks.push({ x: L.x, z: L.z });
      }
      if (stepDone(q, st)) marks.push({ x: giver.pos.x, z: giver.pos.z });
    } else if (s.find) marks.push({ x: NPCS[s.find].pos.x, z: NPCS[s.find].pos.z });
    else if (s.count === 'cavesFound') { if (stepDone(q, st)) marks.push({ x: giver.pos.x, z: giver.pos.z }); }   // hidden caves get no markers
    else if (s.give && !hasRes(s.give)) { /* no marker until you have the items */ }
    else marks.push({ x: giver.pos.x, z: giver.pos.z });
  }
  G.questTargets = marks;
  G.questGivers = SIDE.filter((q) => !state(q.id)).map((q) => ({ x: NPCS[q.npc].pos.x, z: NPCS[q.npc].pos.z }));
}

// ---------- quest log ----------
export function renderQuestLog() {
  const ch = CHAPTERS[G.story.ch];
  let h = `<h2>Quest Log <small>${escHtml(G.names.player)} · Day ${G.day}</small></h2>`;
  h += '<div class="qsec"><h3>Main story</h3>';
  if (G.story.done) h += '<p>✔ The island is healed. Endless mode: the raids go on for those who stay on island time.</p>';
  else if (ch) {
    h += `<p class="qt">${fmt(ch.title)}</p>`;
    ch.objs.forEach((o, i) => { if (i <= G.story.obj) h += `<div class="qo ${i < G.story.obj ? 'done' : ''}">${i < G.story.obj ? '✔' : '➤'} ${fmt(o.text)}</div>`; });
  }
  h += '</div><div class="qsec"><h3>Side quests</h3>';
  const act = SIDE.filter((q) => state(q.id)?.s === 'active'), done = SIDE.filter((q) => state(q.id)?.s === 'done');
  if (!act.length && !done.length) h += '<p class="dim">No side quests yet. Talk to people in Kahakai, at the Highland Falls and on the black-sand beach (look for <b style="color:#ffd84a">!</b>).</p>';
  for (const q of act) {
    const st = state(q.id), s = q.steps[st.step];
    let prog = '';
    if (s.visit) prog = ` (${s.visit.filter((v) => G.flags['visit_' + v]).length}/${s.visit.length})`;
    if (s.count) prog = ` (${Math.min(s.need, G.counters[s.count] || 0)}/${s.need})`;
    if (s.give) prog = ` — you have ${Object.keys(s.give).map((k) => `${G.inv[k] || 0}/${s.give[k]} ${k}`).join(', ')}`;
    h += `<div class="qq"><b>${q.title}</b> <small>from ${escHtml(NPCS[q.npc].name)}</small><div class="qo">➤ ${fmt(s.text)}${prog}</div><div class="qr">Reward: ${q.reward}</div></div>`;
  }
  for (const q of done) h += `<div class="qq done">✔ <b>${q.title}</b> <small>${q.reward}</small></div>`;
  h += `</div><div class="qsec"><h3>Caves found ${cavesFound()}/${CAVES.length}</h3>`;
  for (const c of CAVES) h += G.flags['cave_' + c.id] ? `<div class="qo done">✔ ${c.name}</div>` : '<div class="qo dim">??? — still hidden</div>';
  const lore = [G.flags.lore_petro && 'Petroglyph by the spring: fire running down the mountain\'s west side into a hole guarded by three stones.',
    G.flags.lore_map && 'Map fragment: "Where the water falls, walk through it."',
    G.flags.lore_oath && "Kaʻula's oath stone: fire taken is fire owed.", G.flags.lore_song && 'The Ember Song: three embers, one stone ring.'].filter(Boolean);
  if (lore.length) h += '<h3>Lore</h3>' + lore.map((l) => `<div class="qo">📜 ${l}</div>`).join('');
  h += '</div>';
  document.getElementById('questbody').innerHTML = h;
}
