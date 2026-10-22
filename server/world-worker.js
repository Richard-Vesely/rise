// Jeden svět serveru ve vlastním vlákně (worker_threads). Pravidla ve shared/ drží stav světa v modulech
// (bloky, tvorové, čas…), takže každý svět potřebuje vlastní kopii modulů – tu má každé vlákno samo.
// Hlavní vlákno (server/server.js) drží WebSockety a posílá sem zprávy hráčů tohoto světa; odpovědi jdou zpátky.
// Batohy hráčů (profily: server/profiles.js) se drží tady u světa a ukládají se do world.json (players: { id profilu: me }).
//   z hlavního vlákna: { t: 'join', cid, name, profile } · { t: 'data', cid, raw } · { t: 'gone', cid } · { t: 'save' } · { t: 'stop' }
//   do hlavního vlákna: { t: 'ready', loaded } · { t: 'send', cid, raw } · { t: 'close', cid } · { t: 'stats', … } · { t: 'log', text } · { t: 'stopped' }
import { parentPort, workerData } from 'node:worker_threads';
import { accept, others } from '../shared/net/room.js';
import { worldState } from '../shared/world/save.js';
import { ME_MAX_BYTES, cleanMe } from './me.js';
import { loadWorldFile, saveWorldFile } from './persist.js';
import { setupWorld, stepWorld } from './sim.js';

/** @type {{ id: string, name: string, creative: boolean, pvp: boolean, first: boolean, dir: string|null, maxPlayers: number, tickHz: number, saveEveryMs: number }} */
const W = workerData;
const post = (m) => parentPort.postMessage(m);
const log = (text) => post({ t: 'log', text });
const info = { id: W.id, name: W.name, creative: W.creative, pvp: W.pvp, first: W.first };

// ---------- svět a místnost
const saved = W.dir ? loadWorldFile(W.dir, log) : null;
const world = saved?.world ?? null;
/** @type {Record<string, object>} id profilu -> stav hráče v tomhle světě (batoh, pozice, zdraví…) */
const players = saved?.players ?? {};
const stats = () => post({ t: 'stats', players: others.size, ...tickStats(), heapMB: Math.round(process.memoryUsage().heapUsed / 1048576) });
setupWorld({ world, maxPlayers: W.maxPlayers, allowCreative: W.creative, pvp: W.pvp, code: 'server', log, onChange: stats });

// ---------- spojení hráčů: stejné funkce jako spojení PeerJS (shared/net/room.js je používá stejně)
const conns = new Map(); // cid -> { handlers, shut, profile }
// Rozesílání: stejná zpráva pro víc hráčů se převede na text jen jednou.
let lastMsg = null, lastRaw = '';
function sendRaw(cid, msg) {
  if (msg !== lastMsg) { lastMsg = msg; lastRaw = JSON.stringify(msg); queueMicrotask(() => { lastMsg = null; }); }
  post({ t: 'send', cid, raw: lastRaw });
}
function join(cid, name, profile) {
  const handlers = { data: [], close: [], error: [] };
  let open = true;
  const conn = {
    peer: cid,
    metadata: { name },
    get open() { return open; },
    send(msg) {
      if (!open) return;
      if (Array.isArray(msg) && msg[0] === 'welcome') {
        msg[1].worldInfo = info; // který svět to je (jméno do menu, klíč uložení)
        if (profile) msg[1].me = players[profile] ?? null; // batoh a pozice hráče v tomhle světě (null = poprvé)
      }
      sendRaw(cid, msg);
    },
    on(ev, fn) { handlers[ev]?.push(fn); },
    close() { if (open) { open = false; post({ t: 'close', cid }); } },
  };
  conns.set(cid, { handlers, shut: () => { open = false; }, profile });
  accept(conn);
}
function onData(cid, raw) {
  const c = conns.get(cid);
  if (!c) return;
  if (raw.length > ME_MAX_BYTES && raw.startsWith('["me"')) return; // moc velký stav hráče: ani ho nečíst
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  if (Array.isArray(msg) && msg[0] === 'me') { // stav hráče (každých 10 s a při odchodu): jen se uloží, místnost ho nepotřebuje
    const me = c.profile && cleanMe(msg[1], raw.length);
    if (me) players[c.profile] = me;
    return;
  }
  for (const fn of c.handlers.data) fn(msg);
}
function gone(cid) {
  const c = conns.get(cid);
  if (!c) return;
  conns.delete(cid);
  c.shut();
  for (const fn of c.handlers.close) fn();
}

// ---------- smyčka světa (20× za sekundu), měření a ukládání
const ticks = [];
function tickStats() {
  const avg = ticks.length ? ticks.reduce((a, b) => a + b, 0) / ticks.length : 0;
  return { tickAvg: Math.round(avg * 100) / 100, tickMax: Math.round(Math.max(0, ...ticks) * 100) / 100 };
}
let last = performance.now();
const ticker = setInterval(() => {
  const now = performance.now();
  try { stepWorld(Math.min((now - last) / 1000, 0.25)); } catch (e) { log('Chyba ve světě: ' + (e.stack || e)); }
  ticks.push(performance.now() - now);
  if (ticks.length > 10 * W.tickHz) ticks.shift();
  last = now;
}, 1000 / W.tickHz);
const statsTimer = setInterval(stats, 1000);
const save = () => { if (W.dir) saveWorldFile(W.dir, worldState(), players); };
const saver = setInterval(() => { try { save(); } catch (e) { log('Uložení selhalo: ' + e.message); } }, W.saveEveryMs);

parentPort.on('message', (m) => {
  switch (m.t) {
    case 'join': join(m.cid, m.name, m.profile); break;
    case 'data': try { onData(m.cid, m.raw); } catch (e) { log('Chyba ve zprávě hráče: ' + (e.stack || e)); } break;
    case 'gone': try { gone(m.cid); } catch (e) { log('Chyba při odchodu hráče: ' + (e.stack || e)); } break;
    case 'save': try { save(); } catch (e) { log('Uložení selhalo: ' + e.message); } break;
    case 'stop':
      clearInterval(ticker); clearInterval(statsTimer); clearInterval(saver);
      try { save(); } catch (e) { log('Uložení selhalo: ' + e.message); }
      post({ t: 'stopped' });
      break;
  }
});
post({ t: 'ready', loaded: !!world });
stats();
