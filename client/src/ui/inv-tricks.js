// Triky v inventáři jako v Minecraftu: tažení (rozdělit stack), dvojklik (posbírat), Shift + dvojklik (přesunout vše),
// klávesy 1–9 nad políčkem (prohodit s hotbarem), Q / Ctrl+Q (vyhodit), kolečko nad políčkem (po jednom kusu),
// prostřední tlačítko (vybrat blok ve světě / v kreativním režimu plný stack), řazení, Mezerník = vyrobit znovu,
// náhled receptu při najetí myší. Pravidla políček jsou v shared/inventory.js.
// Modul nic nespouští při načtení: posluchače zapne installInvTricks() z inventory-ui.js.
import { BLOCKS, ITEMS, RECIPES } from '../../../shared/data/index.js';
import { applySpread, gatherInto, maxOf, pickItem, sortSlots, spreadPlan } from '../../../shared/inventory.js';
import { blocks, chestOf, vehicles } from '../../../shared/world/state.js';
import { VOX } from '../../../shared/world/voxels.js';
import { uiSound } from '../audio/ui-sound.js';
import { chatOpen } from '../net/mp-ui.js';
import { pcOpen } from '../pc/computer.js';
import { QUALITY } from '../game/prefs.js';
import { docOpen } from '../pc/doc-view.js';
import { target } from '../player/interaction.js';
import { inv } from '../player/inventory.js';
import { creative, guideOpen, isLocked } from '../player/player.js';
import { renderer } from '../render/renderer.js';
import { dropHeld, throwItem } from '../world/ground-items.js';
import { $ } from './dom.js';
import { toast } from './hud.js';
import { container, cursorEl, fillRecipe, furnaceRefuses, invEl, invOpen, lastRecipe, quickMove, refreshUI, renderCraftArea, renderHotbar, slotClick, takeResult, tipState, ui } from './inventory-ui.js';
import { popSlot, slotInner } from './slots.js';

// Políčka, kam jde rozdělovat tažením (stroje a brnění mají svá pravidla, tam jen klikání)
const SPREAD_OK = (c, i) => c === 'inv' || c === 'chest' || (c === 'craft' && i < ui.size * ui.size) || (c === 'car' && i >= 1);
// Výstupní políčka strojů: z nich se jen bere
const TAKE_ONLY = (c, i) => (c === 'fire' && i === 1) || c === 'kitchen' || (c === 'furnace' && i === 2) || (c === 'power' && i >= 1);
const drag = { on: false, button: 0, cells: [], middle: false };
let shiftDrag = null; // políčka už přesunutá při Shift + tažení
let last = null; // poslední levý klik (kvůli dvojkliku)
let hoverEl = null, f3 = false, wheelT = 0;
const elOf = (c, i) => invEl.querySelector(`.slot[data-c="${c}"][data-i="${i}"]`);
const inDrag = (c, i) => drag.cells.some(([a, b]) => a === c && b === i);
const otherOpen = () => !['inv', 'bench', 'adv'].includes(ui.mode); // je otevřená truhla nebo stroj
const range = (a, b) => Array.from({ length: b - a }, (_, k) => a + k);

// ------------------------------------------------------------ klik na políčko (z inventory-ui.js)
export function slotDown(e, el, button, shift) {
  const c = el.dataset.c, i = +el.dataset.i;
  e.preventDefault();
  setPreview(null);
  drag.on = false;
  if (e.button === 1) return middleDown(c, i);
  const now = e.timeStamp || performance.now(); // čas kliknutí (ne zpracování), ať dvojklik funguje i při trhané hře
  if (button === 0 && last && last.c === c && last.i === i && now - last.t < 450 && last.id) { // dvojklik
    const id = last.id;
    last = null;
    return shift ? moveAll(c, i, id) : gather(c, i, id);
  }
  last = button === 0 ? { c, i, t: now, id: (c === 'kitchen' ? container(c)[0] : container(c)[i])?.id || inv.cursor?.id } : null;
  if (inv.cursor && !shift && (button === 0 || button === 2) && SPREAD_OK(c, i)) { // tažení: rozhodne se až při puštění tlačítka
    Object.assign(drag, { on: true, button, cells: [[c, i]], middle: false });
    paintDrag();
    return;
  }
  slotClick(c, i, button, shift);
  if (shift && button === 0) shiftDrag = new Set([`${c}:${i}`]);
}

