// Pochodně jako v Minecraftu: stojí na horní stěně pevného bloku (nebo na zemi), nebo visí na boční stěně
// nakloněné od zdi, nikdy na stropě. Když zmizí blok, který pochodeň drží, odpadne a spadne jako předmět.
// Jak drží, je v blockMeta (synchronizuje se jako ostatní bloky, ukládá se ve worldState):
//   1 = stojí, 2–5 = visí na zdi ve směru WALL_DIRS[meta − 2], bez meta = stará pochodeň (z doby před pravidly).
import { BLOCKS, shapeBoxes } from '../data/index.js';
import { emit } from '../events.js';
import { popGroundItem } from '../sim/ground-items.js';
import { bkey, blockMeta, blocks, lights } from './state.js';
import { V, getVox, groundHeight, topY } from './voxels.js';

export const TORCH_FLOOR = 1;
/** Směry ke zdi, na které pochodeň visí (meta 2–5). */
export const WALL_DIRS = [[-1, 0, 0], [1, 0, 0], [0, 0, -1], [0, 0, 1]];
/** Náklon pochodně na zdi (22,5° od svislice, jako v Minecraftu). */
export const TORCH_LEAN = Math.PI / 8;
const DIRS6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Plná stěna bloku (souřadnice v buňce 0–1): má některý kvádr tvaru tuhle stěnu celou?
function fullFace(boxes, axis, side) {
  const u = (axis + 1) % 3, w = (axis + 2) % 3;
  return boxes.some((b) => b[axis + side * 3] === side && b[u] === 0 && b[u + 3] === 1 && b[w] === 0 && b[w + 3] === 1);
}
/**
 * Unese buňka pochodeň na své stěně? face = 'top' (pochodeň stojí na ní) nebo směr k pochodni [dx, 0, dz] (pochodeň visí na boku).
 * Nahoře stačí podpora uprostřed (půlblok nahoře, mříže, zábradlí, tabule skla), z boku musí být stěna celá. Kámen a hlína
 * v podzemí drží vždy; stroje, truhly a jiné modely nedrží (kromě pece, ta je celá kostka).
 */
export function holdsTorch(x, y, z, face) {
  const t = blocks.get(bkey(x, y, z));
  if (t) {
    const B = BLOCKS[t];
    if (!B?.solid) return false;
    if (B.special) return t === 'furnace';
    if (!B.shape) return true;
    const boxes = shapeBoxes(B.shape, blockMeta.get(bkey(x, y, z)) || 0);
    if (face === 'top') return boxes.some((b) => b[4] === 1 && b[0] < 0.5 && b[3] > 0.5 && b[2] < 0.5 && b[5] > 0.5);
    const axis = face[0] ? 0 : 2;
    return fullFace(boxes, axis, (face[0] || face[2]) > 0 ? 1 : 0);
  }
  const top = topY(x, z);
  return y <= top && getVox(x, y, z, top) !== V.AIR;
}
/** Má buňka pod sebou podlahu (pevný blok, zeminu nebo povrch terénu / podlahu svatyně)? */
export function floorSupport(x, y, z) {
  if (holdsTorch(x, y - 1, z, 'top')) return true;
  const g = groundHeight(x + 0.5, z + 0.5); // vykopaný sloupec = -Infinity
  return g > y - 0.3 && g < y + 0.9;
}
/** Visí pochodeň v buňce na zdi ve směru d? */
export const wallSupport = (x, y, z, d) => holdsTorch(x + d[0], y, z + d[2], [-d[0], 0, -d[2]]);
/** Drží pochodeň s touhle meta? */
export function torchSupported(x, y, z, meta) {
  if (meta === TORCH_FLOOR) return floorSupport(x, y, z);
  const d = WALL_DIRS[meta - 2];
  return !!d && wallSupport(x, y, z, d);
}
/**
 * Jak se pochodeň v buňce přichytí (jako v Minecraftu): nejdřív ke stěně, na kterou hráč klikl (n = její normála),
 * pak po směrech, kam se hráč dívá (look), od nejbližšího. Strop se přeskočí. Vrací meta, nebo null = nejde položit.
 */
export function torchPlacement(x, y, z, n, look) {
  let order = DIRS6.slice().sort((a, b) => dot(b, look) - dot(a, look));
  if (n) { const first = [-n[0] || 0, -n[1] || 0, -n[2] || 0]; order = [first, ...order.filter((d) => !same(d, first))]; }
  for (const d of order) {
    if (d[1] === 1) continue; // na strop ne
    if (d[1] === -1) { if (floorSupport(x, y, z)) return TORCH_FLOOR; continue; }
    if (wallSupport(x, y, z, d)) return 2 + WALL_DIRS.findIndex((w) => same(w, d));
  }
  return null;
}
/** Stará pochodeň (bez meta): stojí, když má podlahu, jinak visí na první zdi vedle; null = drží jen tak ve vzduchu. */
export function legacyTorchMeta(x, y, z) {
  if (floorSupport(x, y, z)) return TORCH_FLOOR;
  for (let i = 0; i < 4; i++) if (wallSupport(x, y, z, WALL_DIRS[i])) return 2 + i;
  return null;
}
/** Jak pochodeň na klíči k drží (pro model a světlo); stará bez opory stojí. */
export const torchMeta = (k, x, y, z) => blockMeta.get(k) ?? legacyTorchMeta(x, y, z) ?? TORCH_FLOOR;
/** Kde hoří plamen (od středu spodku buňky): stojící uprostřed, na zdi kousek od zdi a výš. */
export function torchFlame(meta) {
  const d = WALL_DIRS[meta - 2];
  return d ? [d[0] * 0.2, 0.84, d[2] * 0.2] : [0, 0.74, 0];
}
/** Malý kvádr pro míření (v buňce 0–1): přes pochodeň jde vytěžit zeď nebo blok za ní. */
export function torchBox(meta) {
  const d = WALL_DIRS[meta - 2];
  if (!d) return [0.36, 0, 0.36, 0.64, 1, 0.64];
  const lo = (v) => (v < 0 ? 0 : v > 0 ? 0.62 : 0.34), hi = (v) => (v < 0 ? 0.38 : v > 0 ? 1 : 0.66);
  return [lo(d[0]), 0.12, lo(d[2]), hi(d[0]), 0.98, hi(d[2])];
}

/** Pochodeň odpadne: zmizí ze světa a vyskočí jako předmět (stejně jako vytěžený blok). */
export function dropTorch(k) {
  const [x, y, z] = k.split(',').map(Number), f = torchFlame(torchMeta(k, x, y, z));
  blocks.delete(k);
  blockMeta.delete(k);
  popGroundItem('torch', 1, x + 0.5 + f[0], y + 0.5, z + 0.5 + f[2]); // vyskočí jako vytěžený blok
  emit('torchDrop', x, y, z);
  emit('blocksChanged');
}
let torchT = 0;
/**
 * Každý krok u toho, kdo drží svět (hra pro jednoho, hostitel, server): pochodně bez opory odpadnou.
 * Stará pochodeň bez meta si napoprvé zapamatuje, jak drží; když nedrží ničeho, zůstane, jak byla.
 */
export function updateTorches(dt) {
  if ((torchT -= dt) > 0) return;
  torchT = 0.2;
  for (const [k, s] of lights) {
    if (s.type !== 'torch') continue;
    const m = blockMeta.get(k);
    if (m === undefined) { const lm = legacyTorchMeta(s.x, s.y, s.z); if (lm !== null) blockMeta.set(k, lm); }
    else if (!torchSupported(s.x, s.y, s.z, m)) dropTorch(k);
  }
}
