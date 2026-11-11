// Zkušenosti (XP), úrovně, mana a kouzla čarovné hole. Jen data a výpočty (bez DOM): hra v client/src/player/xp.js
// a magic.js, kontrola uloženého stavu na serveru v server/me.js.

/** XP za poraženého tvora (silnější = víc). */
export const XP_MOB = { chicken: 1, sheep: 2, cow: 2, deer: 3, boar: 4, wolf: 5, crawler: 6, markoman: 10, golem: 25, dragon: 120 };
/** XP za vytěženou rudu (id podzemí z shared/world/voxels.js → body). */
export const XP_ORE = { coal: 1, copper: 2, iron: 2, gold: 4, quartz: 3, crystal: 6, markorite: 8 };
export const XP_CRAFT = 1, XP_COOK = 2;

/** XP potřebné na úroveň L (od úrovně L−1): 20, 35, 50, 65… */
export const xpToNext = (level) => 20 + 15 * (level - 1);
/** Úroveň a postup z celkových XP: { level, into, need }. Začíná se na úrovni 1. */
export function levelOf(xp) {
  let level = 1, left = Math.max(0, Math.floor(xp || 0));
  while (left >= xpToNext(level)) { left -= xpToNext(level); level++; }
  return { level, into: left, need: xpToNext(level) };
}
/** Největší mana a dobíjení za sekundu podle úrovně. */
export const manaMax = (level) => 40 + 10 * level;
export const MANA_REGEN = 4;

/**
 * Kouzla: druh (útok, léčení, pohyb, užitek), od které úrovně jde vybrat, co potřebuje předem, mana, odpočet (s).
 * Při každé nové úrovni se nabídnou 3 kouzla, která už jdou vybrat (spellChoices), a hráč si jedno vezme.
 */
export const SPELLS = {
  bolt: { name: 'Magická střela', kind: 'útok', level: 1, mana: 8, cd: 0.6, desc: 'Svítící střela letí rovně a zraní tvora (6).' },
  fireball: { name: 'Ohnivá koule', kind: 'útok', level: 3, needs: 'bolt', mana: 20, cd: 1.5, desc: 'Vybuchne a zapálí tvory kolem (10 + hoření).' },
  frost: { name: 'Ledová střela', kind: 'útok', level: 5, needs: 'bolt', mana: 18, cd: 1.2, desc: 'Zraní (8) a na 4 s zpomalí.' },
  lightning: { name: 'Blesk', kind: 'útok', level: 8, needs: 'fireball', mana: 35, cd: 4, desc: 'Udeří z nebe tam, kam míříš (18 kolem).' },
  heal: { name: 'Léčení', kind: 'léčení', level: 2, mana: 25, cd: 3, desc: 'Hned vyléčí 35 zdraví.' },
  regen: { name: 'Regenerace', kind: 'léčení', level: 4, needs: 'heal', mana: 30, cd: 12, desc: '10 s léčí 3 zdraví za sekundu.' },
  ward: { name: 'Ochranný štít', kind: 'léčení', level: 7, needs: 'heal', mana: 40, cd: 20, desc: '10 s bere jen polovinu zranění.' },
  leap: { name: 'Vysoký skok', kind: 'pohyb', level: 1, mana: 10, cd: 1, desc: 'Vyskočí vysoko a kus dopředu.' },
  blink: { name: 'Přenesení', kind: 'pohyb', level: 6, needs: 'leap', mana: 30, cd: 3, desc: 'Přenese tě až 20 m tam, kam míříš.' },
  levitate: { name: 'Krátký let', kind: 'pohyb', level: 9, needs: 'blink', mana: 40, cd: 15, desc: '6 s můžeš létat.' },
  light: { name: 'Světlo', kind: 'užitek', level: 1, mana: 5, cd: 1, desc: 'Svítící koule visí 60 s ve vzduchu.' },
  farmine: { name: 'Těžba na dálku', kind: 'užitek', level: 3, mana: 12, cd: 0.8, desc: 'Vytěží blok až 16 m daleko.' },
  wolf: { name: 'Duchovní vlk', kind: 'užitek', level: 10, needs: 'light', mana: 60, cd: 30, desc: '20 s útočí na nepřátele kolem tebe.' },
};
export const SPELL_IDS = Object.keys(SPELLS);
/** Kouzla, která už jde vybrat (úroveň a předchozí kouzlo), a hráč je ještě nemá. */
export const spellChoices = (level, learned) => SPELL_IDS.filter((id) => !learned.includes(id) && SPELLS[id].level <= level && (!SPELLS[id].needs || learned.includes(SPELLS[id].needs)));
/** Až 3 nabídnutá kouzla: od každého druhu nejvýš jedno, když to jde (rnd = náhoda 0–1). */
export function offerSpells(level, learned, rnd = Math.random) {
  const pool = spellChoices(level, learned).sort(() => rnd() - 0.5), out = [];
  for (const id of pool) if (out.length < 3 && !out.some((o) => SPELLS[o].kind === SPELLS[id].kind)) out.push(id);
  for (const id of pool) if (out.length < 3 && !out.includes(id)) out.push(id);
  return out;
}
/** Uložený stav kouzel ze souboru / ze sítě: { xp, learned, sel, picks }. Nesmysly zahodí. */
export function cleanMagic(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return { xp: 0, learned: [], sel: null, picks: 0 };
  const xp = Number.isFinite(o.xp) && o.xp >= 0 ? Math.min(1e7, Math.floor(o.xp)) : 0;
  const learned = Array.isArray(o.learned) ? [...new Set(o.learned.filter((id) => typeof id === 'string' && Object.hasOwn(SPELLS, id)))] : [];
  const picks = Number.isInteger(o.picks) && o.picks >= 0 && o.picks < 200 ? o.picks : 0; // kolik výběrů kouzel ještě čeká
  return { xp, learned, sel: learned.includes(o.sel) ? o.sel : learned[0] ?? null, picks };
}
