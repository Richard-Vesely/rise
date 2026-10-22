// Souboje hráčů: Node server se světem s volbou pvp a dva prohlížeče. Ája udeří Báru mečem a trefí ji šípem
// (hostitel zásah zkontroluje a pošle Báře 'dmg'); v aréně je druhý hráč cíl (zaměření „hráč · souboj“).
// Usage: npm run build && node tests/playtest/server-pvp.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, checker, openPage, waitGame, sleep } from './lib.mjs';

const out = process.argv[2] || 'playtest-pvp';
const { check, results, failed } = checker('pvp: ');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'louka-pvp-'));
function startServer() {
  const env = { ...process.env, PORT: '0', DATA_DIR: dataDir, ROOM_PASSWORD: '', WORLDS: 'arena:Aréna:pvp' };
  const child = spawn(process.execPath, ['server/index.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  return new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('server did not start: ' + log)), 20000);
    child.stdout.on('data', (d) => { log += d; const m = log.match(/http:\/\/localhost:(\d+)\//); if (m) { clearTimeout(t); ok({ child, url: `http://127.0.0.1:${m[1]}/`, log: () => log }); } });
    child.stderr.on('data', (d) => { log += d; });
  });
}
const stop = (s) => new Promise((ok) => { if (s.child.exitCode !== null || s.child.signalCode) return ok(); s.child.on('exit', ok); s.child.kill(); });
const until = async (page, fn, arg, timeout = 15000) => { try { await page.waitForFunction(fn, arg, { timeout, polling: 100 }); return true; } catch { return false; } };
async function join(page, name) {
  await page.evaluate((n) => localStorage.setItem('rise-jmeno', n), name);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await until(page, () => document.querySelectorAll('#mWorlds button[data-world]').length === 1);
  await page.click('#mWorlds button[data-world="arena"]');
  await page.waitForSelector('#pgProfile:not([hidden])', { timeout: 10000 });
  await page.fill('#mPin', '1234');
  await page.press('#mPin', 'Enter');
  await waitGame(page, 60000);
}
// Ája zamíří na Báru (podle polohy, kterou poslal server) a vrátí, co vidí
const aimAtB = (A) => A.evaluate(() => {
  const g = window.game, b = [...g.others.values()][0]?.pose;
  if (!b) return null;
  T.aim(b.x, b.y + 1.1, b.z);
  return g.target && { kind: g.target.kind, name: g.target.name, hint: g.target.hint };
});

const srv = await startServer();
const browser = await launch();
const A = await openPage(browser, srv.url, { label: 'Ája: ' });
const B = await openPage(browser, srv.url, { label: 'Bára: ' });
try {
  await join(A, 'Ája');
  await join(B, 'Bára');
  for (const p of [A, B]) await p.evaluate(() => { T.tpg = (x, z) => T.tp(x, z, window.game.groundHeight(x, z)); });
  check('both join the pvp world', await A.evaluate(() => window.game.NET.pvp === true) && await B.evaluate(() => window.game.NET.pvp === true));
  // Bára stojí 2,5 m před Ájou, obě na zemi, Bára bez brnění a s plným zdravím
  await B.evaluate(() => { T.tpg(20.5, 37.5); window.game.player.hp = 100; });
  await A.evaluate(() => { T.tpg(20.5, 40); T.clearInv(); T.give('iron_sword', 1); T.hold('iron_sword'); });
  check('Ája sees Bára', await until(A, () => [...window.game.others.values()].some((P) => P.name === 'Bára' && P.pose && Math.abs(P.pose.z - 37.5) < 0.5)));
  const tgt = await aimAtB(A);
  check('the other player is a target in the arena', tgt?.kind === 'player' && tgt.name === 'Bára' && /souboj/.test(tgt.hint), JSON.stringify(tgt));
  await sleep(800); // Bára dopadla na zem
  const hp0 = await B.evaluate(() => window.game.player.hp);
  await A.evaluate(() => { const g = window.game; g.input.lmb = true; T.step(8); g.input.lmb = false; T.step(1, 0.0001); }); // jeden plně nabitý úder (další by přišel až za 0,59 s)
  await until(B, (h) => window.game.player.hp < h, hp0);
  await sleep(500);
  const hp1 = await B.evaluate(() => window.game.player.hp);
  check('a full sword hit hurts Bára by 15 (iron sword 6 × 2.5)', hp0 - hp1 === 15, JSON.stringify({ hp0, hp1 }));
  // šíp na 12 m
  await B.evaluate(() => T.tpg(20.5, 28));
  await sleep(500);
  await A.evaluate(() => { T.clearInv(); T.give('bow', 1); T.give('arrow', 3); T.hold('bow'); });
  await until(A, () => [...window.game.others.values()].some((P) => P.pose && Math.abs(P.pose.z - 28) < 0.5));
  const shot = await A.evaluate(() => {
    const g = window.game, b = [...g.others.values()][0].pose;
    g.input.rmb = true;
    for (let i = 0; i < 25; i++) { T.aim(b.x, b.y + 1.15, b.z); T.step(1); }
    g.input.rmb = false; T.step(1, 0.016);
    for (let i = 0; i < 40; i++) T.step(1, 0.016);
    return { arrows: T.count('arrow') };
  });
  await until(B, (h) => window.game.player.hp < h, hp1);
  await sleep(500);
  const hp2 = await B.evaluate(() => window.game.player.hp);
  check('a full arrow from 12 m hurts Bára by 25 (10 × 2.5)', hp1 - hp2 === 25, JSON.stringify({ hp1, hp2, shot }));
} catch (e) {
  check('test ran without exception', false, e.stack || e);
  console.log('server log:', srv.log().split('\n').slice(-15).join(' | '));
}
const ignore = (t) => /WebSocket|ERR_CONNECTION|Failed to load resource/.test(t);
check('no console errors (Ája)', A.errors.filter((e) => !ignore(e)).length === 0, A.errors.slice(0, 3).join(' | '));
check('no console errors (Bára)', B.errors.filter((e) => !ignore(e)).length === 0, B.errors.slice(0, 3).join(' | '));
fs.writeFileSync(`${out}.json`, JSON.stringify(results, null, 2));
await browser.close();
await stop(srv);
const bad = failed();
console.log(`\n${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
