// Opotřebení nástrojů a brnění u hráče na této obrazovce (pravidla: shared/tools.js).
// Rozbitý nástroj: prasknutí, úlomky z ruky, ruka se schová a vrátí prázdná, hláška. V kreativním režimu se nic neopotřebuje.
import * as THREE from 'three';
import { ITEMS } from '../../../shared/data/index.js';
import { armorWear, breaksSoonVerb, brokeVerb, isLow, wear } from '../../../shared/tools.js';
import { toolSound } from '../audio/tool-sounds.js';
import { emitChips, paletteOf } from '../render/chips.js';
import { equipDip, holder } from '../render/held-item.js';
import { ICONS } from '../render/icons.js';
import { sparks } from '../render/particles.js';
import { camera } from '../render/renderer.js';
import { toast } from '../ui/hud.js';
import { armor, refreshUI, renderHotbar } from '../ui/inventory-ui.js';
import { heldStack, inv } from './inventory.js';
import { creative } from './player.js';

const TIER_RGB = { 1: [0.6, 0.45, 0.28], 2: [0.55, 0.55, 0.55], 3: [0.88, 0.9, 0.93], 4: [0.5, 0.95, 1], 5: [0.88, 0.45, 1], shadow: [0.45, 0.3, 0.6], sky: [1, 0.92, 0.6], fire: [1, 0.4, 0.1] };
const v3 = new THREE.Vector3(), dir = new THREE.Vector3();
// Úlomky rozbitého předmětu v barvách jeho ikony
function shatter(id, at, dir) {
  const cols = paletteOf('item:' + id, ICONS[id]?.canvas, TIER_RGB[ITEMS[id]?.tier] || [0.7, 0.7, 0.7]);
  emitChips(at, cols, 8, { speed: 1.4, up: 2.4, size: [0.035, 0.07], life: [0.6, 1.2], spread: 0.08, dir });
  sparks.emit(...at, [1, 0.85, 0.6], 10, 2, 1.5);
}
function warnLow(s) {
  const name = ITEMS[s.id].name;
  toast(`${name} se brzy ${breaksSoonVerb(name)}`);
  toolSound('low');
}
function broke(s, at, dir) {
  const name = ITEMS[s.id].name;
  toolSound('snap');
  shatter(s.id, at, dir);
  toast(`${name} se ${brokeVerb(name)}!`);
}

/**
 * Opotřebuje předmět v ruce (cost z useCost()). Vrací true, když se rozbil.
 * @param {number} cost
 */
export function wearHeld(cost) {
  const s = heldStack();
  if (creative || !s || !cost) return false;
  const was = isLow(s);
  if (wear(s, cost)) {
    holder.getWorldPosition(v3); // úlomky vyletí z ruky dopředu, ať jsou vidět
    camera.getWorldDirection(dir);
    inv.slots[inv.sel] = null;
    broke(s, [v3.x + dir.x * 0.25, v3.y + 0.1, v3.z + dir.z * 0.25], [dir.x * 0.6, 0.2, dir.z * 0.6]);
    equipDip();
    renderHotbar();
    return true;
  }
  if (!was && isLow(s)) warnLow(s);
  renderHotbar();
  return false;
}
/**
 * Zásah do hráče opotřebuje každý nošený kus brnění (1 za každých 20 zranění, nejméně 1).
 * @param {number} dmg zranění před ztlumením brněním
 * @param {number[]} at kde jsou úlomky (hráč)
 */
export function wearArmor(dmg, at) {
  if (creative) return;
  const cost = armorWear(dmg);
  let changed = false;
  for (let i = 0; i < armor.length; i++) {
    const s = armor[i];
    if (!s || !ITEMS[s.id]?.dur) continue;
    changed = true;
    const was = isLow(s);
    if (wear(s, cost)) { armor[i] = null; broke(s, at); } else if (!was && isLow(s)) warnLow(s);
  }
  if (changed) refreshUI();
}
