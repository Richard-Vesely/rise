// Jeden svět Říše jako Durable Object (Cloudflare). Dělá totéž co vlákno světa na Node serveru (server/world-worker.js)
// a přihlášení hráče z server/server.js: přijme WebSocket, přečte hello (heslo, svět, jméno + PIN nebo token),
// pustí hráče do místnosti (shared/net/room.js) a 20× za sekundu hýbe světem (server/sim.js).
//
// Jak to běží:
// - Každý svět je vlastní Worker (rise-world-<id>) s jediným Durable Objectem: pravidla ve shared/ drží svět v proměnných
//   modulů, proto je stav světa tady v modulu a nikdy v něm nejsou dva světy.
// - Svět běží jen, když v něm někdo hraje. Když odejde poslední hráč, svět se uloží a zastaví (Durable Object pak usne
//   a nic nestojí). Další hráč ho zase načte. Mezitím se nic neděje (plodiny nerostou, den stojí).
// - Profily hráčů (jméno + PIN) jsou v Durable Objectu Profiles v routeru (cloudflare/router.js); tady se jen volá login.
import { DurableObject } from 'cloudflare:workers';
import { accept } from '../shared/net/room.js';
import { worldState } from '../shared/world/save.js';
import { ME_MAX_BYTES, cleanMe } from '../server/me.js';
import { setupWorld, stepWorld } from '../server/sim.js';
import { checkSave, doId, loadWorld, saveWorld } from './store.js';

const TICK_HZ = 20;
const log = (...a) => console.log(...a);

// ---------- stav světa (modul: jeden svět na Worker)
let loading = null; // Promise: svět načtený z úložiště a připravený
/** @type {Record<string, object>} id profilu -> stav hráče v tomhle světě (batoh, pozice, zdraví…) */
let players = {};
const conns = new Map(); // cid -> { ws, handlers, shut, profile, seen }
let ticker = null, saver = null, watch = null;

