import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS } from '../../shared/data/index.js';
import { NET } from '../../shared/net/net.js';
import { Vec3 } from '../../shared/vec3.js';
import { MOBS, mobs, spawnMob, updateMobs, updateSpawns, hurtMob, killMob } from '../../shared/sim/mobs.js';
import { dragonCycle, loadDragonCycle, DRAGON_RESPAWN_MS, DRAGON_VICTORY } from '../../shared/world/dragon-cycle.js';
import { dragonNet, dragonFirePosition } from '../../shared/sim/dragon.js';
import { others, updateRoom } from '../../shared/net/room.js';
import { DRAGON_CX, DRAGON_DEN, DRAGON_SHRINE, isDragon } from '../../shared/world/dragon-land.js';
import { terrainH, shrineOf, biomeAt, pondOf, lakeOf, volcanoOf } from '../../shared/world/terrain.js';
import { bkey, blocks, ruinsBuilt, ruinsOpened } from '../../shared/world/state.js';
import { buildStructure, structuresNear } from '../../shared/world/structures.js';
import { worldState, loadWorld } from '../../shared/world/save.js';

let target, hits;
beforeEach(() => {
  mobs.length = 0; blocks.clear(); ruinsBuilt.clear(); ruinsOpened.clear();
  loadDragonCycle(0);
  NET.mode = 'sp'; NET.client = false; NET.killer = null;
  target = { pos: new Vec3(DRAGON_CX, 0, -52), alive: true, creative: false, pid: null };
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
  assert.equal(loot.get('markorite'), 2 * ITEMS.markorite.stack); assert.equal(loot.get('gold_ingot'), 32);
  assert.equal(loot.get('shard'), 24); assert.equal(loot.get('markapple'), 10);
  assert.equal(hurtMob(m, 1, 0), false);
  killMob(m, true);
  assert.equal(loot.get('markorite'), 128, 'dead dragon does not award treasure again');
});

test('dragon treasure goes to the connected killer instead of the local player', (t) => {
  NET.killer = 'dragon-slayer';
  const give = t.mock.method(NET, 'give', () => {});
  const local = t.mock.method(NET, 'localLoot', () => {});
  const send = t.mock.method(NET, 'sendTo', () => {});
  const m = spawnMob('dragon', DRAGON_CX, -72);
  hurtMob(m, m.hp, 0);
  assert.equal(local.mock.callCount(), 0);
  assert.equal(give.mock.callCount(), 10);
  assert.ok(give.mock.calls.every((c) => c.arguments[0] === 'dragon-slayer'));
  assert.ok(give.mock.calls.some((c) => c.arguments[1] === 'markorite_sword' && c.arguments[2] === 1));
  assert.ok(give.mock.calls.some((c) => c.arguments[1] === 'markorite' && c.arguments[2] === 128));
  assert.deepEqual(send.mock.calls[0].arguments, ['dragon-slayer', ['toast', DRAGON_VICTORY]]);
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
  assert.equal(mobs[0].hp, 300);
  for (const [id] of MOBS.dragon.drops) assert.ok(ITEMS[id]);
});

test('brutal dragon closes distance at 18 m/s and keeps moving after launch', () => {
  target.pos.z = 28;
  const m = spawnMob('dragon', DRAGON_CX, -72);
  step(20);
  assert.ok(m.vel.length() > 17 && m.vel.length() <= 18);
  assert.ok(m.pos.z > -58, 'outpaces a sprinting player');
  m.pos.set(DRAGON_CX, 0, -72); m.vel.set(0, 0, 0); target.pos.z = -52;
  step(16); const z = m.pos.z;
  step(6); assert.ok(m.pos.z > z + 1, 'does not freeze throughout a fireball flight');
});
test('fireball warns, locks its aim, travels, then damages once at range', () => {
  target.pos.z = -52;
  const m = spawnMob('dragon', DRAGON_CX, -72);
  step(1); const c = m.dragonCast;
  assert.equal(m.hp, 300); assert.equal(c.charge, 0.75); assert.equal(c.to.z, -52);
  step(18); assert.deepEqual(hits, [], 'warning alone deals no damage');
  assert.ok(m.dragonCast.t < c.charge + c.flight);
  step(24); assert.deepEqual(hits, [44]);
  step(5); assert.deepEqual(hits, [44], 'one hit per explosion');
});

