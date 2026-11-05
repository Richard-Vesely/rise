// Unit tests of the rules layer (shared/): it must import in Node (no DOM, no Three.js) and keep Marek's world.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, RECIPES, BLOCKS, KITCHEN, COOKING, FUEL, CROPS, smeltResult } from '../../shared/data/index.js';
import { terrainH, biomeAt, biomeWeights, shrineDist } from '../../shared/world/terrain.js';
import { naturalAt, topY, V } from '../../shared/world/voxels.js';
import { structuresNear } from '../../shared/world/structures.js';

test('data tables are complete (counts from Marek\'s version 2778d1b)', () => {
  // + 5 futuristických bloků (technický a bílý panel, 3 neony; shared/data/tech.js) + luk a šíp (2 předměty, 2 recepty)
  // + 13 vozidel a dílů (kolo, lodě, hydroplán, garáž a vylepšení; shared/data/tech.js)
  assert.equal(Object.keys(ITEMS).length, 360 + 5 + 2 + 13);
  assert.equal(RECIPES.length, 262 + 5 + 2 + 13);
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

test('terrain and biomes: expanded deserts preserve the starting area and Mark dimension', () => {
  const pts = [[0, 0, 0, 'meadow'], [14, 14, 0.085344, 'meadow'], [100, -50, 1.498240, 'desert'], [523, 911, -1.892520, 'cherry'],
    [-1200, 300, -3.797062, 'mushroom'], [3000, -2500, -3.141269, 'meadow'], [20500, 40, 7.087566, 'meadow']];
  for (const [x, z, h, b] of pts) {
    assert.ok(Math.abs(terrainH(x, z) - h) < 1e-5, `terrainH(${x}, ${z}) = ${terrainH(x, z)}`);
    assert.equal(biomeAt(x, z), b);
  }
  assert.equal(shrineDist(40003, 4), 5);
});

test('spawn stays meadow with distinct desert, jungle and cherry areas within 90 metres', () => {
  for (let x = -25; x <= 25; x += 5) for (let z = -25; z <= 25; z += 5) {
    if (Math.hypot(x, z) <= 35) assert.equal(biomeAt(x, z), 'meadow');
  }
  const counts = new Map();
  for (let x = -90; x <= 90; x += 5) for (let z = -90; z <= 90; z += 5) {
    if (Math.hypot(x, z) > 90) continue;
    const b = biomeAt(x, z);
    counts.set(b, (counts.get(b) || 0) + 1);
  }
  for (const b of ['desert', 'jungle', 'cherry']) assert.ok(counts.get(b) >= 10, `${b} has a nearby area, not just one point`);
});

test('biomes retain diversity and valid blends with more desert coverage', () => {
  const counts = new Map();
  let total = 0;
  for (let x = -6000; x <= 6000; x += 80) for (let z = -6000; z <= 6000; z += 80) {
    const w = biomeWeights(x, z);
    assert.ok(w.every(v => Number.isFinite(v) && v >= -1e-12 && v <= 1 + 1e-12));
    assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 1e-12);
    const biome = biomeAt(x, z);
    counts.set(biome, (counts.get(biome) || 0) + 1);
    total++;
  }
  assert.equal(counts.size, 8);
  const desertShare = counts.get('desert') / total;
  assert.ok(desertShare > 0.17 && desertShare < 0.24, `desert coverage: ${desertShare}`);
});

test('underground voxels and structures are deterministic', () => {
  assert.deepEqual([[5, -3, 7], [40, -20, -13], [-100, -30, 250]].map(([x, y, z]) => naturalAt(x, y, z, topY(x, z))), [V.DIRT, V.STONE, V.STONE]);
  assert.equal(naturalAt(0, -48, 0, topY(0, 0)), V.BEDROCK);
  const near = structuresNear(0, 0, 700);
  const count = (t) => near.filter((s) => s.type === t).length;
  // jezero u (-422, -521) vzalo místo 1 tábora, 1 kobky a 2 houbových domků (stavby v jezeře nejsou)
  assert.deepEqual([count('camp'), count('dungeon'), count('tower'), count('temple'), count('hut'), count('mushhouse')], [41, 37, 18, 2, 2, 5]);
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
