// Pixelové ikony předmětů 16×16.
import './textures.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { ITEMS } from '../../../shared/data/index.js';
import { clamp, hash2 } from '../../../shared/util.js';
import { bricksTex, cobbleTex, markPlanksTex, planksTex } from './textures.js';

/**
 * Plátno pro ikonu: drží se v paměti počítače, ne na grafické kartě (willReadFrequently). Z ikon se čtou pixely
 * (3D předmět na zemi a v ruce, obrys ikony v okně); čtení z plátna na grafické kartě musí počkat, až karta dokreslí
 * všechno, co má rozdělané, a na pomalém stroji (softwarové WebGL) tak hra zamrzla na sekundy, když poprvé spadla pochodeň.
 */
export function iconCanvas(w = 16, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d', { willReadFrequently: true });
  return c;
}

// ============================================================ pixelové ikony předmětů
// Bloky se kreslí jako malé 3D kostičky (jako v Minecraftu), ostatní předměty jako pixel art 16×16.
export const ICONS = (() => {
  const canvas = (n) => iconCanvas(n);
  const rgb = (c, k = 1) => `rgb(${clamp(c[0] * k, 0, 255) | 0},${clamp(c[1] * k, 0, 255) | 0},${clamp(c[2] * k, 0, 255) | 0})`;

  // Malá 16×16 textura stěny (zmenšená velká textura nebo nakreslená po pixelech).
  const shrink = (src) => { const c = canvas(16); c.getContext('2d').drawImage(src, 0, 0, 16, 16); return c; };
  const tiny = (fn) => {
    const c = canvas(16), g = c.getContext('2d');
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { g.fillStyle = rgb(...fn(x, y)); g.fillRect(x, y, 1, 1); }
    return c;
  };
  const n = (x, y, s = 0) => 0.85 + hash2(x * 7 + s, y * 13 - s) * 0.3;
  const BARK = [104, 76, 46], WOOD = [176, 138, 86];
  const barkSide = tiny((x, y) => [BARK, x % 4 === 1 ? 0.7 * n(x, y) : n(x, y)]);
  const logTop = tiny((x, y) => {
    const d = Math.hypot(x - 7.5, y - 7.5);
    if (d > 6.6) return [BARK, n(x, y, 1)];
    return [Math.floor(d) % 2 ? [190, 152, 98] : [160, 124, 78], n(x, y, 2) * 0.95 + 0.05];
  });
  const planks16 = shrink(planksTex.image), cobble16 = shrink(cobbleTex.image), bricks16 = shrink(bricksTex.image);
  const wool16 = tiny((x, y) => [[232, 228, 218], (x + y) % 3 === 0 ? 0.88 : n(x, y, 3)]);
  const dirt16 = tiny((x, y) => [[120, 86, 58], n(x, y, 8) * ((x * 7 + y * 3) % 11 === 0 ? 0.7 : 1)]);
  const markdirt16 = tiny((x, y) => [[52, 76, 150], n(x, y, 9) * ((x * 7 + y * 3) % 11 === 0 ? 0.7 : 1)]);
  const markPlanks16 = shrink(markPlanksTex.image);
  const MBARK = [60, 74, 120];
  const markBark = tiny((x) => [MBARK, x % 4 === 1 ? 0.7 * n(x, 1) : n(x, 2)]);
  const markRings = tiny((x, y) => {
    const d = Math.hypot(x - 7.5, y - 7.5);
    if (d > 6.6) return [MBARK, n(x, y, 1)];
    return [Math.floor(d) % 2 ? [120, 160, 230] : [90, 120, 200], n(x, y, 2) * 0.95 + 0.05];
  });
  const chestTop = tiny((x, y) => (x === 0 || y === 0 || x === 15 || y === 15 ? [[70, 48, 26], 1] : [WOOD, n(x, y, 12) * (y % 5 === 4 ? 0.8 : 1)]));
  const chestFront = tiny((x, y) => {
    if (x === 0 || x === 15 || y === 0 || y === 15 || y === 5) return [[70, 48, 26], 1];
    if (x >= 7 && x <= 8 && y >= 4 && y <= 7) return [[200, 200, 210], 1]; // zámek
    return [WOOD, n(x, y, 13) * (y % 5 === 4 ? 0.8 : 1)];
  });
  const benchTop = tiny((x, y) => {
    const edge = x === 0 || y === 0 || x === 15 || y === 15 || x === 7 || y === 7;
    return [WOOD, edge ? 0.55 : n(x, y, 4) * (y % 4 === 3 ? 0.8 : 1)];
  });
  const benchSide = tiny((x, y) => {
    if (y < 3) return [WOOD, y === 2 ? 0.6 : n(x, y, 5)];
    if (x > 2 && x < 13 && y > 5) return [[40, 28, 18], 1];
    return [WOOD, n(x, y, 6) * (x % 5 === 0 ? 0.75 : 1)];
  });
  // Šablona 16×16 stěn kostky -> izometrická kostka 32×32
  const iso = (top, left, right = left) => {
    const c = canvas(32), g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const S = 16;
    const face = (img, a, b, cc, d, e, f, shade) => {
      g.setTransform(a / S, b / S, cc / S, d / S, e, f);
      g.drawImage(img, 0, 0);
      if (shade) { g.fillStyle = `rgba(0,0,0,${shade})`; g.fillRect(0, 0, S, S); }
    };
    face(top, 14, -7, 14, 7, 2, 8, 0);
    face(left, 14, 7, 0, 16, 2, 8, 0.25);
    face(right, 14, -7, 0, 16, 16, 15, 0.45);
    g.setTransform(1, 0, 0, 1, 0, 0);
    return c;
  };

  // Pixel art podle šablony: každé písmeno je barva z palety, tečka je průhledná.
  const pixel = (rows, pal) => {
    const c = canvas(16), g = c.getContext('2d');
    rows.forEach((row, y) => { for (let x = 0; x < 16; x++) { const col = pal[row[x]]; if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } } });
    return c;
  };
  const TIER_PAL = {
    1: { L: '#c9a06a', M: '#9a7448', D: '#5a4026' },
    2: { L: '#bdbdbd', M: '#8c8c8c', D: '#4e4e4e' },
    3: { L: '#ffffff', M: '#d6dbe2', D: '#7f8790' },
    4: { L: '#eaffff', M: '#7ff3ff', D: '#2593b8' },
    5: { L: '#ffd2ff', M: '#d24ee8', D: '#5e1680' },
    shadow: { L: '#8a76a0', M: '#3c2c4e', D: '#120a1a' },
    sky: { L: '#ffffff', M: '#ffe7a0', D: '#c0902e' },
  };
  const HELMET = ['................', '................', '................', '....DDDDDDDD....', '...DLLLMMMMMD...', '..DLMMMMMMMMMD..',
    '..DLMMMMMMMMMD..', '..DMMDDDDDDMMD..', '..DMD......DMD..', '..DMD......DMD..', '...D........D...'];
  const CHESTPLATE = ['................', '...DDD....DDD...', '..DLMMDDDDMMMD..', '..DLMMMMMMMMMD..', '..DDLMMMMMMMDD..', '....DLMMMMMD....',
    '....DLMMMMMD....', '....DLMMMMMD....', '....DLMMMMMD....', '....DMMMMMMD....', '....DDDDDDDD....'];
  const LEGGINGS = ['................', '....DDDDDDDD....', '....DLMMMMMD....', '....DLMMMMMD....', '....DLMDDLMD....', '....DLMD.DMD....',
    '....DLMD.DMD....', '....DLMD.DMD....', '....DLMD.DMD....', '....DLMD.DMD....', '....DDDD.DDD....'];
  const BOOTS = ['................', '................', '................', '................', '................', '...DDD....DDD...',
    '...DLD....DLD...', '...DLD....DLD...', '...DLMD...DLMD..', '..DLMMD..DLMMD..', '..DDDDD..DDDDD..'];
  const ARMOR_ART = [HELMET, CHESTPLATE, LEGGINGS, BOOTS];
  const HANDLE = { H: '#7a5430', h: '#4a311a' };
  const SWORD = [
    '................',
    '.............DLD',
    '............DLMD',
    '...........DLMD.',
    '..........DLMD..',
    '.........DLMD...',
    '........DLMD....',
    '.......DLMD.....',
    '..GG..DLMD......',
    '..GgGDLMD.......',
    '...GgLMD........',
    '....hGg.........',
    '...hHgGg........',
    '..hHh..GG.......',
    '.KHh............',
    '.KK.............',
  ];
  const AXE = [
    '......DDD.......',
    '.....DLMMD......',
    '....DLMMMMD.....',
    '....LMMMMMMHH...',
    '....DMMMMMHHh...',
    '.....DMMMHHhD...',
    '......DDHHhD....',
    '.......HHh......',
    '......HHh.......',
    '.....HHh........',
    '....HHh.........',
    '...HHh..........',
    '..HHh...........',
    '.HHh............',
    '.Hh.............',
    '................',
  ];
  const PICK = [
    '...DDMMMMMD.....',
    '..DLLMMMMMMDD...',
    '...DD.....HMMD..',
    '..........HH.DMD',
    '.........HHh..DM',
    '........HHh....D',
    '.......HHh......',
    '......HHh.......',
    '.....HHh........',
    '....HHh.........',
    '...HHh..........',
    '..HHh...........',
    '.HHh............',
    '.Hh.............',
    '................',
    '................',
  ];
  const SHOVEL = [
    '...........DLD..',
    '..........DLMMD.',
    '..........LMMMD.',
    '..........DMMD..',
    '.........HDDD...',
    '........HHh.....',
    '.......HHh......',
    '......HHh.......',
    '.....HHh........',
    '....HHh.........',
    '...HHh..........',
    '..HHh...........',
    '.HHh............',
    '.Hh.............',
    '................',
    '................',
  ];
  const tool = (rows, tier) => pixel(rows, { ...TIER_PAL[tier], ...HANDLE,
    G: tier >= 3 ? '#e8c04a' : '#5a3e22', g: tier >= 3 ? '#a8822a' : '#3a2814', K: tier >= 3 ? '#e8c04a' : '#5a3e22' });

  const art = {
    stick: pixel([
      '................', '................', '.............LB.', '............LBb.', '...........LBb..', '..........LBb...',
      '.........LBb....', '........LBb.....', '.......LBb......', '......LBb.......', '.....LBb........', '....LBb.........',
      '...LBb..........', '...Bb...........', '................', '................',
    ], { L: '#b88a52', B: '#8a5f36', b: '#4e3420' }),
    fiber: pixel([
      '................', '....g.....g.....', '....g....g......', '.....g...g...g..', '..g..g..g...g...', '...g.g..g..g....',
      '...g.Gg.g.g.....', '....gG.gGg......', '....GGgGG.......', '.....GGGG.......', '.....YyYy.......', '.....GGGG.......',
      '......GG........', '......GG........', '.....G..G.......', '................',
    ], { g: '#8ad04a', G: '#4a8a2a', Y: '#e0c060', y: '#a88a3a' }),
    iron_ore: pixel([
      '................', '................', '.....DDDDD......', '....DSSOSSDD....', '...DSOoSSSSSD...', '..DSSoSSSOOSSD..',
      '..DSSSSSSOoSSD..', '..DLSSOSSSSSSD..', '..DSSOoSSSSOSD..', '...DSSSSSOoSD...', '....DSSSSSSD....', '.....DDDDDD.....',
      '................', '................', '................', '................',
    ], { D: '#3e3e42', S: '#8a8a8e', L: '#b0b0b4', O: '#e09048', o: '#a85a26' }),
    iron: pixel([
      '................', '................', '................', '................', '................', '......LLLLLL....',
      '....LLMMMMMLD...', '..LLMMMMMMLDD...', '..DLMMMMMLDDD...', '..DDMMMMMDDD....', '...DDDDDDDD.....', '................',
      '................', '................', '................', '................',
    ], { L: '#ffffff', M: '#cfd5dc', D: '#7d858e' }),
    shard: pixel([
      '................', '.......W........', '......WCB.......', '.....WCCCB......', '....WCCCCBB.....', '...WCCCCCBBB....',
      '..WCCCCCCBBBB...', '...CCCCCCBBBB...', '....CCCCCBBB....', '.....CCCCBB.....', '......CCCB......', '.......CB.......',
      '........N.......', '................', '................', '................',
    ], { W: '#ffffff', C: '#8af4ff', B: '#3fb8d8', N: '#1f7f9f' }),
    essence: pixel([
      '................', '................', '................', '......DDDD......', '....DDPPPPDD....', '...DPPLLPPPPD...',
      '...DPLWLPPPPD...', '..DPPLLPPPPPPD..', '..DPPPPPPPPPPD..', '..DPPPPPPPPPdD..', '...DPPPPPPPdD...', '...DdPPPPPddD...',
      '....DDddddDD....', '......DDDD......', '................', '................',
    ], { D: '#22082e', P: '#8a3ad0', L: '#c890ff', W: '#ffffff', d: '#561a86' }),
    berries: pixel([
      '................', '................', '.......gG.......', '......gGG.......', '.....gGg........', '....BBg.BB......',
      '...BLBB.BLB.....', '...BBBdBBBB.....', '....BdBLBBd.....', '.....BBBBd......', '......Bdd.......', '................',
      '................', '................', '................', '................',
    ], { B: '#3a4ab8', L: '#a8b4ff', d: '#1e2a70', g: '#3a8a2a', G: '#5ab83a' }),
    raw_meat: pixel([
      '................', '................', '................', '.....DDDDD......', '...DDRRRRRDD....', '..DRRPPRRRRRD...',
      '.DRRPWPRRRRRRD..', '.DRRRPRRRRRRRD..', '.DRRRRRRRRWWRD..', '..DRRRRRRRWWRD..', '...DRRRRRRRRD...', '....DDRRRRDD....',
      '......DDDD......', '................', '................', '................',
    ], { D: '#6a1a1a', R: '#d8504a', P: '#f08a80', W: '#f0e0d0' }),
    meat: pixel([
      '................', '................', '............WW..', '...........WWW..', '..........WW....', '.....DDDDWW.....',
      '...DDBBBBD......', '..DBBLLBBBD.....', '.DBBLBBBBBD.....', '.DBBBBBBBBD.....', '.DBBBBBBBD......', '..DBBBBBDD......',
      '...DDDDD........', '................', '................', '................',
    ], { D: '#3a1a0a', B: '#9a5a2a', L: '#d8964e', W: '#f0e8d8' }),
    torch: pixel([
      '................', '.......Y........', '......YOY.......', '......ORO.......', '.....YORRO......', '......ORO.......',
      '......dDd.......', '......BBb.......', '......BBb.......', '......BBb.......', '......BBb.......', '......BBb.......',
      '......BBb.......', '......BBb.......', '......bbb.......', '................',
    ], { Y: '#ffe680', O: '#ff9a2a', R: '#ff5a1a', d: '#3a2412', D: '#24160a', B: '#8a5f36', b: '#5e3e22' }),
    campfire: pixel([
      '................', '................', '.......Y........', '......YO........', '......ORY.Y.....', '.....YORO.O.....',
      '....YORRROOY....', '....ORRRRRRO....', '...dORRYYRROd...', '..BBbdORRRdbBB..', '.bBBBbdddbBBBb..', '..bbBBBBBBBbb...',
      '.SsS.bbbbb.SsS..', '..SS........SS..', '................', '................',
    ], { Y: '#ffe680', O: '#ff9a2a', R: '#ff5a1a', d: '#3a2412', B: '#8a5f36', b: '#5e3e22', S: '#9a9a9a', s: '#6a6a6a' }),
  };

  const icons = {
    log: iso(logTop, barkSide),
    planks: iso(planks16, planks16),
    stone: iso(cobble16, cobble16),
    bricks: iso(bricks16, bricks16),
    wool: iso(wool16, wool16),
    dirt: iso(dirt16, dirt16),
    markdirt: iso(markdirt16, markdirt16),
    mark_planks: iso(markPlanks16, markPlanks16),
    markwood: iso(markRings, markBark),
    chest: iso(chestTop, chestFront),
    markapple: pixel([
      '................', '.......Gg.......', '......gG........', '....DDDgDDD.....', '...DPPPDPPPD....', '..DPLWPPPPPPD...',
      '..DPLPPPPPPPD...', '..DPPPPPPPPPD...', '..DPPPPPPPPdD...', '...DPPPPPPdD....', '....DPPPPdD.....', '.....DDDDD......',
    ], { D: '#1a0a3a', P: '#5a4aff', L: '#a8a0ff', W: '#ffffff', d: '#3020a0', G: '#3ad0ff', g: '#1a8ab0' }),
    spikes: pixel([
      '................', '................', '................', '..L....L....L...', '..L....L....L...', '.LMD..LMD..LMD..',
      '.LMD..LMD..LMD..', 'LMMMDLMMMDLMMMD.', 'LMMMDLMMMDLMMMD.', 'DDDDDDDDDDDDDDD.', 'MMMMMMMMMMMMMMM.', 'DDDDDDDDDDDDDDD.',
    ], { L: '#ffffff', M: '#b8bec8', D: '#5a606a' }),
    markorite_raw: pixel([
      '................', '................', '.....DDDDD......', '....DSSPSSDD....', '...DSPpSSSSSD...', '..DSSpSSSPPSSD..',
      '..DSSSSSSPpSSD..', '..DLSSPSSSSSSD..', '..DSSPpSSSSPSD..', '...DSSSSSPpSD...', '....DSSSSSSD....', '.....DDDDDD.....',
    ], { D: '#1c1426', S: '#4a3e5c', L: '#6e5f86', P: '#ff7af5', p: '#b030c8' }),
    markorite: pixel([
      '................', '................', '................', '................', '................', '......LLLLLL....',
      '....LLMMMMMLD...', '..LLMMMMMMLDD...', '..DLMMMMMLDDD...', '..DDMMMMMDDD....', '...DDDDDDDD.....',
    ], { L: '#ffd2ff', M: '#d24ee8', D: '#6a1a86' }),
    coal: pixel([
      '................', '................', '................', '.....DDD........', '....DCCCDD......', '...DCLCCCCD.....',
      '..DCCCCCCLCD....', '..DCCCLCCCCD....', '...DCCCCCCD.....', '....DDCCDD......', '......DD........', '................',
      '................', '................', '................', '................',
    ], { D: '#0c0c0e', C: '#2e2e33', L: '#64646e' }),
    workbench: iso(benchTop, benchSide),
    ...art,
  };
  for (const [id, it] of Object.entries(ITEMS)) {
    if (icons[id]) continue;
    if (it.tool) icons[id] = tool({ sword: SWORD, axe: AXE, pick: PICK, shovel: SHOVEL }[it.tool], it.tier);
    if (it.armor) icons[id] = pixel(ARMOR_ART[it.armor.slot], TIER_PAL[it.tier]);
  }
  const out = {};
  for (const [id, c] of Object.entries(icons)) out[id] = { canvas: c, url: c.toDataURL() };
  return out;
})();
