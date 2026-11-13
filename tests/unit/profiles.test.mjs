// Player profiles on the Node server: nickname + PIN, login tokens, wrong-PIN throttle, each player's backpack per world
// on the server (['me', state]), the admin page /admin and the CLI server/admin.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { cleanMe } from '../../server/me.js';
import { loadWorldFile, saveWorldFile } from '../../server/persist.js';
import { cleanName, createProfiles } from '../../server/profiles.js';
import { player, sleep, startServer, stop } from './server-helpers.mjs';

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const run = promisify(execFile);
const admin = (dataDir, ...args) => run(process.execPath, ['server/admin.js', ...args], { env: { ...process.env, DATA_DIR: dataDir } }).then((r) => r.stdout, (e) => e.stdout + e.stderr);
const inv = (items = {}) => { const a = Array(36).fill(null); Object.entries(items).forEach(([i, s]) => { a[i] = s; }); return a; };
const meState = (items, pos = [10, 1, 20]) => ({ inv: inv(items), armor: [null, null, null, null], pos, yaw: 1, hp: 80, hunger: 70, crafted: { planks: true }, placedAny: {}, creative: false, flying: false, flyT: 0 });

test('profiles: create, log in with PIN or token, wrong PIN, throttle, reset', () => {
  const dir = tmp('louka-prof-'), file = path.join(dir, 'players.json');
  let t = Date.parse('2026-10-19T10:00:00Z');
  const P = createProfiles(file, { now: () => t });
  assert.equal(P.login({ name: 'Ája' }).reason, 'needpin', 'no PIN: ask for one');
  assert.equal(P.login({ name: 'Ája', pin: '12a4' }).reason, 'badpin');
  assert.equal(P.login({ name: 'A', pin: '1234' }).reason, 'name', 'too short');
  assert.equal(P.login({ name: 'Hráč', pin: '1234' }).reason, 'name', 'the default name is not a profile');
  const a = P.login({ name: '  Ája  ', pin: '1234', ip: '1.1.1.1', world: 'svet' });
  assert.ok(a.ok && a.created && a.token.length >= 30, 'new name + PIN creates a profile and gives a token');
  assert.equal(a.profile.name, 'Ája');
  assert.equal(a.profile.lastWorld, 'svet');
  assert.ok(!JSON.stringify(a.profile).includes('1234'), 'the PIN itself is never stored');
  assert.equal(P.login({ name: 'ÁJA' }).reason, 'needpin', 'names are case-insensitive');
  assert.deepEqual([P.login({ name: 'ája', token: a.token }).ok, P.login({ name: 'ája', token: a.token }).profile.name], [true, 'Ája'], 'the token logs in without a PIN');
  assert.equal(P.login({ name: 'Bára', token: a.token }).reason, 'token', 'a token works only for its own name');
  assert.equal(P.login({ name: 'Ája', token: 'nesmysl' }).reason, 'token');
  const again = P.login({ name: 'ája', pin: '1234', ip: '1.1.1.1' });
  assert.ok(again.ok && !again.created && again.token !== a.token, 'the right PIN logs in on a new device (new token)');
  for (let i = 0; i < 6; i++) P.login({ name: 'Ája', pin: '0000', ip: '1.1.1.1' }); // tokens: max 5 kept
  // throttle: 5 wrong PINs per name + address, then a minute
  const P2 = createProfiles(null, { now: () => t });
  P2.login({ name: 'Cyril', pin: '1111' });
  const wrong = [1, 2, 3, 4].map(() => P2.login({ name: 'Cyril', pin: '2222', ip: '9.9.9.9' }));
  assert.deepEqual(wrong.map((r) => [r.reason, r.left]), [['pin', 4], ['pin', 3], ['pin', 2], ['pin', 1]]);
  assert.equal(P2.login({ name: 'Cyril', pin: '2222', ip: '9.9.9.9' }).reason, 'wait', 'the 5th wrong PIN: wait');
  assert.equal(P2.login({ name: 'Cyril', pin: '1111', ip: '9.9.9.9' }).reason, 'wait', 'even the right PIN waits');
  assert.ok(P2.login({ name: 'Cyril', pin: '1111', ip: '8.8.8.8' }).ok, 'another address is not blocked');
  t += 61_000;
  assert.ok(P2.login({ name: 'Cyril', pin: '1111', ip: '9.9.9.9' }).ok, 'after a minute it works again');
  // saved to players.json, reloads, reset PIN
  const B = createProfiles(file, { now: () => t });
  assert.equal(B.size, 1);
  assert.ok(B.find('ÁJA').tokens.length <= 5, 'at most 5 tokens per profile');
  assert.ok(B.login({ name: 'Ája', token: again.token }).ok, 'tokens survive a reload');
  assert.equal(B.resetPin('ája').name, 'Ája');
  assert.equal(B.login({ name: 'Ája', token: again.token }).reason, 'token', 'a reset logs out all devices');
  const fresh = B.login({ name: 'Ája', pin: '5678' });
  assert.ok(fresh.ok && fresh.newPin, 'after a reset the next PIN becomes the new PIN');
  assert.equal(B.login({ name: 'Ája', pin: '1234' }).reason, 'pin', 'the old PIN no longer works');
  assert.equal(B.resetPin('Nikdo'), null);
  assert.deepEqual(cleanName('a\u0000b  c'), { name: 'ab c' });
  assert.ok('error' in cleanName('x'.repeat(17)));
  // daily backup of players.json
  const backups = fs.readdirSync(path.join(dir, 'backups'));
  assert.equal(backups.length, 1);
  assert.match(backups[0], /^players-\d{4}-\d{2}-\d{2}\.json$/); // (dnešní datum; dřív tu bylo pevné datum, které po půlnoci selhalo)
});

