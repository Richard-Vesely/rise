// Hůl vlastníka serveru (jen server kroužku, běží ve vlákně světa server/world-worker.js). Pravomoc vlastníka (AGENTS.md
// pravidlo 11): patří Richardovi, neměň ji a nedávej ji nikomu jinému.
// - Vlastník (OWNER_ID, server/owner.js) má hůl vždycky: když mu v uloženém batohu chybí, server mu ji vrátí (['give']).
// - Nikdo jiný ji mít nesmí: z uloženého stavu ostatních hráčů ji server vyhodí; na zem (op 'g') ani do truhel a strojů
//   (malé mapy, 'kv') se nedostane.
// - Kouzla hole: hráč → server ['ospell', kouzlo, 'm' | 'p', nid tvora | pid hráče]. Server ověří vlastníka podle
//   přihlášeného profilu (prohlížeči se nevěří), dosah a pak:
//   'avada' (Avada Kedavra): tvora zabije kdekoli; hráče jen ve světě se souboji (hitPlayer v shared/net/room.js s parametrem kill),
//   'hunt' (Štvanice): tvorové kolem hráče dostanou rudé oči a HUNT.time s ho loví (shared/sim/hunt.js); ve všech světech.
import { AVADA, OWNER_SPELLS, ownerItem } from '../shared/data/magic.js';
import { NET } from '../shared/net/net.js';
import { hitPlayer, others, sendTo } from '../shared/net/room.js';
import { HUNT, startHunt } from '../shared/sim/hunt.js';
import { hurtMob, mobs } from '../shared/sim/mobs.js';
import { isOwner } from './owner.js';

export const OWNER_WAND = 'owner_wand';
const GIVE_EVERY = 20; // s: hůl se vrací nejvýš jednou za tuto dobu (batoh se posílá každých 10 s)
const CAST_EVERY = 1; // s: nejvýš jedno kouzlo za sekundu
const hasWand = (me) => [...(me?.inv || []), ...(me?.armor || [])].some((s) => s?.id === OWNER_WAND);
const isOwnerSlot = (s) => !!s && typeof s === 'object' && ownerItem(s.id);

/**
 * Uložený stav hráče (výsledek cleanMe): ostatním hráčům se předměty vlastníka vyhodí, vlastníkovi se hůl vloží
 * do prvního volného políčka, když chybí. Mění `me` na místě a vrací true, když vlastníkovi hůl chyběla.
 * @param {{ inv: ({id: string, n: number}|null)[], armor?: ({id: string, n: number}|null)[] } | null} me
 * @param {boolean} owner
 */
export function fixOwnerItems(me, owner) {
  if (!me || !Array.isArray(me.inv)) return owner;
  let found = false;
  for (const arr of [me.inv, me.armor || []]) {
    for (let i = 0; i < arr.length; i++) {
      if (!isOwnerSlot(arr[i])) continue;
      if (!owner || found || arr !== me.inv) arr[i] = null; // cizí hráč, druhá hůl, nebo hůl v brnění
      else { arr[i] = { id: arr[i].id, n: 1 }; found = true; }
    }
  }
  if (!owner || found) return false;
  const free = me.inv.indexOf(null);
  if (free >= 0) me.inv[free] = { id: OWNER_WAND, n: 1 };
  return true;
}

/** Změny světa od hráče: předmět vlastníka nesmí ležet na zemi (op ['g', gid, id, …]). Vrací ops bez nich. */
export const guardOwnerOps = (ops) => ops.filter((o) => !(Array.isArray(o) && o[0] === 'g' && ownerItem(o[2])));

/** Malé mapy od hráče (['kv', [[mapa, klíč, hodnota]…]]): z truhel, strojů a aut se předměty vlastníka vyhodí. */
export function guardOwnerKV(changes) {
  const clean = (arr) => (Array.isArray(arr) && arr.some(isOwnerSlot) ? arr.map((s) => (isOwnerSlot(s) ? null : s)) : arr);
  for (const ch of changes) {
    if (!Array.isArray(ch) || !ch[2] || typeof ch[2] !== 'object') continue;
    if (Array.isArray(ch[2])) ch[2] = clean(ch[2]);
    else if (Array.isArray(ch[2].slots)) ch[2] = { ...ch[2], slots: clean(ch[2].slots) };
  }
  return changes;
}

