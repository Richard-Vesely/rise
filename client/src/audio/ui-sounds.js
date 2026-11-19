// Zvuky oken a batohu. Modul nic nespouští při načtení.
// - initUISounds(inv): klik na tlačítko, najetí na políčko, vzít / položit předmět v batohu, otevření a zavření batohu,
//   náhled hlasitosti v Nastavení. Poslouchá dokument (nemění kód oken), takže funguje pro všechna okna stejně.
// - uiSound: triky v inventáři (tažení, dvojklik, řazení, klávesy nad políčkem) a sbírání předmětů – akce,
//   které posluchač dokumentu nevidí.
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

let hoverEl = null, hoverT = 0, done = false;
/** Zvuky oken pro celý dokument (jednou, audio/soundscape.js). inv = batoh hráče (player/inventory.js). */
export function initUISounds(inv) {
  if (done) return;
  done = true;
  document.addEventListener('mousedown', (e) => {
    const el = e.target.closest?.('.slot[data-c], [data-out], button, .mc-btn, [data-r], [data-cook], [data-cat], [data-give]');
    if (!el) return;
    if (el.matches('.slot[data-c], [data-out], [data-give]')) {
      const had = inv.cursor ? `${inv.cursor.id}:${inv.cursor.n}` : '';
      setTimeout(() => {
        const now = inv.cursor ? `${inv.cursor.id}:${inv.cursor.n}` : '';
        if (now === had) return; // nic se nestalo (Shift-přesun a výroba mají vlastní zvuk)
        Sound.ui(!had ? 'pick' : !now ? 'put' : now.split(':')[0] !== had.split(':')[0] ? 'pick' : 'put');
      }, 0);
    } else Sound.ui('click');
  }, true);
  // najetí myší: jen při změně prvku a nejvýš 25× za sekundu
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest?.('.slot[data-item], .mc-btn, button, [data-r]');
    if (!el || el === hoverEl) return;
    hoverEl = el;
    const t = performance.now();
    if (t - hoverT > 40) { hoverT = t; Sound.ui('hover'); }
  });
  // otevření a zavření batohu (sleduje, jestli je okno vidět)
  const box = document.getElementById('inventory');
  if (box) {
    let open = box.style.display === 'grid';
    new MutationObserver(() => { const now = box.style.display === 'grid'; if (now !== open) { open = now; Sound.ui(now ? 'open' : 'close'); } }).observe(box, { attributes: true, attributeFilter: ['style'] });
  }
  // posuvníky hlasitosti: krátký zvuk novou hlasitostí
  addEventListener('rise-prefs', () => { const t = performance.now(); if (t - hoverT > 90) { hoverT = t; Sound.ui('put'); } });
}
