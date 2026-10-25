// Skutečná hra ve dvou prohlížečích proti Říši na Cloudflare (wrangler dev): menu ukáže světy z /worlds,
// heslo, jméno + PIN, oba hráči se vidí, stavba a kopání se přenáší, druhý svět je oddělený, po odchodu všech
// a novém spuštění je svět pořád tam.
//   (v kořeni) npm run build   pak   cd cloudflare && npm run test:browser
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checker, launch, openPage, sleep, waitGame } from '../../tests/playtest/lib.mjs';
import { startDev, stopDev } from './dev-server.mjs';

const PASS = 'kroužek';
const ENV = { ROOM_PASSWORD: PASS, SAVE_SECONDS: '1', WORLDS: 'svet:Hlavní svět,kreativ:Kreativní svět:creative' };
const { check, results, failed } = checker('cloudflare: ');
const state = fs.mkdtempSync(path.join(os.tmpdir(), 'rise-cf-browser-'));
const until = async (page, fn, ms = 15000) => { try { await page.waitForFunction(fn, null, { timeout: ms }); return true; } catch { return false; } };

// Hlavní menu -> tlačítko světa -> heslo (poprvé) -> jméno + PIN (poprvé) -> hra
async function joinWorld(page, world, name, pass) {
  await page.waitForSelector(`#mWorlds button[data-world="${world}"]`, { timeout: 15000 });
  await page.fill('#mName', name);
  await page.click(`#mWorlds button[data-world="${world}"]`);
  if (pass != null) {
    await page.waitForSelector('#pgPass:not([hidden])', { timeout: 5000 });
    await page.fill('#mPass', pass);
    await page.click('#mPassGo');
  }
  await page.waitForSelector('#pgProfile:not([hidden])', { timeout: 5000 });
  await page.fill('#mPin', '1234');
  await page.click('#mProfileGo');
}

let srv = await startDev({ port: 8798, state, env: ENV });
const browser = await launch();
try {
  const A = await openPage(browser, srv.url, { label: 'Ája: ' });
  const B = await openPage(browser, srv.url, { label: 'Bára: ' });
  check('menu lists both worlds from /worlds', await until(A, () => document.querySelectorAll('#mWorlds button[data-world]').length === 2), await A.textContent('#mWorlds'));
  await joinWorld(A, 'svet', 'Ája', PASS);
  await waitGame(A, 90000);
  check('Ája joins the main world', await A.evaluate(() => window.game.NET.client === true && window.game.NET.name === 'Ája'));
  await joinWorld(B, 'svet', 'Bára', PASS);
  await waitGame(B, 90000);
  check('both see each other', await until(A, () => [...window.game.others.values()].some((P) => P.name === 'Bára' && P.pose)) && await until(B, () => [...window.game.others.values()].some((P) => P.name === 'Ája' && P.pose)));
  await A.evaluate(() => { window.game.blocks.set('4,2,30', 'bricks'); });
  check('block from Ája appears at Bára', await until(B, () => window.game.blocks.get('4,2,30') === 'bricks'));
  await B.evaluate(() => { window.game.setVox(5, -6, 30, 0); });
  check('digging from Bára reaches Ája', await until(A, () => window.game.getVox(5, -6, 30) === 0));
  check('animals come from the world on Cloudflare', await until(A, () => window.game.mobs?.length > 0, 30000));

  for (const p of [A, B]) await p.close(); // (tři hry se softwarovým WebGL naráz jsou na pomalém stroji moc)
  await sleep(2500); // poslední odešel: svět se uložil
  const C = await openPage(browser, srv.url, { label: 'Cyril: ' });
  await joinWorld(C, 'kreativ', 'Cyril', PASS);
  await waitGame(C, 90000);
  check('the creative world is its own world', await C.evaluate(() => window.game.NET.client === true && window.game.NET.worldName === 'Kreativní svět' && !window.game.blocks.get('4,2,30')));
  await C.close();
} catch (e) {
  check('no error: ' + e.message, false);
} finally {
  await stopDev(srv);
}

srv = await startDev({ port: 8798, state, env: ENV });
try {
  const D = await openPage(browser, srv.url, { label: 'Dan: ' });
  await joinWorld(D, 'svet', 'Dan', PASS);
  await waitGame(D, 90000);
  check('after a restart the block is still there', await until(D, () => window.game.blocks.get('4,2,30') === 'bricks'));
} catch (e) {
  check('no error after restart: ' + e.message, false);
} finally {
  await browser.close();
  await stopDev(srv);
}
console.log(`\n${results.length - failed().length}/${results.length} ok`);
process.exit(failed().length ? 1 : 0);
