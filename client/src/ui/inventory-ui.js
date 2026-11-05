// Okno inventáře: výroba, kniha receptů, truhla, táborák.
import '../player/inventory.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { ARMOR_SLOTS, ARMOR_SLOT_NAMES, COOKING, COOK_TIME, FUEL, FURNACE_ONLY, ITEMS, KITCHEN, RECIPES, RECIPE_CATS, smeltResult } from '../../../shared/data/index.js';
import { insertStack } from '../../../shared/inventory.js';
import { durLeft, maxDur, repairResult } from '../../../shared/tools.js';
import { NET } from '../../../shared/net/net.js';
import { others } from '../../../shared/net/room.js';
import { powerOf } from '../../../shared/sim/power.js';
import { blocks, chestOf, fireOf, furnaceOf, stoveOf, vehicles } from '../../../shared/world/state.js';
import { Sound } from '../audio/sound.js';
import { toolSound } from '../audio/tool-sounds.js';
import { MP } from '../game/boot.js';
import { SAVE_KEY } from '../game/prefs.js';
import { save } from '../game/save-load.js';
import { fillFurnace, renderFurnace } from '../machines/furnace.js';
import { kitchenMissing, renderKitchen, startCooking } from '../machines/kitchen.js';
import { renderPowerUI } from '../machines/power.js';
import { addItem, countItem, findRecipe, hasFor, insertInto, inv, recipeNeeds, removeItem } from '../player/inventory.js';
import { creative, input, lockPointer, setCreative, setResetting, unlockPointer } from '../player/player.js';
import { enterVehicle, renderCarUI } from '../vehicles/car.js';
import { garageClick, renderGarageUI } from '../vehicles/garage.js';
import { throwItem } from '../world/ground-items.js';
import { crafted } from '../world/world-state.js';
import { countBucket, track } from './analytics.js';
import { $ } from './dom.js';
import { feed, toast } from './hud.js';
import { btnOf, fitInventory, shiftOf } from './touch.js';
import { uiSound } from '../audio/ui-sound.js';
import { tooltipHTML } from './item-tooltip.js';
import { iconImg, paintHotbar, slotHTML, slotInner } from './slots.js';
import { clearBookSearch, filterBook, installBookSearch } from './book-search.js';
import { afterRender, installInvTricks, previewGhost, previewRecipe, slotDown, sortContainer } from './inv-tricks.js';
export { iconImg, slotHTML };

// ============================================================ HUD – inventář, výroba, táborák (styl Minecraft)
export const invEl = $('inventory'), cursorEl = $('cursorItem');
export let invOpen = false;
// mode: 'inv' = inventář s brněním a mřížkou 2×2, 'bench' = pracovní stůl 3×3, 'fire' = táborák, 'chest' = truhla
export const ui = { mode: 'inv', size: 2, craft: Array(9).fill(null), fireKey: null, ghost: null, cat: 'all' };
export const armor = save?.armor || [null, null, null, null]; // helma, brnění, kalhoty, boty
export const armorPoints = () => armor.reduce((n, s) => n + (s ? ITEMS[s.id].armor.pts : 0), 0);
// Celá sada speciálního brnění (všechny 4 kusy stejné sady) dává bonus.
export const fullSet = () => { const s0 = armor[0] && ITEMS[armor[0].id].armor.set; return s0 && armor.every((a) => a && ITEMS[a.id].armor.set === s0) ? s0 : null; };
export const container = (c) => ({ inv: () => inv.slots, craft: () => ui.craft, armor: () => armor, chest: () => chestOf(ui.fireKey), fire: () => fireOf(ui.fireKey).slots, furnace: () => furnaceOf(ui.fireKey).slots, power: () => powerOf(ui.fireKey).slots || [], car: () => vehicles.get(ui.fireKey)?.slots || [], kitchen: () => stoveOf(ui.fireKey).slots })[c]();

