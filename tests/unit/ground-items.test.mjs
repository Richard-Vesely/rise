// Unit tests of items lying on the ground (shared/sim/ground-items.js): Minecraft-like pickup delays,
// floating in water, burning in lava, popping out of a block placed on them, and keeping wear + age in saves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { NET } from '../../shared/net/net.js';
import { DESPAWN, DROP_DELAY, THROW_DELAY, FLOAT, groundItems, inLava, spawnGroundItem, updateGroundItems } from '../../shared/sim/ground-items.js';
import { waterAt } from '../../shared/world/nature.js';
import { loadWorld, worldState } from '../../shared/world/save.js';
import { bkey, blocks } from '../../shared/world/state.js';
import { terrainH, volcanoOf } from '../../shared/world/terrain.js';
import { groundHeight } from '../../shared/world/voxels.js';

const V0 = { x: 0, y: 0, z: 0 };
// Runs fn with NET.op collecting the ops (and NET.client set as asked), then cleans up.
function withNet(fn, client = false) {
  const ops = [], oldOp = NET.op, oldClient = NET.client;
  NET.op = (o) => ops.push(o);
  NET.client = client;
  try { return fn(ops); } finally { NET.op = oldOp; NET.client = oldClient; groundItems.length = 0; }
}
const run = (secs, dt = 0.05) => { for (let t = 0; t < secs; t += dt) updateGroundItems(dt); };

test('pickup delays are Minecraft\'s: a mined block 0.5 s, a thrown item 2 s, despawn after 5 min', () => {
  assert.equal(DROP_DELAY, 0.5);
  assert.equal(THROW_DELAY, 2);
  assert.equal(DESPAWN, 300);
  withNet(() => {
    spawnGroundItem('stone', 1, { x: 0, y: 30, z: 0 }, V0);
    assert.equal(groundItems[0].delay, DROP_DELAY);
  });
});

test('an item in a lake sinks a little, floats up to the surface and stays there', () => {
  let spot = null;
  for (let d = 20; d < 1500 && !spot; d += 6) for (let a = 0; a < 6.28 && !spot; a += 0.2) {
    const x = Math.cos(a) * d, z = Math.sin(a) * d, lv = waterAt(x, -1000, z);
    if (lv !== null && terrainH(x, z) < lv - 1.5) spot = { x, z, lv };
  }
  assert.ok(spot, 'found deep water');
  withNet((ops) => {
    spawnGroundItem('log', 1, { x: spot.x, y: spot.lv + 1.5, z: spot.z }, V0, 0, 'w1');
    const it = groundItems[0];
    let lowest = Infinity;
    for (let t = 0; t < 4; t += 0.05) { updateGroundItems(0.05); lowest = Math.min(lowest, it.pos.y); }
    assert.ok(lowest < spot.lv - FLOAT - 0.1, `dipped under the surface first (${lowest.toFixed(2)})`);
    assert.ok(Math.abs(it.pos.y - (spot.lv - FLOAT)) < 0.05, `floats at the surface (${it.pos.y.toFixed(2)} vs ${spot.lv.toFixed(2)})`);
    assert.equal(it.vel.y, 0, 'settled, so it can merge with others');
    assert.ok(it.pos.y > groundHeight(spot.x, spot.z) + 1, 'not lying on the lake bed');
    assert.equal(ops.filter((o) => o[0] === 'gx').length, 0);
  });
});

test('an item in the lava of a volcano crater burns (the world holder decides)', () => {
  let v = null;
  for (let cx = 0; cx < 8 && !v; cx++) for (let cz = 0; cz < 8 && !v; cz++) v = volcanoOf(cx * 1100 + 550, cz * 1100 + 550);
  assert.ok(v, 'found a volcano');
  const y = terrainH(v.x, v.z);
  assert.ok(inLava(v.x, y + 0.1, v.z) && !inLava(v.x, y + 2, v.z) && !inLava(v.x + 30, y, v.z));
  withNet((ops) => {
    spawnGroundItem('log', 3, { x: v.x, y: y + 2, z: v.z }, V0, 0, 'lava1');
    run(1.5);
    assert.equal(groundItems.length, 0, 'gone');
    assert.deepEqual(ops.filter((o) => o[0] === 'gx'), [['gx', 'lava1', 0]]);
  });
  withNet((ops) => { // a joined player only shows it burning and waits for the holder's 'gx'
    spawnGroundItem('log', 3, { x: v.x, y: y + 2, z: v.z }, V0, 0, 'lava2');
    run(1.5);
    assert.equal(groundItems.length, 1);
    assert.ok(groundItems[0].burnt && groundItems[0].n === 3);
    assert.equal(ops.filter((o) => o[0] === 'gx').length, 0);
  }, true);
});

test('an item falling from high up lands on the ground, not inside it (also with long frames)', () => {
  for (const dt of [1 / 60, 0.05, 0.1]) {
    withNet(() => {
      const x = 8.6, z = 31.3, g = groundHeight(x, z);
      spawnGroundItem('torch', 1, { x, y: g + 40, z }, V0, 0, 'fall');
      run(4, dt);
      assert.ok(Math.abs(groundItems[0].pos.y - g) < 0.01, `dt ${dt}: y ${groundItems[0].pos.y} vs ground ${g}`);
    });
  }
});

test('a block placed on an item pushes the item up on top of it', () => {
  withNet(() => {
    const x = 37, z = 41, y = Math.floor(groundHeight(x + 0.5, z + 0.5));
    spawnGroundItem('apple', 1, { x: x + 0.5, y: y + 0.5, z: z + 0.5 }, V0, 0, 'b1');
    run(0.5);
    const k = bkey(x, y, z);
    blocks.set(k, 'cobble');
    try {
      run(0.5);
      assert.equal(Math.floor(groundItems[0].pos.y + 0.01), y + 1);
    } finally { blocks.delete(k); }
  });
});

test('the save keeps the wear of a tool on the ground and how long it has been lying there; old saves still load', () => {
  withNet(() => {
    spawnGroundItem('iron_axe', 1, { x: 5, y: 30, z: 5 }, V0, 0, 's1', 40);
    spawnGroundItem('dirt', 7, { x: 6, y: 30, z: 5 }, V0, 0, 's2');
    groundItems[0].age = 120.4;
    const ground = worldState().ground;
    assert.deepEqual(ground.map((g) => [g.gid, g.w, g.age]), [['s1', 40, 120], ['s2', undefined, 0]]);
    groundItems.length = 0;
    loadWorld({ ground: [...ground, { gid: 'old', id: 'stone', n: 3, x: 1, y: 30, z: 1 }, { gid: 'bad', id: 'dirt', n: 1, x: 1, y: 30, z: 1, age: 9999 }] });
    const by = Object.fromEntries(groundItems.map((g) => [g.gid, g]));
    assert.equal(by.s1.w, 40);
    assert.equal(by.s1.age, 120);
    assert.equal(by.old.n, 3);
    assert.equal(by.old.age, 0);
    assert.equal(by.bad.age, DESPAWN);
  });
});
