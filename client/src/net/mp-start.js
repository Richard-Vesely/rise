// Síťová smyčka a spuštění hry pro více hráčů.
import './mp-ui.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { NET } from '../../../shared/net/net.js';
import { kvDiff } from '../../../shared/net/ops.js';
import { accept, others, startRoom, updateRoom } from '../../../shared/net/room.js';
import { BOOT, MP } from '../game/boot.js';
import { clock, lastFrameAt, tick } from '../game/loop.js';
import { playerSafe } from '../mobs/mobs.js';
import { pcOpen } from '../pc/computer.js';
import { docOpen } from '../pc/doc-view.js';
import { receiveGift } from '../pc/papers-world.js';
import { startArena } from '../player/arena.js';
import { creative, guideOpen, isLocked, player, setCreative } from '../player/player.js';
import { rebuildBlocks } from '../render/blocks.js';
import { rebuildForest } from '../render/forest.js';
import { $ } from '../ui/dom.js';
import { toast } from '../ui/hud.js';
import { fullSet, invOpen } from '../ui/inventory-ui.js';
import { myPose, updateAvatars } from './avatars.js';
import { chatLine, chatOpen, hidePause, leaveGame, netBox, renderNetBox, renderPause, showPause, sysLine } from './mp-ui.js';
import { applyLaterKV, onHostMsg, toHost } from './multiplayer.js';

// ---------- hlavní smyčka sítě (volá ji tick)
function netUpdate(dt) {
  if (NET.dirtyBlocks) { NET.dirtyBlocks = false; rebuildBlocks(); }
  if (NET.dirtyForest) { NET.dirtyForest = false; rebuildForest(player.pos.x, player.pos.z, true); }
  if (NET.host) updateRoom(dt); // hostitel: změny světa, hráči, tvorové a malé mapy ostatním (shared/net/room.js)
  else {
    if (NET.ops.length) {
      const ops = NET.ops;
      NET.ops = [];
      toHost(['ops', creative ? 1 : 0, ops]);
    }
    if ((NET.poseT -= dt) <= 0) {
      NET.poseT = 1 / 12;
      toHost(['pose', myPose()]);
    }
    if ((NET.kvT -= dt) <= 0) {
      NET.kvT = 0.2;
      applyLaterKV();
      const ch = kvDiff();
      if (ch.length) { toHost(['kv', ch]); const until = performance.now() + 1500; for (const [m, k] of ch) NET.pend.set(m + '|' + k, until); }
    }
  }
  updateAvatars(dt);
  if ((NET.boxT -= dt) <= 0) { NET.boxT = 0.5; renderNetBox(); }
}

if (MP) {
  Object.assign(NET, { update: netUpdate, req: (msg) => toHost(msg), hostSave: () => ({ code: NET.code }) });
  if (NET.host) {
    // Místnost v prohlížeči hostitele: hostitel je hráč 'host' (cíl tvorů, místo pro nové hráče, dostává dárky a chat).
    startRoom({
      maxPlayers: 6,
      local: {
        pose: myPose,
        target: () => ({ pos: player.pos, alive: player.alive, creative, set: fullSet(), safe: playerSafe(), pid: null }),
        spawn: () => [player.pos.x + 1.5, player.pos.y + 0.5, player.pos.z + 1.5],
      },
      onChange: renderPause, onSys: sysLine, onChat: chatLine, onGift: receiveGift,
    });
  } else {
    kvDiff(); // výchozí stav malých map (posílají se jen další změny)
    NET.ready = true;
  }
  netBox.style.display = 'flex';
  document.body.classList.add('mp');
  $('newWorld').style.display = 'none';
  $('hint').textContent += ' · T chat · Esc menu a hráči';
  document.addEventListener('pointerlockchange', () => {
    if (isLocked()) { hidePause(); return; }
    if (!invOpen && !guideOpen && !chatOpen && !pcOpen && !docOpen && !NET.leaving) showPause();
  });
  window.__netOnPeerError = (e) => { if (NET.client && !BOOT.conn?.open) leaveGame('Spojení s hostitelem se přerušilo.'); else console.warn('PeerJS:', e?.type); };
  if (NET.host) {
    window.__netOnConn = accept;
    for (const c of BOOT.pendingConns || []) accept(c);
    toast(`Server běží · kód ${NET.code}`);
    sysLine(`Server spuštěn. Kód pro kamarády: ${NET.code}`);
  } else {
    window.__netOnData = (d) => { try { onHostMsg(d); } catch (e) { console.error(e); } };
    window.__netOnClose = () => { if (!NET.leaving) leaveGame(NET.kicked ? 'Hostitel tě vyhodil ze hry.' : BOOT.peer ? 'Hostitel ukončil hru.' : 'Spojení se přerušilo. Zkus se připojit znovu.'); };
    for (const d of BOOT.queue || []) window.__netOnData(d);
    if (!NET.perm && creative) setCreative(false);
    sysLine(`Připojeno k serveru ${NET.code}${NET.worldName ? ` · svět ${NET.worldName}` : ''}`);
    if (NET.pvp) startArena(); // aréna: výbava, místo v aréně, tabulka bodů
  }
  // Záložka na pozadí: prohlížeč zastaví snímky (requestAnimationFrame), svět (hlavně u hostitele) ale musí běžet dál.
  setInterval(() => {
    if (performance.now() - lastFrameAt < 300) return;
    let left = Math.min(clock.getDelta(), 1);
    while (left > 0) { tick(Math.min(left, 0.1)); left -= 0.1; }
  }, 100);
  addEventListener('pagehide', () => { try { for (const P of others.values()) P.conn?.close(); BOOT.peer?.destroy(); } catch {} });
}
