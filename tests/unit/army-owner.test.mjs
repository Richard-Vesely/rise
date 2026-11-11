// Markova armáda a vlastník serveru kroužku (server/army-owner.js): vlastník velí vždycky, jeho tajná věta (ARMY_PHRASE)
// převezme armádu a znovu ji vrátí Markovi; věta se nikomu nerozesílá ani nezapisuje. Jen server kroužku.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ARMY, armyCommand, isArmyCommand } from '../../shared/sim/army.js';
import { armyPhraseFrom, createArmyOwner } from '../../server/army-owner.js';
import { createProfiles } from '../../server/profiles.js';
import { player, pose, sleep, startServer, stop } from './server-helpers.mjs';

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const PHRASE = 'Zkušební věta pro testy'; // jen pro testy; skutečná věta je jen v env souboru na serveru

// Bez serveru: zprávy a příkazy se sbírají do polí.
function ownerWith({ phrase = armyPhraseFrom(PHRASE), saved, ownerId = 'boss' } = {}) {
  const sent = [], cmds = [];
  const ao = createArmyOwner({
    ownerId, ownerName: 'Riki', phrase, saved,
    send: (cid, m) => sent.push([cid, m]),
    command: (cid, name, text) => { cmds.push([cid, name, text]); return isArmyCommand(text); },
    players: () => [['c-boss', 'Riki'], ['c-mk', 'Marek'], ['c-b', 'Bára']],
  });
  const to = (cid) => sent.filter(([c]) => c === cid).map(([, m]) => m);
  return { ao, sent, cmds, to };
}

test('army: who may command (Marek by name, or whom the server allows)', () => {
  const said = [];
  const ctx = (o) => ({ players: [], mobs: [], pose: null, give() {}, reply: (t) => said.push(t), ...o });
  assert.ok(!armyCommand('b', '/pomoc', ctx({ name: 'Bára' })), 'another player cannot command');
  assert.ok(armyCommand('m', '/pomoc', ctx({ name: 'Marek' })), 'Marek can');
  assert.ok(armyCommand('r', '/pomoc', ctx({ name: 'Riki', leader: true })), 'the server can allow another player');
  assert.ok(!armyCommand('m', '/pomoc', ctx({ name: 'Marek', leader: false })), 'and can stop Marek');
  assert.ok(isArmyCommand('/armada 20') && isArmyCommand('/Útok bára') && !isArmyCommand('/neco') && !isArmyCommand('armada'));
});

test('army owner: the owner commands; others go to the room as before', () => {
  const { ao, cmds, sent } = ownerWith();
  assert.ok(ao.handle('c-boss', 'boss', 'Riki', ['chat', '/armada 4']), 'the owner commands the army');
  assert.deepEqual(cmds, [['c-boss', 'Riki', '/armada 4']]);
  assert.ok(!ao.handle('c-boss', 'boss', 'Riki', ['chat', 'ahoj']), 'normal chat from the owner stays normal chat');
  assert.ok(!ao.handle('c-b', 'kid', 'Bára', ['chat', '/armada 4']), 'a non-owner, non-Marek player: the room decides (it refuses)');
  assert.ok(!ao.handle('c-mk', 'marek', 'Marek', ['chat', '/armada 4']), 'Marek: the room runs his command as today');
  assert.ok(!ao.handle('c-b', 'kid', 'Bára', ['pose', {}]), 'other messages go on');
  assert.equal(cmds.length, 1);
  assert.equal(sent.length, 0, 'nothing hints at the owner before a takeover');
});