test('an early sidestep followed by standing still is tracked and hit', () => {
  const m = spawnMob('dragon', DRAGON_CX, -72);
  step(1); target.pos.x += 5; step(5);
  assert.equal(m.dragonCast.to.x, target.pos.x, 'tracks during early charge');
  step(38); assert.deepEqual(hits, [44]);
});

test('aim locks before launch, so a late committed dodge still works', () => {
  const m = spawnMob('dragon', DRAGON_CX, -72);
  step(15); const c = m.dragonCast, aim = c.to.x;
  target.pos.x += 5; step(25);
  assert.equal(c.to.x, aim, 'cannot home after the lock');
  assert.deepEqual(hits, []);
});

test('walls stop aiming and also stop a fireball already in flight', () => {
  target.pos.z = -52;
  const wall = () => { for (let x = -5; x <= 5; x++) for (let y = 0; y < 9; y++) blocks.set(bkey(DRAGON_CX + x, y, -62), 'basalt'); };
  const m = spawnMob('dragon', DRAGON_CX, -72); wall();
  step(30); assert.equal(m.dragonCast, undefined); assert.deepEqual(hits, []);
  blocks.clear(); step(1); assert.ok(m.dragonCast);
  wall(); step(50); assert.deepEqual(hits, [], 'wall intercepts the shot');
});

test('half-health rage speeds the warning up but leaves time to dodge', () => {
  const m = spawnMob('dragon', DRAGON_CX, -72); m.hp = 150;
  step(1); assert.equal(m.dragonCast.charge, 0.55); assert.equal(m.dragonCast.damage, 55);
  step(9); target.pos.x += 5; step(24); assert.deepEqual(hits, []);
});

test('standing directly underneath triggers a warned radial stomp and nonzero knockback', (t) => {
  target.pos.z = -72;
  const hurt = t.mock.method(NET, 'hurtLocal', (dmg) => hits.push(dmg));
  const m = spawnMob('dragon', DRAGON_CX, -72, 4);
  step(1); assert.ok(m.dragonStomp); assert.equal(m.dragonCast, undefined);
  step(14); assert.deepEqual(hits, [], 'time to run out');
  step(3); assert.deepEqual(hits, [95]);
  const [, x, z] = hurt.mock.calls[0].arguments;
  assert.ok(Math.hypot(x, z) > 0.99, 'armor and knockback also work at the exact center');
  step(20); assert.deepEqual(hits, [95], 'only one hit per stomp');
});

test('leaving the stomp circle avoids it and a solid floor blocks it', () => {
  target.pos.z = -72;
  const m = spawnMob('dragon', DRAGON_CX, -72, 4);
  step(1); target.pos.x += 6; step(22);
  assert.deepEqual(hits, []);
  m.dragonStomp = null; m.dragonStompCd = 0; target.pos.x = DRAGON_CX; m.pos.y = 4;
  blocks.set(bkey(DRAGON_CX, 2, -72), 'basalt'); step(24);
  assert.deepEqual(hits, [], 'does not strike through the floor');
});

test('landing remains a melee opening, then close camping is punished again', () => {
  target.pos.z = -72;
  const m = spawnMob('dragon', DRAGON_CX, -72); m.dragonRest = 2.5;
  step(35); assert.equal(m.dragonStomp, undefined); assert.deepEqual(hits, []);
  step(24); assert.ok(m.dragonStomp, 'stomp returns after the rest window');
});

test('the third volley cancels a pending stomp so the landing opening stays safe', () => {
  const m = spawnMob('dragon', DRAGON_CX, -72); m.dragonShots = 2;
  step(23); target.pos.set(m.pos.x, 0, m.pos.z);
  step(1); assert.ok(m.dragonStomp);
  step(12); assert.ok(m.dragonRest > 0); assert.equal(m.dragonStomp, null);
  step(35); assert.deepEqual(hits, []);
});

test('every second volley covers both sideways dodge lanes', () => {
  const m = spawnMob('dragon', DRAGON_CX, -72); m.dragonShotId = 1;
  step(1); const c = m.dragonCast;
  assert.equal(c.extra.length, 2);
  const centers = [c, ...c.extra].map((s) => s.to.x).sort((a, b) => a - b);
  assert.deepEqual(centers, [DRAGON_CX - 4.8, DRAGON_CX, DRAGON_CX + 4.8]);
  step(15); target.pos.x += 4.8; step(24);
  assert.deepEqual(hits, [44], 'the side fireball catches the old sideways dodge');
});

