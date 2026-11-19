// Druhá ruka (client/src/player/offhand.js): štít v datech, kontrola políčka na serveru (me.off v server/me.js),
// předměty vlastníka tam nesmí (server/owner-wand.js), server ji uloží a vrátí, ostatní hráči ji vidí v pozici (pose.oh, pose.bl).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ITEMS, RECIPES } from '../../shared/data/index.js';
import { cleanMe } from '../../server/me.js';
import { OWNER_WAND, fixOwnerItems } from '../../server/owner-wand.js';
import { player, pose, sleep, startServer, stop } from './server-helpers.mjs';

const base = { inv: Array(36).fill(null), armor: [null, null, null, null], pos: [1, 2, 3], yaw: 0, hp: 100, hunger: 100, crafted: {}, placedAny: {}, creative: false, flying: false, flyT: 0 };

test('second hand: the shield is an item with a recipe and durability', () => {
  assert.equal(ITEMS.shield?.name, 'Štít');
  assert.ok(ITEMS.shield.shield && ITEMS.shield.stack === 1 && ITEMS.shield.dur > 0);
  const r = RECIPES.find((x) => x.out === 'shield');
  assert.ok(r && r.cat === 'tools' && r.w === 3 && r.h === 3, 'planks + iron at a workbench');
});

test('second hand: me.off is optional and checked like the other slots', () => {
  assert.equal(cleanMe(base).off, null, 'old clients without a second hand still save (empty second hand)');
  assert.equal(cleanMe({ ...base, off: null }).off, null);
  assert.deepEqual(cleanMe({ ...base, off: { id: 'shield', n: 1, w: 5 } }).off, { id: 'shield', n: 1, w: 5 }, 'the shield keeps its wear');
  assert.deepEqual(cleanMe({ ...base, off: { id: 'torch', n: 12 } }).off, { id: 'torch', n: 12 }, 'any item can be there');
  assert.equal(cleanMe({ ...base, off: { id: 'neexistuje', n: 1 } }).off, null, 'an unknown item in the second hand is dropped');
  assert.deepEqual(cleanMe({ ...base, off: { id: 'shield', n: 1, w: 99999 } }).off, { id: 'shield', n: 1 }, 'nonsense wear is left out');
  assert.equal(cleanMe({ ...base, off: 'shield' }), null, 'a broken slot rejects the whole state (like in the backpack)');
  assert.equal(cleanMe({ ...base, off: { id: 'stone', n: 0 } }), null);
});

test('second hand: owner items never stay there', () => {
  const owner = cleanMe({ ...base, off: { id: OWNER_WAND, n: 1 } });
  assert.deepEqual(fixOwnerItems(owner, true).includes(OWNER_WAND), true, 'the owner gets the wand back into the backpack');
  assert.equal(owner.off, null, '…and not in the second hand');
  assert.ok(owner.inv.some((s) => s?.id === OWNER_WAND));
  const kid = cleanMe({ ...base, off: { id: OWNER_WAND, n: 1 } });
  fixOwnerItems(kid, false);
  assert.equal(kid.off, null, 'another player loses it');
  const shield = cleanMe({ ...base, off: { id: 'shield', n: 1 } });
  fixOwnerItems(shield, false);
  assert.deepEqual(shield.off, { id: 'shield', n: 1 }, 'normal items stay');
});

test('server: the second hand is saved per profile and other players see it', { timeout: 60000 }, async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'louka-ruka-'));
  const srv = await startServer({ DATA_DIR: dataDir, ROOM_PASSWORD: 'tajne', SAVE_SECONDS: '1' });
  try {
    const a = player(srv.port, 'Ája', 'tajne'), b = player(srv.port, 'Bára', 'tajne');
    await a.ready; await b.ready;
    const tok = await a.waitFor((m) => m[0] === 'token');
    assert.ok(await a.waitFor((m) => m[0] === 'welcome') && await b.waitFor((m) => m[0] === 'welcome'));
    assert.equal(a.welcome.me, null, 'first time: nothing saved yet');
    a.send(['pose', { ...pose(0, 14), oh: 'shield', bl: 2 }]);
    b.send(['pose', pose(3, 14)]);
    assert.ok(await b.waitFor((m) => m[0] === 'pl' && m[1].some((p) => p[1] === 'Ája' && p[2]?.oh === 'shield' && p[2]?.bl === 2)), 'Bára sees Ája\'s shield raised');
    a.send(['me', { ...base, pos: [5, 1, 5], off: { id: 'shield', n: 1, w: 7 } }]);
    await sleep(300);
    const a2 = player(srv.port, 'Ája', 'tajne', { pin: undefined, token: tok[1] });
    assert.ok(await a2.waitFor((m) => m[0] === 'welcome'));
    assert.deepEqual(a2.welcome.me.off, { id: 'shield', n: 1, w: 7 }, 'the second hand comes back from the server');
    await Promise.all([a.close(), b.close(), a2.close()]);
  } finally {
    await stop(srv);
  }
});