test('army owner: the phrase takes over and gives back; from anyone else it is normal chat', () => {
  const { ao, to, sent } = ownerWith();
  assert.ok(!ao.handle('c-b', 'kid', 'Bára', ['chat', PHRASE]), 'a non-owner typing the phrase: just a chat message');
  assert.ok(!ao.handle('c-mk', 'marek', 'Marek', ['chat', PHRASE]));
  assert.equal(sent.length, 0, '…with no effect and no hint');
  assert.ok(!ao.taken());

  ARMY.mode = 'attack'; ARMY.target = 'c-b';
  assert.ok(ao.handle('c-boss', 'boss', 'Riki', ['chat', `  ${PHRASE.toUpperCase()} `]), 'the owner phrase (any case, spaces) is handled');
  assert.ok(ao.taken());
  assert.equal(ARMY.leader, 'c-boss', 'the army turns to the owner');
  assert.equal(ARMY.mode, 'follow', 'and stops an attack');
  assert.match(to('c-boss').at(-1)[2], /jen tebe/, 'the owner gets a confirmation');
  assert.deepEqual(to('c-mk').at(-1), ['chat', '⚔ Armáda', 'Teď posloucháme jen hráče Riki.'], 'Marek is told');
  assert.equal(to('c-b').length, 0, 'nobody else hears anything');
  assert.ok(!sent.some(([, m]) => JSON.stringify(m).toLowerCase().includes(PHRASE.toLowerCase())), 'the phrase is never sent to anyone');

  assert.ok(ao.handle('c-mk', 'marek', 'Marek', ['chat', '/armada 3']), 'Marek\'s commands are stopped');
  assert.deepEqual(to('c-mk').at(-1), ['chat', '⚔ Armáda', 'Teď posloucháme jen hráče Riki.']);
  assert.ok(!ao.handle('c-mk', 'marek', 'Marek', ['chat', 'ahoj']), 'his normal chat stays normal');
  assert.ok(!ao.handle('c-mk', 'marek', 'Marek', ['chat', '/neco']), 'an unknown /command is normal chat too');
  assert.ok(ao.handle('c-boss', 'boss', 'Riki', ['chat', '/stop']), 'the owner still commands');
  assert.deepEqual(ao.save(), { owner: true });

  assert.ok(ao.handle('c-boss', 'boss', 'Riki', ['chat', PHRASE]), 'the phrase again');
  assert.ok(!ao.taken(), 'gives the army back to Marek');
  assert.match(to('c-mk').at(-1)[2], /tebe/);
  assert.ok(!ao.handle('c-mk', 'marek', 'Marek', ['chat', '/armada 3']), 'Marek commands again');
});

test('army owner: no phrase or no owner = no takeover; a saved takeover is kept', () => {
  const off = ownerWith({ phrase: armyPhraseFrom('  ') });
  assert.ok(!off.ao.handle('c-boss', 'boss', 'Riki', ['chat', PHRASE]), 'empty ARMY_PHRASE: the phrase is normal chat');
  assert.ok(!off.ao.taken());
  assert.ok(off.ao.handle('c-boss', 'boss', 'Riki', ['chat', '/armada']), 'the owner still commands');
  const noOwner = ownerWith({ ownerId: '' });
  assert.ok(!noOwner.ao.handle('c-boss', 'boss', 'Riki', ['chat', PHRASE]), 'without OWNER_ID nobody is owner');
  const kept = ownerWith({ saved: { owner: true } });
  assert.ok(kept.ao.taken(), 'the takeover survives a restart');
  assert.ok(kept.ao.handle('c-mk', 'marek', 'Marek', ['chat', '/stop']), 'Marek stays stopped');
  const savedOff = ownerWith({ saved: { owner: true }, phrase: '' });
  assert.ok(!savedOff.ao.taken(), 'a saved takeover does not lock Marek out once the phrase is removed');
  assert.ok(!savedOff.ao.handle('c-mk', 'marek', 'Marek', ['chat', '/stop']));
  assert.deepEqual(ownerWith({ saved: 'junk' }).ao.save(), { owner: false });
});

