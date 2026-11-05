// Unit tests for the parts of the new vehicles that live in shared/ (or are plain data): lakes in the terrain,
// the shared wind for sailboats, the vehicle kinds table, and saves with new and old vehicles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, RECIPES } from '../../shared/data/index.js';
import { weatherAt, windAt } from '../../shared/sim/weather.js';
import { pondLevel, waterAt, nearPond } from '../../shared/world/nature.js';
import { loadWorld, worldState } from '../../shared/world/save.js';
import { vehicles } from '../../shared/world/state.js';
import { LAKE_CELL, LAKE_EDGE, LAKE_MIN, MARK_X, VOLC_R, inLake, lakeOf, nearestLake, pondDip, pondOf, terrainH, volcanoDist } from '../../shared/world/terrain.js';
import { KINDS, isBoat, isPlane, kindOf, trunkSize } from '../../client/src/vehicles/kinds.js';
import { TERRAIN_GLSL } from '../../client/src/render/glsl.js';

// všechna jezera v okruhu ~8 km
const allLakes = () => {
  const out = [];
  for (let cx = -8; cx < 8; cx++) for (let cz = -8; cz < 8; cz++) { const L = lakeOf((cx + 0.5) * LAKE_CELL, (cz + 0.5) * LAKE_CELL); if (L) out.push(L); }
  return out;
};

test('lakes: rare, 100–240 m across, 6–8 m deep, ≥ 500 m from the shrine, not in the Mark dimension or a volcano', () => {
  const lakes = allLakes();
  assert.ok(lakes.length > 20 && lakes.length < 256 * 0.42, `${lakes.length} lakes in 16×16 cells`);
  for (const L of lakes) {
    const e = L.r * LAKE_EDGE;
    assert.ok(L.r >= 50 && L.r <= 120 && L.depth >= 6 && L.depth <= 8, JSON.stringify(L));
    assert.ok(Math.hypot(L.x, L.z) - e >= LAKE_MIN, `lake ${L.key} reaches into the 500 m around the shrine`);
    assert.ok(L.x + e < MARK_X && volcanoDist(L.x, L.z) > VOLC_R * 1.7 + e, `lake ${L.key} near Mark or a volcano`);
    assert.equal(lakeOf(L.x + 1, L.z - 1), L, 'same lake object from the cell (cached)');
  }
  assert.equal(nearestLake(0, 0).key, 'l-1,-1', 'the lake nearest the shrine stays where it is');
});

test('lakes: flat shore at the water level, flat bottom, water everywhere inside, consistent with ponds', () => {
  for (const L of allLakes().slice(0, 12)) {
    // hladina spočítaná jako u rybníků (nejnižší bod okraje) je stejná jako uložená hladina jezera
    assert.ok(Math.abs(pondLevel({ x: L.x, z: L.z, r: L.r }) - L.level) < 0.02, `level of ${L.key}`);
    assert.ok(Math.abs(terrainH(L.x, L.z) - (L.hc - L.depth)) < 1e-6, 'flat bottom in the middle');
    for (let a = 0; a < 6.28; a += 0.7) {
      const c = Math.cos(a), s = Math.sin(a);
      assert.ok(terrainH(L.x + c * L.r * 1.1, L.z + s * L.r * 1.1) >= L.level, 'dry shore just outside');
      assert.equal(waterAt(L.x + c * L.r * 0.5, -1e9, L.z + s * L.r * 0.5), L.level, 'water inside');
      assert.ok(L.level - terrainH(L.x + c * L.r * 0.69, L.z + s * L.r * 0.69) > 5.5, 'deep enough for boats at 0.7 r');
    }
    assert.equal(pondOf(L.x + L.r, L.z).key, L.key, 'pondOf returns the lake near it');
    assert.ok(nearPond(L.x + L.r + 3, L.z) && inLake(L.x, L.z) && !inLake(L.x + L.r * 1.2, L.z));
    for (let d = 0; d < L.r * LAKE_EDGE; d += 7) assert.equal(pondDip(L.x + d, L.z + d * 0.3), 0, 'no small pond inside a lake');
  }
});

test('lakes: the GLSL twin uses the same cell, salts, sizes and profile as terrain.js', () => {
  for (const part of ['hash2i(c.x + 57.0, c.y + 311.0) >= 0.42', 'c.x + 0.25 + 0.5 * hash2i(c.x + 61.0, c.y + 5.0)', '50.0 + 70.0 * hash2i(c.x + 8.0, c.y + 8.0)',
    '6.0 + 2.0 * hash2i(c.x + 9.0, c.y + 3.0)', `sst(${LAKE_EDGE.toFixed(2)}, 1.15, d)`, 'sst(1.0, 0.7, d)', `floor(p / ${LAKE_CELL.toFixed(1)})`]) {
    assert.ok(TERRAIN_GLSL.includes(part), `GLSL has ${part}`);
  }
});

