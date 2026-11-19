// Multiplayer test with two worlds on one Node.js server (WORLDS): the main menu shows a button per world, the club
// password is asked once and remembered (a wrong stored one is forgotten and asked again), two browsers join
// different worlds and don't see each other's blocks, players or chat; creative only in the creative world;
// the backpack is saved per world (the first world also reads the old single-world key); the last choice is remembered.
// Usage: npm run build && node tests/playtest/server-worlds.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, checker, openPage, waitGame, sleep, SLOW } from './lib.mjs';

const out = process.argv[2] || 'playtest-worlds';
const { check, results, failed } = checker('worlds: ');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'louka-worlds-'));
function startServer() {
  const env = { ...process.env, PORT: '0', DATA_DIR: dataDir, ROOM_PASSWORD: 'kroužek', SAVE_SECONDS: '1', SILENT_SECONDS: String(30 * SLOW), WORLDS: 'svet:Hlavní svět,kreativ:Kreativní svět:creative' };
  const child = spawn(process.execPath, ['server/index.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  return new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('server did not start: ' + log)), 20000);
    child.stdout.on('data', (d) => { log += d; const m = log.match(/http:\/\/localhost:(\d+)\//); if (m) { clearTimeout(t); ok({ child, port: m[1], url: `http://127.0.0.1:${m[1]}/`, log: () => log }); } });
    child.stderr.on('data', (d) => { log += d; });
    child.on('exit', (code, sig) => { if (!child.stopping) console.log(`server exited early (code ${code}, signal ${sig}); log:\n${log.split('\n').slice(-30).join('\n')}`); });
  });
}
const stop = (s) => new Promise((ok) => { if (s.child.exitCode !== null || s.child.signalCode) return ok(); s.child.stopping = true; s.child.on('exit', ok); s.child.kill(); });
const until = async (page, fn, arg, timeout = 15000) => { try { await page.waitForFunction(fn, arg, { timeout: timeout * SLOW, polling: 100 }); return true; } catch { return false; } };
// Hlavní menu: tlačítka světů ze serveru (GET /worlds)
async function toWorlds(page, name) {
  const ok = await until(page, () => document.querySelectorAll('#mWorlds button[data-world]').length === 2 && !document.getElementById('pgMain').hidden);
  if (await page.isVisible('#mName')) await page.fill('#mName', name); // přihlášený hráč pole se jménem nemá
  return ok;
}
const passPage = (page) => until(page, () => !document.getElementById('pgPass').hidden, null, 10000);
// první přihlášení na tomhle prohlížeči: jméno je předvyplněné z menu, stačí PIN
async function profile(page, pin = '1234') {
  await page.waitForSelector('#pgProfile:not([hidden])', { timeout: 10000 });
  await page.fill('#mPin', pin);
  await page.press('#mPin', 'Enter');
}
const worldButtons = (page) => page.$$eval('#mWorlds button', (bs) => bs.map((b) => ({ id: b.dataset.world, text: b.textContent, on: b.classList.contains('on'), focus: document.activeElement === b })));

const srv = await startServer();
const wsKey = `rise-klient-ws://127.0.0.1:${srv.port}/ws`;
const browser = await launch();
const A = await openPage(browser, srv.url, { label: 'Ája: ' });
// Bára má adresu z odkazu (?server=), jako hra z GitHub Pages: menu neví, že server chce heslo, zjistí to až při připojení.
const B = await openPage(browser, srv.url + `?server=127.0.0.1:${srv.port}&world=kreativ`, { label: 'Bára: ' });
// Uložení z doby jednoho světa (starý klíč): první svět ho převezme, druhý ne.
for (const p of [A, B]) await p.evaluate(([k]) => localStorage.setItem(k, JSON.stringify({ pos: [40.5, 3, 40.5] })), [wsKey]);

try {
  check('the main menu lists the worlds of the server', await toWorlds(A, 'Ája'));
  const list = await worldButtons(A);
  check('two world buttons with names, one line about the world and players', list.length === 2 && /Hlavní svět/.test(list[0].text) && /0\/8 hráčů/.test(list[0].text) && /Přežij a stav spolu s ostatními z kroužku/.test(list[0].text) && /Kreativní svět/.test(list[1].text) && /Stav bez omezení, všechno máš hned/.test(list[1].text), JSON.stringify(list));
  await A.click('#mWorlds button[data-world="svet"]');
  check('clicking a world asks for the club password', await passPage(A));
  await A.fill('#mPass', 'kroužek');
  await A.click('#mPassGo');
  await profile(A);
  await waitGame(A, 60000);
  check('Ája joins the survival world', await A.evaluate(() => window.game.NET.client && window.game.NET.worldName === 'Hlavní svět' && !window.game.NET.perm));
  check('the first world takes over the old single-world save', await A.evaluate(() => Math.abs(window.game.player.pos.x - 40.5) < 3 && Math.abs(window.game.player.pos.z - 40.5) < 3), await A.evaluate(() => window.game.player.pos.toArray().map((v) => v.toFixed(1)).join(',')));

  await B.evaluate(() => localStorage.setItem('rise-jmeno', 'Bára')); // jméno z minula (psaní do pole by vzalo fokus světu)
  await B.reload({ waitUntil: 'domcontentloaded' });
  check('Bára gets the world list (address from ?server=)', await until(B, () => document.querySelectorAll('#mWorlds button[data-world]').length === 2 && document.getElementById('mName').value === 'Bára'));
  const listB = await worldButtons(B);
  check('?world=kreativ preselects the creative world', listB.find((b) => b.id === 'kreativ')?.on && listB.find((b) => b.id === 'kreativ')?.focus, JSON.stringify(listB));
  check('the list shows Ája in the survival world', /1\/8 hráčů/.test(listB[0].text), listB[0].text);
  await B.keyboard.press('Enter');
  await profile(B); // the menu doesn't know about the password yet: name + PIN first, then the server asks for the password
  check('a server that wants a password asks for it (no error message yet)', await passPage(B) && await B.evaluate(() => document.getElementById('menuMsg').hidden));
  await B.fill('#mPass', 'kroužek');
  await B.press('#mPass', 'Enter'); // the typed name + PIN are kept
  await waitGame(B, 60000);
  check('Bára joins the creative world', await B.evaluate(() => window.game.NET.worldName === 'Kreativní svět' && window.game.NET.perm === true));
  check('the second world ignores the old save', await B.evaluate(() => Math.hypot(window.game.player.pos.x - 40.5, window.game.player.pos.z - 40.5) > 5));
  check('info box shows the world name', await until(A, () => /Hlavní svět · 1\/8/.test(document.getElementById('netbox').textContent)) && await until(B, () => /Kreativní svět · 1\/8/.test(document.getElementById('netbox').textContent)), await B.textContent('#netbox'));

  await A.evaluate(() => { window.game.blocks.set('4,2,30', 'bricks'); });
  await B.evaluate(() => { window.game.blocks.set('5,2,30', 'glass'); });
  await B.evaluate(() => { const el = document.getElementById('chatInput'); el.value = 'Ahoj z kreativu'; el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); });
  await B.evaluate(() => window.game.setCreative(true));
  await A.evaluate(() => window.game.setCreative(true));
  check('creative is switched off again in the survival world', await until(A, () => !window.game.creative));
  await sleep(2500);
  check('creative stays on in the creative world', await B.evaluate(() => window.game.creative === true));
  check('blocks stay in their world', await A.evaluate(() => !window.game.blocks.has('5,2,30')) && await B.evaluate(() => !window.game.blocks.has('4,2,30')));
  check('players of the other world are not shown', await A.evaluate(() => window.game.others.size === 0) && await B.evaluate(() => window.game.others.size === 0));
  check('chat stays in its world', !(await A.textContent('#feed')).includes('Ahoj z kreativu'));

  await A.evaluate(() => { window.game.addItem('apple', 3, true); window.game.saveGame(); });
  await B.evaluate(() => { window.game.addItem('glass', 5, true); window.game.saveGame(); });
  await sleep(1800); // the server saves every second
  const saved = (id) => { try { return Object.values(JSON.parse(fs.readFileSync(path.join(dataDir, id, 'world.json'), 'utf8')).players || {}); } catch { return []; } };
  const has = (id, item) => saved(id).some((me) => me.inv.some((s) => s?.id === item));
  check('the backpack is saved on the server, per world', has('svet', 'apple') && !has('svet', 'glass') && has('kreativ', 'glass') && !has('kreativ', 'apple'), JSON.stringify([saved('svet').length, saved('kreativ').length]));
  check('…and no longer in the browser (the old save moved to the server)', await A.evaluate((k) => !localStorage.getItem(k) && !localStorage.getItem(k + '#svet'), wsKey));

  // znovu do menu: výběr si pamatuje naposledy zvolený svět a heslo
  await A.reload({ waitUntil: 'domcontentloaded' });
  check('after leaving, the menu remembers the last world', await toWorlds(A, 'Ája') && (await worldButtons(A)).find((b) => b.id === 'svet')?.on);
  check('…and shows who is logged in instead of the name field', (await A.innerText('#mWho')).startsWith('Hraješ jako Ája · Změnit hráče') && !(await A.isVisible('#mName')), await A.innerText('#mWho'));
  check('the password is remembered per server address', await A.evaluate((u) => JSON.parse(localStorage.getItem('rise-heslo') || '{}')[u] === 'kroužek', `ws://127.0.0.1:${srv.port}/ws`));
  await A.click('#mWorlds button[data-world="svet"]');
  await waitGame(A, 60000);
  check('…so the next join does not ask again', await A.evaluate(() => window.game.NET.worldName === 'Hlavní svět'));
  // heslo se na serveru změnilo (v prohlížeči je staré): zapomenout ho a zeptat se znovu
  await A.evaluate((u) => localStorage.setItem('rise-heslo', JSON.stringify({ [u]: 'stare-heslo' })), `ws://127.0.0.1:${srv.port}/ws`);
  await A.reload({ waitUntil: 'domcontentloaded' });
  await toWorlds(A, 'Ája');
  await A.click('#mWorlds button[data-world="svet"]');
  check('a wrong stored password is forgotten and asked again', await passPage(A) && await until(A, () => document.getElementById('menuMsg').textContent === 'Špatné heslo. Zkus to znovu.') && await A.evaluate(() => !localStorage.getItem('rise-heslo')?.includes('stare-heslo')), await A.textContent('#menuMsg'));
} catch (e) {
  check('test ran without exception', false, e.stack || e);
  for (const [n, p] of [['Ája', A], ['Bára', B]]) console.log(n, 'menu message:', await p.evaluate(() => document.getElementById('menuMsg')?.textContent).catch(() => '?'));
  console.log('server log:', srv.log().split(String.fromCharCode(10)).slice(-15).join(' | '));
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
