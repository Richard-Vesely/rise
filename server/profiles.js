// Profily hráčů serveru kroužku: přezdívka + 4místný PIN, který si hráč vymyslí. Platí pro celý server (všechny světy).
// Ukládají se do DATA_DIR/players.json (bezpečný zápis, denní zálohy v DATA_DIR/backups/players-RRRR-MM-DD.json, 7 posledních).
// PIN se nikdy neukládá ani nezapisuje do logu: jen scrypt otisk se solí. Po přihlášení dostane prohlížeč dlouhý náhodný
// token (na serveru jen jeho SHA-256), takže PIN je potřeba jen na novém zařízení. Batohy hráčů jsou u světů (world.json).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { writeJSON } from './persist.js';

const KEEP_TOKENS = 5; // posledních 5 zařízení zůstane přihlášených
const MAX_FAILS = 5, WAIT_MS = 60_000; // 5 špatných PINů na jméno + adresu, pak minuta čekání
export const RESERVED = ['hráč', 'hrac', 'host', 'server'];

/** Klíč jména pro porovnání bez ohledu na velikost písmen. */
export const nameKey = (name) => name.normalize('NFC').toLocaleLowerCase('cs');

/**
 * Upraví přezdívku (mezery na krajích a vícenásobné mezery pryč, bez neviditelných znaků) a zkontroluje ji.
 * @param {unknown} raw
 * @returns {{ name: string } | { error: string }} error = český text pro hráče
 */
export function cleanName(raw) {
  const name = String(raw ?? '').normalize('NFC').replace(/[\p{C}]/gu, '').replace(/\s+/g, ' ').trim();
  const len = [...name].length;
  if (len < 2) return { error: 'Jméno musí mít aspoň 2 znaky.' };
  if (len > 16) return { error: 'Jméno může mít nejvýš 16 znaků.' };
  if (RESERVED.includes(nameKey(name))) return { error: 'Vymysli si vlastní přezdívku.' };
  return { name };
}
export const validPin = (pin) => typeof pin === 'string' && /^\d{4}$/.test(pin);
const hashPin = (pin, salt) => crypto.scryptSync(pin, Buffer.from(salt, 'hex'), 32).toString('hex');
const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * @typedef {{ id: string, name: string, pinHash: string|null, salt: string, created: string, lastSeen: string|null, lastWorld: string|null, tokens: string[] }} Profile
 * @typedef {{ ok: true, profile: Profile, token?: string, created?: boolean, newPin?: boolean }
 *   | { ok: false, reason: 'name'|'needpin'|'badpin'|'pin'|'token'|'wait', text?: string, wait?: number, left?: number, exists?: boolean }} LoginResult
 */

/**
 * Úložiště profilů. Bez souboru (file = null) jen v paměti (testy), nebo jinde přes `data` + `store`
 * (Cloudflare: Durable Object, cloudflare/router.js).
 * @param {string|null} file cesta k players.json
 * @param {{ log?: (msg: string) => void, now?: () => number, data?: { players?: Profile[] } | null, store?: (data: object) => void }} [o]
 *   data = obsah players.json načtený jinde (místo souboru), store = kam ho uložit (místo souboru)
 */
