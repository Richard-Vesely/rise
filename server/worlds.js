// Víc světů na jednom serveru: seznam světů z proměnné WORLDS a přesun dat ze starého uspořádání (jeden svět).
//   WORLDS="svet:Hlavní svět,kreativ:Kreativní svět:creative,arena:Aréna:pvp"   (id:jméno[:volba…], oddělené čárkou)
//   volby: creative = kreativní režim pro všechny, pvp = hráči se můžou navzájem zranit (mečem, šípem)
// Každý svět má vlastní složku DATA_DIR/<id>/ (world.json + backups/), vlastní místnost (hráči, chat) a vlastní simulaci.
import fs from 'node:fs';
import path from 'node:path';

const ID = /^[a-z0-9][a-z0-9_-]{0,31}$/;

/**
 * @typedef {{ id: string, name: string, creative: boolean, pvp: boolean }} WorldDef
 */

/**
 * Přečte seznam světů. Bez WORLDS je jeden svět `svet` ("Hlavní svět") a kreativní režim podle ALLOW_CREATIVE.
 * @param {string|undefined} spec obsah WORLDS
 * @param {boolean} allowCreative ALLOW_CREATIVE (platí jen bez WORLDS)
 * @returns {WorldDef[]}
 */
export function parseWorlds(spec, allowCreative = false) {
  spec = (spec || '').trim().replace(/^(["'])(.*)\1$/, '$2'); // uvozovky kolem celé hodnoty (WORLDS="…") nevadí
  if (!spec) return [{ id: 'svet', name: 'Hlavní svět', creative: allowCreative, pvp: false }];
  const list = [];
  for (const part of spec.split(',')) {
    if (!part.trim()) continue;
    const [rawId, rawName, ...flags] = part.split(':').map((s) => s.trim());
    const id = rawId.toLowerCase();
    if (!ID.test(id) || id === 'backups') throw new Error(`WORLDS: neplatné id světa "${rawId}" (malá písmena, číslice, - a _; ne "backups")`);
    if (list.some((w) => w.id === id)) throw new Error(`WORLDS: svět "${id}" je tam dvakrát`);
    const CREATIVE = /^(creative|kreativ|kreativni|kreativní)$/i, PVP = /^pvp$/i;
    for (const flag of flags) if (flag && !CREATIVE.test(flag) && !PVP.test(flag)) throw new Error(`WORLDS: u světa "${id}" je neznámá volba "${flag}" (povolené: creative, pvp)`);
    list.push({ id, name: (rawName || id).slice(0, 40), creative: flags.some((f) => CREATIVE.test(f)), pvp: flags.some((f) => PVP.test(f)) });
  }
  if (!list.length) throw new Error('WORLDS je prázdné');
  return list;
}

/**
 * Starý server ukládal jediný svět přímo do DATA_DIR/world.json (+ DATA_DIR/backups/). Když první svět ještě nemá
 * vlastní data, přesune je do DATA_DIR/<id prvního světa>/.
 * @param {string} dataDir
 * @param {string} firstId
 * @param {(msg: string) => void} log
 */
export function migrateOldLayout(dataDir, firstId, log) {
  const oldFile = path.join(dataDir, 'world.json');
  if (!fs.existsSync(oldFile)) return;
  const dir = path.join(dataDir, firstId);
  if (fs.existsSync(path.join(dir, 'world.json'))) {
    log(`Pozor: ${oldFile} zůstává na místě, svět "${firstId}" už má vlastní data (${dir}).`);
    return;
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.renameSync(oldFile, path.join(dir, 'world.json'));
  const oldBackups = path.join(dataDir, 'backups'), backups = path.join(dir, 'backups');
  if (fs.existsSync(oldBackups)) {
    fs.mkdirSync(backups, { recursive: true });
    for (const f of fs.readdirSync(oldBackups)) {
      if (!f.startsWith('world-')) continue; // zálohy profilů hráčů (players-…) patří do DATA_DIR/backups
      const to = path.join(backups, f);
      if (!fs.existsSync(to)) fs.renameSync(path.join(oldBackups, f), to);
    }
    if (!fs.readdirSync(oldBackups).length) fs.rmdirSync(oldBackups);
  }
  log(`Svět ze starého uspořádání (${oldFile} a zálohy) přesunut do ${dir}.`);
}