test('overlapping fan explosions damage a player only once per volley', () => {
  const m = spawnMob('dragon', DRAGON_CX, -72); m.dragonShotId = 1;
  step(15); target.pos.x += 2.4; step(24);
  assert.deepEqual(hits, [44]);
});

test('three shots lead to a short landing with no attacks', () => {
  target.pos.z = -52;
  const m = spawnMob('dragon', DRAGON_CX, -72);
  let steps = 0;
  while (!(m.dragonRest > 0) && steps++ < 400) step(1);
  assert.ok(m.dragonRest > 2.4); assert.equal(hits.length, 3);
  assert.equal(m.dragonCast, null);
  step(35); assert.equal(hits.length, 3); assert.equal(m.dragonCast, null);
  assert.ok(m.pos.y < 0.2, 'lands low enough for a sword');
  step(24); assert.ok(m.dragonCast, 'returns to the next attack cycle');
});

test('remote fireball damage uses the existing message and a unit knockback for armor', (t) => {
  target.pos.z = -52; target.pid = 'fighter';
  const send = t.mock.method(NET, 'sendTo', () => {});
  spawnMob('dragon', DRAGON_CX, -72); step(43);
  assert.equal(send.mock.callCount(), 1);
  assert.deepEqual(send.mock.calls[0].arguments, ['fighter', ['dmg', 44, 0, 1]]);
  assert.deepEqual(hits, []);
});

test('blast respects nearby players, creative mode, death and cover independently', (t) => {
  target.pos.z = -52;
  const extra = (pid, x, options = {}) => ({ pid, pos: new Vec3(x, 0, -52), alive: true, creative: false, ...options });
  const targets = [target, extra('nearby', DRAGON_CX + 1), extra('covered', DRAGON_CX - 2),
    extra('creative', DRAGON_CX + 1, { creative: true }), extra('dead', DRAGON_CX + 1, { alive: false })];
  NET.targets = () => targets;
  const send = t.mock.method(NET, 'sendTo', () => {});
  spawnMob('dragon', DRAGON_CX, -72); step(1);
  for (let y = 0; y < 4; y++) blocks.set(bkey(DRAGON_CX - 1, y, -52), 'basalt');
  step(43);
  assert.deepEqual(hits, [44]);
  assert.deepEqual(send.mock.calls.map((c) => c.arguments[0]), ['nearby']);
});

test('killing the dragon cancels its unfinished fireball', () => {
  const m = spawnMob('dragon', DRAGON_CX, -72); step(1);
  assert.ok(m.dragonCast);
  hurtMob(m, 300, 0); step(50);
  assert.deepEqual(hits, []);
});

test('creative players, death and leaving the dimension cancel dangerous casts', () => {
  const m = spawnMob('dragon', DRAGON_CX, -72);
  step(1); assert.ok(m.dragonCast);
  target.creative = true; step(70); assert.equal(m.dragonCast, null); assert.deepEqual(hits, []);
  target.creative = false; step(1); target.alive = false; step(50); assert.deepEqual(hits, []);
  target.alive = true; step(1); target.pos.set(0, 0, 0); step(50);
  assert.equal(m.dragonCast, null); assert.equal(m.aggro, false); assert.deepEqual(hits, []);
});

test('creative bystanders cannot shield another player from the dragon', () => {
  target.creative = true;
  const remote = { pos: new Vec3(DRAGON_CX, 0, -52), alive: true, creative: false, pid: 'other' };
  NET.targets = () => [target, remote];
  const m = spawnMob('dragon', DRAGON_CX, -72); step(1);
  assert.equal(m.dragonCast.to.z, remote.pos.z);
});

test('a lethal fireball still heals the dragon, surviving hits do not', (t) => {
  target.pos.z = -52;
  const m = spawnMob('dragon', DRAGON_CX, -72); m.hp = 100;
  t.mock.method(NET, 'hurtLocal', () => { target.alive = false; });
  step(43); assert.equal(m.hp, 300);
});

test('the fireball arc and landing state are serialized for connected players', () => {
  target.pos.z = -52;
  const m = spawnMob('dragon', DRAGON_CX, -72); step(1);
  const state = JSON.parse(JSON.stringify(dragonNet(m)));
  assert.equal(state.cast.to.z, -52); assert.equal(state.cast.radius, 3.2);
  const mid = dragonFirePosition(state.cast, state.cast.charge + state.cast.flight / 2);
  assert.equal(mid.z, (state.cast.from.z + state.cast.to.z) / 2); assert.ok(mid.y > state.cast.to.y);
});

