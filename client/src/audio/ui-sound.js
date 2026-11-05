// Zvuky triků v inventáři (tažení, dvojklik, řazení, klávesy nad políčkem) a sbírání předmětů.
// Obyčejné vzít / položit, najetí myší, otevření a zavření okna hraje audio/ui-sounds.js (poslouchá celý dokument);
// tady jsou jen akce, které ten posluchač nevidí. Modul nic nespouští při načtení.
import { Sound } from './sound.js';

const tones = (list) => list.forEach(([f, d, v, delay]) => Sound.tone(f, d, v, 'triangle', delay, 0, { attack: 0.003 }));

export const uiSound = {
  /** Vzít předmět (klávesou, kolečkem, Shift + klik). */
  click() { Sound.ui('pick'); },
  /** Položit předmět (po tažení přes jedno políčko, kreativní tažení). */
  put() { Sound.ui('put'); },
  /** Nejde to (plno, špatné políčko). */
  deny() { Sound.ui('error'); },
  /** Rozdělení tažením: tón podle počtu políček. */
  spread(k) { tones([[700 + Math.min(k, 9) * 90, 0.05, 0.05, 0]]); },
  /** Dvojklik: posbírání do kurzoru (rychlé „vrrr" nahoru). */
  gather() { tones([[900, 0.04, 0.04, 0], [1160, 0.04, 0.04, 0.035], [1420, 0.05, 0.04, 0.07]]); },
  /** Seřazení batohu: kaskáda. */
  sort() { tones([[520, 0.08, 0.045, 0], [660, 0.08, 0.045, 0.04], [780, 0.08, 0.045, 0.08], [1040, 0.1, 0.045, 0.12]]); },
  /** Sebrání předmětu ze země: krátké vysoké „plip" s náhodnou výškou. */
  pickup() { Sound.plip(); },
  /** Vyhození předmětu. */
  toss() { Sound.toss(); },
  /** Předmět shořel v lávě: krátké syčení. */
  fizz() { Sound.burst({ dur: 0.45, f0: 5200, f1: 1800, q: 0.6, vol: 0.12, type: 'highpass', attack: 0.01 }); Sound.tone(220, 0.12, 0.05, 'sine', 0, 110, { attack: 0.003 }); },
};
