import test from 'node:test';
import assert from 'node:assert/strict';
import { NET } from '../../shared/net/net.js';
import { terrainH } from '../../shared/world/terrain.js';
import { V, columnDug, digData, getVox, groundHeight, setVox, topY, voxEdits } from '../../shared/world/voxels.js';
import { fillHole } from '../../shared/world/fill-hole.js';
import { fillHoleCommand, updateFillHole } from '../../client/src/world/fill-hole.js';

function reset() { voxEdits.clear(); digData.fill(0); NET.ops = []; NET.mode = 'sp'; NET.ready = false; NET.jail = null; }
function dig(x, z, depth = 2) {
  const top = topY(x, z);
  for (let y = top; y > top - depth; y--) setVox(x, y, z, V.AIR);
}

test('fills the connected excavation, restores the surface and sends normal voxel ops', () => {
  reset();
  dig(80, 80); dig(81, 80, 4); dig(86, 80);
  NET.mode = 'client'; NET.ready = true;
  const result = fillHole(80, 79); // click beside the rim
  assert.equal(result.filled, 6);
  assert.equal(result.columns.length, 2);
  assert.equal(columnDug(80, 80), false);
  assert.equal(columnDug(81, 80), false);
  assert.equal(columnDug(86, 80), true);
  assert.equal(groundHeight(80.5, 80.5), terrainH(80.5, 80.5));
  assert.equal(NET.ops.length, 6);
  assert.ok(NET.ops.every(op => op[0] === 'v' && op[4] !== V.AIR));
  reset();
});

test('keeps existing material and does not regenerate mined ore', () => {
  reset();
  const top = topY(80, 80);
  dig(80, 80, 2);
  setVox(80, top - 2, 80, V.MARBLE);
  fillHole(80, 80);
  assert.equal(getVox(80, top - 1, 80), getVox(80, top, 80));
  assert.equal(getVox(80, top - 2, 80), V.MARBLE);
  reset();
});

test('rejects missing, invalid and oversized holes without partial edits', () => {
  reset();
  assert.ok(fillHole(NaN, 80).error);
  assert.ok(fillHole(80, 80).error);
  for (let x = 80; x < 1105; x++) dig(x, 80, 1);
  assert.ok(fillHole(80, 80).error);
  for (let x = 80; x < 1105; x++) assert.ok(columnDug(x, 80));
  reset();
});

test('chat command accepts Czech variants, consumes the click and lifts the player', () => {
  reset();
  const messages = [], notify = text => messages.push(text);
  const player = { pos: { x: 80.5, y: -20, z: 80.5 }, vel: { y: -3 } };
  const target = { kind: 'vox', cell: [80, topY(80, 80) - 2, 80] };
  assert.equal(fillHoleCommand('ahoj', notify), false);
  assert.ok(fillHoleCommand(' /ZAPLŇ   DÍRU ', notify));
  dig(80, 80);
  // A held button from before opening chat must not select anything.
  assert.ok(updateFillHole(target, { lmb: true }, player, notify));
  assert.ok(columnDug(80, 80));
  updateFillHole(target, {}, player, notify);
  assert.ok(updateFillHole(target, { rmb: true }, player, notify));
  assert.equal(columnDug(80, 80), false);
  assert.ok(player.pos.y > terrainH(80.5, 80.5));
  assert.equal(player.vel.y, 0);
  assert.ok(updateFillHole(target, { rmb: true }, player, notify));
  updateFillHole(target, {}, player, notify);
  assert.equal(updateFillHole(target, {}, player, notify), false);
  assert.ok(messages.at(-1).includes('zaplněná'));
  reset();
});

test('a missed click cancels selection and consumes holding for air, mobs and unbroken terrain', () => {
  reset();
  const messages = [], notify = text => messages.push(text), player = { pos: {}, vel: {} };
  for (const target of [null, { kind: 'mob' }, { kind: 'vox', cell: [80, topY(80, 80), 80] }, { kind: 'ground' }]) {
    fillHoleCommand('/zapln diru', notify);
    updateFillHole(null, {}, player, notify);
    assert.ok(updateFillHole(target, { lmb: true }, player, notify));
    assert.ok(messages.at(-1).includes('výběr zrušen'));
    assert.ok(updateFillHole(target, { lmb: true }, player, notify));
    updateFillHole(null, {}, player, notify);
    assert.equal(updateFillHole(target, { lmb: true }, player, notify), false);
  }
  reset();
});

test('repeated command cancels and jail blocks the command', () => {
  reset();
  const notify = () => {}, player = { pos: {}, vel: {} };
  fillHoleCommand('zapln diru', notify);
  fillHoleCommand('zapln diru', notify);
  assert.equal(updateFillHole(null, { lmb: true }, player, notify), false);
  NET.jail = {};
  assert.ok(fillHoleCommand('zapln diru', notify));
  assert.equal(updateFillHole(null, { lmb: true }, player, notify), false);
  reset();
});
