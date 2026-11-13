// Všechna herní data na jednom místě: předměty, recepty, bloky, technologie.
// Ostatní kód importuje data odsud (ne přímo z items.js / blocks.js / tech.js), aby byla vždy kompletní.
// Pořadí je důležité: blocks.js a tech.js doplňují ITEMS a RECIPES z items.js (pořadí receptů je vidět v knize receptů).
import './blocks.js';
import './tech.js';
import './shop.js';
import './hell.js';
import { ITEMS, RECIPES } from './items.js';

export * from './items.js';
export * from './blocks.js';
export * from './tech.js';
export * from './costumes.js';
export * from './shop.js';
export * from './hell.js';

// Dokončení receptů (jednou, až jsou všechny přidané):
// - kategorie starších receptů: bloky = stavební, nástroje a zbroj zvlášť, ostatní základní,
// - vzor v mřížce: r.pat = řádky s id předmětů (null = prázdné políčko), r.w × r.h = rozměr.
for (const r of RECIPES) if (!r.cat) { const it = ITEMS[r.out]; r.cat = it.tool || it.armor ? 'tools' : it.block ? 'build' : 'basic'; }
for (const r of RECIPES) {
  const w = Math.max(...r.shape.map((l) => l.length));
  r.pat = r.shape.map((l) => [...l.padEnd(w)].map((ch) => (ch === ' ' ? null : r.key[ch])));
  r.w = w;
  r.h = r.shape.length;
}
