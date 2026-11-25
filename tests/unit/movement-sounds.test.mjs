import test from 'node:test';
import assert from 'node:assert/strict';
import { WaterSounds } from '../../client/src/audio/movement.js';

const dry = { x: 0, y: 0, z: 0, wet: false, deep: false, swimming: false };
const deep = { ...dry, wet: true, deep: true, swimming: true, moving: 2 };

test('water entry and exit play once, including slow entry, with louder falling splashes', () => {
  const sounds = new WaterSounds();
  assert.deepEqual(sounds.update(0.05, dry), []);
  const slow = sounds.update(0.05, { ...dry, wet: true, moving: 0.3 });
  assert.equal(slow[0].type, 'splash');
  assert.ok(slow[0].size >= 0.35 && slow[0].size < 0.5);
  assert.deepEqual(sounds.update(0.05, { ...dry, wet: true }), []);
  assert.deepEqual(sounds.update(0.05, dry), [{ type: 'exit' }]);
  assert.deepEqual(sounds.update(0.05, dry), []);
  const fast = sounds.update(0.05, { ...dry, wet: true, fallSpeed: 30 });
  assert.equal(fast[0].size, 1.4);
});

test('swimming strokes have a steady cadence without walking or touching the bottom', () => {
  const sounds = new WaterSounds();
  sounds.update(0.05, deep);
  const events = Array.from({ length: 60 }, () => sounds.update(0.05, deep)).flat();
  assert.ok(events.length >= 3 && events.length <= 5);
  assert.ok(events.every(event => event.type === 'swim'));
  for (let i = 0; i < 50; i++) assert.deepEqual(sounds.update(0.05, { ...deep, swimming: false }), []);
  assert.deepEqual(sounds.update(0.05, deep), []); // no stale stroke immediately on resuming
});

test('loading, teleporting, flying, shallow wading and paused frames do not emit extra strokes', () => {
  const sounds = new WaterSounds();
  assert.deepEqual(sounds.update(0.05, deep), []); // load under water
  assert.deepEqual(sounds.update(0.05, { ...dry, x: 40 }), []); // teleport to shore
  assert.deepEqual(sounds.update(0.05, { ...deep, x: 40, flying: true }), []);
  assert.deepEqual(sounds.update(0.05, { ...dry, x: 40, flying: true }), []);
  for (const dt of [0, -1, NaN, Infinity]) assert.deepEqual(sounds.update(dt, deep), []);
  sounds.update(0.05, { ...deep, x: 40, deep: false });
  for (let i = 0; i < 30; i++) assert.deepEqual(sounds.update(0.05, { ...deep, x: 40, deep: false }), []);
  // A slow frame never catches up by playing a burst of many strokes.
  assert.ok(sounds.update(5, { ...deep, x: 40 }).length <= 1);
});
