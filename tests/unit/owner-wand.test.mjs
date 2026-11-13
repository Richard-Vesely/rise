// Hůl vlastníka serveru (server/owner-wand.js, shared/sim/hunt.js): vlastník ji má vždycky, nikdo jiný ji mít nesmí,
// nejde na zem ani do truhly; Avada Kedavra zabije tvora kdekoli a hráče jen tam, kde jsou souboje; Štvanice pošle
// tvory s rudýma očima na hráče. Kouzla ověřuje server podle profilu vlastníka. Jen server kroužku.
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ITEMS, RECIPES } from '../../shared/data/index.js';
import { OWNER_SPELLS, SPELL_IDS, cleanMagic, offerSpells, spellChoices } from '../../shared/data/magic.js';
import { NET } from '../../shared/net/net.js';
import { others } from '../../shared/net/room.js';
import { HUNT, hunts, huntPlan, startHunt, stopHunt, updateHunts } from '../../shared/sim/hunt.js';
import { mobs, spawnMob, updateMobs } from '../../shared/sim/mobs.js';
import { Vec3 } from '../../shared/vec3.js';
import { MARK_X } from '../../shared/world/terrain.js';
import { groundHeight } from '../../shared/world/voxels.js';
import { cleanMe } from '../../server/me.js';
import { createDonationBox } from '../../server/donation-box.js';
import { OWNER_WAND, createOwnerWand, fixOwnerItems, guardOwnerKV, guardOwnerOps } from '../../server/owner-wand.js';
import { createProfiles } from '../../server/profiles.js';
import { player, pose, sleep, startServer, stop } from './server-helpers.mjs';

const me = (inv = [], armor = [null, null, null, null]) => ({ inv: [...inv, ...Array(36 - inv.length).fill(null)], armor, pos: [0, 1, 0], yaw: 0, hp: 100, hunger: 100, crafted: {}, placedAny: {}, creative: false, flying: false, flyT: 0 });
const wands = (m) => [...m.inv, ...m.armor].filter((s) => s?.id === OWNER_WAND).length;

// Bez serveru: místnost s hráči (others) a tvory jako ve vlákně světa.
let sent, clock, wand;
const msgs = (pid) => sent.filter(([p]) => p === pid).map(([, m]) => m);
function addPlayer(pid, name, x, z, extra = {}) {
  others.set(pid, { pid, name, pose: { x, y: 0.45, z, alive: true, cr: 0, ...extra }, perm: true, conn: { open: true, send: (m) => sent.push([pid, m]) } });
}
beforeEach(() => {
  sent = []; clock = 100; others.clear(); mobs.length = 0; stopHunt();
  Object.assign(NET, { mode: 'host', client: false, killer: null, pvp: false, pvpMark: false, give: (pid, id, n) => sent.push([pid, ['give', id, n]]) });
  NET.sendTo = (pid, m) => sent.push([pid, m]);
  wand = createOwnerWand({ ownerId: 'boss', send: (cid, m) => sent.push([cid, m]), now: () => clock });
});

test('owner wand: a hidden item with no recipe; its spells cannot be learned', () => {
  assert.ok(ITEMS.owner_wand.wand && ITEMS.owner_wand.owner && ITEMS.owner_wand.hidden && ITEMS.owner_wand.stack === 1);
  assert.ok(!RECIPES.some((r) => r.out === OWNER_WAND), 'nobody can craft it');
  assert.deepEqual(OWNER_SPELLS.sort(), ['avada', 'hunt']);
  assert.ok(OWNER_SPELLS.every((id) => !spellChoices(50, []).includes(id)), 'never offered at a level-up');
  assert.deepEqual(offerSpells(50, SPELL_IDS.filter((id) => !OWNER_SPELLS.includes(id))), [], 'all normal spells learned = nothing more to learn');
  assert.deepEqual(cleanMagic({ xp: 0, learned: ['avada', 'bolt', 'hunt'], sel: 'avada' }).learned, ['bolt'], 'a saved state cannot learn them');
});

