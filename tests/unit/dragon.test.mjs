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

test('defeating the dragon delivers guaranteed rare equipment and treasure once', (t) => {
  const loot = new Map();
  t.mock.method(NET, 'localLoot', (m, id, n) => loot.set(id, (loot.get(id) || 0) + n));
  const m = spawnMob('dragon', DRAGON_CX, -72);
  assert.equal(hurtMob(m, m.hp, 0), true);
  for (const slot of ['helmet', 'chestplate', 'leggings', 'boots']) {
    assert.equal(loot.get(`sky_${slot}`), 1, 'complete sky armor set');
  }
  for (const id of ['markorite_sword', 'markorite_pick']) {
    assert.equal(loot.get(id), 1); assert.equal(ITEMS[id].tier, 5);
  }
  assert.equal(loot.get('markorite'), 16); assert.equal(loot.get('gold_ingot'), 16);
  assert.equal(loot.get('shard'), 12); assert.equal(loot.get('markapple'), 5);
  assert.equal(hurtMob(m, 1, 0), false);
  assert.equal(loot.get('markorite'), 16, 'dead dragon does not award treasure again');
});

test('dragon treasure goes to the connected killer instead of the local player', (t) => {
  NET.killer = 'dragon-slayer';
  const give = t.mock.method(NET, 'give', () => {});
  const local = t.mock.method(NET, 'localLoot', () => {});
  const m = spawnMob('dragon', DRAGON_CX, -72);
  hurtMob(m, m.hp, 0);
  assert.equal(local.mock.callCount(), 0);
  assert.equal(give.mock.callCount(), 10);
  assert.ok(give.mock.calls.every((c) => c.arguments[0] === 'dragon-slayer'));
  assert.ok(give.mock.calls.some((c) => c.arguments[1] === 'markorite_sword' && c.arguments[2] === 1));
});

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
  assert.equal(mobs[0].hp, 500);
  for (const [id] of MOBS.dragon.drops) assert.ok(ITEMS[id]);
});
test('dragon warns before attacking, deals damage, then respects its cooldown', () => {
  buildStructure(DRAGON_DEN);
  const m = spawnMob('dragon', DRAGON_CX, -72);
  step(1); assert.ok(m.windup > 0); assert.deepEqual(hits, []);
  step(5); assert.deepEqual(hits, [90]);
  step(11); assert.deepEqual(hits, [90]);
  step(8); assert.equal(hits.length, 2);
});

test('ordinary bite keeps its longer warning and deals 75 damage', () => {
  target.pos.z = -68;
  const m = spawnMob('dragon', DRAGON_CX, -72); m.phase = 0;
  step(1); assert.equal(m.closeAttack, false);
  step(5); assert.deepEqual(hits, [], 'longer warning outside close range');
  step(3); assert.deepEqual(hits, [75]);
});

test('dragon bites a player directly beneath it without invalid knockback', (t) => {
  target.pos.z = -72;
  const m = spawnMob('dragon', DRAGON_CX, -72, 1.6); m.phase = 0;
  const hurt = t.mock.method(NET, 'hurtLocal');
  step(6);
  assert.deepEqual(hits, [90]);
  const [dmg, dx, dz] = hurt.mock.calls[0].arguments;
  assert.equal(dmg, 90); assert.ok(Math.abs(Math.hypot(dx, dz) - 1) < 0.001);
  assert.ok(m.pos.y < 1.6, 'descends for close combat');
});

test('dragon can bite downward from flight but cannot bite through a floor', () => {
  target.pos.set(DRAGON_CX, 0, -72);
  const m = spawnMob('dragon', DRAGON_CX, -72, 5); m.phase = 0;
  step(1); assert.ok(m.windup > 0, 'warns even five metres above player');
  step(5); assert.deepEqual(hits, [90]);
  hits.length = 0; m.pos.set(DRAGON_CX, 5, -72); m.windup = 0; m.cd = 0;
  for (let x = -4; x <= 4; x++) for (let z = -4; z <= 4; z++) blocks.set(bkey(DRAGON_CX + x, 3, -72 + z), 'basalt');
  step(6); assert.deepEqual(hits, [], 'solid ceiling protects player below');
});

