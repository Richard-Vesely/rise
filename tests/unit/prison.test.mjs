// Vězení serveru kroužku: vlastník posílá hráče do vězení (/vezeni) a propouští (/propustit), kdo zabije vlastníka,
// jde tam sám; ven za PRISON_RELEASE ok obřího pavouka. Pravidla: server/prison.js, stavba a pavouci: shared/world/prison.js,
// shared/sim/mobs.js. Jen server kroužku.
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
import { PRISON, PRISON_ITEM, PRISON_RELEASE, PRISON_SPIDERS, PRISON_SPOT, SPAWN_SPOT, ensurePrison, guardPrisonerOps, inPrison, prisonBuilt } from '../../shared/world/prison.js';
import { bkey, blocks, ruinsBuilt } from '../../shared/world/state.js';
import { guardStatueOps } from '../../shared/world/statue.js';
import { MARK_X, terrainH } from '../../shared/world/terrain.js';
import { createPrison } from '../../server/prison.js';
import { createProfiles } from '../../server/profiles.js';
import { player, pose, sleep, startServer, stop } from './server-helpers.mjs';

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const { x: X, y: Y, z: Z, half: H } = PRISON;

beforeEach(() => { mobs.length = 0; blocks.clear(); ruinsBuilt.clear(); NET.mode = 'sp'; NET.client = false; NET.killer = null; });

test('prison: built once high in the sky; white fixed blocks that nobody can break or build on', () => {
  assert.equal(ensurePrison(), true);
  assert.equal(ensurePrison(), false, 'only once');
  assert.ok(prisonBuilt());
  assert.equal(PRISON_RELEASE, 10, 'release amount (Richard: not decided yet, default 10)');
  assert.ok(BLOCKS.prison_block.fixed && BLOCKS.prison_block.drop === null && !ITEMS.prison_block, 'unbreakable, not an item');
  for (let dx = -H; dx <= H; dx += 4) for (let dz = -H; dz <= H; dz += 4) assert.equal(blocks.get(bkey(X + dx, Y, Z + dz)), 'prison_block', 'flat floor');
  for (let y = 1; y <= PRISON.wall; y++) assert.equal(blocks.get(bkey(X + H + 1, Y + y, Z)), 'prison_block', 'wall: no way out');
  assert.ok(Y > terrainH(X, Z) + 60, 'far above the ground');
  const box = [...blocks].find(([, v]) => v === 'donation_box');
  assert.ok(box, 'a copy of the statue with the donation box inside');
  const [bx, by, bz] = box[0].split(',').map(Number);
  assert.ok(inPrison(bx, by, bz) && inPrison(...PRISON_SPOT) && !inPrison(...SPAWN_SPOT) && !inPrison(X, 0, Z));
  assert.equal(blocks.get(bkey(Math.floor(PRISON_SPOT[0]), Y, Math.floor(PRISON_SPOT[2]))), 'prison_block', 'the prisoner stands on the floor');
  for (const id of blocks.values()) assert.ok(BLOCKS[id]?.fixed, `${id} is fixed`);

  const floor = bkey(X, Y, Z);
  const g = guardStatueOps([['m', 'blocks', floor, null], ['m', 'blocks', bkey(X + 3, Y + 1, Z), 'planks']]);
  assert.deepEqual(g.fix, [['m', 'blocks', floor, 'prison_block']], 'breaking a prison block is undone for everyone');
  const p = guardPrisonerOps([['m', 'blocks', bkey(X + 3, Y + 1, Z), 'planks'], ['m', 'blockMeta', floor, 1], ['v', 5, 0, 5, 0], ['g', 'g1', 'iron', 1, [0, 0, 0], [0, 0, 0], 0], ['gx', 'g1', 1], ['r', {}], ['p']]);
  assert.deepEqual(p.ops.map((o) => o[0]), ['g', 'gx'], 'a prisoner cannot place blocks, dig or build: only dropped items pass');
  assert.deepEqual(p.fix[0], ['m', 'blocks', bkey(X + 3, Y + 1, Z), null], 'the placed block disappears again');
  assert.equal(p.fix.at(-1)[0], 'v');
});

