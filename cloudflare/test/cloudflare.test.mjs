// Říše na Cloudflare, na vlastním počítači (wrangler dev): router + 2 světy, stejné hráčské cesty jako testy Node serveru.
//   cd cloudflare && npm install && npm test        (hru předtím sestav v kořeni: npm run build)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { pose, sleep } from '../../tests/unit/server-helpers.mjs';
import { startDev, stopDev } from './dev-server.mjs';

const PORT = 8799, BASE = `http://127.0.0.1:${PORT}`;
const PASS = 'tajne', ADMIN = 'spravce';

const ENV = { ROOM_PASSWORD: PASS, ADMIN_PASSWORD: ADMIN, SAVE_SECONDS: '1', WORLDS: 'svet:Hlavní svět,kreativ:Kreativní svět:creative' };
const start = (state) => startDev({ port: PORT, state, env: ENV });
const stop = stopDev;
/** Hráč jako menu hry: ws://…/ws?world=<id> a hello { name, pass, v: 2, world, pin | token } (hello přepíše výchozí hodnoty). */
async function join(name, hello = {}, world = 'svet') {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?world=${world}`);
  const p = { ws, msgs: [], welcome: null };
  ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); p.msgs.push(m); if (m[0] === 'welcome') p.welcome = m[1]; });
  p.send = (m) => ws.send(JSON.stringify(m));
  p.waitFor = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const m = p.msgs.find(fn); if (m) return m; await sleep(30); } return null; };
  p.close = () => new Promise((ok) => { if (ws.readyState === WebSocket.CLOSED) return ok(); ws.on('close', ok); ws.close(); });
  await new Promise((ok, fail) => { ws.on('open', ok); ws.on('error', fail); });
  p.send(['hello', { name, pass: PASS, v: 2, world, pin: '1234', ...hello }]);
  return p;
}
const meState = (pos) => ({ inv: [{ id: 'apple', n: 3 }, ...Array(35).fill(null)], armor: [null, null, null, null], pos, yaw: 1, hp: 80, hunger: 70, crafted: {}, placedAny: {}, creative: false, flying: false, flyT: 0 });

test('cloudflare: worlds, password, profiles, shared edits, isolation, backpack, restart, import', { timeout: 300_000 }, async () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'rise-cf-'));
  let srv = await start(state);
  let token;
  try {
    // ---------- HTTP
    const worlds = await (await fetch(BASE + '/worlds')).json();
    assert.deepEqual(worlds.map((w) => [w.id, w.creative, w.players]), [['svet', false, 0], ['kreativ', true, 0]], '/worlds lists both worlds');
    const health = await (await fetch(BASE + '/health')).json();
    assert.ok(health.ok && health.cloudflare && health.password && health.max === 16);
    const html = await (await fetch(BASE + '/')).text();
    assert.match(html, /<meta name="louka-server" content="\{&quot;password&quot;:true\}">/, 'index.html tells the menu this is a club server');

    // ---------- přihlášení
    const bad = await join('Zloděj', { pass: 'spatne' });
    assert.ok(await bad.waitFor((m) => m[0] === 'denied' && m[1] === 'password'), 'wrong password is denied');
    const nopin = await join('Ája', { pin: undefined });
    assert.ok(await nopin.waitFor((m) => m[0] === 'denied' && m[1] === 'needpin'), 'no PIN: asked for one');

    const a = await join('Ája');
    assert.ok(await a.waitFor((m) => m[0] === 'welcome'), 'welcome for Ája');
    token = a.msgs.find((m) => m[0] === 'token')?.[1];
    assert.ok(token?.length >= 30, 'a new profile gets a token');
    assert.equal(a.welcome.worldInfo.id, 'svet');
    assert.equal(a.welcome.me, null, 'first time in this world');
    const b = await join('Bára');
    assert.ok(await b.waitFor((m) => m[0] === 'welcome'));
    assert.ok(await a.waitFor((m) => m[0] === 'join' && m[1] === 'Bára'), 'Ája hears that Bára joined');
    const wrong = await join('Bára', { pin: '9999' });
    assert.ok(await wrong.waitFor((m) => m[0] === 'denied' && m[1] === 'pin' && m[2].left === 4), 'wrong PIN for a taken name');

    // ---------- hra
    a.send(['pose', pose(0, 14)]);
    assert.ok(await b.waitFor((m) => m[0] === 'pl' && m[1].some((p) => p[1] === 'Ája' && p[2]?.x === 0)), 'Bára sees Ája\'s position');
    a.send(['ops', 0, [['m', 'blocks', '2,1,20', 'bricks']]]);
    assert.ok(await b.waitFor((m) => m[0] === 'ops' && m[1].some((o) => o[2] === '2,1,20')), 'block from Ája reaches Bára');
    a.send(['chat', 'Ahoj']);
    assert.ok(await b.waitFor((m) => m[0] === 'chat' && m[1] === 'Ája' && m[2] === 'Ahoj'));
    assert.ok(await a.waitFor((m) => m[0] === 'mobs' && m[3].length > 0, 15_000), 'the world runs: animals spawn and are sent');
    assert.equal((await (await fetch(BASE + '/worlds')).json())[0].players, 2, '/worlds counts the players');

    // jiný svět: nic z hlavního světa, kreativní režim
    const k = await join('Kuba', {}, 'kreativ');
    assert.ok(await k.waitFor((m) => m[0] === 'welcome'));
    assert.equal(k.welcome.worldInfo.id, 'kreativ');
    assert.ok(k.welcome.worldInfo.creative);
    assert.ok(!k.welcome.world.blocks.some(([key]) => key === '2,1,20'), 'worlds are separate');
    // router poslal do světa svet, ale hráč chce kreativ: dostane seznam
    const mixed = await join('Kuba', { world: 'kreativ' }, 'svet');
    assert.ok(await mixed.waitFor((m) => m[0] === 'worlds' && m[1].length === 2), 'hello for another world: the list to pick again');

    // stejný hráč podruhé: staré spojení skončí
    const a2 = await join('Ája', { pin: undefined, token });
    assert.ok(await a2.waitFor((m) => m[0] === 'welcome'), 'token login');
    assert.ok(await a.waitFor((m) => m[0] === 'kick' && m[1] === 'Přihlásil ses jinde.'), 'the old connection is kicked');

    // batoh na serveru
    a2.send(['me', meState([10, 1, 20])]);
    await sleep(300);
    for (const p of [a, a2, b, k, mixed, wrong, nopin, bad]) await p.close();
    await sleep(2500); // poslední odešel: svět se uloží a zastaví
    assert.equal((await (await fetch(BASE + '/health')).json()).players, 0);
    const back = await join('Ája', { pin: undefined, token });
    assert.ok(await back.waitFor((m) => m[0] === 'welcome'));
    assert.deepEqual(back.welcome.me?.pos, [10, 1, 20], 'the backpack and position wait in the world');
    assert.equal(back.welcome.me.inv[0].id, 'apple');
    await back.close();
    await sleep(1500);
  } finally {
    await stop(srv);
  }

  // ---------- restart: svět i profily zůstanou; nahrání světa z Node serveru
  srv = await start(state);
  try {
    const c = await join('Ája', { pin: undefined, token });
    assert.ok(await c.waitFor((m) => m[0] === 'welcome'), 'the token still works after a restart (profiles are stored)');
    assert.ok(c.welcome.world.blocks.some(([key, v]) => key === '2,1,20' && v === 'bricks'), 'the block survives a restart');
    await c.close();

    const post = (p, body, pass = ADMIN) => fetch(BASE + p, { method: 'POST', headers: { Authorization: `Bearer ${pass}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
    assert.equal((await post('/admin/import/world/kreativ', {}, 'spatne')).status, 401, 'import needs the admin password');
    const save = { version: 2, savedAt: new Date().toISOString(), world: { blocks: [['7,1,7', 'gold_block']] }, players: {} };
    assert.deepEqual((await post('/admin/import/world/kreativ', save)).body, { ok: true }, 'world.json from the Node server is imported');
    assert.equal((await post('/admin/import/world/svet', save)).body.ok, false, 'not into a world that already runs');
    assert.equal((await post('/admin/import/players', { players: [] })).body.ok, false, 'profiles are not overwritten');
    const d = await join('Dan', {}, 'kreativ');
    assert.ok(await d.waitFor((m) => m[0] === 'welcome'));
    assert.ok(d.welcome.world.blocks.some(([key]) => key === '7,1,7'), 'the imported world is loaded');
    await d.close();
  } finally {
    await stop(srv);
  }
});