/** Dvojklik: posbírá do kurzoru všechny stejné předměty z okna (nejvýš plný stack). */
export function gather(c, i, id) {
  if (!inv.cursor) {
    const arr = container(c), s = arr[c === 'kitchen' ? 0 : i];
    if (!s || TAKE_ONLY(c, i)) return slotClick(c, i, 0, false);
    inv.cursor = s;
    arr[i] = null;
  }
  if (inv.cursor.id !== id) id = inv.cursor.id;
  const arrays = [inv.slots];
  if (['inv', 'bench', 'adv'].includes(ui.mode)) arrays.unshift(ui.craft);
  if (ui.mode === 'chest') arrays.push(chestOf(ui.fireKey));
  const got = gatherInto(inv.cursor, arrays);
  if (got) uiSound.gather();
  ui.ghost = null;
  refreshUI();
  return got;
}

/** Shift + dvojklik: přesune na druhou stranu všechny hromádky předmětu id ze stejné části okna. */
export function moveAll(c, i, id) {
  let idx;
  if (c === 'inv') idx = otherOpen() ? range(0, 36) : i < 9 ? range(0, 9) : range(9, 36);
  else if (c === 'chest' || c === 'craft') idx = range(0, container(c).length);
  else if (c === 'car') idx = range(1, container(c).length);
  else return 0;
  const arr = container(c);
  let moved = 0;
  for (const j of idx) {
    const s = arr[j];
    if (!s || s.id !== id) continue;
    arr[j] = null;
    const n0 = s.n, left = quickMove(c, j, s);
    if (left) arr[j] = { ...s, n: left };
    moved += n0 - left;
  }
  if (moved) uiSound.gather(); else uiSound.deny();
  refreshUI();
  return moved;
}

/** Puštění tlačítka po tažení: jedno políčko = obyčejný klik, víc políček = rozdělit. */
export function spreadCursor(cells, button) {
  if (!inv.cursor) return;
  inv.cursor = applySpread(inv.cursor, cells.map(([c, i]) => [container(c), i]), button);
  if (cells.some(([c]) => c === 'craft')) ui.ghost = null;
  uiSound.spread(cells.length);
  refreshUI();
}
function endDrag() {
  shiftDrag = null;
  if (!drag.on) return;
  drag.on = false;
  const cells = drag.cells;
  drag.cells = [];
  if (drag.middle || !inv.cursor || !cells.length) return refreshUI();
  if (cells.length === 1) { uiSound.put(); return slotClick(cells[0][0], cells[0][1], drag.button, false); } // ťuknutí (bez tažení) se ozve tady
  spreadCursor(cells, drag.button);
}
// Náhled při tažení: políčka svítí a ukazují, kolik v nich bude; kurzor ukazuje, co zbude.
function paintDrag() {
  for (const el of invEl.querySelectorAll('.slot.drag')) el.classList.remove('drag');
  if (!drag.on || !inv.cursor || drag.middle) return;
  const cur = inv.cursor;
  const plan = drag.cells.length > 1 ? spreadPlan(cur, drag.cells.map(([c, i]) => container(c)[i]), drag.button) : null;
  drag.cells.forEach(([c, i], k) => {
    const el = elOf(c, i);
    if (!el) return;
    el.classList.add('drag');
    if (plan?.add[k]) el.innerHTML = slotInner({ id: cur.id, n: (container(c)[i]?.n || 0) + plan.add[k] });
  });
  if (plan) cursorEl.innerHTML = `<div class="slot ${plan.left ? '' : 'spent'}">${slotInner({ id: cur.id, n: plan.left || 1 })}</div>`;
}

