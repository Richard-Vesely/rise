// Ohnivy souboj: oznaceny dopad, pomala koule a odpocinek pro utok mecem.
import { emit } from '../events.js';
import { NET, nearestTarget } from '../net/net.js';
import { solidAny } from '../world/collision.js';
import { DRAGON_DEN, isDragon } from '../world/dragon-land.js';
import { groundHeight } from '../world/voxels.js';

export const DRAGON_FIRE = { range: 48, radius: 2.6, charge: 0.9, speed: 18, rest: 4, shots: 3 };
const point = (x, y, z) => ({ x, y, z });
export function dragonSight(a, b) {
  const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  for (let t = 0.2; t < d; t += 0.2) {
    const k = t / d;
    if (solidAny(Math.floor(a.x + (b.x - a.x) * k), Math.floor(a.y + (b.y - a.y) * k), Math.floor(a.z + (b.z - a.z) * k))) return false;
  }
  return true;
}
// Stejna draha pro kresleni i zasah; po zamereni uz koule hrace nesleduje.
export function dragonFirePosition(c, time = c.t) {
  const k = Math.max(0, Math.min(1, (time - c.charge) / c.flight));
  return point(c.from.x + (c.to.x - c.from.x) * k,
    c.from.y + (c.to.y - c.from.y) * k + Math.sin(k * Math.PI) * 1.5,
    c.from.z + (c.to.z - c.from.z) * k);
}
export const dragonNet = (m) => ({ cast: m.dragonCast ?? null, rest: m.dragonRest || 0 });

function impact(m, c, at) {
  c.burst = at; c.t = c.charge + c.flight;
  emit('dragonBlast', at);
  for (const T of NET.targets()) {
    if (!T.alive || T.creative || !isDragon(T.pos.x)) continue;
    const chest = point(T.pos.x, T.pos.y + 1, T.pos.z);
    if (Math.hypot(chest.x - at.x, chest.y - at.y, chest.z - at.z) > c.radius || !dragonSight(at, chest)) continue;
    let dx = chest.x - at.x, dz = chest.z - at.z;
    if (Math.hypot(dx, dz) < 0.01) { dx = c.to.x - c.from.x; dz = c.to.z - c.from.z; }
    if (Math.hypot(dx, dz) < 0.01) dz = 1; // primy zasah take pouziva brneni
    const d = Math.hypot(dx, dz);
    (m.struckTargets ??= new Map()).set(T.pid ?? 'local', 1);
    if (T.pid) NET.sendTo(T.pid, ['dmg', c.damage, dx / d, dz / d]);
    else NET.hurtLocal?.(c.damage, dx / d, dz / d);
  }
}
function updateFire(m, dt) {
  const c = m.dragonCast;
  if (!c) return;
  const old = c.t; c.t += dt;
  m.windup = Math.max(0, c.charge - c.t);
  if (!c.burst && c.t >= c.charge) {
    // Male kroky: koule neproleti ani nove postavenou stenou.
    const end = Math.min(c.t, c.charge + c.flight), start = Math.max(old, c.charge);
    const steps = Math.max(1, Math.ceil((end - start) * DRAGON_FIRE.speed / 0.2));
    let previous = dragonFirePosition(c, start);
    for (let i = 1; i <= steps; i++) {
      const at = dragonFirePosition(c, start + (end - start) * i / steps);
      if (!dragonSight(previous, at) || solidAny(Math.floor(at.x), Math.floor(at.y), Math.floor(at.z))) {
        impact(m, c, previous); break;
      }
      previous = at;
    }
    if (!c.burst && c.t >= c.charge + c.flight) impact(m, c, c.to);
  }
  if (c.burst && c.t >= c.charge + c.flight + 0.4) {
    m.dragonCast = null;
    m.dragonShots = (m.dragonShots || 0) + 1;
    if (m.dragonShots >= DRAGON_FIRE.shots) { m.dragonRest = DRAGON_FIRE.rest; m.dragonShots = 0; }
    else m.cd = m.hp <= m.def.hp / 2 ? 0.9 : 1.3;
  }
}
function healAfterKill(m, dt) {
  for (const [pid, time] of m.struckTargets || []) {
    const T = NET.targets().find((t) => (t.pid ?? 'local') === pid);
    if (T?.alive === false) { m.hp = m.def.hp; m.struckTargets.delete(pid); }
    else if (!T || time <= dt) m.struckTargets.delete(pid);
    else m.struckTargets.set(pid, time - dt);
  }
}

