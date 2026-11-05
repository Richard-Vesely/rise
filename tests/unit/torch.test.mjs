// Unit tests of the torch rules (shared/world/torch.js), modelled on Minecraft's torch: placement on top and sides
// (never the ceiling) with the look-direction fallback, which blocks hold a torch, popping off as an item, old saves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, RECIPES } from '../../shared/data/index.js';
import { NET } from '../../shared/net/net.js';
import { applyOp } from '../../shared/net/ops.js';
import { groundItems } from '../../shared/sim/ground-items.js';
import { INSTANT, breakTime } from '../../shared/tools.js';
import { loadWorld, worldState } from '../../shared/world/save.js';
import { blockMeta, blocks } from '../../shared/world/state.js';
import {
  TORCH_FLOOR, WALL_DIRS, floorSupport, holdsTorch, legacyTorchMeta, torchBox, torchFlame, torchMeta, torchPlacement, updateTorches,
} from '../../shared/world/torch.js';
import { V, setVox, topY } from '../../shared/world/voxels.js';

const k3 = (x, y, z) => `${x},${y},${z}`;
const put = (x, y, z, type, meta) => { blocks.set(k3(x, y, z), type); if (meta !== undefined) blockMeta.set(k3(x, y, z), meta); };
const wallMeta = (d) => 2 + WALL_DIRS.findIndex((w) => w[0] === d[0] && w[2] === d[2]);
const H = 200; // vysoko na nebi: kolem je jen vzduch, opory stavíme z bloků

test('a torch is not solid, breaks instantly and is easy to craft from coal or charcoal', () => {
  assert.equal(BLOCKS.torch.solid, false);
  assert.ok(breakTime({ hard: BLOCKS.torch.hard }, null) <= INSTANT);
  assert.ok(breakTime({ hard: BLOCKS.torch.hard }, 'wood_pick') <= INSTANT);
  for (const fuel of ['coal', 'charcoal']) {
    const r = RECIPES.find((x) => x.out === 'torch' && x.pat.flat().includes(fuel));
    assert.ok(r && r.n >= 4 && r.w === 1 && r.h === 2, `${fuel} + stick → torches (fits the 2×2 backpack grid)`);
  }
});

test('placement: top of a block = standing, side of a block = on the wall (leaning away)', () => {
  put(500, H - 1, 500, 'cobble');
  assert.equal(torchPlacement(500, H, 500, [0, 1, 0], [0, -1, 0]), TORCH_FLOOR);
  put(520, H, 500, 'cobble'); // zeď na +x od buňky 519
  assert.equal(torchPlacement(519, H, 500, [-1, 0, 0], [1, 0, 0]), wallMeta([1, 0, 0]));
  assert.deepEqual(torchFlame(TORCH_FLOOR), [0, 0.74, 0]);
  const f = torchFlame(wallMeta([1, 0, 0]));
  assert.ok(f[0] > 0 && f[1] > 0.74, 'the flame of a wall torch is near the wall and higher');
  // malý kvádr pro míření: u zdi, ne přes celou buňku
  const b = torchBox(wallMeta([1, 0, 0]));
  assert.ok(b[0] >= 0.6 && b[3] === 1 && b[5] - b[2] < 0.4);
});

test('never on the ceiling; it falls back to the next direction you look along', () => {
  put(540, H + 1, 540, 'cobble'); // jen strop
  assert.equal(torchPlacement(540, H, 540, [0, -1, 0], [0, 1, 0]), null);
  assert.equal(torchPlacement(540, H, 540, [0, -1, 0], [0.6, -0.8, 0]), null);
  put(541, H, 540, 'cobble'); // zeď na +x
  assert.equal(torchPlacement(540, H, 540, [0, -1, 0], [0.7, 0.7, 0]), wallMeta([1, 0, 0]), 'looking up at the wall → the wall');
  assert.equal(torchPlacement(540, H, 540, [0, -1, 0], [-0.6, -0.8, 0]), wallMeta([1, 0, 0]), 'no floor, no wall behind → the wall in front');
  put(540, H - 1, 540, 'cobble'); // teď i podlaha
  assert.equal(torchPlacement(540, H, 540, [0, -1, 0], [-0.6, -0.8, 0]), TORCH_FLOOR, 'looking down → the floor first');
  assert.equal(torchPlacement(540, H, 540, [0, -1, 0], [0.9, -0.3, 0]), wallMeta([1, 0, 0]), 'looking at the wall → the wall first');
});

test('what holds a torch: full blocks, glass, upper slabs, panes on top, the furnace; not lower slabs, stairs, chests', () => {
  let n = 0;
  const at = (type, meta) => { const x = 560 + 3 * n++; put(x, H, 560, type, meta); return x; };
  for (const [type, meta, top, side] of [
    ['cobble', undefined, true, true], ['glass', undefined, true, true], ['cobble_slab', 0, false, false], ['cobble_slab', 4, true, false],
    ['cobble_stairs', 0, false, false], ['glass_pane', 0, true, false], ['chest', undefined, false, false], ['furnace', undefined, true, true],
    ['wood_railing', 1, true, false], ['torch', undefined, false, false], ['campfire', undefined, false, false],
  ]) {
    assert.ok(BLOCKS[type], type);
    const x = at(type, meta);
    assert.equal(holdsTorch(x, H, 560, 'top'), top, `${type} ${meta ?? ''} top`);
    assert.equal(holdsTorch(x, H, 560, [1, 0, 0]), side, `${type} ${meta ?? ''} side`);
  }
});