test('dragon heals on every lethal local bite, but not on surviving hits', (t) => {
  const m = spawnMob('dragon', DRAGON_CX, -72); m.hp = 120;
  step(6); assert.equal(m.hp, 120, 'surviving a bite does not heal dragon');
  t.mock.method(NET, 'hurtLocal', () => { target.alive = false; });
  for (let i = 0; i < 2; i++) {
    target.alive = true; m.hp = 120; m.cd = 0; m.windup = 0;
    step(6); assert.equal(target.alive, false); assert.equal(m.hp, 500);
  }
});

test('dragon observes a bitten remote player dying even after switching targets', (t) => {
  const victim = { ...target, pid: 'victim' };
  NET.targets = () => [victim, target];
  t.mock.method(NET, 'sendTo', () => {});
  target.pos = new Vec3(DRAGON_CX + 20, 0, -72);
  const m = spawnMob('dragon', DRAGON_CX, -72); m.hp = 100;
  step(6); assert.equal(m.hp, 100, 'waits for death confirmation');
  victim.alive = false; target.pos.set(m.pos.x, 0, m.pos.z + 1);
  step(1); assert.equal(m.hp, 500);
  m.hp = 200; step(1); assert.equal(m.hp, 200, 'same death is not counted twice');
});

test('unrelated or late deaths and escape do not heal the dragon', () => {
  const m = spawnMob('dragon', DRAGON_CX, -72); m.hp = 100;
  target.alive = false; step(1); assert.equal(m.hp, 100);
  target.alive = true; step(6); target.creative = true; step(30);
  assert.equal(m.hp, 100, 'leaving combat does not heal');
  target.alive = false; step(1); assert.equal(m.hp, 100, 'old hit expires');
});

test('dragon closes the old melee gap and descends while pursuing', () => {
  target.pos.z = -62;
  const m = spawnMob('dragon', DRAGON_CX, -72, 2.8); m.phase = 0;
  step(120);
  assert.ok(Math.abs(m.pos.z - target.pos.z) < 3.2, 'reaches stronger bite range');
  assert.ok(m.pos.y < 1, 'hovers low enough to fight on the ground');
  assert.ok(hits.includes(90), 'uses close bite after pursuit');
});

test('close bite can be dodged during its warning', () => {
  spawnMob('dragon', DRAGON_CX, -72);
  step(1); target.pos.z = -67; step(5);
  assert.deepEqual(hits, [], 'moving beyond bite reach avoids damage');
});

test('dragon keeps advancing during bite warnings and follows a moving player', () => {
  const m = spawnMob('dragon', DRAGON_CX, -72); m.phase = 0;
  step(1); assert.ok(m.windup > 0);
  const z = m.pos.z;
  step(2); assert.ok(m.pos.z > z, 'advances while preparing a bite');
  step(60);
  assert.ok(Math.abs(m.pos.z - target.pos.z) < 1.5, 'closes to contact range');
  const nearZ = m.pos.z;
  target.pos.z += 8; step(30);
  assert.ok(m.pos.z > nearZ + 4, 'immediately follows a retreating player');
});

test('dragon follows beyond the old cave leash', () => {
  target.pos.set(DRAGON_CX, 0, -222);
  const m = spawnMob('dragon', DRAGON_CX, -215); m.phase = 0;
  step(10);
  assert.equal(m.aggro, true);
  assert.ok(m.pos.z < -215, 'moves toward player more than 140 m from den');
  const farZ = m.pos.z;
  target.pos.set(0, 0, 0); step(20);
  assert.equal(m.aggro, false, 'does not chase into another dimension');
  assert.ok(m.pos.z > farZ, 'can return toward cave after a long chase');
});

test('close bite damages the connected player through the existing message', (t) => {
  target.pid = 'dragon-fighter';
  const send = t.mock.method(NET, 'sendTo', () => {});
  spawnMob('dragon', DRAGON_CX, -72);
  step(6);
  assert.equal(send.mock.callCount(), 1);
  assert.deepEqual(send.mock.calls[0].arguments, ['dragon-fighter', ['dmg', 90, 0, 1]]);
  assert.deepEqual(hits, []);
});

