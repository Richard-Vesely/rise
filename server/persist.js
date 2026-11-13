// Ukládání na disk: svět serveru (DATA_DIR/<svět>/world.json, každých 30 s a při vypnutí) a profily hráčů
// (DATA_DIR/players.json). Zápis je bezpečný (dočasný soubor + přejmenování) a jednou denně se udělá záloha
// (backups/world-RRRR-MM-DD.json u každého světa, DATA_DIR/backups/players-RRRR-MM-DD.json); drží se posledních 7.
import fs from 'node:fs';
import path from 'node:path';

const KEEP_BACKUPS = 7;
const VERSION = 2;

/**
 * Načte uložený svět, nebo null (první spuštění). Starý soubor z verze 1 (jiná hra) se odloží stranou.
 * @param {string} dir složka s daty
 * @param {(msg: string) => void} [log]
 * @returns {{ world: object, players: Record<string, object>, donations: { box?: unknown[] } | null, army: object | null } | null} stav světa (worldState()), batohy hráčů (id profilu -> me), pokladnička darů a kdo velí armádě
 */
export function loadWorldFile(dir, log = () => {}) {
  const file = path.join(dir, 'world.json');
  if (!fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (data.version !== VERSION) {
    const old = path.join(dir, `world-v${data.version || 1}-${Date.now()}.json`);
    fs.renameSync(file, old);
    log(`Soubor světa je ze starší verze hry, odložen jako ${path.basename(old)}; začíná nový svět.`);
    return null;
  }
  const players = data.players && typeof data.players === 'object' && !Array.isArray(data.players) ? data.players : {};
  const donations = data.donations && typeof data.donations === 'object' && !Array.isArray(data.donations) ? data.donations : null;
  const army = data.army && typeof data.army === 'object' && !Array.isArray(data.army) ? data.army : null;
  return { world: data.world, players, donations, army };
}

/**
 * Uloží svět a batohy hráčů v něm. Jednou denně záloha.
 * @param {string} dir složka s daty
 * @param {object} world stav světa (worldState())
 * @param {Record<string, object>} [players] id profilu -> stav hráče (batoh, pozice…)
 * @param {{ box: unknown[] }} [donations] předměty v pokladničce darů (server/donation-box.js)
 * @param {object} [army] kdo velí armádě (server/army-owner.js)
 */
export function saveWorldFile(dir, world, players = {}, donations = undefined, army = undefined) {
  writeJSON(path.join(dir, 'world.json'), { version: VERSION, savedAt: new Date().toISOString(), world, players, ...(donations ? { donations } : {}), ...(army ? { army } : {}) }, 'world');
}

/**
 * Zapíše JSON bezpečně: nejdřív do dočasného souboru, pak přejmenuje (když server spadne uprostřed zápisu,
 * starý soubor zůstane celý). Jednou denně zkopíruje soubor do backups/<prefix>-RRRR-MM-DD.json vedle něj.
 * @param {string} file
 * @param {unknown} data
 * @param {string} prefix začátek jména zálohy ('world', 'players')
 */
export function writeJSON(file, data, prefix) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
  dailyBackup(file, prefix);
}

// Jednou za den zkopíruje soubor do backups/<prefix>-RRRR-MM-DD.json a smaže zálohy starší než 7 posledních.
function dailyBackup(file, prefix) {
  const backups = path.join(path.dirname(file), 'backups');
  fs.mkdirSync(backups, { recursive: true });
  const today = path.join(backups, `${prefix}-${new Date().toISOString().slice(0, 10)}.json`);
  if (fs.existsSync(today)) return;
  fs.copyFileSync(file, today);
  const re = new RegExp(`^${prefix}-\d{4}-\d\d-\d\d\.json$`);
  const old = fs.readdirSync(backups).filter((f) => re.test(f)).sort();
  for (const f of old.slice(0, Math.max(0, old.length - KEEP_BACKUPS))) fs.unlinkSync(path.join(backups, f));
}