/**
 * @param {object} o
 * @param {string} o.ownerId id profilu vlastníka ('' = nikdo)
 * @param {(cid: string, msg: unknown[]) => void} o.send zpráva jednomu hráči
 * @param {() => number} [o.now] čas v sekundách (testy)
 */
export function createOwnerWand({ ownerId, send, now = () => performance.now() / 1000 }) {
  const gave = new Map(), cast = new Map(); // cid -> kdy naposledy dostal hůl / kouzlil
  const giveBack = (cid) => {
    if (now() - (gave.get(cid) ?? -1e9) < GIVE_EVERY) return;
    gave.set(cid, now());
    send(cid, ['give', OWNER_WAND, 1]);
  };

  /** Kouzlo hole ['ospell', kouzlo, druh, cíl]. Vrací, co se stalo: 'mob' | 'player' | 'hunt' | 'denied' | 'miss'. */
  function spell(cid, profile, [, sp, kind, id]) {
    if (!isOwner(ownerId, profile)) { send(cid, ['toast', 'Tohle kouzlo umí jen hůl vlastníka serveru']); return 'denied'; }
    if (!OWNER_SPELLS.includes(sp)) return 'miss';
    const t = now();
    if (t - (cast.get(cid) ?? -1e9) < CAST_EVERY) return 'miss';
    cast.set(cid, t);
    const a = others.get(cid)?.pose;
    if (!a || a.alive === false) return 'miss';
    const near = (x, y, z) => Math.hypot(x - a.x, y - a.y, z - a.z) <= AVADA.range + 2;
    if (sp === 'hunt') { // Štvanice: jen na hráče
      const P = typeof id === 'string' && id !== cid ? others.get(id) : null, q = P?.pose;
      if (kind !== 'p' || !q || q.alive === false || !near(q.x, q.y, q.z)) return 'miss';
      startHunt(id, HUNT.time);
      send(cid, ['toast', `Štvanice: tvorové ${HUNT.time} s loví hráče ${P.name}`]);
      sendTo(id, ['toast', '👁 Tvorové mají rudé oči a jdou po tobě!']);
      return 'hunt';
    }
    if (kind === 'm') {
      const m = mobs.find((x) => x.nid === id && !x.dead);
      if (!m || !near(m.pos.x, m.pos.y, m.pos.z)) return 'miss';
      m.invT = 0;
      NET.killer = cid; // kořist a XP patří vlastníkovi (jako úder mečem)
      try { hurtMob(m, Math.max(1, m.hp) + AVADA.dmg, Math.atan2(a.x - m.pos.x, a.z - m.pos.z), 0.5); } finally { NET.killer = null; }
      return m.dead ? 'mob' : 'miss';
    }
    if (kind === 'p' && typeof id === 'string') {
      if (!hitPlayer(cid, id, 0, 0, 0, true, AVADA.dmg)) {
        send(cid, ['toast', 'Tady Avada Kedavra hráče nezasáhne (souboje jsou tu vypnuté)']);
        return 'miss';
      }
      sendTo(id, ['toast', '☠ Avada Kedavra!']);
      return 'player';
    }
    return 'miss';
  }

  return {
    /** Stav hráče do uvítání (null = poprvé): ostatním se hůl vyhodí, vlastníkovi se vloží. */
    welcomeMe(profile, me) { if (me) fixOwnerItems(me, isOwner(ownerId, profile)); return me; },
    /** Batoh od hráče (['me'], už prošel cleanMe): uklidit; vlastníkovi chybí hůl = poslat ji. */
    onMe(cid, profile, me) {
      if (fixOwnerItems(me, isOwner(ownerId, profile))) giveBack(cid);
      return me;
    },
    /** První poloha hráče (hra už běží): vlastník bez hole v uloženém stavu ji dostane. */
    onFirstPose(cid, profile, saved) {
      if (isOwner(ownerId, profile) && !hasWand(saved)) giveBack(cid);
    },
    /** Zpráva od hráče. Vrací true, když patřila holi (místnost ji pak už nedostane). */
    handle(cid, profile, msg) {
      if (msg[0] !== 'ospell') return false;
      spell(cid, profile, msg);
      return true;
    },
    /** Hráč odešel. */
    gone(cid) { gave.delete(cid); cast.delete(cid); },
    spell,
  };
}
