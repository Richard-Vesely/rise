// Bonusy pro dárce (hlavní vlákno serveru kroužku): které bonusy dal vlastník serveru kterému hráči. Platí na celém
// serveru, ve všech světech. Ukládá se do DATA_DIR/bonuses.json (bezpečný zápis + denní záloha). Příkazy /bonus a
// /odebrat přijímá svět (server/bonus.js) a ptá se sem ({ t: 'bonus', q, op, name, kinds }); nový seznam pak jde
// do všech světů ({ t: 'bonusy', profile, list }), hráč ho dostane hned, ať hraje kdekoli.
// Pravomoc vlastníka serveru (Richard, AGENTS.md pravidlo 11): neměň ji a nedávej ji nikomu jinému.
import fs from 'node:fs';
import path from 'node:path';
import { BONUS_IDS, cleanBonus } from '../shared/data/bonus.js';
import { writeJSON } from './persist.js';

/** Soubor bonusů (null = jen v paměti, testy bez DATA_DIR). */
export const bonusesFile = (dataDir) => (dataDir ? path.join(dataDir, 'bonuses.json') : null);

/**
 * Bonusy hráčů. Bez souboru jen v paměti.
 * @param {string|null} file
 * @param {{ log?: (msg: string) => void, now?: () => number }} [o]
 */
export function createBonuses(file, { log = () => {}, now = Date.now } = {}) {
  /** @type {Map<string, string[]>} id profilu -> bonusy */
  const map = new Map();
  if (file && fs.existsSync(file)) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const [id, list] of Object.entries(data?.players ?? {})) { const c = cleanBonus(list); if (c.length) map.set(id, c); }
    } catch (e) { log('Soubor bonusů se nedá přečíst: ' + e.message); }
  }
  const save = () => {
    if (!file) return;
    try { writeJSON(file, { version: 1, savedAt: new Date(now()).toISOString(), players: Object.fromEntries(map) }, 'bonuses'); } catch (e) { log('Uložení bonusů selhalo: ' + e.message); }
  };
  return {
    /** Bonusy hráče ([] = žádné). */
    get: (id) => map.get(id)?.slice() ?? [],
    /** Všichni hráči s bonusy. */
    all: () => [...map].map(([id, list]) => ({ id, list: list.slice() })),
    /** Přidá a odebere bonusy; vrací nový seznam. */
    change(id, add = [], del = []) {
      const before = map.get(id) ?? [];
      const set = new Set(before);
      for (const k of add) set.add(k);
      for (const k of del) set.delete(k);
      const list = cleanBonus([...set]);
      if (list.length) map.set(id, list); else map.delete(id);
      if (list.join() !== before.join()) save();
      return list;
    },
  };
}

const plain = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('cs').trim();
// Hráč podle jména; bez diakritiky a velkých písmen taky (/bonus bara = Bára), když je takový jen jeden.
function findPlayer(profiles, name) {
  const p = profiles.find(name);
  if (p || !profiles.list) return p;
  const hits = profiles.list().filter((x) => plain(x.name) === plain(name));
  return hits.length === 1 ? hits[0] : null;
}

/**
 * Dotaz světa (příkaz vlastníka). Vrací odpověď pro svět a případně nový seznam, který se rozešle do všech světů.
 * op: 'list' (všichni s bonusy) · 'show' (jeden hráč) · 'add' · 'del' (kinds prázdné = všechny).
 * @param {ReturnType<typeof createBonuses>} bonuses
 * @param {{ find: (name: string) => { id: string, name: string } | null, get: (id: string) => { name: string } | undefined, list?: () => { id: string, name: string }[] }} profiles
 * @param {{ op: string, name?: string, kinds?: string[] }} m
 * @returns {{ reply: { ok: boolean, op: string, name?: string, list?: string[], all?: [string, string[]][] }, push?: { profile: string, list: string[] } }}
 */
export function bonusQuery(bonuses, profiles, m) {
  const op = String(m?.op || '');
  if (op === 'list') return { reply: { ok: true, op, all: bonuses.all().map(({ id, list }) => [profiles.get(id)?.name || '?', list]) } };
  const p = findPlayer(profiles, String(m?.name ?? ''));
  if (!p) return { reply: { ok: false, op, name: String(m?.name ?? '').slice(0, 16) } };
  if (op === 'show') return { reply: { ok: true, op, name: p.name, list: bonuses.get(p.id) } };
  if (op !== 'add' && op !== 'del') return { reply: { ok: false, op } };
  const kinds = cleanBonus(m.kinds);
  const before = bonuses.get(p.id).join();
  const list = op === 'add' ? bonuses.change(p.id, kinds) : bonuses.change(p.id, [], kinds.length ? kinds : BONUS_IDS);
  return { reply: { ok: true, op, name: p.name, list }, push: list.join() !== before ? { profile: p.id, list } : undefined };
}
