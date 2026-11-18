// node tests/playtest/dragon-loot.mjs [dist-or-url]
import assert from 'node:assert/strict';
import { launch, serveDir, openPage, waitGame } from './lib.mjs';

const target = process.argv[2] || 'dist';
const server = /^https?:/.test(target) ? null : await serveDir(target);
const browser = await launch();
const expected = { sky_helmet: 1, sky_chestplate: 1, sky_leggings: 1, sky_boots: 1,
  markorite_sword: 1, markorite_pick: 1, markorite: 128, gold_ingot: 32, shard: 24, markapple: 10 };
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
  console.log('PASS treasure and dragon escape period survive reload');
  const nextFight = await page.evaluate((ids) => {
    const originalNow = Date.now;
    const deadline = game.worldState().dragonRespawnAt;
    try {
      Date.now = () => deadline - 1;
      game.setCreative(true); T.tp(-40000, -69, 0.45); T.step(100);
      const early = game.mobs.some(m => m.type === 'dragon');
      Date.now = () => deadline;
      T.step(100);
      const dragons = game.mobs.filter(m => m.type === 'dragon' && !m.dead);
      const fullHP = dragons[0]?.hp;
      T.clearInv(); T.give('stone', 36 * 64);
      // Vítěz s plným batohem dostane vše i za zásah z dálky.
      T.tp(-40000, -3, 0.45);
      game.hitMob(dragons[0], dragons[0].hp);
      const state = game.worldState();
      return { early, count: dragons.length, fullHP,
        deadline: state.dragonRespawnAt - deadline,
        dropped: Object.fromEntries(ids.map(id => [id, state.ground.filter(g => g.id === id).reduce((n, g) => n + g.n, 0)])) };
    } finally { Date.now = originalNow; }
  }, Object.keys(expected));
  assert.equal(nextFight.early, false);
  assert.equal(nextFight.count, 1); assert.equal(nextFight.fullHP, 300);
  assert.equal(nextFight.deadline, 120000);
  assert.deepEqual(nextFight.dropped, expected);
  assert.deepEqual(page.errors, []);
  console.log('PASS one full-health dragon returns at deadline; next ranged victory with full backpack loses no reward');
} finally { await browser.close(); await server?.close(); }