export function renderHotbar() { paintHotbar(inv.slots, inv.sel); }
/** Pec bere nahoru jen to, co se taví, a dolů jen palivo (jako v Minecraftu). Vrací důvod odmítnutí, nebo null. */
export const furnaceRefuses = (i, id) => (i === 0 && !smeltResult(id) ? 'Tohle se v peci tavit nedá'
  : i === 1 && !FUEL[id] ? 'Tohle nehoří. Palivo je uhlí, dřevěné uhlí, dřevo nebo prkna.' : null);

let onlyCraftable = false;
// Složité součástky (adv) jdou vyrobit jen v dílně
// Když mřížka nesedí na recept, zkusí se oprava (dva stejné nástroje nebo nástroj + surovina, shared/tools.js).
const currentResult = () => {
  if (ui.mode === 'fire' || ui.mode === 'furnace') return null;
  const r = findRecipe(ui.craft, ui.size);
  if (r) return r.adv && ui.mode !== 'adv' ? null : r;
  return repairResult(ui.craft);
};
const resultStack = (r) => (r.repair ? { id: r.out, n: 1, ...(r.w > 0 ? { w: r.w } : {}) } : { id: r.out, n: r.n });
export function renderCraftArea() {
  const area = $('craftArea');
  if (ui.mode === 'kitchen') return renderKitchen(area);
  if (ui.mode === 'furnace') return renderFurnace(area);
  if (ui.mode === 'power') return renderPowerUI(area);
  if (ui.mode === 'car') return renderCarUI(area);
  if (ui.mode === 'garage') return renderGarageUI(area, ui.fireKey);
  if (ui.mode === 'chest') {
    const c = chestOf(ui.fireKey);
    area.innerHTML = `<div class="mc-title">Truhla <button class="mc-btn mini" data-sort="chest" title="Sloučí a seřadí předměty v truhle"><i class="ico-sort"></i>Seřadit</button></div><div class="grid">${c.map((s, i) => slotHTML(s, i, '', 'chest')).join('')}</div><div class="mc-note">Shift + klik přesune předmět mezi truhlou a batohem · Shift + 2× klik přesune všechny stejné.</div>`;
    return;
  }
  if (ui.mode === 'fire') {
    const f = fireOf(ui.fireKey), [inp, out] = f.slots;
    const cooking = inp && COOKING[inp.id];
    const p = cooking ? (f.t / COOK_TIME) * 100 : 0;
    area.innerHTML = `<div class="mc-title">Táborák</div>
      <div class="fire-ui">
        <div class="fire-col">${slotHTML(inp, 0, '', 'fire')}<div class="flame ${cooking ? 'on' : ''}">${iconImg('campfire')}</div></div>
        <div class="parrow"><i style="width:${p}%"></i></div>
        ${slotHTML(out, 1, 'out', 'fire')}
      </div>
      <div class="mc-note">${cooking ? 'Peče se…' : 'Vlož syrové maso nebo železnou rudu.'}</div>`;
    return;
  }
  const n = ui.size;
  let cells = '';
  for (let i = 0; i < n * n; i++) {
    const s = ui.craft[i];
    const pv = previewGhost();
    const g = !s && (ui.ghost || pv) ? (ui.ghost || pv)[i] : null;
    cells += s ? slotHTML(s, i, '', 'craft') : `<div class="slot ${g ? 'ghost' : ''}" data-c="craft" data-i="${i}">${g ? iconImg(g) : ''}</div>`;
  }
  const r = currentResult(), pr = !r && previewRecipe();
  // Brnění (jen v inventáři): 4 políčka, prázdná ukazují obrys.
  const armorCol = ui.mode !== 'inv' ? '' : `<div class="armor-col">${armor.map((s, i) => s ? slotHTML(s, i, '', 'armor')
    : `<div class="slot ghost" data-c="armor" data-i="${i}" title="${ARMOR_SLOT_NAMES[i]}">${iconImg(`iron_${ARMOR_SLOTS[i]}`)}</div>`).join('')}
    <div class="armor-pts">🛡 ${armorPoints()}</div><button class="mc-btn cos-open" id="costumeBtn" title="Můj oblek (O)">Oblek</button></div>`;
  area.innerHTML = `<div class="mc-title">${ui.mode === 'adv' ? 'Dílna (pokročilý pracovní stůl)' : ui.mode === 'bench' ? 'Pracovní stůl' : 'Brnění a výroba'}</div>
    <div class="craft-ui">${armorCol}
      <div class="cgrid" style="grid-template-columns: repeat(${n}, 40px)">${cells}</div>
      <span class="carrow">➜</span>
      <div class="out-col"><div class="slot out ${r ? 'ready' : pr ? 'ghost' : ''}${r?.repair ? ' repair' : ''}" data-out="1" ${r ? `data-item="${r.out}"` : ''}>${r ? (r.repair ? slotInner(resultStack(r)) : iconImg(r.out) + (r.n > 1 ? `<b>${r.n}</b>` : '')) : pr ? iconImg(pr.out) : ''}</div>
        <small class="out-hint">${r ? (r.repair ? '🔧 Oprava' : 'Shift + klik = vyrob vše') : ''}</small></div>
    </div>
    <div class="mc-note">${r?.repair ? `<span class="repair-note">🔧 Oprava: ${ITEMS[r.out].name} bude mít odolnost ${durLeft(resultStack(r))} / ${maxDur(r.out)}</span>` : ui.mode === 'adv' ? 'Mřížka 3×3 – všechny recepty včetně složitých součástek.' : ui.mode === 'bench' ? 'Mřížka 3×3. Složité součástky (motory, obvody…) vyrobíš v dílně.' : 'Větší recepty vyrobíš u pracovního stolu.'}</div>`;
}
// Záložky kategorií receptů nad knihou
function renderCatTabs(show) {
  let el = $('catTabs');
  if (!el) { el = document.createElement('div'); el.id = 'catTabs'; el.className = 'cat-tabs'; $('recipes').before(el); }
  el.style.display = show ? '' : 'none';
  if (!show) return;
  const cats = Object.keys(RECIPE_CATS).filter((c) => c === 'all' || RECIPES.some((r) => r.cat === c));
  const html = cats.map((c) => `<button class="mc-btn ${ui.cat === c ? 'on' : ''}" data-cat="${c}">${RECIPE_CATS[c]}</button>`).join('');
  if (el.innerHTML !== html) el.innerHTML = html;
}
function renderBook() {
  document.querySelector('.mc-book').style.display = ui.mode === 'chest' || ui.mode === 'power' || ui.mode === 'car' || ui.mode === 'garage' ? 'none' : '';
  if (ui.mode === 'power' || ui.mode === 'car' || ui.mode === 'garage') return;
  renderCatTabs(['inv', 'bench', 'adv'].includes(ui.mode) && !(creative && ui.mode === 'inv'));
  if (ui.mode === 'chest') return;
  if (ui.mode === 'kitchen') {
    $('onlyCraftable').parentElement.style.display = 'none';
    $('bookTitle').textContent = 'Kuchařka';
    $('recipes').innerHTML = KITCHEN.map((r, i) => `<div class="slot ${kitchenMissing(r).length ? 'no' : ''} ${i === ui.kSel ? 'sel' : ''}" data-k="${i}" data-item="${r.out}">${iconImg(r.out)}</div>`).join('');
    $('bookHint').textContent = 'Klikni na jídlo – vpravo uvidíš postup, suroviny a nádobí. Červené = něco chybí.';
    return;
  }
  $('onlyCraftable').parentElement.style.display = ui.mode === 'fire' || ui.mode === 'furnace' ? 'none' : '';
  if (ui.mode === 'furnace') {
    $('bookTitle').textContent = 'Tavení v peci';
    const src = [...new Set([...Object.keys(FURNACE_ONLY), ...Object.keys(COOKING)])].filter((id) => ITEMS[id]);
    $('recipes').innerHTML = src.map((from) => `<div class="slot ${countItem(from) ? '' : 'no'}" data-fur="${from}" data-item="${smeltResult(from)}">${iconImg(smeltResult(from))}</div>`).join('');
    $('bookHint').textContent = 'Klikni a surovina se vloží do pece (chybí-li palivo, přidá se uhlí nebo dřevo z batohu).';
    return;
  }
  if (ui.mode === 'fire') {
    $('bookTitle').textContent = 'Pečení a tavení';
    $('recipes').innerHTML = Object.entries(COOKING).map(([from, to]) =>
      `<div class="slot ${countItem(from) ? '' : 'no'}" data-cook="${from}" data-item="${to}">${iconImg(to)}</div>`).join('');
    $('bookHint').textContent = 'Klikni a suroviny se vloží do táboráku.';
    return;
  }
  if (creative && ui.mode === 'inv') {
    $('onlyCraftable').parentElement.style.display = 'none';
    $('bookTitle').textContent = 'Všechny předměty';
    $('recipes').innerHTML = Object.keys(ITEMS).filter((id) => !ITEMS[id].hidden).map((id) => `<div class="slot" data-give="${id}" data-item="${id}">${iconImg(id)}</div>`).join('');
    $('bookHint').textContent = 'Kreativní režim: klik = vezmi plný stack, Shift + klik = rovnou do batohu.';
    return;
  }
  $('bookTitle').textContent = ui.mode === 'adv' ? 'Recepty – dílna' : 'Recepty';
  $('recipes').innerHTML = RECIPES.map((r, i) => {
    if (ui.cat !== 'all' && r.cat !== ui.cat) return '';
    const fits = r.w <= ui.size && r.h <= ui.size && (!r.adv || ui.mode === 'adv');
    const ok = fits && hasFor(r);
    if (onlyCraftable && !ok) return '';
    return `<div class="slot ${ok ? '' : 'no'}" data-r="${i}" data-item="${r.out}">${iconImg(r.out)}${r.n > 1 ? `<b>${r.n}</b>` : ''}</div>`;
  }).join('');
  $('bookHint').textContent = 'Klikni na recept a suroviny se samy rozloží do mřížky (Shift = víc najednou).';
}
export function renderInventory() {
  if (!invOpen) return;
  let html = '';
  for (let i = 9; i < 36; i++) html += slotHTML(inv.slots[i], i);
  $('invGrid').innerHTML = html;
  html = '';
  for (let i = 0; i < 9; i++) html += slotHTML(inv.slots[i], i);
  $('invHot').innerHTML = html;
  renderCraftArea();
  renderBook();
  filterBook();
  cursorEl.innerHTML = inv.cursor ? slotHTML(inv.cursor, -1, '', 'cursor') : '';
  cursorEl.style.display = inv.cursor ? 'block' : 'none';
  afterRender();
  fitInventory();
}

