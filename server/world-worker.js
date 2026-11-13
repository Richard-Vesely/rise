// Jeden svět serveru ve vlastním vlákně (worker_threads). Pravidla ve shared/ drží stav světa v modulech
// (bloky, tvorové, čas…), takže každý svět potřebuje vlastní kopii modulů – tu má každé vlákno samo.
// Hlavní vlákno (server/server.js) drží WebSockety a posílá sem zprávy hráčů tohoto světa; odpovědi jdou zpátky.
// Batohy hráčů (profily: server/profiles.js) se drží tady u světa a ukládají se do world.json (players: { id profilu: me }).
// Pokladnička darů u sochy (server/donation-box.js) je taky tady; dary se hlásí hlavnímu vláknu do knihy darů.
// Vlastník serveru a Markova armáda: server/army-owner.js. Vězení (vlastník posílá hráče do vězení): server/prison.js.
//   z hlavního vlákna: { t: 'join', cid, name, profile, gifts? } · { t: 'data', cid, raw } · { t: 'gone', cid } · { t: 'save' } · { t: 'stop' }
//                      · { t: 'top', top } nový žebříček dárců · { t: 'gift', profile, gifts } dárky od správce pro hráče
//                      · { t: 'who', q, profile, name } odpověď: profil podle jména (vězení)
//   do hlavního vlákna: { t: 'ready', loaded } · { t: 'send', cid, raw } · { t: 'close', cid } · { t: 'stats', … } · { t: 'log', text } · { t: 'stopped' }
//                      · { t: 'donation', by, name, id, n } hráč něco daroval · { t: 'who', q, name } najdi profil podle jména (vězení)
import { parentPort, workerData } from 'node:worker_threads';
import { accept, armyChat, others, room } from '../shared/net/room.js';
import { worldState } from '../shared/world/save.js';
import { guardPrisonerOps } from '../shared/world/prison.js';
import { guardStatueOps } from '../shared/world/statue.js';
import { createArmyOwner } from './army-owner.js';
import { createDonationBox } from './donation-box.js';
import { ME_MAX_BYTES, cleanMe } from './me.js';
import { createPrison } from './prison.js';
import { loadWorldFile, saveWorldFile } from './persist.js';
import { setupWorld, stepWorld } from './sim.js';

/** @type {{ id: string, name: string, creative: boolean, pvp: boolean, pvpMark: boolean, first: boolean, dir: string|null, maxPlayers: number, tickHz: number, saveEveryMs: number, ownerId?: string, ownerName?: string, armyPhrase?: string, armyReturnPhrase?: string, top?: [string, number][] }} */
const W = workerData;
const post = (m) => parentPort.postMessage(m);
const log = (text) => post({ t: 'log', text });
const info = { id: W.id, name: W.name, creative: W.creative, pvp: W.pvp, pvpMark: W.pvpMark, first: W.first };

// ---------- svět a místnost
const saved = W.dir ? loadWorldFile(W.dir, log) : null;
const world = saved?.world ?? null;
/** @type {Record<string, object>} id profilu -> stav hráče v tomhle světě (batoh, pozice, zdraví…) */
const players = saved?.players ?? {};
const stats = () => post({ t: 'stats', players: others.size, ...tickStats(), heapMB: Math.round(process.memoryUsage().heapUsed / 1048576) });
setupWorld({ world, maxPlayers: W.maxPlayers, allowCreative: W.creative, pvp: W.pvp, pvpMark: W.pvpMark, code: 'server', log, onChange: stats, statue: true });

// ---------- pokladnička darů u sochy (dát může každý, brát jen vlastník serveru)
const dbox = createDonationBox({
  ownerId: W.ownerId || '', ownerName: W.ownerName || '', saved: saved?.donations?.box,
  send: (cid, msg) => sendRaw(cid, msg),
  onDonation: (d) => post({ t: 'donation', ...d }),
});
dbox.setTop(W.top);

// ---------- armáda: vlastník serveru smí velet vždycky (server/army-owner.js)
const armyOwner = createArmyOwner({
  ownerId: W.ownerId || '', ownerName: W.ownerName || '', phrase: W.armyPhrase || '', back: W.armyReturnPhrase || '', saved: saved?.army, log,
  send: (cid, msg) => sendRaw(cid, msg),
  command: (cid, name, text) => armyChat(cid, name, text, true),
  players: () => [...others.values()].map((P) => [P.pid, P.name]),
});

