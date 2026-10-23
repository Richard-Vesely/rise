// Stav hráče, který posílá prohlížeč (['me', stav]): batoh, brnění, pozice, zdraví… Server ho drží u světa
// (world.json → players[id profilu]). Tady se kontroluje tvar a velikost, aby se do uložení nedostal nesmysl.
// Pořád platí, že hráči se věří (KNOWN-ISSUES.md): upravený prohlížeč může poslat jiné předměty, ale ne rozbitý soubor.
import { ITEMS, cleanCostume } from '../shared/data/index.js';
import { maxDur } from '../shared/tools.js';

export const ME_MAX_BYTES = 64 * 1024;
export const INV_SLOTS = 36, ARMOR_SLOTS = 4;
const DOC = /^doc_[A-Za-z0-9_-]{1,64}$/; // vytištěné dokumenty mají id podle papíru (shared/world/papers.js)
const known = (id) => typeof id === 'string' && (Object.hasOwn(ITEMS, id) || DOC.test(id));
const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

// Políčko: null, nebo { id, n, w? } (w = opotřebení nástroje, shared/tools.js). Neznámý předmět (třeba odebraný z nové verze hry)
// se zahodí, rozbité políčko = celý stav pryč. Nesmyslné opotřebení se jen vynechá (nástroj bude jako nový).
function slot(s) {
  if (s == null) return null;
  if (typeof s !== 'object' || !Number.isInteger(s.n) || s.n < 1 || s.n > 9999 || typeof s.id !== 'string') throw new Error('slot');
  if (!known(s.id)) return null;
  const max = maxDur(s.id);
  return max && Number.isInteger(s.w) && s.w > 0 && s.w < max ? { id: s.id, n: s.n, w: s.w } : { id: s.id, n: s.n };
}
// { id: true } – co hráč už vyrobil / postavil (tipy ve hře)
function flags(o) {
  if (o == null) return {};
  if (typeof o !== 'object' || Array.isArray(o)) throw new Error('flags');
  const keys = Object.keys(o);
  if (keys.length > 5000) throw new Error('flags');
  const out = {};
  for (const k of keys) if (k.length <= 64 && o[k]) out[k] = true;
  return out;
}

/**
 * Zkontroluje a uklidí stav hráče. Vrátí čistou kopii, nebo null (nesmysl: ignorovat).
 * @param {unknown} me
 * @param {number} [bytes] délka zprávy (JSON), když je známá
 * @returns {{ inv: ({id: string, n: number, w?: number}|null)[], armor: ({id: string, n: number, w?: number}|null)[], off: {id: string, n: number, w?: number}|null, pos: number[], yaw: number, hp: number, hunger: number, crafted: object, placedAny: object, creative: boolean, flying: boolean, flyT: number, look?: object } | null}
 */
export function cleanMe(me, bytes = 0) {
  if (bytes > ME_MAX_BYTES || !me || typeof me !== 'object' || Array.isArray(me)) return null;
  try {
    if (!Array.isArray(me.inv) || me.inv.length !== INV_SLOTS) return null;
    const armor = me.armor == null ? Array(ARMOR_SLOTS).fill(null) : me.armor;
    if (!Array.isArray(armor) || armor.length !== ARMOR_SLOTS) return null;
    if (!Array.isArray(me.pos) || me.pos.length !== 3 || !num(me.pos[0], -1e6, 1e6) || !num(me.pos[1], -1e4, 1e4) || !num(me.pos[2], -1e6, 1e6)) return null;
    const out = {
      inv: me.inv.map(slot),
      armor: armor.map(slot).map((s) => (s && ITEMS[s.id]?.armor ? s : null)),
      pos: me.pos.slice(),
      yaw: num(me.yaw, -1e4, 1e4) ? me.yaw : 0,
      hp: num(me.hp, 0, 1000) ? me.hp : 100,
      hunger: num(me.hunger, 0, 1000) ? me.hunger : 100,
      crafted: flags(me.crafted),
      placedAny: flags(me.placedAny),
      creative: me.creative === true,
      flying: me.flying === true,
      flyT: num(me.flyT, 0, 1e5) ? me.flyT : 0,
      off: slot(me.off ?? null), // druhá ruka (nepovinná; staré prohlížeče ji neposílají)
    };
    if (me.look != null && typeof me.look === 'object') out.look = cleanCostume(me.look); // oblek (jen vzhled), nepovinný

    if (!bytes && JSON.stringify(out).length > ME_MAX_BYTES) return null;
    return out;
  } catch {
    return null;
  }
}
