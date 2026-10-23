// Souboje hráčů na straně hráče (ve světě s volbou pvp, NET.pvp, se všemi; jinde jen se zapnutými souboji u obou, NET.pvpOn a pose.pv): kde jsou ostatní hráči (zaměření mečem,
// zásah šípem) a poslání zásahu hostiteli. Jestli zásah platí, rozhoduje hostitel (hitPlayer v shared/net/room.js).
// Bez vedlejších účinků při načtení.
import { NET } from '../../../shared/net/net.js';
import { hitPlayer as hostHit, others } from '../../../shared/net/room.js';
import { toolSound } from '../audio/tool-sounds.js';
import { emitChips } from '../render/chips.js';
import { sparks } from '../render/particles.js';

// Tělo hráče = dvě koule (nohy a trup s hlavou) nad místem, kde stojí.
const BODY = [[0.55, 0.42], [1.3, 0.42]];
const hurtAt = new Map(); // pid -> kdy jsme ho naposledy zasáhli (ať se neposílá zásah za zásahem)

/** Ostatní hráči, do kterých se dá v tomhle světě bojovat: { pid, name, x, y, z }. */
export function pvpPlayers() {
  if (!NET.pvp && !NET.pvpOn) return [];
  const list = [];
  for (const P of others.values()) {
    const q = P.pose;
    if (!q || q.alive === false || q.cr || q.veh || (!NET.pvp && !q.pv)) continue;
    list.push({ pid: P.pid, name: P.name, x: q.x, y: q.y, z: q.z });
  }
  return list;
}

/** Nejbližší hráč na paprsku míření: { player, t } nebo null; sphere(cx, cy, cz, r) vrací vzdálenost k průsečíku s koulí. */
export function rayPlayer(sphere) {
  let best = null, bt = Infinity;
  for (const p of pvpPlayers()) for (const [h, r] of BODY) {
    const t = sphere(p.x, p.y + h, p.z, r);
    if (t < bt) { bt = t; best = p; }
  }
  return best && { player: best, t: bt };
}

/** Hráč, kterého protne úsečka a→b (šíp za jeden krok letu). */
export function playerOn(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L2 = dx * dx + dy * dy + dz * dz || 1;
  for (const p of pvpPlayers()) for (const [h, r] of BODY) {
    const cy = p.y + h, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (cy - a.y) * dy + (p.z - a.z) * dz) / L2));
    const ex = a.x + dx * t - p.x, ey = a.y + dy * t - cy, ez = a.z + dz * t - p.z;
    if (ex * ex + ey * ey + ez * ez < r * r) return p;
  }
  return null;
}

/**
 * Zasáhne hráče (pošle to hostiteli; hostitel v prohlížeči to rovnou vyhodnotí). Vrací false, když je ještě chvíli
 * nezranitelný. Odezva (jiskry, zvuk) je hned, zranění přijde od hostitele.
 * @param {{ pid: string, x: number, y: number, z: number }} p
 */
export function hitPlayer(p, dmg, yaw, kb = 1, ranged = false, charge = 1) {
  const now = performance.now() / 1000;
  if (now - (hurtAt.get(p.pid) || -9) < 0.45) return false;
  hurtAt.set(p.pid, now);
  if (NET.client) NET.req(['phit', p.pid, dmg, yaw, kb, ranged ? 1 : 0]);
  else if (NET.host) hostHit('host', p.pid, dmg, yaw, kb, ranged);
  const at = [p.x, p.y + 1.1, p.z];
  sparks.emit(...at, [1, 0.3, 0.2], 8 + Math.min(16, Math.round(dmg * 1.5)), 3.5, 1.5);
  emitChips(at, [[0.6, 0.05, 0.05], [0.35, 0.02, 0.03]], Math.min(14, 3 + Math.round(dmg)), { speed: 1.8, up: 2, size: [0.03, 0.06], life: [0.3, 0.8], spread: 0.3 });
  toolSound(charge < 0.5 ? 'weak' : 'hit', charge);
  return true;
}
