// Multiplayer test "Další možnosti → Vytvořit hru na svém počítači": one browser hosts via PeerJS (public broker), a second one joins with the code.
// Needs internet (PeerJS broker 0.peerjs.com + WebRTC between the two local browsers).
// Usage: node tests/playtest/peer.mjs [dir-or-url]   (default dist)
import path from 'node:path';
import fs from 'node:fs';
import { launch, serveDir, checker, openPage, waitGame } from './lib.mjs';

const target = process.argv[2] || 'dist';
const out = process.argv[3] || 'playtest-peer';
const { check, results, failed } = checker('peer: ');
let server = null, url = target;
if (!/^https?:/.test(target)) { server = await serveDir(path.resolve(target)); url = server.url; }
const browser = await launch();
const ignore = [/PeerJS/i, /WebRTC/i, /ICE/i];
const A = await openPage(browser, url, { label: 'host: ', ignore });
const B = await openPage(browser, url, { label: 'client: ', ignore });
const until = async (page, fn, arg, timeout = 15000) => { try { await page.waitForFunction(fn, arg, { timeout, polling: 100 }); return true; } catch { return false; } };

try {
  await A.fill('#mName', 'Hostitel');
  await A.click('#mMore'); // Další možnosti -> Vytvořit hru na svém počítači
  await A.click('#mHost');
  await A.check('#mCreative');
  await A.click('#mHostGo');
  await waitGame(A, 60000);
  const code = await A.evaluate(() => window.game.NET.code);
  check('host starts a server with a code', /^LOUKA-[A-Z0-9]{4}$/.test(code), code);
  check('host saves the code for next time', await A.evaluate((c) => { window.game.saveGame(); return JSON.parse(localStorage.getItem('rise-server-v1') || '{}').code === c; }, code));

  await B.fill('#mName', 'Klient');
  await B.click('#mMore'); // Další možnosti -> Připojit se ke kamarádovi kódem
  await B.click('#mJoin');
  await B.fill('#mCode', code.slice(6)); // just the 4 characters is enough
  await B.click('#mJoinGo');
  await waitGame(B, 60000);
  check('client joins with the 4-character code', await B.evaluate(() => window.game.NET.client === true));
  check('both see each other', await until(A, () => window.game.others.size === 1 && [...window.game.others.values()][0].pose) && await until(B, () => [...window.game.others.values()].some((P) => P.name === 'Hostitel' && P.pose)));
  // Můj oblek přes PeerJS: hostitel (jeho pozice jde z room.local) i klient vidí oblek toho druhého
  await A.evaluate(() => window.game.openCostume());
  await A.click('#costume .cos-suit[data-s="sky"]');
  await A.click('#costume [data-act="ok"]');
  await B.evaluate(() => window.game.openCostume());
  await B.click('#costume .cos-suit[data-s="guard"]');
  await B.click('#costume [data-act="ok"]');
  check('costumes travel both ways (host in Nebeský, client in Strážce)', await until(B, () => [...window.game.others.values()].some((P) => P.name === 'Hostitel' && P.avatar?.costume.s === 'sky')) && await until(A, () => [...window.game.others.values()].some((P) => P.avatar?.costume.s === 'guard')));
  check('client got its name and creative permission', await B.evaluate(() => window.game.NET.name === 'Klient' && window.game.NET.perm === true));

  // world edits both ways
  await A.evaluate(() => { window.game.blocks.set('5,3,30', 'bricks'); });
  check('host block appears at client', await until(B, () => window.game.blocks.get('5,3,30') === 'bricks'));
  await B.evaluate(() => { window.game.blocks.set('6,3,30', 'planks'); });
  check('client block appears at host', await until(A, () => window.game.blocks.get('6,3,30') === 'planks'));
  await B.evaluate(() => { window.game.setVox(7, -5, 30, 0); });
  check('client digging (voxel) reaches host', await until(A, () => window.game.getVox(7, -5, 30) === 0));

  // small maps (kv): chest contents from client to host and back
  await A.evaluate(() => { window.game.blocks.set('8,3,30', 'chest'); window.game.chests.set('8,3,30', Array(27).fill(null)); });
  await until(B, () => window.game.blocks.get('8,3,30') === 'chest' && window.game.chests.has('8,3,30')); // počkej, až dorazí i obsah od hostitele
  await B.evaluate(() => { const c = Array(27).fill(null); c[0] = { id: 'apple', n: 5 }; window.game.chests.set('8,3,30', c); });
  const chestOk = await until(A, () => window.game.chests.get('8,3,30')?.[0]?.id === 'apple');
  const dbg = chestOk ? '' : JSON.stringify({ host: await A.evaluate(() => window.game.chests.get('8,3,30')?.[0] ?? 'none'), client: await B.evaluate(() => ({ c: window.game.chests.get('8,3,30')?.[0], last: window.game.NET.kvLast.chests?.get('8,3,30')?.slice(0, 40), blk: window.game.blocks.get('8,3,30') })) });
  check('chest contents from client reach host', chestOk, dbg);

  // mobs and day: host simulates, client follows
  await A.evaluate(() => { const g = window.game; g.spawnMob('cow', g.player.pos.x + 4, g.player.pos.z); });
  check('host mob appears at client', await until(B, () => window.game.mobs.some((m) => m.type === 'cow')));
  const nid = await B.evaluate(() => window.game.mobs.find((m) => m.type === 'cow').nid);
  const hp0 = await A.evaluate((n) => window.game.mobs.find((m) => m.nid === n)?.hp, nid);
  await B.evaluate((n) => { const g = window.game; g.hitMob(g.mobs.find((m) => m.nid === n), 3); }, nid);
  check('client hit damages the host mob', await until(A, (a) => window.game.mobs.find((m) => m.nid === a.nid)?.hp < a.hp0, { nid, hp0 }), `hp0 ${hp0}`);
  await A.evaluate(() => window.game.setTime(0.5));
  check('day time follows the host', await until(B, () => /· 1[12]:/.test(document.getElementById('clock').textContent)), await B.textContent('#clock'));

  // ground items: host drops, client picks up through the host
  await A.evaluate(() => { const g = window.game; g.addItem('stone', 3, true); const i = g.inv.slots.findIndex((s) => s?.id === 'stone'); g.inv.sel = i; g.dropHeld(true); });
  check('dropped item appears at client', await until(B, () => window.game.groundItems.some((x) => x.id === 'stone')));

  // chat
  await B.evaluate(() => { const el = document.getElementById('chatInput'); el.value = 'Ahoj z klienta'; el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); });
  check('chat from client shows at host', await until(A, () => document.getElementById('feed').textContent.includes('Ahoj z klienta')));

  // creative permission and kick
  await A.evaluate(() => { const g = window.game; const P = [...g.others.values()][0]; g.NET.allowAll = false; P.perm = false; g.NET.sendTo(P.pid, ['perm', false]); });
  check('host can take creative away', await until(B, () => window.game.NET.perm === false));

  // client leaves
  await B.close();
  check('host notices the client left', await until(A, () => window.game.others.size === 0, null, 20000));
} catch (e) {
  check('test ran without exception', false, e.stack || e);
}
check('no console errors (host)', A.errors.length === 0, A.errors.slice(0, 5).join(' | '));
check('no console errors (client)', B.errors.length === 0, B.errors.slice(0, 5).join(' | '));
fs.writeFileSync(`${out}.json`, JSON.stringify(results, null, 2));
await browser.close();
await server?.close();
const bad = failed();
console.log(`\n${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