test('owner wand: the owner always has one (given back when missing), nobody else keeps it', () => {
  const boss = me([{ id: 'iron', n: 3 }]);
  assert.equal(fixOwnerItems(boss, true), true, 'missing: reported');
  assert.deepEqual(boss.inv[1], { id: OWNER_WAND, n: 1 }, 'put into the first free slot');
  assert.equal(fixOwnerItems(boss, true), false, 'has it: nothing to do');
  const two = me([{ id: OWNER_WAND, n: 3 }, { id: OWNER_WAND, n: 1 }], [{ id: OWNER_WAND, n: 1 }, null, null, null]);
  fixOwnerItems(two, true);
  assert.equal(wands(two), 1, 'the owner keeps exactly one');
  assert.deepEqual(two.inv[0], { id: OWNER_WAND, n: 1 });
  const kid = cleanMe(me([{ id: OWNER_WAND, n: 1 }, { id: 'apple', n: 2 }], [{ id: OWNER_WAND, n: 1 }, null, null, null]));
  assert.equal(fixOwnerItems(kid, false), false);
  assert.equal(wands(kid), 0, 'another player loses it');
  assert.deepEqual(kid.inv[1], { id: 'apple', n: 2 }, 'the rest stays');
  assert.equal(fixOwnerItems(null, true), true, 'no saved state yet: the owner needs it');

  // through the world thread: welcome, ['me'], first pose
  assert.equal(wands(wand.welcomeMe('kid', me([{ id: OWNER_WAND, n: 1 }]))), 0, 'an old save of another player loses it at welcome');
  assert.equal(wands(wand.welcomeMe('boss', me())), 1, 'the owner gets it in the welcome');
  wand.onMe('c-boss', 'boss', me());
  assert.deepEqual(msgs('c-boss'), [['give', OWNER_WAND, 1]], 'dropped it somehow: the server gives it back');
  wand.onMe('c-boss', 'boss', me());
  assert.equal(msgs('c-boss').length, 1, 'not again right away (the give is on its way)');
  clock += 25;
  const saved = wand.onMe('c-boss', 'boss', me());
  assert.equal(msgs('c-boss').length, 2, 'later again');
  assert.equal(wands(saved), 1, 'and the saved backpack has it');
  wand.onMe('c-kid', 'kid', me([{ id: OWNER_WAND, n: 1 }]));
  wand.onFirstPose('c-kid', 'kid', null);
  assert.equal(msgs('c-kid').length, 0, 'other players never get it');
  wand.onFirstPose('c-new', 'boss', null);
  assert.deepEqual(msgs('c-new'), [['give', OWNER_WAND, 1]], 'the owner joining for the first time gets it');
});

test('owner wand: never on the ground (drops, death) or in a chest, machine or car; no donating it', () => {
  const ops = [['g', 'g1', OWNER_WAND, 1, [0, 1, 0], [0, 0, 0], 0], ['g', 'g2', 'apple', 2, [0, 1, 0], [0, 0, 0], 0], ['m', 'blocks', '1,2,3', 'stone']];
  assert.deepEqual(guardOwnerOps(ops).map((o) => o[1]), ['g2', 'blocks'], 'thrown or dropped at death: the wand op is dropped');
  const kv = guardOwnerKV([['chests', '1,2,3', [{ id: OWNER_WAND, n: 1 }, { id: 'iron', n: 4 }, null]], ['vehicles', 'v1', { fuel: 3, slots: [{ id: OWNER_WAND, n: 1 }] }], ['chests', '4,5,6', null]]);
  assert.deepEqual(kv[0][2], [null, { id: 'iron', n: 4 }, null]);
  assert.deepEqual(kv[1][2], { fuel: 3, slots: [null] });
  assert.equal(kv[2][2], null);
  const box = createDonationBox({ ownerId: 'boss', send: (cid, m) => sent.push([cid, m]), onDonation: () => assert.fail('not a donation') });
  box.handle('c-kid', 'kid', 'Bára', ['donate', OWNER_WAND, 1]);
  assert.ok(!msgs('c-kid').some((m) => m[0] === 'give'), 'another player does not get it back');
  box.handle('c-boss', 'boss', 'Riki', ['donate', OWNER_WAND, 1]);
  assert.ok(msgs('c-boss').some((m) => m[0] === 'give' && m[1] === OWNER_WAND), 'the owner gets it back');
  assert.equal(box.count(), 0, 'it never lands in the box');
});

test('Avada Kedavra: only the owner can cast it; it kills a mob anywhere', () => {
  addPlayer('c-boss', 'Riki', 0, 30);
  addPlayer('c-kid', 'Bára', 2, 30);
  const golem = (spawnMob('golem', 10, 30), mobs.at(-1));
  golem.nid = 7;
  assert.equal(wand.spell('c-kid', 'kid', ['ospell', 'avada', 'm', 7]), 'denied', 'a non-owner cannot cast it');
  assert.ok(!golem.dead);
  assert.ok(msgs('c-kid').some((m) => m[0] === 'toast'));
  assert.ok(wand.handle('c-kid', 'kid', ['ospell', 'avada', 'm', 7]), 'the message never reaches the room');
  assert.equal(wand.spell('c-boss', null, ['ospell', 'avada', 'm', 7]), 'denied', 'no profile = not the owner');
  assert.equal(wand.spell('c-boss', 'boss', ['ospell', 'avada', 'm', 7]), 'mob', 'the owner kills it');
  assert.ok(golem.dead);
  assert.ok(msgs('c-boss').some((m) => m[0] === 'give'), 'the loot goes to the owner');

  const far = (spawnMob('wolf', 0, 200), mobs.at(-1));
  far.nid = 8; clock += 2;
  assert.equal(wand.spell('c-boss', 'boss', ['ospell', 'avada', 'm', 8]), 'miss', 'out of reach');
  const mark = (spawnMob('markoman', MARK_X + 500, 0), mobs.at(-1));
  mark.nid = 9; clock += 2;
  others.get('c-boss').pose.x = MARK_X + 505; others.get('c-boss').pose.z = 0;
  assert.equal(wand.spell('c-boss', 'boss', ['ospell', 'avada', 'm', 9]), 'mob', 'in Markova dimenze too, fights off or on');
  clock += 0.5;
  const sheep = (spawnMob('sheep', MARK_X + 506, 2), mobs.at(-1));
  sheep.nid = 10;
  assert.equal(wand.spell('c-boss', 'boss', ['ospell', 'avada', 'm', 10]), 'miss', 'at most one cast a second');
});

