// Hra pro více hráčů, strana připojeného hráče: zprávy od hostitele a loutky tvorů; obrázky ke změnám světa od ostatních.
import '../game/loop.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { on } from '../../../shared/events.js';
import { NET } from '../../../shared/net/net.js';
import { applyKV, applyOp } from '../../../shared/net/ops.js';
import { others } from '../../../shared/net/room.js';
import { setDay } from '../../../shared/sim/day.js';
import { spawnGroundItem } from '../../../shared/sim/ground-items.js';
import { DEATH_TIME, MOBS, mobs, removeMob, spawnMob } from '../../../shared/sim/mobs.js';
import { KV_MAPS, blocks } from '../../../shared/world/state.js';
import { Sound } from '../audio/sound.js';
import { BOOT } from '../game/boot.js';
import { mobLife, poseMob, viewOf } from '../mobs/mobs.js';
import { receiveGift } from '../pc/papers-world.js';
import { arenaKill, renderScore } from '../player/arena.js';
import { refreshSpecial } from '../player/eating.js';
import { swapHeld } from '../player/interaction.js';
import { addItem, countItem, heldStack, removeItem } from '../player/inventory.js';
import { creative, player, setCreative } from '../player/player.js';
import { damagePlayer } from '../player/survival.js';
import { specials } from '../render/blocks.js';
import { cutGrass } from '../render/grass.js';
import { scene } from '../render/renderer.js';
import { toast } from '../ui/hud.js';
import { invOpen, renderInventory, ui } from '../ui/inventory-ui.js';
import { chatLine, leaveGame, renderPause, sysLine } from './mp-ui.js';

// ============================================================ hra pro více hráčů (hostitel = server)
// Hostitel drží svět: klienti mu posílají změny (bloky, stromy, podzemí…), on je provede a rozešle ostatním
// (shared/net/room.js, změny světa: shared/net/ops.js). Tady je strana připojeného hráče a obrázky ke změnám.
const puppets = new Map(); // klient: tvorové podle hostitele (nid -> tvor)
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
Object.assign(NET, { code: BOOT.code, pid: NET.host ? 'host' : BOOT.welcome?.pid, allowAll: !!BOOT.settings?.creative, maxPlayers: BOOT.welcome?.max || 6, worldName: BOOT.welcome?.worldInfo?.name || '', pvp: !!BOOT.welcome?.worldInfo?.pvp });

// ---------- zprávy
export function toHost(msg) { if (BOOT.conn?.open) BOOT.conn.send(msg); }

// ---------- obrázky ke změnám světa od ostatních (pravidla v shared/net/ops.js)
on('blockOp', (k, v) => {
  const sp = specials.get(k);
  if (sp && blocks.get(k) !== v) { scene.remove(sp.obj); specials.delete(k); }
  if (v === null && player.sitting === k) player.sitting = null;
});
on('grassCut', (x, z, r) => cutGrass(x, z, r));
on('refreshSpecial', (k) => refreshSpecial(k));
on('kv', (m, k) => { if (invOpen && ui.fireKey === k) renderInventory(); });

