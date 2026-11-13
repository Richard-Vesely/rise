// Vězení na serveru kroužku: strana hráče. Rozhoduje jen server (server/prison.js, shared/world/prison.js);
// tady se jen provede, co poslal: ['vezeni', { on, need, given, item, at: [x, y, z], go? }].
// NET.jail = { need, given, item, at } když je hráč ve vězení (jinak null): nestaví (interaction.js), nezapne kreativní
// režim (player.js), po smrti se probudí ve vězení (survival.js) a pokladnička ukáže, kolik ok ještě chybí (ui/donation-ui.js).
// Modul nic nespouští při načtení (jen funkce).
import { ITEMS } from '../../../shared/data/index.js';
import { NET } from '../../../shared/net/net.js';
import { toast } from '../ui/hud.js';
import { exitVehicle } from '../vehicles/car.js';
import { teleport } from '../world/shrine.js';
import { creative, player, setCreative } from './player.js';

const spot = (a) => (Array.isArray(a) && a.length === 3 && a.every(Number.isFinite) ? a.map(Number) : null);

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
    const item = typeof d.item === 'string' && ITEMS[d.item] ? d.item : 'spider_eye';
    NET.jail = { need: Math.max(1, Number(d.need) || 1), given: Math.max(0, Number(d.given) || 0), item, at: at || NET.jail?.at || null };
    if (creative) setCreative(false);
    if (!was) toast(`Jsi ve vězení! Ven: daruj ${NET.jail.need}× ${ITEMS[item].name} do pokladničky u sochy.`);
  } else NET.jail = null;
  if (d.go && at) moveTo(at);
}
