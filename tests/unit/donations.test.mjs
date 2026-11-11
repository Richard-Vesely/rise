// Socha darů s pokladničkou (jen server kroužku): dát může každý, brát jen vlastník (OWNER_ID), kniha darů,
// dárky od správce na /admin/dary. Pravidla: server/owner.js, server/donation-box.js, server/donations.js,
// server/donations-admin.js, stavba: shared/world/statue.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ITEMS } from '../../shared/data/index.js';
import { blocks, bkey } from '../../shared/world/state.js';
import { ensureStatue, guardStatueOps, isFixedKey } from '../../shared/world/statue.js';
import { createDonationBox } from '../../server/donation-box.js';
import { createDonations } from '../../server/donations.js';
import { isOwner, ownerIdFrom } from '../../server/owner.js';
import { createProfiles } from '../../server/profiles.js';
import { player, pose, sleep, startServer, stop } from './server-helpers.mjs';

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

test('owner: only the configured profile; empty OWNER_ID = nobody', () => {
  assert.equal(ownerIdFrom('  abc  '), 'abc');
  assert.equal(ownerIdFrom(undefined), '');
  assert.ok(isOwner('abc', 'abc'));
  assert.ok(!isOwner('abc', 'xyz'));
  assert.ok(!isOwner('', ''), 'empty OWNER_ID: nobody is owner');
  assert.ok(!isOwner('', null));
  assert.ok(!isOwner('abc', null), 'a player without a profile is never the owner');
});

// Pokladnička bez serveru: zprávy se sbírají do pole.
function boxWith(saved) {
  const sent = [], gifts = [];
  const box = createDonationBox({ ownerId: 'boss', ownerName: 'Šéf', saved, send: (cid, m) => sent.push([cid, m]), onDonation: (d) => gifts.push(d) });
  return { box, sent, ledger: gifts, last: (cid, type) => sent.filter(([c, m]) => c === cid && m[0] === type).pop()?.[1] };
}

test('donation box: anyone can put in, the donation goes to the ledger', () => {
  const { box, ledger, last } = boxWith();
  assert.ok(box.handle('c1', 'kid', 'Bára', ['donate', 'iron', 5]));
  assert.deepEqual(ledger, [{ by: 'kid', name: 'Bára', id: 'iron', n: 5 }]);
  assert.equal(box.count(), 5);
  assert.equal(last('c1', 'dary')[1].box, null, 'a player does not see the box contents');
  box.handle('c1', 'kid', 'Bára', ['donate', 'iron', 3]);
  assert.deepEqual(box.save(), [{ id: 'iron', n: 8 }], 'same items stack up');
  box.handle('c1', 'kid', 'Bára', ['donate', 'nonsense', 1]);
  box.handle('c1', 'kid', 'Bára', ['donate', 'iron', 0]);
  box.handle('c1', 'kid', 'Bára', ['donate', 'iron', ITEMS.iron.stack + 1]);
  assert.equal(ledger.length, 2, 'unknown items and wrong counts are ignored');
  box.handle('c2', 'boss', 'Šéf', ['donate', 'apple', 2]);
  assert.equal(ledger.length, 2, 'the owner putting things in is not a donation');
  assert.equal(box.count(), 10);
  assert.ok(!box.handle('c1', 'kid', 'Bára', ['chat', 'ahoj']), 'other messages go on to the room');
});

test('donation box: a non-owner take is rejected and resynced; the owner takes', () => {
  const { box, sent, last } = boxWith([{ id: 'iron', n: 70 }, { id: 'apple', n: 2 }]);
  box.handle('c1', 'kid', 'Bára', ['take', 0, 'iron']);
  assert.ok(!sent.some(([, m]) => m[0] === 'give'), 'nothing is given to a non-owner');
  assert.match(last('c1', 'toast')[1], /jen Šéf/);
  assert.equal(last('c1', 'dary')[1].owner, false, 'the player gets the real state back');
  assert.equal(box.count(), 72, 'the box is unchanged');
  box.handle('c1', null, 'Host', ['take', 0, 'iron']);
  assert.equal(box.count(), 72, 'no profile, no take');

  box.handle('c2', 'boss', 'Šéf', ['dary']);
  assert.deepEqual(last('c2', 'dary')[1].box, [['iron', 70, 0], ['apple', 2, 0]], 'the owner sees the contents');
  box.handle('c2', 'boss', 'Šéf', ['take', 0, 'iron']);
  assert.deepEqual(last('c2', 'give'), ['give', 'iron', ITEMS.iron.stack], 'one stack per click');
  assert.equal(box.count(), 72 - ITEMS.iron.stack);
  box.handle('c2', 'boss', 'Šéf', ['take', 0, 'apple']);
  assert.equal(box.count(), 72 - ITEMS.iron.stack, 'a stale index (the box changed) takes nothing');
  box.handle('c2', 'boss', 'Šéf', ['take', 1, 'apple']);
  assert.deepEqual(last('c2', 'give'), ['give', 'apple', 2]);
  assert.deepEqual(box.save(), [{ id: 'iron', n: 70 - ITEMS.iron.stack }]);
});

