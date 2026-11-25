// Unit tests of the sound design logic that runs without a browser: materials, ambience mix, music theory, volumes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS } from '../../shared/data/index.js';
import { blocks } from '../../shared/world/state.js';
import { biomeAt, terrainH } from '../../shared/world/terrain.js';
import { V } from '../../shared/world/voxels.js';
import { blockMaterial, materialAt, surfaceMaterial, targetMaterial, voxMaterial } from '../../client/src/audio/materials.js';
import { KIND, MATERIAL_NAMES, SFX } from '../../client/src/audio/sfx.js';
import { VOICES } from '../../client/src/audio/voices.js';
import { BIRD_KINDS, ambienceTargets } from '../../client/src/audio/ambience.js';
import { HUM_KINDS } from '../../client/src/audio/hums.js';
import { MODES, TITLES, chordNotes, pickMode } from '../../client/src/audio/music.js';
import { VOL_DEFAULT, readVolumes } from '../../client/src/audio/volume.js';

test('every block and underground block has a material with a sound recipe', () => {
  for (const id of Object.keys(BLOCKS)) assert.ok(MATERIAL_NAMES.includes(blockMaterial(id)), `${id} -> ${blockMaterial(id)}`);
  for (const v of Object.values(V)) assert.ok(MATERIAL_NAMES.includes(voxMaterial(v)), `vox ${v}`);
  assert.equal(blockMaterial('planks'), 'wood');
  assert.equal(blockMaterial('planks_stairs'), 'wood'); // schody podle materiálu
  assert.equal(blockMaterial('cobble_slab'), 'stone');
  assert.equal(blockMaterial('iron_block'), 'metal');
  assert.equal(blockMaterial('cable_copper'), 'metal');
  assert.equal(blockMaterial('computer'), 'metal');
  assert.equal(blockMaterial('glass_pane'), 'glass');
  assert.equal(blockMaterial('sand'), 'sand');
  assert.equal(blockMaterial('snow_block'), 'snow');
  assert.equal(blockMaterial('dirt'), 'dirt');
  assert.equal(voxMaterial(V.CRYSTAL), 'crystal');
  assert.equal(voxMaterial(V.SNOW), 'snow');
  assert.equal(voxMaterial(V.GRANITE), 'stone');
});

test('what is under the feet: shrine floor, meadow, desert, placed blocks, water', () => {
  assert.equal(surfaceMaterial(0, 3), 'stone'); // podlaha svatyně
  assert.equal(materialAt(0, terrainH(0, 60) + 0.01, 60), 'grass');
  assert.equal(surfaceMaterial(0, 60), 'grass');
  let desert = null;
  for (let x = 400; x < 6000 && !desert; x += 40) for (let z = -3000; z < 3000 && !desert; z += 40) if (biomeAt(x, z) === 'desert') desert = [x, z];
  assert.ok(desert, 'a desert exists');
  assert.equal(surfaceMaterial(...desert), 'sand');
  // položený blok pod nohama
  blocks.set('5,3,70', 'planks');
  assert.equal(materialAt(5.5, 4, 70.5), 'wood');
  blocks.set('5,3,70', 'iron_block');
  assert.equal(materialAt(5.5, 4, 70.5), 'metal');
  blocks.delete('5,3,70');
  assert.equal(targetMaterial({ kind: 'tree', tree: { kind: 'oak' } }), 'wood');
  assert.equal(targetMaterial({ kind: 'rock' }), 'stone');
  assert.equal(targetMaterial({ kind: 'grass' }), 'grass');
  assert.equal(targetMaterial({ kind: 'vox', vox: V.SAND }), 'sand');
  assert.equal(targetMaterial({ kind: 'block', type: 'glass' }), 'glass');
});

test('sound recipes exist for every action and creature', () => {
  for (const k of ['step', 'land', 'hit', 'break', 'place']) assert.ok(KIND[k], k);
  for (const fn of ['mat', 'footstep', 'land', 'blockHit', 'blockBreak', 'blockPlace', 'denied', 'swing', 'hit', 'plip', 'toss', 'toolBreak', 'bite', 'eat', 'ui', 'splash', 'swim', 'chest', 'pour',
    'step', 'chop', 'mine', 'rustle', 'crack', 'place', 'pop', 'pickup', 'craft', 'portal', 'kill', 'hurt']) assert.equal(typeof SFX[fn], 'function', fn); // staré názvy volá zbytek hry
  for (const fn of ['mobVoice', 'bird', 'cricket', 'owl', 'frog', 'drip', 'rumble', 'lavaPop', 'alien', 'bubble', 'thunder', 'stomp']) assert.equal(typeof VOICES[fn], 'function', fn);
});

