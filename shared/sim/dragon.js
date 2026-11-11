// Drak hlídá svou jeskyni. Úder předem ohlásí a nedosáhne přes skálu.
import { emit } from '../events.js';
import { NET } from '../net/net.js';
import { solidAny } from '../world/collision.js';
import { DRAGON_DEN } from '../world/dragon-land.js';
import { groundHeight } from '../world/voxels.js';

export function dragonSight(a, b) {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  for (let t = 0.5; t < d; t += 0.5) {
    const k = t / d;
    if (solidAny(Math.floor(a.x + (b.x - a.x) * k), Math.floor(a.y + 1.5), Math.floor(a.z + (b.z - a.z) * k))) return false;
  }
  return true;
}
export function updateDragon(m, T, dt) {
  const p = m.pos, tp = T.pos, dx = tp.x - p.x, dz = tp.z - p.z, d = Math.hypot(dx, dz) || 0.01;
  const fromDen = Math.hypot(tp.x - DRAGON_DEN.x, tp.z - DRAGON_DEN.z);
  const portalDist = Math.hypot(tp.x - DRAGON_DEN.x, tp.z - DRAGON_DEN.z - 72);
  m.aggro = T.alive && !T.creative && tp.x < -20000 && portalDist >= 11 && fromDen < 140;
  const hunting = m.aggro;
  m.flash = Math.max(0, m.flash - dt * 5);
  m.invT = Math.max(0, (m.invT || 0) - dt);
  m.cd -= dt;
  if (m.windup > 0) {
    m.windup = Math.max(0, m.windup - dt);
    if (!m.windup && hunting && d < 4.5 && Math.abs(tp.y - p.y) < 3 && dragonSight(p, tp)) {
      emit('mobAttack', m);
      m.atkT = 0.35;
      if (T.pid) NET.sendTo(T.pid, ['dmg', m.def.dmg, dx / d, dz / d]);
      else NET.hurtLocal?.(m.def.dmg, dx / d, dz / d);
    }
  } else if (hunting && d < 5.2 && Math.abs(tp.y - p.y) < 3 && dragonSight(p, tp) && m.cd <= 0) {
    m.windup = 0.35;
    m.cd = 1.15;
    emit('mobSound', m);
  }
  const tx = hunting ? tp.x : DRAGON_DEN.x, tz = hunting ? tp.z : DRAGON_DEN.z;
  const vx = tx - p.x, vz = tz - p.z, len = Math.hypot(vx, vz) || 1;
  const speed = m.windup > 0 ? 0 : hunting ? d < 4.2 ? 0 : 8.5 : len < 0.5 ? 0 : 2.0;
  m.vel.x += (vx / len * speed - m.vel.x) * Math.min(1, dt * 5);
  m.vel.z += (vz / len * speed - m.vel.z) * Math.min(1, dt * 5);
  const nx = p.x + m.vel.x * dt, nz = p.z + m.vel.z * dt, gy = groundHeight(nx, nz);
  let free = Number.isFinite(gy) && Math.hypot(nx - DRAGON_DEN.x, nz - DRAGON_DEN.z) < (hunting ? 145 : 13);
  const flyHeight = hunting ? Math.max(gy + 1.6, tp.y + 1.6 + Math.sin(m.phase) * 0.7) : gy + 2.8 + Math.sin(m.phase * 0.6) * 0.4;
  const nextY = p.y + (flyHeight - p.y) * Math.min(1, dt * 2.8);
  for (let a = 0; a < 8 && free; a++) for (let y = 0; y < 4; y++) {
    if (solidAny(Math.floor(nx + Math.cos(a * Math.PI / 4) * 1.8), Math.floor(nextY + 0.1) + y,
      Math.floor(nz + Math.sin(a * Math.PI / 4) * 1.8))) { free = false; break; }
  }
  if (free) {
    p.x = nx; p.y = nextY; p.z = nz;
  } else { m.vel.x = 0; m.vel.z = 0; p.y = Math.max(gy, p.y + (gy + 2.8 - p.y) * Math.min(1, dt * 2)); }
  m.groundY = groundHeight(p.x, p.z);
  if (hunting) m.ry = Math.atan2(-dx, -dz);
  else if (speed) m.ry = Math.atan2(-vx, -vz);
  if ((m.soundT -= dt) <= 0) { m.soundT = 7; if (d < 45) emit('mobSound', m); }
}
