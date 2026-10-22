// Herní server: HTTP (hra ze složky dist/, /health, /worlds) a na stejném portu WebSocket pro hráče.
// Server může mít víc světů (server/worlds.js); každý běží ve vlastním vlákně (server/world-worker.js) se svou
// místností, simulací a ukládáním. Tohle hlavní vlákno drží spojení, přihlašuje hráče (profily: server/profiles.js)
// a posílá zprávy hráčů do jejich světa. Správa pro lektora: /admin a node server/admin.js (server/admin-http.js).
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { WebSocketServer } from 'ws';
import { adminPage, startAdminListener } from './admin-http.js';
import { createProfiles, profilesFile } from './profiles.js';
import { staticHandler } from './static.js';
import { migrateOldLayout } from './worlds.js';

const WORKER = new URL('./world-worker.js', import.meta.url);

/**
 * Spustí herní server.
 * @param {object} [o]
 * @param {number} [o.port] port (0 = libovolný volný, pro testy)
 * @param {string} [o.password] heslo (prázdné = bez hesla), jedno pro všechny světy
 * @param {string|null} [o.dataDir] kam ukládat světy: dataDir/<id>/world.json (null = neukládat)
 * @param {string|null} [o.staticDir] složka se sestavenou hrou (dist/)
 * @param {number} [o.maxPlayers] kolik hráčů najednou v jednom světě
 * @param {{ id: string, name: string, creative: boolean, pvp?: boolean }[]} [o.worlds] světy (výchozí: jeden "Hlavní svět")
 * @param {boolean} [o.allowCreative] kreativní režim pro výchozí svět (když není `worlds`)
 * @param {number} [o.tickHz] kolikrát za sekundu běží svět
 * @param {number} [o.saveEveryMs] jak často ukládat (výchozí 30 s)
 * @param {string} [o.adminPassword] heslo stránky /admin (prázdné = stránka vypnutá)
 */
