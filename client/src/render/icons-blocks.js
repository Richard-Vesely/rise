// Ikony bloků, biomů, technologií a elektrických zařízení.
import './icons.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { BLOCKS, ITEMS, SHAPES, rotBox } from '../../../shared/data/index.js';
import { ICONS } from './icons.js';
import { acaciaPlanksTex, barkTex, basaltTex, bricksTex, cherryPlanksTex, cobbleTex, concreteTex, copperBlockTex, cutCopperTex, glassTex, goldBlockTex, graniteTex, ironBlockTex, junglePlanksTex, marblePillarTex, marbleTex, markBarkTex, markPlanksTex, markRingsTex, mushroomCapTex, mushroomStemTex, obsidianTex, planksTex, polishedBasaltTex, polishedGraniteTex, polishedMarbleTex, polishedStoneTex, quartzPillarTex, quartzTex, ringsTex, roofTilesTex, sandTex, sandstoneTex, smoothSandstoneTex, snowTex, steelBlockTex, stoneTilesTex, techPanelTex, whitePanelTex, neonTex } from './textures.js';

// ============================================================ ikony stavebních bloků (izometrické 3D tvary ze zmenšených textur)
const shrinkTex = (tex) => { const c = document.createElement('canvas'); c.width = c.height = 16; c.getContext('2d').drawImage(tex.image, 0, 0, 16, 16); return c; };
// Bod kvádru (x, y, z v pixelech 0–16; y nahoru) -> bod na ikoně 32×32 (stejná projekce jako ikony kostek)
const isoP = (x, y, z) => [2 + x * 0.875 + z * 0.875, 8 + x * 0.4375 - z * 0.4375 + (16 - y)];
// Nakreslí kvádry (od zadních k předním): vrchní stěna, levá (přední) a pravá stěna, textura se nedeformuje.
function isoBoxes(top, side, boxes) {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const face = (img, o, u, v, sx, sy, sw, sh, shade) => {
    if (sw <= 0 || sh <= 0) return;
    g.setTransform(u[0], u[1], v[0], v[1], o[0], o[1]);
    g.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    if (shade) { g.fillStyle = `rgba(0,0,0,${shade})`; g.fillRect(0, 0, sw, sh); }
  };
  const UX = [0.875, 0.4375], UZ = [0.875, -0.4375], DOWN = [0, 1];
  const order = [...boxes].sort((a, b) => b[5] - a[5] || a[0] - b[0] || a[1] - b[1]); // vzdálenější (větší z) dřív
  for (const [x0, y0, z0, x1, y1, z1] of order) {
    face(top, isoP(x0, y1, z0), UZ, UX, z0, x0, z1 - z0, x1 - x0, 0);
    face(side, isoP(x0, y1, z0), UX, DOWN, x0, 16 - y1, x1 - x0, y1 - y0, 0.25);
    face(side, isoP(x1, y1, z0), UZ, DOWN, z0, 16 - y1, z1 - z0, y1 - y0, 0.45);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  return c;
}
(() => {
  const shrink = shrinkTex;
  const px = (b) => b.map((v) => v * 16);
  const icon = (id, c) => (ICONS[id] = { canvas: c, url: c.toDataURL() });
  const T = {
    granite: graniteTex, marble: marbleTex, basalt: basaltTex, polished_stone: polishedStoneTex, stone_tiles: stoneTilesTex,
    polished_granite: polishedGraniteTex, polished_marble: polishedMarbleTex, marble_pillar: marblePillarTex, polished_basalt: polishedBasaltTex,
    iron_block: ironBlockTex, planks: planksTex, mark_planks: markPlanksTex, cobble: cobbleTex, bricks: bricksTex,
  };
  const small = Object.fromEntries(Object.entries(T).map(([k, t]) => [k, shrink(t)]));
  const FULL = [[0, 0, 0, 16, 16, 16]];
  for (const k of Object.keys(T)) if (ITEMS[k]) icon(k, isoBoxes(small[k], small[k], FULL));
  icon('log_block', isoBoxes(shrink(ringsTex), shrink(barkTex), FULL));
  icon('markwood_block', isoBoxes(shrink(markRingsTex), shrink(markBarkTex), FULL));
  // Schody a půlbloky: ikona ukazuje skutečný tvar (schody jsou natočené vyšší částí dozadu)
  for (const [id, b] of Object.entries(BLOCKS)) {
    if (!b.shape || !ITEMS[id]) continue;
    const tex = small[b.mat];
    if (!tex) continue; // ikony bloků z biomů kreslí další soubor
    const sh = SHAPES[b.shape], boxes = (sh.render || sh.box).map((bx) => px(rotBox(bx, 2)));
    icon(id, isoBoxes(tex, tex, boxes));
  }
  // Lucerna: železný rám, zářící sklo, ucho nahoře
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  const rows = ['......DD........', '.....D..D.......', '......DD........', '....DDDDDD......', '....DYYYYD......', '....DYOOYD......',
    '....DYOOYD......', '....DYYYYD......', '....DDDDDD......', '....D....D......'];
  const pal = { D: '#3a3e46', Y: '#ffe08a', O: '#ff9a2a' };
  rows.forEach((r, y) => { for (let x = 0; x < 16; x++) if (pal[r[x]]) { g.fillStyle = pal[r[x]]; g.fillRect(x + 2, y + 3, 1, 1); } });
  icon('lantern', c);
})();

// ============================================================ ikony bloků a předmětů z biomů
(() => {
  const icon = (id, c) => (ICONS[id] = { canvas: c, url: c.toDataURL() });
  const hex = (h) => `#${h.toString(16).padStart(6, '0')}`;
  // Přebarvení malé textury (beton podle barviva)
  const tint = (src, color) => {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = hex(color);
    g.fillRect(0, 0, 16, 16);
    return c;
  };
  // Pixel art 16×16 kreslený funkcí, s tmavým obrysem jako ostatní ikony
  const paint = (fn) => {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const g = c.getContext('2d');
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const col = fn(x + 0.5, y + 0.5); if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } }
    const d = g.getImageData(0, 0, 16, 16).data, on = (x, y) => x >= 0 && y >= 0 && x < 16 && y < 16 && d[(y * 16 + x) * 4 + 3] > 0;
    g.fillStyle = 'rgba(24,16,12,0.9)';
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (!on(x, y) && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) g.fillRect(x, y, 1, 1);
    return c;
  };
  const inE = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  const FULL = [[0, 0, 0, 16, 16, 16]];
  const T = {
    cherry_planks: cherryPlanksTex, jungle_planks: junglePlanksTex, acacia_planks: acaciaPlanksTex, sand: sandTex, sandstone: sandstoneTex,
    smooth_sandstone: smoothSandstoneTex, glass: glassTex, snow_block: snowTex, obsidian: obsidianTex, mushroom_block: mushroomCapTex,
    mushroom_stem: mushroomStemTex, roof_tiles: roofTilesTex, concrete: concreteTex, tech_panel: techPanelTex, white_panel: whitePanelTex,
  };
  const small = Object.fromEntries(Object.entries(T).map(([k, t]) => [k, shrinkTex(t)]));
  for (const k of Object.keys(T)) icon(k, isoBoxes(small[k], small[k], FULL));
  const neon = shrinkTex(neonTex); // neony (dokud se nevykreslí 3D ikony, render/icon-render.js)
  for (const id of ['neon_cyan', 'neon_amber', 'neon_magenta']) icon(id, isoBoxes(tint(neon, BLOCKS[id].lightColor), tint(neon, BLOCKS[id].lightColor), FULL));
  for (const [id, b] of Object.entries(BLOCKS)) {
    if (b.tint) icon(id, isoBoxes(tint(small.concrete, b.tint), tint(small.concrete, b.tint), FULL));
    if (b.shape && small[b.mat] && !ICONS[id]) icon(id, isoBoxes(small[b.mat], small[b.mat], (SHAPES[b.shape].render || SHAPES[b.shape].box).map((bx) => rotBox(bx, 2).map((v) => v * 16))));
  }
  // Kmeny: letokruhy nahoře, kůra po stranách (přebarvené podle dřeva)
  const rings = shrinkTex(ringsTex), bark = shrinkTex(barkTex);
  for (const [id, col] of [['cherry_log', 0xd88a8a], ['jungle_log', 0x9a7a4a], ['acacia_log', 0xd89060]]) icon(id, isoBoxes(tint(rings, col), tint(bark, col), FULL));
  // Předměty
  icon('cactus', paint((x, y) => (Math.abs(x - 8) < 2.6 && y > 2 && y < 15) || (x > 3 && x < 6 && y > 5 && y < 10) || (x > 10 && x < 13 && y > 4 && y < 9) || (y > 7.5 && y < 9.5 && x > 3 && x < 13) ? ((x + y) % 4 < 1 ? '#2e6a24' : '#4e9a3a') : null));
  icon('snowball', paint((x, y) => (inE(x, y, 8, 8.5, 5, 5) ? (x + y < 13 ? '#ffffff' : '#d6e2ee') : null)));
  icon('clay', paint((x, y) => (inE(x, y, 8, 9, 6, 4.5) ? (x + y < 14 ? '#b8bcc8' : '#8e92a2') : null)));
  icon('clay_tile', paint((x, y) => (x > 2 && x < 14 && y > 4 && y < 12 ? (Math.hypot(x - 8, y - 14) < 9 ? '#c4572e' : '#8e3a1e') : null)));
  icon('quicklime', paint((x, y) => (inE(x, y, 8, 11, 6.5, 3.5) || inE(x, y, 8, 8.5, 3.5, 2.5) ? (y < 10 ? '#ffffff' : '#e2e2da') : null)));
  const flower = (petal, center) => paint((x, y) => {
    if (Math.abs(x - 8) < 0.8 && y > 8 && y < 15) return '#3a8a2a';
    if (inE(x, y, 10.5, 12, 2, 1) && y < 13) return '#4aa03a';
    if (inE(x, y, 8, 6, 1.4, 1.4)) return center;
    return inE(x, y, 8, 6, 4, 3.5) && Math.abs(Math.atan2(y - 6, x - 8) * 2.5 % 1.6) < 1.1 ? petal : null;
  });
  icon('yellow_flower', flower('#ffd62a', '#c08a10'));
  icon('red_flower', flower('#e82a2a', '#2a1a10'));
  icon('blue_flower', flower('#5a8aff', '#2a3aa0'));
  for (const id of Object.keys(ITEMS)) if (ITEMS[id].dye) {
    const c = hex(ITEMS[id].dye);
    icon(id, paint((x, y) => (inE(x, y, 8, 10.5, 4.5, 4) ? (x + y < 15 ? c : c) : x > 6 && x < 10 && y > 2 && y < 7 ? (y < 4 ? '#8a6438' : '#d6e2ee') : null)));
  }
  icon('cherries', paint((x, y) => (inE(x, y, 5.5, 11, 2.6, 2.6) || inE(x, y, 10.5, 11.5, 2.6, 2.6) ? (inE(x, y, 4.8, 10.2, 0.8, 0.8) || inE(x, y, 9.8, 10.7, 0.8, 0.8) ? '#ff9a9a' : '#c4141e')
    : (Math.abs(x - 5.5 - (8 - y) * 0.3) < 0.6 && y > 3 && y < 9) || (Math.abs(x - 10.5 + (8 - y) * 0.3) < 0.6 && y > 3 && y < 9.5) ? '#3a7a2a' : null)));
  icon('banana', paint((x, y) => { const d = Math.hypot(x - 3, y - 2); return d > 9 && d < 12.5 && x > 3 && y > 4 ? (d < 10 ? '#c8a020' : '#ffe04a') : null; }));
  icon('glowshroom', paint((x, y) => (y < 8 && inE(x, y, 8, 7.5, 5.5, 4) ? (inE(x, y, 6, 5, 1, 0.8) || inE(x, y, 10, 6, 1, 0.8) ? '#e8ffff' : '#3af0ff') : Math.abs(x - 8) < 1.5 && y >= 7.5 && y < 14 ? '#e8e2d0' : null)));
})();