test('giant spiders: only in the prison, walk on its floor, attack the prisoner and drop the prison item', () => {
  ensurePrison();
  const hits = [], given = [];
  const target = { pos: new Vec3(...PRISON_SPOT), alive: true, creative: false, pid: 'p1' };
  Object.assign(NET, { targets: () => [target], spawnCenter: () => target.pos, sendTo: (pid, m) => m[0] === 'dmg' && hits.push(m[1]), give: (pid, id, n) => given.push([pid, id, n]) });
  for (let i = 0; i < 20; i++) updateSpawns(3, 0);
  const sp = mobs.filter((m) => m.type === 'spider');
  assert.equal(sp.length, PRISON_SPIDERS, 'a few spiders, no other mobs');
  assert.equal(mobs.length, PRISON_SPIDERS);
  assert.ok(MOBS.spider.hp >= 25 && MOBS.spider.dmg >= 10, 'strong');
  for (let i = 0; i < 400; i++) updateMobs(0.05, 1);
  for (const m of sp) {
    assert.equal(m.pos.y, Y + 1, 'on the floor, not on the ground far below');
    assert.ok(Math.abs(m.pos.x - X - 0.5) < H + 1 && Math.abs(m.pos.z - Z - 0.5) < H + 1, 'inside the walls');
  }
  assert.ok(hits.length > 0 && hits.every((d) => d === MOBS.spider.dmg), 'they bite the prisoner');
  NET.killer = 'p1';
  try { hurtMob(sp[0], 999, 0); } finally { NET.killer = null; }
  assert.deepEqual(given, [['p1', PRISON_ITEM, 1]], 'a killed spider gives its eye');
  assert.equal(ITEMS[PRISON_ITEM].name, 'Oko obřího pavouka');
  assert.ok(ITEMS[PRISON_ITEM].art, 'it has an icon');

  // Štvanice (hůl vlastníka) na vězně: pavouci zůstanou ve vězení, tvor na zemi pod vězením se k vězni nedostane
  startHunt('p1');
  const boar = spawnMob('boar', X + 3, Z + 3);
  hits.length = 0;
  for (let i = 0; i < 300; i++) updateMobs(0.05, 1);
  stopHunt();
  for (const m of mobs.filter((x) => x.type === 'spider' && !x.dead)) assert.ok(m.pos.y === Y + 1 && Math.abs(m.pos.z - Z - 0.5) < H + 1, 'a hunt does not pull spiders out');
  assert.ok(boar.pos.y < Y - 50, 'a hunted mob below stays on the ground (not pulled into the prison)');
  assert.ok(hits.every((d) => d === MOBS.spider.dmg), 'only the spiders bite');
  mobs.length = 0;
  target.pos.set(60, 0.45, 60); // venku: žádní pavouci
  for (let i = 0; i < 40; i++) updateSpawns(3, 0);
  assert.ok(!mobs.some((m) => m.type === 'spider'), 'spiders never appear outside the prison');
  mobs.length = 0; blocks.clear(); ruinsBuilt.clear();
  target.pos.set(...PRISON_SPOT);
  for (let i = 0; i < 10; i++) updateSpawns(3, 0);
  assert.equal(mobs.length, 0, 'no prison built (single player, browser host): no spiders');
});

// Vězení bez serveru: zprávy se sbírají do pole.
function jailWith({ saved, online = [['c-boss', 'boss', 'Šéf'], ['c-b', 'kid', 'Bára'], ['c-c', 'cyril', 'Cyril']], t = { now: 0 } } = {}) {
  const sent = [], box = [], logs = [];
  const profiles = { bára: { id: 'kid', name: 'Bára' }, cyril: { id: 'cyril', name: 'Cyril' }, dan: { id: 'dan', name: 'Dan' }, šéf: { id: 'boss', name: 'Šéf' } };
  const P = createPrison({
    ownerId: 'boss', ownerName: 'Šéf', saved, now: () => t.now, log: (l) => logs.push(l),
    send: (cid, m) => sent.push([cid, m]),
    conns: () => online.map(([cid, profile, name]) => [cid, { profile, name }]),
    lookup: (name, done) => done(profiles[name.toLowerCase()] || null),
    put: (id, n) => box.push([id, n]),
  });
  const to = (cid, type) => sent.filter(([c, m]) => c === cid && (!type || m[0] === type)).map(([, m]) => m);
  return { P, sent, box, logs, to, t };
}

