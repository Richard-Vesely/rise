// Druhá ruka (jako v Minecraftu): jedno políčko inv.off[0], klávesa F prohodí předmět s rukou.
// Štít v kterékoli ruce + pravé tlačítko = krytí (zastaví útok zepředu, survival.js); pochodeň v ruce svítí (render/blocks.js);
// blok ve druhé ruce se položí, když hlavní ruka nemá co dělat; šípy bere luk nejdřív odtud (bow.js).
// Levá ruka v první osobě: render/offhand-view.js, u postaviček: net/avatars.js. Bez vedlejších účinků při načtení.
import { ITEMS } from '../../../shared/data/index.js';
import { ownerItem } from '../../../shared/data/magic.js';
import { toolSound } from '../audio/tool-sounds.js';
import { toast } from '../ui/hud.js';
import { renderHotbar } from '../ui/inventory-ui.js';
import { wearOther } from './durability.js';
import { heldStack, inv } from './inventory.js';
import { input, player } from './player.js';

export const offStack = () => inv.off[0];
/** Smí předmět do druhé ruky? (předměty vlastníka serveru ne: server je hlídá jen v batohu, server/owner-wand.js) */
export const offAllowed = (s) => !s || !ownerItem(s.id);

/** Prohodí předmět v ruce a ve druhé ruce (klávesa F). */
export function swapHands() {
  const a = inv.slots[inv.sel];
  if (!offAllowed(a)) { toast('Tohle do druhé ruky nejde'); return; }
  inv.slots[inv.sel] = inv.off[0];
  inv.off[0] = a;
  toolSound('equip');
  renderHotbar();
}

// Hlavní ruka „nemá co dělat“ pravým tlačítkem: je prázdná, nebo drží zbraň, nástroj na těžbu nebo brnění.
// Jen tehdy kryje štít ze druhé ruky a pokládá se blok ze druhé ruky (jídlo, bloky, vozidla, kbelík… mají pravé tlačítko svoje).
const FREE_TOOLS = new Set(['sword', 'axe', 'pick', 'shovel']);
function mainFree() {
  const m = heldStack(), M = m && ITEMS[m.id];
  return !m || (!!M && !M.block && (FREE_TOOLS.has(M.tool) || !!M.armor));
}

// ---------- štít
const isShield = (s) => !!s && !!ITEMS[s.id]?.shield;
/** Kterou rukou se kryje (štít v hlavní ruce má přednost), nebo null. */
const shieldHand = () => (isShield(heldStack()) ? 'main' : isShield(offStack()) && mainFree() ? 'off' : null);
/**
 * Krytí štítem: pravé tlačítko se štítem v ruce. Vrací true, když pravé tlačítko patří štítu.
 * Truhly, stroje, vozidla a tvorové se pravým tlačítkem dál otevírají / používají (busy).
 * @param {boolean} busy hráč míří na něco, co pravé tlačítko otevře nebo použije
 */
export function updateShield(busy) {
  const hand = !busy && input.rmb ? shieldHand() : null;
  if (hand && !player.blocking) toolSound('equip');
  player.blocking = hand;
  return !!hand;
}
/** Krytí skončí (pravé tlačítko si vzal luk, hůl nebo vychytávka). */
export function stopGuard() { player.blocking = null; }
/**
 * Zastaví štít útok? dx, dz = směr od útočníka k hráči. Kryje zepředu (asi ±70°).
 * Při krytí se štít opotřebuje o 1 a zazní úder do dřeva; rozbitý štít zmizí z ruky.
 */
export function shieldBlocks(dx, dz) {
  if (!player.blocking || (!dx && !dz)) return false;
  const front = Math.sin(player.yaw) * dx + Math.cos(player.yaw) * dz; // > 0: útočník je před hráčem (pohled = (−sin yaw, −cos yaw))
  if (front < 0.35 * Math.hypot(dx, dz)) return false;
  const main = player.blocking === 'main', s = main ? heldStack() : offStack();
  if (!isShield(s)) { player.blocking = null; return false; }
  if (wearOther(s, 1, [player.pos.x, player.pos.y + 1.1, player.pos.z])) { // štít se rozbil
    if (main) inv.slots[inv.sel] = null; else inv.off[0] = null;
    player.blocking = null;
  } else toolSound('shieldBlock');
  renderHotbar();
  return true;
}

// ---------- blok z druhé ruky
/** Má se pravým tlačítkem položit blok z druhé ruky? (hlavní ruka je prázdná nebo drží zbraň / nástroj) */
export function placesFromOff() {
  const o = offStack();
  return !!o && !!ITEMS[o.id]?.block && mainFree();
}
/** Zavolá fn s blokem z druhé ruky „v ruce“ (použije se běžné pokládání bloku, které ubere z ruky). */
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
/** Vezme jeden šíp ze druhé ruky. Vrací false, když tam žádný není. */
export function takeOffArrow() {
  const o = offStack();
  if (o?.id !== 'arrow') return false;
  if (--o.n <= 0) inv.off[0] = null;
  return true;
}