// ------------------------------------------------------------ prostřední tlačítko
function middleDown(c, i) {
  if (!creative) return;
  const s = container(c)[i];
  if (!inv.cursor && s) { inv.cursor = { id: s.id, n: maxOf(s.id) }; return refreshUI(); }
  if (inv.cursor && SPREAD_OK(c, i)) { // kreativní tažení prostředním: plný stack do každého prázdného políčka
    Object.assign(drag, { on: true, button: 1, cells: [], middle: true });
    fillFull(c, i);
  }
}
function fillFull(c, i) {
  if (inDrag(c, i)) return;
  drag.cells.push([c, i]);
  const arr = container(c);
  if (!arr[i]) { arr[i] = { id: inv.cursor.id, n: maxOf(inv.cursor.id) }; uiSound.put(); refreshUI(); }
}
// Prostřední tlačítko ve světě: vezmi do ruky to, na co míříš (z batohu; v kreativním režimu i nové).
const ITEM_OF_BLOCK = new Map();
for (const [id, d] of Object.entries(ITEMS)) if (d.block && !ITEM_OF_BLOCK.has(d.block)) ITEM_OF_BLOCK.set(d.block, id);
export function itemForTarget(t) {
  if (!t) return null;
  if (t.kind === 'block') return ITEM_OF_BLOCK.get(t.type) || BLOCKS[t.type]?.drop || null;
  if (t.kind === 'vox') return VOX[t.vox]?.drop?.[0] || null;
  if (t.kind === 'tree') return t.tree?.mark ? 'markwood' : ITEMS[`${t.tree?.kind}_log`] ? `${t.tree.kind}_log` : 'log';
  if (t.kind === 'rock') return t.rock?.iron ? 'iron_ore' : 'stone';
  if (t.kind === 'grass') return 'dirt';
  return null;
}
export function pickBlock(t = target) {
  const id = itemForTarget(t);
  if (!id || !ITEMS[id]) return false;
  const plan = pickItem(inv, id);
  if (!plan) {
    if (!creative) { toast(`V batohu nemáš: ${ITEMS[id].name}`); return false; }
    let h = inv.slots[inv.sel] ? inv.slots.findIndex((s, k) => k < 9 && !s) : inv.sel;
    if (h < 0) h = inv.sel;
    inv.slots[h] = { id, n: maxOf(id) };
    inv.sel = h;
  }
  renderHotbar();
  return true;
}

