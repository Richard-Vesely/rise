// Trezor: truhla, která se otevře jen správným kódem (pravidla; okno je v client/src/machines/safe.js).
// Kód si vymyslí ten, kdo trezor otevře poprvé. Čitelně se nikde neukládá: v blockMeta trezoru je jen jeho otisk
// (bity 0–2 = otočení jako u ostatních bloků s `facing`, výš = otisk kódu). blockMeta se posílá a ukládá jako každá
// jiná změna bloku, takže formát uložení se nemění a staré uložené hry se načtou.
// Vytěžit trezor nejde (BLOCKS.safe.locked); prázdný ho sebere ten, kdo zná kód.
// Pozor: je to zámek „pro kamarády", ne bankovní. Obsah truhel (i trezorů) dostává každý hráč, takže kdo umí
// konzoli prohlížeče, obsah vidí, a otisk kódu jde při troše snahy uhodnout zkoušením (docs/KNOWN-ISSUES.md).
// Bez vedlejších účinků při načtení.
import { blockMeta, blocks, chests } from './state.js';

/** Platný kód: 4 až 8 číslic. */
export const SAFE_CODE = /^\d{4,8}$/;

/** Otisk kódu (FNV-1a, 1 až 2^24): pro každý trezor jiný, i když mají stejný kód. */
export function codeHash(k, code) {
  let h = 2166136261;
  for (const ch of `${k}#${code}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 0xffffff) + 1;
}

const meta = (k) => { const m = blockMeta.get(k); return typeof m === 'number' && m > 0 ? Math.floor(m) : 0; };
/** Otisk kódu trezoru na klíči k (0 = trezor ještě nemá kód). */
export const safeLock = (k) => Math.floor(meta(k) / 8);

/**
 * Zamkne nový trezor kódem (jen trezor bez kódu, jen platný kód). Otočení trezoru zůstane.
 * @returns {boolean} povedlo se?
 */
export function lockSafe(k, code) {
  if (blocks.get(k) !== 'safe' || safeLock(k) || !SAFE_CODE.test(String(code))) return false;
  blockMeta.set(k, (meta(k) & 7) + codeHash(k, String(code)) * 8);
  return true;
}

/** Otevře kód zamčený trezor? */
export const safeOpens = (k, code) => blocks.get(k) === 'safe' && safeLock(k) > 0 && SAFE_CODE.test(String(code)) && codeHash(k, String(code)) === safeLock(k);

/** Jde trezor sebrat do batohu? Vrací text, proč ne, nebo null. */
export function safeTakeBlocker(k) {
  if (blocks.get(k) !== 'safe') return 'Trezor tu už není.';
  if (chests.get(k)?.some(Boolean)) return 'Nejdřív trezor vyprázdni.';
  return null;
}

/** Jak dlouho čekat (ms) po `fails` špatných pokusech za sebou: 3 jsou zdarma, pak 5 s a pokaždé dvakrát déle (nejvýš 5 min). */
export const safeWait = (fails) => (fails < 3 ? 0 : Math.min(300000, 5000 * 2 ** (fails - 3)));