export class World extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.def = JSON.parse(env.WORLD_DEF);
    this.worlds = JSON.parse(env.WORLDS);
    this.maxPlayers = Number(env.MAX_PLAYERS || 8);
    this.saveEveryMs = 1000 * Number(env.SAVE_SECONDS || 30);
    this.silentMs = 1000 * Number(env.SILENT_SECONDS || 30);
    this.info = { id: this.def.id, name: this.def.name, creative: this.def.creative, pvp: !!this.def.pvp, first: !!this.def.first };
  }

  /** Načte svět (jen jednou za život Workeru). */
  load() {
    loading ||= (async () => {
      const saved = await loadWorld(this.ctx.storage, (t) => log(`[${this.def.id}] ${t}`));
      players = saved?.players ?? {};
      setupWorld({ world: saved?.world ?? null, maxPlayers: this.maxPlayers, allowCreative: this.def.creative, pvp: !!this.def.pvp, code: 'server', log: (t) => log(`[${this.def.id}] ${t}`) });
      log(`[${this.def.id}] ${this.def.name}: ${saved ? 'svět načten z úložiště' : 'nový svět'}.`);
      return !!saved;
    })();
    return loading;
  }

  /** Pro router: kolik lidí tu hraje (/worlds, /health). Svět kvůli tomu nenačítá. */
  async stats() {
    return { players: conns.size, running: !!ticker };
  }

  /**
   * Nahraje world.json z Node serveru (stěhování). Jen dokud se svět v tomhle Workeru ještě nenačetl (hned po nasazení,
   * než přijde první hráč): pravidla ve shared/ drží svět v modulech a ty se nedají vyprázdnit, takže by ho další
   * uložení přepsalo starým světem.
   */
  async importSave(data) {
    if (loading) return { ok: false, error: 'Svět už běží. Nahraj ho hned po nasazení, než se někdo připojí.' };
    const save = checkSave(data);
    if (!save) return { ok: false, error: 'Tohle není world.json verze 2.' };
    await saveWorld(this.ctx.storage, save.world, save.players);
    log(`[${this.def.id}] Nahrán svět ze souboru (${Object.keys(save.players).length} hráčů).`);
    return { ok: true };
  }

  async save() {
    if (!loading) return;
    await loading;
    await saveWorld(this.ctx.storage, worldState(), players);
  }

  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Čekám WebSocket.', { status: 426 });
    await this.load();
    const [client, ws] = Object.values(new WebSocketPair());
    ws.accept();
    this.connect(ws, req.headers.get('CF-Connecting-IP') || '');
    return new Response(null, { status: 101, webSocket: client });
  }

  // ---------- přihlášení (jako server/server.js)
  connect(ws, ip) {
    const cid = 'p-' + crypto.randomUUID().slice(0, 8);
    const send = (m) => { try { ws.send(JSON.stringify(m)); } catch {} };
    const close = (ms = 200) => setTimeout(() => { try { ws.close(1000); } catch {} }, ms);
    let state = 'hello'; // hello -> login -> in
    let hello = setTimeout(() => { if (state !== 'in') close(0); }, 10_000);
    ws.addEventListener('message', async (e) => {
      const raw = typeof e.data === 'string' ? e.data : new TextDecoder().decode(e.data);
      if (state === 'in') { const c = conns.get(cid); if (c) { c.seen = Date.now(); this.onData(cid, raw); } return; }
      if (state !== 'hello') return;
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      if (!Array.isArray(msg) || msg[0] !== 'hello') return;
      const h = msg[1] || {};
      const password = this.env.ROOM_PASSWORD || '';
      if (password && String(h.pass || '') !== password) {
        clearTimeout(hello);
        send(['denied', 'password']);
        log(`Špatné heslo (${ip}).`);
        close();
        return;
      }
      const want = String(h.world || '').toLowerCase();
      if ((want && want !== this.def.id) || (!want && h.v && this.worlds.length > 1)) {
        // hráč chce jiný svět (nebo si ještě nevybral), než do kterého ho poslal router: ať si vybere znovu
        send(['worlds', this.worlds.map((w) => ({ id: w.id, name: w.name, creative: w.creative, pvp: !!w.pvp, players: w.id === this.def.id ? conns.size : 0, max: this.maxPlayers }))]);
        clearTimeout(hello);
        hello = setTimeout(() => close(0), 120_000);
        return;
      }
      clearTimeout(hello);
      state = 'login';
      let r;
      try {
        r = await this.env.PROFILES.get(doId(this.env.PROFILES, 'profiles')).login({ name: h.name, pin: h.pin, token: h.token, ip, world: this.def.id });
      } catch (err) {
        log(`[${this.def.id}] Profily nejdou: ${err.stack || err}`);
        close(0);
        return;
      }
      if (!r.ok) {
        send(['denied', r.reason, { text: r.text, wait: r.wait, left: r.left, exists: r.exists }]);
        log(`Přihlášení odmítnuto (${r.reason}): ${JSON.stringify(String(h.name ?? '').slice(0, 20))} (${ip}).`);
        state = 'denied';
        close();
        return;
      }
      if (ws.readyState !== 1) return; // hráč mezitím odešel
      const P = r.profile;
      if (r.token) send(['token', r.token]);
      // Stejný hráč už v tomhle světě hraje: staré spojení skončí.
      for (const [old, c] of conns) {
        if (c.profile !== P.id) continue;
        try { c.ws.send(JSON.stringify(['kick', 'Přihlásil ses jinde.'])); } catch {}
        this.gone(old);
        setTimeout(() => { try { c.ws.close(1000); } catch {} }, 300);
        log(`[${this.def.id}] ${P.name}: přihlášení z jiného místa, staré spojení zavřeno.`);
      }
      state = 'in';
      log(`[${this.def.id}] Přihlášen ${P.name}${r.created ? ' (nový hráč)' : r.newPin ? ' (nový PIN)' : ''}.`);
      this.join(cid, ws, P.name, P.id);
    });
    const left = () => { clearTimeout(hello); this.gone(cid); };
    ws.addEventListener('close', left);
    ws.addEventListener('error', left);
  }

  // ---------- hráči v místnosti (jako server/world-worker.js)
  join(cid, ws, name, profile) {
    const handlers = { data: [], close: [], error: [] };
    let open = true;
    const info = this.info;
    const conn = {
      peer: cid,
      metadata: { name },
      get open() { return open; },
      send(msg) {
        if (!open) return;
        if (Array.isArray(msg) && msg[0] === 'welcome') {
          msg[1].worldInfo = info;
          if (profile) msg[1].me = players[profile] ?? null;
        }
        sendRaw(ws, msg);
      },
      on(ev, fn) { handlers[ev]?.push(fn); },
      close() { if (open) { open = false; try { ws.close(1000); } catch {} } },
    };
    conns.set(cid, { ws, handlers, shut: () => { open = false; }, profile, seen: Date.now() });
    this.run();
    accept(conn);
  }

  onData(cid, raw) {
    const c = conns.get(cid);
    if (!c) return;
    if (raw.length > ME_MAX_BYTES && raw.startsWith('["me"')) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (Array.isArray(msg) && msg[0] === 'me') {
      const me = c.profile && cleanMe(msg[1], raw.length);
      if (me) players[c.profile] = me;
      return;
    }
    try { for (const fn of c.handlers.data) fn(msg); } catch (e) { log(`[${this.def.id}] Chyba ve zprávě hráče: ${e.stack || e}`); }
  }

  gone(cid) {
    const c = conns.get(cid);
    if (!c) return;
    conns.delete(cid);
    c.shut();
    try { for (const fn of c.handlers.close) fn(); } catch (e) { log(`[${this.def.id}] Chyba při odchodu hráče: ${e.stack || e}`); }
    this.ctx.waitUntil(this.env.PROFILES.get(doId(this.env.PROFILES, 'profiles')).seen(c.profile).catch(() => {}));
    if (!conns.size) this.pause();
  }

  // ---------- smyčka světa: jen když tu někdo je
  run() {
    if (ticker) return;
    let last = Date.now();
    ticker = setInterval(() => {
      const now = Date.now(); // ve Workeru se čas posune jen mezi událostmi, krok = skutečný čas od minula
      try { stepWorld(Math.min((now - last) / 1000, 0.25)); } catch (e) { log(`[${this.def.id}] Chyba ve světě: ${e.stack || e}`); }
      last = now;
    }, 1000 / TICK_HZ);
    saver = setInterval(() => { this.save().catch((e) => log(`[${this.def.id}] Uložení selhalo: ${e.message}`)); }, this.saveEveryMs);
    // spojení, od kterého dlouho nic nepřišlo (hráč posílá pozici 12× za sekundu), se zavře: spadlá wifi
    watch = setInterval(() => {
      const now = Date.now();
      for (const [cid, c] of conns) {
        if (now - c.seen <= this.silentMs) continue;
        log(`[${this.def.id}] Spojení neodpovídá ${Math.round((now - c.seen) / 1000)} s, zavírám ho.`);
        this.gone(cid);
        try { c.ws.close(1001); } catch {}
      }
    }, 5000);
  }

  pause() {
    if (!ticker) return;
    clearInterval(ticker); clearInterval(saver); clearInterval(watch);
    ticker = saver = watch = null;
    log(`[${this.def.id}] Nikdo nehraje: ukládám a svět stojí.`);
    this.ctx.waitUntil(this.save().catch((e) => log(`[${this.def.id}] Uložení selhalo: ${e.message}`)));
  }
}

// Rozesílání: stejná zpráva pro víc hráčů se převede na text jen jednou.
let lastMsg = null, lastRaw = '';
function sendRaw(ws, msg) {
  if (msg !== lastMsg) { lastMsg = msg; lastRaw = JSON.stringify(msg); queueMicrotask(() => { lastMsg = null; }); }
  try { ws.send(lastRaw); } catch {}
}

// Worker světa sám nic neobsluhuje: hráči přicházejí přes router (cloudflare/router.js).
export default {
  async fetch() { return new Response('Svět Říše: připoj se přes /ws?world=<id> na routeru.', { status: 404 }); },
};