// Tooltip s názvem, popisem a vlastnostmi předmětu (item-tooltip.js).
const tooltip = $('tooltip');
export const tipState = { adv: false, el: null };
const stackAt = (el) => { if (el.dataset.out) { const r = currentResult(); return r ? resultStack(r) : null; } const c = el.dataset.c, i = +el.dataset.i; if (!c || c === 'cursor' || Number.isNaN(i)) return null; try { return container(c)?.[i] || null; } catch { return null; } };
export function showTooltip(el) {
  tipState.el = el;
  if (!el || !invOpen || inv.cursor) { tooltip.style.display = 'none'; return; }
  const id = el.dataset.item;
  tooltip.innerHTML = tooltipHTML(id, stackAt(el), el, ui, tipState.adv);
  tooltip.className = `rar${tooltip.querySelector('.name')?.className.match(/rar(\d)/)?.[1] || 0}`;
  tooltip.style.display = 'block';
}
addEventListener('mouseover', (e) => {
  const el = e.target.closest?.('[data-item]');
  if (!el || !invOpen || el.closest('#cursorItem') || el.closest('#hotbar')) { tooltip.style.display = 'none'; tipState.el = null; return; }
  showTooltip(el);
});
addEventListener('mousemove', (e) => {
  // tooltip u myši, ale nikdy mimo obrazovku
  const w = tooltip.offsetWidth || 240, h = tooltip.offsetHeight || 60;
  tooltip.style.left = (e.clientX + 16 + w > innerWidth ? e.clientX - w - 12 : e.clientX + 16) + 'px';
  tooltip.style.top = Math.max(6, Math.min(innerHeight - h - 6, e.clientY - 30)) + 'px';
  cursorEl.style.left = e.clientX + 'px';
  cursorEl.style.top = e.clientY + 'px';
  // po položení předmětu (nebo překreslení okna) ukaž tooltip políčka pod myší znovu
  if (invOpen && !inv.cursor && tooltip.style.display !== 'block') {
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-item]');
    if (el && !el.closest('#hotbar') && !el.closest('#cursorItem')) showTooltip(el);
  }
});
$('onlyCraftable').addEventListener('change', (e) => { onlyCraftable = e.target.checked; renderInventory(); });
installBookSearch();

