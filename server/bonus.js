// Bonusy pro dárce ve světě serveru kroužku (běží ve vlákně světa server/world-worker.js). Pravomoc vlastníka serveru
// (Richard, AGENTS.md pravidlo 11): neměň ji a nedávej ji nikomu jinému.
// 1. Vlastník (OWNER_ID, server/owner.js) píše do chatu (nikomu se to nerozesílá, od kohokoli jiného je to obyčejný chat):
//      /bonus                       kdo má jaké bonusy + nápověda
//      /bonus <jméno>               bonusy jednoho hráče
//      /bonus <jméno> <druh…>       dá bonusy (syty, obrana, let, teleport, vse; shared/data/bonus.js)
//      /odebrat <jméno> [druh…]     vezme bonusy (bez druhu = všechny)
// 2. Bonusy se pamatují u profilu v hlavním vlákně (server/bonuses.js), platí ve všech světech.
// 3. Hráč dostane ['bonus', [druhy]] po první poloze ve světě (hra už běží) a pak po každé změně.
import { BONUS_IDS, bonusKind, bonusNames, cleanBonus } from '../shared/data/bonus.js';
import { isOwner } from './owner.js';

const NAME = '🎁 Bonusy';
const plain = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('cs').trim();
export const BONUS_HELP = '/bonus <jméno> <syty | obrana | let | teleport | vse> · /odebrat <jméno> [druh] · /bonus <jméno> = co má';

/**
 * Příkaz z chatu → dotaz pro hlavní vlákno, nebo text odpovědi rovnou, nebo null (není to příkaz bonusů).
 * @param {string} text
 * @returns {{ op: string, name?: string, kinds?: string[] } | { say: string } | null}
 */
export function parseBonus(text) {
  if (typeof text !== 'string' || !text.startsWith('/')) return null;
  const [cmd, ...words] = text.slice(1).trim().split(/\s+/).filter(Boolean);
  const c = plain(cmd);
  if (c !== 'bonus' && c !== 'odebrat') return null;
  const kinds = [];
  while (words.length && bonusKind(words.at(-1))) kinds.unshift(bonusKind(words.pop())); // druhy jsou na konci, jméno může mít mezery
  const name = words.join(' ');
  const all = kinds.includes('vse') ? BONUS_IDS : cleanBonus(kinds);
  if (c === 'odebrat') return name ? { op: 'del', name, kinds: all } : { say: 'Napiš jméno hráče: ' + BONUS_HELP };
  if (!name) return kinds.length ? { say: 'Napiš i jméno hráče: ' + BONUS_HELP } : { op: 'list' };
  return all.length ? { op: 'add', name, kinds: all } : { op: 'show', name };
}

/** Text odpovědi vlastníkovi na odpověď hlavního vlákna. */
export function bonusReply(r) {
  if (!r?.ok) return r?.name ? `Hráče „${r.name}“ neznám.` : 'Tohle nejde.';
  if (r.op === 'list') return (r.all?.length ? 'Bonusy: ' + r.all.map(([n, l]) => `${n} (${bonusNames(l)})`).join(' · ') : 'Bonusy zatím nikdo nemá.') + '\n' + BONUS_HELP;
  const has = r.list?.length ? bonusNames(r.list) : 'žádné';
  if (r.op === 'show') return `${r.name} má bonusy: ${has}`;
  return `${r.name} ${r.op === 'add' ? 'dostal(a) bonus' : 'už nemá bonus'}. Teď má: ${has}`;
}

/**
 * @param {object} o
 * @param {string} o.ownerId id profilu vlastníka ('' = nikdo: příkazy nefungují)
 * @param {(cid: string, msg: unknown[]) => void} o.send zpráva jednomu hráči
 * @param {(q: { op: string, name?: string, kinds?: string[] }, done: (r: any) => void) => void} o.ask dotaz do hlavního vlákna
 */
export function createBonusOwner({ ownerId, send, ask }) {
  /** @type {Map<string, { profile: string|null, list: string[], posed: boolean }>} cid -> hráč ve světě */
  const players = new Map();
  const reply = (cid, t) => send(cid, ['chat', NAME, t]);
  return {
    /** Hráč přišel do světa s bonusy z hlavního vlákna. */
    join(cid, profile, list) { players.set(cid, { profile, list: cleanBonus(list), posed: false }); },
    gone(cid) { players.delete(cid); },
    /** Zpráva od hráče. Vrací true, když ji vyřídil (místnost ji pak už nedostane a nikomu se nerozešle). */
    handle(cid, profile, msg) {
      const P = players.get(cid);
      if (msg[0] === 'pose' && P && !P.posed) { P.posed = true; if (P.list.length) send(cid, ['bonus', P.list]); return false; } // hra už běží
      if (msg[0] !== 'chat' || !isOwner(ownerId, profile)) return false;
      const q = parseBonus(String(msg[1] ?? '').slice(0, 200).trim());
      if (!q) return false;
      if ('say' in q) reply(cid, q.say);
      else ask(q, (r) => reply(cid, bonusReply(r)));
      return true;
    },
    /** Nový seznam bonusů hráče (z hlavního vlákna, po příkazu vlastníka v kterémkoli světě). */
    update(profile, list) {
      for (const [cid, P] of players) {
        if (P.profile !== profile) continue;
        P.list = cleanBonus(list);
        if (P.posed) send(cid, ['bonus', P.list]);
      }
    },
  };
}
