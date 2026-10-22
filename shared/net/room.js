// Místnost = kdo drží svět pro ostatní hráče: přijímá připojení, provádí jejich změny a rozesílá je dál,
// simuluje tvory a stroje a 12× za sekundu posílá polohy hráčů. Stejný kód běží:
// - v prohlížeči hostitele ("Vytvořit server", spojení přes PeerJS; hostitel sám je hráč 'host'),
// - na serveru v Node.js (server/, spojení přes WebSocket; místní hráč není).
// Spojení (conn) má tvar jako PeerJS DataConnection: { peer: id, open, metadata: { name }, send(zpráva), on('data'|'close'|'error', fn), close() }.
import { dayCount, dayTime } from '../sim/day.js';
import { claimGroundItem } from '../sim/ground-items.js';
import { hurtMob, mobs } from '../sim/mobs.js';
import { queuePrint } from '../sim/power.js';
import { clamp } from '../util.js';
import { Vec3 } from '../vec3.js';
import { nearLight } from '../world/collision.js';
import { worldState } from '../world/save.js';
import { blocks, vehicles } from '../world/state.js';
import { shrineDist } from '../world/terrain.js';
import { getVox } from '../world/voxels.js';
import { NET, isBusy, r2, uiBusy } from './net.js';
import { applyKV, applyOp, kvDiff } from './ops.js';

export const others = new Map(); // ostatní hráči: pid -> { pid, name, pose, perm, conn? }

// Nastavení místnosti a háčky pro hráče u obrazovky hostitele (na serveru zůstanou prázdné).
export const room = {
  maxPlayers: 6,
  local: null, // { pose(), target(), spawn() } – hráč u obrazovky hostitele (pid 'host')
  onChange() {}, // změnil se seznam hráčů nebo jejich povolení (menu Esc)
  onSys() {}, // systémová zpráva: "X se připojil"
  onChat() {}, // (jméno, text)
  onGift() {}, // (id dokumentu, od koho) – dokument pro hostitele
  onLog() {}, // zápis do logu serveru
};

// ---------- zprávy
export function sendTo(pid, msg) { const c = others.get(pid)?.conn; if (c?.open) c.send(msg); }
export function broadcast(msg, except) { for (const [pid, P] of others) if (pid !== except && P.conn?.open) P.conn.send(msg); }

// Spustí místnost: od teď se změny světa sbírají a rozesílají.
export function startRoom(opts = {}) {
  Object.assign(room, opts);
  Object.assign(NET, {
    sendTo,
    give: (pid, id, n) => sendTo(pid, ['give', id, n]),
    targets() {
      const list = room.local ? [room.local.target()] : [];
      for (const P of others.values()) {
        const q = P.pose;
        if (!q || !P.conn) continue;
        const pos = (P.tpos ||= new Vec3()).set(q.x, q.y, q.z);
        list.push({ pos, alive: q.alive, creative: !!q.cr, set: q.set, safe: shrineDist(q.x, q.z) < 11 || nearLight(q.x, q.z, 5), pid: P.pid });
      }
      return list;
    },
    spawnCenter() {
      const l = this.targets().filter((t) => t.alive);
      return (l[Math.floor(Math.random() * l.length)] || l[0] || (room.local ? room.local.target() : null))?.pos ?? null;
    },
    nearestDist(x, y, z) { return Math.min(...this.targets().map((t) => Math.hypot(x - t.pos.x, y - t.pos.y, z - t.pos.z))); },
  });
  kvDiff(); // výchozí stav malých map (posílají se jen další změny)
  NET.ready = true;
}

