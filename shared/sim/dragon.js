// Drak hlídá svou jeskyni. Úder předem ohlásí a nedosáhne přes skálu.
import { emit } from '../events.js';
import { NET } from '../net/net.js';
import { solidAny } from '../world/collision.js';
import { DRAGON_DEN } from '../world/dragon-land.js';
import { groundHeight } from '../world/voxels.js';

export function dragonSight(a, b) {
  const dy = b.y + 1 - (a.y + 1.5);
  const d = Math.hypot(b.x - a.x, dy, b.z - a.z);
  for (let t = 0.5; t < d; t += 0.5) {
    const k = t / d;
    if (solidAny(Math.floor(a.x + (b.x - a.x) * k), Math.floor(a.y + 1.5 + dy * k), Math.floor(a.z + (b.z - a.z) * k))) return false;
  }
  return true;
}
// Místní smrt je vidět hned; u připojeného hráče počkáme na jeho další polohu.
function healAfterKill(m, dt) {
  if (!m.bittenTargets?.size) return;
  const targets = NET.targets();
  for (const [pid, time] of m.bittenTargets) {
    const target = targets.find((t) => (t.pid ?? 'local') === pid);
    if (target?.alive === false) {
      m.hp = m.def.hp;
      m.bittenTargets.delete(pid);
    } else if (!target || time <= dt) m.bittenTargets.delete(pid);
    else m.bittenTargets.set(pid, time - dt);
  }
}
export function updateDragon(m, T, dt) {
  healAfterKill(m, dt);
  const p = m.pos, tp = T.pos, dx = tp.x - p.x, dz = tp.z - p.z, d = Math.hypot(dx, dz) || 0.01;
  m.aggro = T.alive && tp.x < -20000;
  const hunting = m.aggro;
  const canAttack = hunting && !T.creative;
  const inHeight = tp.y - p.y > -6 && tp.y - p.y < 3;
  m.flash = Math.max(0, m.flash - dt * 5);
  m.invT = Math.max(0, (m.invT || 0) - dt);
  m.cd -= dt;
  if (m.windup > 0) {
    m.windup = Math.max(0, m.windup - dt);
    const reach = m.closeAttack ? 3.6 : 4.5;
    if (!m.windup && canAttack && d < reach && inHeight && dragonSight(p, tp)) {
      emit('mobAttack', m);
      m.atkT = 0.35;
      const dmg = m.def.dmg * (m.closeAttack ? 1.2 : 1);
      // I přímo pod drakem má zásah směr, aby fungovalo brnění a odhození.
      const hitX = d > 0.01 ? dx / d : -Math.sin(m.ry), hitZ = d > 0.01 ? dz / d : -Math.cos(m.ry);
      (m.bittenTargets ??= new Map()).set(T.pid ?? 'local', 1);
      if (T.pid) NET.sendTo(T.pid, ['dmg', dmg, hitX, hitZ]);
      else NET.hurtLocal?.(dmg, hitX, hitZ);
      healAfterKill(m, 0);
    }
  } else if (canAttack && d < 5.2 && inHeight && dragonSight(p, tp) && m.cd <= 0) {
    m.closeAttack = d < 3.2;
    m.windup = m.closeAttack ? 0.2 : 0.35;
    m.cd = m.closeAttack ? 0.9 : 1.15;
    emit('mobSound', m);
  }
  const tx = hunting ? tp.x : DRAGON_DEN.x, tz = hunting ? tp.z : DRAGON_DEN.z;
  const vx = tx - p.x, vz = tz - p.z, len = Math.hypot(vx, vz) || 1;
  // Pronásleduje i během přípravy útoku; zpomalí až těsně u hráče.
  const speed = hunting ? Math.min(10, Math.max(0, d - 1.2) * 5) : len < 0.5 ? 0 : 2.0;
  m.vel.x += (vx / len * speed - m.vel.x) * Math.min(1, dt * 5);
  m.vel.z += (vz / len * speed - m.vel.z) * Math.min(1, dt * 5);
  const nx = p.x + m.vel.x * dt, nz = p.z + m.vel.z * dt, gy = groundHeight(nx, nz);
  const denDist = Math.hypot(p.x - DRAGON_DEN.x, p.z - DRAGON_DEN.z);
  let free = Number.isFinite(gy) && (hunting || Math.hypot(nx - DRAGON_DEN.x, nz - DRAGON_DEN.z) < Math.max(13, denDist));
  // U hráče klesne, aby na něj dosáhl čelistmi i těsně pod sebou.
  const hover = d < 5.2 ? 0.6 : 1.6;
  const flyHeight = hunting ? Math.max(gy + hover, tp.y + hover + Math.sin(m.phase) * 0.2) : gy + 2.8 + Math.sin(m.phase * 0.6) * 0.4;
  const nextY = p.y + (flyHeight - p.y) * Math.min(1, dt * 2.8);
  for (let a = 0; a < 8 && free; a++) for (let y = 0; y < 4; y++) {
    if (solidAny(Math.floor(nx + Math.cos(a * Math.PI / 4) * 1.8), Math.floor(nextY + 0.1) + y,
      Math.floor(nz + Math.sin(a * Math.PI / 4) * 1.8))) { free = false; break; }
  }
  if (free) {
    p.x = nx; p.y = nextY; p.z = nz;
  } else { m.vel.x = 0; m.vel.z = 0; p.y = Math.max(gy, p.y + (gy + 2.8 - p.y) * Math.min(1, dt * 2)); }
  m.groundY = groundHeight(p.x, p.z);
  if (hunting && Math.hypot(tp.x - p.x, tp.z - p.z) > 0.001) m.ry = Math.atan2(p.x - tp.x, p.z - tp.z);
  else if (speed) m.ry = Math.atan2(-vx, -vz);
  if ((m.soundT -= dt) <= 0) { m.soundT = 7; if (d < 45) emit('mobSound', m); }
}