test('donation box: nobody is owner without OWNER_ID; saved junk is dropped', () => {
  const sent = [];
  const box = createDonationBox({ ownerId: '', saved: [{ id: 'iron', n: 3 }, { id: 'nope', n: 1 }, { id: 'apple', n: -1 }, null], send: (c, m) => sent.push(m), onDonation: () => {} });
  assert.equal(box.count(), 3);
  box.handle('c', '', '', ['take', 0, 'iron']);
  box.handle('c', 'anyone', 'X', ['take', 0, 'iron']);
  assert.equal(box.count(), 3);
  assert.ok(!sent.some((m) => m[0] === 'give'));
});

test('ledger: totals, top donors, gifts, and it survives save and load', () => {
  const file = path.join(tmp('rise-don-'), 'donations.json');
  let t = Date.parse('2026-11-11T10:00:00Z');
  const L = createDonations(file, { now: () => (t += 1000) });
  assert.ok(L.add({ by: 'a', name: 'Ája', id: 'iron', n: 5, world: 'svet' }));
  assert.ok(L.add({ by: 'b', name: 'Bára', id: 'apple', n: 2, world: 'svet' }));
  assert.ok(L.add({ by: 'a', name: 'Ája', id: 'coal', n: 1, world: 'kreativ' }));
  assert.equal(L.add({ by: 'a', name: 'Ája', id: 'nonsense', n: 1 }), null);
  assert.deepEqual(L.top(), [['Ája', 6], ['Bára', 2]]);
  assert.deepEqual(L.top(5, (id) => (id === 'b' ? 'Barbora' : undefined)), [['Ája', 6], ['Barbora', 2]], 'the current nickname wins');
  assert.equal(L.list()[0].id, 'coal', 'newest first');
  assert.ok(L.queueGift('b', 'Bára', 'iron', 3));
  assert.equal(L.queueGift('b', 'Bára', 'iron', 0), null);
  assert.equal(L.queueGift('b', 'Bára', 'nonsense', 1), null);

  const back = createDonations(file);
  assert.equal(back.list().length, 3, 'the ledger is persisted');
  assert.deepEqual(back.list()[2], { t: '2026-11-11T10:00:01.000Z', by: 'a', name: 'Ája', id: 'iron', n: 5, world: 'svet' });
  assert.deepEqual(back.takeGifts('b'), [{ id: 'iron', n: 3 }], 'a gift waits for the player');
  assert.deepEqual(back.takeGifts('b'), [], 'and is delivered once');
  assert.ok(createDonations(file).gifts()[0].delivered, 'delivery is saved');
  assert.ok(fs.readdirSync(path.join(path.dirname(file), 'backups')).some((f) => f.startsWith('donations-')), 'daily backup');
});

test('statue: built once near spawn with the box in front; its blocks cannot be changed', () => {
  const s = ensureStatue();
  assert.ok(s, 'built');
  assert.equal(ensureStatue(), null, 'only once');
  assert.ok(Math.hypot(s.x - 1.5, s.z - 15.5) > 8 && Math.hypot(s.x - 1.5, s.z - 15.5) < 30, 'near spawn but not on it');
  const box = [...blocks].find(([, v]) => v === 'donation_box');
  assert.ok(box, 'the donation box stands');
  const [bx, by, bz] = box[0].split(',').map(Number);
  assert.deepEqual([bx, bz], [s.x, s.z - 2], 'in front of the statue');
  assert.equal(blocks.get(bkey(s.x, by + 6, s.z)), 'statue_gold', 'the figure is 7 blocks tall');
  assert.ok(isFixedKey(box[0]));
  assert.ok(!ITEMS.donation_box && !ITEMS.statue_gold, 'statue blocks are not items');
  const g = guardStatueOps([['m', 'blocks', box[0], null], ['m', 'blocks', '50,1,50', 'planks'], ['v', bx, by - 1, bz, 0], ['v', 60, 0, 60, 0]]);
  assert.deepEqual(g.ops, [['m', 'blocks', '50,1,50', 'planks'], ['v', 60, 0, 60, 0]]);
  assert.deepEqual(g.fix, [['m', 'blocks', box[0], 'donation_box']]);
});

