// Batoh hráče a hledání receptu v mřížce.
import '../audio/sound.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { ITEMS, RECIPES } from '../../../shared/data/index.js';
import { part } from '../../../shared/tools.js';
import { save } from '../game/save-load.js';
import { feed, toast } from '../ui/hud.js';
import { renderHotbar, renderInventory } from '../ui/inventory-ui.js';
import { creative } from './player.js';

// ============================================================ inventář
// off = druhá ruka (štít, pochodeň, bloky… klávesa F prohodí s rukou; offhand.js). Jako pole s jedním políčkem, ať s ním okno umí jako s ostatními.
export const inv = { slots: save?.inv || Array(36).fill(null), sel: 0, cursor: null, off: [save?.off || null] };
export const countItem = (id) => inv.slots.reduce((n, s) => n + (s && s.id === id ? s.n : 0), 0);
export function insertInto(stack, from, to) {
  const max = ITEMS[stack.id].stack;
  for (let i = from; i < to && stack.n > 0; i++) {
    const s = inv.slots[i];
    if (s && s.id === stack.id && s.n < max) { const k = Math.min(max - s.n, stack.n); s.n += k; stack.n -= k; }
  }
  for (let i = from; i < to && stack.n > 0; i++) {
    if (!inv.slots[i]) { const k = Math.min(max, stack.n); inv.slots[i] = part(stack, k); stack.n -= k; }
  }
  return stack.n;
}
// (vložení do truhly: insertStack v shared/inventory.js)
export function addItem(id, n, silent = false, w = 0) {
  const left = insertInto(w > 0 ? { id, n, w } : { id, n }, 0, 36);
  if (!silent && n - left > 0) feed(id, `+${n - left} ${ITEMS[id].name}`);
  if (left > 0) toast('Batoh je plný');
  renderHotbar();
  renderInventory();
  return left;
}
// Vrátí do batohu celé políčko i s opotřebením nástroje (z truhly, mřížky, kurzoru, ze země…).
export const addStack = (s, silent = true) => addItem(s.id, s.n, silent, s.w || 0);
export function removeItem(id, n) {
  for (let i = 35; i >= 0 && n > 0; i--) {
    const s = inv.slots[i];
    if (s && s.id === id) { const k = Math.min(s.n, n); s.n -= k; n -= k; if (!s.n) inv.slots[i] = null; }
  }
}
export function consumeSelected() {
  const s = inv.slots[inv.sel];
  if (!s) return;
  if (!creative && --s.n <= 0) inv.slots[inv.sel] = null;
  renderHotbar();
}
export const heldStack = () => inv.slots[inv.sel];

// Kolik kusů které suroviny recept potřebuje.
export function recipeNeeds(r) {
  const need = {};
  for (const row of r.pat) for (const id of row) if (id) need[id] = (need[id] || 0) + 1;
  return need;
}
export const hasFor = (r) => Object.entries(recipeNeeds(r)).every(([id, n]) => countItem(id) >= n);

// Najde recept podle toho, co leží v mřížce (tvar se porovnává oříznutý a i zrcadlově).
export function findRecipe(grid, size) {
  let x0 = size, y0 = size, x1 = -1, y1 = -1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (grid[y * size + x]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const at = (x, y) => grid[(y0 + y) * size + x0 + x]?.id ?? null;
  for (const r of RECIPES) {
    if (r.w !== w || r.h !== h) continue;
    let same = true, mirror = true;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (r.pat[y][x] !== at(x, y)) same = false;
      if (r.pat[y][w - 1 - x] !== at(x, y)) mirror = false;
    }
    if (same || mirror) return r;
  }
  return null;
}
