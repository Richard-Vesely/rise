// Souboje hráčů: Node server se světem s volbou pvp a dva prohlížeče. Ája udeří Báru mečem a trefí ji šípem
// (hostitel zásah zkontroluje a pošle Báře 'dmg'); v aréně je druhý hráč cíl (zaměření „hráč · souboj“).
// Pak svět s volbou pvp-mark: bez arény, souboj platí jen v Markově dimenzi.
// Usage: npm run build && node tests/playtest/server-pvp.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, checker, openPage, waitGame, sleep } from './lib.mjs';

const out = process.argv[2] || 'playtest-pvp';
const { check, results, failed } = checker('pvp: ');
function startServer(worlds = 'arena:Aréna:pvp') {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'louka-pvp-'));
  const env = { ...process.env, PORT: '0', DATA_DIR: dataDir, ROOM_PASSWORD: '', WORLDS: worlds };
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
async function join(page, name, world = 'arena') {
  await page.evaluate((n) => localStorage.setItem('rise-jmeno', n), name);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await until(page, () => document.querySelectorAll('#mWorlds button[data-world]').length === 1);
  await page.click(`#mWorlds button[data-world="${world}"]`);
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

let srv = await startServer();
const browser = await launch();
let A = await openPage(browser, srv.url, { label: 'Ája: ' });
let B = await openPage(browser, srv.url, { label: 'Bára: ' });
const errors = [];
try {
  await join(A, 'Ája');
  await join(B, 'Bára');
  for (const p of [A, B]) await p.evaluate(() => { T.tpg = (x, z) => T.tp(x, z, window.game.groundHeight(x, z)); });
  check('both join the pvp world', await A.evaluate(() => window.game.NET.pvp === true) && await B.evaluate(() => window.game.NET.pvp === true));
  // aréna: výbava, místo v aréně, tabulka bodů
  const kit = await A.evaluate(() => { const g = window.game; return { inv: g.inv.slots.slice(0, 5).map((s) => s && `${s.id}×${s.n}`), armor: g.armor.map((a) => a?.id), d: Math.hypot(g.player.pos.x + 40, g.player.pos.z), floor: g.blocks.get(`-40,${Math.floor(g.player.pos.y) - 1},0`) }; });
  check('joining the arena gives the kit and the iron armor', kit.inv.join() === 'iron_sword×1,bow×1,arrow×32,planks×32,meat×8' && kit.armor.every((a) => a?.startsWith('iron_')), JSON.stringify(kit));
  check('…and puts the player inside the arena on its floor', kit.d < 12 && kit.floor === 'bricks', JSON.stringify(kit));
  check('the score table is shown', await until(A, () => /Aréna/.test(document.getElementById('arenaScore')?.textContent || '')));
  for (const p of [A, B]) await p.evaluate(() => window.game.armor.fill(null)); // zásahy se měří bez brnění
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
  // vyřazení: Bára má 5 zdraví, Ája ji udeří; bod pro Áju, Bára se vrátí do arény s novou výbavou
  await sleep(600);
  await B.evaluate(() => { T.tpg(20.5, 37.5); window.game.player.hp = 5; window.game.inv.slots[0] = null; });
  await A.evaluate(() => { T.clearInv(); T.give('iron_sword', 1); T.hold('iron_sword'); T.tpg(20.5, 40); });
  await until(A, () => [...window.game.others.values()].some((P) => P.pose && Math.abs(P.pose.z - 37.5) < 0.5));
  await aimAtB(A);
  await A.evaluate(() => { const g = window.game; g.input.lmb = true; T.step(8); g.input.lmb = false; T.step(1, 0.0001); });
  check('Ája knocks Bára out and gets a point', await until(A, () => [...document.querySelectorAll('#arenaScore tr')].some((r) => r.textContent === '1.Ája10')), await A.evaluate(() => document.getElementById('arenaScore')?.textContent));
  check('everyone sees the knock-out in the feed', await until(B, () => document.getElementById('feed').textContent.includes('⚔ Ája vyřadil(a) hráče Bára')), await B.evaluate(() => document.getElementById('feed').textContent));
  check('Bára is back in the arena with a fresh kit', await until(B, () => { const g = window.game; return g.player.alive && g.player.hp === 100 && g.inv.slots[0]?.id === 'iron_sword' && Math.hypot(g.player.pos.x + 40, g.player.pos.z) < 12; }, null, 8000));

  // ---------- pvp-mark: hlavní svět, souboje jen v Markově dimenzi (x > 20000)
  errors.push(...A.errors, ...B.errors);
  await A.close(); await B.close(); await stop(srv);
  srv = await startServer('svet:Hlavní svět:pvp-mark');
  A = await openPage(browser, srv.url, { label: 'Ája (mark): ' });
  B = await openPage(browser, srv.url, { label: 'Bára (mark): ' });
  await join(A, 'Ája', 'svet');
  await join(B, 'Bára', 'svet');
  for (const p of [A, B]) await p.evaluate(() => { T.tpg = (x, z) => T.tp(x, z, window.game.groundHeight(x, z)); });
  const mk = await A.evaluate(() => { const g = window.game; return { mark: g.NET.pvpMark, pvp: g.NET.pvp, kit: g.inv.slots[0]?.id === 'iron_sword', board: !!document.getElementById('arenaScore') }; });
  check('pvp-mark: joins as a normal world (no kit, no score table)', mk.mark === true && mk.pvp === false && !mk.kit && !mk.board, JSON.stringify(mk));
  // Ája udeří Báru na místě x; vrací [cíl, o kolik Bára přišla]
  const swing = async (ax, bx) => {
    await B.evaluate((x) => { T.tpg(x, 37.5); window.game.player.hp = 100; }, bx);
    await A.evaluate((x) => { T.tpg(x, 40); T.clearInv(); T.give('iron_sword', 1); T.hold('iron_sword'); }, ax);
    await until(A, (x) => [...window.game.others.values()].some((P) => P.pose && Math.abs(P.pose.x - x) < 0.5 && Math.abs(P.pose.z - 37.5) < 0.5), bx);
    await sleep(800);
    const tgt = await aimAtB(A);
    const hp0 = await B.evaluate(() => window.game.player.hp);
    await A.evaluate(() => { const g = window.game; g.input.lmb = true; T.step(8); g.input.lmb = false; T.step(1, 0.0001); });
    await until(B, (h) => window.game.player.hp < h, hp0, 2000);
    await sleep(300);
    return [tgt?.kind, hp0 - await B.evaluate(() => window.game.player.hp)];
  };
  const outside = await swing(20.5, 20.5);
  check('pvp-mark: outside Markova dimenze the other player is no target and is not hurt', outside[0] !== 'player' && outside[1] === 0, JSON.stringify(outside));
  const half = await swing(19998.5, 20001.5);
  check('pvp-mark: attacker outside, target inside: no hit', half[0] !== 'player' && half[1] === 0, JSON.stringify(half));
  const inside = await swing(20100.5, 20100.5);
  check('pvp-mark: inside Markova dimenze a full sword hit hurts by 15', inside[0] === 'player' && inside[1] === 15, JSON.stringify(inside));
} catch (e) {
  check('test ran without exception', false, e.stack || e);
  console.log('server log:', srv.log().split('\n').slice(-15).join(' | '));
}
const ignore = (t) => /WebSocket|ERR_CONNECTION|Failed to load resource/.test(t);
errors.push(...A.errors, ...B.errors);
check('no console errors', errors.filter((e) => !ignore(e)).length === 0, errors.filter((e) => !ignore(e)).slice(0, 3).join(' | '));
fs.writeFileSync(`${out}.json`, JSON.stringify(results, null, 2));
await browser.close();
await stop(srv);
const bad = failed();
console.log(`\n${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
