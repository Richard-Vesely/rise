// Štvanice: kouzlo hole vlastníka serveru (spouští ho jen server/owner-wand.js, po ověření vlastníka). Tvorové kolem
// zasaženého hráče dostanou rudé oči (m.hunt, posílá se ostatním v ['mobs']) a HUNT.time sekund ho loví.
// Kdo: každý živý tvor kromě draka a vojáků Markovy armády (i jinak mírumilovná zvířata). Přidá se, když je do
// HUNT.join m od lovené oběti, pustí ji, když se vzdálí na víc než HUNT.leave m. Konec: vypršel čas, oběť padla
// nebo odešla ze světa. Oběť ve svatyni (do 11 m) tvorové jen obklíčí a nezraňují. Bez DOM, běží u toho, kdo drží svět.
import { shrineDist } from '../world/terrain.js';

export const HUNT = { time: 60, join: 40, leave: 80, dmg: 6, speed: 5 };
/** pid oběti -> do kdy (s, čas simulace) */
export const hunts = new Map();
let clock = 0;

/** Začne štvanici na hráče (pid) na HUNT.time sekund (znovu = prodlouží). */
export function startHunt(pid, time = HUNT.time) { hunts.set(pid, clock + time); }
/** Skončí štvanici (nebo všechny). */
export function stopHunt(pid) { if (pid == null) hunts.clear(); else hunts.delete(pid); }
export const isHunted = (pid) => hunts.has(pid);

/**
 * Jednou za krok simulace (shared/sim/mobs.js): ubíhá čas, štvanice končí (oběť padla, odešla, vypršel čas).
 * @param {number} dt
 * @param {{ pid?: string, alive: boolean }[]} TG hráči, na které tvorové reagují (NET.targets())
 */
export function updateHunts(dt, TG) {
  clock += dt;
  for (const [pid, until] of hunts) {
    const T = TG.find((t) => (t.pid ?? 'host') === pid);
    if (!T || !T.alive || clock >= until) hunts.delete(pid);
  }
}

/**
 * Plán tvora při štvanici: { T, attack, near } jako u armády (armyPlan), nebo null = tvor se chová jako obvykle.
 * Nastaví m.hunt (rudé oči).
 */
export function huntPlan(m, TG) {
  if (!hunts.size || m.army || m.type === 'dragon') { m.hunt = 0; return null; }
  let best = null, bd = Infinity;
  for (const T of TG) {
    if (!hunts.has(T.pid ?? 'host') || !T.alive) continue;
    const d = Math.hypot(T.pos.x - m.pos.x, T.pos.z - m.pos.z);
    if (d < bd && d < (m.hunt ? HUNT.leave : HUNT.join)) { bd = d; best = T; }
  }
  m.hunt = best ? 1 : 0;
  if (!best) return null;
  const safe = shrineDist(best.pos.x, best.pos.z) < 11; // svatyně chrání i před štvanicí
  return { T: best, attack: !safe, near: safe ? 5 : 1.2 };
}
