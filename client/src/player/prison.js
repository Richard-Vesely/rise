// Vězení na serveru kroužku: strana hráče. Rozhoduje jen server (server/prison.js, shared/world/prison.js);
// tady se jen provede, co poslal:
//   ['vezeni', { on, at: [x, y, z], go?, exit: [x, z], ex, kind, need, done, text }] stav vězně (bludiště, brána, úkol)
//   ['vezq', otázka | null] okno s otázkou u brány (odpověď jde serveru ['vez', 'ans', text]; správnou zná jen server)
// NET.jail = { at, exit, ex, kind, need, done, text } když je hráč ve vězení (jinak null): nestaví (interaction.js),
// nezapne kreativní režim (player.js), po smrti se probudí na startu bludiště (survival.js), kompas ukazuje jeho bránu
// a horní řádek postup (ui/hud.js). Modul nic nespouští při načtení (jen funkce; okno se vytvoří při první otázce).
import { NET } from '../../../shared/net/net.js';
import { toast } from '../ui/hud.js';
import { exitVehicle } from '../vehicles/car.js';
import { teleport } from '../world/shrine.js';
import { creative, lockPointer, player, setCreative, unlockPointer } from './player.js';

const spot = (a, n = 3) => (Array.isArray(a) && a.length === n && a.every(Number.isFinite) ? a.map(Number) : null);
const KINDS = ['monsters', 'runes', 'math', 'logic'];

/** Přenese hráče na místo [x, y, z] (do vězení nebo zpátky na spawn). */
function moveTo([x, y, z]) {
  if (player.vehicle || player.riding) exitVehicle();
  teleport(x, z); // bílý záblesk, les a obloha kolem nového místa
  player.pos.y = y;
  player.flying = false;
  player.flyT = 0;
}

/** Zpráva ['vezeni', stav] od serveru. */
export function applyJail(d) {
  if (!d || typeof d !== 'object') return;
  const was = !!NET.jail, at = spot(d.at);
  if (d.on) {
    NET.jail = {
      at: at || NET.jail?.at || null, exit: spot(d.exit, 2), ex: String(d.ex || '').slice(0, 20),
      kind: KINDS.includes(d.kind) ? d.kind : '', need: Math.max(1, Number(d.need) || 1), done: Math.max(0, Number(d.done) || 0),
      text: String(d.text || '').slice(0, 80),
    };
    if (creative) setCreative(false);
    if (!was) toast(`Jsi v bludišti! ${NET.jail.text}, pak ${NET.jail.ex} brána (⛓ na kompasu).`);
  } else { NET.jail = null; closeAsk(false); }
  if (d.go && at) moveTo(at);
}

// ---------- okno s otázkou u brány
export let askOpen = false;
let box = null, label = null, field = null;
function makeBox() {
  box = document.createElement('div');
  box.id = 'jailAsk';
  box.innerHTML = '<b></b><input maxlength="40" autocomplete="off"><button type="button" class="mc-btn">OK</button>';
  [label, field] = [box.querySelector('b'), box.querySelector('input')];
  const send = () => { const v = field.value.trim(); if (!v) return; NET.req(['vez', 'ans', v]); closeAsk(true); };
  field.addEventListener('keydown', (e) => {
    e.stopPropagation(); // klávesy patří oknu, ne hře
    if (e.key === 'Enter') send();
    else if (e.key === 'Escape') closeAsk(true);
  });
  box.querySelector('button').addEventListener('click', send);
  document.body.append(box);
}
function closeAsk(relock) {
  if (!askOpen) return;
  askOpen = false;
  box.style.display = 'none';
  field.blur();
  if (relock) lockPointer();
}
/** Zpráva ['vezq', otázka | null] od serveru: ukáže (nebo zavře) okno s otázkou. */
export function applyAsk(q) {
  if (typeof q !== 'string' || !q || !NET.jail) { closeAsk(true); return; }
  if (!box) makeBox();
  label.textContent = q.slice(0, 200);
  field.value = '';
  box.style.display = 'flex';
  askOpen = true;
  unlockPointer();
  setTimeout(() => field.focus(), 0);
}
