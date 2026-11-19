// Unit tests of the safe rules (shared/world/safe.js): a chest with a code that can't be mined.
// The code is never stored in clear text, only a per-safe fingerprint in blockMeta (bits 0–2 keep the rotation).
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, ITEMS, RECIPES } from '../../shared/data/index.js';
import { NET } from '../../shared/net/net.js';
import { applyOp } from '../../shared/net/ops.js';
import { loadWorld, worldState } from '../../shared/world/save.js';
import { codeHash, lockSafe, safeLock, safeOpens, safeTakeBlocker, safeWait } from '../../shared/world/safe.js';
import { blockMeta, blocks, chests } from '../../shared/world/state.js';

const K = '5,70,5';
const fresh = (rot = 2) => { blocks.set(K, 'safe'); blockMeta.set(K, rot); chests.delete(K); };

test('the safe is a block and an item, crafted in the backpack from a chest and 3 stones, and can not be mined', () => {
  assert.ok(ITEMS.safe?.block === 'safe' && BLOCKS.safe);
  assert.equal(BLOCKS.safe.locked, true);
  assert.equal(BLOCKS.safe.facing, true);
  assert.ok(!BLOCKS.safe.fixed, 'not "fixed": the owner can still take an empty safe (the server would refuse that)');
  const r = RECIPES.find((x) => x.out === 'safe');
  assert.ok(r && r.w <= 2 && r.h <= 2, 'fits the 2×2 backpack grid');
  assert.deepEqual(r.pat.flat().sort(), ['chest', 'stone', 'stone', 'stone']);
});

test('a new safe takes a 4–8 digit code once and keeps its rotation', () => {
  fresh(3);
  assert.equal(safeLock(K), 0);
  for (const bad of ['123', '123456789', '12a4', '', ' 1234']) assert.equal(lockSafe(K, bad), false, bad);
  assert.equal(safeLock(K), 0);
  assert.equal(lockSafe(K, '4711'), true);
  assert.ok(safeLock(K) > 0);
  assert.equal(blockMeta.get(K) & 3, 3, 'rotation bits stay');
  assert.equal(lockSafe(K, '0000'), false, 'a locked safe can not be locked again with another code');
  assert.equal(lockSafe('1,2,3', '4711'), false, 'only a safe block can be locked');
});

test('only the right code opens it, and the code is not stored in clear text', () => {
  fresh();
  lockSafe(K, '20261021');
  assert.equal(safeOpens(K, '20261021'), true);
  for (const bad of ['20261020', '2026102', '1234', '', 'abcd']) assert.equal(safeOpens(K, bad), false, bad);
  assert.ok(!JSON.stringify(worldState()).includes('20261021'), 'no clear code in the save');
  assert.notEqual(codeHash('1,1,1', '1234'), codeHash('2,1,1', '1234'), 'the same code gives each safe a different fingerprint');
  const h = codeHash(K, '1234');
  assert.ok(Number.isInteger(h) && h >= 1 && h <= 0xffffff);
});

test('the lock syncs as a blockMeta op and survives save and load (old saves need nothing new)', () => {
  fresh(1);
  const sent = [];
  const op = NET.op;
  NET.op = (o) => sent.push(o);
  try { lockSafe(K, '9999'); } finally { NET.op = op; }
  assert.ok(sent.some((o) => o[0] === 'm' && o[1] === 'blockMeta' && o[2] === K), 'locking sends a blockMeta change');
  const meta = blockMeta.get(K);
  blockMeta.delete(K);
  applyOp(['m', 'blockMeta', K, meta]); // another player gets it
  assert.equal(safeOpens(K, '9999'), true);
  const saved = JSON.parse(JSON.stringify(worldState()));
  blocks.delete(K); blockMeta.delete(K);
  loadWorld(saved);
  assert.equal(blocks.get(K), 'safe');
  assert.equal(safeOpens(K, '9999'), true);
});

test('only an empty safe can be taken; wrong tries make you wait longer and longer', () => {
  fresh();
  lockSafe(K, '1234');
  chests.set(K, [{ id: 'iron', n: 3 }, ...Array(26).fill(null)]);
  assert.match(safeTakeBlocker(K), /vyprázdni/);
  chests.set(K, Array(27).fill(null));
  assert.equal(safeTakeBlocker(K), null);
  assert.match(safeTakeBlocker('9,9,9'), /už není/);
  assert.deepEqual([0, 1, 2].map(safeWait), [0, 0, 0]);
  assert.equal(safeWait(3), 5000);
  assert.equal(safeWait(4), 10000);
  assert.equal(safeWait(50), 300000, 'never more than 5 minutes');
  blocks.delete(K); blockMeta.delete(K); chests.delete(K);
});
