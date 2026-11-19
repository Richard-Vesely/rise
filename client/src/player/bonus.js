// Bonusy pro dárce na serveru kroužku: strana hráče. Dává je jen vlastník serveru (server/bonus.js), server pošle
// ['bonus', [druhy]] (shared/data/bonus.js). Co dělají: syty = hlad neubývá (survival.js), obrana = jen třetina
// zranění (survival.js), let = dvakrát Mezerník jako v kreativním režimu (player.js), teleport = duch (ghost.js).
// Ve vězení a v aréně (svět s volbou pvp) bonusy neplatí. Modul nic nespouští při načtení (jen funkce).
import { BONUS_KINDS, cleanBonus } from '../../../shared/data/bonus.js';
import { NET } from '../../../shared/net/net.js';
import { toast } from '../ui/hud.js';

/** Bonusy, které hráč má (i když teď zrovna neplatí). */
export const perks = new Set();

/** Zpráva ['bonus', [druhy]] od serveru: nový seznam bonusů. */
export function applyBonus(list) {
  const next = cleanBonus(list);
  const got = next.filter((k) => !perks.has(k)), lost = [...perks].filter((k) => !next.includes(k));
  perks.clear();
  for (const k of next) perks.add(k);
  if (got.length) toast('🎁 Bonus: ' + got.map((k) => `${BONUS_KINDS[k].name} (${BONUS_KINDS[k].how})`).join(' · '));
  else if (lost.length) toast('Bonus skončil: ' + lost.map((k) => BONUS_KINDS[k].name).join(', '));
}

/** Platí teď bonus? Jen na serveru, ne ve vězení, ne v aréně. */
export const hasPerk = (k) => perks.has(k) && !!NET.client && !NET.jail && !NET.pvp;