// Rychlý přesun (Shift + klik) hromádky s z políčka (c, i) na „druhou stranu" okna. Vrací, kolik kusů se nevešlo.
// Truhla, stroj nebo auto → batoh; batoh → otevřená truhla / stroj / brnění; jinak hotbar ↔ batoh.
export function quickMove(c, i, s) {
  let left = s.n;
  const piece = ITEMS[s.id].armor;
  if (c !== 'inv') left = insertInto(s, 0, 36);
  else if (ui.mode === 'inv' && piece && !armor[piece.slot]) { armor[piece.slot] = s; left = 0; }
  else if (ui.mode === 'chest') left = insertStack(chestOf(ui.fireKey), s);
  else if (ui.mode === 'car' && vehicles.get(ui.fireKey)) { // do kufru (autobaterie do jejího místa)
    const sl = vehicles.get(ui.fireKey).slots;
    if (!sl[0] && vehicles.get(ui.fireKey).type === 'car' && (s.id === 'car_battery' || s.id === 'car_battery_empty')) { sl[0] = s; left = 0; }
    else {
      for (let j = 1; j < sl.length && left; j++) if (sl[j]?.id === s.id) { const k = Math.min(ITEMS[s.id].stack - sl[j].n, left); sl[j].n += k; left -= k; }
      for (let j = 1; j < sl.length && left; j++) if (!sl[j]) { sl[j] = { id: s.id, n: left }; left = 0; }
    }
  } else if (ui.mode === 'power' && powerOf(ui.fireKey).slots) { // palivo do generátoru, surovina do el. pece, vybitá baterie do nabíječky
    const st = powerOf(ui.fireKey), t = blocks.get(ui.fireKey);
    const ok = t === 'coal_generator' ? FUEL[s.id] : t === 'electric_furnace' ? smeltResult(s.id) : t === 'printer' ? s.id === 'paper' : s.id === 'car_battery_empty';
    if (ok && !st.slots[0]) { st.slots[0] = s; left = 0; }
    else if (ok && st.slots[0].id === s.id) { const k = Math.min(ITEMS[s.id].stack - st.slots[0].n, s.n); st.slots[0].n += k; left = s.n - k; }
  } else if (ui.mode === 'furnace' && (smeltResult(s.id) || FUEL[s.id])) { // surovina nahoru, palivo dolů; dřevo bez místa nahoře jde do paliva
    const f = furnaceOf(ui.fireKey);
    for (const j of [0, 1]) {
      if (!left || furnaceRefuses(j, s.id)) continue;
      const t = f.slots[j];
      if (!t) { f.slots[j] = { ...s, n: left }; left = 0; }
      else if (t.id === s.id) { const k = Math.min(ITEMS[s.id].stack - t.n, left); t.n += k; left -= k; }
    }
  } else if (ui.mode === 'fire' && COOKING[s.id]) {
    const f = fireOf(ui.fireKey);
    if (!f.slots[0]) { f.slots[0] = s; left = 0; }
    else if (f.slots[0].id === s.id) { const k = Math.min(ITEMS[s.id].stack - f.slots[0].n, s.n); f.slots[0].n += k; left = s.n - k; }
  } else left = i < 9 ? insertInto(s, 9, 36) : insertInto(s, 0, 9);
  return left;
}
// Klik na políčko: vzít / položit / prohodit / sloučit, pravé = půlka nebo po jednom, Shift = rychlý přesun.
export function slotClick(c, i, button, shift) {
  const arr = container(c);
  const s = arr[i];
  if ((c === 'fire' && i === 1) || c === 'kitchen' || (c === 'furnace' && i === 2) || (c === 'power' && i >= 1)) { // výstup táboráku, pece a sporáku se jen vybírá
    if (c === 'kitchen') i = 0;
    if (!s) return;
    if (shift) { arr[i] = null; const left = insertInto(s, 0, 36); if (left) arr[i] = { ...s, n: left }; }
    else if (!inv.cursor) { inv.cursor = s; arr[i] = null; }
    else if (inv.cursor.id === s.id) { const k = Math.min(ITEMS[s.id].stack - inv.cursor.n, s.n); inv.cursor.n += k; if (!(s.n -= k)) arr[i] = null; }
    if (shift) uiSound.click(); // obyčejné vzetí ozvučí audio/ui-sounds.js
    return refreshUI();
  }
  const deny = (text) => { uiSound.deny(); if (text) toast(text); };
  if (c === 'armor' && inv.cursor && ITEMS[inv.cursor.id].armor?.slot !== i) return deny(ITEMS[inv.cursor.id].armor ? `Sem patří: ${ARMOR_SLOT_NAMES[i]}` : 'Sem patří jen brnění'); // do políčka jen správný kus brnění
  if (c === 'power' && i === 0 && inv.cursor && blocks.get(ui.fireKey) === 'printer' && inv.cursor.id !== 'paper') return deny('Do tiskárny patří papír'); // do tiskárny jen papír
  if (c === 'car' && i === 0 && inv.cursor && !['car_battery', 'car_battery_empty'].includes(inv.cursor.id)) return deny('Sem patří autobaterie'); // místo na autobaterii
  if (c === 'furnace' && inv.cursor && furnaceRefuses(i, inv.cursor.id)) return deny(furnaceRefuses(i, inv.cursor.id)); // surovina nahoru, palivo dolů
  if (shift && s && !inv.cursor) {
    arr[i] = null;
    const n0 = s.n, left = quickMove(c, i, s);
    if (left === n0) uiSound.deny(); else uiSound.click();
    if (left) arr[i] = { ...s, n: left };
  } else if (button === 2) {
    if (inv.cursor) {
      if (!s) arr[i] = { ...inv.cursor, n: 1 };
      else if (s.id === inv.cursor.id && s.n < ITEMS[s.id].stack) s.n++;
      else if (s.id !== inv.cursor.id) { arr[i] = inv.cursor; inv.cursor = s; if (c === 'craft') ui.ghost = null; return refreshUI(); } // jiný předmět: prohodí se (jako levým)
      else return;
      if (--inv.cursor.n <= 0) inv.cursor = null;
    } else if (s) {
      const half = Math.ceil(s.n / 2);
      inv.cursor = { ...s, n: half };
      if (!(s.n -= half)) arr[i] = null;
    }
  } else if (!inv.cursor) {
    if (s) { inv.cursor = s; arr[i] = null; }
  } else if (!s) {
    arr[i] = inv.cursor; inv.cursor = null;
  } else if (s.id === inv.cursor.id && ITEMS[s.id].stack > 1) {
    const k = Math.min(ITEMS[s.id].stack - s.n, inv.cursor.n);
    s.n += k;
    if ((inv.cursor.n -= k) <= 0) inv.cursor = null;
  } else {
    arr[i] = inv.cursor; inv.cursor = s;
  }
  if (c === 'craft') ui.ghost = null;
  refreshUI();
}
export function refreshUI() { renderInventory(); renderHotbar(); }
addEventListener('rise-icons', () => refreshUI()); // nové 3D ikony bloků (render/icon-render.js)

