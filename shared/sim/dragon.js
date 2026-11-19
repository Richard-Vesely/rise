// Ohnivy souboj: pozdni zamereni, vejire kouli, blizke dupnuti a odpocinek pro mec.
import { emit } from '../events.js';
import { NET, nearestTarget } from '../net/net.js';
import { solidAny } from '../world/collision.js';
import { DRAGON_DEN, isDragon } from '../world/dragon-land.js';
import { groundHeight } from '../world/voxels.js';

export const DRAGON_FIRE = { range: 48, radius: 3.2, charge: 0.75, speed: 42, lock: 0.3, spread: 4.8, rest: 2.5, shots: 3 };
export const DRAGON_STOMP = { radius: 4.5, charge: 0.8, cooldown: 1.4, damage: 95 };
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
export const dragonNet = (m) => ({ cast: m.dragonCast ?? null, stomp: m.dragonStomp ?? null, rest: m.dragonRest || 0 });

function impact(m, c, at) {
  c.burst = at; c.t = c.charge + c.flight;
  emit('dragonBlast', at);
  for (const T of NET.targets()) {
    if (!T.alive || T.creative || !isDragon(T.pos.x)) continue;
    const chest = point(T.pos.x, T.pos.y + 1, T.pos.z);
    if (Math.hypot(chest.x - at.x, chest.y - at.y, chest.z - at.z) > c.radius || !dragonSight(at, chest)) continue;
    const pid = T.pid ?? 'local';
    if (m.dragonVolleyHits?.has(pid)) continue; // prekryv tri kouli nenasobi zraneni
    m.dragonVolleyHits?.add(pid);
    let dx = chest.x - at.x, dz = chest.z - at.z;
    if (Math.hypot(dx, dz) < 0.01) { dx = c.to.x - c.from.x; dz = c.to.z - c.from.z; }
    if (Math.hypot(dx, dz) < 0.01) dz = 1; // primy zasah take pouziva brneni
    const d = Math.hypot(dx, dz);
    (m.struckTargets ??= new Map()).set(T.pid ?? 'local', 1);
    if (T.pid) NET.sendTo(T.pid, ['dmg', c.damage, dx / d, dz / d]);
    else NET.hurtLocal?.(c.damage, dx / d, dz / d);
  }
}
function advanceFire(m, c, dt) {
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
}
function aimFire(m, c, T) {
  const dx = T.pos.x - m.pos.x, dz = T.pos.z - m.pos.z, d = Math.hypot(dx, dz) || 1;
  const reach = Math.min(3.6, d * 0.6);
  c.from = point(m.pos.x + dx / d * reach, m.pos.y + 2.7, m.pos.z + dz / d * reach);
  c.to = point(T.pos.x, T.pos.y + 1, T.pos.z);
  for (let i = 0; i < (c.extra?.length || 0); i++) {
    const side = i === 0 ? -1 : 1;
    c.extra[i].from = c.from;
    c.extra[i].to = point(c.to.x + dz / d * DRAGON_FIRE.spread * side, c.to.y, c.to.z - dx / d * DRAGON_FIRE.spread * side);
  }
}
function updateFire(m, dt, T) {
  const c = m.dragonCast;
  if (!c) return;
  if (c.t < c.charge - DRAGON_FIRE.lock) aimFire(m, c, T);
  // Rychly pohyb nesmi umistit usti koule za nove postavenou stenou.
  if (c.t < c.charge && !dragonSight(point(m.pos.x, m.pos.y + 2.7, m.pos.z), c.from)) {
    m.dragonCast = null; m.windup = 0; m.cd = 0.5; return;
  }
  const shots = [c, ...(c.extra || [])];
  for (const shot of shots) advanceFire(m, shot, dt);
  if (shots.every((shot) => shot.burst && shot.t >= shot.charge + shot.flight + 0.4)) {
    m.dragonCast = null;
    m.dragonShots = (m.dragonShots || 0) + 1;
    if (m.dragonShots >= DRAGON_FIRE.shots) { m.dragonRest = DRAGON_FIRE.rest; m.dragonShots = 0; m.dragonStomp = null; }
    else m.cd = m.hp <= m.def.hp / 2 ? 0.35 : 0.55;
  }
}
function updateStomp(m, fighters, dt, resting) {
  m.dragonStompCd = Math.max(0, (m.dragonStompCd || 0) - dt);
  const c = m.dragonStomp;
  if (c) {
    c.t += dt;
    if (!c.burst && c.t >= c.charge) {
      c.burst = point(c.center.x, c.floor + 0.8, c.center.z);
      m.atkT = 0.35;
      for (const T of fighters) {
        const dx = T.pos.x - c.center.x, dz = T.pos.z - c.center.z, d = Math.hypot(dx, dz);
        if (d >= c.radius || Math.abs(T.pos.y - c.center.y) > 6 ||
          !dragonSight(point(c.center.x, c.center.y + 1, c.center.z), point(T.pos.x, T.pos.y + 1, T.pos.z))) continue;
        const hitX = d > 0.01 ? dx / d : -Math.sin(m.ry), hitZ = d > 0.01 ? dz / d : -Math.cos(m.ry);
        (m.struckTargets ??= new Map()).set(T.pid ?? 'local', 1);
        if (T.pid) NET.sendTo(T.pid, ['dmg', c.damage, hitX, hitZ]);
        else NET.hurtLocal?.(c.damage, hitX, hitZ);
      }
    }
    if (c.t >= c.charge + 0.4) { m.dragonStomp = null; m.dragonStompCd = DRAGON_STOMP.cooldown; }
  } else if (!resting && m.dragonStompCd <= 0 && fighters.some((T) => Math.hypot(T.pos.x - m.pos.x, T.pos.z - m.pos.z) < DRAGON_STOMP.radius && Math.abs(T.pos.y - m.pos.y) < 6)) {
    const rage = m.hp <= m.def.hp / 2;
    m.dragonStomp = { id: (m.dragonStompId = (m.dragonStompId || 0) + 1), t: 0,
      center: point(m.pos.x, m.pos.y, m.pos.z), floor: groundHeight(m.pos.x, m.pos.z),
      radius: DRAGON_STOMP.radius, charge: rage ? 0.7 : DRAGON_STOMP.charge, damage: rage ? 130 : DRAGON_STOMP.damage };
    // Blizka obrana nespousti novy zasah do stejneho mista zaroven se zamerenim koule.
    if (m.dragonCast && m.dragonCast.t < m.dragonCast.charge) { m.dragonCast = null; m.windup = 0; m.cd = 0.6; }
    emit('mobSound', m);
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
  if (!fighters.length) { m.dragonCast = null; m.dragonStomp = null; m.windup = 0; m.dragonShots = 0; }
  else { updateStomp(m, fighters, dt, m.dragonRest > 0); updateFire(m, dt, T); }
  healAfterKill(m, 0);
  const resting = m.dragonRest > 0;
  if (fighters.length && !resting && !m.dragonStomp && !m.dragonCast && m.cd <= 0 && d < DRAGON_FIRE.range) {
    const from = point(p.x, p.y + 2, p.z), to = point(tp.x, tp.y + 1, tp.z);
    if (dragonSight(from, to)) {
      const rage = m.hp <= m.def.hp / 2;
      const c = m.dragonCast = { id: (m.dragonShotId = (m.dragonShotId || 0) + 1), t: 0, from, to,
        charge: rage ? 0.55 : DRAGON_FIRE.charge, flight: Math.max(0.4, d / DRAGON_FIRE.speed),
        radius: DRAGON_FIRE.radius, damage: rage ? m.def.dmg * 1.25 : m.def.dmg };
      if (c.id % 2 === 0) c.extra = [-1, 1].map((side) => ({ ...c, id: `${c.id}:${side}` }));
      aimFire(m, c, T); m.dragonVolleyHits = new Set();
      m.windup = m.dragonCast.charge;
      emit('mobSound', m);
    }
  }
  // V letu drzi odstup. Pri zamereni stoji a pri odpocinku klesne k meci.
  const aiming = m.dragonCast && m.dragonCast.t < m.dragonCast.charge;
  const speed = resting || m.dragonStomp || aiming ? 0 : hunting ? (d > 12 ? Math.min(18, (d - 12) * 3) : d < 7 ? -9 : 0) : d > 1 ? 2 : 0;
  m.vel.x += (dx / d * speed - m.vel.x) * Math.min(1, dt * 6);
  m.vel.z += (dz / d * speed - m.vel.z) * Math.min(1, dt * 6);
  const nx = p.x + m.vel.x * dt, nz = p.z + m.vel.z * dt, gy = groundHeight(nx, nz);
  const hover = resting || m.dragonStomp ? 0.1 : 1.6;
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
