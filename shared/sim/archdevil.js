// Arcidábel: boss se 17 000 životy, zranit ho jde jen mečem (MOBS.archdevil.swordsOnly, client/src/mobs/mobs.js hitMob). Objeví se tam, kde zemřel hráč (nejvýš jeden najednou, nejdřív 10 minut po minulém,
// ne v aréně). Chodí za hráči jako ostatní tvorové (shared/sim/mobs.js) a k tomu má tři super útoky s varováním
// (rudý kruh na zemi, client/src/mobs/boss-fx.js): ohnivá vlna kolem sebe, skok s dopadem na hráče a vyvolání ďáblů.
// Stav útoku jde hráčům v seznamu tvorů ('mobs', 13. pole = bossNet). Z bosse padá legendární ohnivá zbroj
// a Zlobří roh (shared/sim/pets.js). Bez vedlejších účinků při načtení.
import { emit } from '../events.js';
import { NET } from '../net/net.js';
import { terrainH } from '../world/terrain.js';
import { inPrison } from '../world/prison.js';

export const BOSS = {
  cooldown: 10 * 60 * 1000, // ms mezi dvěma bossy
  pause: [3.5, 6], // s mezi útoky (náhodně), v zuřivosti (pod polovinou životů) o třetinu kratší
  nova: { charge: 1.1, radius: 9, damage: 45 },
  slam: { charge: 0.9, radius: 5, damage: 70, range: 28 },
  summon: { charge: 1.0, count: 3, max: 8 },
};
let nextAt = 0;
const point = (x, y, z) => ({ x, y, z });

/** Hráč zemřel na (x, y, z): může se tam objevit Arcidábel. Vrací nového bosse nebo null. */
export function bossOnDeath(x, y, z, mobs, spawnMob, now = Date.now()) {
  if (NET.pvp || now < nextAt || mobs.some((m) => m.type === 'archdevil' && !m.dead)) return null;
  if (![x, y, z].every(Number.isFinite) || inPrison(x, y, z)) return null; // ve vězení (Richardovo) ne
  nextAt = now + BOSS.cooldown;
  const m = spawnMob('archdevil', x, z, y);
  if (y > terrainH(x, z) + 3 || y < terrainH(x, z) - 2) m.under = true; // zemřel v pekle / ve vězení / v jeskyni: chodí po blocích
  emit('mobSound', m);
  return m;
}
/** Pro testy: dovolí dalšího bosse hned. */
export const resetBossCooldown = () => { nextAt = 0; };

/** Stav útoku pro hráče (13. pole v seznamu tvorů). */
export const bossNet = (m) => ({ atk: m.bossAtk ?? null });

function hurtAround(m, at, r, damage) {
  for (const T of NET.targets()) {
    if (!T.alive || T.creative) continue;
    const dx = T.pos.x - at.x, dz = T.pos.z - at.z, d = Math.hypot(dx, dz);
    if (d > r || Math.abs(T.pos.y - at.y) > 4) continue;
    const kx = d > 0.01 ? dx / d : 0, kz = d > 0.01 ? dz / d : 1;
    if (T.pid) NET.sendTo(T.pid, ['dmg', damage, kx * 1.6, kz * 1.6]); else NET.hurtLocal?.(damage, kx * 1.6, kz * 1.6);
  }
}

/**
 * Super útoky (volá updateMobs každý krok pro Arcidábla). Vrací true, když boss právě útočí a má stát na místě.
 * @param {object} m boss
 * @param {{ pos, alive, creative }} T nejbližší hráč
 * @param {number} dt
 * @param {object[]} mobs
 * @param {(type: string, x: number, z: number, y?: number) => object} spawnMob
 */
export function updateArchdevil(m, T, dt, mobs, spawnMob) {
  const rage = m.hp <= m.def.hp / 2;
  const a = m.bossAtk;
  if (a) {
    a.t += dt;
    if (!a.burst && a.t >= a.charge) {
      a.burst = true;
      m.atkT = 0.4;
      if (a.kind === 'nova') hurtAround(m, a.at, a.r, BOSS.nova.damage * (rage ? 1.3 : 1));
      else if (a.kind === 'slam') { m.pos.x = a.at.x; m.pos.z = a.at.z; m.pos.y = a.at.y; hurtAround(m, a.at, a.r, BOSS.slam.damage * (rage ? 1.3 : 1)); }
      else if (a.kind === 'summon') {
        const near = mobs.filter((x) => x.type === 'devil' && !x.dead && Math.hypot(x.pos.x - m.pos.x, x.pos.z - m.pos.z) < 40).length;
        for (let i = 0; i < Math.min(BOSS.summon.count + (rage ? 1 : 0), BOSS.summon.max - near); i++) {
          const ang = (i / BOSS.summon.count) * Math.PI * 2 + Math.random();
          const d = spawnMob('devil', m.pos.x + Math.cos(ang) * 3, m.pos.z + Math.sin(ang) * 3, m.under ? m.pos.y : undefined);
          if (m.under) d.under = true;
        }
      }
      emit('mobSound', m);
    }
    if (a.t >= a.charge + 0.5) { m.bossAtk = null; m.bossCd = BOSS.pause[0] + Math.random() * (BOSS.pause[1] - BOSS.pause[0]); if (rage) m.bossCd *= 0.66; }
    return !a.burst || a.kind !== 'summon';
  }
  m.bossCd = (m.bossCd ?? 3) - dt;
  if (m.bossCd > 0 || !T?.alive || T.creative) return false;
  const d = Math.hypot(T.pos.x - m.pos.x, T.pos.z - m.pos.z);
  if (d > 40) return false;
  const kind = d < 7 ? (Math.random() < 0.7 ? 'nova' : 'summon') : d < BOSS.slam.range ? (Math.random() < 0.6 ? 'slam' : 'summon') : 'summon';
  const id = (m.bossAtkId = (m.bossAtkId || 0) + 1);
  if (kind === 'nova') m.bossAtk = { id, kind, t: 0, charge: BOSS.nova.charge * (rage ? 0.8 : 1), at: point(m.pos.x, m.pos.y, m.pos.z), r: BOSS.nova.radius };
  else if (kind === 'slam') m.bossAtk = { id, kind, t: 0, charge: BOSS.slam.charge * (rage ? 0.8 : 1), at: point(T.pos.x, T.pos.y, T.pos.z), r: BOSS.slam.radius };
  else m.bossAtk = { id, kind, t: 0, charge: BOSS.summon.charge, at: point(m.pos.x, m.pos.y, m.pos.z), r: 3 };
  emit('mobSound', m);
  return true;
}
