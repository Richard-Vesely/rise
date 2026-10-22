// The Node.js server: password, welcome with the world, edits between two players, mobs, saving and restart.
// Runs the real server (node server/index.js) in a child process, players are WebSocket clients.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { player, pose, sleep, startServer, stop } from './server-helpers.mjs';

test('server: password, welcome, shared edits, mobs, save and restart', { timeout: 60000 }, async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'louka-srv-'));
  let srv = await startServer({ DATA_DIR: dataDir, ROOM_PASSWORD: 'tajne', SAVE_SECONDS: '1' });
  try {
    const bad = player(srv.port, 'Zloděj', 'spatne');
    await bad.ready;
    assert.ok(await bad.waitFor((m) => m[0] === 'denied'), 'wrong password is denied');

    const a = player(srv.port, 'Ája', 'tajne');
    await a.ready;
    assert.ok(await a.waitFor((m) => m[0] === 'welcome'), 'welcome for Ája');
    assert.equal(a.welcome.name, 'Ája');
    assert.ok(Array.isArray(a.welcome.world.blocks) && typeof a.welcome.world.dayTime === 'number', 'welcome carries the world');
    assert.deepEqual(a.welcome.spawn, [1.5, 0.95, 15.5]);
    const b = player(srv.port, 'Bára', 'tajne'); // až po Ájině welcome, jinak může Bára přijít první a Ája ji neuslyší přicházet
    await b.ready;
    assert.ok(await b.waitFor((m) => m[0] === 'welcome'));
    assert.ok(await a.waitFor((m) => m[0] === 'join' && m[1] === 'Bára'), 'Ája hears that Bára joined');

    a.send(['pose', pose(0, 14)]);
    b.send(['pose', pose(3, 14)]);
    assert.ok(await b.waitFor((m) => m[0] === 'pl' && m[1].some((p) => p[1] === 'Ája' && p[2]?.x === 0)), 'Bára sees Ája\'s position');

    a.send(['ops', 0, [['m', 'blocks', '2,1,20', 'bricks']]]);
    assert.ok(await b.waitFor((m) => m[0] === 'ops' && m[1].some((o) => o[2] === '2,1,20')), 'block from Ája reaches Bára');
    a.send(['kv', [['chests', '2,1,20', [{ id: 'apple', n: 3 }, ...Array(26).fill(null)]]]]);
    assert.ok(await b.waitFor((m) => m[0] === 'kv' && m[1].some(([mp, k, v]) => mp === 'chests' && v?.[0]?.id === 'apple')), 'chest contents reach Bára');
    b.send(['ops', 1, [['m', 'blocks', '3,1,20', 'planks']]]);
    assert.ok(await b.waitFor((m) => m[0] === 'perm' && m[1] === false), 'creative edits without permission are refused');

    const mobsMsg = await a.waitFor((m) => m[0] === 'mobs' && m[3].length > 0, 12000);
    assert.ok(mobsMsg, 'animals spawn around the players and are sent');
    const mob = mobsMsg[3][0];
    a.send(['hit', mob[0], 20, 0]);
    assert.ok(await a.waitFor((m) => m[0] === 'mobs' && m[3].some((x) => x[0] === mob[0] && x[8] === 1)), 'a hit from a player kills the mob on the server');
    a.send(['chat', 'Ahoj']);
    assert.ok(await b.waitFor((m) => m[0] === 'chat' && m[1] === 'Ája' && m[2] === 'Ahoj'));
    b.ws.close();
    assert.ok(await a.waitFor((m) => m[0] === 'leave' && m[1] === 'Bára'));
    await sleep(1500); // uložení každou sekundu
    a.ws.close();
  } finally {
    await stop(srv);
  }
  assert.ok(fs.existsSync(path.join(dataDir, 'svet', 'world.json')), 'world.json written (the default world is svet)');
  assert.ok(fs.readdirSync(path.join(dataDir, 'svet', 'backups')).length === 1, 'daily backup written');
  srv = await startServer({ DATA_DIR: dataDir, ROOM_PASSWORD: 'tajne' });
  try {
    const c = player(srv.port, 'Cyril', 'tajne');
    await c.ready;
    await c.waitFor((m) => m[0] === 'welcome');
    assert.ok(c.welcome.world.blocks.some(([k, v]) => k === '2,1,20' && v === 'bricks'), 'the block survives a server restart');
    assert.equal(c.welcome.world.chests['2,1,20']?.[0]?.id, 'apple', 'the chest survives a server restart');
    assert.ok(!c.welcome.world.blocks.some(([k]) => k === '3,1,20'), 'refused block was not saved');
    c.ws.close();
  } finally {
    await stop(srv);
  }
});
