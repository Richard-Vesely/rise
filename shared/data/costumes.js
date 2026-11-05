// Vzhled postavy (oblek): druh obleku, barva, světla, hledí a znak na hrudi.
// Jen kosmetika: nemění pravidla hry. Data jsou tady (bez DOM a Three.js), aby je uměl zkontrolovat i server
// (server/me.js) a aby se oblek posílal stejně ve všech třech režimech (v pozici hráče jako krátký text `lk`).

/** Druhy obleků: id → jméno a krátký popis pro výběr v menu. Nové obleky přidávej NA KONEC (pořadí v menu). */
export const SUITS = {
  explorer: { name: 'Průzkumník', desc: 'Lehký oblek s batohem a anténou' },
  engineer: { name: 'Inženýr', desc: 'Pracovní oblek s čelovkou a energetickým článkem' },
  pilot: { name: 'Pilot', desc: 'Kombinéza s velkým hledím a tryskami na zádech' },
  guard: { name: 'Strážce', desc: 'Těžké nárameníky a plášť, který vlaje' },
  scientist: { name: 'Vědec', desc: 'Dlouhý laboratorní plášť a brýle s hologramem' },
  shadow: { name: 'Stínový', desc: 'Tmavá kápě a roztřepený plášť, jako stínová sada' },
  sky: { name: 'Nebeský', desc: 'Bílo-zlatý oblek se svatozáří a tryskami, jako nebeská sada' },
  // Hrdinové (hero): bez přilby, s obličejem a vlasy (inspirace Hytale). Hledí = barva vlasů, znak = pleť, světla = oči a drahokam.
  mage: { name: 'Mág', desc: 'Dlouhý hábit se zlatými ornamenty, drahokam na hrudi a rozcuchané vlasy', hero: true },
  knight: { name: 'Rytíř', desc: 'Kroužková tunika s erbem, kovové nárameníky a krátký plášť', hero: true },
  ranger: { name: 'Hraničář', desc: 'Kožená vesta, kápě přes záda, toulec a vlající šála', hero: true },
};
/** Má oblek obličej a vlasy místo přilby? */
export const isHero = (s) => !!SUITS[s]?.hero;
/** Hrdinové: barva vlasů (místo hledí, stejný počet) a pleti (místo znaku, stejný počet). */
export const HAIR_COLORS = [['Fialové', '#8a4ad8'], ['Hnědé', '#5a3a22'], ['Blond', '#e0b858'], ['Černé', '#26222c'], ['Zrzavé', '#c8562a']];
export const SKIN_TONES = [['Světlá', '#f2cfae'], ['Růžová', '#eebc9e'], ['Broskvová', '#e0a98a'], ['Olivová', '#c99a6e'], ['Medová', '#b07c52'], ['Hnědá', '#8a5a3a'], ['Tmavá', '#62402a'], ['Mramorová', '#d8d4e0']];
export const SUIT_IDS = Object.keys(SUITS);

/** Barvy obleku (látka a lak). */
export const SUIT_COLORS = [
  ['Bílá', '#e9edf2'], ['Grafitová', '#3a404c'], ['Červená', '#c8383a'], ['Oranžová', '#e8782a'],
  ['Žlutá', '#e9c23a'], ['Limetková', '#8cc43c'], ['Zelená', '#2f9a5a'], ['Tyrkysová', '#1fa3a0'],
  ['Nebeská', '#3f9ee0'], ['Modrá', '#2f52c8'], ['Fialová', '#7a48c8'], ['Růžová', '#e0609a'],
];
/** Barvy světel obleku: jen svítící barvy hry (azurová = energie, jantarová = oheň, zelená = v pořádku, purpurová = Marek). */
export const LIGHT_COLORS = [['Azurová', '#38e8ff'], ['Jantarová', '#ffb066'], ['Zelená', '#5cff8a'], ['Purpurová', '#d04bff']];
/** Hledí (zrcadlové sklo). */
export const VISOR_COLORS = [['Stříbrné', '#c9d3de'], ['Zlaté', '#e8b84a'], ['Modré', '#3a7ad8'], ['Kouřové', '#2a2d36'], ['Zelené', '#3fae7a']];
/** Znak na hrudi. */
export const EMBLEMS = ['Žádný', 'Hvězda', 'Blesk', 'List', 'Planeta', 'Srdce', 'Koruna', 'Ř'];

/**
 * @typedef {{ s: string, c: number, l: number, v: number, e: number, t?: number }} Costume
 * s = oblek (klíč SUITS), c = barva obleku, l = světla, v = hledí, e = znak (indexy do seznamů výše), t = kdy se změnil (ms)
 */

const idx = (v, n, d) => (Number.isInteger(v) && v >= 0 && v < n ? v : d);
const hash = (name) => { let h = 7; for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };

/** Výchozí oblek podle jména: každý hráč má od začátku jinou barvu (jako dřív barevné tričko). */
export function defaultCostume(name = '') {
  const h = hash(name);
  return { s: 'explorer', c: h % SUIT_COLORS.length, l: 0, v: 0, e: 1 + ((h >>> 5) % (EMBLEMS.length - 1)) };
}

/**
 * Zkontroluje oblek (objekt nebo text `s.c.l.v.e`). Neplatné části nahradí výchozími, nikdy nehází.
 * @param {unknown} x
 * @param {string} [name] jméno hráče pro výchozí barvu
 * @returns {Costume}
 */
export function cleanCostume(x, name = '') {
  const d = defaultCostume(name);
  if (typeof x === 'string') x = decodeCostume(x);
  if (!x || typeof x !== 'object' || Array.isArray(x)) return d;
  const o = /** @type {Record<string, unknown>} */ (x);
  const out = {
    s: typeof o.s === 'string' && Object.hasOwn(SUITS, o.s) ? o.s : d.s,
    c: idx(o.c, SUIT_COLORS.length, d.c),
    l: idx(o.l, LIGHT_COLORS.length, d.l),
    v: idx(o.v, VISOR_COLORS.length, d.v),
    e: idx(o.e, EMBLEMS.length, d.e),
  };
  if (typeof o.t === 'number' && Number.isFinite(o.t) && o.t > 0) out.t = Math.floor(o.t);
  return out;
}

/** Krátký text do pozice hráče (posílá se 12× za sekundu): `pilot.3.0.1.2`. */
export const encodeCostume = (c) => `${c.s}.${c.c}.${c.l}.${c.v}.${c.e}`;

/** Opak encodeCostume; neplatný text → null. */
export function decodeCostume(str) {
  if (typeof str !== 'string' || str.length > 40) return null;
  const [s, ...n] = str.split('.');
  if (n.length !== 4 || !n.every((v) => /^\d{1,2}$/.test(v))) return null;
  const [c, l, v, e] = n.map(Number);
  return { s, c, l, v, e };
}

/** Novější ze dvou uložených obleků (server vs. prohlížeč): podle času změny `t`. */
export const newerCostume = (a, b) => ((b?.t || 0) > (a?.t || 0) ? b : a);
