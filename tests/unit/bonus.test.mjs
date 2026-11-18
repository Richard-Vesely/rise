// Bonusy pro dárce: vlastník serveru je dává příkazem /bonus a bere příkazem /odebrat (server/bonus.js), server si je
// pamatuje u profilu ve všech světech (server/bonuses.js), hráč dostane ['bonus', [druhy]] (client/src/player/bonus.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BONUS_IDS, bonusKind, cleanBonus } from '../../shared/data/bonus.js';
import { bonusReply, createBonusOwner, parseBonus } from '../../server/bonus.js';
import { bonusQuery, createBonuses } from '../../server/bonuses.js';
import { createProfiles } from '../../server/profiles.js';
import { player, pose, sleep, startServer, stop } from './server-helpers.mjs';

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

test('bonus: chat words and commands', () => {
  assert.deepEqual(BONUS_IDS, ['syty', 'obrana', 'let', 'teleport']);
  assert.equal(bonusKind('Létání'), 'let');
  assert.equal(bonusKind('DUCH'), 'teleport');
  assert.equal(bonusKind('hlad'), 'syty');
  assert.equal(bonusKind('vše'), 'vse');
  assert.equal(bonusKind('Pepa'), null);
  assert.deepEqual(cleanBonus(['teleport', 'nesmysl', 'syty', 'syty']), ['syty', 'teleport'], 'fixed order, no junk');
  assert.deepEqual(parseBonus('/bonus'), { op: 'list' });
  assert.deepEqual(parseBonus('/bonus Pepa'), { op: 'show', name: 'Pepa' });
  assert.deepEqual(parseBonus('/bonus Pepa let tp'), { op: 'add', name: 'Pepa', kinds: ['let', 'teleport'] });
  assert.deepEqual(parseBonus('/bonus Jan Novák vše'), { op: 'add', name: 'Jan Novák', kinds: BONUS_IDS }, 'a name with a space');
  assert.deepEqual(parseBonus('/odebrat Pepa'), { op: 'del', name: 'Pepa', kinds: [] }, 'no kind = all');
  assert.deepEqual(parseBonus('/Odebrat Pepa obrana'), { op: 'del', name: 'Pepa', kinds: ['obrana'] });
  assert.ok('say' in parseBonus('/bonus let'), 'kinds without a name: help');
  assert.ok('say' in parseBonus('/odebrat'));
  assert.equal(parseBonus('/vezeni Pepa'), null);
  assert.equal(parseBonus('bonus Pepa let'), null, 'only commands');
  assert.match(bonusReply({ ok: false, op: 'add', name: 'Xyz' }), /neznám/);
  assert.match(bonusReply({ ok: true, op: 'add', name: 'Pepa', list: ['let'] }), /Pepa dostal\(a\) bonus. Teď má: Létání/);
  assert.match(bonusReply({ ok: true, op: 'list', all: [] }), /nikdo/);
});

test('bonus: stored per profile, saved to a file, queries from the worlds', () => {
  const dir = tmp('rise-bonus-');
  const file = path.join(dir, 'bonuses.json');
  const P = createProfiles(path.join(dir, 'players.json'));
  const pepa = P.login({ name: 'Pepa', pin: '1234' }).profile.id;
  const B = createBonuses(file);
  assert.deepEqual(B.get(pepa), []);
  let r = bonusQuery(B, P, { op: 'add', name: 'pepa', kinds: ['teleport', 'let'] });
  assert.deepEqual(r.reply, { ok: true, op: 'add', name: 'Pepa', list: ['let', 'teleport'] });
  assert.deepEqual(r.push, { profile: pepa, list: ['let', 'teleport'] }, 'the new list goes to every world');
  assert.equal(bonusQuery(B, P, { op: 'add', name: 'Pepa', kinds: ['let'] }).push, undefined, 'nothing changed: nothing sent');
  assert.deepEqual(bonusQuery(B, P, { op: 'show', name: 'Pepa' }).reply.list, ['let', 'teleport']);
  assert.deepEqual(bonusQuery(B, P, { op: 'list' }).reply.all, [['Pepa', ['let', 'teleport']]]);
  assert.equal(bonusQuery(B, P, { op: 'add', name: 'Nikdo', kinds: ['let'] }).reply.ok, false, 'unknown player');
  assert.deepEqual(createBonuses(file).get(pepa), ['let', 'teleport'], 'kept after a restart');
  r = bonusQuery(B, P, { op: 'del', name: 'Pepa', kinds: [] });
  assert.deepEqual(r.push, { profile: pepa, list: [] }, 'odebrat without a kind takes all');
  assert.deepEqual(createBonuses(file).all(), []);
  fs.writeFileSync(file, '{rozbité');
  const logs = [];
  assert.deepEqual(createBonuses(file, { log: (t) => logs.push(t) }).all(), [], 'a broken file does not stop the server');
  assert.equal(logs.length, 1);
});