test('room broadcasts the full fire warning in the optional mob snapshot field', () => {
  target.pos.z = -52;
  spawnMob('dragon', DRAGON_CX, -72); step(1);
  const messages = [];
  others.set('watcher', { pid: 'watcher', name: 'Watcher', conn: { open: true, send: (msg) => messages.push(JSON.parse(JSON.stringify(msg))) } });
  NET.ops = []; NET.mobT = 0; NET.poseT = 1; NET.kvT = 1;
  try { updateRoom(0.05); } finally { others.clear(); }
  const snapshot = messages.find((msg) => msg[0] === 'mobs')[3][0];
  assert.equal(snapshot[1], 'dragon'); assert.equal(snapshot[6], 300);
  assert.equal(snapshot[12].cast.to.z, -52); assert.equal(snapshot[12].cast.charge, 0.75);
  assert.equal(snapshot[12].rest, 0);
});

test('dragon defeat saves the full escape time and allows one new fight afterwards', (t) => {
  let now = 1800000000000;
  t.mock.method(Date, 'now', () => now);
  buildStructure(DRAGON_DEN); target.pos.z = -61;
  const m = spawnMob('dragon', DRAGON_CX, -72);
  step(1); assert.ok(m.dragonCast, 'prepares a ranged attack');
  assert.equal(hurtMob(m, 100, 0), true); assert.equal(m.dead, false);
  step(11);
  assert.equal(hurtMob(m, 200, 0), true); assert.equal(m.dead, true);
  assert.ok(ruinsOpened.has(DRAGON_DEN.key));
  assert.equal(dragonCycle.respawnAt, now + DRAGON_RESPAWN_MS);
  const saved = JSON.parse(JSON.stringify(worldState()));
  blocks.clear(); ruinsBuilt.clear(); ruinsOpened.clear(); mobs.length = 0;
  loadWorld(saved); updateSpawns(4, 0);
  assert.ok(ruinsOpened.has(DRAGON_DEN.key)); assert.equal(mobs.length, 0);
  now += DRAGON_RESPAWN_MS - 1;
  updateSpawns(4, 0); assert.equal(mobs.length, 0, 'no dragon before the deadline');
  now++;
  for (let i = 0; i < 5; i++) updateSpawns(4, 0);
  assert.equal(mobs.length, 1); assert.equal(mobs[0].hp, 300);
  const loot = t.mock.method(NET, 'give', () => {});
  NET.killer = 'next-player';
  hurtMob(mobs[0], 300, 0);
  assert.ok(loot.mock.calls.some((c) => c.arguments[0] === 'next-player' && c.arguments[1] === 'markorite' && c.arguments[2] === 128));
  assert.equal(dragonCycle.respawnAt, now + DRAGON_RESPAWN_MS, 'each victory starts a new escape period');
  assert.ok(blocks.has(bkey(DRAGON_CX, 12, -72)), 'saved cave remains');
});

test('the return deadline runs while everyone is home or offline', (t) => {
  let now = 1800000000000;
  t.mock.method(Date, 'now', () => now);
  buildStructure(DRAGON_DEN);
  hurtMob(spawnMob('dragon', DRAGON_CX, -72), 300, 0);
  const saved = JSON.parse(JSON.stringify(worldState()));
  mobs.length = 0; loadWorld(saved);
  target.pos.set(0, 0, 0);
  now += DRAGON_RESPAWN_MS;
  updateSpawns(4, 0);
  assert.ok(!mobs.some((m) => m.type === 'dragon'), 'waits until someone visits the cave');
  mobs.length = 0;
  target.pos.set(DRAGON_CX, 0, -69);
  updateSpawns(4, 0);
  assert.equal(mobs.filter((m) => m.type === 'dragon').length, 1);
});

test('old cleared saves can host another dragon and new worlds reset the deadline', () => {
  buildStructure(DRAGON_DEN); ruinsOpened.add(DRAGON_DEN.key);
  const saved = JSON.parse(JSON.stringify(worldState())); delete saved.dragonRespawnAt;
  dragonCycle.respawnAt = Date.now() + DRAGON_RESPAWN_MS;
  loadWorld(saved); updateSpawns(4, 0);
  assert.equal(mobs.length, 1); assert.equal(mobs[0].type, 'dragon');
  dragonCycle.respawnAt = Date.now() + DRAGON_RESPAWN_MS;
  loadWorld(null); assert.equal(dragonCycle.respawnAt, 0);
});
