// Ukládání hry do prohlížeče.
import '../ui/hud.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { NET } from '../../../shared/net/net.js';
import { worldState } from '../../../shared/world/save.js';
import { inv } from '../player/inventory.js';
import { creative, player, resetting } from '../player/player.js';
import { loadCostume } from '../menu/costume.js';
import { toast } from '../ui/hud.js';
import { armor } from '../ui/inventory-ui.js';
import { crafted, placedAny } from '../world/world-state.js';
import { BOOT } from './boot.js';
import { OLD_SAVE_KEY, SAVE_KEY } from './prefs.js';
import { MIGRATED, PROFILE } from './save-load.js';

// ============================================================ ukládání
// (stav světa: worldState() v shared/world/save.js)
let saveWarned = false;
export function saveGame() {
  if (resetting || NET.leaving) return;
  // hráč: batoh, pozice, zdraví… (klient na cizím serveru ukládá jen tohle)
  const me = { inv: inv.slots, pos: player.pos.toArray(), yaw: player.yaw, hp: Math.max(player.hp, 1), hunger: player.hunger, crafted, placedAny, creative, flying: player.flying, flyT: player.flyT || 0, armor, off: inv.off[0], look: loadCostume(NET.name) }; // look = oblek (jen vzhled), off = druhá ruka
  if (PROFILE) { if (BOOT.conn?.open) BOOT.conn.send(['me', me]); return; } // server kroužku: hráč se ukládá na serveru
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(NET.client ? me : { ...me, ...worldState(), ...(NET.host ? NET.hostSave() : {}) }));
    saveWarned = false;
  } catch {
    // plné úložiště prohlížeče (nebo zakázané): upozornit jednou, ať hráč neztratí postup potichu
    if (!saveWarned) { saveWarned = true; toast('Hru se nepodařilo uložit – v prohlížeči není místo nebo je ukládání zakázané'); }
  }
}
setInterval(saveGame, 10000);
addEventListener('beforeunload', saveGame);
addEventListener('pagehide', saveGame);
if (PROFILE) {
  if (MIGRATED) saveGame(); // starý batoh z prohlížeče jednou na server
  // batoh je teď na serveru: staré místní uložení pryč, ať ho nepřevezme jiný hráč na tomhle počítači
  try { localStorage.removeItem(SAVE_KEY); if (OLD_SAVE_KEY) localStorage.removeItem(OLD_SAVE_KEY); } catch {}
}