// Nový hráč (spojení je otevřené nebo se brzy otevře).
export function accept(conn) {
  const setup = () => {
    if (others.size >= room.maxPlayers - (room.local ? 1 : 0)) { conn.send(['full']); setTimeout(() => conn.close(), 500); return; }
    let name = String(conn.metadata?.name || 'Hráč').slice(0, 16), n = 2;
    const base = name;
    while ((room.local && name === NET.name) || [...others.values()].some((P) => P.name === name)) name = `${base} ${n++}`;
    const P = { pid: conn.peer, name, conn, pose: null, perm: NET.allowAll };
    others.set(P.pid, P);
    conn.on('data', (d) => { try { onClientMsg(P, d); } catch (e) { console.error(e); } });
    conn.on('close', () => dropPlayer(P.pid));
    conn.on('error', () => dropPlayer(P.pid));
    conn.send(['welcome', { pid: P.pid, name, perm: P.perm, world: worldState(), spawn: room.local ? room.local.spawn() : [1.5, 0.95, 15.5], max: room.maxPlayers }]);
    broadcast(['join', name], P.pid);
    room.onSys(`${name} se připojil`);
    room.onLog(`připojil se ${name} (${others.size} ${others.size === 1 ? 'hráč' : 'hráči'})`);
    room.onChange();
  };
  if (conn.open) setup(); else conn.on('open', setup);
}
export function dropPlayer(pid) {
  const P = others.get(pid);
  if (!P) return;
  for (const v of vehicles.values()) if (v.driver === pid) { v.driver = null; v.spd = 0; v.engine = false; } // auto odcházejícího hráče zůstane stát
  others.delete(pid);
  broadcast(['leave', P.name]);
  room.onSys(`${P.name} odešel`);
  room.onLog(`odešel ${P.name}`);
  room.onChange();
}
function onClientMsg(P, msg) {
  if (!Array.isArray(msg)) return;
  switch (msg[0]) {
    case 'ops': {
      const [, cr, ops] = msg;
      if (!Array.isArray(ops)) return;
      if (cr && !P.perm) { // kreativní změny od hráče bez povolení hostitel ignoruje a vrátí mu skutečný stav
        const fix = ops.filter((o) => (o[0] === 'm' && o[1] === 'blocks') || o[0] === 'v')
          .map((o) => (o[0] === 'm' ? ['m', 'blocks', o[2], blocks.get(o[2]) ?? null] : ['v', o[1], o[2], o[3], getVox(o[1], o[2], o[3])]));
        if (fix.length) sendTo(P.pid, ['ops', fix]);
        sendTo(P.pid, ['perm', false]);
        return;
      }
      for (const o of ops) if (Array.isArray(o) && o[0] !== 'gx') applyOp(o);
      broadcast(['ops', ops.filter((o) => Array.isArray(o) && o[0] !== 'gx')], P.pid);
      break;
    }
    case 'kv': if (Array.isArray(msg[1])) for (const [m, k, v] of msg[1]) applyKV(m, k, v); break;
    case 'pose': {
      const q = msg[1];
      if (!q || typeof q !== 'object') return;
      if (!P.pose) room.onChange();
      P.pose = q;
      if (typeof q.ui === 'string') {
        if (!isBusy(q.ui)) NET.kvT = 0; // hráč právě otevřel truhlu / stroj: hned mu poslat aktuální stav
        uiBusy.set(q.ui, performance.now() + 1200);
      }
      // létání nebo kreativní režim bez povolení: hostitel ho hráči znovu vypne
      if (!P.perm && (q.cr || (q.fly && !q.flyT)) && (P.permNag = (P.permNag || 0) - 1) < 0) { P.permNag = 12; sendTo(P.pid, ['perm', false]); }
      break;
    }
    case 'pk': { // žádost o sebrání předmětu ze země
      const got = claimGroundItem(msg[1]);
      if (got) sendTo(P.pid, got.w ? ['give', got.id, got.n, got.w] : ['give', got.id, got.n]);
      break;
    }
    case 'hit': {
      const m = mobs.find((x) => x.nid === msg[1] && !x.dead);
      if (!m) return;
      NET.killer = P.pid;
      try { hurtMob(m, clamp(Number(msg[2]) || 1, 0, 20), Number(msg[3]) || 0, clamp(Number(msg[4]) || 1, 0, 2)); } finally { NET.killer = null; }
      break;
    }
    case 'phit': hitPlayer(P.pid, String(msg[1]), msg[2], msg[3], msg[4], !!msg[5]); break; // souboj hráčů (svět s volbou pvp)
    case 'mu': { // slepice (vejce) a kráva (mléko)
      const m = mobs.find((x) => x.nid === msg[1] && !x.dead);
      if (!m) return;
      if (m.type === 'chicken') { if (m.eggs > 0) { sendTo(P.pid, ['give', 'egg', m.eggs]); m.eggs = 0; } else sendTo(P.pid, ['toast', 'Slepice ještě nesnesla vejce']); }
      else if (m.type === 'cow') { if (m.milkT > 0) sendTo(P.pid, ['toast', 'Kráva potřebuje chvíli odpočinout']); else { m.milkT = 40; sendTo(P.pid, ['swap', 'bucket', 'milk_bucket']); } }
      break;
    }
    case 'print': queuePrint(String(msg[1]), msg[2], Number(msg[3])); break; // tisk z počítače hráče
    case 'giveTo': { // hráč předává dokument jinému hráči
      const id = String(msg[2]);
      if (!id.startsWith('doc_')) return;
      if (msg[1] === 'host') room.onGift(id, P.name); else if (others.has(msg[1])) sendTo(msg[1], ['gift', id, P.name]);
      break;
    }
    case 'chat': { const text = String(msg[1] || '').slice(0, 200).trim(); if (!text) return; room.onChat(P.name, text); broadcast(['chat', P.name, text], P.pid); break; }
  }
}
// ---------- souboje hráčů (jen svět s volbou pvp): hostitel zkontroluje zásah a pošle zraněnému 'dmg'
export const PVP = { mult: 2.5, invuln: 0.45, reach: 7, range: 90 }; // zranění ×mult (meč a šíp jsou laděné na tvory), dosah ruky / šípu v m
const hostP = { pose: null, hurtAt: 0 };
/** Hráč podle pid ('host' = hráč u obrazovky hostitele v prohlížeči; na serveru není): { pose, hurtAt }. */
function playerOf(pid) {
  if (pid !== 'host') return others.get(pid);
  if (!room.local) return null;
  hostP.pose = room.local.pose();
  return hostP;
}
/**
 * Zásah hráče jiným hráčem. Vrací true, když platí.
 * @param {string} from kdo útočí (pid)
 * @param {string} to koho zasáhl (pid)
 * @param {number} dmg zranění jako u tvora (meč 3–13, šíp 1–10), hostitel ho násobí PVP.mult
 * @param {number} yaw kam útočník míří (odhod zasaženého)
 * @param {number} kb síla odhodu 0–2
 * @param {boolean} ranged šíp (větší dosah) nebo úder zblízka
 */