// Vybrání výsledku z výstupního políčka spotřebuje po jednom kusu z každého políčka mřížky.
// Kolik kusů předmětu se ještě vejde do batohu
const roomIn = (id) => inv.slots.reduce((k, s) => k + (!s ? ITEMS[id].stack : s.id === id ? ITEMS[id].stack - s.n : 0), 0);
export let lastRecipe = null; // Mezerník v okně = vyrobit znovu
export function takeResult(shift) {
  let r = currentResult();
  if (!r) return;
  lastRecipe = r;
  let made = 0;
  do {
    if (shift) { if (roomIn(r.out) < r.n) break; insertInto(resultStack(r), 0, 36); }
    else if (!inv.cursor) inv.cursor = resultStack(r);
    else if (!r.repair && inv.cursor.id === r.out && inv.cursor.n + r.n <= ITEMS[r.out].stack) inv.cursor.n += r.n;
    else break;
    for (let i = 0; i < ui.craft.length; i++) if (ui.craft[i] && !--ui.craft[i].n) ui.craft[i] = null;
    crafted[r.out] = true;
    made++;
  } while (shift && made < 64 && currentResult() === r);
  if (made) { if (r.repair) toolSound('repair'); else Sound.craft(); }
  if (made) track('item_crafted', { kind: r.repair ? 'repair' : 'craft', amount: countBucket(r.n * made) });
  if (shift && made) feed(r.out, `+${made * r.n} ${ITEMS[r.out].name}`);
  if (shift && currentResult() === r && made < 64) toast('Batoh je plný');
  refreshUI();
}