test('player state: shape, size and known items are checked', () => {
  const ok = cleanMe(meState({ 0: { id: 'stone', n: 5 }, 1: { id: 'doc_h-3-ab12', n: 1 }, 2: { id: 'zmizely_predmet', n: 2 } }));
  assert.deepEqual(ok.inv.slice(0, 3), [{ id: 'stone', n: 5 }, { id: 'doc_h-3-ab12', n: 1 }, null], 'known items and documents stay, unknown ones are dropped');
  assert.equal(ok.hp, 80);
  assert.deepEqual(ok.crafted, { planks: true });
  assert.equal(cleanMe({ ...meState(), inv: Array(35).fill(null) }), null, 'wrong slot count');
  assert.equal(cleanMe({ ...meState(), pos: [0, 'x', 0] }), null, 'bad position');
  assert.equal(cleanMe(meState({ 0: { id: 'stone', n: -1 } })), null, 'bad stack');
  assert.equal(cleanMe(meState({ 0: { id: 'stone', n: 1.5 } })), null);
  assert.equal(cleanMe('hello'), null);
  assert.equal(cleanMe([1, 2]), null);
  assert.equal(cleanMe(meState(), 70_000), null, 'more than 64 KB');
  assert.deepEqual(cleanMe({ ...meState(), armor: [{ id: 'stone', n: 1 }, null, null, null] }).armor[0], null, 'only armor in armor slots');
  assert.equal(cleanMe({ ...meState(), creative: 'yes' }).creative, false);
  assert.equal(cleanMe({ ...meState(), crafted: { ['x'.repeat(100)]: true, wood: 1 } }).crafted.wood, true);
});

test('world.json keeps the players; a file from before profiles still loads', () => {
  const dir = tmp('louka-wf-');
  fs.writeFileSync(path.join(dir, 'world.json'), JSON.stringify({ version: 2, world: { blocks: [] } })); // before profiles
  assert.deepEqual(loadWorldFile(dir), { world: { blocks: [] }, players: {}, donations: null, army: null });
  saveWorldFile(dir, { blocks: [['1,1,1', 'stone']] }, { p1: meState() });
  const back = loadWorldFile(dir);
  assert.equal(back.players.p1.hp, 80);
  assert.equal(back.world.blocks[0][1], 'stone');
});

