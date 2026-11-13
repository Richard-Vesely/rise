// node tests/playtest/dragon-loot.mjs [dist-or-url]
import assert from 'node:assert/strict';
import { launch, serveDir, openPage, waitGame } from './lib.mjs';

const target = process.argv[2] || 'dist';
const server = /^https?:/.test(target) ? null : await serveDir(target);
const browser = await launch();
const expected = { sky_helmet: 1, sky_chestplate: 1, sky_leggings: 1, sky_boots: 1,
  markorite_sword: 1, markorite_pick: 1, markorite: 16, gold_ingot: 16, shard: 12, markapple: 5 };
try {
  const page = await openPage(browser, server?.url || target);
  await page.click('#mSolo'); await waitGame(page);
  const reward = await page.evaluate((ids) => {
    document.getElementById('intro').style.display = 'none';
    game.setCreative(true); T.clearInv(); T.tp(-40000, -69, 0.45); T.step(100);
    const dragon = game.mobs.find(m => m.type === 'dragon');
    if (!dragon) throw new Error('Dragon did not spawn');
    game.hitMob(dragon, dragon.hp); T.step(20);
    game.saveGame();
    return { loot: Object.fromEntries(ids.map(id => [id, T.count(id)])),
      worn: game.inv.slots.some(s => s && s.w > 0) };
  }, Object.keys(expected));
  assert.deepEqual(reward.loot, expected); assert.equal(reward.worn, false);
  console.log('PASS complete dragon treasure delivered into backpack, all equipment unworn');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.click('#mSolo'); await waitGame(page);
  const restored = await page.evaluate(ids => {
    T.step(100);
    return { loot: Object.fromEntries(ids.map(id => [id, T.count(id)])),
      dragon: game.mobs.some(m => m.type === 'dragon') };
  }, Object.keys(expected));
  assert.deepEqual(restored.loot, expected); assert.equal(restored.dragon, false);
  assert.deepEqual(page.errors, []);
  console.log('PASS treasure survives reload and defeated dragon stays defeated');
} finally { await browser.close(); await server?.close(); }
