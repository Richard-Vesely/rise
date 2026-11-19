// Kniha darů serveru kroužku (hlavní vlákno serveru): kdo co daroval do pokladničky u sochy, a dárky od správce,
// které čekají na hráče, až se přihlásí. Ukládá se do DATA_DIR/donations.json (bezpečný zápis + denní záloha
// v DATA_DIR/backups/donations-RRRR-MM-DD.json, 7 posledních). Samotné předměty v pokladničce jsou u světa
// (server/donation-box.js, world.json). Stránka pro správce: server/donations-admin.js.
import fs from 'node:fs';
import path from 'node:path';
import { ITEMS } from '../shared/data/index.js';
import { writeJSON } from './persist.js';

export const TOP_N = 5; // kolik nejštědřejších dárců ukazuje socha
export const GIFT_MAX = 999; // nejvíc kusů jednoho předmětu v jednom dárku od správce

/** Soubor knihy darů (null = jen v paměti, testy bez DATA_DIR). */
export const donationsFile = (dataDir) => (dataDir ? path.join(dataDir, 'donations.json') : null);

/**
 * @typedef {{ t: string, by: string, name: string, id: string, n: number, world: string }} Donation
 * @typedef {{ t: string, to: string, name: string, id: string, n: number, delivered: string|null }} Gift
 */

/**
 * Kniha darů. Bez souboru jen v paměti.
 * @param {string|null} file
 * @param {{ log?: (msg: string) => void, now?: () => number }} [o]
 */
export function createDonations(file, { log = () => {}, now = Date.now } = {}) {
  /** @type {Donation[]} */
  let ledger = [];
  /** @type {Gift[]} */
  let gifts = [];
  if (file && fs.existsSync(file)) {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    ledger = Array.isArray(data.ledger) ? data.ledger : [];
    gifts = Array.isArray(data.gifts) ? data.gifts : [];
  }
  const iso = () => new Date(now()).toISOString();
  const save = () => {
    if (!file) return;
    try { writeJSON(file, { version: 1, savedAt: iso(), ledger, gifts }, 'donations'); } catch (e) { log('Uložení knihy darů selhalo: ' + e.message); }
  };
  return {
    /**
     * Zapíše dar (volá se, když svět přijal předměty do pokladničky).
     * @param {{ by: string, name: string, id: string, n: number, world: string }} d
     */
    add(d) {
      if (!d || typeof d.by !== 'string' || !Object.hasOwn(ITEMS, d.id) || !Number.isInteger(d.n) || d.n < 1) return null;
      const e = { t: iso(), by: d.by, name: String(d.name || '').slice(0, 16), id: d.id, n: d.n, world: String(d.world || '') };
      ledger.push(e);
      save();
      return e;
    },
    /** Všechny dary, nejnovější první. */
    list: () => ledger.slice().reverse(),
    /**
     * Součty podle hráče (nejvíc kusů první). nameOf = aktuální přezdívka profilu (jinak jméno z doby daru).
     * @param {(id: string) => string|undefined} [nameOf]
     * @returns {{ by: string, name: string, n: number, count: number, last: string }[]}
     */
    totals(nameOf = () => undefined) {
      const m = new Map();
      for (const e of ledger) {
        const s = m.get(e.by) || { by: e.by, name: e.name, n: 0, count: 0, last: e.t };
        s.n += e.n; s.count++; s.name = e.name; s.last = e.t;
        m.set(e.by, s);
      }
      for (const s of m.values()) s.name = nameOf(s.by) || s.name;
      return [...m.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'cs'));
    },
    /** Nejštědřejší dárci pro sochu: [[jméno, kusů]…] (bez id profilů, to jde hráčům). */
    top(k = TOP_N, nameOf) { return this.totals(nameOf).slice(0, k).map((s) => [s.name, s.n]); },
    /**
     * Dárek od správce pro hráče: čeká, než si ho svět vyzvedne (takeGifts). Vrací záznam, nebo null (špatný předmět / počet).
     * @param {string} to id profilu
     * @param {string} name přezdívka (do přehledu)
     * @param {string} id předmět
     * @param {number} n kusů
     */
    queueGift(to, name, id, n) {
      if (typeof to !== 'string' || !to || !Object.hasOwn(ITEMS, id) || !Number.isInteger(n) || n < 1 || n > GIFT_MAX) return null;
      const g = { t: iso(), to, name: String(name || '').slice(0, 16), id, n, delivered: null };
      gifts.push(g);
      save();
      return g;
    },
    /** Dárky, které čekají na hráče; zároveň se označí jako doručené. */
    takeGifts(to) {
      const out = gifts.filter((g) => g.to === to && !g.delivered);
      if (!out.length) return [];
      for (const g of out) g.delivered = iso();
      save();
      return out.map((g) => ({ id: g.id, n: g.n }));
    },
    /** Všechny dárky od správce, nejnovější první. */
    gifts: () => gifts.slice().reverse(),
  };
}
