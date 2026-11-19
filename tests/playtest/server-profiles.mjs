// Player profiles on the Node server in real browsers: the first login asks for name + PIN, the same browser then
// needs no PIN, a fresh browser with name + PIN gets the same backpack (and the old session hears "Přihlásil ses jinde."),
// wrong PIN / taken name, the backpack is per world, a server restart keeps players, the admin page (password, list,
// PIN reset) and "Změnit hráče". Also saves screenshots of the start menu (desktop, phone 390 px, phone landscape).
// Usage: npm run build && node tests/playtest/server-profiles.mjs [out-prefix]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, checker, openPage, waitGame, sleep, SLOW } from './lib.mjs';

const out = process.argv[2] || 'playtest-profiles';
const { check, results, failed } = checker('profiles: ');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'louka-profiles-'));
function startServer() {
  const env = { ...process.env, PORT: '0', DATA_DIR: dataDir, ROOM_PASSWORD: 'kroužek', SAVE_SECONDS: '1', SILENT_SECONDS: String(30 * SLOW), ADMIN_PASSWORD: 'spravce', WORLDS: 'svet:Hlavní svět,kreativ:Kreativní svět:creative' };
  const child = spawn(process.execPath, ['server/index.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  return new Promise((ok, fail) => {
    const t = setTimeout(() => fail(new Error('server did not start: ' + log)), 20000);
    child.stdout.on('data', (d) => { log += d; const m = log.match(/http:\/\/localhost:(\d+)\//); if (m) { clearTimeout(t); ok({ child, url: `http://127.0.0.1:${m[1]}/`, log: () => log }); } });
    child.stderr.on('data', (d) => { log += d; });
    child.on('exit', (code, sig) => { if (!child.stopping) console.log(`server exited early (code ${code}, signal ${sig}); log:\n${log.split('\n').slice(-30).join('\n')}`); });
  });
}
const stop = (s) => new Promise((ok) => { if (s.child.exitCode !== null || s.child.signalCode) return ok(); s.child.stopping = true; s.child.on('exit', ok); s.child.kill(); });
const until = async (page, fn, arg, timeout = 15000) => { try { await page.waitForFunction(fn, arg, { timeout: timeout * SLOW, polling: 100 }); return true; } catch { return false; } };
const menuReady = (page) => until(page, () => document.querySelectorAll('#mWorlds button[data-world]').length === 2 && !document.getElementById('pgMain').hidden);
const msgText = (page) => page.evaluate(() => document.getElementById('menuMsg')?.textContent || '');
// click a world; the password if asked; name + PIN if asked (pin = null: expect no PIN question)
async function enter(page, world, { name, pin } = {}) {
  await menuReady(page);
  if (name && await page.isVisible('#mName')) await page.fill('#mName', name);
  await page.click(`#mWorlds button[data-world="${world}"]`);
  const next = await page.waitForSelector('#pgPass:not([hidden]), #pgProfile:not([hidden]), #pgBusy:not([hidden])', { timeout: 10000 }).then((e) => e.getAttribute('id'), () => null);
  if (next === 'pgPass') { await page.fill('#mPass', 'kroužek'); await page.click('#mPassGo'); }
  if (pin == null) return;
  await page.waitForSelector('#pgProfile:not([hidden])', { timeout: 10000 });
  if (name) await page.fill('#mPName', name);
  await page.fill('#mPin', pin);
  await page.click('#mProfileGo');
}
async function leave(page) { // Esc menu -> Odejít (sends the backpack to the server)
  await page.evaluate(() => document.dispatchEvent(new Event('pointerlockchange')));
  await page.click('#pause [data-leave]');
  await menuReady(page);
}
const count = (page, id) => page.evaluate((i) => window.game.countItem(i), id);
const shotDir = process.env.MENU_SHOTS || '.';
const snap = (page, name) => page.screenshot({ path: path.join(shotDir, `${out}-${name}.png`) }).catch((e) => console.log('WARN  screenshot: ' + e.message.split('\n')[0]));

let srv = await startServer();
const browser = await launch();
const pages = [];
const open = async (label, opts = {}) => { const p = await openPage(browser, srv.url, { label, ...opts }); pages.push(p); return p; };
try {
  const A = await open('Ája: ');
  check('the start menu shows the worlds first, with one line each', await menuReady(A) && /Přežij a stav spolu s ostatními z kroužku/.test(await A.innerText('#mWorlds')) && /Stav bez omezení/.test(await A.innerText('#mWorlds')));
  await snap(A, 'menu-desktop');
  for (const [w, h, n] of [[390, 844, 'menu-phone'], [844, 390, 'menu-phone-landscape']]) {
    const P = await open('phone: ', { viewport: { width: w, height: h } });
    await menuReady(P);
    check(`menu fits ${w}×${h} without sideways scrolling`, await P.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await snap(P, n);
    await P.context().close();
  }

  // 1) first login: password, then name + PIN
  await A.fill('#mName', 'Ája');
  await A.click('#mWorlds button[data-world="svet"]');
  await A.waitForSelector('#pgPass:not([hidden])');
  await A.fill('#mPass', 'kroužek');
  await A.click('#mPassGo');
  check('first login asks for name + PIN (name prefilled, one-line explanation)', await until(A, () => !document.getElementById('pgProfile').hidden) && (await A.inputValue('#mPName')) === 'Ája' && /Zapamatuj si ho, s ním se dostaneš ke svému batohu i na jiném počítači\./.test(await A.innerText('#pgProfile')));
  await snap(A, 'menu-pin');
  await A.fill('#mPin', '4826');
  await A.press('#mPin', 'Enter');
  await waitGame(A, 60000);
  check('Ája plays', await A.evaluate(() => window.game.NET.name === 'Ája'));
  check('the browser remembers name + token (not the PIN)', await A.evaluate(() => { const v = Object.values(JSON.parse(localStorage.getItem('rise-hrac') || '{}'))[0]; return v?.name === 'Ája' && v.token?.length > 20 && !JSON.stringify(localStorage).includes('4826'); }));
  await A.evaluate(() => { T.clearInv(); window.game.addItem('iron', 5, true); window.game.addItem('apple', 2, true); });
  await leave(A);
  check('logged in: "Hraješ jako Ája · Změnit hráče" instead of the name field', (await A.innerText('#mWho')).startsWith('Hraješ jako Ája · Změnit hráče') && !(await A.isVisible('#mName')));
  await snap(A, 'menu-logged-in');

  // 2) the same browser again: no PIN
  await enter(A, 'svet');
  await waitGame(A, 60000);
  check('second login on the same browser needs no PIN, backpack is there', (await count(A, 'iron')) === 5 && (await count(A, 'apple')) === 2);

  // 3) another computer (fresh browser): name + PIN -> the same backpack; the first session is closed
  const C = await open('Ája on another PC: ');
  await enter(C, 'svet', { name: 'ája', pin: '4826' });
  await waitGame(C, 60000);
  check('a fresh browser with name + PIN gets the same backpack', await C.evaluate(() => window.game.NET.name === 'Ája') && (await count(C, 'iron')) === 5 && (await count(C, 'apple')) === 2);
  check('the older session hears "Přihlásil ses jinde."', await until(A, () => document.getElementById('menuMsg')?.textContent === 'Přihlásil ses jinde.', null, 20000), await msgText(A));

  // 4) wrong PIN / taken name
  const D = await open('Dan: ');
  await enter(D, 'svet', { name: 'Ája', pin: '0000' });
  check('wrong PIN is refused (Czech message, PIN asked again)', await until(D, () => /Špatný PIN/.test(document.getElementById('menuMsg').textContent) && !document.getElementById('pgProfile').hidden && document.getElementById('mPin').value === ''), await msgText(D));
  check('…which also says the name may be taken', /jméno „Ája“ už má někdo jiný/.test(await msgText(D)) && /zbývá pokusů: 4/.test(await msgText(D)));
  await D.fill('#mPName', 'Dan');
  await D.fill('#mPin', '1111');
  await D.click('#mProfileGo');
  await waitGame(D, 60000);
  check('Dan picks another name and plays', await D.evaluate(() => window.game.NET.name === 'Dan'));

  // 5) the backpack is per world
  await leave(C);
  await enter(C, 'kreativ');
  await waitGame(C, 60000);
  check('the backpack is per world (empty in the creative world)', await C.evaluate(() => window.game.NET.worldName === 'Kreativní svět') && (await count(C, 'iron')) === 0);
  await C.evaluate(() => window.game.addItem('glass', 7, true));
  await leave(C);
  await sleep(1500); // saved every second

  // 6) server restart keeps the players
  await stop(srv);
  srv = await startServer();
  const E = await open('Ája after restart: ');
  await enter(E, 'svet', { name: 'Ája', pin: '4826' });
  await waitGame(E, 60000);
  check('after a server restart the profile and backpack are still there', (await count(E, 'iron')) === 5);

  // 7) admin page
  check('the admin page needs the password', (await fetch(srv.url + 'admin')).status === 401);
  const adminCtx = await browser.newContext({ httpCredentials: { username: 'lektor', password: 'spravce' }, viewport: { width: 390, height: 760 } });
  const adm = await adminCtx.newPage();
  await adm.goto(srv.url + 'admin');
  const list = await adm.innerText('body');
  check('the admin page lists the players and who is playing now', /Ája/.test(list) && /Dan/.test(list) && /● Hlavní svět/.test(list), list.slice(0, 300));
  await snap(adm, 'admin-phone');
  adm.on('dialog', (d) => d.accept());
  await adm.click('form[data-name="Ája"] button');
  check('PIN reset from the admin page', await adm.waitForSelector('.ok', { timeout: 5000 }).then(() => true, () => false) && /PIN hráče Ája je smazaný/.test(await adm.innerText('.ok')));
  await adminCtx.close();
  const F = await open('Ája after reset: ');
  await enter(F, 'svet', { name: 'Ája', pin: '1357' });
  await waitGame(F, 60000);
  check('after the reset the next PIN is the new PIN, backpack kept', (await count(F, 'iron')) === 5);

  // 8) "Změnit hráče" forgets the login
  await leave(F);
  await F.click('#mLogout');
  check('"Změnit hráče" shows the name field again', await F.isVisible('#mName') && !(await F.isVisible('#mWho')));
  await F.click('#mWorlds button[data-world="svet"]');
  check('…and the next world click asks for name + PIN', await until(F, () => !document.getElementById('pgProfile').hidden));
} catch (e) {
  check('test ran without exception', false, e.stack || e);
  console.log('server log:', srv.log().split(String.fromCharCode(10)).slice(-20).join(' | '));
}
const ignore = (t) => /WebSocket|ERR_CONNECTION|Failed to load resource/.test(t);
for (const p of pages) if (!p.isClosed()) check(`no console errors (${p.errors[0]?.split(':')[0] || 'page'})`, p.errors.filter((e) => !ignore(e)).length === 0, p.errors.slice(0, 3).join(' | '));
fs.writeFileSync(`${out}.json`, JSON.stringify(results, null, 2));
await browser.close();
await stop(srv);
const bad = failed();
console.log(`\n${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
