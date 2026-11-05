// Bloky, které jde položit: základní, stavební kameny, schody a půlbloky, bloky z biomů, beton a barviva.
import { COOKING, ITEMS, RECIPES } from './items.js';

// Bloky, které jde položit do světa.
export const BLOCKS = {
  planks: { name: 'Prkna', solid: true, hard: 1.2, tool: 'axe', drop: 'planks' },
  mark_planks: { name: 'Markwood prkna', solid: true, hard: 1.2, tool: 'axe', drop: 'mark_planks' },
  cobble: { name: 'Kámen', solid: true, hard: 2.5, tool: 'pick', req: 1, drop: 'stone' },
  dirt: { name: 'Hlína', solid: true, hard: 0.9, tool: 'shovel', drop: 'dirt' },
  markdirt: { name: 'Markdirt', solid: true, hard: 0.9, tool: 'shovel', drop: 'markdirt' },
  bricks: { name: 'Kamenné cihly', solid: true, hard: 2.5, tool: 'pick', req: 1, drop: 'bricks' },
  workbench: { name: 'Pracovní stůl', solid: true, hard: 1.2, tool: 'axe', drop: 'workbench', special: true },
  chest: { name: 'Truhla', solid: true, hard: 1.2, tool: 'axe', drop: 'chest', special: true },
  campfire: { name: 'Táborák', solid: false, hard: 0.8, tool: 'axe', drop: 'campfire', special: true, light: 20 },
  torch: { name: 'Pochodeň', solid: false, hard: 0, drop: 'torch', special: true, light: 8 }, // rozbije se hned (shared/world/torch.js)
  stove: { name: 'Sporák', solid: true, hard: 2.5, tool: 'pick', req: 1, drop: 'stove', special: true },
  well: { name: 'Studna', solid: true, hard: 2.5, tool: 'pick', req: 1, drop: 'well', special: true },
  farmland: { name: 'Orná půda', solid: true, hard: 0.7, tool: 'shovel', drop: 'dirt' },
  wheat_crop: { name: 'Pšenice', solid: false, hard: 0.15, drop: null, special: true, crop: true },
  tomato_crop: { name: 'Rajčata', solid: false, hard: 0.15, drop: null, special: true, crop: true },
  potato_crop: { name: 'Brambory', solid: false, hard: 0.15, drop: null, special: true, crop: true },
  rice_crop: { name: 'Rýže', solid: false, hard: 0.15, drop: null, special: true, crop: true },
  table: { name: 'Stůl', solid: true, hard: 1.2, tool: 'axe', drop: 'table', special: true },
  chair: { name: 'Židle', solid: false, hard: 1, tool: 'axe', drop: 'chair', special: true },
  spikes: { name: 'Hroty', solid: false, hard: 1.5, tool: 'pick', drop: 'spikes', special: true },
  spawner: { name: 'Spawner', solid: true, hard: 6, tool: 'pick', req: 3, drop: null, special: true, light: 6 },
};

// ============================================================ stavební bloky: kameny, schody, půlbloky, mříže, zábradlí
// Tvary bloků (kromě obyčejné kostky). Kvádry v souřadnicích buňky 0–1, před otočením (otáčí se kolem svislé osy po 90°).
// box = kolize (a zároveň model, pokud tvar nemá vlastní "render").
export const SHAPES = {
  slab: { box: [[0, 0, 0, 1, 0.5, 1]] },
  // Schody: spodní půlka + horní půlka u vzdálenější strany (stoupají ve směru, kam se hráč díval)
  stair: { box: [[0, 0, 0, 1, 0.5, 1], [0, 0.5, 0, 1, 1, 0.5]] },
  // Mříže: tenká stěna ze svislých tyčí a dvou příček
  bars: {
    box: [[0, 0, 0.44, 1, 1, 0.56]],
    render: [[0, 0.1, 0.47, 1, 0.16, 0.53], [0, 0.84, 0.47, 1, 0.9, 0.53], ...[0.06, 0.25, 0.44, 0.63, 0.82].map((x) => [x, 0, 0.465, x + 0.07, 1, 0.535])],
  },
  // Zábradlí: dva sloupky a dvě madla
  railing: {
    box: [[0, 0, 0.42, 1, 1, 0.58]],
    render: [[0, 0, 0.42, 0.14, 1, 0.58], [0.86, 0, 0.42, 1, 1, 0.58], [0, 0.82, 0.44, 1, 0.94, 0.56], [0, 0.42, 0.46, 1, 0.52, 0.54]],
  },
};
// Otočí kvádr kolem středu buňky o rot × 90° (stejně jako model: rotation.y = rot · π/2)
export function rotBox([x0, y0, z0, x1, y1, z1], rot) {
  for (let i = 0; i < rot; i++) [x0, z0, x1, z1] = [0.5 + (z0 - 0.5), 0.5 - (x1 - 0.5), 0.5 + (z1 - 0.5), 0.5 - (x0 - 0.5)];
  return [Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1)];
}
// Kvádry tvaru v souřadnicích buňky podle metadat (bit 0–1 = otočení, bit 2 = horní půlblok)
export function shapeBoxes(shape, meta, list = SHAPES[shape].box) {
  const rot = meta & 3, up = meta & 4 ? 0.5 : 0;
  return list.map((b) => { const r = rotBox(b, rot); r[1] += up; r[4] += up; return r; });
}