// ============================================================ ikony technologických předmětů a bloků
// Předmět má art = [tvar, hlavní barva, (druhá barva)]. Tvar je funkce (x, y) -> 'M' hlavní / 'L' světlá / 'D' tmavá / 'A' druhá / 'W' bílá / 'K' černá.
(() => {
  const icon = (id, c) => (ICONS[id] = { canvas: c, url: c.toDataURL() });
  const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mixC = (c, t, k) => `rgb(${c.map((v, i) => Math.round(v + (t[i] - v) * k)).join(',')})`;
  const inR = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const inE = (x, y, cx, cy, rx, ry = rx) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  const ring = (x, y, cx, cy, r0, r1) => { const d = Math.hypot(x - cx, y - cy); return d >= r0 && d <= r1; };
  const lit = (x, y) => (x + y < 14 ? 'L' : x + y > 20 ? 'D' : 'M'); // osvětlení zleva nahoře
  const S = {
    ore: (x, y) => (inE(x, y, 8, 8.5, 6, 5.5) ? ((Math.floor(x * 1.7) * 7 + Math.floor(y * 1.3) * 3) % 5 === 0 ? 'M' : (x * 3 + y) % 7 < 1 ? 'A' : 'G') : null),
    crystal: (x, y) => ([[5, 14, 2], [8, 14, 3], [11, 14, 2]].some(([cx, b, w]) => Math.abs(x - cx) < w * (1 - (b - y) / 12) && y < b && y > b - 11 + Math.abs(cx - 8)) ? (x < 8 ? 'L' : 'M') : null),
    blob: (x, y) => (inE(x, y, 8, 9, 5.5, 4.5) || inE(x, y, 7, 5.5, 2.5, 2) ? lit(x, y) : null),
    ingot: (x, y) => (y > 6 && y < 12 && x > 2 + (12 - y) * 0.4 && x < 14 - (12 - y) * 0.4 ? (y < 8 ? 'L' : y > 10.5 ? 'D' : 'M') : null),
    lump: (x, y) => (inE(x, y, 8, 9, 5.5, 4) ? ((x * 5 + y * 3) % 6 < 1 ? 'L' : 'M') : null),
    bottle: (x, y) => (inR(x, y, 6.5, 2, 9.5, 5) ? 'W' : inE(x, y, 8, 10.5, 4.5, 4.5) ? (x < 7 ? 'L' : 'M') : inR(x, y, 7, 5, 9, 7) ? 'L' : null),
    lens: (x, y) => (inE(x, y, 8, 8, 6, 6) ? (inE(x, y, 6, 6, 1.5, 1.5) ? 'W' : 'M') : null),
    sheet: (x, y) => (inR(x, y, 2, 4, 14, 12) ? (x + y > 22 ? 'D' : inR(x, y, 3, 5, 6, 6) ? 'W' : 'M') : null),
    pile: (x, y) => (inE(x, y, 8, 12, 6.5, 3.5) || inE(x, y, 8, 9.5, 4, 2.5) ? ((x * 7 + y * 5) % 4 < 1 ? 'D' : 'M') : null),
    paper: (x, y) => (inR(x, y, 3, 2, 13, 14) ? (inR(x, y, 5, 4, 11, 12) && Math.floor(y) % 2 === 0 ? 'D' : 'M') : null),
    plate: (x, y) => (inR(x, y, 2, 5, 14, 11) ? (y < 6.5 ? 'L' : y > 10 ? 'D' : (inE(x, y, 4, 8, 0.8) || inE(x, y, 12, 8, 0.8)) ? 'D' : 'M') : null),
    rod: (x, y) => (Math.abs(x + y - 16) < 1.6 && x > 2 && x < 14 ? (x + y < 16 ? 'L' : 'D') : null),
    screw: (x, y) => (inR(x, y, 5, 2, 11, 5) ? 'L' : inR(x, y, 7, 5, 9, 14) ? (Math.floor(y) % 2 ? 'D' : 'M') : null),
    gear: (x, y) => { const d = Math.hypot(x - 8, y - 8), a = Math.atan2(y - 8, x - 8); return d < 2 ? null : d < 5 || (d < 7 && Math.cos(a * 8) > 0.2) ? lit(x, y) : null; },
    ring: (x, y) => (ring(x, y, 8, 8, 3, 6) ? lit(x, y) : null),
    spring: (x, y) => (inR(x, y, 4, 2, 12, 14) && Math.abs(((y * 0.9 + x * 0.25) % 3) - 1.5) < 0.7 ? (x < 8 ? 'L' : 'M') : null),
    pipe: (x, y) => (inR(x, y, 1, 6, 15, 10) ? (y < 7 ? 'L' : y > 9 ? 'D' : 'M') : inR(x, y, 13, 5, 15, 11) ? 'D' : null),
    grid: (x, y) => (inR(x, y, 2, 3, 14, 13) ? (Math.floor(x) % 3 === 0 ? 'D' : 'M') : null),
    wire: (x, y) => (ring(x, y, 8, 8, 3.5, 5.5) && !(x > 10 && y > 10) ? (x + y < 16 ? 'L' : 'M') : (Math.abs(x - y) < 1 && x > 10 && x < 14) ? 'M' : null),
    coil: (x, y) => (inR(x, y, 3, 4, 13, 12) ? (inR(x, y, 3, 4, 13, 5) || inR(x, y, 3, 11, 13, 12) ? 'D' : Math.floor(x) % 2 ? 'M' : 'L') : null),
    magnet: (x, y) => (ring(x, y, 8, 7, 3, 6) && y < 9 || (inR(x, y, 2, 7, 5, 13) || inR(x, y, 11, 7, 14, 13)) ? (y > 11 ? 'W' : 'M') : null),
    contact: (x, y) => (inR(x, y, 3, 9, 13, 12) ? 'K' : inR(x, y, 4, 4, 6, 9) || inR(x, y, 10, 4, 12, 9) ? (x < 5 || (x > 10 && x < 11) ? 'L' : 'M') : null),
    switch: (x, y) => (inR(x, y, 3, 6, 13, 13) ? (inR(x, y, 6, 4, 10, 9) ? 'A' : 'M') : inR(x, y, 6, 4, 10, 6) ? 'A' : null),
    fuse: (x, y) => (inR(x, y, 2, 6, 4, 10) || inR(x, y, 12, 6, 14, 10) ? 'D' : inR(x, y, 4, 6, 12, 10) ? (Math.abs(y - 8) < 0.6 ? 'A' : 'M') : null),
    bulb: (x, y) => (inE(x, y, 8, 6.5, 5, 5) ? (inE(x, y, 6.5, 5, 1.3, 1.3) ? 'W' : 'M') : inR(x, y, 6, 10, 10, 14) ? (Math.floor(y) % 2 ? 'D' : 'L') : null),
    battery: (x, y) => (inR(x, y, 6.5, 1.5, 9.5, 3) ? 'D' : inR(x, y, 4, 3, 12, 15) ? (y < 6 ? 'W' : x < 6 ? 'L' : 'M') : null),
    wafer: (x, y) => (inE(x, y, 8, 8, 6.5, 6.5) ? (Math.floor(x) % 3 === 0 || Math.floor(y) % 3 === 0 ? 'L' : 'M') : null),
    led: (x, y) => (inE(x, y, 8, 6, 3.5, 4) && y < 9 || inR(x, y, 4.5, 8, 11.5, 9.5) ? (x < 7 && y < 6 ? 'W' : 'M') : inR(x, y, 6, 9.5, 7, 15) || inR(x, y, 9, 9.5, 10, 13) ? 'D' : null),
    transistor: (x, y) => (inR(x, y, 4, 2, 12, 9) ? (y < 3.5 ? 'L' : 'M') : [5, 8, 11].some((c) => Math.abs(x - c) < 0.8) && y > 9 && y < 15 ? 'D' : null),
    resistor: (x, y) => (inE(x, y, 8, 8, 5, 2.5) ? ([6, 8, 10].some((c) => Math.abs(x - c) < 0.6) ? 'A' : 'M') : Math.abs(y - 8) < 0.6 && (x < 3.5 || x > 12.5) ? 'D' : null),
    capacitor: (x, y) => (inR(x, y, 5, 2, 11, 11) ? (x < 6.5 ? 'L' : inR(x, y, 9, 2, 11, 11) ? 'W' : 'M') : (Math.abs(x - 6.5) < 0.6 || Math.abs(x - 9.5) < 0.6) && y > 11 && y < 15 ? 'D' : null),
    board: (x, y) => (inR(x, y, 1, 3, 15, 13) ? ((Math.floor(y) === 6 || Math.floor(x) === 10) ? 'A' : inR(x, y, 3, 8, 6, 11) ? 'K' : 'M') : null),
    chip: (x, y) => (inR(x, y, 3, 3, 13, 13) ? (inR(x, y, 5, 5, 11, 11) ? 'K' : (Math.floor(x) + Math.floor(y)) % 3 === 0 ? 'A' : 'M') : null),
    cpu: (x, y) => (inR(x, y, 2, 2, 14, 14) ? (inR(x, y, 5, 5, 11, 11) ? 'W' : (x < 3 || x > 13 || y < 3 || y > 13) && (Math.floor(x + y) % 2) ? 'A' : 'M') : null),
    speaker: (x, y) => (inR(x, y, 3, 2, 13, 14) ? (ring(x, y, 8, 9, 2, 4) ? 'D' : inE(x, y, 8, 9, 1.5) ? 'L' : inE(x, y, 8, 4.5, 1) ? 'D' : 'M') : null),
    antenna: (x, y) => (Math.abs(x - 8) < 0.8 && y > 3 && y < 14 ? 'M' : inE(x, y, 8, 3, 1.5) ? 'A' : inR(x, y, 5, 13, 11, 15) ? 'D' : null),
    motor: (x, y) => (inR(x, y, 2, 4, 12, 13) ? (Math.floor(x) % 3 === 0 ? 'D' : y < 6 ? 'L' : 'M') : inR(x, y, 12, 7.5, 15, 9.5) ? 'W' : null),
    piston: (x, y) => (inR(x, y, 4, 2, 12, 7) ? (Math.floor(y) % 2 ? 'D' : 'L') : inR(x, y, 7, 7, 9, 14) ? 'M' : null),
    engineblock: (x, y) => (inR(x, y, 2, 4, 14, 14) ? (inE(x, y, 5, 7, 1.5) || inE(x, y, 11, 7, 1.5) ? 'K' : y < 5.5 ? 'L' : 'M') : null),
    crank: (x, y) => (Math.abs(y - 8) < 0.9 && x > 1 && x < 15 ? 'M' : inR(x, y, 5, 4, 6, 8) || inR(x, y, 10, 8, 11, 12) ? 'L' : null),
    plug: (x, y) => (inR(x, y, 6, 1, 10, 7) ? 'W' : inR(x, y, 5.5, 7, 10.5, 10) ? 'M' : inR(x, y, 7, 10, 9, 14) ? 'D' : null),
    box: (x, y) => (inR(x, y, 2, 3, 14, 13) ? (inR(x, y, 4, 5, 8, 8) ? 'K' : y < 4.5 ? 'L' : x > 12.5 ? 'D' : 'M') : null),
    engine: (x, y) => (inR(x, y, 2, 5, 13, 13) ? (inR(x, y, 4, 2, 11, 5) ? 'D' : Math.floor(x) % 3 === 0 && y < 9 ? 'L' : 'M') : inR(x, y, 4, 2, 11, 5) ? 'D' : inE(x, y, 14, 9, 1.5) ? 'W' : null),
    gearbox: (x, y) => (inR(x, y, 2, 4, 14, 12) ? (ring(x, y, 6, 8, 1.5, 3) || ring(x, y, 11, 8, 1, 2) ? 'L' : 'M') : null),
    tire: (x, y) => (ring(x, y, 8, 8, 3, 7) ? ((Math.atan2(y - 8, x - 8) * 4 % 1.2) < 0.4 && Math.hypot(x - 8, y - 8) > 6 ? 'D' : 'M') : null),
    rim: (x, y) => (ring(x, y, 8, 8, 4, 6) || (Math.hypot(x - 8, y - 8) < 4.5 && (Math.abs(x - 8) < 0.8 || Math.abs(y - 8) < 0.8)) ? lit(x, y) : null),
    wheel: (x, y) => { const d = Math.hypot(x - 8, y - 8); return d > 7 ? null : d > 4.5 ? 'M' : d > 3.5 ? 'W' : d < 1.5 || Math.abs(x - 8) < 0.7 || Math.abs(y - 8) < 0.7 ? 'L' : null; },
    steering: (x, y) => (ring(x, y, 8, 8, 5, 7) || (Math.hypot(x - 8, y - 8) < 5 && (Math.abs(y - 8) < 0.9 || (Math.abs(x - 8) < 0.9 && y > 8))) ? lit(x, y) : null),
    seat: (x, y) => (inR(x, y, 4, 1, 8, 10) || inR(x, y, 4, 9, 13, 12) ? lit(x, y) : inR(x, y, 5, 12, 6, 15) || inR(x, y, 11, 12, 12, 15) ? 'D' : null),
    chassis: (x, y) => (inR(x, y, 1, 7, 15, 9) || inR(x, y, 3, 4, 4, 12) || inR(x, y, 12, 4, 13, 12) ? 'M' : inE(x, y, 3.5, 4, 1.5) || inE(x, y, 12.5, 4, 1.5) || inE(x, y, 3.5, 12, 1.5) || inE(x, y, 12.5, 12, 1.5) ? 'K' : null),
    body: (x, y) => (inR(x, y, 1, 8, 15, 12) || (inR(x, y, 4, 4, 12, 8) && x - 4 > (8 - y) * 0.6 - 0.5 && 12 - x > (8 - y) * 0.6 - 0.5) ? (inR(x, y, 5.5, 5, 10.5, 7.5) ? 'W' : 'M') : null),
    tank: (x, y) => (inR(x, y, 3, 3, 13, 14) ? (inR(x, y, 9, 1, 11, 3) ? 'D' : x < 5 ? 'L' : 'M') : inR(x, y, 9, 1, 11, 3) ? 'D' : null),
    headlight: (x, y) => (inE(x, y, 8, 8, 6, 6) ? (inE(x, y, 8, 8, 4.5, 4.5) ? (inE(x, y, 6.5, 6.5, 1.4) ? 'W' : 'A') : 'D') : null),
    horn: (x, y) => (inR(x, y, 2, 6, 6, 10) ? 'D' : x >= 6 && x < 14 && Math.abs(y - 8) < 1 + (x - 6) * 0.5 ? lit(x, y) : null),
    canister: (x, y) => (inR(x, y, 3, 4, 13, 15) ? (x < 5 ? 'L' : 'M') : inR(x, y, 5, 1, 9, 4) && !inR(x, y, 6, 2, 8, 3) ? 'D' : inR(x, y, 10, 2, 12, 4) ? 'K' : null),
    cloth: (x, y) => (inR(x, y, 2, 3, 14, 13) && y < 13 - Math.sin(x) * 0.6 ? (Math.floor(x + y) % 4 === 0 ? 'L' : 'M') : null),
    wing: (x, y) => (inR(x, y, 1, 6, 15, 10) ? (Math.floor(x) % 4 === 0 ? 'D' : y < 7 ? 'L' : 'M') : null),
    tail: (x, y) => ((inR(x, y, 2, 9, 14, 11) || (inR(x, y, 7, 2, 9, 9) && x - 7 < (y - 2) * 0.4 + 1.2)) ? (Math.floor(x) % 4 === 0 ? 'D' : 'M') : null),
    fuselage: (x, y) => (inE(x, y, 8, 8, 7, 3.2) ? (y < 7 ? 'L' : Math.floor(x) % 4 === 0 ? 'D' : 'M') : null),
    panel: (x, y) => (inR(x, y, 1, 4, 15, 12) ? (inE(x, y, 4.5, 8, 2) || inE(x, y, 11.5, 8, 2) ? (Math.abs(y - 8 + (x - 4.5) * 0.6) < 0.5 || Math.abs(y - 8 - (x - 11.5) * 0.4) < 0.5 ? 'A' : 'W') : 'M') : null),
    stick2: (x, y) => (inE(x, y, 8, 4, 2.5) ? 'M' : inR(x, y, 7.2, 5, 8.8, 13) ? 'W' : inR(x, y, 4, 13, 12, 15) ? 'D' : null),
    cockpit: (x, y) => (inR(x, y, 2, 8, 14, 14) ? 'M' : inE(x, y, 8, 8, 6, 5) && y < 8 ? 'W' : null),
    propeller: (x, y) => (inE(x, y, 8, 8, 1.6) ? 'D' : Math.abs(x - y) < 1.6 && Math.hypot(x - 8, y - 8) < 7.5 ? lit(x, y) : null),
    landing: (x, y) => (inR(x, y, 2, 2, 14, 4) || (Math.abs(x - 4 - (y - 4) * 0.2) < 0.8 && y < 10) || (Math.abs(x - 12 + (y - 4) * 0.2) < 0.8 && y < 10) ? 'M' : inE(x, y, 5, 12, 2.5) || inE(x, y, 11, 12, 2.5) ? 'K' : null),
    screen: (x, y) => (inR(x, y, 1, 3, 15, 13) ? (inR(x, y, 2, 4, 14, 12) ? (x + y < 12 ? 'L' : 'M') : 'K') : null),
    monitor: (x, y) => (inR(x, y, 1, 2, 15, 11) ? (inR(x, y, 2, 3, 14, 10) ? (x + y < 10 ? 'L' : 'A') : 'M') : inR(x, y, 7, 11, 9, 13) || inR(x, y, 4, 13, 12, 14) ? 'D' : null),
    keyboard: (x, y) => (inR(x, y, 1, 5, 15, 12) ? ((Math.floor(x) % 2 && Math.floor(y) % 2) ? 'W' : 'D') : null),
    mouse: (x, y) => (inE(x, y, 8, 9, 4, 5.5) ? (Math.abs(x - 8) < 0.5 && y < 8 ? 'D' : x < 7 ? 'L' : 'M') : Math.abs(x - 8) < 0.6 && y < 4 && y > 1 ? 'D' : null),
    fan: (x, y) => (inR(x, y, 1, 1, 15, 15) ? (Math.hypot(x - 8, y - 8) < 6 ? (Math.sin(Math.atan2(y - 8, x - 8) * 4 + Math.hypot(x - 8, y - 8) * 0.5) > 0 ? 'L' : 'K') : 'M') : null),
    case: (x, y) => (inR(x, y, 4, 1, 12, 15) ? (inR(x, y, 6, 3, 10, 4) ? 'A' : inE(x, y, 8, 7, 1) ? 'L' : x > 11 ? 'D' : 'M') : null),
    cartridge: (x, y) => (inR(x, y, 3, 4, 13, 12) ? (inR(x, y, 5, 6, 8, 10) ? 'K' : 'M') : null),
    pencil: (x, y) => (Math.abs(x + y - 16) < 1.5 ? (x < 4 ? 'K' : x < 5.5 ? 'W' : x > 12 ? 'A' : 'M') : null),
    car: (x, y) => (inR(x, y, 1, 7, 15, 11) || (inR(x, y, 4, 4, 11, 7) && x - 4 > (7 - y) * 0.8 - 0.6) ? (inR(x, y, 6, 4.5, 10, 6.8) ? 'W' : y < 8 ? 'L' : 'M') : inE(x, y, 4, 11.5, 2.2) || inE(x, y, 12, 11.5, 2.2) ? (inE(x, y, 4, 11.5, 0.9) || inE(x, y, 12, 11.5, 0.9) ? 'W' : 'K') : null),
    plane: (x, y) => (inR(x, y, 1, 4, 15, 5.5) || inR(x, y, 1, 9, 15, 10.5) ? 'L' : (inR(x, y, 3, 5.5, 3.8, 9) || inR(x, y, 12.2, 5.5, 13, 9)) ? 'D' : inE(x, y, 8, 7.5, 5.5, 1.6) ? 'M' : inR(x, y, 13, 5, 15, 8) ? 'M' : x < 2 && y > 5 && y < 10 ? 'K' : inE(x, y, 6, 12, 1.2) || inE(x, y, 10, 12, 1.2) ? 'K' : null),
    axle: (x, y) => (Math.abs(y - 8) < 0.8 && x > 3 && x < 13 ? 'M' : inE(x, y, 3, 8, 2.5, 4) || inE(x, y, 13, 8, 2.5, 4) ? 'K' : null),
    pc: (x, y) => (inR(x, y, 1, 4, 4, 14) ? (inR(x, y, 2, 5, 3, 5) ? 'A' : 'D') : inR(x, y, 5, 2, 15, 10) ? (inR(x, y, 6, 3, 14, 9) ? (x + y < 13 ? 'L' : 'A') : 'M') : inR(x, y, 9, 11, 11, 11) ? 'M' : inR(x, y, 6, 12, 15, 14) ? 'W' : null),
    printer: (x, y) => (inR(x, y, 4, 2, 12, 6) ? 'W' : inR(x, y, 1, 6, 15, 12) ? (inR(x, y, 3, 10, 13, 10) ? 'K' : inR(x, y, 12, 7, 13, 8) ? 'G' : 'M') : inR(x, y, 3, 12, 13, 14) ? 'W' : null),
    frame: (x, y) => (inR(x, y, 2, 1, 14, 15) ? (inR(x, y, 4, 3, 12, 13) ? (inR(x, y, 5, 4, 11, 12) ? (Math.floor(y) % 2 && y > 5 ? 'G' : 'W') : 'A') : 'M') : null),
    book: (x, y) => (inR(x, y, 3, 2, 13, 14) ? (x < 5 ? 'D' : inR(x, y, 12, 3, 13, 13) ? 'W' : 'M') : null),
  };
  for (const [id, it] of Object.entries(ITEMS)) {
    if (!it.art) continue;
    const [shape, main, second = '#2a8a3a'] = it.art, m = rgb(main), a = rgb(second);
    const pal = { M: `rgb(${m.join(',')})`, L: mixC(m, [255, 255, 255], 0.4), D: mixC(m, [0, 0, 0], 0.45), A: `rgb(${a.join(',')})`, W: '#f4f4f0', K: '#1a1a1e', G: '#6e6a66' };
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const g = c.getContext('2d');
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const k = S[shape](x + 0.5, y + 0.5); if (k) { g.fillStyle = pal[k]; g.fillRect(x, y, 1, 1); } }
    const d = g.getImageData(0, 0, 16, 16).data, on = (x, y) => x >= 0 && y >= 0 && x < 16 && y < 16 && d[(y * 16 + x) * 4 + 3] > 0;
    g.fillStyle = 'rgba(24,16,12,0.9)';
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (!on(x, y) && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) g.fillRect(x, y, 1, 1);
    icon(id, c);
  }
  // Bloky: měď, zlato, ocel, křemen; pec a dílna
  const T = { copper_block: copperBlockTex, cut_copper: cutCopperTex, gold_block: goldBlockTex, steel_block: steelBlockTex, quartz_block: quartzTex, quartz_pillar: quartzPillarTex };
  const small = Object.fromEntries(Object.entries(T).map(([k, t]) => [k, shrinkTex(t)]));
  for (const k of Object.keys(T)) icon(k, isoBoxes(small[k], small[k], [[0, 0, 0, 16, 16, 16]]));
  for (const [id, b] of Object.entries(BLOCKS)) if (b.shape && small[b.mat] && !ICONS[id]) icon(id, isoBoxes(small[b.mat], small[b.mat], (SHAPES[b.shape].render || SHAPES[b.shape].box).map((bx) => rotBox(bx, 2).map((v) => v * 16))));
  const face = (fn) => { const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d'); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { g.fillStyle = fn(x, y); g.fillRect(x, y, 1, 1); } return c; };
  const cob = shrinkTex(cobbleTex);
  const furnaceFront = face((x, y) => (x >= 4 && x <= 11 && y >= 7 && y <= 12 ? (y > 9 ? '#ff8a2a' : '#2a1a10') : `rgb(${cob.getContext('2d').getImageData(x, y, 1, 1).data.slice(0, 3).join(',')})`));
  icon('furnace', isoBoxes(cob, furnaceFront, [[0, 0, 0, 16, 16, 16]]));
  const plank = shrinkTex(planksTex);
  const advTop = face((x, y) => (x < 2 || y < 2 || x > 13 || y > 13 ? '#5a5f68' : (x + y) % 5 ? '#9aa0aa' : '#7a808a'));
  icon('adv_bench', isoBoxes(advTop, plank, [[0, 0, 0, 16, 16, 16]]));
})();