export async function startServer({ port = 8787, password = '', dataDir = null, staticDir = null, maxPlayers = 8, worlds, allowCreative = false, tickHz = 20, saveEveryMs = 30_000, adminPassword = '', log = console.log } = {}) {
  worlds ||= [{ id: 'svet', name: 'Hlavní svět', creative: allowCreative, pvp: false }];
  if (dataDir) migrateOldLayout(dataDir, worlds[0].id, log);
  const profiles = createProfiles(profilesFile(dataDir), { log });
  const started = Date.now();
  let closing = false;
  const W = worlds.map((def, i) => ({ ...def, first: i === 0, sockets: new Map(), players: 0, stats: null, worker: null }));
  const byId = new Map(W.map((w) => [w.id, w]));

  // ---------- vlákna světů
  function startWorld(w) {
    return new Promise((ok, fail) => {
      const worker = new Worker(WORKER, { workerData: { id: w.id, name: w.name, creative: w.creative, pvp: !!w.pvp, first: w.first, dir: dataDir && path.join(dataDir, w.id), maxPlayers, tickHz, saveEveryMs } });
      w.worker = worker;
      worker.on('message', (m) => {
        switch (m.t) {
          case 'send': { const ws = w.sockets.get(m.cid); if (ws?.readyState === ws.OPEN) ws.send(m.raw); break; }
          case 'close': w.sockets.get(m.cid)?.close(); break;
          case 'stats': w.stats = m; w.players = m.players; break;
          case 'log': log(`[${w.id}] ${m.text}`); break;
          case 'ready': log(`[${w.id}] ${w.name}${w.creative ? ' (kreativní)' : ''}${w.pvp ? ' (souboje hráčů)' : ''}: ${m.loaded ? 'svět načten ze souboru' : 'nový svět'}.`); ok(); break;
          case 'stopped': w.onStopped?.(); break;
        }
      });
      worker.on('error', (e) => { log(`[${w.id}] Svět spadl: ${e.stack || e}`); fail(e); });
      worker.on('exit', (code) => {
        if (closing || w.worker !== worker) return;
        // Spadlý svět: hráče odpojit (připojí se znovu) a svět za chvíli spustit znovu z posledního uložení.
        log(`[${w.id}] Vlákno světa skončilo (kód ${code}), spouštím ho znovu.`);
        for (const ws of w.sockets.values()) ws.terminate();
        w.sockets.clear();
        w.players = 0;
        setTimeout(() => { if (!closing) startWorld(w).catch(() => {}); }, 3000);
      });
    });
  }
  await Promise.all(W.map(startWorld));

  // ---------- /health a /worlds
  const list = () => W.map((w) => ({ id: w.id, name: w.name, creative: w.creative, pvp: !!w.pvp, players: w.players, max: maxPlayers }));
  const round = (v) => Math.round(v * 100) / 100;
  const health = () => {
    const mem = process.memoryUsage();
    return {
      ok: true, louka: 2, players: W.reduce((a, w) => a + w.players, 0), max: maxPlayers * W.length, password: !!password,
      uptime: Math.round((Date.now() - started) / 1000),
      cpuSec: Math.round((process.cpuUsage().user + process.cpuUsage().system) / 1e4) / 100,
      rssMB: Math.round(mem.rss / 1048576),
      heapMB: Math.round(mem.heapUsed / 1048576) + W.reduce((a, w) => a + (w.stats?.heapMB || 0), 0),
      // všechny světy dohromady: průměr = součet průměrů (na jednom jádře se kroky sčítají), max = nejhorší krok
      tickMs: { avg: round(W.reduce((a, w) => a + (w.stats?.tickAvg || 0), 0)), max: round(Math.max(0, ...W.map((w) => w.stats?.tickMax || 0))), budget: Math.round(1000 / tickHz) },
      worlds: W.map((w) => ({ id: w.id, name: w.name, creative: w.creative, players: w.players, max: maxPlayers, heapMB: w.stats?.heapMB ?? null, tickMs: { avg: w.stats?.tickAvg ?? 0, max: w.stats?.tickMax ?? 0 } })),
    };
  };
  // kdo právě hraje: id profilu -> jméno světa
  const online = () => { const m = new Map(); for (const w of W) for (const ws of w.sockets.values()) if (ws.profile) m.set(ws.profile, w.name); return m; };
  const worldName = (id) => byId.get(id)?.name || id;
  const admin = adminPage({ password: adminPassword, profiles, online, worldName, log });
  const files = staticHandler(staticDir, { '/health': health, '/worlds': list }, () => ({ password: !!password }));
  const server = http.createServer((req, res) => (/^\/admin(\/|$|\?)/.test(req.url || '') ? admin(req, res) : files(req, res)));
  const closeAdmin = dataDir ? await startAdminListener({ dataDir, profiles, online, log }) : async () => {};
  const wss = new WebSocketServer({ server, maxPayload: 2 * 1024 * 1024 });

  // ---------- hráči
  wss.on('connection', (ws, req) => {
    ws.seen = Date.now();
    ws.on('pong', () => { ws.seen = Date.now(); });
    // První zpráva je ['hello', { name, pass, v, world, pin | token }]; teprve potom hráč vstoupí do místnosti svého světa.
    // Nový klient (v: 2) bez světa (nebo s neznámým) dostane seznam ['worlds', …] a pošle hello znovu.
    // Starý klient (bez v) a server s jediným světem: rovnou první svět.
    const cid = 'p-' + crypto.randomBytes(4).toString('hex');
    let world = null;
    let hello = setTimeout(() => { if (!world) ws.terminate(); }, 10_000);
    ws.on('message', (raw) => {
      ws.seen = Date.now();
      if (world) { if (world.sockets.get(cid) === ws) world.worker.postMessage({ t: 'data', cid, raw: raw.toString() }); return; }
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (!Array.isArray(msg) || msg[0] !== 'hello') return;
      const h = msg[1] || {};
      const send = (m) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)); };
      if (password && String(h.pass || '') !== password) {
        clearTimeout(hello);
        send(['denied', 'password']);
        log(`Špatné heslo (${req.socket.remoteAddress}).`);
        setTimeout(() => ws.close(), 200);
        return;
      }
      const w = byId.get(String(h.world || '').toLowerCase()) || (h.v && W.length > 1 ? null : W[0]);
      if (!w) { // nový klient si teprve vybírá svět: dostane seznam a na výběr má 2 minuty
        send(['worlds', list()]);
        clearTimeout(hello);
        hello = setTimeout(() => { if (!world) ws.terminate(); }, 120_000);
        return;
      }
      clearTimeout(hello);
      // Profil hráče: jméno + PIN (nové jméno = nový profil), nebo jméno + token z prohlížeče. PIN se nikde nezapisuje.
      const ip = clientIp(req);
      const r = profiles.login({ name: h.name, pin: h.pin, token: h.token, ip, world: w.id });
      if (!r.ok) {
        send(['denied', r.reason, { text: r.text, wait: r.wait, left: r.left, exists: r.exists }]);
        log(`Přihlášení odmítnuto (${r.reason}): ${JSON.stringify(String(h.name ?? '').slice(0, 20))} (${ip}).`);
        setTimeout(() => ws.close(), 200);
        return;
      }
      const P = r.profile;
      if (r.token) send(['token', r.token]); // prohlížeč si ho zapamatuje a příště PIN nepotřebuje
      // Stejný hráč už v tomhle světě hraje (jiný počítač, druhá záložka): staré spojení skončí.
      for (const [old, ows] of w.sockets) {
        if (ows.profile !== P.id) continue;
        w.sockets.delete(old);
        w.worker.postMessage({ t: 'gone', cid: old });
        if (ows.readyState === ows.OPEN) ows.send(JSON.stringify(['kick', 'Přihlásil ses jinde.']));
        setTimeout(() => ows.close(), 300);
        log(`[${w.id}] ${P.name}: přihlášení z jiného místa, staré spojení zavřeno.`);
      }
      world = w;
      ws.profile = P.id;
      w.sockets.set(cid, ws);
      log(`[${w.id}] Přihlášen ${P.name}${r.created ? ' (nový hráč)' : r.newPin ? ' (nový PIN)' : ''}.`);
      w.worker.postMessage({ t: 'join', cid, name: P.name, profile: P.id });
    });
    const gone = () => {
      clearTimeout(hello);
      if (world && world.sockets.get(cid) === ws) { world.sockets.delete(cid); world.worker.postMessage({ t: 'gone', cid }); profiles.seen(ws.profile); }
    };
    ws.on('close', gone);
    ws.on('error', gone);
  });

  // Spojení, od kterého 30 s nic nepřišlo (ani zpráva, ani odpověď na ping), se zavře (spadlá wifi).
  // Dřív stačilo 5–10 s ticha, ale prohlížeč, který zrovna načítá hru, nemusí tak rychle odpovědět.
  const heartbeat = setInterval(() => {
    const now = Date.now();
    for (const ws of wss.clients) {
      if (now - ws.seen > 30_000) { log(`Spojení neodpovídá ${Math.round((now - ws.seen) / 1000)} s, zavírám ho.`); ws.terminate(); continue; }
      ws.ping();
    }
  }, 5000);

  await new Promise((ok) => server.listen(port, ok));
  return {
    port: server.address().port,
    worlds: W.map((w) => w.id),
    /** Hned uloží všechny světy. */
    save() { for (const w of W) w.worker.postMessage({ t: 'save' }); },
    /** Uloží světy, odpojí hráče a vypne server. */
    async close() {
      closing = true;
      clearInterval(heartbeat);
      await closeAdmin();
      for (const ws of wss.clients) ws.terminate();
      await Promise.all(W.map((w) => new Promise((ok) => {
        const t = setTimeout(ok, 10_000);
        w.onStopped = () => { clearTimeout(t); ok(); };
        w.worker.postMessage({ t: 'stop' });
      })));
      await Promise.all(W.map((w) => w.worker.terminate()));
      wss.close();
      await new Promise((ok) => server.close(ok));
    },
  };
}

// Adresa hráče (pro omezení špatných PINů). Za Caddy (VPS) přijde vše z 127.0.0.1 a skutečná adresa je v X-Forwarded-For.
function clientIp(req) {
  const ip = req.socket.remoteAddress || '';
  const fwd = req.headers['x-forwarded-for'];
  if (fwd && /^(127\.|::1$|::ffff:127\.)/.test(ip)) return String(fwd).split(',').pop().trim();
  return ip;
}
