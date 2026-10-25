// Uložení světa v Durable Objectu (SQLite úložiště). Stejný tvar jako world.json na Node serveru
// ({ version: 2, savedAt, world, players }, server/persist.js), jen rozdělený na kousky: jedna hodnota smí mít
// nejvýš 2 MB a svět má dnes kolem 1 MB. Každé uložení zapíše všechny kousky naráz (jedno put = jedna transakce).

export const VERSION = 2;
export const CHUNK = 400_000; // znaků; i kdyby každý měl 4 bajty (UTF-8), je to pod 2 MB

/** Rozdělí text na kousky. */
export function toChunks(text, size = CHUNK) {
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out.length ? out : [''];
}

/** Id Durable Objectu, data v EU (kde to jde; místní wrangler dev to nemusí umět). */
export function doId(ns, name) {
  try { return ns.jurisdiction('eu').idFromName(name); } catch { return ns.idFromName(name); }
}

/**
 * Uloží svět a batohy hráčů.
 * @param {DurableObjectStorage} storage
 * @param {object} world worldState()
 * @param {Record<string, object>} players id profilu -> stav hráče
 */
export async function saveWorld(storage, world, players) {
  const parts = toChunks(JSON.stringify({ version: VERSION, savedAt: new Date().toISOString(), world, players }));
  const old = (await storage.get('world:n')) || 0;
  const entries = { 'world:n': parts.length };
  parts.forEach((p, i) => { entries['world:' + i] = p; });
  await storage.put(entries);
  if (old > parts.length) await storage.delete(Array.from({ length: old - parts.length }, (_, i) => 'world:' + (parts.length + i)));
}

/**
 * Načte uložený svět, nebo null (nový svět). Starší verze se nenačte (jako na Node serveru).
 * @param {DurableObjectStorage} storage
 * @param {(msg: string) => void} [log]
 * @returns {Promise<{ world: object, players: Record<string, object> } | null>}
 */
export async function loadWorld(storage, log = () => {}) {
  const n = await storage.get('world:n');
  if (!n) return null;
  const keys = Array.from({ length: n }, (_, i) => 'world:' + i);
  const got = await storage.get(keys);
  const data = JSON.parse(keys.map((k) => got.get(k) ?? '').join(''));
  return checkSave(data, log);
}

/** Zkontroluje tvar uložení (i nahraného world.json z Node serveru). */
export function checkSave(data, log = () => {}) {
  if (!data || data.version !== VERSION || typeof data.world !== 'object') {
    log(`Uložení světa je z jiné verze (${data?.version}), začíná nový svět.`);
    return null;
  }
  const players = data.players && typeof data.players === 'object' && !Array.isArray(data.players) ? data.players : {};
  return { world: data.world, players };
}
