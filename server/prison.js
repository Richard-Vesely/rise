// Vězení serveru kroužku (jen server v Node.js, běží ve vlákně světa server/world-worker.js). Pravomoc vlastníka
// serveru (Richard, AGENTS.md pravidlo 11): neměň ji a nedávej ji nikomu jinému.
// 1. Vlastník (OWNER_ID, server/owner.js) napíše do chatu /vezeni <jméno> = hráč jde do vězení, /propustit <jméno> = je volný,
//    /vezeni bez jména = kdo je ve vězení. Příkaz se nikomu nerozesílá. Od kohokoli jiného je to obyčejná zpráva v chatu.
// 2. Kdo zabije vlastníka (souboj hráčů, shared/net/room.js arenaDeath → room.onKill), jde do vězení sám.
// 3. Ven: vězeň daruje PRISON_RELEASE ok obřího pavouka do pokladničky u sochy ve vězení (jiné předměty se mu vrátí).
//    Oka jdou vlastníkovi do pokladničky (ne do knihy darů: je to trest, ne dar). Pak se vrátí na spawn.
// Vězení samo (bílá plošina, pavouci) je v shared/world/prison.js. Ve vězení se nestaví ani nekope (guardPrisonerOps)
// a vězeň, který se dostane ven (smrt, let, podvod), se hned vrátí. Kdo je ve vězení, se ukládá se světem
// (world.json → prison: { prisoners: { id profilu: { name, given } } }), takže to platí i po restartu a novém přihlášení.
//   server → hráč: ['vezeni', { on, need, given, item, at: [x, y, z], go? }] (go = přenést hráče na místo at hned teď)
import { ITEMS } from '../shared/data/index.js';
import { ownerItem } from '../shared/data/magic.js';
import { PRISON_ITEM, PRISON_RELEASE, PRISON_SPOT, SPAWN_SPOT, inPrison } from '../shared/world/prison.js';
import { isOwner } from './owner.js';

const NAME = '⛓ Vězení';
const RESEND_MS = 2000; // vězeň mimo vězení (nebo volný hráč ve vězení) se přenese nejvýš jednou za 2 s
/** Jméno nebo příkaz bez diakritiky a velkých písmen (porovnávání). */
export const plainName = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('cs').trim();

/**
 * @param {object} o
 * @param {string} o.ownerId id profilu vlastníka ('' = nikdo: příkazy nefungují, zabití nikoho nezavře)
 * @param {string} [o.ownerName] jeho přezdívka (do textů pro hráče)
 * @param {unknown} [o.saved] uložený stav (world.json → prison)
 * @param {(cid: string, msg: unknown[]) => void} o.send zpráva jednomu hráči
 * @param {() => Iterable<[string, { profile: string|null, name: string }]>} o.conns hráči ve světě [cid, { profile, name }]
 * @param {(name: string, done: (p: { id: string, name: string } | null) => void) => void} o.lookup profil podle jména (i hráče, který tu teď není)
 * @param {(id: string, n: number) => void} o.put předměty do pokladničky vlastníka (server/donation-box.js)
 * @param {(text: string) => void} [o.log]
 * @param {number} [o.need] kolik ok je potřeba (výchozí PRISON_RELEASE)
 * @param {() => number} [o.now]
 */
