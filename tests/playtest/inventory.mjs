// Play-test of the inventory tricks in a real browser with real mouse and keyboard events:
// drag spread (left / right), double-click gather, Shift + double-click, 1–9 over a slot, Q / Ctrl+Q, wheel, sort,
// Space = craft again, Shift-click craft-all, recipe preview, rich tooltips, middle-click pick, hotbar name,
// pickup magnet, stacks merging on the ground, nothing lost when the backpack is full.
// Usage: npm run build && node tests/playtest/inventory.mjs [dist] [out-prefix]
import fs from 'node:fs';
import { launch, serveDir, openPage, waitGame, checker, shot } from './lib.mjs';

const target = process.argv[2] || 'dist';
const out = process.argv[3] || 'playtest-inv';
const { check, results, failed } = checker('inventory: ');
const srv = await serveDir(target);
const browser = await launch();
const page = await openPage(browser, srv.url);
const ev = (fn, arg) => page.evaluate(fn, arg);
// Střed prvku (okno se každou půlsekundu překresluje, tak to případně zkusí znovu)
const box = async (sel) => {
  for (let k = 0; k < 20; k++) {
    const b = await page.evaluate((q) => { const r = document.querySelector(q)?.getBoundingClientRect(); return r && r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; }, sel);
    if (b) return b;
    await page.waitForTimeout(50);
  }
  throw new Error('not found: ' + sel);
};
const slot = (i) => (i < 9 ? `#invHot .slot[data-i="${i}"]` : `#invGrid .slot[data-i="${i}"]`);
const S = (id, n) => ({ id, n });
// Nastaví batoh (a kurzor) a otevře inventář znovu, ať se překreslí.
const setInv = (slots, cursor = null) => ev(([slots, cursor]) => {
  const g = window.game;
  g.inv.slots.fill(null);
  for (const [i, s] of Object.entries(slots)) g.inv.slots[+i] = s;
  g.ui.craft.fill(null);
  g.inv.cursor = null;
  if (g.ui.mode !== 'inv' || document.getElementById('inventory').style.display !== 'grid') g.openInventory('inv');
  g.inv.cursor = cursor;
  g.invTricks.refresh();
}, [slots, cursor]);
const inv = () => ev(() => window.game.inv.slots.map((s) => (s ? `${s.id}:${s.n}` : '')));
const cursor = () => ev(() => window.game.inv.cursor && `${window.game.inv.cursor.id}:${window.game.inv.cursor.n}`);