test('underground: stands on stone, hangs on a stone wall, drops when you dig the floor away', () => {
  const x = 600, z = 600, y = topY(x, z) - 20;
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 2; dy++) setVox(x + dx, y + dy, z + dz, dy === -1 ? V.STONE : V.AIR);
  setVox(x + 2, y, z, V.STONE);
  assert.ok(floorSupport(x, y, z));
  assert.equal(torchPlacement(x + 1, y, z, [-1, 0, 0], [1, 0, 0]), wallMeta([1, 0, 0]));
  put(x, y, z, 'torch', TORCH_FLOOR);
  updateTorches(1);
  assert.equal(blocks.get(k3(x, y, z)), 'torch', 'supported torch stays');
  const before = groundItems.length;
  setVox(x, y - 1, z, V.AIR);
  updateTorches(1);
  assert.equal(blocks.has(k3(x, y, z)), false, 'the torch pops off');
  assert.equal(blockMeta.has(k3(x, y, z)), false);
  const drop = groundItems.slice(before).find((g) => g.id === 'torch');
  assert.ok(drop && drop.n === 1 && Math.abs(drop.pos.x - (x + 0.5)) < 0.5 && Math.abs(drop.pos.z - (z + 0.5)) < 0.5, 'and drops as an item');
});

test('a wall torch pops off when its wall block is removed, a floor torch keeps standing', () => {
  put(700, H, 700, 'cobble');
  put(701, H, 700, 'torch', wallMeta([-1, 0, 0]));
  put(700, H - 1, 702, 'planks');
  put(700, H, 702, 'torch', TORCH_FLOOR);
  updateTorches(1);
  assert.equal(blocks.get('701,200,700'), 'torch');
  blocks.delete('700,200,700');
  updateTorches(1);
  assert.equal(blocks.has('701,200,700'), false);
  assert.equal(blocks.get('700,200,702'), 'torch');
});

test('old saves: torches without a direction learn it once; a floating one stays as it was', () => {
  put(800, H - 1, 800, 'cobble');
  put(800, H, 800, 'torch'); // stará pochodeň na podlaze
  put(811, H, 810, 'cobble');
  put(810, H, 810, 'torch'); // stará pochodeň vedle zdi, ve vzduchu
  put(820, H, 820, 'torch'); // stará pochodeň úplně ve vzduchu
  assert.equal(legacyTorchMeta(810, H, 810), wallMeta([1, 0, 0]));
  assert.equal(torchMeta('820,200,820', 820, H, 820), TORCH_FLOOR, 'drawn standing');
  updateTorches(1);
  assert.equal(blockMeta.get('800,200,800'), TORCH_FLOOR);
  assert.equal(blockMeta.get('810,200,810'), wallMeta([1, 0, 0]));
  assert.equal(blocks.get('820,200,820'), 'torch');
  assert.equal(blockMeta.has('820,200,820'), false);
  // uložení a načtení: směr se uloží s ostatními metadaty bloků, starý save bez nich se načte
  const save = worldState();
  assert.ok(save.blockMeta.some(([k, v]) => k === '810,200,810' && v === wallMeta([1, 0, 0])));
  blockMeta.delete('810,200,810');
  loadWorld({ blocks: [['900,200,900', 'torch']] });
  assert.equal(blocks.get('900,200,900'), 'torch');
  loadWorld(save);
  assert.equal(blockMeta.get('810,200,810'), wallMeta([1, 0, 0]));
});

test('multiplayer: the direction travels before the block, a drop is sent as block removal + ground item', () => {
  // klient: cizí operace (nejdřív meta, pak blok) postaví pochodeň na zdi
  applyOp(['m', 'blockMeta', '950,200,950', wallMeta([0, 0, 1])]);
  applyOp(['m', 'blocks', '950,200,950', 'torch']);
  assert.equal(torchMeta('950,200,950', 950, H, 950), wallMeta([0, 0, 1]));
  // hostitel: pochodeň bez opory odpadne a ostatní dostanou změnu
  Object.assign(NET, { mode: 'host', ready: true, ops: [] });
  try {
    updateTorches(1);
    const ops = NET.ops;
    assert.ok(ops.some((o) => o[0] === 'm' && o[1] === 'blocks' && o[2] === '950,200,950' && o[3] === null));
    assert.ok(ops.some((o) => o[0] === 'g' && o[2] === 'torch' && o[3] === 1));
  } finally { Object.assign(NET, { mode: 'sp', ready: false, ops: [] }); }
});
