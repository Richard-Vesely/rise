// Zlobr: velký pomocník hráče. Přivolá se Zlobřím rohem (padá z Arcidábla, shared/sim/archdevil.js), chodí za svým
// pánem, a když pán někoho praští, jde po něm: po tvorovi vždy, po hráči jen při platné ráně (zapnuté souboje N,
// aréna), stejně jako Markova armáda (army.js). Každý hráč má nejvýš jednoho zlobra; když pán odejde, zlobr zmizí.
// Běží u toho, kdo drží svět. Bez vedlejších účinků při načtení.
import { Vec3 } from '../vec3.js';

/** Přivolá zlobra hráči pid na místo (x, y, z); starého zlobra téhož hráče odstraní. Vrací nového zlobra. */
export function summonOgre(pid, pose, mobs, spawnMob) {
  if (!pose || ![pose.x, pose.y, pose.z].every(Number.isFinite)) return null;
  for (const m of mobs) if (m.pet && m.owner === pid && !m.dead) { m.dead = true; m.deathT = 0; }
  const yaw = Number(pose.yaw) || 0;
  const m = spawnMob('ogre', pose.x - Math.sin(yaw) * 2.5, pose.z - Math.cos(yaw) * 2.5, pose.y);
  m.pet = true; m.owner = pid; m.slot = 0;
  return m;
}

/**
 * Pán (pid) někoho praštil: jeho zlobr jde po tom. who = { mob } nebo { pid } (hráče jen při platné ráně).
 * Volá shared/net/room.js (zprávy 'hit' a hitPlayer) a client/src/mobs/mobs.js (hra pro jednoho a hostitel).
 */
export function petHit(pid, who, mobs) {
  for (const m of mobs) {
    if (!m.pet || m.dead || m.owner !== pid) continue;
    if (who.mob === m || who.pid === pid) continue; // na sebe ani na pána ne
    m.petTarget = who.mob ? { mob: who.mob } : { pid: who.pid };
  }
}

/**
 * Kam jde zlobr: na cíl, nebo za pánem. Vrací { T, attack, near } jako armyPlan, nebo null (pán tu není: zlobr zmizí).
 * @param {object} m zlobr
 * @param {object[]} TG hráči (NET.targets(); pid null / undefined = hráč u obrazovky = 'host')
 */
export function petPlan(m, TG) {
  const owner = TG.find((t) => (t.pid ?? 'host') === m.owner);
  if (!owner) { m.dead = true; m.deathT = 0; return null; }
  const P = m.petTarget;
  if (P?.mob && !P.mob.dead) return { T: { pos: P.mob.pos, alive: true, mob: P.mob }, attack: true, near: 1.6 };
  if (P?.pid) {
    const T = TG.find((t) => (t.pid ?? 'host') === P.pid);
    if (T?.alive && Math.hypot(T.pos.x - m.pos.x, T.pos.z - m.pos.z) < 60) return { T, attack: true, near: 1.6 };
  }
  m.petTarget = null;
  const goal = (m.goal ||= new Vec3()).set(owner.pos.x + 2, m.pos.y, owner.pos.z + 2);
  return { T: { pos: goal, alive: false, pid: undefined, pet: true }, attack: false, near: 1.5 };
}