export function createProfiles(file, { log = () => {}, now = Date.now, data = null, store = null } = {}) {
  /** @type {Map<string, Profile>} */
  const byId = new Map();
  /** @type {Map<string, Profile>} */
  const byName = new Map();
  const fails = new Map(); // jméno|adresa -> { n, until }
  if (!data && file && fs.existsSync(file)) data = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const p of data?.players || []) { byId.set(p.id, p); byName.set(nameKey(p.name), p); }
  const iso = () => new Date(now()).toISOString();
  const save = () => {
    if (!file && !store) return;
    const out = { version: 1, savedAt: iso(), players: [...byId.values()] };
    try { if (store) store(out); else writeJSON(file, out, 'players'); } catch (e) { log('Uložení profilů selhalo: ' + e.message); }
  };
  const newToken = (p) => {
    const t = crypto.randomBytes(24).toString('base64url');
    p.tokens = [...(p.tokens || []), hashToken(t)].slice(-KEEP_TOKENS);
    return t;
  };

  return {
    get size() { return byId.size; },
    /** @returns {Profile[]} */
    list() { return [...byId.values()]; },
    get(id) { return byId.get(id) || null; },
    find(name) { return byName.get(nameKey(String(name ?? '').trim())) || null; },

    /**
     * Přihlášení (nebo založení profilu). PIN se kontroluje jen tady; nikde se nezapisuje.
     * @param {{ name?: unknown, pin?: unknown, token?: unknown, ip?: string, world?: string }} h
     * @returns {LoginResult}
     */
    login({ name, pin, token, ip = '', world = null }) {
      const c = cleanName(name);
      if ('error' in c) return { ok: false, reason: 'name', text: c.error };
      const key = nameKey(c.name), p = byName.get(key);
      const done = (prof, extra = {}) => {
        prof.lastSeen = iso();
        if (world) prof.lastWorld = world;
        save();
        return { ok: true, profile: prof, ...extra };
      };
      // přihlášení tokenem z prohlížeče (bez PINu)
      if (token != null && pin == null) {
        if (p && (p.tokens || []).some((h) => same(h, hashToken(token)))) return done(p);
        return { ok: false, reason: 'token' };
      }
      if (pin == null || pin === '') return { ok: false, reason: 'needpin', exists: !!p };
      pin = String(pin);
      if (!validPin(pin)) return { ok: false, reason: 'badpin' };
      if (!p) { // nové jméno: nový profil
        const salt = crypto.randomBytes(16).toString('hex');
        const prof = { id: 'p' + crypto.randomBytes(8).toString('hex'), name: c.name, pinHash: hashPin(pin, salt), salt, created: iso(), lastSeen: null, lastWorld: null, tokens: [] };
        byId.set(prof.id, prof);
        byName.set(key, prof);
        const t = newToken(prof);
        return done(prof, { token: t, created: true });
      }
      const fk = key + '|' + ip, f = fails.get(fk);
      if (f && f.until > now()) return { ok: false, reason: 'wait', wait: Math.ceil((f.until - now()) / 1000) };
      if (!p.pinHash) { // lektor PIN smazal: první PIN, se kterým se hráč přihlásí, je nový PIN
        p.salt = crypto.randomBytes(16).toString('hex');
        p.pinHash = hashPin(pin, p.salt);
        fails.delete(fk);
        return done(p, { token: newToken(p), newPin: true });
      }
      if (!same(hashPin(pin, p.salt), p.pinHash)) {
        const n = (f && !f.until ? f.n : 0) + 1; // po skončeném čekání se počítá znovu od nuly
        if (fails.size > 5000) for (const [k, v] of fails) if (!v.until || v.until < now()) fails.delete(k);
        if (n >= MAX_FAILS) { fails.set(fk, { n: 0, until: now() + WAIT_MS }); return { ok: false, reason: 'wait', wait: Math.ceil(WAIT_MS / 1000) }; }
        fails.set(fk, { n, until: 0 });
        return { ok: false, reason: 'pin', left: MAX_FAILS - n };
      }
      fails.delete(fk);
      return done(p, { token: newToken(p) });
    },

    /** Hráč odešel ze hry: čas posledního hraní. */
    seen(id) { const p = byId.get(id); if (p) { p.lastSeen = iso(); save(); } },

    /**
     * Lektor smazal PIN (hráč ho zapomněl): smaže otisk PINu i všechna přihlášená zařízení.
     * Další přihlášení s tímhle jménem nastaví nový PIN.
     * @param {string} nameOrId
     * @returns {Profile|null}
     */
    resetPin(nameOrId) {
      const p = byId.get(nameOrId) || this.find(nameOrId);
      if (!p) return null;
      p.pinHash = null;
      p.tokens = [];
      for (const k of fails.keys()) if (k.startsWith(nameKey(p.name) + '|')) fails.delete(k);
      save();
      return p;
    },
    save,
  };
}

/** Výchozí cesta k souboru s profily. */
export const profilesFile = (dataDir) => (dataDir ? path.join(dataDir, 'players.json') : null);