test('dragon cancels a warned bite when the target dies or moves above reach', () => {
  const m = spawnMob('dragon', DRAGON_CX, -72);
  step(1); target.alive = false; step(5);
  assert.deepEqual(hits, [], 'dead player');
  target.alive = true; target.pos.y = m.pos.y + 10; step(1);
  assert.equal(m.windup, 0, 'no bite across a large height difference');
});
test('dodging, creative mode, walls and leaving the dimension keep players safe', () => {
  const m = spawnMob('dragon', DRAGON_CX, -72);
  step(1); target.pos.z = -65; step(5); assert.deepEqual(hits, [], 'dodge the warned bite');
  target.pos.z = -69; target.creative = true; step(70); assert.deepEqual(hits, [], 'creative');
  target.creative = false; m.pos.set(DRAGON_CX, 0, -72);
  for (let y = 0; y < 5; y++) for (let x = -5; x <= 5; x++) blocks.set(bkey(DRAGON_CX + x, y, -71), 'basalt');
  step(70); assert.deepEqual(hits, [], 'solid wall');
  blocks.clear(); target.pos.set(0, 0.45, 0); step(200);
  assert.deepEqual(hits, [], 'another dimension');
});

test('dragon attacks underneath at the arrival portal and heals after a kill there', (t) => {
  target.pos.set(DRAGON_CX, 0.45, -3);
  const m = spawnMob('dragon', DRAGON_CX, -3, 5); m.hp = 100;
  t.mock.method(NET, 'hurtLocal', (dmg) => { hits.push(dmg); target.alive = false; });
  step(6);
  assert.deepEqual(hits, [90], 'arrival portal must not disable attacks');
  assert.equal(m.hp, 500);
});

test('dragon flies toward arrivals immediately, including creative players', () => {
  buildStructure(DRAGON_DEN);
  target.pos.set(DRAGON_CX, 0.45, -3);
  const m = spawnMob('dragon', DRAGON_CX, -72);
  step(10);
  assert.equal(m.aggro, true); assert.ok(m.pos.z > -72);
  target.creative = true;
  const z = m.pos.z; step(10);
  assert.equal(m.aggro, true); assert.ok(m.pos.z > z);
  assert.deepEqual(hits, []);
});

test('dragon faces the player after moving, even when the player circles behind it', () => {
  const m = spawnMob('dragon', DRAGON_CX, -72);
  for (const [x, z] of [[0, 5], [5, 0], [0, -5], [-5, 0], [0, 5]]) {
    target.pos.set(m.pos.x + x, 0, m.pos.z + z);
    step(1);
    const dx = target.pos.x - m.pos.x, dz = target.pos.z - m.pos.z;
    const facing = (-Math.sin(m.ry) * dx - Math.cos(m.ry) * dz) / Math.hypot(dx, dz);
    assert.ok(facing > 0.9999, 'head points at target, never the back');
  }
});
test('dragon pursues a player inside its cave and can be defeated permanently', () => {
  buildStructure(DRAGON_DEN); target.pos.z = -61;
  const m = spawnMob('dragon', DRAGON_CX, -72);
  step(40); assert.ok(m.pos.z > -70, 'approaches player');
  assert.equal(hurtMob(m, 300, 0), true); assert.equal(m.dead, false);
  step(11);
  assert.equal(hurtMob(m, 200, 0), true); assert.equal(m.dead, true);
  assert.ok(ruinsOpened.has(DRAGON_DEN.key));
  const saved = JSON.parse(JSON.stringify(worldState()));
  blocks.clear(); ruinsBuilt.clear(); ruinsOpened.clear(); mobs.length = 0;
  loadWorld(saved); updateSpawns(4, 0);
  assert.ok(ruinsOpened.has(DRAGON_DEN.key)); assert.equal(mobs.length, 0);
  assert.ok(blocks.has(bkey(DRAGON_CX, 12, -72)), 'saved cave remains');
});