test('Avada Kedavra: kills a player only where fights are on (pvp world, or pvp-mark with both in Markova dimenze)', () => {
  addPlayer('c-boss', 'Riki', 0, 30);
  addPlayer('c-kid', 'Bára', 5, 30, { pv: 1 });
  const cast = () => { clock += 2; others.get('c-kid').hurtAt = 0; return wand.spell('c-boss', 'boss', ['ospell', 'avada', 'p', 'c-kid']); };
  const dmg = () => msgs('c-kid').filter((m) => m[0] === 'dmg');
  assert.equal(wand.spell('c-kid', 'kid', ['ospell', 'avada', 'p', 'c-boss']), 'denied', 'a non-owner cannot');
  others.get('c-boss').pose.pv = 1;
  assert.equal(cast(), 'miss', 'a normal world: no, not even when both switched fights on with N');
  assert.equal(dmg().length, 0);
  NET.pvpMark = true;
  assert.equal(cast(), 'miss', 'pvp-mark world outside Markova dimenze: no');
  others.get('c-boss').pose.x = MARK_X + 10; others.get('c-kid').pose.x = MARK_X + 15;
  assert.equal(cast(), 'player', 'pvp-mark world, both in Markova dimenze: yes');
  assert.deepEqual(dmg().at(-1), ['dmg', 1000, 0, 0], 'a kill-size hit with no knockback (armor does not soften it)');
  assert.ok(msgs('c-kid').some((m) => m[0] === 'toast' && /Avada/.test(m[1])));
  NET.pvpMark = false; NET.pvp = true;
  others.get('c-boss').pose.x = 0; others.get('c-kid').pose.x = 5;
  assert.equal(cast(), 'player', 'pvp world: yes');
  others.get('c-kid').pose.cr = 1;
  assert.equal(cast(), 'miss', 'a creative player cannot be hit');
  others.get('c-kid').pose.cr = 0; others.get('c-kid').pose.z = 200;
  assert.equal(cast(), 'miss', 'out of reach');
});

test('Štvanice: only the owner; mobs around the victim get red eyes and hunt them; it ends', () => {
  addPlayer('c-boss', 'Riki', 0, 30);
  addPlayer('c-kid', 'Bára', 100, 30);
  const sheep = (spawnMob('sheep', 110, 30), mobs.at(-1)), wolf = (spawnMob('wolf', 95, 25), mobs.at(-1)), far = (spawnMob('cow', 100, 100), mobs.at(-1));
  const TG = [...others.values()].map((P) => ({ pos: new Vec3(P.pose.x, P.pose.y, P.pose.z), alive: P.pose.alive !== false, creative: false, pid: P.pid }));
  NET.targets = () => TG;
  assert.equal(wand.spell('c-kid', 'kid', ['ospell', 'hunt', 'p', 'c-boss']), 'denied', 'a non-owner cannot');
  assert.equal(hunts.size, 0);
  assert.equal(wand.spell('c-boss', 'boss', ['ospell', 'hunt', 'p', 'c-kid']), 'miss', 'the victim must be within reach of the owner');
  others.get('c-kid').pose.x = 40; TG[1].pos.set(40, groundHeight(40, 30), 30);
  sheep.pos.x = 50; wolf.pos.x = 35;
  clock += 2;
  assert.equal(wand.spell('c-boss', 'boss', ['ospell', 'hunt', 'p', 'c-kid']), 'hunt');
  assert.ok(msgs('c-kid').some((m) => m[0] === 'toast'), 'the victim is told');
  const plan = huntPlan(sheep, TG);
  assert.equal(plan.T.pid, 'c-kid', 'even a sheep goes for the victim');
  assert.ok(plan.attack && sheep.hunt, '…to attack, with red eyes');
  assert.equal(huntPlan(far, TG), null, 'mobs far from the victim do not care');
  assert.ok(!far.hunt);

  // the simulation: the sheep runs to the victim and bites
  sheep.pos.x = 43; sheep.pos.z = 30;
  for (let i = 0; i < 60; i++) updateMobs(0.05, 1);
  assert.ok(sheep.pos.x < 43, 'the sheep moves toward the victim');
  assert.ok(msgs('c-kid').some((m) => m[0] === 'dmg' && m[1] === HUNT.dmg), 'and bites');
  assert.ok(sheep.hunt && wolf.hunt, 'red eyes while hunting');

  updateHunts(HUNT.time, TG);
  assert.equal(hunts.size, 0, 'ends after HUNT.time s');
  assert.equal(huntPlan(sheep, TG), null);
  assert.ok(!sheep.hunt, 'eyes back to normal');
  startHunt('c-kid');
  TG[1].alive = false;
  updateHunts(0.05, TG);
  assert.equal(hunts.size, 0, 'ends when the victim falls');
  startHunt('c-kid');
  updateHunts(0.05, TG.slice(0, 1));
  assert.equal(hunts.size, 0, 'ends when the victim leaves');
});

