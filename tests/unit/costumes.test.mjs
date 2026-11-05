// Costumes (Můj oblek): the shared data and checks, the server keeping a player's costume (me.look)
// and other players seeing it in the position messages (pose.lk).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EMBLEMS, LIGHT_COLORS, SUITS, SUIT_COLORS, SUIT_IDS, VISOR_COLORS, HAIR_COLORS, SKIN_TONES, cleanCostume, decodeCostume, isHero, defaultCostume, encodeCostume, newerCostume } from '../../shared/data/index.js';
import { cleanMe } from '../../server/me.js';
import { player, pose, sleep, startServer, stop } from './server-helpers.mjs';

test('costumes: data, defaults per name, cleaning and the short text in the position', () => {
  assert.deepEqual(SUIT_IDS, ['explorer', 'engineer', 'pilot', 'guard', 'scientist', 'shadow', 'sky', 'mage', 'knight', 'ranger']);
  assert.ok(['mage', 'knight', 'ranger'].every(isHero) && !isHero('pilot'), 'heroes have a face and hair instead of a helmet');
  assert.ok(HAIR_COLORS.length === VISOR_COLORS.length && SKIN_TONES.length === EMBLEMS.length, 'hair and skin reuse the visor and emblem slots (same counts, same save format)');
  for (const id of SUIT_IDS) assert.ok(SUITS[id].name && SUITS[id].desc, `${id} has a Czech name and description`);
  assert.equal(LIGHT_COLORS.length, 4, 'suit lights use only the four glow colours of the game');
  assert.ok(SUIT_COLORS.length >= 10 && VISOR_COLORS.length >= 4 && EMBLEMS.length >= 6);
  // výchozí oblek podle jména: stálý a platný
  const d = defaultCostume('Ája');
  assert.deepEqual(defaultCostume('Ája'), d, 'the same name always gets the same default');
  assert.deepEqual(cleanCostume(d), { ...d });
  assert.ok(new Set(['Ája', 'Bára', 'Kuba', 'Ema', 'Tom'].map((n) => defaultCostume(n).c)).size > 2, 'different names get different colours');
  for (const n of ['Klient', 'Hostitel', 'Hráč', 'Žofie Příliš Dlouhá', 'x', '', '🙂🙂🙂', 'Ondřej123']) { // každé jméno dá platný oblek, i ten v textu pozice
    const c = defaultCostume(n);
    assert.deepEqual(cleanCostume(encodeCostume(c), 'jiné jméno'), c, n);
  }
  // čištění: neplatné části → výchozí, nikdy nehází
  for (const bad of [null, undefined, 42, 'x', [], { s: 'ninja' }, { s: 'pilot', c: 99, l: -1, v: 1.5, e: '2' }, 'pilot.1.2', 'pilot.a.b.c.d', 'p'.repeat(100)]) {
    const c = cleanCostume(bad, 'Ája');
    assert.ok(Object.hasOwn(SUITS, c.s) && c.c < SUIT_COLORS.length && c.l < LIGHT_COLORS.length && c.v < VISOR_COLORS.length && c.e < EMBLEMS.length, JSON.stringify(bad));
  }
  assert.deepEqual(cleanCostume({ s: 'pilot', c: 99, l: 2 }, 'Ája'), { ...d, s: 'pilot', l: 2 }, 'valid parts stay, bad ones fall back');
  // text v pozici hráče: tam a zpět pro každý oblek
  for (const s of SUIT_IDS) {
    const c = { s, c: 3, l: 1, v: 2, e: 5 };
    assert.deepEqual(cleanCostume(encodeCostume(c)), c);
    assert.deepEqual(decodeCostume(encodeCostume(c)), c);
  }
  assert.equal(encodeCostume({ s: 'sky', c: 11, l: 3, v: 4, e: 7 }), 'sky.11.3.4.7');
  assert.equal(decodeCostume('sky.1.2.3'), null);
  // novější vyhraje (prohlížeč vs. server)
  const a = { ...d, t: 100 }, b = { ...d, s: 'guard', t: 200 };
  assert.equal(newerCostume(a, b), b);
  assert.equal(newerCostume(b, a), b);
  assert.equal(newerCostume(a, null), a);
  assert.equal(cleanCostume({ ...b }).t, 200, 'the change time is kept');
});

test('player state: the costume (look) is optional and cleaned', () => {
  const base = { inv: Array(36).fill(null), armor: [null, null, null, null], pos: [1, 2, 3], yaw: 0, hp: 100, hunger: 100, crafted: {}, placedAny: {}, creative: false, flying: false, flyT: 0 };
  assert.equal('look' in cleanMe(base), false, 'old clients without a costume still save');
  assert.deepEqual(cleanMe({ ...base, look: { s: 'pilot', c: 2, l: 1, v: 0, e: 3, t: 5 } }).look, { s: 'pilot', c: 2, l: 1, v: 0, e: 3, t: 5 });
  const odd = cleanMe({ ...base, look: { s: '<script>', c: 1e9, junk: 'x'.repeat(50) } }).look;
  assert.ok(Object.hasOwn(SUITS, odd.s) && !('junk' in odd), 'a bad costume is cleaned, not stored as is');
  assert.equal('look' in cleanMe({ ...base, look: 'pilot.1.1.1.1' }), false, 'only an object is stored');
});

test('server: other players see the costume, the profile keeps it', { timeout: 60000 }, async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'louka-oblek-'));
  const srv = await startServer({ DATA_DIR: dataDir, ROOM_PASSWORD: 'tajne', SAVE_SECONDS: '1' });
  try {
    const a = player(srv.port, 'Ája', 'tajne'), b = player(srv.port, 'Bára', 'tajne');
    await a.ready; await b.ready;
    const tok = await a.waitFor((m) => m[0] === 'token');
    assert.ok(await a.waitFor((m) => m[0] === 'welcome') && await b.waitFor((m) => m[0] === 'welcome'));
    a.send(['pose', { ...pose(0, 14), lk: 'pilot.9.0.1.4' }]);
    b.send(['pose', pose(3, 14)]);
    assert.ok(await b.waitFor((m) => m[0] === 'pl' && m[1].some((p) => p[1] === 'Ája' && p[2]?.lk === 'pilot.9.0.1.4')), 'Bára sees Ája\'s costume');
    const look = { s: 'scientist', c: 4, l: 2, v: 1, e: 6, t: 1234 };
    a.send(['me', { inv: Array(36).fill(null), armor: [null, null, null, null], pos: [5, 1, 5], yaw: 0, hp: 90, hunger: 90, crafted: {}, placedAny: {}, creative: false, flying: false, flyT: 0, look }]);
    await sleep(300);
    const a2 = player(srv.port, 'Ája', 'tajne', { pin: undefined, token: tok[1] });
    assert.ok(await a2.waitFor((m) => m[0] === 'welcome'));
    assert.deepEqual(a2.welcome.me.look, look, 'the costume comes back from the server on any computer');
    await Promise.all([a.close(), b.close(), a2.close()]);
  } finally {
    await stop(srv);
  }
});