test('bonus: in a world only the owner commands; the player gets the list once the game runs', () => {
  const sent = [], asked = [];
  const W = createBonusOwner({ ownerId: 'boss', send: (cid, m) => sent.push([cid, m]), ask: (q, done) => asked.push([q, done]) });
  W.join('c1', 'boss', []);
  W.join('c2', 'kid', ['let']);
  assert.equal(W.handle('c2', 'kid', ['chat', '/bonus kid vse']), false, 'from anyone else it is normal chat');
  assert.equal(asked.length, 0);
  assert.equal(sent.length, 0, 'nothing before the first pose');
  assert.equal(W.handle('c2', 'kid', ['pose', {}]), false, 'the pose goes on to the room');
  assert.deepEqual(sent.pop(), ['c2', ['bonus', ['let']]]);
  assert.equal(W.handle('c1', 'boss', ['chat', '/bonus kid obrana']), true, 'the owner\'s command is not broadcast');
  assert.deepEqual(asked[0][0], { op: 'add', name: 'kid', kinds: ['obrana'] });
  asked[0][1]({ ok: true, op: 'add', name: 'kid', list: ['obrana', 'let'] });
  assert.deepEqual(sent.pop(), ['c1', ['chat', '🎁 Bonusy', 'kid dostal(a) bonus. Teď má: Velká obrana, Létání']]);
  W.update('kid', ['obrana', 'let']);
  assert.deepEqual(sent.pop(), ['c2', ['bonus', ['obrana', 'let']]]);
  assert.equal(W.handle('c1', 'boss', ['chat', 'ahoj']), false);
  W.gone('c2');
  W.update('kid', []);
  assert.equal(sent.length, 0, 'gone: nothing sent');
});

test('bonus on the server: the owner grants and takes bonuses, they work in every world and after a restart', async () => {
  const dataDir = tmp('rise-bonus-srv-');
  const P = createProfiles(path.join(dataDir, 'players.json'));
  const login = (name) => P.login({ name, pin: '1234', world: 'svet' }).profile.id;
  const bossId = login('Šéf'); login('Bára');
  const env = { DATA_DIR: dataDir, OWNER_ID: bossId, SAVE_SECONDS: '1', WORLDS: 'svet:Hlavní svět,druhy:Druhý svět' };
  const bonusMsg = (p, fn) => p.waitFor((m) => m[0] === 'bonus' && fn(m[1]));
  let srv = await startServer(env);
  try {
    const boss = player(srv.port, 'Šéf', '', { v: 2, world: 'svet' }), b = player(srv.port, 'Bára', '', { v: 2, world: 'druhy' });
    for (const p of [boss, b]) assert.ok(await p.waitFor((m) => m[0] === 'welcome'));
    boss.send(['pose', pose(60, 60)]); b.send(['pose', pose(64, 60)]);
    await sleep(300);
    assert.ok(!b.msgs.some((m) => m[0] === 'bonus'), 'no bonuses: nothing sent');

    b.send(['chat', '/bonus Bára vse']);
    await sleep(300);
    assert.ok(!b.msgs.some((m) => m[0] === 'bonus'), 'a player cannot give herself bonuses');
    boss.send(['chat', '/bonus bara let teleport']);
    assert.ok(await bonusMsg(b, (l) => l.join() === 'let,teleport'), 'Bára gets them at once, in another world');
    assert.ok(await boss.waitFor((m) => m[0] === 'chat' && m[1] === '🎁 Bonusy' && /Bára dostal\(a\) bonus/.test(m[2])));
    boss.send(['chat', '/bonus']);
    assert.ok(await boss.waitFor((m) => m[0] === 'chat' && /Bára \(Létání, Teleport duchem\)/.test(m[2])), 'the list');
    boss.send(['chat', '/bonus Nikdo let']);
    assert.ok(await boss.waitFor((m) => m[0] === 'chat' && /neznám/.test(m[2])));
    assert.ok(!b.msgs.some((m) => m[0] === 'chat' && m[1] === 'Šéf'), 'the owner\'s commands are never broadcast');
    boss.send(['chat', '/odebrat Bára teleport']);
    assert.ok(await bonusMsg(b, (l) => l.join() === 'let'), 'taken away');
    for (const p of [boss, b]) await p.close();
    await stop(srv);

    srv = await startServer(env);
    const b2 = player(srv.port, 'Bára', '', { v: 2, world: 'svet' });
    assert.ok(await b2.waitFor((m) => m[0] === 'welcome'));
    b2.send(['pose', pose(64, 60)]);
    assert.ok(await bonusMsg(b2, (l) => l.join() === 'let'), 'kept after a restart, in any world');
    await b2.close();
  } finally { await stop(srv); }
});
