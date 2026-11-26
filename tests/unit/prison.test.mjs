// Vězení serveru kroužku: vlastník posílá hráče do vězení (/vezeni) a propouští (/propustit), kdo zabije vlastníka,
// jde tam sám. Vězení je bludiště se čtyřmi branami; vězeň dostane jednu bránu a úkol (pavouci, runy, příklady, hádanky).
// Pravidla: server/prison.js, server/prison-tasks.js; stavba a pavouci: shared/world/prison.js, shared/sim/mobs.js.
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BLOCKS, ITEMS } from '../../shared/data/index.js';
import { NET } from '../../shared/net/net.js';
import { arenaDeath, hitPlayer, others, room } from '../../shared/net/room.js';
import { MOBS, hurtMob, mobs, spawnMob, updateMobs, updateSpawns } from '../../shared/sim/mobs.js';
import { startHunt, stopHunt } from '../../shared/sim/hunt.js';
import { Vec3 } from '../../shared/vec3.js';
import {
  PRISON, PRISON_EXITS, PRISON_N, PRISON_SPIDERS, PRISON_SPOT, SPAWN_SPOT, ensurePrison, exitAt, guardPrisonerOps, inPrison,
  prisonBuilt, prisonRunes, runeAt,
} from '../../shared/world/prison.js';
import { bkey, blocks, ruinsBuilt } from '../../shared/world/state.js';
import { guardStatueOps } from '../../shared/world/statue.js';
import { MARK_X, terrainH } from '../../shared/world/terrain.js';
import { createPrison } from '../../server/prison.js';
import { TASK_KINDS, TASK_NEED } from '../../server/prison-tasks.js';
import { createProfiles } from '../../server/profiles.js';
import { player, pose, sleep, startServer, stop } from './server-helpers.mjs';

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const { x: X, y: Y, z: Z, half: H } = PRISON;
const at = (x, z) => ({ ...pose(x, z), y: Y + 1 }); // poloha na podlaze bludiště
const gatePose = (e) => { const [sx, sz] = PRISON_EXITS[e].side; return at(PRISON_EXITS[e].at[0] - sx * 2, PRISON_EXITS[e].at[1] - sz * 2); };
const gateCell = (e) => { const [x, z] = PRISON_EXITS[e].cols[1]; return [x, Y + 2, z]; };

beforeEach(() => { mobs.length = 0; blocks.clear(); ruinsBuilt.clear(); NET.mode = 'sp'; NET.client = false; NET.killer = null; });