// Kniha receptů: rozloží suroviny do mřížky (jako recipe book v Minecraftu).
// Vrátí předměty do batohu; co se nevejde, vypadne na zem (dřív se ztratilo).
// w = opotřebení nástroje (zůstane i v batohu, i když se nevejde a vypadne na zem)
export function giveOrDrop(id, n, w = 0) { const left = addItem(id, n, true, w); if (left > 0) throwItem(id, left, w); }
function returnGrid() {
  for (let i = 0; i < ui.craft.length; i++) if (ui.craft[i]) { const s = ui.craft[i]; ui.craft[i] = null; giveOrDrop(s.id, s.n, s.w); }
}
export function fillRecipe(r, shift) {
  if (r.adv && ui.mode !== 'adv') { track('recipe_book_used', { result: 'needs_workshop' }); toast('Tento recept potřebuje dílnu (pokročilý pracovní stůl)'); return; }
  if (r.w > ui.size || r.h > ui.size) { track('recipe_book_used', { result: 'needs_bench' }); toast('Tento recept potřebuje pracovní stůl'); return; }
  returnGrid();
  lastRecipe = r;
  const need = recipeNeeds(r);
  let times = Infinity;
  for (const [id, n] of Object.entries(need)) times = Math.min(times, Math.floor(countItem(id) / n));
  times = Math.min(times, shift ? 64 : 1);
  ui.ghost = null;
  if (times < 1) {
    ui.ghost = Array(9).fill(null);
    r.pat.forEach((row, y) => row.forEach((id, x) => { ui.ghost[y * ui.size + x] = id; }));
    track('recipe_book_used', { result: 'missing_items' });
    toast('Chybí ti suroviny');
    return refreshUI();
  }
  r.pat.forEach((row, y) => row.forEach((id, x) => {
    if (!id) return;
    removeItem(id, times);
    ui.craft[y * ui.size + x] = { id, n: times };
  }));
  track('recipe_book_used', { result: 'filled' });
  refreshUI();
}
export function fillCooking(id) {
  const f = fireOf(ui.fireKey);
  if (f.slots[0] && f.slots[0].id !== id) { const old = f.slots[0]; f.slots[0] = null; giveOrDrop(old.id, old.n, old.w); }
  const have = countItem(id);
  if (!have) { toast('Nemáš ' + ITEMS[id].name.toLowerCase()); return; }
  const k = Math.min(have, ITEMS[id].stack - (f.slots[0]?.n || 0));
  removeItem(id, k);
  if (f.slots[0]) f.slots[0].n += k; else f.slots[0] = { id, n: k };
  refreshUI();
}