// ---------- vězení: posílá do něj jen vlastník serveru (a kdo vlastníka zabije), ven za oka obřího pavouka (server/prison.js)
const asks = new Map(); // q -> odpověď hlavního vlákna na 'who'
let askN = 0;
const prison = createPrison({
  ownerId: W.ownerId || '', ownerName: W.ownerName || '', saved: saved?.prison, log,
  send: (cid, msg) => sendRaw(cid, msg),
  conns: () => [...conns].map(([cid, c]) => [cid, { profile: c.profile, name: c.name }]),
  lookup: (name, done) => { const q = ++askN; asks.set(q, done); post({ t: 'who', q, name }); },
  put: (id, n) => dbox.put(id, n),
});
room.onKill = (killer, victim) => prison.onKill(killer, victim);

// ---------- spojení hráčů: stejné funkce jako spojení PeerJS (shared/net/room.js je používá stejně)
const conns = new Map(); // cid -> { handlers, shut, profile, name, gifts }
// Rozesílání: stejná zpráva pro víc hráčů se převede na text jen jednou.
let lastMsg = null, lastRaw = '';
function sendRaw(cid, msg) {
  if (msg !== lastMsg) { lastMsg = msg; lastRaw = JSON.stringify(msg); queueMicrotask(() => { lastMsg = null; }); }
  post({ t: 'send', cid, raw: lastRaw });
}
function join(cid, name, profile, gifts) {
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
  conns.set(cid, { handlers, shut: () => { open = false; }, profile, name, gifts: Array.isArray(gifts) ? gifts : [] });
  accept(conn);
  if (profile && conn.open) dbox.sendState(cid, profile); // žebříček dárců (a vlastníkovi obsah pokladničky)
}
function onData(cid, raw) {
  const c = conns.get(cid);
  if (!c) return;
  if (raw.length > ME_MAX_BYTES && raw.startsWith('["me"')) return; // moc velký stav hráče: ani ho nečíst
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  if (!Array.isArray(msg)) return;
  if (msg[0] === 'me') { // stav hráče (každých 10 s a při odchodu): jen se uloží, místnost ho nepotřebuje
    const me = c.profile && cleanMe(msg[1], raw.length);
    if (me) players[c.profile] = me;
    return;
  }
  if (prison.handle(cid, c.profile, msg)) return; // vězení: příkazy vlastníka, dary vězně (pose jde dál)
  if (dbox.handle(cid, c.profile, c.name, msg)) return; // pokladnička darů
  if (armyOwner.handle(cid, c.profile, others.get(cid)?.name ?? c.name, msg)) return; // armáda a vlastník serveru
  if (msg[0] === 'pose' && c.gifts.length) { // hra už běží: dárky od správce do batohu
    for (const g of c.gifts.splice(0)) sendRaw(cid, ['give', g.id, g.n]);
    sendRaw(cid, ['toast', 'Dostal(a) jsi dárek od správce serveru!']);
  }
  if (msg[0] === 'ops' && Array.isArray(msg[2])) { // socha se nedá rozbít ani podkopat: změny na ní se zahodí a hráč dostane skutečný stav
    const g = (prison.isPrisoner(c.profile) ? guardPrisonerOps : guardStatueOps)(msg[2]); // vězeň nestaví ani nekope vůbec
    if (g.fix.length) sendRaw(cid, ['ops', g.fix]);
    if (g.ops.length !== msg[2].length) msg = [msg[0], msg[1], g.ops];
  }
  for (const fn of c.handlers.data) fn(msg);
}
function gone(cid) {
  const c = conns.get(cid);
  if (!c) return;
  conns.delete(cid);
  prison.gone(cid);
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
const save = () => { if (W.dir) saveWorldFile(W.dir, worldState(), players, { box: dbox.save() }, armyOwner.save(), prison.save()); };
const saver = setInterval(() => { try { save(); } catch (e) { log('Uložení selhalo: ' + e.message); } }, W.saveEveryMs);

parentPort.on('message', (m) => {
  switch (m.t) {
    case 'join': join(m.cid, m.name, m.profile, m.gifts); break;
    case 'top': dbox.setTop(m.top); for (const [cid, c] of conns) if (c.profile) dbox.sendState(cid, c.profile); break;
    case 'gift': for (const c of conns.values()) if (c.profile === m.profile) c.gifts.push(...m.gifts); break;
    case 'who': { const done = asks.get(m.q); asks.delete(m.q); done?.(m.profile ? { id: m.profile, name: m.name } : null); break; }
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
