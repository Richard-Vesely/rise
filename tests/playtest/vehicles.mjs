// Play-test of the vehicles in a real browser: lakes and swimming, bicycle, motorboat, sailboat (wind), seaplane,
// garage (paint, nitro, off-road tyres, turbo), nitro boost, a passenger seat, placing vehicles from the hand.
// Usage: npm run build && node tests/playtest/vehicles.mjs [dist] [out-prefix]
import fs from 'node:fs';
import { launch, serveDir, openPage, waitGame, checker, shot } from './lib.mjs';

const target = process.argv[2] || 'dist';
const out = process.argv[3] || 'playtest-veh';
const { check, results, failed } = checker('vehicles: ');
const srv = await serveDir(target);
const browser = await launch();
const page = await openPage(browser, srv.url);
const ev = (fn, arg) => page.evaluate(fn, arg);

try {
  await page.fill('#mName', 'Tester');
  await page.click('#mSolo');
  await waitGame(page);
  await ev(() => {
    const g = window.game;
    document.getElementById('intro').style.display = 'none';
    g.setTime(0.35);
    T.tpg = (x, z) => { const y = g.groundHeight(x, z); T.tp(x, z, y); };
    // drží klávesy n kroků po 0,05 s
    T.hold = (codes, n) => { for (const c of codes) T.key(c, true); T.step(n); for (const c of codes) T.key(c, false); };
    T.fresh = (id) => { const v = g.vehicles.get(id); return { x: v.x, y: v.y, z: v.z }; };
  });

  // ------------------------------------------------------------ lakes and swimming
  let r = await ev(() => {
    const g = window.game, L = g.toLake();
    T.step(3);
    const shore = g.waterAt(g.player.pos.x, g.player.pos.y + 0.05, g.player.pos.z) === null;
    const mid = g.waterAt(L.x, -1e9, L.z), deep = mid - g.terrainH(L.x, L.z);
    const far = Math.hypot(L.x, L.z) - L.r * 1.45;
    // plavání: hráč v hluboké vodě vyplave k hladině
    g.player.pos.set(L.x, g.terrainH(L.x, L.z) + 0.1, L.z); g.player.vel.set(0, 0, 0);
    T.step(80);
    const head = g.player.pos.y + 1.62 - mid;
    return { r: L.r, shore, deep, far, head, lake: !!g.pondOf(L.x, L.z)?.lake };
  });
  check('a lake: deep water, ≥ 500 m from the shrine, shore is dry', r.deep > 5.5 && r.far >= 500 && r.shore && r.lake, JSON.stringify(r));
  check('swimming: in deep water the player floats up, head above the surface', r.head > -0.2 && r.head < 1.2, JSON.stringify(r));

  // ------------------------------------------------------------ bicycle
  r = await ev(() => {
    const g = window.game; T.tpg(0, 60); T.step(3);
    g.player.hunger = 100;
    const id = g.spawnVehicle('bike', 2, 60, Math.PI / 2); g.vehicles.get(id).y = g.groundHeight(2, 60);
    g.enterVehicle(id); T.step(2);
    const a = T.fresh(id);
    T.press('Digit3');
    T.hold(['KeyW'], 80);
    const v = g.vehicles.get(id), b = T.fresh(id), spd = v.spd, gear = v.gear;
    T.hold(['KeyW', 'KeyA'], 12);
    const lean = v.roll;
    T.hold(['Space'], 40);
    const stopped = Math.abs(v.spd) < 0.5;
    const hud = document.getElementById('vehHud').textContent;
    g.exitVehicle(); T.step(3);
    return { moved: Math.hypot(b.x - a.x, b.z - a.z), spd, gear, lean, stopped, hunger: g.player.hunger, hud, out: !g.player.vehicle, mesh: !!g.vehMeshes.get(id) };
  });
  check('bicycle: pedal (W) rides, gear 3, costs a little hunger', r.moved > 10 && r.gear === 3 && r.hunger < 100 && r.hunger > 95, JSON.stringify(r));
  check('bicycle: leans into a turn, brakes, HUD, get off', Math.abs(r.lean) > 0.05 && r.stopped && /převod 3\/3/.test(r.hud) && r.out && r.mesh, JSON.stringify(r));

  // ------------------------------------------------------------ motorboat
  r = await ev(() => {
    const g = window.game; g.toLake(); T.step(3);
    const id = g.spawnOnLake('motorboat'), v = g.vehicles.get(id);
    v.fuel = 20;
    g.enterVehicle(id); T.step(2);
    const a = T.fresh(id);
    T.hold(['KeyW'], 70);
    const b = T.fresh(id), lv = g.levelAt(v.x, v.z), spd = v.spd;
    // rovně dál, až narazí na břeh: zastaví se, nevyjede na souš
    T.hold(['KeyW'], 600);
    const c = T.fresh(id), onWater = g.levelAt(c.x, c.z) !== null;
    const hud = document.getElementById('vehHud').textContent;
    g.exitVehicle(); T.step(3);
    const p = g.player.pos, dry = g.waterAt(p.x, p.y + 0.5, p.z) === null;
    return { moved: Math.hypot(b.x - a.x, b.z - a.z), spd, floatsAt: lv !== null && Math.abs(b.y - lv) < 0.3, onWater, fuel: v.fuel, hud, out: !g.player.vehicle, dry };
  });
  check('motorboat: floats on the lake and motors forward (uses fuel)', r.moved > 10 && r.floatsAt && r.fuel < 20 && /🚤/.test(r.hud), JSON.stringify(r));
  check('motorboat: stops at the shore (never drives onto land), F gets out onto the shore', r.onWater && r.out && r.dry, JSON.stringify(r));

  // ------------------------------------------------------------ sailboat and the wind
  r = await ev(() => {
    const g = window.game; g.toLake(); T.step(3);
    const id = g.spawnOnLake('sailboat'), v = g.vehicles.get(id);
    const w = g.windAt(1, 0.35);
    g.enterVehicle(id); T.step(2);
    v.yaw = Math.atan2(w.z, -w.x); // vítr z boku (bočák)
    const beam = g.windRel(v);
    T.hold(['KeyW'], 40); // vytáhnout plachtu
    T.step(60);
    const reach = { spd: v.spd, boom: v.boom, heel: v.roll, up: v.thr };
    const hud = document.getElementById('vehHud').textContent;
    v.yaw = Math.atan2(w.x, w.z); // přídí přímo proti větru
    T.step(160);
    const into = { spd: v.spd, luff: v.lf, rel: g.windRel(v).a };
    g.exitVehicle(); T.step(3);
    return { beam: beam.a, reach, into, hud, eff: [g.sailEff(0.3), g.sailEff(1.57), g.sailEff(3.1)] };
  });
  check('sailboat: with the wind from the side the sail fills, the boom swings out and she heels', r.reach.spd > 2 && Math.abs(r.reach.boom) > 0.3 && Math.abs(r.reach.heel) > 0.02 && r.reach.up > 0.9, JSON.stringify(r));
  check('sailboat: straight into the wind the sail luffs and she stops; HUD shows the wind', r.into.spd < 1 && r.into.luff === 1 && /vítr/.test(r.hud) && /bočák/.test(r.hud), JSON.stringify(r));
  check('points of sail: into the wind 0, beam reach fastest, running slower', r.eff[0] === 0 && r.eff[1] > r.eff[2] && r.eff[2] > 0.5, JSON.stringify(r.eff));

  // ------------------------------------------------------------ seaplane
  r = await ev(() => {
    const g = window.game; g.toLake(); T.step(3);
    const id = g.spawnOnLake('seaplane'), v = g.vehicles.get(id);
    v.fuel = 40;
    g.enterVehicle(id); T.step(4);
    const water = v.onWater && v.ground;
    let maxAlt = 0, maxSpd = 0;
    T.key('Space', true);
    for (let i = 0; i < 400 && maxAlt < 6; i++) {
      T.step(1);
      const sp = Math.hypot(v.vx, v.vz);
      maxSpd = Math.max(maxSpd, sp);
      if (sp > 19) T.key('KeyS', true);
      maxAlt = Math.max(maxAlt, v.y - (g.levelAt(v.x, v.z) ?? g.terrainH(v.x, v.z)));
    }
    T.key('Space', false); T.key('KeyS', false);
    const hud = document.getElementById('vehHud').textContent;
    return { water, maxAlt, maxSpd, air: !v.ground, hud };
  });
  check('seaplane: sits on the water on its floats and takes off from the lake', r.water && r.maxAlt > 3 && r.air, JSON.stringify(r));
  await ev(() => { const g = window.game; const v = g.vehicles.get(g.player.vehicle); g.player.vehicle = null; if (v) { v.driver = null; g.vehicles.delete([...g.vehicles.entries()].find(([, x]) => x === v)[0]); } T.step(2); });

  // ------------------------------------------------------------ garage, nitro, turbo
  r = await ev(() => {
    const g = window.game; T.tpg(0, 70); T.step(3);
    const y = Math.floor(g.groundHeight(3.5, 70.5)), key = `3,${y},70`;
    g.blocks.set(key, 'garage'); g.rebuildBlocks();
    const id = g.spawnVehicle('car', 6, 74, 0), v = g.vehicles.get(id);
    v.y = g.groundHeight(6, 74); v.fuel = 30; v.slots[0] = { id: 'car_battery', n: 1 }; v.bat = 100; v.batId = 'car_battery';
    T.give('nitro', 2); T.give('turbocharger', 1); T.give('offroad_tires', 1);
    g.openInventory('garage', key);
    const html = document.getElementById('inventory').innerHTML;
    const down = (el) => el?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); // okno inventáře reaguje na stisk
    const click = (sel) => down(document.querySelector(`[data-gar="${sel}"]`));
    const before = v.color;
    const paints = [...document.querySelectorAll('.garage-paint')].map((b) => b.dataset.gar);
    down(document.querySelector('.garage-paint:not(.on)')); // první barva, která není současná
    click('mod:nitro'); click('mod:nitro'); click('mod:engine'); click('mod:offroad');
    const mods = { ...g.vehicles.get(id).mods };
    g.closeInventory();
    T.step(2);
    const repainted = g.vehMeshes.get(id)?.color === g.vehicles.get(id).color;
    const look = g.vehMeshes.get(id)?.look, exhausts = g.vehMeshes.get(id)?.exhausts?.length; // model ukazuje vylepšení
    // nitro: plný plyn, pak N
    g.enterVehicle(id); T.step(2);
    const hand = g.camera.children.some((c) => c.visible); // ve voze z první osoby není vidět ruka ani předmět
    T.hold(['KeyW'], 40);
    const s0 = v.spd;
    T.key('KeyW', true); T.press('KeyN'); const boosted = g.nitro.t > 0; T.step(40); T.key('KeyW', false);
    const s1 = v.spd;
    g.exitVehicle(); T.step(2);
    return { garage: /Garáž/.test(html), paints: paints.length, colorChanged: v.color !== before, repainted, look, exhausts, hand, mods, left: { nitro: T.count('nitro'), turbo: T.count('turbocharger'), tyres: T.count('offroad_tires') }, boosted, s0, s1, nitroLeft: v.mods.nitro };
  });
  check('garage: window for a parked car, repaint changes the colour and the model', r.garage && r.paints === 16 && r.colorChanged && r.repainted, JSON.stringify(r));
  check('garage: nitro refills, turbo and off-road tyres get fitted (parts used up)', r.mods.nitro === 2 && r.mods.engine === 1 && r.mods.offroad === 1 && r.left.nitro === 0 && r.left.turbo === 0 && r.left.tyres === 0, JSON.stringify(r.mods));
  check('nitro: N boosts the car and uses one charge', r.boosted && r.s1 > r.s0 + 3 && r.nitroLeft === 1, JSON.stringify(r));
  check('garage: the model shows the upgrades (off-road tyres, turbo, nitro nozzles)', /\|111$/.test(r.look || '') && r.exhausts === 2, JSON.stringify({ look: r.look, exhausts: r.exhausts }));
  check('in the car (first person) the hand and held item are hidden', r.hand === false, JSON.stringify({ hand: r.hand }));

  // ------------------------------------------------------------ passenger seat (another player drives)
  r = await ev(() => {
    const g = window.game; T.tpg(0, 80); T.step(3);
    const id = g.spawnVehicle('car', 3, 80, 0), v = g.vehicles.get(id);
    v.y = g.groundHeight(3, 80);
    v.driver = 'kamarad'; // řídí někdo jiný
    g.enterVehicle(id); T.step(3);
    const riding = g.player.riding && g.player.riding.id === id && g.player.riding.s === 1;
    const seat = new g.camera.position.constructor(); g.seatWorld(id, 1, seat); const p = g.player.pos;
    const atSeat = Math.hypot(seat.x - p.x, seat.z - p.z) < 0.05;
    v.x += 3; T.step(2); // vozidlo jede: spolujezdec jede s ním
    const followed = Math.abs(g.player.pos.x - (seat.x + 3)) < 0.1;
    const hud = document.getElementById('vehHud').textContent;
    T.press('KeyF'); T.step(2);
    const out = !g.player.riding && !g.player.vehicle && Math.hypot(g.player.pos.x - v.x, g.player.pos.z - v.z) > 0.9;
    v.driver = null;
    return { riding, atSeat, followed, hud, out };
  });
  check('passenger: F on a car someone drives = ride along in a free seat', r.riding && r.atSeat && r.followed && /spolujezdec/.test(r.hud), JSON.stringify(r));
  check('passenger: F gets out next to the car', r.out, JSON.stringify(r));

  // ------------------------------------------------------------ placing from the hand (right click)
  r = await ev(() => {
    const g = window.game; T.tpg(0, 90); T.step(3);
    T.clearInv(); T.give('bike', 1); T.hold('bike');
    const n0 = g.vehicles.size;
    T.aim(0, g.groundHeight(0, 86.5), 86.5); g.useItem(); T.step(2);
    const bike = g.vehicles.size === n0 + 1 && !T.count('bike');
    const L = g.toLake(); T.step(3);
    T.give('sailboat', 1); T.hold('sailboat');
    T.aim(L.x, L.level, L.z); g.player.pitch = -0.15; T.step(1); g.useItem(); T.step(2);
    const boat = g.vehicles.size === n0 + 2 && !T.count('sailboat');
    const id = [...g.vehicles.keys()].pop(), v = g.vehicles.get(id);
    return { bike, boat, type: v.type, onWater: g.levelAt(v.x, v.z) !== null, toast: document.getElementById('toast')?.textContent };
  });
  check('placing: a bike from the hand on the ground, a sailboat onto the lake', r.bike && r.boat && r.type === 'sailboat' && r.onWater, JSON.stringify(r));

  // ------------------------------------------------------------ save + reload keeps vehicles with their upgrades
  r = await ev(() => { const g = window.game; g.saveGame(); return [...g.vehicles.values()].map((v) => v.type).sort().join(','); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.click('#mSolo');
  await waitGame(page);
  const after = await ev(() => { const g = window.game; return { types: [...g.vehicles.values()].map((v) => v.type).sort().join(','), mods: [...g.vehicles.values()].find((v) => v.mods)?.mods }; });
  check('save + reload keeps bikes, boats and garage upgrades', after.types === r && after.mods?.engine === 1, JSON.stringify({ before: r, after }));
  await shot(page, `${out}.png`);
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