// ============================================================ ikony elektrických zařízení
(() => {
  const icon = (id, c) => (ICONS[id] = { canvas: c, url: c.toDataURL() });
  const face = (fn) => { const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d'); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const col = fn(x, y); if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } } return c; };
  const FULL = [[0, 0, 0, 16, 16, 16]];
  const steel = (x, y) => ((x + y) % 7 ? '#8a96a4' : '#7a8694');
  const steelF = face(steel);
  const edge = (x, y) => x === 0 || y === 0 || x === 15 || y === 15;
  icon('safe', isoBoxes(face((x, y) => (edge(x, y) ? '#3a424c' : '#4a525c')), face((x, y) => (edge(x, y) ? '#3a424c' : Math.hypot(x - 6.5, y - 7.5) < 2.2 ? '#d8dce4'
    : x === 11 && y > 5 && y < 11 ? '#d8dce4' : x > 1 && x < 14 && y > 1 && y < 14 ? '#5e6874' : '#4a525c')), FULL));
  icon('coal_generator', isoBoxes(steelF, face((x, y) => (edge(x, y) ? '#5a646e' : y > 3 && y < 9 && y % 2 ? '#2a2a30' : y > 10 && y < 13 && x > 4 && x < 11 ? '#ff7a2a' : steel(x, y))), FULL));
  icon('battery_block', isoBoxes(face((x, y) => (x > 2 && x < 7 && y > 6 && y < 9 ? '#d8783a' : x > 9 && x < 13 && y > 6 && y < 9 ? '#d0d0d0' : '#2e3a2e')),
    face((x, y) => (edge(x, y) ? '#1a241a' : x > 4 && x < 11 && y > 2 && y < 14 && y % 3 ? '#3aff5a' : '#2e3a2e')), FULL));
  icon('electric_furnace', isoBoxes(steelF, face((x, y) => (edge(x, y) ? '#5a646e' : x > 3 && x < 12 && y > 6 && y < 12 ? '#ff8a3a' : x > 11 && y < 4 ? '#3aff5a' : steel(x, y))), FULL));
  icon('charger', isoBoxes(face((x, y) => (x > 4 && x < 11 && y > 5 && y < 10 ? '#2a2a30' : '#e8e4dc')), face((x, y) => (x > 10 && x < 13 && y > 4 && y < 7 ? '#ffa020' : '#d8d4cc')), [[1, 0, 2, 15, 8, 14]]));
  icon('motor_block', isoBoxes(steelF, face((x, y) => (Math.hypot(x - 7.5, y - 8.5) < 2 ? '#d82a2a' : Math.hypot(x - 7.5, y - 8.5) < 6.5 ? (x % 3 ? '#8a96a4' : '#5a646e') : y > 13 ? '#2a2a30' : null)), [[1, 0, 1, 15, 14, 15]]));
  icon('solar_panel', isoBoxes(face((x, y) => (x % 5 === 0 || y % 5 === 0 ? '#8aa0c8' : '#1a2a5a')), steelF, [[0, 6, 0, 16, 8, 16], [7, 0, 7, 9, 6, 9]]));
  const cable = (col, dark) => face((x, y) => (Math.abs(x - y) < 2.2 && x > 1 && x < 15 ? (Math.abs(x - y) < 0.8 ? col : dark) : null));
  icon('cable_copper', cable('#e8945a', '#8a4a2a'));
  icon('cable_gold', cable('#ffe07a', '#a8801a'));
  icon('power_switch', face((x, y) => (y > 11 && y < 15 && x > 2 && x < 13 ? '#e8e4dc' : Math.abs(x - 8 - (11 - y) * 0.5) < 1 && y > 3 && y <= 11 ? '#2a2a30' : Math.hypot(x - 11.5, y - 3) < 2 ? '#d82a2a' : null)));
  icon('electric_lamp', face((x, y) => (y < 5 && Math.abs(x - 7.5) < 1 + y * 1.1 ? '#3a5a3a' : Math.hypot(x - 7.5, y - 6) < 2 ? '#fff0b0' : Math.abs(x - 7.5) < 0.8 && y > 6 && y < 14 ? '#2a2a30' : y >= 14 && x > 4 && x < 11 ? '#2a2a30' : null)));
  icon('bulb_lamp', face((x, y) => (Math.abs(x - 7.5) < 0.6 && y < 6 ? '#2a2a30' : x > 6 && x < 9 && y >= 6 && y < 8 ? '#5a5a62' : Math.hypot(x - 7.5, y - 11) < 3.6 ? (Math.hypot(x - 6.5, y - 10) < 1.2 ? '#ffffff' : '#fff0b0') : null)));
})();
