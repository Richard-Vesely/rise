// Bonusy pro dárce (jen server kroužku): vlastník serveru je dává hráčům příkazem /bonus (server/bonus.js),
// server si je pamatuje u profilu (server/bonuses.js) a pošle hráči ['bonus', [druhy]]. Co který bonus dělá, řeší
// prohlížeč (client/src/player/bonus.js). Pravomoc vlastníka (AGENTS.md pravidlo 11): patří Richardovi.
// Data bez DOM a Three.js (načítá je i server).

/** Druhy bonusů: jméno, jak se používá (do zprávy hráči) a slova, kterými je vlastník napíše v chatu (bez diakritiky). */
export const BONUS_KINDS = {
  syty: { name: 'Bez hladu', how: 'nikdy nemáš hlad', words: ['syty', 'hlad', 'nehlad', 'jidlo'] },
  obrana: { name: 'Velká obrana', how: 'dostaneš jen třetinu zranění', words: ['obrana', 'brneni', 'stit'] },
  let: { name: 'Létání', how: 'dvakrát Mezerník = létat', words: ['let', 'letani', 'fly'] },
  teleport: { name: 'Teleport duchem', how: 'X = duch, X znovu = přenést se tam', words: ['teleport', 'duch', 'tp'] },
};
export const BONUS_IDS = Object.keys(BONUS_KINDS);
/** Obrana: kolik zranění hráč s bonusem dostane (po brnění). */
export const BONUS_DEFENSE = 1 / 3;
/** Duch (teleport): rychlost letu v m/s, s Ctrl rychleji. */
export const GHOST = { speed: 30, fast: 90 };

const plain = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
/** Slovo z chatu → druh bonusu, 'vse' (všechny), nebo null. */
export function bonusKind(word) {
  const w = plain(word);
  if (w === 'vse' || w === 'vsechno' || w === 'all') return 'vse';
  return BONUS_IDS.find((k) => BONUS_KINDS[k].words.includes(w)) ?? null;
}
/** Seznam bonusů očištěný od nesmyslů, v pevném pořadí (BONUS_IDS). */
export const cleanBonus = (list) => (Array.isArray(list) ? BONUS_IDS.filter((k) => list.includes(k)) : []);
/** Jména bonusů do zprávy ('Létání, Teleport duchem'). */
export const bonusNames = (list) => cleanBonus(list).map((k) => BONUS_KINDS[k].name).join(', ');