test('server: the owner gets the wand; others lose it; spells checked by the server', { timeout: 60000 }, async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rise-hul-'));
  const P = createProfiles(path.join(dataDir, 'players.json'));
  const bossId = P.login({ name: 'Šéf', pin: '1234', world: 'svet' }).profile.id;
  P.login({ name: 'Bára', pin: '1234', world: 'svet' });
  const env = { DATA_DIR: dataDir, OWNER_ID: bossId, SAVE_SECONDS: '1' };
  const srv = await startServer(env);
  try {
    const boss = player(srv.port, 'Šéf', ''), kid = player(srv.port, 'Bára', '');
    await Promise.all([boss.ready, kid.ready]);
    assert.ok(await boss.waitFor((m) => m[0] === 'welcome') && await kid.waitFor((m) => m[0] === 'welcome'));
    boss.send(['pose', pose(0, 14)]); kid.send(['pose', pose(3, 14)]);
    assert.ok(await boss.waitFor((m) => m[0] === 'give' && m[1] === OWNER_WAND), 'the owner gets the wand when the game starts');
    await sleep(300);
    assert.ok(!kid.msgs.some((m) => m[0] === 'give' && m[1] === OWNER_WAND), 'nobody else does');

    kid.send(['me', me([{ id: OWNER_WAND, n: 1 }, { id: 'apple', n: 1 }])]);
    boss.send(['me', me([{ id: 'apple', n: 1 }])]);
    kid.send(['ospell', 'avada', 'p', 'x']);
    assert.ok(await kid.waitFor((m) => m[0] === 'toast' && /vlastníka/.test(m[1])), 'a non-owner cast is refused');
    boss.msgs.length = 0;
    kid.send(['ops', 0, [['g', 'gx1', OWNER_WAND, 1, [3, 1, 14], [0, 0, 0], 0], ['g', 'gx2', 'apple', 1, [3, 1, 14], [0, 0, 0], 0]]]);
    const ops = await boss.waitFor((m) => m[0] === 'ops' && m[1].some((o) => o[1] === 'gx2'));
    assert.ok(ops && !ops[1].some((o) => o[2] === OWNER_WAND), 'a thrown wand never reaches the ground of others');

    // a mob near the owner: Avada Kedavra kills it
    let target = null;
    for (let t = 0; t < 40 && !target; t++) {
      const list = [...boss.msgs].reverse().find((m) => m[0] === 'mobs')?.[3] || [];
      target = list.find((r) => !r[8] && Math.hypot(r[2], r[4] - 14) < 55);
      if (!target) { boss.send(['pose', pose(0, 14)]); await sleep(250); }
    }
    assert.ok(target, 'a mob came near');
    assert.equal(target.length, 12, 'the mobs message carries the red-eyes flag');
    boss.send(['ospell', 'avada', 'm', target[0]]);
    assert.ok(await boss.waitFor((m) => m[0] === 'mobs' && m[3].some((r) => r[0] === target[0] && r[8] === 1)), 'the owner kills the mob');
    await sleep(1500); // uložení každou sekundu
    boss.ws.close(); kid.ws.close();
  } finally {
    await stop(srv);
  }
  const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'svet', 'world.json'), 'utf8')).players;
  const kidSaved = Object.entries(saved).find(([id]) => id !== bossId)?.[1];
  assert.equal(wands(saved[bossId]), 1, 'the saved backpack of the owner has the wand');
  assert.equal(wands(kidSaved), 0, 'the saved backpack of another player does not');
  assert.deepEqual(kidSaved.inv.find(Boolean), { id: 'apple', n: 1 }, 'the rest of their backpack is kept');
});