test('wind: the same for every player (only day and time), smooth, in range, stronger in a storm', () => {
  let stormy = null;
  for (let day = 1; day < 40; day++) for (let t = 0; t < 1; t += 0.01) {
    const w = windAt(day, t);
    assert.deepEqual(w, windAt(day, t), 'deterministic');
    assert.ok(Math.abs(Math.hypot(w.x, w.z) - 1) < 1e-9 && w.speed > 2.5 && w.speed < 20, JSON.stringify(w));
    const n = windAt(day, t + 0.0005); // ~0,6 s hry později (poryv změní sílu nejvýš o ~10 %)
    assert.ok(Math.hypot(n.x - w.x, n.z - w.z) < 0.05 && Math.abs(n.speed - w.speed) < 0.1 * w.speed + 0.2, `smooth at day ${day} t ${t.toFixed(2)}`);
    if (!stormy && weatherAt(day, t).storm > 0.99) stormy = [day, t];
  }
  if (stormy) assert.ok(windAt(...stormy).speed > 6, 'a storm blows hard');
  const a = windAt(5, 0.1), b = windAt(5, 0.6);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 0.01 || Math.abs(a.speed - b.speed) > 0.1, 'wind changes during the day');
});

test('vehicle kinds: every vehicle item has a kind with seats; unknown types fall back to the car', () => {
  for (const [type, K] of Object.entries(KINDS)) {
    assert.equal(ITEMS[K.item]?.vehicle, type, `item ${K.item} places ${type}`);
    assert.ok(RECIPES.some((r) => r.out === K.item), `recipe for ${K.item}`);
    assert.ok(K.seats.length >= 1 && K.seats.every((s) => s.length === 3), type);
  }
  assert.equal(kindOf('ufo'), KINDS.car);
  assert.equal(trunkSize('car'), 18); // staré uložené auto má 19 políček (baterie + 18)
  assert.ok(isBoat('sailboat') && isBoat('motorboat') && isPlane('seaplane') && !isBoat('car'));
  assert.equal(KINDS.bike.seats.length, 1, 'no passengers on a bike');
});

test('saves: new vehicles with garage upgrades round-trip; an old save (car and biplane without mods) still loads', () => {
  const old = {
    a: { type: 'car', x: 5, y: 1, z: 60, yaw: 0, pitch: 0, roll: 0, spd: 0, steer: 0, fuel: 12, bat: 80, slots: Array(19).fill(null), lights: false, driver: 'p1', color: 0xc82a2a },
    b: { type: 'plane', x: 20, y: 1, z: 60, yaw: 1, pitch: 0.14, roll: 0, spd: 0, steer: 0, fuel: 30, bat: 0, slots: Array(19).fill(null), lights: false, driver: null, color: 0x8a2a22, vx: 0, vy: 0, vz: 0, thr: 0, ground: true },
  };
  const now = {
    c: { type: 'bike', x: 1, y: 1, z: 2, yaw: 0, slots: Array(5).fill(null), gear: 3, fuel: 0, mods: { offroad: 1 }, color: 0x2a5ab0, driver: null },
    d: { type: 'sailboat', x: 700, y: -0.6, z: 0, yaw: 2, slots: Array(10).fill(null), thr: 1, boom: -0.6, fuel: 0, driver: null },
    e: { type: 'car', x: 9, y: 1, z: 9, yaw: 0, slots: Array(19).fill(null), fuel: 3, mods: { nitro: 2, engine: 1 }, driver: null },
  };
  vehicles.clear();
  loadWorld({ vehicles: { ...old, ...now } });
  const st = JSON.parse(JSON.stringify(worldState()));
  assert.equal(Object.keys(st.vehicles).length, 5);
  assert.equal(st.vehicles.a.driver, null, 'nobody sits in a loaded vehicle');
  assert.equal(st.vehicles.a.mods, undefined, 'old car has no upgrades and needs none');
  assert.deepEqual(st.vehicles.e.mods, { nitro: 2, engine: 1 });
  assert.equal(st.vehicles.c.gear, 3);
  assert.equal(st.vehicles.d.boom, -0.6);
  vehicles.clear();
  loadWorld(st);
  assert.equal(vehicles.get('b').type, 'plane');
  assert.equal(vehicles.get('e').mods.nitro, 2);
  vehicles.clear();
});