try {
  await page.fill('#mName', 'Tester');
  await page.click('#mSolo');
  await waitGame(page);
  await ev(() => { const g = window.game; const y = g.groundHeight(4, 24); T.tp(4, 24, y); g.setTime(0.35); document.getElementById('intro').style.display = 'none'; });

  // ------------------------------------------------------------ drag spread with live preview
  await setInv({}, S('stone', 11));
  let a = await box(slot(9)), b = await box(slot(10)), c = await box(slot(11));
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.move(c.x, c.y, { steps: 3 });
  const preview = await ev(() => ({ lit: document.querySelectorAll('#inventory .slot.drag').length, shown: document.querySelector('#invGrid .slot[data-i="10"] b')?.textContent, rest: document.querySelector('#cursorItem b')?.textContent }));
  check('drag: swept slots light up and preview the split', preview.lit === 3 && preview.shown === '3' && preview.rest === '2' && (await inv())[9] === '', JSON.stringify(preview));
  await page.mouse.up();
  let s = await inv();
  check('left drag splits the stack evenly (11 → 3+3+3, 2 stay on the cursor)', s[9] === 'stone:3' && s[10] === 'stone:3' && s[11] === 'stone:3' && (await cursor()) === 'stone:2', JSON.stringify([s.slice(9, 12), await cursor()]));
  await setInv({ 13: S('dirt', 2) }, S('dirt', 5));
  a = await box(slot(12)); b = await box(slot(13)); c = await box(slot(14));
  await page.mouse.move(a.x, a.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.mouse.move(c.x, c.y, { steps: 3 });
  await page.mouse.up({ button: 'right' });
  s = await inv();
  check('right drag puts one item in each slot', s[12] === 'dirt:1' && s[13] === 'dirt:3' && s[14] === 'dirt:1' && (await cursor()) === 'dirt:2', JSON.stringify([s.slice(12, 15), await cursor()]));
  await setInv({ 9: S('log', 2) }, S('log', 5));
  a = await box(slot(9));
  await page.mouse.click(a.x, a.y);
  check('a click without dragging still drops the whole stack', (await inv())[9] === 'log:7' && (await cursor()) === null);

  // ------------------------------------------------------------ double-click gather, Shift + double-click
  await setInv({ 0: S('dirt', 3), 12: S('dirt', 5), 20: S('dirt', 7), 21: S('stone', 4) });
  a = await box(slot(12));
  await page.mouse.dblclick(a.x, a.y);
  s = await inv();
  check('double-click gathers all dirt onto the cursor', (await cursor()) === 'dirt:15' && !s[0] && !s[20] && s[21] === 'stone:4', JSON.stringify([await cursor(), s[0], s[20]]));
  await setInv({ 9: S('stone', 4), 15: S('stone', 6), 30: S('log', 2) });
  a = await box(slot(9));
  await page.keyboard.down('Shift');
  await page.mouse.dblclick(a.x, a.y);
  await page.keyboard.up('Shift');
  s = await inv();
  check('Shift + double-click moves every stone stack to the hotbar', s.slice(9, 36).filter((x) => x.startsWith('stone')).length === 0 && s.slice(0, 9).join(',').includes('stone:10') && s[30] === 'log:2', JSON.stringify(s.slice(0, 9)));

  // ------------------------------------------------------------ 1–9 over a slot, Q / Ctrl+Q, wheel
  await setInv({ 2: S('log', 1), 9: S('stone', 8) });
  a = await box(slot(9));
  await page.mouse.move(a.x, a.y);
  await page.keyboard.press('Digit3');
  s = await inv();
  check('3 over a backpack slot swaps it with hotbar slot 3', s[2] === 'stone:8' && s[9] === 'log:1' && (await ev(() => window.game.inv.sel)) !== 2, JSON.stringify([s[2], s[9]]));
  const g0 = await ev(() => window.game.groundItems.length);
  a = await box(slot(2));
  await page.mouse.move(a.x, a.y);
  await page.keyboard.press('KeyQ');
  check('Q over a slot drops one item', (await inv())[2] === 'stone:7' && (await ev(() => window.game.groundItems.length)) === g0 + 1);
  await page.keyboard.down('Control'); await page.keyboard.press('KeyQ'); await page.keyboard.up('Control');
  check('Ctrl+Q over a slot drops the whole stack', (await inv())[2] === '' && (await ev(() => window.game.groundItems.at(-1)?.n)) === 7);
  await setInv({ 10: S('apple', 5) });
  a = await box(slot(10));
  await page.mouse.move(a.x, a.y);
  await page.mouse.wheel(0, 120);
  s = await inv();
  check('wheel down over a stack moves one item to the hotbar', s[10] === 'apple:4' && s.slice(0, 9).includes('apple:1'), JSON.stringify(s.slice(0, 11)));
  await page.waitForTimeout(80);
  await page.mouse.wheel(0, -120);
  check('wheel up pulls it back', (await inv())[10] === 'apple:5');

  // ------------------------------------------------------------ sort button
  await setInv({ 9: S('dirt', 30), 11: S('meat', 2), 14: S('stone_sword', 1), 20: S('dirt', 50), 25: S('iron_pick', 1), 0: S('log', 3) });
  await page.click('#sortBtn');
  s = await inv();
  check('Seřadit merges and sorts the backpack (tools, weapons, food, blocks), hotbar stays', s[9] === 'iron_pick:1' && s[10] === 'stone_sword:1' && s[11] === 'meat:2' && s[12] === 'dirt:64' && s[13] === 'dirt:16' && s[0] === 'log:3', JSON.stringify(s.slice(9, 15)));

  // ------------------------------------------------------------ crafting: preview, Shift-click craft-all, Space = again
  await setInv({ 9: S('log', 3), 10: S('planks', 4) });
  await page.hover('#recipes .slot[data-r]:not(.no)');
  const ghost = await ev(() => ({ cells: document.querySelectorAll('#craftArea .cgrid .slot.ghost img').length, out: !!document.querySelector('#craftArea .slot.out.ghost img') }));
  check('hovering a recipe previews it in the grid', ghost.cells >= 1 && ghost.out, JSON.stringify(ghost));
  await ev(() => { const g = window.game; g.fillRecipe(g.RECIPES.find((r) => r.out === 'planks'), true); });
  const outEl = await box('#craftArea .slot.out');
  check('the result slot glows when a recipe is ready', await ev(() => document.querySelector('#craftArea .slot.out').classList.contains('ready')));
  await page.keyboard.down('Shift'); await page.mouse.click(outEl.x, outEl.y); await page.keyboard.up('Shift');
  check('Shift-click on the result crafts everything (3 logs → 12 planks)', (await ev(() => window.game.countItem('planks'))) === 16 && (await ev(() => window.game.countItem('log'))) === 0);
  await ev(() => window.game.addItem('log', 2, true));
  await page.mouse.move(5, 5);
  await page.keyboard.press('Space');
  check('Space crafts the last recipe again', (await ev(() => window.game.countItem('planks'))) === 20 && (await ev(() => window.game.countItem('log'))) === 1);

  // ------------------------------------------------------------ rich tooltip
  await setInv({ 9: S('iron_pick', 1), 10: S('markorite_sword', 1), 11: S('meat', 3) });
  await page.hover(slot(9));
  let tip = await ev(() => ({ text: document.getElementById('tooltip').innerText, cls: document.getElementById('tooltip').className, vis: document.getElementById('tooltip').style.display }));
  check('tooltip: name, kind, tier, attack and description in Czech', tip.vis === 'block' && /Železný krumpáč/.test(tip.text) && /Krumpáč · Železo/i.test(tip.text) && /útok/.test(tip.text) && /Těží kámen/.test(tip.text), tip.text.replace(/\n/g, ' | '));
  await page.hover(slot(10));
  tip = await ev(() => ({ cls: document.getElementById('tooltip').className, name: getComputedStyle(document.querySelector('#tooltip .name')).color }));
  check('tooltip: epic items have a purple name', tip.cls === 'rar3' && tip.name === 'rgb(212, 139, 255)', JSON.stringify(tip));
  await page.hover(slot(11));
  check('tooltip: food shows its points', /\+35 jídlo/.test(await page.textContent('#tooltip')));
  // durability from the tools rules (ITEMS[id].dur = new, slot.w = used up): bar on the slot + red line in the tooltip
  await ev(() => { const g = window.game; g.ITEMS.iron_pick.dur ||= 250; g.inv.slots[9] = { id: 'iron_pick', n: 1, w: g.ITEMS.iron_pick.dur - 20 }; g.invTricks.refresh(); });
  await page.mouse.move(5, 5); await page.hover(slot(9));
  const du = await ev(() => ({ bar: !!document.querySelector('#invGrid .slot[data-i="9"] .dur'), low: !!document.querySelector('#tooltip .dur.low'), text: document.querySelector('#tooltip .dur')?.textContent }));
  check('durability: bar on the slot, low durability is red in the tooltip', du.bar && du.low && /Odolnost 20 \/ /.test(du.text), JSON.stringify(du));
  await page.keyboard.down('F3'); await page.keyboard.press('KeyH'); await page.keyboard.up('F3');
  await page.mouse.move(10, 10); await page.hover(slot(11));
  check('F3 + H shows the item id', /rise:meat/.test(await page.textContent('#tooltip')) && (await ev(() => document.getElementById('guide').style.display)) !== 'grid');
  await shot(page, `${out}-window.png`);

  // ------------------------------------------------------------ in the world: hotbar name, middle-click pick, Q drop
  await ev(() => window.game.closeInventory());
  await ev(() => { const g = window.game; g.inv.slots.fill(null); g.inv.slots[0] = { id: 'log', n: 1 }; g.inv.slots[4] = { id: 'torch', n: 5 }; g.inv.slots[20] = { id: 'planks', n: 9 }; g.inv.sel = 0; T.press('Digit5'); });
  const hn = await ev(() => ({ t: document.getElementById('hotName')?.textContent, show: document.getElementById('hotName')?.classList.contains('show'), ring: document.getElementById('hotbar').style.getPropertyValue('--sel') }));
  check('hotbar: selecting shows the item name and moves the ring', hn.t === 'Pochodeň' && hn.show && hn.ring === '4', JSON.stringify(hn));
  const pick = await ev(() => { const g = window.game; const ok = g.invTricks.pickBlock({ kind: 'block', type: 'planks' }); return { ok, sel: g.inv.sel, held: g.inv.slots[g.inv.sel]?.id, src: g.inv.slots[20] }; });
  check('middle-click pick takes the block from the backpack into the hand', pick.ok && pick.held === 'planks' && pick.src === null, JSON.stringify(pick));
  const q = await ev(() => { const g = window.game, n0 = g.groundItems.length; g.inv.sel = 0; g.inv.slots[0] = { id: 'stone', n: 5 }; T.press('KeyQ'); const one = g.inv.slots[0]?.n; T.key('ControlLeft'); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ', ctrlKey: true })); T.key('ControlLeft', false); return { one, all: g.inv.slots[0], made: g.groundItems.length - n0 }; });
  check('Q drops one item from the hand, Ctrl+Q the rest (G still works too)', q.one === 4 && q.all === null && q.made === 2, JSON.stringify(q));

  // ------------------------------------------------------------ ground items: merge, magnet, pickup
  await ev(() => {
    const g = window.game, p = g.player.pos;
    g.groundItems.length = 0;
    const x = p.x + 6, y = g.groundHeight(x, p.z);
    g.spawnGroundItem('dirt', 10, { x, y: y + 0.3, z: p.z }, { x: 0, y: 0, z: 0 }, 0);
    g.spawnGroundItem('dirt', 20, { x: x + 0.2, y: y + 0.3, z: p.z }, { x: 0, y: 0, z: 0 }, 0);
    T.step(30);
  });
  const m = await ev(() => window.game.groundItems.filter((x) => x.id === 'dirt' && x.n > 0).map((x) => x.n));
  check('two dirt stacks lying together merge into one', m.length === 1 && m[0] === 30, JSON.stringify(m));
  const pk = await ev(() => {
    const g = window.game, it = g.groundItems.find((x) => x.id === 'dirt' && x.n > 0);
    const d0 = Math.hypot(it.pos.x - g.player.pos.x, it.pos.z - g.player.pos.z);
    g.player.pos.x = it.pos.x - 2.1; T.step(1);
    const d1 = Math.hypot(it.pos.x - g.player.pos.x, it.pos.z - g.player.pos.z);
    const before = g.countItem('dirt');
    T.step(40);
    return { d0, d1, got: g.countItem('dirt') - before, feed: document.getElementById('feed').textContent };
  });
  check('pickup magnet pulls the item in and it lands in the backpack', pk.got === 30 && /\+30 Hlína/.test(pk.feed), JSON.stringify(pk));

  // ------------------------------------------------------------ nothing is lost when the backpack is full
  const spill = await ev(() => {
    const g = window.game; g.groundItems.length = 0;
    g.openInventory('inv');
    for (let i = 0; i < 36; i++) g.inv.slots[i] = { id: 'iron_pick', n: 1 };
    g.ui.craft[0] = { id: 'coal', n: 3 };
    g.inv.cursor = { id: 'apple', n: 2 };
    g.closeInventory();
    return g.groundItems.map((x) => `${x.id}:${x.n}`).sort();
  });
  check('closing with a full backpack drops the grid and the cursor on the ground', JSON.stringify(spill) === JSON.stringify(['apple:2', 'coal:3']), JSON.stringify(spill));

  // ------------------------------------------------------------ Nastavení nad batohem: E a Esc zavřou jen okno nastavení
  await ev(() => window.game.inv.slots.fill(null));
  await setInv({});
  await page.click('#settingsBtn');
  await page.waitForTimeout(150);
  await page.click('#settings .seg .mc-btn'); // klik v okně (fokus zůstane uvnitř)
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(150);
  const afterE = await ev(() => ({ settings: !!document.getElementById('settings'), inv: document.getElementById('inventory').style.display }));
  check('E with Nastavení open closes only Nastavení (the backpack stays open, no orphan window)', !afterE.settings && afterE.inv === 'grid', JSON.stringify(afterE));
  await page.click('#settingsBtn');
  await page.waitForTimeout(150);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const afterEsc = await ev(() => ({ settings: !!document.getElementById('settings'), inv: document.getElementById('inventory').style.display }));
  check('Esc closes Nastavení first, then the backpack', !afterEsc.settings && afterEsc.inv === 'grid', JSON.stringify(afterEsc));
  await ev(() => { localStorage.removeItem('rise-nastaveni'); window.game.closeInventory(); });

  // ------------------------------------------------------------ more Minecraft: right-click swap, Q keeps wear
  await setInv({ 9: S('log', 2) }, S('stone', 5));
  a = await box(slot(9));
  await page.mouse.click(a.x, a.y, { button: 'right' });
  check('right click with a different item swaps it with the slot', (await inv())[9] === 'stone:5' && (await cursor()) === 'log:2', JSON.stringify([(await inv())[9], await cursor()]));
  await setInv({ 3: { id: 'iron_pick', n: 1, w: 40 } });
  await ev(() => { window.game.groundItems.length = 0; });
  a = await box(slot(3));
  await page.mouse.move(a.x, a.y);
  await page.keyboard.press('KeyQ');
  check('Q over a worn tool drops it with its wear', await ev(() => window.game.groundItems.some((x) => x.id === 'iron_pick' && x.w === 40)), await ev(() => JSON.stringify(window.game.groundItems.map((x) => [x.id, x.w]))));
  await ev(() => window.game.closeInventory());

  // ------------------------------------------------------------ dropped items like Minecraft's
  const thrown = await ev(() => {
    const g = window.game; g.groundItems.length = 0; g.inv.slots.fill(null); g.inv.slots[0] = { id: 'apple', n: 1 }; g.inv.sel = 0;
    g.dropHeld(false);
    const it = g.groundItems[0];
    T.step(10); T.tp(it.pos.x, it.pos.z, it.pos.y); T.step(10); // 1 s: still lying there
    const early = g.countItem('apple');
    T.step(25);
    return { delay: it.delay, early, late: g.countItem('apple') };
  });
  check('an item you throw can be picked up only after 2 s', thrown.delay === 2 && thrown.early === 0 && thrown.late === 1, JSON.stringify(thrown));
  const mined = await ev(() => {
    const g = window.game; g.groundItems.length = 0; g.inv.slots.fill(null); g.inv.slots[0] = { id: 'iron_pick', n: 1 }; g.inv.sel = 0; g.mobs.length = 0;
    T.tp(-14, 30, g.groundHeight(-14, 30)); T.step(5);
    const p = g.player.pos, x = Math.floor(p.x), y = Math.floor(p.y) + 1, z = Math.floor(p.z) - 2, k = `${x},${y},${z}`;
    g.blocks.set(k, 'cobble'); g.rebuildBlocks(); T.aim(x + 0.5, y + 0.5, z + 0.5);
    T.mineUntil(() => !g.blocks.has(k));
    const it = g.groundItems.find((i) => i.id === 'stone');
    const res = { inBag: g.countItem('stone'), item: it && { n: it.n, vy: +it.vel.y.toFixed(2), up: +(it.pos.y - y).toFixed(2), delay: it.delay } };
    T.step(20); T.collect(); // dojdi k němu (magnet ho přitáhne z 2,4 m)
    res.after = g.countItem('stone');
    T.aim(x + 0.5, y + 0.5, z + 0.5);
    g.setCreative(true); g.blocks.set(k, 'cobble'); g.rebuildBlocks(); T.aim(x + 0.5, y + 0.5, z + 0.5);
    const n0 = g.groundItems.length;
    T.mineUntil(() => !g.blocks.has(k));
    res.creativeDrops = g.groundItems.length - n0;
    g.setCreative(false);
    return res;
  });
  check('a mined block pops out as a small item with a little jump, then flies into the backpack', mined.inBag === 0 && mined.item?.n === 1 && mined.item.delay === 0.5 && (mined.item.vy > 0 || mined.item.up > 0.1) && mined.after === 1, JSON.stringify(mined));
  check('creative: a mined block drops nothing', mined.creativeDrops === 0, JSON.stringify(mined));
  const chest = await ev(() => {
    const g = window.game; g.groundItems.length = 0; g.inv.slots.fill(null);
    const p = g.player.pos, x = Math.floor(p.x) + 2, y = Math.floor(p.y), z = Math.floor(p.z), k = `${x},${y},${z}`;
    g.blocks.set(k, 'chest'); g.chests.set(k, [{ id: 'iron', n: 5 }, { id: 'iron_axe', n: 1, w: 30 }, ...Array(25).fill(null)]); g.rebuildBlocks();
    g.breakTarget({ kind: 'block', type: 'chest', cell: [x, y, z], at: [x + 0.5, y + 0.5, z + 0.5] });
    return g.groundItems.map((i) => `${i.id}:${i.n}${i.w ? 'w' + i.w : ''}`).sort();
  });
  check('breaking a chest drops the chest and everything inside (tool wear kept)', JSON.stringify(chest) === JSON.stringify(['chest:1', 'iron:5', 'iron_axe:1w30']), JSON.stringify(chest));
  const water = await ev(() => {
    const g = window.game; g.groundItems.length = 0;
    const p = g.pondOf(-181.5, -48), lv = g.pondLevel(p);
    g.spawnGroundItem('log', 2, { x: p.x, y: lv + 1.5, z: p.z }, { x: 0, y: 0, z: 0 }, 0);
    T.step(80);
    const it = g.groundItems[0];
    return { lv, y: it?.pos.y, bed: g.groundHeight(p.x, p.z), settled: it?.vel.y === 0 };
  });
  check('an item in a pond floats up and stays at the surface', water.y > water.lv - 0.2 && water.y < water.lv && water.settled && water.bed < water.lv - 1, JSON.stringify(water));
  const lava = await ev(() => {
    const g = window.game; g.groundItems.length = 0;
    let v = null;
    for (let cx = 0; cx < 8 && !v; cx++) for (let cz = 0; cz < 8 && !v; cz++) v = g.volcanoOf(cx * 1100 + 550, cz * 1100 + 550);
    g.spawnGroundItem('log', 3, { x: v.x, y: g.terrainH(v.x, v.z) + 2, z: v.z }, { x: 0, y: 0, z: 0 }, 0);
    T.step(30);
    return { left: g.groundItems.filter((i) => i.n > 0).length };
  });
  check('an item in volcano lava burns', lava.left === 0, JSON.stringify(lava));
  const saved = await ev(() => {
    const g = window.game, p = g.player.pos; g.groundItems.length = 0;
    g.spawnGroundItem('iron_axe', 1, { x: p.x + 9, y: g.groundHeight(p.x + 9, p.z) + 0.2, z: p.z }, { x: 0, y: 0, z: 0 }, 0, undefined, 40);
    T.step(20);
    return g.worldState().ground[0];
  });
  check('the save keeps the wear and the age of items on the ground', saved?.w === 40 && saved.age === 1, JSON.stringify(saved));
} catch (e) {
  check('play-test ran without exception', false, e.stack || e);
}
check('no console errors', page.errors.length === 0, page.errors.slice(0, 5).join(' | '));
fs.writeFileSync(`${out}.json`, JSON.stringify(results, null, 2));
await browser.close();
await srv.close();
const bad = failed();
console.log(`\n${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