test('prison commands: only the owner sends and releases; from anyone else it is normal chat', () => {
  const { P, to, sent } = jailWith();
  assert.equal(P.handle('c-b', 'kid', ['chat', '/vezeni Cyril']), false, 'a non-owner: normal chat');
  assert.equal(P.handle('c-b', 'kid', ['chat', '/propustit Bára']), false);
  assert.equal(sent.length, 0);
  assert.equal(P.handle('c-boss', 'boss', ['chat', 'ahoj']), false, 'the owner\'s normal chat stays chat');
  assert.equal(P.handle('c-boss', 'boss', ['chat', '/armada 4']), false, 'other commands go on (army)');

  assert.equal(P.handle('c-boss', 'boss', ['chat', '/vězení bára']), true, 'the owner sends (any case, with or without diacritics)');
  assert.ok(P.isPrisoner('kid'));
  const st = to('c-b', 'vezeni')[0][1];
  assert.deepEqual(st, { on: true, need: PRISON_RELEASE, given: 0, item: PRISON_ITEM, at: PRISON_SPOT, go: 1 }, 'the prisoner is moved into the prison');
  assert.match(to('c-boss', 'chat').at(-1)[2], /Bára je ve vězení/);
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
  assert.match(to('c-boss', 'chat').at(-1)[2], /Bára 0\/10.*Dan 0\/10/, 'the list');

  assert.equal(P.handle('c-b', 'kid', ['chat', '/svet kreativ']), true, 'a prisoner\'s commands do nothing (no /svet, no army)');
  assert.equal(P.handle('c-b', 'kid', ['chat', 'pomoc']), false, 'but a prisoner can chat');

  assert.equal(P.handle('c-boss', 'boss', ['chat', '/propustit Bára']), true);
  assert.ok(!P.isPrisoner('kid'));
  assert.deepEqual(to('c-b', 'vezeni').at(-1)[1], { on: false, at: SPAWN_SPOT, go: 1 }, 'released: back to spawn');
  P.handle('c-boss', 'boss', ['chat', '/propustit Bára']);
  assert.match(to('c-boss', 'chat').at(-1)[2], /není/);
});

