// Trezor: truhla, která se otevře jen správným kódem. Kód si hráč vymyslí, když trezor otevře poprvé.
// Kód není uložený čitelně: v blockMeta trezoru je jen jeho otisk (bity 0–2 = otočení, výš = otisk kódu).
// Vytěžit trezor nejde (BLOCKS.safe.locked); prázdný ho sebere ten, kdo zná kód (tlačítko v okně trezoru).
// Pozor: je to zámek „pro kamarády", ne bankovní – kdo umí konzoli prohlížeče, obsah truhel vidí.
import { blockMeta, blocks, chests } from '../../../shared/world/state.js';
import { Sound } from '../audio/sound.js';
import { addItem } from '../player/inventory.js';
import { rebuildBlocks } from '../render/blocks.js';

const CODE_OK = /^\d{4,8}$/;
/** Otisk kódu (FNV-1a, 1 až 2^24): pro každý trezor jiný, i když mají stejný kód. */
function codeHash(k, code) {
  let h = 2166136261;
  for (const ch of `${k}#${code}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 0xffffff) + 1;
}
const lockOf = (k) => Math.floor((blockMeta.get(k) || 0) / 8);
const setLock = (k, code) => blockMeta.set(k, ((blockMeta.get(k) || 0) & 7) + codeHash(k, code) * 8);

// Po 3 špatných pokusech se chvíli čeká (a čekání se prodlužuje).
let fails = 0, waitUntil = 0;

/**
 * Vykreslí do `area` zadání kódu (nový trezor: vymyslet kód 2×, zamčený: zadat kód).
 * Formulář se nepřekresluje, dokud je vidět (okno se obnovuje každou půlsekundu a smazalo by rozepsaný kód).
 * @param {HTMLElement} area
 * @param {string} k klíč bloku trezoru
 * @param {() => void} onOpen zavolá se po správném kódu
 * @param {() => void} onClose Esc v políčku
 */
export function renderSafe(area, k, onOpen, onClose) {
  const fresh = !lockOf(k);
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
      if (!CODE_OK.test(a)) { msg('Kód musí mít 4 až 8 číslic.'); return; }
      if (a !== b) { msg('Kódy se neshodují, zkus to znovu.'); $f('safeCode2').value = ''; $f('safeCode2').focus(); return; }
      setLock(k, a);
      Sound.chest();
      onOpen();
      return;
    }
    const wait = Math.ceil((waitUntil - performance.now()) / 1000);
    if (wait > 0) { msg(`Moc špatných pokusů. Počkej ${wait} s.`); return; }
    if (codeHash(k, a) === lockOf(k)) { fails = 0; Sound.chest(); onOpen(); return; }
    fails++;
    $f('safeCode').value = '';
    if (fails >= 3) { waitUntil = performance.now() + 5000 * 2 ** (fails - 3); msg(`Špatný kód. Počkej ${Math.round(5 * 2 ** (fails - 3))} s.`); } else msg('Špatný kód.');
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

/** Sebere prázdný trezor do batohu. Vrací text, proč to nešlo, nebo null. */
export function takeSafe(k) {
  if (blocks.get(k) !== 'safe') return 'Trezor tu už není.';
  if (chests.get(k)?.some(Boolean)) return 'Nejdřív trezor vyprázdni.';
  blocks.delete(k);
  blockMeta.delete(k);
  chests.delete(k);
  addItem('safe', 1);
  Sound.pickup();
  rebuildBlocks();
  return null;
}
