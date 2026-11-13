// Pokladnička darů u sochy (jeden svět serveru, běží ve vlákně světa server/world-worker.js).
// Je to truhla jen jedním směrem: dát do ní může každý, brát z ní smí jen vlastník serveru (server/owner.js).
// Všechno se rozhoduje tady na serveru podle přihlášeného profilu, prohlížeči se nevěří.
// Předměty v pokladničce se ukládají se světem (world.json → donations), každý dar se zapíše do knihy darů
// v hlavním vlákně (server/donations.js) a nejštědřejší dárci se ukazují u sochy.
//   hráč → server: ['dary'] stav pokladničky · ['donate', id, n, w?] dát předměty · ['take', index, id] vzít (jen vlastník)
//   server → hráč: ['dary', { top: [[jméno, kusů]…], owner, ownerName, box: [[id, n, w]…] | null }] (box jen vlastníkovi)
import { ITEMS } from '../shared/data/index.js';
import { ownerItem } from '../shared/data/magic.js';
import { maxDur } from '../shared/tools.js';
import { isOwner } from './owner.js';

export const BOX_MAX = 3000; // nejvíc různých hromádek v pokladničce (pak se dar vrátí)
const known = (id) => typeof id === 'string' && Object.hasOwn(ITEMS, id);
const wearOf = (id, w) => { const max = maxDur(id); return max && Number.isInteger(w) && w > 0 && w < max ? w : 0; };

// Uložená pokladnička: jen platné hromádky { id, n, w? }.
function cleanBox(saved) {
  const out = [];
  for (const s of Array.isArray(saved) ? saved : []) {
    if (!s || !known(s.id) || !Number.isInteger(s.n) || s.n < 1) continue;
    const w = wearOf(s.id, s.w);
    out.push(w ? { id: s.id, n: s.n, w } : { id: s.id, n: s.n });
  }
  return out;
}

/**
 * @param {object} o
 * @param {string} o.ownerId id profilu vlastníka ('' = nikdo)
 * @param {string} [o.ownerName] jeho přezdívka (do textů pro hráče)
 * @param {unknown} [o.saved] uložené předměty pokladničky (world.json → donations.box)
 * @param {(cid: string, msg: unknown[]) => void} o.send zpráva jednomu hráči
 * @param {(d: { by: string, name: string, id: string, n: number }) => void} o.onDonation dar přijat (zápis do knihy darů)
 */
export function createDonationBox({ ownerId, ownerName = '', saved, send, onDonation }) {
  const box = cleanBox(saved);
  let top = [];
  const who = ownerName || 'vlastník serveru';
  const state = (profile) => {
    const owner = isOwner(ownerId, profile);
    return { top, owner, ownerName: who, box: owner ? box.map((s) => [s.id, s.n, s.w || 0]) : null };
  };
  const sendState = (cid, profile) => send(cid, ['dary', state(profile)]);

  // Dar od hráče: předmět si už vzal z batohu, tak se buď přijme, nebo mu ho server vrátí.
  function donate(cid, profile, name, [, id, n, w]) {
    if (!known(id) || !Number.isInteger(n) || n < 1 || n > Math.max(1, ITEMS[id].stack || 64)) return; // nesmysl: nic se nevrací
    const wear = wearOf(id, w);
    const back = () => send(cid, wear ? ['give', id, n, wear] : ['give', id, n]);
    if (ownerItem(id)) { if (isOwner(ownerId, profile)) back(); send(cid, ['toast', 'Hůl vlastníka se darovat nedá']); return; } // jen vlastník ji dostane zpátky
    if (!profile) { back(); send(cid, ['toast', 'Darovat jde jen na serveru kroužku s přihlášeným hráčem']); return; }
    const same = box.find((s) => s.id === id && (s.w || 0) === wear);
    if (!same && box.length >= BOX_MAX) { back(); send(cid, ['toast', 'Pokladnička je plná, zkus to jindy']); return; }
    if (same) same.n += n; else box.push(wear ? { id, n, w: wear } : { id, n });
    if (!isOwner(ownerId, profile)) onDonation({ by: profile, name, id, n }); // vlastník si dává sám sobě: do knihy darů ne
    send(cid, ['toast', `Díky! Daroval(a) jsi ${n}× ${ITEMS[id].name}`]);
    sendState(cid, profile);
  }
  // Vzít z pokladničky: jen vlastník. Komukoli jinému server odmítne a pošle mu skutečný stav.
  function take(cid, profile, [, i, id]) {
    if (!isOwner(ownerId, profile)) {
      send(cid, ['toast', `Z pokladničky může brát jen ${who}`]);
      sendState(cid, profile);
      return false;
    }
    const s = box[Number(i)];
    if (!s || s.id !== id) { sendState(cid, profile); return false; } // mezitím se pokladnička změnila
    const k = Math.min(s.n, Math.max(1, ITEMS[s.id].stack || 64));
    s.n -= k;
    if (!s.n) box.splice(Number(i), 1);
    send(cid, s.w ? ['give', s.id, k, s.w] : ['give', s.id, k]);
    sendState(cid, profile);
    return true;
  }

  return {
    /**
     * Zpráva od hráče. Vrací true, když patřila pokladničce (místnost ji pak už nedostane).
     * @param {string} cid spojení
     * @param {string|null} profile id profilu
     * @param {string} name přezdívka
     * @param {unknown[]} msg
     */
    handle(cid, profile, name, msg) {
      switch (msg[0]) {
        case 'dary': sendState(cid, profile); return true;
        case 'donate': donate(cid, profile, name, msg); return true;
        case 'take': take(cid, profile, msg); return true;
      }
      return false;
    },
    /** Pošle stav pokladničky hráči (při vstupu do světa). */
    sendState,
    /** Nový žebříček dárců z hlavního vlákna. */
    setTop(t) { top = Array.isArray(t) ? t : []; },
    /** Předměty do pokladničky bez zápisu do knihy darů (výkupné z vězení, server/prison.js). */
    put(id, n) {
      if (!known(id) || !Number.isInteger(n) || n < 1) return;
      const same = box.find((s) => s.id === id && !s.w);
      if (same) same.n += n; else box.push({ id, n });
    },
    /** Předměty v pokladničce (do world.json). */
    save: () => box.map((s) => ({ ...s })),
    /** Kolik kusů je v pokladničce (testy, přehled). */
    count: () => box.reduce((a, s) => a + s.n, 0),
  };
}