// ------------------------------------------------------------ klávesy nad políčkem
/** 1–9 nad políčkem: prohodí ho s políčkem hotbaru h (z výstupu stroje jen bere). */
export function swapHot(c, i, h) {
  const arr = container(c), slots = inv.slots;
  if (c === 'kitchen') i = 0;
  if (c === 'inv' && i === h) return false;
  const s = arr[i], t = slots[h];
  if (TAKE_ONLY(c, i)) {
    if (!s) return false;
    if (!t) { slots[h] = s; arr[i] = null; }
    else if (t.id === s.id && t.n < maxOf(t.id)) { const k = Math.min(maxOf(t.id) - t.n, s.n); t.n += k; if (!(s.n -= k)) arr[i] = null; }
    else { uiSound.deny(); return false; }
  } else {
    const bad = (c === 'armor' && t && ITEMS[t.id].armor?.slot !== i) || (c === 'car' && i === 0 && t && !['car_battery', 'car_battery_empty'].includes(t.id))
      || (c === 'power' && i === 0 && t && blocks.get(ui.fireKey) === 'printer' && t.id !== 'paper') || (c === 'furnace' && t && furnaceRefuses(i, t.id));
    if (bad || (!s && !t)) { if (bad) uiSound.deny(); return false; }
    arr[i] = t;
    slots[h] = s;
  }
  if (c === 'craft') ui.ghost = null;
  uiSound.click();
  refreshUI();
  const hb = $('hotbar').children[h];
  if (hb && slots[h]) popSlot(hb);
  return true;
}
/** Q nad políčkem: vyhodí jeden kus, Ctrl+Q celou hromádku. */
export function dropFrom(c, i, all) {
  const arr = container(c);
  if (c === 'kitchen') i = 0;
  const s = arr[i];
  if (!s) return false;
  const n = all ? s.n : 1;
  if (!(s.n -= n)) arr[i] = null;
  throwItem(s.id, n, s.w); // opotřebovaný nástroj letí i se svým opotřebením
  refreshUI();
  return true;
}
// Kolečko nad políčkem: dolů = jeden kus na druhou stranu, nahoru = jeden kus z druhé strany sem.
export function moveOne(c, i) {
  const arr = container(c), s = arr[i];
  if (!s) return false;
  if (!--s.n) arr[i] = null;
  const left = quickMove(c, i, { ...s, n: 1 });
  if (left) { if (arr[i]) arr[i].n++; else arr[i] = { ...s, n: 1 }; uiSound.deny(); return false; }
  uiSound.click();
  refreshUI();
  return true;
}
export function pullOne(c, i) {
  const arr = container(c), s = arr[i];
  if (!s || s.n >= maxOf(s.id)) return false;
  let src;
  if (c === 'inv') src = ui.mode === 'chest' ? [chestOf(ui.fireKey), range(0, 27)] : ui.mode === 'car' && vehicles.get(ui.fireKey) ? [vehicles.get(ui.fireKey).slots, range(1, vehicles.get(ui.fireKey).slots.length)] : [inv.slots, i < 9 ? range(9, 36) : range(0, 9)];
  else if (c === 'chest' || c === 'car') src = [inv.slots, range(0, 36)];
  else return false;
  const [from, idx] = src;
  const j = idx.find((k) => from[k]?.id === s.id);
  if (j === undefined) return false;
  if (!--from[j].n) from[j] = null;
  s.n++;
  uiSound.click();
  refreshUI();
  return true;
}

// ------------------------------------------------------------ řazení a výroba znovu
/** Tlačítko „Seřadit": batoh (bez hotbaru) nebo otevřená truhla. */
export function sortContainer(which) {
  const changed = which === 'chest' ? sortSlots(chestOf(ui.fireKey)) : sortSlots(inv.slots, 9, 36);
  if (!changed) { toast('Už je seřazeno'); return false; }
  uiSound.sort();
  refreshUI();
  const grid = which === 'chest' ? $('craftArea').querySelector('.grid') : $('invGrid');
  grid?.classList.add('sorted');
  setTimeout(() => grid?.classList.remove('sorted'), 450);
  return true;
}
/** Mezerník v okně výroby: vyrob znovu poslední recept rovnou do batohu (Shift = co nejvíc). */
export function repeatRecipe(all) {
  if (!['inv', 'bench', 'adv'].includes(ui.mode) || !lastRecipe) return false;
  fillRecipe(lastRecipe, all);
  takeResult(true);
  return true;
}

// ------------------------------------------------------------ náhled receptu v mřížce (najetí na recept)
let pv = null;
export const previewGhost = () => pv?.ghost || null;
export const previewRecipe = () => pv?.recipe || null;
function setPreview(r) {
  if ((pv?.recipe || null) === r) return;
  if (r && (r.w > ui.size || r.h > ui.size || ui.craft.some(Boolean))) r = null;
  if ((pv?.recipe || null) === r) return;
  pv = r ? { recipe: r, ghost: Array(9).fill(null) } : null;
  if (r) r.pat.forEach((row, y) => row.forEach((id, x) => { pv.ghost[y * ui.size + x] = id; }));
  if (['inv', 'bench', 'adv'].includes(ui.mode)) renderCraftArea();
}

