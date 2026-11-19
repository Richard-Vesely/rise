// Trezor v prohlížeči: zadání kódu a sebrání prázdného trezoru (3D model: safe-model.js). Pravidla jsou v shared/world/safe.js.
// Bez vedlejších účinků při načtení (jen funkce), proto nemá řádek v řetězci pořadí spouštění.
import { blockMeta, blocks, chests } from '../../../shared/world/state.js';
import { lockSafe, safeLock, safeOpens, safeTakeBlocker, safeWait, SAFE_CODE } from '../../../shared/world/safe.js';
import { Sound } from '../audio/sound.js';
import { addItem } from '../player/inventory.js';
import { rebuildBlocks } from '../render/blocks.js';

// Po 3 špatných pokusech za sebou se chvíli čeká (a čekání se prodlužuje, safeWait).
let fails = 0, waitUntil = 0;

/**
 * Vykreslí do `area` zadání kódu (nový trezor: vymyslet kód 2×, zamčený: zadat kód).
 * Formulář se nepřekresluje, dokud je vidět (okno se obnovuje a smazalo by rozepsaný kód).
 * @param {HTMLElement} area
 * @param {string} k klíč bloku trezoru
 * @param {() => void} onOpen zavolá se po správném kódu
 * @param {() => void} onClose Esc v políčku
 */
export function renderSafe(area, k, onOpen, onClose) {
  const fresh = !safeLock(k);
  if (area.querySelector(`#safeForm[data-k="${k}"][data-fresh="${fresh}"]`)) return;
  const field = (id, ph) => `<input class="safe-code" id="${id}" type="password" inputmode="numeric" maxlength="8" autocomplete="off" placeholder="${ph}">`;
  area.innerHTML = `<div id="safeForm" data-k="${k}" data-fresh="${fresh}">
    <div class="mc-title">${fresh ? 'Nový trezor' : 'Trezor'} 🔒</div>
    <div class="safe-ui">${fresh ? field('safeCode', 'Vymysli kód') + field('safeCode2', 'Zopakuj kód') : field('safeCode', 'Kód')}
      <button class="mc-btn" id="safeGo">${fresh ? 'Zamknout' : 'Otevřít'}</button></div>
    <div class="mc-note" id="safeMsg">${fresh ? 'Vymysli si kód ze 4 až 8 číslic a dobře si ho zapamatuj: bez něj se trezor už neotevře a nedá se ani vytěžit.' : 'Zadej kód trezoru.'}</div>
  </div>`;
  const $f = (id) => area.querySelector('#' + id), msg = (t) => { $f('safeMsg').textContent = t; };
  const go = () => {
    const a = $f('safeCode').value, b = $f('safeCode2')?.value;
    if (fresh) {
      if (!SAFE_CODE.test(a)) { msg('Kód musí mít 4 až 8 číslic.'); return; }
      if (a !== b) { msg('Kódy se neshodují, zkus to znovu.'); $f('safeCode2').value = ''; $f('safeCode2').focus(); return; }
      if (!lockSafe(k, a)) { msg('Trezor už mezitím někdo zamkl.'); return; }
      Sound.chest();
      onOpen();
      return;
    }
    const wait = Math.ceil((waitUntil - performance.now()) / 1000);
    if (wait > 0) { msg(`Moc špatných pokusů. Počkej ${wait} s.`); return; }
    if (safeOpens(k, a)) { fails = 0; Sound.chest(); onOpen(); return; }
    fails++;
    $f('safeCode').value = '';
    Sound.denied();
    const ms = safeWait(fails);
    waitUntil = performance.now() + ms;
    msg(ms ? `Špatný kód. Počkej ${Math.round(ms / 1000)} s.` : 'Špatný kód.');
  };
  $f('safeGo').addEventListener('click', go);
  for (const el of area.querySelectorAll('.safe-code')) {
    el.addEventListener('input', () => { el.value = el.value.replace(/\D/g, ''); });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (el.id === 'safeCode' && fresh) $f('safeCode2').focus(); else go(); }
      else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    });
  }
  setTimeout(() => $f('safeCode')?.focus(), 0);
}

/** Nadpis otevřeného trezoru (místo „Truhla"), s tlačítkem Sebrat trezor. */
export const safeTitle = () => 'Trezor 🔒 <button class="mc-btn mini" id="safeTake" title="Prázdný trezor dáš do batohu">Sebrat trezor</button>';

/** Sebere prázdný trezor do batohu. Vrací text, proč to nešlo, nebo null. */
export function takeSafe(k) {
  const why = safeTakeBlocker(k);
  if (why) return why;
  blocks.delete(k);
  blockMeta.delete(k);
  chests.delete(k);
  addItem('safe', 1);
  Sound.pickup();
  rebuildBlocks();
  return null;
}
