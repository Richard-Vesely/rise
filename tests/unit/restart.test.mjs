// Server restart (automatic update while kids play): players get ['restart'] first, and a backpack (['me']) they send
// right after it is still saved, so nothing is lost when the browser reloads and joins again.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../server/server.js';
import { player } from './server-helpers.mjs';

const me = (pos) => ({ inv: Array(36).fill(null), armor: [null, null, null, null], pos, yaw: 0, hp: 80, hunger: 70, crafted: {}, placedAny: {}, creative: false, flying: false, flyT: 0 });

test('server restart: players are told first, their last backpack is saved', { timeout: 60000 }, async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'louka-restart-'));
  const opts = { port: 0, dataDir, password: 'tajne', log: () => {} };
  let srv = await startServer(opts);
  const a = player(srv.port, 'Ája', 'tajne');
  await a.ready;
  assert.ok(await a.waitFor((m) => m[0] === 'welcome'));
  // jako prohlížeč: na ['restart'] hned pošle batoh a pozici
  a.ws.on('message', (raw) => { if (JSON.parse(raw.toString())[0] === 'restart') a.send(['me', me([7, 1, 7])]); });
  const closed = new Promise((ok) => a.ws.on('close', ok));
  await srv.close();
  await closed;
  assert.ok(a.msgs.some((m) => m[0] === 'restart'), 'the player got ["restart"] before the server stopped');

  srv = await startServer(opts);
  try {
    const a2 = player(srv.port, 'Ája', 'tajne');
    await a2.ready;
    assert.ok(await a2.waitFor((m) => m[0] === 'welcome'));
    assert.deepEqual(a2.welcome.me?.pos, [7, 1, 7], 'the backpack sent after ["restart"] was saved');
    await a2.close();
  } finally {
    await srv.close({ graceMs: 0 });
  }
});