test('server: the owner commands the army, the phrase takes over (secret), survives a restart, phrase again gives it back', { timeout: 90000 }, async () => {
  const dataDir = tmp('rise-armada-');
  const P = createProfiles(path.join(dataDir, 'players.json'));
  const bossId = P.login({ name: 'Riki', pin: '1234', world: 'svet' }).profile.id;
  const env = { DATA_DIR: dataDir, OWNER_ID: bossId, ARMY_PHRASE: PHRASE, SAVE_SECONDS: '1' };
  const low = PHRASE.toLowerCase();
  const leaked = (p) => p.msgs.some((m) => JSON.stringify(m).toLowerCase().includes(low));
  const army = (p) => { const m = p.msgs.filter((x) => x[0] === 'mobs').at(-1); return m ? m[3].filter((q) => q[1] === 'markoman' || q[1] === 'golem') : []; };
  const said = (p, re) => p.waitFor((m) => m[0] === 'chat' && m[1] === '⚔ Armáda' && re.test(m[2]));
  let srv = await startServer(env);
  try {
    const boss = player(srv.port, 'Riki', ''), mk = player(srv.port, 'Marek', ''), b = player(srv.port, 'Bára', '');
    for (const p of [boss, mk, b]) assert.ok(await p.waitFor((m) => m[0] === 'welcome'));
    for (const [p, x] of [[boss, 60], [mk, 64], [b, 68]]) p.send(['pose', pose(x, 60)]);
    await sleep(400);

    b.send(['chat', '/armada 4']);
    assert.ok(await mk.waitFor((m) => m[0] === 'chat' && m[1] === 'Bára' && m[2] === '/armada 4'), 'a non-owner, non-Marek: normal chat');
    boss.send(['chat', '/armada 4']);
    assert.ok(await said(boss, /svolána/), 'the owner commands the army');
    assert.ok(await boss.waitFor(() => army(boss).length === 4), 'the army appears');
    mk.send(['chat', '/stop']);
    assert.ok(await said(mk, /jde k tobě/), 'Marek commands as before');
    assert.ok(!mk.msgs.some((m) => m[0] === 'chat' && /poslouch/.test(m[2])), 'nothing hints at a takeover');

    b.send(['chat', PHRASE]);
    assert.ok(await mk.waitFor((m) => m[0] === 'chat' && m[1] === 'Bára' && m[2] === PHRASE), 'the phrase from a non-owner is a normal chat message');
    mk.msgs.length = 0;
    boss.send(['chat', ` ${PHRASE.toUpperCase()}  `]);
    assert.ok(await said(boss, /jen tebe/), 'the owner gets a confirmation');
    assert.ok(await said(mk, /^Teď posloucháme jen hráče Riki\.$/), 'Marek is told');
    mk.msgs.length = 0;
    mk.send(['chat', '/armada 3']);
    assert.ok(await said(mk, /posloucháme jen hráče Riki/), 'Marek\'s command gets the reply');
    await sleep(600);
    assert.equal(army(mk).length, 4, '…and does nothing');
    boss.send(['chat', '/stop']);
    assert.ok(await said(boss, /jde k tobě/), 'the owner still commands');
    await sleep(1500); // uložení každou sekundu
    for (const p of [mk, b]) assert.ok(!p.msgs.some((m) => m[0] === 'chat' && m[1] === 'Riki'), 'the owner\'s phrase and commands are never broadcast');
    for (const p of [boss, mk, b]) await p.close();
  } finally { await stop(srv); }
  const file = fs.readFileSync(path.join(dataDir, 'svet', 'world.json'), 'utf8');
  assert.deepEqual(JSON.parse(file).army, { owner: true }, 'the takeover is saved with the world');
  assert.ok(!file.toLowerCase().includes(low), 'the phrase is not saved');
  assert.ok(!srv.out().toLowerCase().includes(low), 'the phrase is not in the server log');

  srv = await startServer(env);
  try {
    const boss = player(srv.port, 'Riki', ''), mk = player(srv.port, 'Marek', ''), b = player(srv.port, 'Bára', '');
    for (const p of [boss, mk, b]) assert.ok(await p.waitFor((m) => m[0] === 'welcome'));
    for (const [p, x] of [[boss, 60], [mk, 64], [b, 68]]) p.send(['pose', pose(x, 60)]);
    await sleep(300);
    mk.send(['chat', '/stop']);
    assert.ok(await said(mk, /posloucháme jen hráče Riki/), 'after a restart Marek is still stopped');
    boss.send(['chat', PHRASE]);
    assert.ok(await said(boss, /zase poslouchá Marka/), 'the phrase again gives control back');
    assert.ok(await said(mk, /Zase posloucháme tebe/));
    mk.msgs.length = 0;
    mk.send(['chat', '/stop']);
    assert.ok(await said(mk, /jde k tobě/), 'Marek commands again');
    await sleep(300);
    for (const p of [mk, b]) assert.ok(!leaked(p) && !p.msgs.some((m) => m[0] === 'chat' && m[1] === 'Riki'), 'nobody else ever sees the phrase');
    for (const p of [boss, mk, b]) await p.close();
  } finally { await stop(srv); }
  assert.ok(!srv.out().toLowerCase().includes(low), 'the phrase is not in the server log');
});
