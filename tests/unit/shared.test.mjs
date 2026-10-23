// Unit tests of the rules layer (shared/): it must import in Node (no DOM, no Three.js) and keep Marek's world.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, RECIPES, BLOCKS, KITCHEN, COOKING, FUEL, CROPS, smeltResult } from '../../shared/data/index.js';
import { terrainH, biomeAt, shrineDist } from '../../shared/world/terrain.js';
import { naturalAt, topY, V } from '../../shared/world/voxels.js';
import { structuresNear } from '../../shared/world/structures.js';

test('data tables are complete (counts from Marek\'s version 2778d1b)', () => {
  // + 5 futuristických bloků (technický a bílý panel, 3 neony; shared/data/tech.js) + trezor + luk a šíp (2 předměty, 2 recepty) + štít
  assert.equal(Object.keys(ITEMS).length, 360 + 5 + 1 + 2 + 1);
  assert.equal(RECIPES.length, 262 + 5 + 1 + 2 + 1);
  assert.equal(Object.keys(BLOCKS).length, 112 + 5 + 1);
  assert.equal(KITCHEN.length, 36);
  assert.equal(Object.keys(CROPS).length, 4);
});

test('every recipe has a grid pattern, a category and known ingredients', () => {
  for (const r of RECIPES) {
    assert.ok(ITEMS[r.out], `recipe output ${r.out} is an item`);
    assert.ok(r.pat && r.w >= 1 && r.h >= 1 && r.cat, `recipe ${r.out} finalized`);
    for (const row of r.pat) for (const id of row) if (id) assert.ok(ITEMS[id], `ingredient ${id} of ${r.out}`);
  }
  assert.equal(RECIPES[0].out, 'planks'); // pořadí v knize receptů
  assert.equal(RECIPES.find((r) => r.out === 'car_battery'), undefined); // autobaterie se vyrábí vybitá
  assert.ok(RECIPES.find((r) => r.out === 'car_battery_empty'));
});

test('kitchen, cooking, fuel and blocks refer to existing items', () => {
  for (const k of KITCHEN) {
    assert.ok(ITEMS[k.out], k.out);
    for (const id of [...Object.keys(k.in), ...k.tools, ...Object.keys(k.returns || {})]) assert.ok(ITEMS[id], `${id} in ${k.out}`);
  }
  for (const [a, b] of Object.entries(COOKING)) assert.ok(ITEMS[a] && ITEMS[b], `${a} -> ${b}`);
  for (const id of Object.keys(FUEL)) assert.ok(ITEMS[id], id);
  for (const [id, b] of Object.entries(BLOCKS)) if (b.drop) assert.ok(ITEMS[b.drop], `drop of ${id}`);
  assert.equal(smeltResult('iron_ore'), 'iron');
  assert.equal(smeltResult('copper_ore'), 'copper_ingot');
});

test('terrain and biomes are the same as in Marek\'s version', () => {
  const pts = [[0, 0, 0, 'meadow'], [14, 14, 0.085344, 'meadow'], [100, -50, 2.356246, 'meadow'], [523, 911, -1.826586, 'cherry'],
    [-1200, 300, -3.797062, 'mushroom'], [3000, -2500, -3.548071, 'meadow'], [20500, 40, 7.087566, 'meadow']];
  for (const [x, z, h, b] of pts) {
    assert.ok(Math.abs(terrainH(x, z) - h) < 1e-5, `terrainH(${x}, ${z}) = ${terrainH(x, z)}`);
    assert.equal(biomeAt(x, z), b);
  }
  assert.equal(shrineDist(40003, 4), 5);
});

test('underground voxels and structures are deterministic', () => {
  assert.deepEqual([[5, -3, 7], [40, -20, -13], [-100, -30, 250]].map(([x, y, z]) => naturalAt(x, y, z, topY(x, z))), [V.DIRT, V.STONE, V.STONE]);
  assert.equal(naturalAt(0, -48, 0, topY(0, 0)), V.BEDROCK);
  const near = structuresNear(0, 0, 700);
  const count = (t) => near.filter((s) => s.type === t).length;
  assert.deepEqual([count('camp'), count('dungeon'), count('tower'), count('temple'), count('hut'), count('mushhouse')], [42, 38, 18, 8, 4, 5]);
});

test('every module in shared/ imports in Node (no DOM, no Three.js)', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const root = path.resolve('shared');
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.js')) files.push(p); } };
  walk(root);
  assert.ok(files.length >= 20);
  for (const f of files) await import(pathToFileURL(f).href);
  assert.equal(typeof globalThis.document, 'undefined');
});

test('oceans: only in worlds created with them; seas with beaches far from home, water to swim in', async () => {
  const { WORLD_GEN, oceanK, beachK, SEA, OCEAN_START } = await import('../../shared/world/terrain.js');
  const { waterAt } = await import('../../shared/world/nature.js');
  const { loadWorld, worldState } = await import('../../shared/world/save.js');
  const before = terrainH(3000, -2500);
  try {
    WORLD_GEN.oceans = true;
    assert.equal(oceanK(0, 0), 0, 'no sea near the home shrine');
    assert.ok(terrainH(0, 0) === 0 && Math.abs(terrainH(100, -50) - 2.356246) < 1e-5, 'home area unchanged');
    assert.ok(oceanK(740, 0) > 0.9 && terrainH(740, 0) < SEA - 5, 'open sea 740 m east of home');
    assert.equal(waterAt(740, SEA - 1, 0), SEA, 'you can swim in it');
    assert.equal(waterAt(740, SEA + 1, 0), null, '…but not above the surface');
    assert.ok(beachK(740, 0, terrainH(740, 0)) > 0.9, 'the sea floor is sand');
    let lo = 0, hi = 0;
    for (let x = -4000; x <= 4000; x += 100) for (let z = -4000; z <= 4000; z += 100) { if (Math.hypot(x, z) < OCEAN_START) continue; if (terrainH(x, z) < SEA) lo++; else hi++; }
    assert.ok(lo > 0.2 * (lo + hi) && hi > 0.4 * (lo + hi), `big seas and still mostly land (${lo} sea, ${hi} land)`);
    loadWorld(null);
    assert.equal(WORLD_GEN.oceans, true, 'a new world gets oceans');
    assert.equal(worldState().oceans, true, 'and saves it');
    loadWorld({});
    assert.equal(WORLD_GEN.oceans, false, 'an old save without the flag keeps its old terrain');
    assert.equal(terrainH(3000, -2500), before);
  } finally { WORLD_GEN.oceans = false; }
});