(() => {
  const add = (id, item, block) => { ITEMS[id] = { stack: 64, ...item, block: id }; BLOCKS[id] = { solid: true, drop: id, ...block }; };
  const STONE = { hard: 2.6, tool: 'pick', req: 1 };
  // Přírodní kameny (těží se v podzemí) a opracované kameny
  add('granite', { name: 'Žula' }, { name: 'Žula', ...STONE, hard: 3 });
  add('marble', { name: 'Mramor' }, { name: 'Mramor', ...STONE });
  add('basalt', { name: 'Čedič' }, { name: 'Čedič', ...STONE, hard: 3.2 });
  add('polished_stone', { name: 'Leštěný kámen' }, { name: 'Leštěný kámen', ...STONE });
  add('stone_tiles', { name: 'Kamenné dlaždice' }, { name: 'Kamenné dlaždice', ...STONE });
  add('polished_granite', { name: 'Leštěná žula' }, { name: 'Leštěná žula', ...STONE, hard: 3 });
  add('polished_marble', { name: 'Leštěný mramor' }, { name: 'Leštěný mramor', ...STONE });
  add('marble_pillar', { name: 'Mramorový sloup' }, { name: 'Mramorový sloup', ...STONE });
  add('polished_basalt', { name: 'Leštěný čedič' }, { name: 'Leštěný čedič', ...STONE, hard: 3.2 });
  add('iron_block', { name: 'Železný blok' }, { name: 'Železný blok', hard: 4, tool: 'pick', req: 2 });
  // Kmeny jako stavební blok (při kácení padá kmen, z kmene je blok)
  add('log_block', { name: 'Dřevěný trám' }, { name: 'Dřevěný trám', hard: 1.6, tool: 'axe' });
  add('markwood_block', { name: 'Markwood trám' }, { name: 'Markwood trám', hard: 1.6, tool: 'axe' });
  add('lantern', { name: 'Lucerna', stack: 16 }, { name: 'Lucerna', solid: false, hard: 0.8, tool: 'pick', special: true, light: 12 });

  // Schody a půlbloky ze stávajících i nových materiálů: [id materiálu, blok, jméno schodů, jméno půlbloku]
  const VARIANTS = [
    ['planks', 'planks', 'Dřevěné schody', 'Dřevěný půlblok'],
    ['mark_planks', 'mark_planks', 'Markwood schody', 'Markwood půlblok'],
    ['stone', 'cobble', 'Kamenné schody', 'Kamenný půlblok'],
    ['bricks', 'bricks', 'Cihlové schody', 'Cihlový půlblok'],
    ['polished_stone', 'polished_stone', 'Schody z leštěného kamene', 'Půlblok z leštěného kamene'],
    ['polished_granite', 'polished_granite', 'Žulové schody', 'Žulový půlblok'],
    ['polished_marble', 'polished_marble', 'Mramorové schody', 'Mramorový půlblok'],
    ['polished_basalt', 'polished_basalt', 'Čedičové schody', 'Čedičový půlblok'],
  ];
  for (const [mat, base, stairName, slabName] of VARIANTS) {
    const b = BLOCKS[base], common = { hard: b.hard, tool: b.tool, req: b.req, mat: base };
    add(`${base}_stairs`, { name: stairName }, { name: stairName, shape: 'stair', ...common });
    add(`${base}_slab`, { name: slabName }, { name: slabName, shape: 'slab', full: base, ...common });
    RECIPES.push(
      { out: `${base}_stairs`, n: 4, shape: ['M  ', 'MM ', 'MMM'], key: { M: mat }, cat: 'build' },
      { out: `${base}_slab`, n: 6, shape: ['MMM'], key: { M: mat }, cat: 'build' },
    );
  }
  add('iron_bars', { name: 'Kovové mříže' }, { name: 'Kovové mříže', shape: 'bars', mat: 'iron_block', hard: 2.5, tool: 'pick', req: 1 });
  add('wood_railing', { name: 'Dřevěné zábradlí' }, { name: 'Dřevěné zábradlí', shape: 'railing', mat: 'planks', hard: 1.2, tool: 'axe' });
  add('iron_railing', { name: 'Kovové zábradlí' }, { name: 'Kovové zábradlí', shape: 'railing', mat: 'iron_block', hard: 2.5, tool: 'pick', req: 1 });

  RECIPES.push(
    { out: 'polished_stone', n: 2, shape: ['SS'], key: { S: 'stone' }, cat: 'build' },
    { out: 'stone_tiles', n: 4, shape: ['SS', 'SS'], key: { S: 'polished_stone' }, cat: 'build' },
    { out: 'polished_granite', n: 4, shape: ['GG', 'GG'], key: { G: 'granite' }, cat: 'build' },
    { out: 'polished_marble', n: 4, shape: ['MM', 'MM'], key: { M: 'marble' }, cat: 'build' },
    { out: 'marble_pillar', n: 2, shape: ['M', 'M'], key: { M: 'polished_marble' }, cat: 'build' },
    { out: 'polished_basalt', n: 4, shape: ['BB', 'BB'], key: { B: 'basalt' }, cat: 'build' },
    { out: 'iron_block', n: 1, shape: ['III', 'III', 'III'], key: { I: 'iron' }, cat: 'build' },
    { out: 'iron', n: 9, shape: ['B'], key: { B: 'iron_block' } },
    { out: 'log_block', n: 4, shape: ['LL', 'LL'], key: { L: 'log' }, cat: 'build' },
    { out: 'log', n: 1, shape: ['B'], key: { B: 'log_block' } },
    { out: 'markwood_block', n: 4, shape: ['LL', 'LL'], key: { L: 'markwood' }, cat: 'build' },
    { out: 'lantern', n: 1, shape: ['I', 'T'], key: { I: 'iron', T: 'torch' }, cat: 'decor' },
    { out: 'iron_bars', n: 16, shape: ['III', 'III'], key: { I: 'iron' }, cat: 'build' },
    { out: 'wood_railing', n: 3, shape: ['PSP', 'PSP'], key: { P: 'planks', S: 'stick' }, cat: 'build' },
    { out: 'iron_railing', n: 6, shape: ['RRR', 'R R'], key: { R: 'iron_rod' }, cat: 'build' }, // ze železných tyčí (vzor ze železa má helma)
  );
})();