// ---------- klient
// Změny malých map od hostitele, které přišly hned po vlastní změně (do 1,5 s). Když ji mezitím nikdo z nás nezměnil
// znovu, platí to, co poslal hostitel – jinak by se změna jiného hráče ztratila (např. věci vložené do nové truhly).
const laterKV = new Map();
export function applyLaterKV() {
  const now = performance.now();
  for (const [key, [m, k, v]] of laterKV) {
    if ((NET.pend.get(key) || 0) > now) continue;
    laterKV.delete(key);
    const L = (NET.kvLast[m] ||= new Map());
    if (JSON.stringify(KV_MAPS[m]?.get(k) ?? null) !== (L.get(k) ?? 'null')) continue; // mezitím jsi to změnil znovu ty
    applyKV(m, k, v);
    if (v === null) L.delete(k); else L.set(k, JSON.stringify(v));
  }
}
export function onHostMsg(msg) {
  if (!Array.isArray(msg)) return;
  switch (msg[0]) {
    case 'ops': for (const o of msg[1]) applyOp(o); break;
    case 'kv': {
      const now = performance.now();
      for (const [m, k, v] of msg[1]) {
        // tady jsi právě něco změnil sám: hodnotu od hostitele použij, až tvoje změna dojde (applyLaterKV)
        if ((NET.pend.get(m + '|' + k) || 0) > now) { laterKV.set(m + '|' + k, [m, k, v]); continue; }
        laterKV.delete(m + '|' + k);
        applyKV(m, k, v);
        const L = (NET.kvLast[m] ||= new Map());
        if (v === null) L.delete(k); else L.set(k, JSON.stringify(v));
      }
      break;
    }
    case 'pl': {
      const seen = new Set();
      for (const [pid, name, pose, perm] of msg[1]) {
        if (pid === NET.pid) continue;
        seen.add(pid);
        let P = others.get(pid);
        if (!P) { others.set(pid, (P = { pid, name })); renderPause(); }
        P.name = name; P.pose = pose; P.perm = perm;
      }
      for (const pid of [...others.keys()]) if (!seen.has(pid)) { others.delete(pid); renderPause(); } // postavička zmizí sama (avatars.js)
      break;
    }
    case 'gift': receiveGift(String(msg[1]), String(msg[2] || 'Hráč')); break;
    case 'mobs': setDay(msg[1], msg[2]); syncPuppets(msg[3]); break;
    case 'give': { const w = Number(msg[3]) || 0, left = addItem(msg[1], msg[2], false, w); if (left > 0) spawnGroundItem(msg[1], left, player.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), new THREE.Vector3(), 3, undefined, w); else Sound.pop(); break; }
    case 'swap': {
      if (heldStack()?.id === msg[1]) swapHeld(msg[2]); else if (countItem(msg[1])) { removeItem(msg[1], 1); addItem(msg[2], 1, true); }
      Sound.pour(); toast('Podojil jsi krávu');
      break;
    }
    case 'dmg': damagePlayer(msg[1], msg[2], msg[3]); break;
    case 'perm': {
      const was = NET.perm;
      NET.perm = !!msg[1];
      if (!NET.perm && (creative || player.flying)) { setCreative(false); toast('Hostitel ti vypnul kreativní režim'); }
      else if (NET.perm && !was) toast('Hostitel ti povolil kreativní režim (klávesa C)');
      renderPause();
      break;
    }
    case 'toast': toast(msg[1]); break;
    case 'score': if (Array.isArray(msg[1])) renderScore(msg[1]); break; // aréna: tabulka bodů
    case 'kill': arenaKill(msg[1] == null ? null : String(msg[1]), String(msg[2])); break; // aréna: někdo vypadl
    case 'chat': chatLine(msg[1], msg[2]); break;
    case 'join': sysLine(`${msg[1]} se připojil`); break;
    case 'leave': sysLine(`${msg[1]} odešel`); break;
    case 'kick': NET.kicked = true; leaveGame(typeof msg[1] === 'string' ? msg[1].slice(0, 200) : 'Hostitel tě vyhodil ze hry.'); break; // server: ['kick', 'Přihlásil ses jinde.']
  }
}
// Tvorové na klientovi: loutky, které plynule následují pozice od hostitele.
function syncPuppets(list) {
  const seen = new Set();
  for (const [nid, type, x, y, z, ry, hp, fl, dead, eggs, milk] of list) {
    if (!MOBS[type]) continue;
    seen.add(nid);
    let m = puppets.get(nid);
    if (!m) {
      spawnMob(type, x, z, y);
      m = mobs[mobs.length - 1];
      Object.assign(m, { nid, tgt: new THREE.Vector3(x, y, z), ry });
      m.pos.set(x, y, z);
      puppets.set(nid, m);
    }
    m.tgt.set(x, y, z);
    m.ry = ry; m.hp = hp; m.eggs = eggs; m.milkT = milk ? 1 : 0;
    m.flash = Math.max(m.flash, fl);
    if (dead && !m.dead) { m.dead = true; m.deathT = 0; }
  }
  for (const [nid, m] of puppets) if (!seen.has(nid) && !m.dead) { removeMob(m); puppets.delete(nid); }
}
export function updatePuppets(dt) {
  for (const [nid, m] of puppets) {
    const V = viewOf(m);
    if (m.dead) {
      m.deathT += dt;
      poseMob(V, m, dt, 0); // pád na bok a obláček (mobs.js)
      if (m.deathT > DEATH_TIME) { removeMob(m); puppets.delete(nid); }
      continue;
    }
    const ox = m.pos.x, oz = m.pos.z;
    if (m.pos.distanceTo(m.tgt) > 8) m.pos.copy(m.tgt); else m.pos.lerp(m.tgt, 1 - Math.exp(-dt * 10));
    const sp = dt > 0 ? Math.hypot(m.pos.x - ox, m.pos.z - oz) / dt : 0;
    m.flash = Math.max(0, m.flash - dt * 5);
    poseMob(V, m, dt, sp);
  }
  mobLife(dt);
}