invEl.addEventListener('mousedown', (e) => {
  if (inv.cursor && !e.target.closest('.mc-window')) { // klik mimo okno = vyhodit
    const c = inv.cursor;
    const n = btnOf(e) === 2 ? 1 : c.n;
    if ((c.n -= n) <= 0) inv.cursor = null;
    throwItem(c.id, n, c.w);
    return refreshUI();
  }
  const out = e.target.closest('[data-out]');
  if (out) { e.preventDefault(); return takeResult(shiftOf(e)); }
  const sl = e.target.closest('.slot[data-c][data-i]');
  if (sl && sl.dataset.c !== 'cursor') return slotDown(e, sl, btnOf(e), shiftOf(e));
  const so = e.target.closest('[data-sort]');
  if (so) return sortContainer(so.dataset.sort);
  const kr = e.target.closest('[data-k]');
  if (kr) { ui.kSel = +kr.dataset.k; return refreshUI(); }
  if (e.target.closest('[data-cook-start]')) return startCooking();
  const gv = e.target.closest('[data-give]');
  if (gv) {
    const id = gv.dataset.give;
    if (shiftOf(e)) addItem(id, ITEMS[id].stack, true);
    else inv.cursor = { id, n: ITEMS[id].stack };
    return refreshUI();
  }
  const rc = e.target.closest('[data-r]');
  if (rc) return fillRecipe(RECIPES[+rc.dataset.r], shiftOf(e));
  const ck = e.target.closest('[data-cook]');
  if (ck) fillCooking(ck.dataset.cook);
  if (e.target.closest('[data-car-enter]')) { const id = ui.fireKey; closeInventory(); enterVehicle(id); return; }
  const gar = e.target.closest('[data-gar]');
  if (gar) { if (garageClick(gar)) refreshUI(); return; }
  const fu = e.target.closest('[data-fur]');
  if (fu) return fillFurnace(fu.dataset.fur);
  const ct = e.target.closest('[data-cat]');
  if (ct) { ui.cat = ct.dataset.cat; return renderInventory(); }
});
invEl.addEventListener('contextmenu', (e) => e.preventDefault());

