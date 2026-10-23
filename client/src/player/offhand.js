// Druhá ruka (jako v Minecraftu): jedno políčko inv.off[0], klávesa F prohodí předmět s rukou.
// Štít v kterékoli ruce + pravé tlačítko = krytí (zastaví útok zepředu, survival.js); pochodeň v ruce svítí (held-item.js);
// blok ve druhé ruce se položí, když hlavní ruka nemá co dělat; šípy bere luk i odtud (bow.js).
// Bez vedlejších účinků při načtení.
import { BLOCKS, ITEMS } from '../../../shared/data/index.js';
import { wear } from '../../../shared/tools.js';
import { toolSound } from '../audio/tool-sounds.js';
import { renderHotbar } from '../ui/inventory-ui.js';
import { heldStack, inv } from './inventory.js';
import { creative, input, player } from './player.js';

export const offStack = () => inv.off[0];

/** Prohodí předmět v ruce a ve druhé ruce (klávesa F). */
export function swapHands() {
  const a = inv.slots[inv.sel];
  inv.slots[inv.sel] = inv.off[0];
  inv.off[0] = a;
  toolSound('equip');
  renderHotbar();
}

// ---------- štít
const isShield = (s) => !!s && !!ITEMS[s.id]?.shield;
/** Kterou rukou se kryje (štít v hlavní ruce má přednost), nebo null. */
const shieldHand = () => (isShield(heldStack()) ? 'main' : isShield(offStack()) ? 'off' : null);
/**
 * Krytí štítem: pravé tlačítko se štítem v ruce. Vrací true, když pravé tlačítko patří štítu.
 * Truhly, stroje, auta a tvorové se pravým tlačítkem dál otevírají / používají.
 * @param {{ kind: string, type?: string } | null} target
 */
export function updateShield(target) {
  const hand = shieldHand(), main = heldStack(), M = main && ITEMS[main.id];
  const busy = target && ((target.kind === 'block' && BLOCKS[target.type]?.special) || target.kind === 'vehicle' || target.kind === 'mob');
  const mainUses = M && !M.shield && (M.block || M.food || M.bow || main.id === 'hoe' || main.id === 'fishing_rod' || main.id.includes('bucket')); // hlavní ruka má vlastní pravé tlačítko
  const up = !!hand && input.rmb && !busy && !mainUses;
  if (up && !player.blocking) toolSound('equip');
  player.blocking = up ? hand : null;
  return up;
}
/**
 * Zastaví štít útok? dx, dz = směr od útočníka k hráči. Kryje zepředu (asi ±70°).
 * Při krytí se štít opotřebuje a zazní úder do dřeva.
 */
export function shieldBlocks(dx, dz) {
  if (!player.blocking || (!dx && !dz)) return false;
  const front = Math.sin(player.yaw) * dx + Math.cos(player.yaw) * dz; // > 0: útočník je před hráčem
  if (front < 0.35 * Math.hypot(dx, dz)) return false;
  const s = player.blocking === 'main' ? heldStack() : offStack();
  if (!s) return false;
  if (!creative && wear(s, 1)) { // štít se rozbil
    if (player.blocking === 'main') inv.slots[inv.sel] = null; else inv.off[0] = null;
    player.blocking = null;
    toolSound('snap');
  } else toolSound('shieldBlock');
  renderHotbar();
  return true;
}

// ---------- blok z druhé ruky
/** Má se pravým tlačítkem položit blok z druhé ruky? (hlavní ruka je prázdná nebo drží nástroj / zbraň) */
export function placesFromOff() {
  const o = offStack(), m = heldStack(), M = m && ITEMS[m.id];
  if (!o || !ITEMS[o.id]?.block) return false;
  return !m || (!!M && (!!M.tool || !!M.armor) && !M.block);
}
/** Zavolá fn se blokem z druhé ruky „v ruce“ (použije se běžné pokládání bloku, které ubere z ruky). */
export function withOffInHand(fn) {
  const main = inv.slots[inv.sel];
  inv.slots[inv.sel] = inv.off[0];
  try { fn(); } finally {
    inv.off[0] = inv.slots[inv.sel];
    inv.slots[inv.sel] = main;
    renderHotbar();
  }
}

// ---------- šípy (luk bere nejdřív z druhé ruky)
export const offArrows = () => (offStack()?.id === 'arrow' ? offStack().n : 0);
export function takeOffArrow() {
  const o = offStack();
  if (o?.id !== 'arrow') return false;
  if (--o.n <= 0) inv.off[0] = null;
  return true;
}
