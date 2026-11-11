// Markova armáda a vlastník serveru kroužku (Richard), jen na serveru v Node.js (běží ve vlákně světa server/world-worker.js).
// 1. Vlastník (OWNER_ID, server/owner.js) smí armádě velet vždycky, stejnými příkazy jako Marek (shared/sim/army.js).
// 2. Tajná věta ARMY_PHRASE (proměnná prostředí, nikdy v repozitáři): když ji vlastník napíše do chatu (bez ohledu na velká
//    a malá písmena a mezery okolo), armáda poslouchá jen jeho a Markovy příkazy přestanou platit; stejná věta znovu
//    vrátí velení Markovi. Věta se nikomu nerozesílá, nikam nezapisuje a do logu nejde. Od kohokoli jiného je to
//    obyčejná zpráva v chatu. Prázdné ARMY_PHRASE = převzetí vypnuté (vlastník velí dál podle bodu 1).
// Kdo je vlastník, se pozná jen tady na serveru podle přihlášeného profilu; prohlížeči se nikdy nevěří.
// Stav převzetí se ukládá se světem (world.json → army: { owner: true }). Pravomoci vlastníka patří Richardovi (AGENTS.md, pravidlo 11).
import { ARMY, isArmyCommand, isMarek } from '../shared/sim/army.js';
import { isOwner } from './owner.js';

/** Upravená tajná věta z proměnné prostředí ('' = převzetí vypnuté). */
export const armyPhraseFrom = (raw) => String(raw ?? '').normalize('NFC').trim().toLowerCase();
const said = (text) => String(text ?? '').slice(0, 200).normalize('NFC').trim().toLowerCase(); // jako chat v shared/net/room.js
const ARMY_NAME = '⚔ Armáda';

/**
 * @param {object} o
 * @param {string} o.ownerId id profilu vlastníka ('' = nikdo)
 * @param {string} [o.ownerName] jeho přezdívka (do odpovědí)
 * @param {string} [o.phrase] tajná věta už upravená armyPhraseFrom ('' = převzetí vypnuté)
 * @param {unknown} [o.saved] uložený stav (world.json → army)
 * @param {(cid: string, msg: unknown[]) => void} o.send zpráva jednomu hráči
 * @param {(cid: string, name: string, text: string) => boolean} o.command příkaz armády za vlastníka (armyChat s leader = true)
 * @param {() => [string, string][]} o.players hráči ve světě [[cid, jméno v místnosti]…]
 * @param {(text: string) => void} [o.log]
 */
export function createArmyOwner({ ownerId, ownerName = '', phrase = '', saved, send, command, players, log = () => {} }) {
  const enabled = !!ownerId && !!phrase; // bez vlastníka nebo bez věty nejde převzít (a uložené převzetí neplatí)
  let taken = !!(saved && typeof saved === 'object' && /** @type {any} */ (saved).owner === true);
  const who = ownerName || 'vlastníka serveru';
  const reply = (cid, t) => send(cid, ['chat', ARMY_NAME, t]);
  const toMarek = (t) => { for (const [cid, name] of players()) if (isMarek(name)) reply(cid, t); };

  function toggle(cid) {
    taken = !taken;
    if (taken) { // armáda se otočí k vlastníkovi: přestane útočit, rudy z dolu a hlášení jdou jemu
      ARMY.leader = cid;
      if (ARMY.mode === 'attack') { ARMY.mode = 'follow'; ARMY.target = null; }
      ARMY.give = (id, n) => send(cid, ['give', id, n]);
      ARMY.reply = (t) => reply(cid, t);
      reply(cid, 'Armáda teď poslouchá jen tebe. Stejná věta znovu ji vrátí Markovi.');
      toMarek(`Teď posloucháme jen hráče ${who}.`);
    } else {
      reply(cid, 'Armáda zase poslouchá Marka.');
      toMarek('Zase posloucháme tebe.');
    }
    log(taken ? 'armáda: velí jen vlastník serveru' : 'armáda: velí zase Marek');
  }

  return {
    /**
     * Zpráva od hráče. Vrací true, když ji vyřídila (místnost ji pak už nedostane a nikomu se nerozešle).
     * @param {string} cid spojení (= pid v místnosti)
     * @param {string|null} profile id profilu
     * @param {string} name jméno hráče v místnosti
     * @param {unknown[]} msg
     */
    handle(cid, profile, name, msg) {
      if (msg[0] !== 'chat') return false;
      const raw = String(msg[1] ?? '').slice(0, 200).trim();
      if (isOwner(ownerId, profile)) {
        if (enabled && said(raw) === phrase) { toggle(cid); return true; }
        return raw.startsWith('/') && command(cid, name, raw);
      }
      if (enabled && taken && isMarek(name) && isArmyCommand(raw)) { reply(cid, `Teď posloucháme jen hráče ${who}.`); return true; }
      return false;
    },
    /** Velí teď jen vlastník? */
    taken: () => enabled && taken,
    /** Stav do world.json. */
    save: () => ({ owner: taken }),
  };
}