test('server: donate, owner-only take, statue guard, admin donations page and gift, restart', { timeout: 90000 }, async () => {
  const dataDir = tmp('rise-dary-');
  const P = createProfiles(path.join(dataDir, 'players.json'));
  const login = (name) => P.login({ name, pin: '1234', world: 'svet' }).profile.id;
  const bossId = login('Šéf'), kidId = login('Bára'), cyrilId = login('Cyril');
  const env = { DATA_DIR: dataDir, OWNER_ID: bossId, ADMIN_PASSWORD: 'spravce', SAVE_SECONDS: '1' };
  const auth = { authorization: 'Basic ' + Buffer.from('x:spravce').toString('base64') };
  let srv = await startServer(env);
  const base = () => `http://127.0.0.1:${srv.port}`;
  try {
    const kid = player(srv.port, 'Bára', '');
    await kid.ready;
    assert.ok(await kid.waitFor((m) => m[0] === 'welcome'));
    const boxKey = kid.welcome.world.blocks.find(([, v]) => v === 'donation_box')?.[0];
    assert.ok(boxKey, 'the statue with the donation box is in the world');
    const st = await kid.waitFor((m) => m[0] === 'dary');
    assert.equal(st[1].owner, false);
    assert.equal(st[1].box, null);
    assert.equal(st[1].ownerName, 'Šéf');

    kid.send(['donate', 'iron', 5]);
    assert.ok(await kid.waitFor((m) => m[0] === 'toast' && /Díky/.test(m[1])), 'thanks for the donation');
    assert.ok(await kid.waitFor((m) => m[0] === 'dary' && m[1].top.some(([n, k]) => n === 'Bára' && k === 5)), 'the leaderboard updates');
    kid.msgs.length = 0;
    kid.send(['take', 0, 'iron']);
    assert.ok(await kid.waitFor((m) => m[0] === 'toast' && /jen Šéf/.test(m[1])), 'a non-owner take is refused');
    await sleep(300);
    assert.ok(!kid.msgs.some((m) => m[0] === 'give'), 'and gives nothing');

    kid.send(['ops', 0, [['m', 'blocks', boxKey, null]]]);
    assert.ok(await kid.waitFor((m) => m[0] === 'ops' && m[1].some((o) => o[2] === boxKey && o[3] === 'donation_box')), 'breaking the box is undone');

    const boss = player(srv.port, 'Šéf', '');
    await boss.ready;
    const bs = await boss.waitFor((m) => m[0] === 'dary' && m[1].owner);
    assert.ok(bs, 'the owner is recognised by the server');
    assert.deepEqual(bs[1].box, [['iron', 5, 0]]);
    boss.send(['take', 0, 'iron']);
    assert.ok(await boss.waitFor((m) => m[0] === 'give' && m[1] === 'iron' && m[2] === 5), 'the owner takes');
    assert.ok(await boss.waitFor((m) => m[0] === 'dary' && m[1].box.length === 0));

    // admin page: donations and a gift for an online player
    assert.equal((await fetch(`${base()}/admin/dary`)).status, 401, 'the donations page needs the password');
    const page = await (await fetch(`${base()}/admin/dary`, { headers: auth })).text();
    assert.match(page, /Bára/);
    assert.match(page, new RegExp(ITEMS.iron.name));
    const form = (body, extra = {}) => fetch(`${base()}/admin/give`, { method: 'POST', redirect: 'manual', headers: { ...auth, 'content-type': 'application/x-www-form-urlencoded', ...extra }, body });
    assert.equal((await form(`to=${kidId}&id=apple&n=3`, { origin: 'https://evil.example' })).status, 403, 'a foreign page cannot give items');
    assert.equal((await form(`to=${kidId}&id=nonsense&n=3`)).headers.get('location').includes('err'), true, 'unknown item');
    const ok = await form(`to=${kidId}&id=apple&n=3`);
    assert.equal(ok.status, 303);
    kid.send(['pose', pose(0, 14)]);
    assert.ok(await kid.waitFor((m) => m[0] === 'give' && m[1] === 'apple' && m[2] === 3), 'the gift reaches the online player');
    assert.equal((await form(`to=${cyrilId}&id=coal&n=2`)).status, 303, 'a gift for an offline player waits');

    kid.send(['donate', 'apple', 2]);
    assert.ok(await kid.waitFor((m) => m[0] === 'dary' && m[1].top.some(([n, k]) => n === 'Bára' && k === 7)));
    await sleep(1500); // uložení každou sekundu
    kid.ws.close();
    boss.ws.close();
  } finally {
    await stop(srv);
  }
  const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'donations.json'), 'utf8'));
  assert.equal(saved.ledger.length, 2, 'two donations in the ledger file');
  srv = await startServer(env);
  try {
    const boss = player(srv.port, 'Šéf', '');
    await boss.ready;
    const bs = await boss.waitFor((m) => m[0] === 'dary' && m[1].owner);
    assert.deepEqual(bs[1].box, [['apple', 2, 0]], 'the box contents survive a restart');
    assert.deepEqual(bs[1].top, [['Bára', 7]], 'the leaderboard survives a restart');
    const cyril = player(srv.port, 'Cyril', '');
    await cyril.ready;
    await cyril.waitFor((m) => m[0] === 'welcome');
    cyril.send(['pose', pose(0, 14)]);
    assert.ok(await cyril.waitFor((m) => m[0] === 'give' && m[1] === 'coal' && m[2] === 2), 'the waiting gift is delivered at the next login');
    const page = await (await fetch(`${base()}/admin/dary`, { headers: auth })).text();
    assert.equal((page.match(/<td data-l="Kdy">/g) || []).length, 2 + 2, 'two donations and two gifts listed after the restart');
    boss.ws.close();
    cyril.ws.close();
  } finally {
    await stop(srv);
  }
});