test('prison: a maze built once high in the sky from fixed blocks; four gates, runes, every place reachable from the start', () => {
  ruinsBuilt.add('prison'); // staré vězení (plošina se sochou a pokladničkou)
  blocks.set(bkey(X, Y + 1, Z - 10), 'donation_box');
  blocks.set(bkey(X + 13, Y + 2, Z), 'prison_block');
  assert.equal(ensurePrison(), true);
  assert.equal(ensurePrison(), false, 'only once');
  assert.ok(prisonBuilt());
  assert.ok(![...blocks.values()].includes('donation_box'), 'the old prison (statue and box) is gone');
  for (const id of ['prison_block', 'prison_gate', 'prison_rune']) assert.ok(BLOCKS[id].fixed && BLOCKS[id].drop === null && !ITEMS[id], `${id}: unbreakable, not an item`);
  for (const id of blocks.values()) assert.ok(BLOCKS[id]?.fixed || id === 'lantern', `${id} is fixed`);
  assert.ok(Y > terrainH(X, Z) + 60, 'far above the ground');
  assert.ok(inPrison(...PRISON_SPOT) && !inPrison(...SPAWN_SPOT) && !inPrison(X, 0, Z));
  assert.equal(blocks.get(bkey(Math.floor(PRISON_SPOT[0]), Y, Math.floor(PRISON_SPOT[2]))), 'prison_block', 'the prisoner stands on the floor');

  assert.equal(PRISON_EXITS.length, 4);
  PRISON_EXITS.forEach((e, i) => {
    for (const [x, z] of e.cols) for (let y = 1; y <= 3; y++) {
      assert.equal(blocks.get(bkey(x, Y + y, z)), 'prison_gate', `${e.id} gate`);
      assert.equal(exitAt(x, Y + y, z), i);
    }
    assert.ok(inPrison(e.at[0], Y + 1, e.at[1]));
  });
  assert.equal(exitAt(X, Y + 1, Z), -1);
  const runes = prisonRunes();
  assert.ok(runes.length >= Math.max(TASK_NEED.runes + 2, 6), 'enough runes to choose from');
  runes.forEach((r, i) => { assert.equal(blocks.get(bkey(r.x, r.y, r.z)), 'prison_rune'); assert.equal(runeAt(r.x, r.y, r.z), i); });

  // Bludiště: z prostřední buňky se dá dojít ke každé bráně a runě; ven zdí cesta nevede.
  const open = (x, z) => !BLOCKS[blocks.get(bkey(x, Y + 1, z))]?.solid && !BLOCKS[blocks.get(bkey(x, Y + 2, z))]?.solid && blocks.get(bkey(x, Y, z)) === 'prison_block';
  const start = [Math.floor(PRISON_SPOT[0]), Math.floor(PRISON_SPOT[2])], seen = new Set([start.join()]), queue = [start];
  while (queue.length) {
    const [x, z] = queue.shift();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + dx},${z + dz}`;
      if (!seen.has(k) && open(x + dx, z + dz)) { seen.add(k); queue.push([x + dx, z + dz]); }
    }
  }
  for (const k of seen) { const [x, z] = k.split(',').map(Number); assert.ok(Math.abs(x - X) < H && Math.abs(z - Z) < H, 'no way out through the walls'); }
  const nextTo = (x, z) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => seen.has(`${x + dx},${z + dz}`));
  for (const e of PRISON_EXITS) assert.ok(nextTo(...e.cols[1]), `the ${e.id} gate can be reached`);
  for (const r of runes) assert.ok(nextTo(r.x, r.z), 'every rune can be reached');
  assert.ok(seen.size > PRISON_N * PRISON_N * 6, 'the whole maze is one connected place');

  const floor = bkey(X, Y, Z);
  const g = guardStatueOps([['m', 'blocks', floor, null], ['m', 'blocks', bkey(X + 3, Y + 1, Z), 'planks']]);
  assert.deepEqual(g.fix, [['m', 'blocks', floor, 'prison_block']], 'breaking a prison block is undone for everyone');
  const p = guardPrisonerOps([['m', 'blocks', bkey(X + 3, Y + 1, Z), 'planks'], ['m', 'blockMeta', floor, 1], ['v', 5, 0, 5, 0], ['g', 'g1', 'iron', 1, [0, 0, 0], [0, 0, 0], 0], ['gx', 'g1', 1], ['r', {}], ['p']]);
  assert.deepEqual(p.ops.map((o) => o[0]), ['g', 'gx'], 'a prisoner cannot place blocks, dig or build: only dropped items pass');
  assert.equal(p.fix.at(-1)[0], 'v');
});

test('giant spiders: only in the maze, walk on its floor, bite the prisoner, can be killed', () => {
  ensurePrison();
  const hits = [];
  const target = { pos: new Vec3(...PRISON_SPOT), alive: true, creative: false, pid: 'p1' };
  Object.assign(NET, { targets: () => [target], spawnCenter: () => target.pos, sendTo: (pid, m) => m[0] === 'dmg' && hits.push(m[1]), give: () => {} });
  for (let i = 0; i < 30; i++) updateSpawns(3, 0);
  const sp = mobs.filter((m) => m.type === 'spider');
  assert.equal(sp.length, PRISON_SPIDERS, 'a few spiders, no other mobs');
  assert.equal(mobs.length, PRISON_SPIDERS);
  for (const m of sp) assert.ok(Math.hypot(m.pos.x - target.pos.x, m.pos.z - target.pos.z) >= 9.9, 'not right next to the prisoner');
  target.pos.set(sp[0].pos.x + 1, Y + 1, sp[0].pos.z);
  for (let i = 0; i < 300; i++) updateMobs(0.05, 1);
  for (const m of sp) {
    assert.equal(m.pos.y, Y + 1, 'on the floor, not on the ground far below');
    assert.ok(inPrison(m.pos.x, m.pos.y, m.pos.z), 'inside the maze');
  }
  assert.ok(hits.length > 0 && hits.every((d) => d === MOBS.spider.dmg), 'they bite the prisoner');
  hurtMob(sp[0], 999, 0);
  assert.ok(sp[0].dead, 'a spider can be killed');

  startHunt('p1');
  const boar = spawnMob('boar', X + 3, Z + 3);
  for (let i = 0; i < 200; i++) updateMobs(0.05, 1);
  stopHunt();
  assert.ok(boar.pos.y < Y - 50, 'a hunted mob below stays on the ground (not pulled into the prison)');
  mobs.length = 0;
  target.pos.set(60, 0.45, 60); // venku: žádní pavouci
  for (let i = 0; i < 40; i++) updateSpawns(3, 0);
  assert.ok(!mobs.some((m) => m.type === 'spider'), 'spiders never appear outside the prison');
  mobs.length = 0; blocks.clear(); ruinsBuilt.clear();
  target.pos.set(...PRISON_SPOT);
  for (let i = 0; i < 10; i++) updateSpawns(3, 0);
  assert.equal(mobs.length, 0, 'no prison built (single player, browser host): no spiders');
});

// Vězení bez serveru: zprávy se sbírají do pole. picks = čísla pro náhodu (brána, úkol), pak 0.
function jailWith({ saved, online = [['c-boss', 'boss', 'Šéf'], ['c-b', 'kid', 'Bára'], ['c-c', 'cyril', 'Cyril']], t = { now: 0 }, picks = [], question } = {}) {
  const sent = [], logs = [];
  const profiles = { bára: { id: 'kid', name: 'Bára' }, cyril: { id: 'cyril', name: 'Cyril' }, dan: { id: 'dan', name: 'Dan' }, šéf: { id: 'boss', name: 'Šéf' } };
  const P = createPrison({
    ownerId: 'boss', ownerName: 'Šéf', saved, now: () => t.now, log: (l) => logs.push(l), rnd: () => (picks.length ? picks.shift() : 0),
    send: (cid, m) => sent.push([cid, m]),
    conns: () => online.map(([cid, profile, name]) => [cid, { profile, name }]),
    lookup: (name, done) => done(profiles[name.toLowerCase()] || null),
    ...(question ? { question } : {}),
  });
  const to = (cid, type) => sent.filter(([c, m]) => c === cid && (!type || m[0] === type)).map(([, m]) => m);
  return { P, sent, logs, to, t };
}
// náhoda pro bránu e a úkol kind (jail: brána = floor(rnd·4), úkol = floor(rnd·4))
const pickFor = (e, kind) => [(e + 0.5) / PRISON_EXITS.length, (TASK_KINDS.indexOf(kind) + 0.5) / TASK_KINDS.length];

test('prison commands: only the owner sends and releases; from anyone else it is normal chat', () => {
  const { P, to, sent } = jailWith({ picks: [...pickFor(2, 'runes'), ...pickFor(0, 'math')] });
  assert.equal(P.handle('c-b', 'kid', ['chat', '/vezeni Cyril']), false, 'a non-owner: normal chat');
  assert.equal(P.handle('c-b', 'kid', ['chat', '/propustit Bára']), false);
  assert.equal(sent.length, 0);
  assert.equal(P.handle('c-boss', 'boss', ['chat', 'ahoj']), false, 'the owner\'s normal chat stays chat');
  assert.equal(P.handle('c-boss', 'boss', ['chat', '/armada 4']), false, 'other commands go on (army)');

  assert.equal(P.handle('c-boss', 'boss', ['chat', '/vězení bára']), true, 'the owner sends (any case, with or without diacritics)');
  assert.ok(P.isPrisoner('kid'));
  const st = to('c-b', 'vezeni')[0][1];
  assert.deepEqual(st, { on: true, at: PRISON_SPOT, exit: PRISON_EXITS[2].at, ex: 'jižní', kind: 'runes', need: TASK_NEED.runes, done: 0, text: 'Najdi 3 runové kameny (pravé tlačítko)', go: 1 }, 'the prisoner is moved into the maze with a gate and a task');
  assert.match(to('c-b', 'chat').at(-1)[2], /jen jižní brána.*Najdi 3 runové/, 'the prisoner is told the gate and the task');
  assert.match(to('c-boss', 'chat').at(-1)[2], /Bára \(runy 0\/3, jižní brána\) je v bludišti/);
  assert.equal(to('c-c').length, 0, 'nobody else hears about it');
  P.handle('c-boss', 'boss', ['chat', '/vezeni Bára']);
  assert.match(to('c-boss', 'chat').at(-1)[2], /už ve vězení/);
  P.handle('c-boss', 'boss', ['chat', '/vezeni Šéf']);
  assert.match(to('c-boss', 'chat').at(-1)[2], /Sebe/);
  P.handle('c-boss', 'boss', ['chat', '/vezeni Nikdo']);
  assert.match(to('c-boss', 'chat').at(-1)[2], /neznám/);
  P.handle('c-boss', 'boss', ['chat', '/vezeni Dan']);
  assert.ok(P.isPrisoner('dan'), 'a player who is not online goes to prison too (next login)');
  P.handle('c-boss', 'boss', ['chat', '/vezeni']);
  assert.match(to('c-boss', 'chat').at(-1)[2], /Bára \(runy 0\/3.*Dan \(příklady 0\/3, severní brána\)/, 'the list');

  assert.equal(P.handle('c-b', 'kid', ['chat', '/svet kreativ']), true, 'a prisoner\'s commands do nothing (no /svet, no army)');
  assert.equal(P.handle('c-b', 'kid', ['chat', 'pomoc']), false, 'but a prisoner can chat');
  assert.equal(P.handle('c-c', 'cyril', ['vez', 'gate', ...gateCell(0)]), true, 'a free player\'s gate click does nothing');
  assert.equal(to('c-c').length, 0);

  assert.equal(P.handle('c-boss', 'boss', ['chat', '/propustit Bára']), true);
  assert.ok(!P.isPrisoner('kid'));
  assert.deepEqual(to('c-b', 'vezeni').at(-1)[1], { on: false, at: SPAWN_SPOT, go: 1 }, 'released: back to spawn');
  P.handle('c-boss', 'boss', ['chat', '/propustit Bára']);
  assert.match(to('c-boss', 'chat').at(-1)[2], /není/);
});

test('prison task "monsters": kill spiders in the maze, then the own gate (others stay shut) sets you free', () => {
  const { P, to } = jailWith({ picks: pickFor(1, 'monsters') });
  P.handle('c-boss', 'boss', ['chat', '/vezeni Bára']);
  const spider = (x = X + 2.5, z = Z + 6.5, type = 'spider') => ({ type, pos: { x, y: Y + 1, z } });
  P.handle('c-b', 'kid', ['pose', gatePose(1)]);
  P.handle('c-b', 'kid', ['vez', 'gate', ...gateCell(1)]);
  assert.match(to('c-b', 'toast').at(-1)[1], /zavřená.*Zabij 3 obří pavouky.*0\/3/, 'the gate stays shut before the task');
  assert.equal(P.onMobKill('c-b', spider(X, Z, 'wolf')), false, 'other mobs do not count');
  assert.equal(P.onMobKill('c-b', spider(60, 60)), false, 'spiders outside the maze do not count');
  assert.equal(P.onMobKill('c-c', spider()), false, 'a free player\'s kill does not count');
  assert.ok(P.onMobKill('c-b', spider()));
  assert.deepEqual([to('c-b', 'vezeni').at(-1)[1].done, to('c-b', 'toast').at(-1)[1]], [1, 'Pavouk padl! 1/3']);
  P.onMobKill('c-b', spider()); P.onMobKill('c-b', spider());
  assert.match(to('c-b', 'toast').at(-1)[1], /Hotovo! Teď ke své bráně: východní brána/);
  assert.equal(P.onMobKill('c-b', spider()), false, 'no more than needed');
  P.handle('c-b', 'kid', ['pose', gatePose(3)]);
  P.handle('c-b', 'kid', ['vez', 'gate', ...gateCell(3)]);
  assert.match(to('c-b', 'toast').at(-1)[1], /Tahle brána tě nepustí. Tvoje je východní brána/);
  assert.ok(P.isPrisoner('kid'));
  P.handle('c-b', 'kid', ['vez', 'gate', ...gateCell(1)]);
  assert.ok(P.isPrisoner('kid'), 'a gate out of reach does nothing (the server checks the position)');
  P.handle('c-b', 'kid', ['pose', gatePose(1)]);
  P.handle('c-b', 'kid', ['vez', 'gate', X, Y + 1, Z]);
  assert.ok(P.isPrisoner('kid'), 'not a gate block: nothing');
  P.handle('c-b', 'kid', ['vez', 'gate', ...gateCell(1)]);
  assert.ok(!P.isPrisoner('kid'), 'the own gate with the task done: free');
  assert.deepEqual(to('c-b', 'vezeni').at(-1)[1], { on: false, at: SPAWN_SPOT, go: 1 });
  assert.match(to('c-boss', 'chat').at(-1)[2], /Bára splnil\(a\) úkol/, 'the owner is told');
});

test('prison task "runes": touch three different runes (in reach), then the own gate', () => {
  const { P, to } = jailWith({ picks: pickFor(0, 'runes') });
  P.handle('c-boss', 'boss', ['chat', '/vezeni Bára']);
  const runes = prisonRunes();
  const touch = (i) => { const r = runes[i]; P.handle('c-b', 'kid', ['pose', at(r.x + 0.5, r.z + 2)]); P.handle('c-b', 'kid', ['vez', 'rune', r.x, r.y, r.z]); };
  P.handle('c-b', 'kid', ['pose', at(...PRISON_EXITS[0].at)]);
  P.handle('c-b', 'kid', ['vez', 'rune', runes[0].x, runes[0].y, runes[0].z]);
  assert.equal(to('c-b', 'vezeni').length, 1, 'a rune out of reach does nothing');
  touch(0);
  assert.equal(to('c-b', 'toast').at(-1)[1], 'Runa se rozzářila! 1/3');
  touch(0);
  assert.match(to('c-b', 'toast').at(-1)[1], /už máš/, 'the same rune twice counts once');
  touch(4); touch(2);
  assert.match(to('c-b', 'toast').at(-1)[1], /Hotovo!.*severní brána/);
  assert.deepEqual(P.list()[0][1].runes, [0, 4, 2]);
  P.handle('c-b', 'kid', ['pose', gatePose(0)]);
  P.handle('c-b', 'kid', ['vez', 'gate', ...gateCell(0)]);
  assert.ok(!P.isPrisoner('kid'));
});

test('prison tasks "math" and "logic": questions at the own gate; a wrong answer waits 3 s; three right = free', () => {
  const t = { now: 0 };
  let n = 0;
  const { P, to } = jailWith({ t, picks: pickFor(3, 'math'), question: (kind) => ({ q: `${kind} ${++n}: 2 + ${n} = ?`, a: String(2 + n) }) });
  P.handle('c-boss', 'boss', ['chat', '/vezeni Bára']);
  P.handle('c-b', 'kid', ['vez', 'ans', '3']);
  assert.equal(P.list()[0][1].done, 0, 'no open question: an answer does nothing');
  P.handle('c-b', 'kid', ['pose', gatePose(3)]);
  P.handle('c-b', 'kid', ['vez', 'gate', ...gateCell(3)]);
  assert.deepEqual(to('c-b', 'vezq').at(-1), ['vezq', 'Příklad 1 ze 3\nmath 1: 2 + 1 = ?'], 'the gate asks; the answer is never sent');
  P.handle('c-b', 'kid', ['vez', 'ans', ' 3 ']);
  assert.equal(to('c-b', 'toast').at(-1)[1], 'Správně! 1/3');
  assert.deepEqual(to('c-b', 'vezq').at(-1), ['vezq', 'Příklad 2 ze 3\nmath 2: 2 + 2 = ?'], 'the next question comes right away');
  P.handle('c-b', 'kid', ['vez', 'ans', '5']);
  assert.deepEqual(to('c-b', 'vezq').at(-1), ['vezq', null], 'wrong: the window closes');
  assert.match(to('c-b', 'toast').at(-1)[1], /Špatně, správně bylo 4/);
  P.handle('c-b', 'kid', ['vez', 'ans', '4']);
  assert.equal(P.list()[0][1].done, 1, 'the old question cannot be answered again');
  t.now = 2000;
  P.handle('c-b', 'kid', ['vez', 'gate', ...gateCell(3)]);
  assert.match(to('c-b', 'toast').at(-1)[1], /Chvilku počkej/);
  t.now = 3100;
  P.handle('c-b', 'kid', ['vez', 'gate', ...gateCell(3)]);
  P.handle('c-b', 'kid', ['vez', 'ans', '5']);
  P.handle('c-b', 'kid', ['vez', 'ans', '6']);
  assert.ok(!P.isPrisoner('kid'), 'three right answers: free');
  assert.deepEqual(to('c-b', 'vezq').at(-1), ['vezq', null]);

  const L = jailWith({ picks: pickFor(1, 'logic'), question: (kind) => ({ q: kind, a: 'Ema' }) });
  L.P.handle('c-boss', 'boss', ['chat', '/vezeni Bára']);
  L.P.handle('c-b', 'kid', ['pose', gatePose(1)]);
  L.P.handle('c-b', 'kid', ['vez', 'gate', ...gateCell(1)]);
  assert.deepEqual(L.to('c-b', 'vezq').at(-1), ['vezq', 'Hádanka 1 ze 3\nlogic']);
  for (let i = 0; i < 3; i++) L.P.handle('c-b', 'kid', ['vez', 'ans', 'ema']);
  assert.ok(!L.P.isPrisoner('kid'), 'logic: names without capitals count');
});

test('prison: killing the owner sends the killer to prison (room hook); other kills do not', () => {
  const { P, to } = jailWith();
  assert.equal(P.onKill('c-b', 'c-c'), false, 'killing another player: nothing');
  assert.equal(P.onKill('c-boss', 'c-b'), false, 'the owner killing someone: nothing');
  assert.equal(P.onKill('c-b', 'c-boss'), true);
  assert.ok(P.isPrisoner('kid'));
  assert.match(to('c-b', 'toast').at(-1)[1], /Zabil\(a\) jsi vlastníka/);

  // shared/net/room.js: souboj v Markově dimenzi, kdo dá poslední ránu, je "killer" → room.onKill(pid vítěze, pid poraženého)
  const kills = [];
  room.onKill = (k, v) => kills.push([k, v]);
  Object.assign(NET, { pvp: false, pvpMark: true });
  const M = MARK_X + 100, sendLog = [];
  const conn = { open: true, send: (m) => sendLog.push(m) };
  others.set('c-b', { pid: 'c-b', name: 'Bára', conn, pose: { x: M, y: 0, z: 0, alive: true } });
  others.set('c-boss', { pid: 'c-boss', name: 'Šéf', conn, pose: { x: M + 2, y: 0, z: 0, alive: true } });
  try {
    assert.ok(hitPlayer('c-b', 'c-boss', 6, 0, 1, false));
    arenaDeath(others.get('c-boss'));
    assert.deepEqual(kills, [['c-b', 'c-boss']]);
  } finally { others.clear(); room.onKill = () => {}; Object.assign(NET, { pvpMark: false }); }
});

test('prison: positions are enforced and the state (gate, task, progress) survives a restart', () => {
  const t = { now: 0 };
  const { P, to } = jailWith({ t, picks: pickFor(2, 'runes') });
  P.handle('c-boss', 'boss', ['chat', '/vezeni Bára']);
  const n = () => to('c-b', 'vezeni').length;
  const k = n();
  t.now = 5000;
  P.handle('c-b', 'kid', ['pose', pose(PRISON_SPOT[0], PRISON_SPOT[2])]); // y 0.45: on the ground far below = outside
  assert.equal(n(), k + 1, 'a prisoner outside the prison is sent back');
  P.handle('c-b', 'kid', ['pose', pose(1, 15)]);
  assert.equal(n(), k + 1, 'at most once per 2 s');
  t.now = 8000;
  P.handle('c-b', 'kid', ['pose', { ...pose(1, 15), alive: false }]);
  assert.equal(n(), k + 1, 'not while dead (the respawn puts them back)');
  P.handle('c-b', 'kid', ['pose', at(PRISON_SPOT[0], PRISON_SPOT[2])]);
  assert.equal(n(), k + 1, 'inside: nothing');
  t.now = 11000;
  P.handle('c-b', 'kid', ['pose', { ...at(PRISON_SPOT[0], PRISON_SPOT[2]), y: Y + 6 }]);
  assert.equal(n(), k + 2, 'flying above the maze walls: back to the start');
  assert.equal(to('c-b', 'vezeni').at(-1)[1].go, 1);
  t.now = 14000;
  P.handle('c-b', 'kid', ['pose', { ...at(PRISON_SPOT[0], PRISON_SPOT[2]), y: Y + 2.2 }]);
  assert.equal(n(), k + 2, 'a jump is fine');
  P.handle('c-c', 'cyril', ['pose', at(PRISON_SPOT[0], PRISON_SPOT[2])]);
  assert.deepEqual(to('c-c', 'vezeni').at(-1)[1], { on: false, at: SPAWN_SPOT, go: 1 }, 'a free player in the prison (released while away) goes to spawn');
  P.handle('c-boss', 'boss', ['pose', at(PRISON_SPOT[0], PRISON_SPOT[2])]);
  assert.equal(to('c-boss', 'vezeni').length, 0, 'the owner may visit');
  const r = prisonRunes()[1];
  P.handle('c-b', 'kid', ['pose', at(r.x + 0.5, r.z + 1.5)]);
  P.handle('c-b', 'kid', ['vez', 'rune', r.x, r.y, r.z]);

  const saved = JSON.parse(JSON.stringify(P.save()));
  assert.deepEqual(saved, { prisoners: { kid: { name: 'Bára', exit: 2, kind: 'runes', need: 3, done: 1, runes: [1] } } });
  const back = jailWith({ saved, t });
  assert.ok(back.P.isPrisoner('kid'), 'still in prison after a restart');
  back.P.handle('c-b', 'kid', ['pose', pose(1, 15)]);
  assert.deepEqual(back.to('c-b', 'vezeni')[0][1], { on: true, at: PRISON_SPOT, exit: PRISON_EXITS[2].at, ex: 'jižní', kind: 'runes', need: 3, done: 1, text: 'Najdi 3 runové kameny (pravé tlačítko)', go: 1 }, 'the first pose after joining: into the maze, with the progress');
  const old = jailWith({ saved: { prisoners: { kid: { name: 'Bára', given: 7 } } }, picks: pickFor(1, 'logic') }).P.list();
  assert.deepEqual(old, [['kid', { name: 'Bára', exit: 1, kind: 'logic', need: 3, done: 0, runes: [] }]], 'an old save (spider eyes) gets a gate and a task');
  assert.deepEqual(jailWith({ saved: { prisoners: { x: null, y: 'junk' } } }).P.list(), [], 'saved junk is dropped');
  assert.deepEqual(jailWith({ saved: 'junk' }).P.save(), { prisoners: {} });
  assert.ok(!jailWith({ saved: { prisoners: { boss: { name: 'Šéf', kind: 'math' } } } }).P.isPrisoner('boss'), 'the owner is never in prison, even from an old save');
});

test('server: /vezeni and /propustit from the owner, no building in prison, spider kills count, owner kill, survives a restart', { timeout: 180000 }, async () => {
  const dataDir = tmp('rise-vezeni-');
  const P = createProfiles(path.join(dataDir, 'players.json'));
  const login = (name) => P.login({ name, pin: '1234', world: 'svet' }).profile.id;
  const bossId = login('Šéf'); login('Bára'); login('Cyril');
  const env = { DATA_DIR: dataDir, OWNER_ID: bossId, SAVE_SECONDS: '1', WORLDS: 'svet:Hlavní svět:pvp-mark' };
  const jailMsg = (p, on, from = 0) => p.waitFor((m, i) => m[0] === 'vezeni' && m[1].on === on && (i ?? 1e9) >= from);
  const inside = at(PRISON_SPOT[0], PRISON_SPOT[2]);
  let srv = await startServer(env);
  try {
    const boss = player(srv.port, 'Šéf', ''), b = player(srv.port, 'Bára', ''), c = player(srv.port, 'Cyril', '');
    for (const p of [boss, b, c]) assert.ok(await p.waitFor((m) => m[0] === 'welcome'));
    assert.ok(boss.welcome.world.blocks.some(([, v]) => v === 'prison_gate'), 'the maze is in the world');
    for (const [p, x] of [[boss, 60], [b, 64], [c, 68]]) p.send(['pose', pose(x, 60)]);
    await sleep(300);

    c.send(['chat', '/vezeni Bára']);
    assert.ok(await b.waitFor((m) => m[0] === 'chat' && m[1] === 'Cyril' && m[2] === '/vezeni Bára'), 'from a non-owner it is normal chat');
    assert.ok(!b.msgs.some((m) => m[0] === 'vezeni'));
    // do vězení, dokud nepřijde úkol s pavouky (náhoda: 1 ze 4)
    let st = null;
    for (let i = 0; i < 40 && st?.[1].kind !== 'monsters'; i++) {
      const from = b.msgs.length;
      boss.send(['chat', '/vezeni Bára']);
      st = await b.waitFor((m) => m[0] === 'vezeni' && m[1].on && b.msgs.indexOf(m) >= from);
      if (st[1].kind !== 'monsters') { boss.send(['chat', '/propustit Bára']); assert.ok(await b.waitFor((m) => m[0] === 'vezeni' && !m[1].on && b.msgs.indexOf(m) >= from)); }
    }
    assert.ok(st && st[1].go && st[1].kind === 'monsters', 'Bára goes to prison with a gate and a task');
    assert.ok(await boss.waitFor((m) => m[0] === 'chat' && /je v bludišti/.test(m[2])));
    b.send(['pose', inside]);
    const k = bkey(X + 1, Y + 1, Z); // prázdné místo ve startovní buňce
    b.send(['ops', false, [['m', 'blocks', k, 'planks']]]);
    assert.ok(await b.waitFor((m) => m[0] === 'ops' && m[1].some((o) => o[2] === k && o[3] === null)), 'a block placed in prison is taken back');
    await sleep(300);
    assert.ok(!c.msgs.some((m) => m[0] === 'ops' && m[1].some((o) => o[2] === k)), 'nobody else sees it');

    // pavouci v bludišti: Bára jednoho zabije, úkol se posune
    const snap = await b.waitFor((m) => m[0] === 'mobs' && m[3]?.some((x) => x[1] === 'spider'), 30000);
    assert.ok(snap, 'spiders live in the maze');
    const sp = snap[3].find((x) => x[1] === 'spider');
    for (let i = 0; i < 3; i++) { b.send(['hit', sp[0], 20, 0, 1]); await sleep(450); }
    assert.ok(await b.waitFor((m) => m[0] === 'vezeni' && m[1].done === 1), 'a spider killed by the prisoner counts');
    await sleep(1500); // uložení každou sekundu
    for (const p of [boss, b, c]) await p.close();
  } finally { await stop(srv); }
  const file = JSON.parse(fs.readFileSync(path.join(dataDir, 'svet', 'world.json'), 'utf8'));
  assert.deepEqual(Object.values(file.prison.prisoners).map((p) => [p.name, p.kind, p.done]), [['Bára', 'monsters', 1]], 'prisoners are saved with the world');

  srv = await startServer(env);
  try {
    const boss = player(srv.port, 'Šéf', ''), b = player(srv.port, 'Bára', ''), c = player(srv.port, 'Cyril', '');
    for (const p of [boss, b, c]) assert.ok(await p.waitFor((m) => m[0] === 'welcome'));
    b.send(['pose', pose(1.5, 15.5)]);
    const st = await jailMsg(b, true);
    assert.ok(st && st[1].done === 1 && st[1].go, 'after a restart and a new login Bára is still in prison, with her progress');
    // zabití vlastníka v Markově dimenzi: Cyril jde do vězení
    const M = MARK_X + 50;
    c.send(['pose', pose(M, 14)]); boss.send(['pose', pose(M + 2, 14)]);
    await sleep(600);
    c.send(['phit', boss.welcome.pid, 6, 0, 1, 0]);
    assert.ok(await boss.waitFor((m) => m[0] === 'dmg'));
    boss.send(['pose', { ...pose(M + 2, 14), alive: false, hp: 0 }]);
    assert.ok(await jailMsg(c, true), 'killing the owner sends the killer to prison');
    boss.send(['pose', pose(M + 2, 14)]);
    boss.send(['chat', '/propustit bara']);
    assert.ok(await jailMsg(b, false), 'released');
    for (const p of [boss, c]) assert.ok(!p.msgs.some((m) => m[0] === 'chat' && m[1] === 'Šéf'), 'the owner\'s commands are never broadcast');
    for (const p of [boss, b, c]) await p.close();
  } finally { await stop(srv); }
});

test('giant spiders: every spawn step tops them up around a prisoner, even when another player is picked', () => {
  ensurePrison();
  const prisoner = { pos: new Vec3(...PRISON_SPOT), alive: true, creative: false, pid: 'p1' };
  const outside = { pos: new Vec3(60, 0.45, 60), alive: true, creative: false, pid: 'p2' };
  Object.assign(NET, { targets: () => [outside, prisoner], spawnCenter: () => outside.pos });
  for (let i = 0; i < PRISON_SPIDERS; i++) updateSpawns(3, 0);
  assert.equal(mobs.filter((m) => m.type === 'spider').length, PRISON_SPIDERS, 'one spider per step around the prisoner, up to the limit');
  for (const m of mobs.filter((x) => x.type === 'spider')) assert.ok(inPrison(m.pos.x, m.pos.y, m.pos.z));
});
