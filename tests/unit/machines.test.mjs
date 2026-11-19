// Unit tests of the furnace rules (shared/sim/machines.js), modelled on Minecraft's furnace.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FUEL, SMELT_TIME } from '../../shared/data/index.js';
import { updateFurnaces } from '../../shared/sim/machines.js';
import { blocks, furnaceOf, furnaces } from '../../shared/world/state.js';

const run = (sec) => { for (let t = 0; t < sec; t += 0.05) updateFurnaces(0.05); };
const fresh = (k, slots) => { blocks.set(k, 'furnace'); furnaces.delete(k); const f = furnaceOf(k); f.slots = slots; return f; };

test('furnace smelts with fuel and stops when the input runs out', () => {
  const f = fresh('0,50,0', [{ id: 'iron_ore', n: 2 }, { id: 'coal', n: 1 }, null]);
  run(SMELT_TIME * 2 + 0.2);
  assert.deepEqual(f.slots[2], { id: 'iron', n: 2 });
  assert.equal(f.slots[0], null);
  assert.equal(f.slots[1], null); // jedno uhlí se zapálilo
  assert.ok(f.burn > 0 && f.burn < FUEL.coal); // a hoří dál, i když už nic netaví
});

test('no new fuel is lit while there is nothing to smelt or the output is blocked', () => {
  const f = fresh('1,50,0', [null, { id: 'coal', n: 3 }, null]);
  run(1);
  assert.equal(f.slots[1].n, 3);
  f.slots[0] = { id: 'iron_ore', n: 1 };
  f.slots[2] = { id: 'glass', n: 1 }; // ve výstupu leží něco jiného
  run(1);
  assert.equal(f.slots[1].n, 3);
  assert.equal(f.burn, 0);
});

test('progress runs back when the fuel runs out, and restarts for a different input', () => {
  const f = fresh('2,50,0', [{ id: 'iron_ore', n: 1 }, null, null]);
  f.burn = f.burnMax = SMELT_TIME / 2; // stačí na půl kusu
  run(SMELT_TIME / 2 + 0.1);
  const t0 = f.t;
  assert.ok(t0 > 0);
  run(0.3);
  assert.ok(f.t < t0, 'progress goes back without fuel');
  f.slots[1] = { id: 'coal', n: 1 };
  run(0.2);
  f.slots[0] = { id: 'sand', n: 1 }; // jiná surovina
  run(0.05);
  assert.ok(f.t <= 0.06, 'a different input starts from zero');
});