// ============================================================ suroviny a bloky z biomů: písek, sklo, sníh, obsidián, dřeva, beton, barviva…
SHAPES.pane = { box: [[0, 0, 0.45, 1, 1, 0.55]] }; // tenká skleněná tabule
(() => {
  const block = (id, name, b, item = {}) => { ITEMS[id] = { name, stack: 64, ...item, block: id }; BLOCKS[id] = { name, solid: true, drop: id, ...b }; };
  const item = (id, name, extra = {}) => { ITEMS[id] = { name, stack: 64, ...extra }; };
  const recipe = (out, n, shape, key, cat) => RECIPES.push({ out, n, shape, key, ...(cat ? { cat } : {}) });
  const stairsSlab = (mat, base, stairName, slabName) => {
    const b = BLOCKS[base], common = { hard: b.hard, tool: b.tool, req: b.req, mat: base };
    block(`${base}_stairs`, stairName, { shape: 'stair', ...common });
    block(`${base}_slab`, slabName, { shape: 'slab', full: base, ...common });
    recipe(`${base}_stairs`, 4, ['M  ', 'MM ', 'MMM'], { M: mat }, 'build');
    recipe(`${base}_slab`, 6, ['MMM'], { M: mat }, 'build');
  };
  const PICK = { tool: 'pick', req: 1 };

  // Dřeva třešňového lesa, džungle a savany
  for (const [k, log, planks, st, sl] of [
    ['cherry', 'Třešňový kmen', 'Třešňová prkna', 'Třešňové schody', 'Třešňový půlblok'],
    ['jungle', 'Kmen z džungle', 'Prkna z džungle', 'Schody z džungle', 'Půlblok z džungle'],
    ['acacia', 'Akáciový kmen', 'Akáciová prkna', 'Akáciové schody', 'Akáciový půlblok'],
  ]) {
    item(`${k}_log`, log);
    block(`${k}_planks`, planks, { hard: 1.2, tool: 'axe' });
    recipe(`${k}_planks`, 4, ['L'], { L: `${k}_log` }, 'build');
    recipe('stick', 4, ['P', 'P'], { P: `${k}_planks` });
    recipe('workbench', 1, ['PP', 'PP'], { P: `${k}_planks` });
    recipe('chest', 1, ['PPP', 'P P', 'PPP'], { P: `${k}_planks` });
    stairsSlab(`${k}_planks`, `${k}_planks`, st, sl);
  }
  // Poušť
  block('sand', 'Písek', { hard: 0.8, tool: 'shovel' });
  block('sandstone', 'Pískovec', { hard: 2, ...PICK });
  block('smooth_sandstone', 'Hladký pískovec', { hard: 2, ...PICK });
  recipe('sandstone', 4, ['SS', 'SS'], { S: 'sand' }, 'build');
  recipe('smooth_sandstone', 4, ['SS', 'SS'], { S: 'sandstone' }, 'build');
  stairsSlab('sandstone', 'sandstone', 'Pískovcové schody', 'Pískovcový půlblok');
  block('glass', 'Sklo', { hard: 0.5 });
  block('glass_pane', 'Skleněná tabule', { shape: 'pane', mat: 'glass', hard: 0.4 });
  recipe('glass_pane', 16, ['GGG', 'GGG'], { G: 'glass' }, 'build');
  item('cactus', 'Kaktus');
  // Tundra
  item('snowball', 'Sněhová koule', { stack: 16 });
  block('snow_block', 'Sněhový blok', { hard: 0.5, tool: 'shovel' });
  recipe('snow_block', 1, ['SS', 'SS'], { S: 'snowball' }, 'build');
  recipe('snowball', 4, ['B'], { B: 'snow_block' });
  // Sopka
  block('obsidian', 'Obsidián', { hard: 9, tool: 'pick', req: 4 });
  // Houbový les
  block('mushroom_block', 'Houbový klobouk', { hard: 0.6, tool: 'axe' });
  block('mushroom_stem', 'Houbový třeň', { hard: 0.6, tool: 'axe' });
  recipe('mushroom_stem', 2, ['M', 'M'], { M: 'mushroom_block' }, 'build');
  block('glowshroom', 'Svítivá houba', { solid: false, hard: 0.1, special: true, light: 7 });
  // Jíl z hlíny u rybníků -> pálené tašky -> střecha
  item('clay', 'Jíl');
  item('clay_tile', 'Pálená taška');
  block('roof_tiles', 'Střešní tašky', { hard: 1.8, ...PICK });
  recipe('roof_tiles', 4, ['TT', 'TT'], { T: 'clay_tile' }, 'build');
  stairsSlab('roof_tiles', 'roof_tiles', 'Střešní schody (tašky)', 'Půlblok z tašek');
  // Beton: písek + kámen + pálené vápno (z mramoru)
  item('quicklime', 'Pálené vápno');
  block('concrete', 'Beton', { hard: 2.2, ...PICK });
  recipe('concrete', 8, ['SSS', 'SQS', 'RRR'], { S: 'sand', Q: 'quicklime', R: 'stone' }, 'build');
  // Květiny a barviva -> barevný beton
  item('yellow_flower', 'Pampeliška');
  item('red_flower', 'Vlčí mák');
  item('blue_flower', 'Chrpa');
  const DYES = { white: ['Bílé barvivo', 'Bílý beton', 0xe9e9e6], black: ['Černé barvivo', 'Černý beton', 0x2a2a2e], red: ['Červené barvivo', 'Červený beton', 0xb02a26],
    yellow: ['Žluté barvivo', 'Žlutý beton', 0xe8c030], green: ['Zelené barvivo', 'Zelený beton', 0x4a8a2a], blue: ['Modré barvivo', 'Modrý beton', 0x2a4ab0],
    orange: ['Oranžové barvivo', 'Oranžový beton', 0xe07a20], purple: ['Fialové barvivo', 'Fialový beton', 0x7a2ab0] };
  for (const [c, [dye, conc]] of Object.entries(DYES)) {
    item(`${c}_dye`, dye, { dye: DYES[c][2] });
    block(`concrete_${c}`, conc, { hard: 2.2, ...PICK, tint: DYES[c][2] });
    recipe(`concrete_${c}`, 8, ['CCC', 'CDC', 'CCC'], { C: 'concrete', D: `${c}_dye` }, 'build');
  }
  recipe('yellow_dye', 2, ['F'], { F: 'yellow_flower' });
  recipe('red_dye', 2, ['F'], { F: 'red_flower' });
  recipe('blue_dye', 2, ['F'], { F: 'blue_flower' });
  recipe('white_dye', 3, ['B'], { B: 'bone' });
  recipe('black_dye', 2, ['C'], { C: 'coal' });
  recipe('orange_dye', 2, ['RY'], { R: 'red_dye', Y: 'yellow_dye' });
  recipe('purple_dye', 2, ['RB'], { R: 'red_dye', B: 'blue_dye' });
  // Ovoce ze stromů biomů
  item('cherries', 'Třešně', { food: 5 });
  item('banana', 'Banán', { food: 8 });
  // Pálení v táboráku
  Object.assign(COOKING, { sand: 'glass', clay: 'clay_tile', marble: 'quicklime', cactus: 'green_dye' });
})();
