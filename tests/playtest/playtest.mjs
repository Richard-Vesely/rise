// Play-test of single player ("Hrát sám") in a real browser, through the window.game debug API.
// Usage: node tests/playtest/playtest.mjs [dir-or-url] [out-prefix]
//   dir-or-url  default dist (run `npm run build` first); legacy/ tests Marek's original file
//   out-prefix  where to write <prefix>.json and <prefix>.png (default playtest-sp)
import path from 'node:path';
import fs from 'node:fs';
import { launch, serveDir, checker, openPage, waitGame, shot } from './lib.mjs';

const target = process.argv[2] || 'dist';
const out = process.argv[3] || 'playtest-sp';
const { check, results, failed } = checker();

let server = null, url = target;
if (!/^https?:/.test(target)) { server = await serveDir(path.resolve(target)); url = server.url; }
const browser = await launch();
const page = await openPage(browser, url);
const ev = (fn, arg) => page.evaluate(fn, arg);

try {
  // ------------------------------------------------------------ menu
  check('menu: title and buttons in Czech', (await page.textContent('#mSolo b')) === 'Hrát sám' && (await page.textContent('#mSolo small')) === 'Jen ty, svět se uloží v tomhle prohlížeči' && (await page.textContent('#mMore')) === 'Další možnosti' && (await page.textContent('#mSettings')) === 'Nastavení');
  const mainText = await page.innerText('#pgMain');
  check('menu: no technical words on the main page', !/server|kód|adres|websocket|peerjs/i.test(mainText), mainText);
  check('menu: no club server known -> no world buttons', await ev(() => document.getElementById('mWorlds').hidden));
  await page.click('#mMore');
  check('menu: Další možnosti offers host and join by code', (await page.isVisible('#pgMore')) && (await page.textContent('#mHost b')) === 'Vytvořit hru na svém počítači' && (await page.textContent('#mHost small')) === 'Kamarádi se připojí kódem, který uvidíš. Nech hru otevřenou.' && (await page.textContent('#mJoin b')) === 'Připojit se ke kamarádovi kódem');
  await page.click('#mJoin');
  await page.fill('#mCode', 'xx');
  await page.press('#mCode', 'Enter');
  check('menu: a bad code gives a Czech message', /LOUKA-7K2F/.test(await page.textContent('#menuMsg')) && await page.isVisible('#pgJoin'), await page.textContent('#menuMsg'));
  await page.click('#pgJoin [data-back]');
  await page.click('#pgMore [data-back]');
  check('menu: Zpět leads back to the main page', await page.isVisible('#pgMain') && !(await page.isVisible('#menuMsg')));
  // server kroužku nejde zastihnout: jeden neaktivní řádek, hra pro jednoho a Další možnosti fungují dál
  const off = await openPage(browser, url + '?server=127.0.0.1:9', { label: 'offline: ', ignore: [/Failed to load resource|ERR_CONNECTION|ERR_ADDRESS/] });
  const offOk = await off.waitForSelector('#mWorlds .world-off', { timeout: 15000 }).then(() => true, () => false);
  const offState = await off.evaluate(() => ({ n: document.querySelectorAll('#mWorlds button').length, text: document.querySelector('#mWorlds button')?.textContent, disabled: document.querySelector('#mWorlds button')?.disabled }));
  check('menu: unreachable club server shows one disabled line', offOk && offState.n === 1 && offState.text === 'Svět teď není dostupný, zkus to za chvíli nebo hraj sám.' && offState.disabled, JSON.stringify(offState));
  const soloOk = await off.isEnabled('#mSolo');
  await off.click('#mMore');
  check('menu: …and single player + Další možnosti still work', soloOk && await off.isVisible('#pgMore #mHost') && off.errors.length === 0, off.errors.join(' | '));
  await off.context().close();
  await page.fill('#mName', 'Tester');
  // Můj oblek: výběr obleku s náhledem, uloží se pro jméno hráče
  await page.click('#mCostume');
  await page.waitForSelector('#costume .cos-suit');
  const cos = await ev(() => ({ suits: [...document.querySelectorAll('#costume .cos-suit')].map((b) => b.textContent), who: document.querySelector('#costume .cos-head span').textContent, dots: document.querySelectorAll('#costume .cos-dot').length }));
  await page.click('#costume .cos-suit[data-s="pilot"]');
  await page.click('#costume [data-k="c"] .cos-dot[data-i="9"]');
  check('menu: Můj oblek shows 10 suits (7 suits + 3 heroes) with Czech names for this player', cos.suits.length === 10 && cos.suits.includes('Průzkumník') && cos.suits.includes('Nebeský') && cos.suits.includes('Mág') && cos.who === 'Tester' && cos.dots > 20 && (await page.textContent('#costume .cos-desc')).startsWith('Kombinéza'), JSON.stringify(cos));
  await page.click('#costume [data-act="ok"]');
  const saved = await ev(() => ({ ...JSON.parse(localStorage.getItem('rise-obleky') || '{}').Tester, closed: !document.getElementById('costume') }));
  check('menu: the chosen costume is saved per player name', saved?.s === 'pilot' && saved.c === 9 && saved.t > 0 && saved.closed, JSON.stringify(saved));
  await page.click('#mSolo');
  await waitGame(page);
  check('single player starts (window.gameStarted)', true);
  await ev(() => {
    const g = window.game;
    T.tpg = (x, z) => { const y = g.groundHeight(x, z); T.tp(x, z, y); };
  });

  // ------------------------------------------------------------ HUD
  const clock = await ev(() => T.text('clock'));
  check('HUD: clock shows day, time and biome', /^Den 1 · \d\d:\d\d · Louka a les$/.test(clock), clock);
  check('HUD: first tip', (await ev(() => T.text('tipText'))).startsWith('Pokácej strom'), await ev(() => T.text('tipText')));
  check('HUD: hotbar has 9 slots', (await ev(() => document.querySelectorAll('#hotbar .slot').length)) === 9);
  check('HUD: compass markers', (await ev(() => document.querySelectorAll('#compass .m').length)) >= 31);
  check('intro shown on first start', await ev(() => document.getElementById('intro').style.display === 'grid'));
  check('name remembered', (await ev(() => localStorage.getItem('rise-jmeno'))) === 'Tester');

  // ------------------------------------------------------------ movement
  let r = await ev(() => { const g = window.game; T.tp(0, 14); const z0 = g.player.pos.z; g.keys.add('KeyW'); T.step(20); g.keys.delete('KeyW'); T.step(10); return { z0, z1: g.player.pos.z }; });
  check('walk forward (W)', r.z1 < r.z0 - 2, `${r.z0.toFixed(2)} -> ${r.z1.toFixed(2)}`);
  r = await ev(() => { const g = window.game; T.tp(0, 14); T.step(5); const y0 = g.player.pos.y; g.keys.add('Space'); T.step(4); g.keys.delete('Space'); const y1 = g.player.pos.y; T.step(40); return { y0, y1, y2: g.player.pos.y }; });
  check('jump and land', r.y1 > r.y0 + 0.3 && Math.abs(r.y2 - r.y0) < 0.05, JSON.stringify(r));
  r = await ev(() => { const g = window.game; T.press('Digit3'); return g.inv.sel; });
  check('number key selects hotbar slot', r === 2);

  // ------------------------------------------------------------ trees
  r = await ev(() => {
    const g = window.game; T.clearInv(); T.holdNothing();
    T.tpg(0, 40); T.step(2);
    g.rebuildForest?.(g.player.pos.x, g.player.pos.z, true);
    // Blízké biomy mohou mít jiné dřevo; tento test ověřuje obyčejné klády z dubu.
    const t = [...g.forestTrees].filter(t => t.kind === 'oak').sort((a, b) => Math.hypot(a.x, a.z - 40) - Math.hypot(b.x, b.z - 40))[0];
    T.tpg(t.x + 1.6, t.z); T.step(10);
    T.aim(t.x, t.y + 1.2, t.z);
    const label = T.text('targetLabel');
    const n = T.mineUntil(() => !g.forestTrees.some((x) => x.key === t.key));
    const dropped = g.groundItems.filter((x) => x.id === 'log' && x.n > 0).reduce((k, x) => k + x.n, 0), direct = T.count('log');
    T.collect();
    return { label, n, dropped, direct, logs: T.count('log'), gone: !g.forestTrees.some((x) => x.key === t.key), removed: g.removed?.has?.(t.key) };
  });
  check('chop a tree by hand gives logs (they pop out on the ground and you pick them up)', r.logs >= 3 && r.dropped >= 3 && r.direct === 0, `${r.logs} logs in ${r.n} ticks (dropped ${r.dropped}, direct ${r.direct}), label "${r.label}"`);
  check('felled tree disappears', r.gone);

  // ------------------------------------------------------------ crafting
  r = await ev(() => {
    const g = window.game; T.clearInv(); T.give('log', 2);
    T.press('KeyE');
    const open = document.getElementById('inventory').style.display === 'grid';
    const recipes = document.querySelectorAll('#recipes .slot').length;
    g.fillRecipe(g.RECIPES.find((x) => x.out === 'planks'), false); g.takeResult(false);
    const cursor = g.inv.cursor && { ...g.inv.cursor };
    T.press('KeyE');
    return { open, recipes, cursor, planks: T.count('planks'), closed: document.getElementById('inventory').style.display === 'none' };
  });
  check('E opens inventory with recipe book', r.open && r.recipes >= 15, `recipes: ${r.recipes}`);
  check('craft planks from a log', r.cursor?.id === 'planks' && r.cursor.n === 4 && r.planks === 4 && r.closed, JSON.stringify(r));
  r = await ev(() => {
    const g = window.game; T.clearInv(); T.give('planks', 4);
    T.press('KeyE');
    g.fillRecipe(g.RECIPES.find((x) => x.out === 'workbench'), false); g.takeResult(true);
    T.press('KeyE');
    return { bench: T.count('workbench'), planks: T.count('planks'), crafted: !!g.worldState && true };
  });
  check('craft a workbench (2x2)', r.bench === 1 && r.planks === 0, JSON.stringify(r));

  // ------------------------------------------------------------ building
  r = await ev(() => {
    const g = window.game; T.clearInv(); T.give('planks', 10); T.hold('planks');
    T.tpg(6, 30); T.step(5);
    const x = 6.5, z = 27.5, y = g.groundHeight(x, z);
    T.aim(x, y, z);
    const before = g.blocks.size, old = new Set(g.blocks.keys());
    g.input.rmb = true; T.step(1); g.input.rmb = false; T.step(1, 0.0001);
    const k = [...g.blocks.keys()].find((k) => !old.has(k) && g.blocks.get(k) === 'planks');
    return { before, after: g.blocks.size, k, planks: T.count('planks') };
  });
  check('place a block (right click)', r.after === r.before + 1 && !!r.k && r.planks === 9, JSON.stringify(r));
  const placed = r.k;
  r = await ev((k) => {
    const g = window.game; T.holdNothing();
    const [x, y, z] = k.split(',').map(Number);
    T.aim(x + 0.5, y + 0.5, z + 0.5);
    const n = T.mineUntil(() => !g.blocks.has(k));
    T.collect();
    return { n, gone: !g.blocks.has(k), planks: T.count('planks') };
  }, placed);
  check('break the placed block and get it back', r.gone && r.planks === 10, JSON.stringify(r));

  // ------------------------------------------------------------ digging
  r = await ev(() => {
    const g = window.game; T.clearInv(); T.give('stone_shovel', 1); T.hold('stone_shovel');
    T.tpg(-8, 30); T.step(5);
    const cx = -8, cz = 27, top = g.topY(cx, cz);
    T.aim(cx + 0.5, g.groundHeight(cx + 0.5, cz + 0.5), cz + 0.5);
    const n = T.mineUntil(() => g.getVox(cx, top, cz) === 0, 900);
    T.collect();
    return { n, air: g.getVox(cx, top, cz) === 0, dirt: T.count('dirt'), fiber: T.count('fiber'), dug: g.columnDug(cx, cz) };
  });
  check('dig grass then dirt (voxel underground)', r.air && r.dirt >= 1 && r.fiber >= 1 && r.dug, JSON.stringify(r));
  r = await ev(() => { let tiles = 0, glowOnly = true; for (const c of window.game.voxChunks.values()) { const a = c.mesh?.geometry.getAttribute('aTile'); if (a) tiles++; if (c.mesh && Array.isArray(c.mesh.material)) glowOnly = false; } return { tiles, glowOnly }; });
  check('underground: one material on a texture array (layer per block type)', r.tiles > 0 && r.glowOnly, JSON.stringify(r));

  // ------------------------------------------------------------ torches (like Minecraft): floor, wall, never the ceiling, pop off, instant break, light
  r = await ev(() => {
    const g = window.game, K = (x, y, z) => `${x},${y},${z}`, bx = 16, bz = 27;
    T.clearInv(); T.give('torch', 8); T.hold('torch');
    T.tpg(bx + 0.5, bz + 3.5); T.step(3); g.player.flyT = 1e6; g.mobs.length = 0;
    const y = Math.floor(g.groundHeight(bx + 0.5, bz + 0.5)) + 1, at = (px, py, pz) => { T.tp(px, pz, py); g.player.vel.set(0, 0, 0); };
    for (const k of [K(bx, y, bz), K(bx, y + 1, bz), K(bx + 4, y + 3, bz)]) g.blocks.set(k, 'cobble');
    g.rebuildBlocks();
    const res = {};
    at(bx + 0.5, y + 2.4, bz + 3.5); T.aim(bx + 0.5, y + 2, bz + 0.5); g.useItem(); T.step(2); // horní stěna sloupku
    res.floor = g.blockMeta.get(K(bx, y + 2, bz));
    at(bx + 0.5, y, bz + 3.5); T.aim(bx + 0.5, y + 0.5, bz + 1); g.useItem(); T.step(2); // boční stěna
    const wk = K(bx, y, bz + 1), ws = g.specials.get(wk);
    res.wall = g.blockMeta.get(wk); res.lean = ws && +(ws.lp[2] - (bz + 1)).toFixed(2);
    at(bx + 4.5, y, bz + 0.8); T.aim(bx + 4.5, y + 3, bz + 0.5); g.useItem(); T.step(2); // spodek visícího bloku
    res.ceiling = g.blocks.get(K(bx + 4, y + 2, bz)) ?? null; res.toast = T.text('toast');
    g.blocks.set(K(bx + 5, y + 2, bz), 'cobble'); g.rebuildBlocks();
    T.aim(bx + 4.5, y + 3, bz + 0.5); g.useItem(); T.step(2); // teď je vedle zeď: pochodeň skončí na ní
    res.fallback = g.blockMeta.get(K(bx + 4, y + 2, bz));
    res.left = T.count('torch');
    // blok, na kterém visí pochodeň, zmizí: pochodeň odpadne a spadne jako předmět; ta nahoře stojí dál
    g.blocks.delete(K(bx, y, bz)); g.rebuildBlocks(); T.step(10);
    res.popped = !g.blocks.has(wk) && !g.specials.has(wk);
    res.item = g.groundItems.some((it) => it.id === 'torch' && it.n > 0 && Math.hypot(it.pos.x - (bx + 0.5), it.pos.z - (bz + 1.5)) < 1.5);
    res.stays = g.blocks.get(K(bx, y + 2, bz));
    // rozbije se hned, i rukou
    T.holdNothing(); at(bx + 0.5, y + 2.6, bz + 2.2); T.aim(bx + 0.5, y + 2.45, bz + 0.5);
    const n0 = T.count('torch'); res.mine = T.mineUntil(() => !g.blocks.has(K(bx, y + 2, bz)), 40);
    T.step(40); res.got = T.count('torch') - n0; // rovnou do batohu, nebo vyskočí jako předmět a přiletí
    // vyskočí náhodným směrem: z vršku sloupku občas spadne až na zem, víc než 1,3 m pod nohy (moc hluboko na magnet) – dojdi pro ni
    if (res.got < 1) { T.collect(); res.got = T.count('torch') - n0; }
    return res;
  });
  check('torch: on top of a block it stands, on the side it hangs leaning from the wall', r.floor === 1 && r.wall === 4 && r.lean > 0 && r.lean < 0.4, JSON.stringify(r));
  check('torch: never on the ceiling (with a message), falls back to a wall you look along', r.ceiling === null && /Pochodeň/.test(r.toast) && r.fallback === 3 && r.left === 5, JSON.stringify(r));
  check('torch: pops off and drops as an item when its block goes, breaks instantly by hand', r.popped && r.item && r.stays === 'torch' && r.mine <= 3 && r.got >= 1, JSON.stringify(r));
  r = await ev(() => {
    const g = window.game, x = 22, z = 21, top = g.topY(x, z), y = top - 9, pl = () => g.scene.children.filter((o) => o.isPointLight).length;
    const before = pl();
    for (let dx = -3; dx <= 3; dx++) for (let dz = -6; dz <= 6; dz++) for (let dy = 0; dy <= 2; dy++) g.setVox(x + dx, y + dy, z + dz, g.V.AIR);
    let n = 0; // 31 pochodní v jedné jeskyni
    for (let dx = -3; dx <= 3; dx += 2) for (let dz = -6; dz <= 6; dz += 2) { g.setVox(x + dx, y - 1, z + dz, g.V.STONE); g.blockMeta.set(`${x + dx},${y},${z + dz}`, 1); g.blocks.set(`${x + dx},${y},${z + dz}`, 'torch'); n++; }
    for (const dz of [-5, 0, 5]) { g.setVox(x - 4, y + 1, z + dz, g.V.STONE); g.blockMeta.set(`${x - 3},${y + 1},${z + dz}`, 2); g.blocks.set(`${x - 3},${y + 1},${z + dz}`, 'torch'); n++; }
    g.rebuildBlocks();
    T.tp(x + 0.5, z + 0.5, y); T.step(30, 0.05);
    const c = g.voxChunks.get(`${Math.floor(x / 16)},${Math.floor(z / 16)}`), a = c?.mesh?.geometry.getAttribute('aFire');
    let max = 0; if (a) for (let i = 0; i < a.count; i++) max = Math.max(max, a.getX(i));
    return { n, attr: !!a, max: +max.toFixed(2), before, after: pl() };
  });
  check('a cave with 31 torches: their light is baked into the walls, no extra real-time lights', r.n >= 30 && r.attr && r.max > 0.3 && r.after === r.before, JSON.stringify(r));

  // ------------------------------------------------------------ tools and combat: durability, cracks, repair, attack charge, armor wear
  r = await ev(() => {
    const g = window.game; T.clearInv(); T.give('wood_pick', 1); T.hold('wood_pick'); g.renderHotbar();
    g.mobs.length = 0; // a mob wandering into the swing takes the hits (and wears the pick by 2), so the timing check gets flaky
    T.tpg(-14, 30); T.step(5);
    const p = g.player.pos, x = Math.floor(p.x), y = Math.floor(p.y) + 1, z = Math.floor(p.z) - 2, k = `${x},${y},${z}`;
    g.blocks.set(k, 'cobble'); g.rebuildBlocks();
    T.aim(x + 0.5, y + 0.5, z + 0.5);
    g.input.lmb = true; T.step(10);
    const mid = { stage: g.crackStage(), p: +g.mineState().p.toFixed(2), tg: g.target && (g.target.type || g.target.kind), near: g.mobs.filter((m) => m.pos.distanceTo(p) < 5).map((m) => m.type).join() };
    const n = T.mineUntil(() => !g.blocks.has(k));
    T.collect();
    const s = g.inv.slots[0];
    return { mid, n, w: s?.w, bar: !!document.querySelector('#hotbar .slot .dur'), stone: T.count('stone'), cracksGone: g.crackStage() === -1, k };
  });
  check('tools: mining shows crack stages (10) and the right speed', r.mid.stage >= 2 && r.mid.stage <= 6 && r.n >= 12 && r.n <= 20 && r.cracksGone, JSON.stringify(r));
  check('tools: a mined block wears the pickaxe by 1 and shows a durability bar', r.w === 1 && r.bar && r.stone === 1, JSON.stringify(r));
  r = await ev((k) => {
    const g = window.game; g.inv.slots[0].w = 58;
    g.blocks.set(k, 'cobble'); g.rebuildBlocks(); T.step(8);
    const [x, y, z] = k.split(',').map(Number);
    T.aim(x + 0.5, y + 0.5, z + 0.5);
    T.mineUntil(() => !g.blocks.has(k));
    const toast = T.text('toast');
    T.collect();
    return { held: g.inv.slots[0], toast, stone: T.count('stone') };
  }, r.k);
  check('tools: a worn-out pickaxe breaks with a Czech message (and the block still drops)', r.held === null && r.toast === 'Dřevěný krumpáč se rozbil!' && r.stone === 2, JSON.stringify(r));
  r = await ev(() => {
    const g = window.game; T.clearInv(); T.give('iron_pick', 1); T.hold('iron_pick'); g.setCreative(true);
    const p = g.player.pos, x = Math.floor(p.x), y = Math.floor(p.y) + 1, z = Math.floor(p.z) - 2, k = `${x},${y},${z}`;
    g.blocks.set(k, 'cobble'); g.rebuildBlocks(); T.aim(x + 0.5, y + 0.5, z + 0.5);
    T.mineUntil(() => !g.blocks.has(k));
    g.setCreative(false);
    return { w: g.inv.slots[0]?.w ?? 0, gone: !g.blocks.has(k) };
  });
  check('tools: no wear in creative mode', r.gone && r.w === 0, JSON.stringify(r));
  r = await ev(() => {
    const g = window.game; T.clearInv();
    g.ui.craft[0] = { id: 'iron_sword', n: 1, w: 200 }; g.ui.craft[1] = { id: 'iron_sword', n: 1, w: 150 };
    g.openInventory('inv');
    const shown = !!document.querySelector('[data-out].repair .dur');
    g.takeResult(false);
    const cursor = g.inv.cursor && { ...g.inv.cursor };
    const grid = g.ui.craft.slice(0, 2);
    g.closeInventory();
    const sword = g.inv.slots.find((s) => s?.id === 'iron_sword');
    return { shown, cursor, grid, sword };
  });
  check('tools: two worn swords repair into one in the crafting grid', r.shown && r.cursor?.w === 88 && r.grid.every((s) => !s) && r.sword?.w === 88, JSON.stringify(r));
  r = await ev(() => { // luk: plně natažený šíp zraní kance za 10, spotřebuje jeden šíp a opotřebuje luk
    const g = window.game; T.clearInv(); T.give('bow', 1); T.give('arrow', 5); T.hold('bow');
    g.mobs.length = 0; T.tpg(-40, 30); T.step(5);
    const p = g.player.pos;
    g.spawnMob('boar', p.x, p.z - 8);
    const m = g.mobs.find((x) => x.type === 'boar'), hp0 = m.hp;
    const aim = () => T.aim(m.pos.x, m.pos.y + m.def.cy, m.pos.z);
    g.input.rmb = true;
    for (let i = 0; i < 25; i++) { aim(); T.step(1); } // 1,25 s > doba natažení (1 s)
    const drawn = g.player.draw;
    g.input.rmb = false; T.step(1, 0.016);
    for (let i = 0; i < 30; i++) T.step(1, 0.016);
    return { drawn, hp0, hp: m.dead ? 0 : m.hp, arrows: T.count('arrow'), w: g.inv.slots[0]?.w };
  });
  check('bow: a fully drawn arrow hurts a boar for 10, uses one arrow and wears the bow', r.drawn === 1 && r.hp0 - r.hp === 10 && r.arrows === 4 && r.w === 1, JSON.stringify(r));
  r = await ev(() => {
    const g = window.game; T.clearInv(); T.give('iron_sword', 1); T.hold('iron_sword');
    T.tpg(-30, 30); T.step(30);
    const p = g.player.pos;
    g.spawnMob('cow', p.x, p.z - 2.5);
    const m = g.mobs[g.mobs.length - 1]; m.idleT = 99; m.moving = false; T.step(1, 0.0001);
    T.aim(m.pos.x, m.pos.y + m.def.cy, m.pos.z);
    const hp0 = m.hp;
    g.input.lmb = true; T.step(1); g.input.lmb = false; T.step(1);
    const hp1 = m.hp, charge = g.mineState().charge, meter = document.getElementById('atkMeter').classList.contains('show');
    T.aim(m.pos.x, m.pos.y + m.def.cy, m.pos.z);
    g.input.lmb = true; T.step(1); g.input.lmb = false; // hned znovu: tvor je ještě nezranitelný
    const hp2 = m.hp;
    return { hp0, hp1, hp2, charge: +charge.toFixed(2), meter, w: g.inv.slots[0].w };
  });
  check('combat: full-charge sword hit, cooldown meter, invulnerability, sword wears by 1', r.hp0 - r.hp1 === 6 && r.charge < 0.3 && r.meter && r.hp2 === r.hp1 && r.w === 1, JSON.stringify(r));
  r = await ev(() => {
    const g = window.game; g.armor[1] = { id: 'iron_chestplate', n: 1 }; const hp = g.player.hp;
    g.damagePlayer(20, 1, 0); T.step(1);
    const res = { w: g.armor[1]?.w, lost: +(hp - g.player.hp).toFixed(2), flash: document.getElementById('hpfill').closest('.wrap').classList.contains('hit') };
    g.armor[1] = null; g.player.hp = 100;
    return res;
  });
  check('combat: armor absorbs part of a hit and wears by 1', r.w === 1 && r.lost < 20 && r.lost > 0 && r.flash, JSON.stringify(r));
  r = await ev(() => {
    const g = window.game; T.clearInv(); g.addItem('iron_axe', 1, true, 40); T.hold('iron_axe');
    T.tpg(-40, 30); T.step(3);
    g.dropHeld(true); T.step(40);
    const it = g.groundItems[g.groundItems.length - 1], w = it?.w;
    T.tp(it.pos.x, it.pos.z, it.pos.y); T.step(10);
    return { w, picked: g.inv.slots.find((s) => s?.id === 'iron_axe') };
  });
  check('tools: a dropped worn axe keeps its wear when picked up', r.w === 40 && r.picked?.w === 40, JSON.stringify(r));

  // ------------------------------------------------------------ mobs
  r = await ev(() => {
    const g = window.game; T.clearInv(); T.give('iron_sword', 1); T.hold('iron_sword');
    T.tpg(20, 60); T.step(3);
    g.spawnMob('sheep', 22.5, 60);
    const m = g.mobs[g.mobs.length - 1];
    m.idleT = 99; m.moving = false;
    let n = 0;
    while (!m.dead && n < 200) { T.aim(m.pos.x, m.pos.y + m.def.cy, m.pos.z); g.input.lmb = true; T.step(1); n++; }
    g.input.lmb = false; T.step(25); // tvor se převrací a mizí 0,8 s
    return { dead: m.dead, n, mutton: T.count('raw_mutton'), wool: T.count('wool'), gone: !g.mobs.includes(m) };
  });
  check('kill a sheep with a sword, get mutton', r.dead && r.mutton >= 1 && r.gone, JSON.stringify(r));
  r = await ev(() => { const g = window.game; T.tpg(30, 120); T.step(200); return { n: g.mobs.length, types: [...new Set(g.mobs.map((m) => m.type))] }; });
  check('animals spawn around the player', r.n > 0, JSON.stringify(r));

  // ------------------------------------------------------------ day and night
  r = await ev(() => { const g = window.game; g.setTime(0.0); T.step(2); const a = T.text('clock'); g.setTime(0.5); T.step(2); return [a, T.text('clock')]; });
  check('day/night clock follows time', r[0].includes('· 00:') && r[1].includes('· 12:'), r.join(' / '));

  // ------------------------------------------------------------ machines
  r = await ev(() => {
    const g = window.game, k = '40,5,40', k2 = '42,5,40';
    g.blocks.set(k, 'campfire'); g.fires.set(k, { slots: [{ id: 'raw_meat', n: 2 }, null], t: 0 });
    g.blocks.set(k2, 'furnace'); g.furnaces.set(k2, { slots: [{ id: 'iron_ore', n: 2 }, { id: 'coal', n: 1 }, null], t: 0, burn: 0, burnMax: 0 });
    g.rebuildBlocks();
    T.step(100);
    return { fire: g.fires.get(k).slots[1], furnace: g.furnaces.get(k2).slots[2] };
  });
  check('campfire roasts meat', r.fire?.id === 'meat', JSON.stringify(r.fire));
  check('furnace smelts iron ore with coal', r.furnace?.id === 'iron', JSON.stringify(r.furnace));
  r = await ev(() => { // jako v Minecraftu: dolů jen palivo, Shift+klik pošle uhlí do paliva
    const g = window.game, k = '44,5,40';
    g.blocks.set(k, 'furnace'); g.furnaces.delete(k); g.rebuildBlocks();
    g.openInventory('furnace', k);
    g.inv.cursor = { id: 'stone_sword', n: 1 }; g.slotClick('furnace', 1, 0, false);
    const refused = !g.furnaces.get(k).slots[1] && g.inv.cursor?.id === 'stone_sword';
    g.inv.cursor = null;
    const keep = g.inv.slots[20]; g.inv.slots[20] = { id: 'coal', n: 5 }; g.slotClick('inv', 20, 0, true);
    const fuel = g.furnaces.get(k).slots[1];
    g.inv.slots[20] = keep; g.closeInventory();
    return { refused, fuel };
  });
  check('furnace: fuel slot refuses a sword, Shift+click puts coal into fuel', r.refused && r.fuel?.id === 'coal' && r.fuel.n === 5, JSON.stringify(r));
  r = await ev(() => {
    const g = window.game, gen = '50,5,50', cab = '51,5,50', lamp = '52,5,50';
    g.blocks.set(gen, 'coal_generator'); g.blocks.set(cab, 'cable_copper'); g.blocks.set(lamp, 'electric_lamp');
    g.power.set(gen, { slots: [{ id: 'coal', n: 4 }], burn: 0, burnMax: 0, pw: 0 });
    g.rebuildBlocks(); T.step(30);
    return { lamp: g.power.get(lamp)?.pw, gen: g.power.get(gen)?.pw };
  });
  check('power: coal generator lights an electric lamp through a cable', r.lamp === 1 && r.gen === 1, JSON.stringify(r));
  r = await ev(() => {
    const g = window.game; T.tp(51, 54); T.step(30);
    let pulse = 0, holo = 0;
    g.scene.traverse((o) => {
      const a = o.isInstancedMesh && o.geometry.getAttribute('aPow');
      if (a) for (let i = 0; i < o.count; i++) pulse = Math.max(pulse, a.array[i]);
      if (o.material?.uniforms?.uOn && o.visible) holo = Math.max(holo, o.material.uniforms.uOn.value);
    });
    return { pulse: +pulse.toFixed(2), holo: +holo.toFixed(2) };
  });
  check('power: energy pulses run along the live cable, a hologram shows above the generator', r.pulse > 0 && r.holo > 0.5, JSON.stringify(r));
  r = await ev(() => {
    const g = window.game, k = '53,5,52';
    g.blocks.set(k, 'neon_cyan'); g.rebuildBlocks(); T.step(3);
    const lights = [];
    g.scene.traverse((o) => { if (o.isPointLight && o.intensity > 0) lights.push(o.color.getHexString()); });
    g.blocks.delete(k); g.rebuildBlocks();
    return { neon: lights.includes('38e8ff'), lights };
  });
  check('a neon block lights its surroundings in its own colour', r.neon, JSON.stringify(r));
  r = await ev(() => {
    const g = window.game, f = '60,5,60', c = '60,6,60';
    g.blocks.set(f, 'farmland'); g.blocks.set(c, 'wheat_crop'); g.crops.set(c, { stage: 0, t: 0, next: 1 });
    g.rebuildBlocks(); g.updateCrops(2); g.updateCrops(2);
    return g.crops.get(c);
  });
  check('crops grow on farmland', r?.stage >= 1, JSON.stringify(r));
  r = await ev(() => {
    const g = window.game, k = '64,5,64', i = g.KITCHEN.findIndex((x) => x.out === 'fried_egg');
    g.blocks.set(k, 'stove'); g.stoves.set(k, { slots: [null], recipe: i, t: 0 }); g.rebuildBlocks();
    T.step(130);
    return g.stoves.get(k);
  });
  check('stove cooks a fried egg', r?.slots?.[0]?.id === 'fried_egg' && r.recipe === null, JSON.stringify(r));

  // ------------------------------------------------------------ structures, portal, creative, vehicles, eating
  r = await ev(() => {
    const g = window.game;
    const s = g.structuresNear(0, 0, 900).filter((x) => x.type === 'camp' || x.type === 'tower').sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
    if (!s) return { none: true };
    if (!g.ruinsBuilt.has(s.key)) g.buildStructure(s);
    const chest = [...g.chests.keys()].find((k) => { const [x, , z] = k.split(',').map(Number); return Math.hypot(x - s.x, z - s.z) < 8; });
    return { type: s.type, built: g.ruinsBuilt.has(s.key), chest: !!chest };
  });
  check('a structure builds with a loot chest', r.built && r.chest, JSON.stringify(r));
  r = await ev(() => { const g = window.game; T.give('shard', 3); g.usePortal(g.SHRINES[0]); return { active: g.portalActive, shards: T.count('shard') }; });
  check('3 light shards wake the shrine portal', r.active && r.shards === 0, JSON.stringify(r));
  r = await ev(() => { const g = window.game; T.press('KeyC'); const on = g.creative; T.press('KeyC'); return { on, off: !g.creative }; });
  check('C toggles creative mode', r.on && r.off, JSON.stringify(r));
  r = await ev(() => {
    const g = window.game; T.tpg(0, 60); T.step(3);
    const id = g.spawnVehicle('car', 5, 60, 0); const n = g.vehicles.size;
    g.enterVehicle(id); T.step(3); const inside = g.player.vehicle === id;
    g.exitVehicle(); T.step(3);
    return { n, inside, out: !g.player.vehicle };
  });
  check('car: place, get in, get out', r.n >= 1 && r.inside && r.out, JSON.stringify(r));
  r = await ev(() => {
    const g = window.game; T.clearInv(); T.give('bread', 2); T.hold('bread'); g.player.hunger = 40;
    g.input.rmb = true; g.startEating('bread', 'hand'); T.step(80); g.input.rmb = false; T.step(1);
    return { hunger: g.player.hunger, bread: T.count('bread') };
  });
  check('eating bread fills hunger', r.hunger > 60 && r.bread === 1, JSON.stringify(r));

  // ------------------------------------------------------------ characters: costume, views, other players, mob life
  r = await ev(() => {
    const g = window.game; T.tpg(4, 30); T.step(2);
    const lk = g.myPose().lk, fp = g.viewMode;
    T.press('KeyV'); T.step(3);
    const back = g.viewMode, body = g.localBody(), shown = !!body?.group.visible, armorBefore = body?.armorParts?.length || 0;
    g.armor[1] = { id: 'iron_chestplate', n: 1 }; T.step(2);
    const plated = (g.localBody()?.armorParts?.length || 0) > armorBefore;
    g.armor[1] = null;
    T.press('KeyV'); T.press('KeyV'); T.step(2);
    return { lk, fp, back, shown, plated, toast: T.text('toast'), after: g.viewMode, hidden: !g.localBody()?.group.visible };
  });
  check('costume: my position carries the saved costume', r.lk?.startsWith('pilot.9.'), JSON.stringify(r));
  check('V: third-person view shows my suit with armor, back to first person', r.fp === 0 && r.back === 1 && r.shown && r.plated && r.after === 0 && r.hidden, JSON.stringify(r));
  r = await ev(() => {
    T.press('KeyO');
    const open = window.RiseCostume.isOpen;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    return { open, closed: !window.RiseCostume.isOpen, inv: window.game.ui && document.getElementById('inventory').style.display !== 'grid' };
  });
  check('O opens Můj oblek in the game, Esc closes it', r.open && r.closed && r.inv, JSON.stringify(r));
  r = await ev(() => {
    const g = window.game, p = g.player.pos;
    g.others.set('t1', { pid: 't1', name: 'Bára', pose: { x: p.x + 2, y: p.y, z: p.z - 3, yaw: 0, pitch: 0, held: 'iron_pick', mv: 4, sw: 1, eat: 0, ar: ['iron_helmet', null, null, null], sit: 0, fly: 0, alive: true, hp: 60, lk: 'scientist.4.2.1.6' } });
    for (let i = 0; i < 10; i++) g.updateAvatars(0.05);
    const A = g.others.get('t1').avatar;
    const res = { suit: A?.costume.s, tag: A?.tag?.userData.tag.name, hp: A?.tag?.userData.tag.hp, held: A?.held, armor: A?.armorParts?.length, legs: A?.legL.hip.rotation.x !== 0 };
    g.others.get('t1').pose.lk = 'sky.1.1.1.1'; g.updateAvatars(0.05);
    res.changed = g.others.get('t1').avatar?.costume.s;
    g.others.delete('t1'); g.updateAvatars(0.05);
    res.removed = !g.scene.children.includes(A?.group);
    return res;
  });
  check('other players: costume, name tag with health, tool, armor, walking; costume change and leaving', r.suit === 'scientist' && r.tag === 'Bára' && r.hp === 60 && r.held === 'iron_pick' && r.armor > 0 && r.legs && r.changed === 'sky' && r.removed, JSON.stringify(r));
  r = await ev(() => {
    const g = window.game; T.tpg(40, 60); T.step(2);
    const p = g.player.pos;
    g.spawnMob('cow', p.x + 3, p.z - 3);
    const m = g.mobs[g.mobs.length - 1]; m.idleT = 99; m.moving = false; m.ry = 0;
    T.step(1);
    const V = g.mobView(m);
    V.idleT = 99; V.idle = null; // ať se zrovna nezačne pást (to hlavu skloní a hráče nesleduje)
    T.step(40);
    const res = { head: !!V.head, eyes: V.eyes.length, shadow: !!V.shadow?.parent, turned: Math.abs(V.head.rotation.y) > 0.2 };
    m.hp = 0.1; g.hitMob(m, 5); T.step(12);
    res.tipping = Math.abs(V.group.rotation.z) > 0.3 && g.scene.children.includes(V.group); // na bok (vlevo nebo vpravo)
    T.step(40);
    res.gone = !g.scene.children.includes(V.group);
    return res;
  });
  check('mobs: head, eyes and soft shadow; the cow turns its head to the player', r.head && r.eyes >= 1 && r.shadow && r.turned, JSON.stringify(r));
  check('mobs: a killed mob tips over, then disappears', r.tipping && r.gone, JSON.stringify(r));

  // ------------------------------------------------------------ sound
  r = await ev(async () => {
    const g = window.game, S = g.Sound;
    S.init(); T.step(2);
    const mats = ['grass', 'dirt', 'stone', 'sand', 'snow', 'wood', 'metal', 'glass', 'crystal', 'water', 'leaves'];
    const steps = [];
    for (const m of mats) steps.push((await S.offline(0.8, (s) => s.footstep(m))).peak);
    const brk = await S.offline(1.5, (s) => { s.blockBreak('stone'); s.blockPlace('wood'); s.toolBreak(); });
    return { ctx: !!S.ctx, beds: S.ambience?.beds.size ?? -1, music: S.music?.state, quiet: Math.min(...steps), loud: Math.max(...steps, brk.peak) };
  });
  check('sound: engine starts with ambience and music', r.ctx && r.beds >= 0 && (r.music === 'wait' || r.music === 'play'), JSON.stringify(r));
  check('sound: every footstep material is audible and nothing clips', r.quiet > 0.01 && r.loud < 0.95, JSON.stringify(r));
  r = await ev(() => {
    const g = window.game, S = g.Sound; T.clearInv(); T.give('planks', 2); T.hold('planks');
    T.tpg(6, 70); T.step(3);
    const p = g.player.pos, cell = [Math.floor(p.x) + 2, Math.floor(p.y), Math.floor(p.z)];
    const n0 = S.played; g.placeBlock(g.ITEMS.planks, cell); const placed = S.played - n0;
    const under = g.materialAt(cell[0] + 0.5, cell[1] + 1, cell[2] + 0.5);
    g.blocks.delete(cell.join(',')); g.rebuildBlocks();
    g.keys.add('KeyW'); const n1 = S.played; T.step(40); g.keys.delete('KeyW'); T.step(2);
    return { placed, under, steps: S.played - n1 };
  });
  check('sound: placing a plank knocks like wood, walking makes footsteps', r.placed > 0 && r.under === 'wood' && r.steps > 0, JSON.stringify(r));
  r = await ev(() => {
    const g = window.game, S = g.Sound;
    localStorage.setItem('rise-nastaveni', JSON.stringify({ ...JSON.parse(localStorage.getItem('rise-nastaveni') || '{}'), music: 0, sfx: 0.5 }));
    dispatchEvent(new Event('rise-prefs'));
    const v = { ...S.vols };
    window.RiseSettings.open({ inGame: true });
    const sliders = [...document.querySelectorAll('#settings [data-r="vol"], #settings [data-r="sfx"], #settings [data-r="music"]')].map((e) => e.previousElementSibling.textContent.trim());
    document.querySelector('#settings [data-close]').click();
    const p = JSON.parse(localStorage.getItem('rise-nastaveni')); delete p.music; delete p.sfx; localStorage.setItem('rise-nastaveni', JSON.stringify(p)); dispatchEvent(new Event('rise-prefs'));
    return { v, sliders };
  });
  check('sound: Nastavení has Hlasitost, Zvuky, Hudba and they apply at once', r.v.music === 0 && r.v.sfx === 0.5 && r.sliders.join('|') === 'Hlasitost 80 %|Zvuky 50 %|Hudba 0 %', JSON.stringify(r));

  // ------------------------------------------------------------ save and load
  const before = await ev(() => {
    const g = window.game; T.clearInv(); T.give('stone', 7); T.give('apple', 3); g.addItem('iron_pick', 1, true, 33);
    g.blocks.set('3,1,40', 'bricks'); g.rebuildBlocks(); g.setTime(0.3);
    g.saveGame();
    return { blocks: g.blocks.size, stone: T.count('stone'), apple: T.count('apple'), portal: g.portalActive, built: g.ruinsBuilt.size, vox: g.worldState().vox.length };
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.click('#mSolo');
  await waitGame(page);
  const after = await ev(() => { const g = window.game; return { blocks: g.blocks.size, stone: T.count('stone'), apple: T.count('apple'), portal: g.portalActive, built: g.ruinsBuilt.size, vox: g.worldState().vox.length, brick: g.blocks.get('3,1,40'), pickW: g.inv.slots.find((s) => s?.id === 'iron_pick')?.w }; });
  check('save + reload keeps world and backpack', after.blocks === before.blocks && after.stone === 7 && after.apple === 3 && after.portal && after.built === before.built && after.vox === before.vox && after.brick === 'bricks', JSON.stringify({ before, after }));
  check('save + reload keeps tool wear', after.pickW === 33, JSON.stringify(after));
  check('intro not shown after reload', await ev(() => document.getElementById('intro').style.display !== 'grid'));

  // ------------------------------------------------------------ graphics pipeline (render/look.js, post.js, shadows.js)
  r = await ev(() => { const g = window.game; return { look: g.LK?.name, post: g.FX.post, low: g.QUALITY === 'low', composer: !!g.post.composer, shadows: g.renderer.shadowMap.enabled, tone: g.renderer.toneMapping }; });
  check('graphics: low = no post-processing and no shadows, medium/high = composer + shadows', !!r.look && (r.low ? !r.post && !r.composer && !r.shadows : r.post && r.composer && r.shadows), JSON.stringify(r));
  // Grafika Automaticky: softwarové WebGL (CI) = nízká; počasí z pravidel a game.setWeather; soumrak a hvězdy
  r = await ev(() => {
    const g = window.game, out = { quality: g.QUALITY, gpu: g.FX.gpu };
    g.setTime(0.5); g.setWeather({ rain: 1, storm: 1 }); T.step(240, 0.05);
    const rain = g.scene.children.find((o) => o.renderOrder === 5);
    Object.assign(out, { rain: +g.weather.rain.toFixed(2), wet: +g.weather.wet.toFixed(2), rainVisible: !!rain?.visible, overcast: +g.weather.overcast.toFixed(2) });
    g.setWeather(null); g.weather.rain = g.weather.storm = g.weather.wet = 0;
    g.setTime(0.762); T.step(2, 0.01); out.twilight = +g.vis.twilight.toFixed(2); out.starsDusk = +g.vis.starK.toFixed(2);
    g.setTime(0.0); T.step(2, 0.01); out.starsNight = +g.vis.starK.toFixed(2); out.moon = +g.vis.moonK.toFixed(2);
    g.setTime(0.32); T.step(2, 0.01);
    return out;
  });
  check('graphics: weather (rain, wet ground) and dusk/night sky', r.rain > 0.9 && r.rainVisible && r.wet > 0.05 && r.overcast > 0.8 && r.twilight > 0.3 && r.starsNight > 0.9 && r.moon > 0.9, JSON.stringify(r));
  if (!process.env.PLAYTEST_QUALITY) check('graphics: Automaticky picks nízká on software WebGL', r.gpu !== 'software' || r.quality === 'low', JSON.stringify(r));
  // ------------------------------------------------------------ 3D icons of blocks and machines (drawn in the background after the start)
  const icons3d = await page.waitForFunction(() => ['coal_generator', 'tech_panel', 'bricks', 'planks_stairs'].every((id) => window.game.ICONS[id]?.smooth && window.game.ICONS[id].canvas.width === 64), null, { timeout: 60000 }).then(() => true, () => false);
  check('block and machine icons are 3D renders (64 px, smooth)', icons3d);

  // ------------------------------------------------------------ picture
  await ev(() => { const g = window.game; g.setTime(0.32); T.tp(0, 16, 0.45); g.player.yaw = 0; g.player.pitch = 0.05; T.step(30); });
  if (await shot(page, `${out}.png`)) check('screenshot written', fs.existsSync(`${out}.png`));
} catch (e) {
  check('play-test ran without exception', false, e.stack || e);
}

check('no console errors', page.errors.length === 0, page.errors.slice(0, 5).join(' | '));
fs.writeFileSync(`${out}.json`, JSON.stringify(results, null, 2));
await browser.close();
await server?.close();
const bad = failed();
console.log(`\n${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