test('server: profiles, backpack per world, one session per player, restart, admin page and CLI', { timeout: 90000 }, async () => {
  const dataDir = tmp('louka-profsrv-');
  const env = { DATA_DIR: dataDir, ROOM_PASSWORD: 'tajne', SAVE_SECONDS: '1', WORLDS: 'svet:Hlavní svět,kreativ:Kreativ:creative', ADMIN_PASSWORD: 'spravce' };
  let srv = await startServer(env);
  const base = () => `http://127.0.0.1:${srv.port}`;
  let token;
  try {
    const nopin = player(srv.port, 'Ája', 'tajne', { v: 2, world: 'svet', pin: undefined });
    assert.deepEqual((await nopin.waitFor((m) => m[0] === 'denied')).slice(0, 2), ['denied', 'needpin'], 'no PIN: asked for one');
    const a = player(srv.port, 'Ája', 'tajne', { v: 2, world: 'svet', pin: '4826' });
    const tok = await a.waitFor((m) => m[0] === 'token');
    assert.ok(tok && await a.waitFor((m) => m[0] === 'welcome'), 'a new name + PIN: token, then welcome');
    token = tok[1];
    assert.equal(a.welcome.me, null, 'nothing saved yet for this player in this world');
    a.send(['me', meState({ 0: { id: 'stone', n: 7 } }, [40, 1, 40])]);
    a.send(['me', { inv: 'garbage' }]); // ignored
    await sleep(300);
    const wrong = player(srv.port, 'ája', 'tajne', { v: 2, world: 'svet', pin: '1111' });
    const den = await wrong.waitFor((m) => m[0] === 'denied');
    assert.deepEqual(den.slice(0, 2), ['denied', 'pin'], 'wrong PIN (or a taken name) is refused');
    assert.equal(den[2].left, 4);
    const bad = player(srv.port, 'X', 'tajne', { v: 2, world: 'svet' });
    assert.deepEqual((await bad.waitFor((m) => m[0] === 'denied')).slice(0, 2), ['denied', 'name']);

    // the same player logs in again elsewhere (token): the old connection is told and closed
    const a2 = player(srv.port, 'Ája', 'tajne', { v: 2, world: 'svet', pin: undefined, token });
    assert.ok(await a2.waitFor((m) => m[0] === 'welcome'), 'the token logs in without a PIN');
    assert.ok(!a2.msgs.some((m) => m[0] === 'token'), 'no new token for a token login');
    assert.deepEqual(a2.welcome.me.inv[0], { id: 'stone', n: 7 }, 'the backpack comes from the server');
    assert.deepEqual(a2.welcome.me.pos, [40, 1, 40]);
    assert.equal(a2.welcome.name, 'Ája', 'no "Ája 2": the old session is gone');
    assert.deepEqual(await a.waitFor((m) => m[0] === 'kick'), ['kick', 'Přihlásil ses jinde.'], 'the old connection hears why');
    a.send(['me', meState({ 0: { id: 'dirt', n: 1 } })]); // a late save from the old session is ignored
    // per world: the creative world has its own backpack
    const k = player(srv.port, 'Ája', 'tajne', { v: 2, world: 'kreativ', pin: undefined, token });
    assert.ok(await k.waitFor((m) => m[0] === 'welcome'));
    assert.equal(k.welcome.me, null, 'the backpack is per world');
    k.send(['me', meState({ 0: { id: 'glass', n: 64 } })]);
    a2.send(['me', meState({ 0: { id: 'stone', n: 9 } }, [41, 1, 41])]);

    // admin page
    assert.equal((await fetch(`${base()}/admin`)).status, 401, 'the admin page needs the password');
    const auth = (p) => ({ authorization: 'Basic ' + Buffer.from('lektor:' + p).toString('base64') });
    assert.equal((await fetch(`${base()}/admin`, { headers: auth('spatne') })).status, 401);
    const page = await (await fetch(`${base()}/admin`, { headers: auth('spravce') })).text();
    assert.match(page, /Ája/);
    assert.match(page, /● Hlavní svět|● Kreativ/, 'shows where the player is playing now');
    assert.doesNotMatch(page, /pinHash|salt/);
    assert.match(await admin(dataDir, 'players'), /Ája .*(Hlavní svět|Kreativ)/, 'the CLI asks the running server');
    await sleep(1500);
    for (const p of [a, a2, k, nopin, wrong, bad]) await p.close();
  } finally {
    await stop(srv);
  }
  if (process.platform !== 'win32') assert.ok(!fs.existsSync(path.join(dataDir, 'admin.json')), 'admin.json is removed on shutdown'); // Windows: kill() has no SIGTERM, a stale admin.json stays (the CLI then uses the files)
  const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'svet', 'world.json'), 'utf8'));
  assert.equal(Object.values(saved.players)[0].inv[0].n, 9, 'the backpack is saved in world.json');
  const pj = fs.readFileSync(path.join(dataDir, 'players.json'), 'utf8');
  assert.ok(!pj.includes('4826') && !pj.includes(token), 'players.json has no PINs or tokens in clear text');

  // CLI with the server stopped: works on the files
  assert.match(await admin(dataDir, 'players'), /Ája/);
  assert.match(await admin(dataDir, 'reset-pin', 'nikdo'), /neexistuje/);
  srv = await startServer(env);
  try {
    const a = player(srv.port, 'Ája', 'tajne', { v: 2, world: 'svet', pin: undefined, token });
    assert.ok(await a.waitFor((m) => m[0] === 'welcome'), 'after a restart the token still works');
    assert.deepEqual(a.welcome.me.inv[0], { id: 'stone', n: 9 }, 'and the backpack is still there');
    // admin page: reset the PIN (POST from the page itself)
    const auth = { authorization: 'Basic ' + Buffer.from(':spravce').toString('base64') };
    const page = await (await fetch(`http://127.0.0.1:${srv.port}/admin`, { headers: auth })).text();
    const id = /name="id" value="([^"]+)"/.exec(page)[1];
    const foreign = await fetch(`http://127.0.0.1:${srv.port}/admin/reset-pin`, { method: 'POST', redirect: 'manual', headers: { ...auth, origin: 'https://evil.example', 'content-type': 'application/x-www-form-urlencoded' }, body: `id=${id}` });
    assert.equal(foreign.status, 403, 'a form from another site is refused');
    const r = await fetch(`http://127.0.0.1:${srv.port}/admin/reset-pin`, { method: 'POST', redirect: 'manual', headers: { ...auth, 'content-type': 'application/x-www-form-urlencoded' }, body: `id=${id}` });
    assert.equal(r.status, 303);
    assert.match(decodeURIComponent(r.headers.get('location')), /reset=Ája/);
    const old = player(srv.port, 'Ája', 'tajne', { v: 2, world: 'svet', pin: undefined, token });
    assert.deepEqual((await old.waitFor((m) => m[0] === 'denied')).slice(0, 2), ['denied', 'token'], 'after a reset the token is gone');
    const re = player(srv.port, 'Ája', 'tajne', { v: 2, world: 'svet', pin: '9999' });
    assert.ok(await re.waitFor((m) => m[0] === 'welcome'), 'the next PIN is the new PIN');
    assert.deepEqual(re.welcome.me.inv[0], { id: 'stone', n: 9 }, 'the backpack stays after a PIN reset');
    assert.match(await admin(dataDir, 'reset-pin', 'ÁJA'), /PIN hráče Ája je smazaný\./, 'the CLI resets a PIN on the running server');
    assert.match(srv.out(), /Přihlášen Ája \(nový PIN\)/, 'logins are logged with names');
    assert.doesNotMatch(srv.out(), /4826|9999/, 'PINs never appear in the log');
    for (const p of [a, old, re]) await p.close();
  } finally {
    await stop(srv);
  }
  srv = await startServer({ ...env, ADMIN_PASSWORD: '' });
  try {
    assert.equal((await fetch(`http://127.0.0.1:${srv.port}/admin`)).status, 404, 'without ADMIN_PASSWORD the page is off');
  } finally {
    await stop(srv);
  }
});