export function openInventory(mode = 'inv', fireKey = null) {
  if (MP && fireKey != null) { // truhlu nebo stroj může mít otevřený jen jeden hráč
    const who = [...others.values()].find((P) => P.pose?.ui === String(fireKey));
    if (who) { toast(`Tohle teď používá ${who.name}`); return; }
  }
  if (NET.client && !openInventory.told && ['fire', 'furnace', 'kitchen', 'power'].includes(mode) && (mode !== 'power' || powerOf(fireKey).slots)) { openInventory.told = true; toast('Stroj u hostitele pracuje dál, až okno zavřeš (ochrana proti zdvojení předmětů)'); }
  ui.mode = mode;
  ui.size = mode === 'bench' || mode === 'adv' ? 3 : 2;
  ui.fireKey = fireKey;
  ui.ghost = null;
  invOpen = true;
  input.lmb = input.rmb = false;
  unlockPointer();
  invEl.style.display = 'grid';
  renderInventory();
  track('inventory_opened', { mode });
}
export function closeInventory() {
  returnGrid();
  if (inv.cursor) { const c = inv.cursor; inv.cursor = null; giveOrDrop(c.id, c.n, c.w); }
  invOpen = false;
  clearBookSearch();
  invEl.style.display = 'none';
  cursorEl.style.display = 'none';
  tooltip.style.display = 'none';
  renderHotbar();
  lockPointer();
}
$('modeBtn').addEventListener('click', () => { setCreative(!creative); track('creative_toggled', { to: creative ? 'on' : 'off' }); });
$('newWorld').addEventListener('click', () => {
  if (!confirm('Opravdu začít v novém světě? Současný postup bude smazán.')) return;
  setResetting(true);
  try { localStorage.removeItem(SAVE_KEY); } catch {}
  location.reload();
});

// Okno táboráku se během pečení obnovuje (pečení samo je v shared/sim/machines.js).
let fireRenderT = 0;
export function refreshFireUI(dt) {
  if (invOpen && ui.mode === 'fire' && (fireRenderT -= dt) <= 0) { fireRenderT = 0.15; renderCraftArea(); }
}

installInvTricks(); // dvojklik, tažení, klávesy nad políčky, kolečko, Q, prostřední tlačítko, řazení (inv-tricks.js)