test('prison: donating the release amount of spider eyes sets the prisoner free; other items come back', () => {
  const { P, to, box } = jailWith();
  P.handle('c-boss', 'boss', ['chat', '/vezeni Bára']);
  assert.equal(P.handle('c-b', 'kid', ['donate', 'iron', 5]), true);
  assert.deepEqual(to('c-b', 'give').at(-1), ['give', 'iron', 5], 'other items are given back');
  assert.match(to('c-b', 'toast').at(-1)[1], /jen Oko obřího pavouka/);
  assert.equal(P.handle('c-c', 'cyril', ['donate', 'iron', 5]), false, 'a free player donates normally (donation box)');
  const gives = to('c-b', 'give').length;
  assert.equal(P.handle('c-b', 'kid', ['donate', 'owner_wand', 1]), true);
  assert.equal(to('c-b', 'give').length, gives, 'the owner wand is never given to a prisoner (not donatable at the prison box)');
  P.handle('c-b', 'kid', ['donate', PRISON_ITEM, 4]);
  assert.deepEqual(box, [[PRISON_ITEM, 4]], 'the eyes go to the owner\'s box');
  assert.equal(to('c-b', 'vezeni').at(-1)[1].given, 4);
  assert.ok(P.isPrisoner('kid'));
  P.handle('c-b', 'kid', ['donate', PRISON_ITEM, 9]);
  assert.deepEqual(box, [[PRISON_ITEM, 4], [PRISON_ITEM, 6]], 'only what is still needed');
  assert.deepEqual(to('c-b', 'give').at(-1), ['give', PRISON_ITEM, 3], 'the rest comes back');
  assert.ok(!P.isPrisoner('kid'), `${PRISON_RELEASE} eyes = free`);
  assert.deepEqual(to('c-b', 'vezeni').at(-1)[1], { on: false, at: SPAWN_SPOT, go: 1 });
  assert.match(to('c-boss', 'chat').at(-1)[2], /Bára daroval\(a\) 10× .* volný/, 'the owner is told');
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

test('prison: positions are enforced and the state survives a restart', () => {
  const t = { now: 0 };
  const { P, to } = jailWith({ t });
  P.handle('c-boss', 'boss', ['chat', '/vezeni Bára']);
  const n = () => to('c-b', 'vezeni').length;
  const k = n();
  t.now = 5000;
  P.handle('c-b', 'kid', ['pose', pose(PRISON_SPOT[0], PRISON_SPOT[2])]); // y 0.45: on the ground far below = outside
  assert.equal(n(), k + 1, 'a prisoner outside the prison is sent back');
  P.handle('c-b', 'kid', ['pose', { ...pose(1, 15), y: 0.45 }]);
  assert.equal(n(), k + 1, 'at most once per 2 s');
  t.now = 8000;
  P.handle('c-b', 'kid', ['pose', { ...pose(1, 15), alive: false }]);
  assert.equal(n(), k + 1, 'not while dead (the respawn puts them back)');
  P.handle('c-b', 'kid', ['pose', { ...pose(PRISON_SPOT[0], PRISON_SPOT[2]), y: PRISON_SPOT[1] }]);
  assert.equal(n(), k + 1, 'inside: nothing');
  P.handle('c-c', 'cyril', ['pose', { ...pose(PRISON_SPOT[0], PRISON_SPOT[2]), y: PRISON_SPOT[1] }]);
  assert.deepEqual(to('c-c', 'vezeni').at(-1)[1], { on: false, at: SPAWN_SPOT, go: 1 }, 'a free player in the prison (released while away) goes to spawn');
  P.handle('c-boss', 'boss', ['pose', { ...pose(PRISON_SPOT[0], PRISON_SPOT[2]), y: PRISON_SPOT[1] }]);
  assert.equal(to('c-boss', 'vezeni').length, 0, 'the owner may visit');
  P.handle('c-b', 'kid', ['donate', PRISON_ITEM, 3]);

  const saved = JSON.parse(JSON.stringify(P.save()));
  assert.deepEqual(saved, { prisoners: { kid: { name: 'Bára', given: 3 } } });
  const back = jailWith({ saved, t });
  assert.ok(back.P.isPrisoner('kid'), 'still in prison after a restart');
  back.P.handle('c-b', 'kid', ['pose', pose(1, 15)]);
  assert.deepEqual(back.to('c-b', 'vezeni')[0][1], { on: true, need: PRISON_RELEASE, given: 3, item: PRISON_ITEM, at: PRISON_SPOT, go: 1 }, 'the first pose after joining: into the prison, with the progress');
  assert.deepEqual(jailWith({ saved: { prisoners: { x: null, y: 'junk' } } }).P.list(), [], 'saved junk is dropped');
  assert.deepEqual(jailWith({ saved: 'junk' }).P.save(), { prisoners: {} });
  assert.ok(!jailWith({ saved: { prisoners: { boss: { name: 'Šéf', given: 0 } } } }).P.isPrisoner('boss'), 'the owner is never in prison, even from an old save');
});

test('server: /vezeni and /propustit from the owner, no building in prison, release by eyes, owner kill, survives a restart', { timeout: 120000 }, async () => {
  const dataDir = tmp('rise-vezeni-');
  const P = createProfiles(path.join(dataDir, 'players.json'));
  const login = (name) => P.login({ name, pin: '1234', world: 'svet' }).profile.id;
  const bossId = login('Šéf'); login('Bára'); login('Cyril');
  const env = { DATA_DIR: dataDir, OWNER_ID: bossId, SAVE_SECONDS: '1', WORLDS: 'svet:Hlavní svět:pvp-mark' };
  const jailMsg = (p, on) => p.waitFor((m) => m[0] === 'vezeni' && m[1].on === on);
  const inside = { ...pose(PRISON_SPOT[0], PRISON_SPOT[2]), y: PRISON_SPOT[1] };
  let srv = await startServer(env);
  try {
    const boss = player(srv.port, 'Šéf', ''), b = player(srv.port, 'Bára', ''), c = player(srv.port, 'Cyril', '');
    for (const p of [boss, b, c]) assert.ok(await p.waitFor((m) => m[0] === 'welcome'));
    assert.ok(boss.welcome.world.blocks.some(([, v]) => v === 'prison_block'), 'the prison is in the world');
    for (const [p, x] of [[boss, 60], [b, 64], [c, 68]]) p.send(['pose', pose(x, 60)]);
    await sleep(300);

    c.send(['chat', '/vezeni Bára']);
    assert.ok(await b.waitFor((m) => m[0] === 'chat' && m[1] === 'Cyril' && m[2] === '/vezeni Bára'), 'from a non-owner it is normal chat');
    assert.ok(!b.msgs.some((m) => m[0] === 'vezeni'));
    boss.send(['chat', '/vezeni Bára']);
    const st = await jailMsg(b, true);
    assert.ok(st && st[1].go, 'Bára goes to prison');
    assert.ok(await boss.waitFor((m) => m[0] === 'chat' && /Bára je ve vězení/.test(m[2])));
    b.send(['pose', inside]);
    const before = b.msgs.length;
    const k = bkey(X + 2, Y + 1, Z + 2);
    b.send(['ops', false, [['m', 'blocks', k, 'planks']]]);
    assert.ok(await b.waitFor((m) => m[0] === 'ops' && m[1].some((o) => o[2] === k && o[3] === null)), 'a block placed in prison is taken back');
    await sleep(300);
    assert.ok(!c.msgs.some((m) => m[0] === 'ops' && m[1].some((o) => o[2] === k)), 'nobody else sees it');
    assert.ok(b.msgs.length > before);
    boss.send(['chat', '/propustit bara']);
    assert.ok(await jailMsg(b, false), 'released');
    for (const p of [boss, c]) assert.ok(!p.msgs.some((m) => m[0] === 'chat' && m[1] === 'Šéf'), 'the owner\'s commands are never broadcast');

    // zabití vlastníka v Markově dimenzi: Cyril jde do vězení
    const M = MARK_X + 50;
    c.send(['pose', pose(M, 14)]); boss.send(['pose', pose(M + 2, 14)]);
    await sleep(600);
    c.send(['phit', boss.welcome.pid, 6, 0, 1, 0]);
    assert.ok(await boss.waitFor((m) => m[0] === 'dmg'));
    boss.send(['pose', { ...pose(M + 2, 14), alive: false, hp: 0 }]);
    assert.ok(await jailMsg(c, true), 'killing the owner sends the killer to prison');
    assert.ok(await c.waitFor((m) => m[0] === 'toast' && /vlastníka/.test(m[1])));
    boss.send(['pose', pose(M + 2, 14)]);

    // Bára jde zase do vězení, daruje 4 oka a odhlásí se
    boss.send(['chat', '/vezeni Bára']);
    await sleep(300);
    b.send(['pose', inside]);
    b.send(['donate', PRISON_ITEM, 4]);
    assert.ok(await b.waitFor((m) => m[0] === 'vezeni' && m[1].given === 4));
    await sleep(1500); // uložení každou sekundu
    for (const p of [boss, b, c]) await p.close();
  } finally { await stop(srv); }
  const file = JSON.parse(fs.readFileSync(path.join(dataDir, 'svet', 'world.json'), 'utf8'));
  assert.deepEqual(Object.values(file.prison.prisoners).map((p) => [p.name, p.given]).sort(), [['Bára', 4], ['Cyril', 0]], 'prisoners are saved with the world');

  srv = await startServer(env);
  try {
    const boss = player(srv.port, 'Šéf', ''), b = player(srv.port, 'Bára', '');
    for (const p of [boss, b]) assert.ok(await p.waitFor((m) => m[0] === 'welcome'));
    b.send(['pose', pose(1.5, 15.5)]);
    const st = await jailMsg(b, true);
    assert.ok(st && st[1].given === 4 && st[1].go, 'after a restart and a new login Bára is still in prison');
    b.send(['pose', inside]);
    b.send(['donate', PRISON_ITEM, 6]);
    assert.ok(await jailMsg(b, false), `${PRISON_RELEASE} eyes in total: free`);
    assert.ok(await boss.waitFor((m) => m[0] === 'chat' && /Bára daroval/.test(m[2])), 'the owner is told');
    boss.send(['dary']);
    assert.ok(await boss.waitFor((m) => m[0] === 'dary' && m[1].box?.some(([id, n]) => id === PRISON_ITEM && n === 10)), 'the eyes are in the owner\'s box');
    for (const p of [boss, b]) await p.close();
  } finally { await stop(srv); }
});