const ENV = { biome: 'meadow', day: 1, dawn: 0, gust: 0.5, forest: 0.5, cave: 0, indoor: 0, water: 0, under: false, mark: false, volcano: 0, rain: 0, height: 0 };
test('ambience: birds by day, crickets and owls at night, drips in caves, only water under water', () => {
  const day = ambienceTargets(ENV), night = ambienceTargets({ ...ENV, day: 0 }), cave = ambienceTargets({ ...ENV, cave: 1 }), under = ambienceTargets({ ...ENV, under: true });
  assert.ok(day.rates.bird > 0.1 && day.rates.cricket === 0 && day.rates.owl === 0);
  assert.ok(night.rates.bird === 0 && night.rates.cricket > 0.5 && night.rates.owl > 0);
  assert.ok(cave.rates.drip > 0.2 && cave.rates.bird === 0 && cave.beds.cave > 0 && cave.beds.wind === 0);
  for (const [k, v] of Object.entries(under.beds)) assert.equal(v > 0, k === 'underwater', k);
  assert.ok(ambienceTargets({ ...ENV, dawn: 1 }).rates.bird > day.rates.bird * 2); // ranní chorál
  assert.ok(ambienceTargets({ ...ENV, rain: 1 }).beds.rain > 0 && ambienceTargets({ ...ENV, rain: 1 }).rates.bird < day.rates.bird / 3);
  const mark = ambienceTargets({ ...ENV, mark: true });
  assert.ok(mark.beds.mark > 0 && mark.rates.bird === 0 && mark.rates.alien > 0);
  assert.ok(ambienceTargets({ ...ENV, biome: 'tundra', gust: 1 }).beds.whistle > 0);
  assert.ok(ambienceTargets({ ...ENV, biome: 'jungle' }).beds.insects > day.beds.insects);
  // nic nesmí řvát: každý podklad je tichý (zesílení ≤ 0,3) a čísla jsou platná
  for (const b of ['meadow', 'cherry', 'desert', 'jungle', 'tundra', 'savanna', 'volcanic', 'mushroom']) for (const e of [{}, { day: 0 }, { cave: 1 }, { gust: 1, height: 80 }, { rain: 1, indoor: 1 }, { volcano: 1, water: 1 }]) {
    const T = ambienceTargets({ ...ENV, biome: b, ...e });
    for (const v of [...Object.values(T.beds), ...Object.values(T.rates)]) assert.ok(Number.isFinite(v) && v >= 0, `${b} ${JSON.stringify(e)}`);
    for (const [k, v] of Object.entries(T.beds)) assert.ok(v <= 0.3, `${k} in ${b} is ${v}`);
  }
  for (const list of Object.values(BIRD_KINDS)) for (const kind of list) assert.ok(['warbler', 'tit', 'cuckoo', 'dove', 'woodpecker', 'jungle', 'parrot', 'hawk'].includes(kind), kind);
  for (const k of ['fire', 'furnace', 'generator', 'computer', 'cable', 'spawner', 'portal']) assert.ok(HUM_KINDS[k].r > 0 && HUM_KINDS[k].v <= 0.1, k);
});

test('music: mode follows the place, chords stay in the scale, every piece has a Czech title', () => {
  assert.equal(pickMode({ day: 1 }), 'day');
  assert.equal(pickMode({ day: 0.1 }), 'night');
  assert.equal(pickMode({ day: 1, cave: 0.9 }), 'cave');
  assert.equal(pickMode({ day: 0, mark: true }), 'mark');
  for (const [mode, M] of Object.entries(MODES)) {
    for (const deg of M.prog) for (const n of chordNotes(mode, deg, true)) assert.ok(M.scale.includes((((n - M.root) % 12) + 12) % 12), `${mode} ${deg} ${n}`);
    assert.ok(TITLES[mode].length >= 3);
  }
  assert.deepEqual(chordNotes('day', 0), [50, 53, 57]); // d moll (D3 F3 A3)
});

test('volumes: defaults, zero means silent, junk is ignored', () => {
  assert.deepEqual(readVolumes({}), VOL_DEFAULT);
  assert.equal(readVolumes({ music: 0 }).music, 0);
  assert.equal(readVolumes({ sfx: 2 }).sfx, 1);
  assert.equal(readVolumes({ vol: 'hlasitě' }).vol, VOL_DEFAULT.vol);
  assert.equal(readVolumes({ vol: null }).vol, VOL_DEFAULT.vol);
});

test('every recipe is safe to call before the browser allows sound (no audio context yet)', () => {
  const calls = [];
  const S = { ...SFX, ...VOICES, ctx: null, burst: (o) => calls.push(o), tone: (...a) => calls.push(a), ring: (...a) => calls.push(a) };
  for (const m of MATERIAL_NAMES) for (const k of Object.keys(KIND)) S.mat(m, k);
  for (const [fn, args] of [['footstep', ['sand', true]], ['land', ['stone', 12]], ['blockHit', ['stone', 'pick']], ['blockBreak', ['glass']], ['blockPlace', ['wood']], ['bite', ['bread']], ['bite', ['mushroom_soup']],
    ['ui', ['open']], ['ui', ['pick']], ['mobVoice', ['golem']], ['mobVoice', ['sheep']], ['bird', ['warbler']], ['thunder', [100]], ['rumble', []], ['toolBreak', []], ['splash', [1]], ['jump', ['grass']], ['jump', ['water']], ['waterExit', []], ['eat', []], ['chest', []], ['pour', []]]) {
    assert.doesNotThrow(() => S[fn](...args), fn);
  }
  assert.ok(calls.length > 100);
});