export function createPrison({ ownerId, ownerName = '', saved, send, conns, lookup, put, log = () => {}, need = PRISON_RELEASE, now = Date.now }) {
  /** @type {Map<string, { name: string, given: number }>} id profilu -> vězeň */
  const prisoners = new Map();
  const list = /** @type {any} */ (saved)?.prisoners;
  if (list && typeof list === 'object') for (const [id, p] of Object.entries(list)) {
    if (!p || typeof p !== 'object' || isOwner(ownerId, id)) continue; // vlastník ve vězení nikdy není
    prisoners.set(id, { name: String(p.name || '').slice(0, 16), given: Number.isInteger(p.given) && p.given > 0 ? Math.min(p.given, need - 1) : 0 });
  }
  const seen = new Map(); // cid -> kdy jsme mu naposledy poslali, kde má být (0 = ještě nikdy od vstupu)
  const who = ownerName || 'Vlastník serveru';
  const item = ITEMS[PRISON_ITEM].name;
  const reply = (cid, t) => send(cid, ['chat', NAME, t]);
  const online = (profile) => [...conns()].filter(([, c]) => c.profile && c.profile === profile).map(([cid]) => cid);
  const state = (p, go) => ['vezeni', { on: true, need, given: p.given, item: PRISON_ITEM, at: PRISON_SPOT, ...(go ? { go: 1 } : {}) }];
  const free = ['vezeni', { on: false, at: SPAWN_SPOT, go: 1 }];
  const toOwner = (t) => { for (const [cid, c] of conns()) if (isOwner(ownerId, c.profile)) reply(cid, t); };

  function jail(profile, name, why) {
    if (prisoners.has(profile)) return false;
    const p = { name: String(name).slice(0, 16), given: 0 };
    prisoners.set(profile, p);
    log(`vězení: ${p.name} ${why === 'kill' ? 'zabil vlastníka serveru' : 'poslán vlastníkem'}`);
    for (const cid of online(profile)) {
      send(cid, state(p, true));
      seen.set(cid, now());
      send(cid, ['toast', why === 'kill' ? 'Zabil(a) jsi vlastníka serveru. Jdeš do vězení!' : `${who} tě poslal(a) do vězení!`]);
      reply(cid, `Jsi ve vězení. Ven se dostaneš, až daruješ ${need}× ${item} do pokladničky u sochy. Oka mají obří pavouci.`);
    }
    return true;
  }
  function release(profile, why) {
    const p = prisoners.get(profile);
    if (!p) return false;
    prisoners.delete(profile);
    log(`vězení: ${p.name} je volný (${why === 'paid' ? 'daroval výkupné' : 'propustil ho vlastník'})`);
    for (const cid of online(profile)) {
      send(cid, free);
      seen.set(cid, now());
      send(cid, ['toast', why === 'paid' ? 'Jsi volný(á)! Vítej zpátky.' : `${who} tě propustil(a) z vězení.`]);
    }
    return true;
  }
  // Hráč podle jména: nejdřív ve světě, pak v profilech serveru (i když teď nehraje).
  function find(name, done) {
    const key = plainName(name);
    for (const [, c] of conns()) if (c.profile && plainName(c.name) === key) return done({ id: c.profile, name: c.name });
    lookup(name, done);
  }

  function command(cid, text) {
    const [cmd, ...rest] = text.slice(1).split(/\s+/);
    const c = plainName(cmd), arg = rest.join(' ').trim();
    if (c !== 'vezeni' && c !== 'propustit') return false;
    if (c === 'vezeni' && !arg) {
      reply(cid, prisoners.size ? 'Ve vězení: ' + [...prisoners.values()].map((p) => `${p.name} ${p.given}/${need}`).join(', ') : 'Ve vězení nikdo není.');
      return true;
    }
    if (c === 'propustit') {
      const key = plainName(arg);
      const hit = [...prisoners].find(([, p]) => plainName(p.name) === key);
      if (!arg || !hit) { reply(cid, `${arg || 'Ten hráč'} ve vězení není.`); return true; }
      release(hit[0], 'owner');
      reply(cid, `${hit[1].name} je volný(á).`);
      return true;
    }
    find(arg, (p) => {
      if (!p) { reply(cid, `Hráče „${arg}“ neznám.`); return; }
      if (isOwner(ownerId, p.id)) { reply(cid, 'Sebe do vězení poslat nemůžeš.'); return; }
      const was = prisoners.get(p.id);
      if (was) { reply(cid, `${was.name} už ve vězení je (${was.given}/${need}).`); return; }
      jail(p.id, p.name, 'owner');
      reply(cid, `${p.name} je ve vězení. Ven se dostane, až daruje ${need}× ${item}.`);
    });
    return true;
  }

  // Dar od vězně: jen oka obřího pavouka (jiné předměty se vrátí), počítají se do výkupného.
  function donate(cid, profile, [, id, n, w]) {
    if (typeof id !== 'string' || !Object.hasOwn(ITEMS, id) || !Number.isInteger(n) || n < 1 || n > Math.max(1, ITEMS[id].stack || 64)) return; // nesmysl
    const back = (k) => send(cid, Number.isInteger(w) && w > 0 ? ['give', id, k, w] : ['give', id, k]);
    if (ownerItem(id)) { send(cid, ['toast', 'Hůl vlastníka se darovat nedá']); return; } // vězeň ji mít nesmí: nevrací se (vlastník do vězení nejde)
    if (id !== PRISON_ITEM) { back(n); send(cid, ['toast', `Ve vězení můžeš darovat jen ${item}`]); return; }
    const p = prisoners.get(profile);
    const k = Math.min(n, need - p.given);
    put(id, k);
    p.given += k;
    if (n > k) back(n - k);
    if (p.given >= need) {
      release(profile, 'paid');
      toOwner(`${p.name} daroval(a) ${need}× ${item} a je volný(á).`);
      return;
    }
    send(cid, state(p, false));
    send(cid, ['toast', `Díky! Ještě ${need - p.given}× ${item} a jsi volný(á).`]);
  }

  // Poloha hráče: vězeň patří do vězení, volný hráč (kromě vlastníka) ne.
  function pose(cid, profile, q) {
    if (!profile || !q || typeof q !== 'object' || ![q.x, q.y, q.z].every(Number.isFinite)) return;
    const p = prisoners.get(profile), last = seen.get(cid);
    if (p && last === undefined) { send(cid, state(p, true)); seen.set(cid, now()); return; } // první poloha po vstupu: do vězení
    if (q.alive === false || now() - (last ?? 0) < RESEND_MS) return;
    const inside = inPrison(q.x, q.y, q.z);
    if (p && !inside) { send(cid, state(p, true)); seen.set(cid, now()); }
    else if (!p && inside && !isOwner(ownerId, profile)) { send(cid, free); seen.set(cid, now()); } // propuštěn, když tu nebyl
  }

  return {
    /**
     * Zpráva od hráče. Vrací true, když ji vyřídilo vězení (místnost ji pak už nedostane).
     * @param {string} cid
     * @param {string|null} profile
     * @param {unknown[]} msg
     */
    handle(cid, profile, msg) {
      switch (msg[0]) {
        case 'chat': {
          const text = String(msg[1] ?? '').slice(0, 200).trim();
          if (!text.startsWith('/')) return false;
          if (isOwner(ownerId, profile)) return command(cid, text);
          if (profile && prisoners.has(profile)) { reply(cid, 'Ve vězení příkazy nefungují.'); return true; } // ani armáda, ani /svet
          return false;
        }
        case 'donate':
          if (!profile || !prisoners.has(profile)) return false;
          donate(cid, profile, msg);
          return true;
        case 'pose': pose(cid, profile, msg[1]); return false;
      }
      return false;
    },
    /** Hráč killer zabil hráče victim (cid z místnosti): kdo zabije vlastníka, jde do vězení. */
    onKill(killer, victim) {
      const c = new Map(conns());
      const k = c.get(killer), v = c.get(victim);
      if (!k?.profile || !v || !isOwner(ownerId, v.profile) || isOwner(ownerId, k.profile)) return false;
      return jail(k.profile, k.name, 'kill');
    },
    /** Je profil ve vězení? */
    isPrisoner: (profile) => !!profile && prisoners.has(profile),
    /** Hráč odešel ze světa. */
    gone(cid) { seen.delete(cid); },
    /** Vězni [[id profilu, { name, given }]…] (testy, přehled). */
    list: () => [...prisoners].map(([id, p]) => [id, { ...p }]),
    /** Stav do world.json. */
    save: () => ({ prisoners: Object.fromEntries([...prisoners].map(([id, p]) => [id, { ...p }])) }),
  };
}