/** Volá renderInventory po každém překreslení okna. */
export function afterRender() { paintDrag(); }

export function installInvTricks() {
  document.body.classList.add(`gfx-${QUALITY}`); // nízká grafika: okna bez rozmazaného pozadí
  invEl.addEventListener('mouseover', (e) => {
    const el = e.target.closest?.('.slot[data-c][data-i]');
    hoverEl = el && el.dataset.c !== 'cursor' ? el : null;
    const rc = e.target.closest?.('[data-r]');
    if (rc) setPreview(RECIPES[+rc.dataset.r]);
    else if (!e.target.closest?.('#recipes')) setPreview(null);
    if (!hoverEl) return;
    const c = hoverEl.dataset.c, i = +hoverEl.dataset.i;
    if (drag.on && drag.middle && (e.buttons & 4) && SPREAD_OK(c, i)) fillFull(c, i);
    else if (drag.on && (e.buttons & (drag.button === 2 ? 2 : 1)) && !inDrag(c, i) && SPREAD_OK(c, i)) { drag.cells.push([c, i]); paintDrag(); }
    else if (shiftDrag && (e.buttons & 1) && e.shiftKey && !shiftDrag.has(`${c}:${i}`) && container(c)[i]) { shiftDrag.add(`${c}:${i}`); slotClick(c, i, 0, true); }
  });
  invEl.addEventListener('mouseleave', () => { hoverEl = null; });
  addEventListener('mouseup', endDrag);
  invEl.addEventListener('wheel', (e) => {
    const el = e.target.closest('.slot[data-c][data-i]');
    if (!el || inv.cursor || !['inv', 'chest', 'car'].includes(el.dataset.c)) return;
    e.preventDefault();
    const now = performance.now();
    if (now - wheelT < 45) return;
    wheelT = now;
    if (e.deltaY > 0) moveOne(el.dataset.c, +el.dataset.i); else pullOne(el.dataset.c, +el.dataset.i);
  }, { passive: false });
  // Klávesy: v zachytávací fázi, ať je okno inventáře dostane dřív než ovládání hráče
  addEventListener('keyup', (e) => { if (e.code === 'F3') f3 = false; }, true);
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.code === 'F3') { f3 = true; if (invOpen) e.preventDefault(); return; }
    if (invOpen) {
      const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (e.code === 'KeyH' && f3) { stop(); tipState.adv = !tipState.adv; toast(`Rozšířené popisky: ${tipState.adv ? 'zapnuto' : 'vypnuto'}`); return; }
      const m = e.code.match(/^Digit([1-9])$/);
      if (m && hoverEl) { stop(); if (!e.repeat) swapHot(hoverEl.dataset.c, +hoverEl.dataset.i, +m[1] - 1); return; }
      if (e.code === 'KeyQ' && hoverEl) { stop(); dropFrom(hoverEl.dataset.c, +hoverEl.dataset.i, e.ctrlKey || e.metaKey); return; }
      if (e.code === 'Space') { stop(); if (!e.repeat) repeatRecipe(e.shiftKey); return; }
      return;
    }
    // Q ve hře: vyhodit předmět z ruky (Ctrl+Q celý stack); G a Shift+G fungují dál
    const playing = (isLocked() || window.game?.testMode) && !guideOpen && !pcOpen && !docOpen && !chatOpen;
    if (e.code === 'KeyQ' && !e.repeat && playing) { e.preventDefault(); dropHeld(e.ctrlKey || e.metaKey); }
  }, true);
  renderer.domElement.addEventListener('mousedown', (e) => { if (e.button === 1 && isLocked()) { e.preventDefault(); pickBlock(); } });
}
// Pro testy a konzoli (window.game.invTricks)
export const invTricks = { refresh: refreshUI, gather, moveAll, spreadCursor, swapHot, dropFrom, moveOne, pullOne, sortContainer, repeatRecipe, pickBlock, itemForTarget, previewRecipe };
