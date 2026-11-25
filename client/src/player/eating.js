// Stůl, židle a jedení.
import '../vehicles/plane.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { ITEMS } from '../../../shared/data/index.js';
import { chairRot, tableItems } from '../../../shared/world/state.js';
import { Sound } from '../audio/sound.js';
import { DINE_STYLE } from '../dining/dine-view.js';
import { canDine, dining, startDining } from '../dining/dining.js';
import { rebuildSpecialAt, specials } from '../render/blocks.js';
import { debris } from '../render/particles.js';
import { camera } from '../render/renderer.js';
import { $ } from '../ui/dom.js';
import { toast } from '../ui/hud.js';
import { renderHotbar } from '../ui/inventory-ui.js';
import { addItem, consumeSelected, heldStack, inv } from './inventory.js';
import { input, player } from './player.js';

// ============================================================ stolování: stůl, židle, příbor
export function refreshSpecial(k) {
  rebuildSpecialAt(k); // jen tenhle model, ne celý svět
}
// Pravé tlačítko na stůl: položit jídlo / příbor, prázdnou rukou vzít zpět, vsedě u stolu jíst.
export function useTable(k) {
  const t = tableItems.get(k) || {};
  const held = heldStack();
  if (player.sitting && t.food) { startEating(t.food, 'table', k); return; }
  if (held && ITEMS[held.id].food && !t.food) {
    t.food = held.id;
    held.n--; if (held.n <= 0) inv.slots[inv.sel] = null;
  } else if (held?.id === 'cutlery' && !t.cutlery) {
    t.cutlery = true;
    held.n--; if (held.n <= 0) inv.slots[inv.sel] = null;
  } else if (t.food) { addItem(t.food, 1); t.food = null; }
  else if (t.cutlery) { addItem('cutlery', 1); t.cutlery = false; }
  else { toast('Polož na stůl jídlo nebo příbor (pravé tl.)'); return; }
  tableItems.set(k, t);
  renderHotbar();
  refreshSpecial(k);
  Sound.place();
}
// Židle: pravé tlačítko = sednout, pohyb nebo skok = vstát
export function sitOn(k) {
  const [x, y, z] = k.split(',').map(Number);
  const s = specials.get(k);
  player.sitting = k;
  player.pos.set(x + 0.5, (s ? s.ry : y) + 0.05, z + 0.5);
  player.vel.set(0, 0, 0);
  player.yaw = (chairRot.get(k) || 0) + Math.PI;
  toast('Sedíš · u stolu klikni na jídlo a jez (s příborem +50 %) · pohyb = vstát');
}
export function nearTableBonus() {
  if (!player.sitting) return 1;
  const [x, , z] = player.sitting.split(',').map(Number);
  for (const [k, t] of tableItems) { const [tx, , tz] = k.split(',').map(Number); if (Math.abs(tx - x) + Math.abs(tz - z) <= 2 && t.cutlery) return 1.5; }
  return 1.2;
}

// ============================================================ jedení s animací
// Jídlo se nese k puse, drobky odletují a teprve na konci se projeví sytost a zdraví.
export function startEating(id, src, tableKey) {
  if (player.eating) return;
  const d = ITEMS[id];
  if (player.hunger >= 100 && !(d.heal && player.hp < 100) && !d.fly) { toast('Nemáš hlad'); return; }
  if (dining) return;
  const style = canDine(id, src, tableKey);
  if (style) { startDining(id, src, tableKey, style); return; }
  if (DINE_STYLE[id] && !player.eatHintShown) { player.eatHintShown = true; toast('Tip: s příborem (nebo hůlkami) budeš krájet a namotávat'); }
  player.eating = { id, src, tableKey, slot: inv.sel, t: 0, dur: 1.6 + Math.min(1.4, d.food / 50), bite: 0 }; // větší jídlo se jí déle
}
export function updateEating(dt) {
  const e = player.eating;
  if (!e) return;
  if (e.src === 'hand' && (inv.sel !== e.slot || heldStack()?.id !== e.id)) { player.eating = null; return; } // přepnul předmět
  if (!input.rmb) { player.eating = null; $('progress').style.opacity = 0; toast('Jez déle – drž pravé tlačítko'); return; } // pustil tlačítko
  e.t += dt;
  const pr = $('progress');
  pr.style.opacity = 1;
  pr.style.background = `conic-gradient(rgba(255,210,120,0.95) ${(e.t / e.dur) * 360}deg, rgba(255,255,255,0.15) 0deg)`;
  if ((e.bite -= dt) <= 0) {
    e.bite = 0.32;
    Sound.bite(e.id);
    const fwd = new THREE.Vector3(0, -0.25, -0.5).applyQuaternion(camera.quaternion).add(camera.position);
    debris.emit(fwd.x, fwd.y, fwd.z, [0.85, 0.65, 0.35], 6, 1.2, 0.5);
  }
  if (e.t < e.dur) return;
  $('progress').style.opacity = 0;
  // dojedeno
  const d = ITEMS[e.id];
  const bonus = e.src === 'table' ? nearTableBonus() : 1;
  if (e.src === 'hand') consumeSelected();
  else { const t = tableItems.get(e.tableKey); if (t) { t.food = null; refreshSpecial(e.tableKey); } }
  player.hunger = Math.min(100, player.hunger + d.food * bonus);
  if (d.heal) player.hp = Math.min(100, player.hp + d.heal * bonus);
  if (d.fly) { player.flyT = Math.max(player.flyT||0,d.fly); toast('Markové jablko: 10 s létání! Mezerník = nahoru, Shift = dolů'); }
  else if (bonus > 1) toast(`Stolování: jídlo dalo +${Math.round((bonus - 1) * 100)} %`);
  Sound.eat();
  player.eating = null;
}
