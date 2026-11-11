// Svět na serveru: stejná pravidla (shared/) jako u hostitele v prohlížeči, jen bez hráče u obrazovky a bez kreslení.
import { NET } from '../shared/net/net.js';
import { startRoom, updateRoom } from '../shared/net/room.js';
import { advanceDay, daylight } from '../shared/sim/day.js';
import { updateGroundItems } from '../shared/sim/ground-items.js';
import { updateCrops, updateFires, updateFurnaces, updateStoves } from '../shared/sim/machines.js';
import { updateMobs, updateSpawners, updateSpawns } from '../shared/sim/mobs.js';
import { updatePower } from '../shared/sim/power.js';
import { ensureArena } from '../shared/world/arena.js';
import { loadWorld } from '../shared/world/save.js';
import { ensureStatue } from '../shared/world/statue.js';
import { updateTorches } from '../shared/world/torch.js';

/**
 * Připraví svět a místnost.
 * @param {object} o
 * @param {object|null} o.world uložený svět (worldState()) nebo null = nový svět
 * @param {number} o.maxPlayers kolik hráčů najednou
 * @param {boolean} o.allowCreative smí všichni hráči kreativní režim?
 * @param {boolean} [o.pvp] můžou se hráči navzájem zranit? (aréna)
 * @param {boolean} [o.pvpMark] můžou se zranit jen v Markově dimenzi? (bez arény)
 * @param {string} o.code jak se server jmenuje v menu hráčů (adresa)
 * @param {(msg: string) => void} o.log
 * @param {() => void} [o.onChange] změnil se seznam hráčů
 * @param {boolean} [o.statue] postavit u spawnu sochu darů s pokladničkou (server kroužku, server/donation-box.js)
 */
export function setupWorld({ world, maxPlayers, allowCreative, pvp = false, pvpMark = false, code, log, onChange = () => {}, statue = false }) {
  Object.assign(NET, { mode: 'server', host: false, client: false, name: '', perm: true, uidPrefix: 's', code, allowAll: allowCreative, pvp, pvpMark });
  loadWorld(world);
  if (pvp && NET.quiet(() => ensureArena())) log('Postavena aréna (svět se souboji hráčů).');
  const st = statue && NET.quiet(() => ensureStatue());
  if (st) log(`Postavena socha darů s pokladničkou (x ${st.x}, z ${st.z}).`);
  startRoom({ maxPlayers, onLog: log, onChange });
}

/** Jeden krok světa (stejné pořadí jako herní smyčka hostitele v client/src/game/loop.js). */
export function stepWorld(dt) {
  advanceDay(dt);
  const { day, night } = daylight();
  updateSpawners(dt);
  updateMobs(dt, day);
  updateSpawns(dt, night);
  updateGroundItems(dt);
  updateFires(dt);
  updateFurnaces(dt);
  updatePower(dt, day);
  updateStoves(dt);
  updateCrops(dt);
  updateTorches(dt);
  updateRoom(dt);
}