export function updateDragon(m, fallback, dt) {
  healAfterKill(m, dt);
  const players = NET.targets().filter((t) => t.alive && isDragon(t.pos.x));
  const fighters = players.filter((t) => !t.creative);
  const T = players.length ? nearestTarget(fighters.length ? fighters : players, m.pos) : fallback;
  const hunting = !!players.length;
  const p = m.pos, tp = hunting ? T.pos : DRAGON_DEN;
  const dx = tp.x - p.x, dz = tp.z - p.z, d = Math.hypot(dx, dz) || 0.01;
  m.aggro = hunting;
  m.flash = Math.max(0, m.flash - dt * 5); m.invT = Math.max(0, (m.invT || 0) - dt);
  m.cd = Math.max(0, m.cd - dt);
  m.dragonRest = Math.max(0, (m.dragonRest || 0) - dt);
  if (!fighters.length) { m.dragonCast = null; m.windup = 0; m.dragonShots = 0; }
  else updateFire(m, dt);
  healAfterKill(m, 0);
  const resting = m.dragonRest > 0;
  if (fighters.length && !resting && !m.dragonCast && m.cd <= 0 && d < DRAGON_FIRE.range) {
    const from = point(p.x, p.y + 2, p.z), to = point(tp.x, tp.y + 1, tp.z);
    if (dragonSight(from, to)) {
      const rage = m.hp <= m.def.hp / 2;
      m.dragonCast = { id: (m.dragonShotId = (m.dragonShotId || 0) + 1), t: 0, from, to,
        charge: rage ? 0.65 : DRAGON_FIRE.charge, flight: Math.max(0.6, d / DRAGON_FIRE.speed),
        radius: DRAGON_FIRE.radius, damage: rage ? m.def.dmg * 1.25 : m.def.dmg };
      m.windup = m.dragonCast.charge;
      emit('mobSound', m);
    }
  }
  // V letu drzi odstup. Pri zamereni stoji a pri odpocinku klesne k meci.
  const speed = resting || m.dragonCast ? 0 : hunting ? (d > 15 ? Math.min(5, d - 15) : d < 8 ? -3 : 0) : d > 1 ? 2 : 0;
  m.vel.x += (dx / d * speed - m.vel.x) * Math.min(1, dt * 6);
  m.vel.z += (dz / d * speed - m.vel.z) * Math.min(1, dt * 6);
  const nx = p.x + m.vel.x * dt, nz = p.z + m.vel.z * dt, gy = groundHeight(nx, nz);
  const hover = resting ? 0.1 : 1.6;
  const flyHeight = hunting ? Math.max(gy + hover, (T.pos.y || gy) + hover) : gy + 2;
  const nextY = p.y + (flyHeight - p.y) * Math.min(1, dt * 4);
  let free = Number.isFinite(gy);
  for (let a = 0; a < 8 && free; a++) for (let y = 0; y < 4; y++) {
    if (solidAny(Math.floor(nx + Math.cos(a * Math.PI / 4) * 1.8), Math.floor(nextY + 0.1) + y,
      Math.floor(nz + Math.sin(a * Math.PI / 4) * 1.8))) { free = false; break; }
  }
  if (free) { p.x = nx; p.y = nextY; p.z = nz; }
  else { m.vel.x = 0; m.vel.z = 0; }
  m.groundY = groundHeight(p.x, p.z);
  if (hunting) m.ry = Math.atan2(p.x - tp.x, p.z - tp.z);
  if ((m.soundT -= dt) <= 0) { m.soundT = 7; if (d < 45) emit('mobSound', m); }
}