export function hitPlayer(from, to, dmg, yaw, kb, ranged) {
  if (!NET.pvp || from === to) return false;
  const A = playerOf(from), T = playerOf(to), a = A?.pose, t = T?.pose;
  if (!a || !t || a.alive === false || t.alive === false || t.cr || a.cr) return false; // mrtví a hráči v kreativním režimu nebojují
  if (Math.hypot(a.x - t.x, a.y - t.y, a.z - t.z) > (ranged ? PVP.range : PVP.reach)) return false;
  const now = performance.now() / 1000;
  if (now - (T.hurtAt || -9) < PVP.invuln) return false;
  T.hurtAt = now;
  const n = clamp(Number(dmg) || 1, 0, 20) * PVP.mult, k = clamp(Number(kb) || 1, 0, 2) * 0.7, y = Number(yaw) || 0;
  const dx = -Math.sin(y) * k, dz = -Math.cos(y) * k;
  if (to === 'host') NET.hurtLocal?.(n, dx, dz); else sendTo(to, ['dmg', n, dx, dz]);
  return true;
}
export function setPerm(P, on) {
  P.perm = on;
  sendTo(P.pid, ['perm', on]);
  room.onChange();
}
export function kick(pid) {
  const P = others.get(pid);
  if (!P) return;
  sendTo(pid, ['kick']);
  setTimeout(() => P.conn.close(), 300);
  dropPlayer(pid);
}

// Síťová smyčka místnosti (volá se každý snímek / tick): změny světa, polohy hráčů, tvorové a čas, malé mapy.
export function updateRoom(dt) {
  if (NET.ops.length) {
    const ops = NET.ops;
    NET.ops = [];
    broadcast(['ops', ops]);
  }
  if ((NET.poseT -= dt) <= 0) {
    NET.poseT = 1 / 12;
    if (others.size) broadcast(['pl', [...(room.local ? [['host', NET.name, room.local.pose(), 1]] : []), ...[...others.values()].map((P) => [P.pid, P.name, P.pose, P.perm ? 1 : 0])]]);
  }
  if ((NET.mobT -= dt) <= 0) {
    NET.mobT = 0.2;
    if (others.size) broadcast(['mobs', dayTime, dayCount, mobs.map((m) => [m.nid, m.type, r2(m.pos.x), r2(m.pos.y), r2(m.pos.z), r2(m.ry), Math.round(m.hp), r2(m.flash), m.dead ? 1 : 0, m.eggs || 0, m.milkT > 0 ? 1 : 0])]);
  }
  if ((NET.kvT -= dt) <= 0) {
    NET.kvT = 0.5;
    const ch = kvDiff();
    if (ch.length) broadcast(['kv', ch]);
  }
}
