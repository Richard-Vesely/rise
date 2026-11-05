import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS } from '../../shared/data/index.js';
import { NET } from '../../shared/net/net.js';
import { Vec3 } from '../../shared/vec3.js';
import { MOBS, mobs, spawnMob, updateMobs, updateSpawns, hurtMob } from '../../shared/sim/mobs.js';
import { DRAGON_CX, DRAGON_DEN, DRAGON_SHRINE, isDragon } from '../../shared/world/dragon-land.js';
import { terrainH, shrineOf, biomeAt, pondOf, lakeOf, volcanoOf } from '../../shared/world/terrain.js';
import { bkey, blocks, ruinsBuilt, ruinsOpened } from '../../shared/world/state.js';
import { buildStructure, structuresNear } from '../../shared/world/structures.js';
import { worldState, loadWorld } from '../../shared/world/save.js';

let target, hits;
beforeEach(() => {
  mobs.length = 0; blocks.clear(); ruinsBuilt.clear(); ruinsOpened.clear();
  NET.mode = 'sp'; NET.client = false; NET.killer = null;
  target = { pos: new Vec3(DRAGON_CX, 0, -69), alive: true, creative: false, pid: null };
  hits = []; NET.targets = () => [target]; NET.spawnCenter = () => target.pos;
  NET.hurtLocal = (dmg) => hits.push(dmg); NET.localLoot = () => {};
});
const step = (n) => { for (let i = 0; i < n; i++) updateMobs(0.05, 1); };

test('new dimension has dry, flat entrances; the old shrines are unchanged', () => {
  assert.equal(isDragon(DRAGON_CX), true);
  assert.equal(isDragon(0), false);
  assert.equal(shrineOf(DRAGON_CX), DRAGON_SHRINE);
  assert.equal(shrineOf(0).x, 0); assert.equal(shrineOf(40000).mark, true);
  for (const z of [0, -14, -50, -72, -90]) {
    assert.equal(terrainH(DRAGON_CX, z), 0);
    assert.equal(biomeAt(DRAGON_CX, z), 'volcanic');
    assert.equal(pondOf(DRAGON_CX, z), null); assert.equal(lakeOf(DRAGON_CX, z), null);
    assert.equal(volcanoOf(DRAGON_CX, z), null);
  }
  assert.ok(terrainH(DRAGON_CX + 250, 0) > 10);
});
test('cave has a clear walkable entrance, rock walls, roof, and known blocks', () => {
  assert.deepEqual(structuresNear(DRAGON_CX, 0, 110), [DRAGON_DEN]);
  buildStructure(DRAGON_DEN);
  for (let z = -50; z >= -76; z--) for (let y = 0; y < 4; y++) assert.equal(blocks.has(bkey(DRAGON_CX, y, z)), false);
  assert.equal(blocks.get(bkey(DRAGON_CX + 19, 0, -72)), 'basalt');
  assert.ok(blocks.has(bkey(DRAGON_CX, 12, -72)), 'roof over dragon');
  for (const id of blocks.values()) assert.ok(ITEMS[id], id);
});
test('one dragon spawns in its cave, even after repeated spawn checks', () => {
  buildStructure(DRAGON_DEN);
  for (let i = 0; i < 10; i++) updateSpawns(4, 0);
  assert.equal(mobs.length, 1); assert.equal(mobs[0].type, 'dragon');
  assert.equal(mobs[0].hp, 300);
  for (const [id] of MOBS.dragon.drops) assert.ok(ITEMS[id]);
});
test('dragon warns before attacking, deals damage, then respects its cooldown', () => {
  buildStructure(DRAGON_DEN);
  const m = spawnMob('dragon', DRAGON_CX, -72);
  step(1); assert.ok(m.windup > 0); assert.deepEqual(hits, []);
  step(8); assert.deepEqual(hits, [65]);
  step(20); assert.deepEqual(hits, [65]);
  step(15); assert.equal(hits.length, 2);
});
test('dodging, creative mode, walls and the return portal keep players safe', () => {
  const m = spawnMob('dragon', DRAGON_CX, -72);
  step(1); target.pos.z = -65; step(17); assert.deepEqual(hits, [], 'dodge the warned bite');
  target.pos.z = -69; target.creative = true; step(70); assert.deepEqual(hits, [], 'creative');
  target.creative = false; m.pos.set(DRAGON_CX, 0, -72);
  for (let y = 0; y < 5; y++) for (let x = -5; x <= 5; x++) blocks.set(bkey(DRAGON_CX + x, y, -71), 'basalt');
  step(70); assert.deepEqual(hits, [], 'solid wall');
  blocks.clear(); target.pos.set(DRAGON_CX, 0.45, 0); step(200);
  assert.deepEqual(hits, [], 'portal');
  assert.ok(Math.hypot(m.pos.x - DRAGON_CX, m.pos.z + 72) < 13, 'stays in cave');
});
test('dragon pursues a player inside its cave and can be defeated permanently', () => {
  buildStructure(DRAGON_DEN); target.pos.z = -61;
  const m = spawnMob('dragon', DRAGON_CX, -72);
  step(40); assert.ok(m.pos.z > -70, 'approaches player');
  assert.equal(hurtMob(m, 300, 0), true); assert.equal(m.dead, true);
  assert.ok(ruinsOpened.has(DRAGON_DEN.key));
  const saved = JSON.parse(JSON.stringify(worldState()));
  blocks.clear(); ruinsBuilt.clear(); ruinsOpened.clear(); mobs.length = 0;
  loadWorld(saved); updateSpawns(4, 0);
  assert.ok(ruinsOpened.has(DRAGON_DEN.key)); assert.equal(mobs.length, 0);
  assert.ok(blocks.has(bkey(DRAGON_CX, 12, -72)), 'saved cave remains');
});
