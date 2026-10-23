// Tvorové: druhy, chování (útěk, útok, toulání), pohyb po terénu i v podzemí, kořist, rození a spawnery.
// Simuluje je jen ten, kdo drží svět (hra pro jednoho, hostitel, server). Připojený hráč vidí jejich kopie (loutky).
// Model a animace jsou v client/src/mobs/mobs.js; pravidla tady jen ohlásí události (zvuky, jiskry).
import { emit } from '../events.js';
import { insertStack } from '../inventory.js';
import { MOB_INVULN } from '../tools.js';
import { NET, nearestTarget } from '../net/net.js';
import { randInt } from '../util.js';
import { Vec3 } from '../vec3.js';
import { nearLight, solidAny, solidAt, voxFloor } from '../world/collision.js';
import { collidersNear } from '../world/nature.js';
import { bkey, blocks, chests, lights, spawners } from '../world/state.js';
import { SEA, biomeAt, forest, isMark, oceanK, shrineDist, shrineOf, terrainH } from '../world/terrain.js';
import { groundHeight, topY } from '../world/voxels.js';

// Kořist z tvorů: [předmět, min, max, šance]
export const MOBS = {
  sheep: { name: 'Ovce', hp: 5, radius: 0.75, cy: 0.75, drops: [['raw_mutton', 1, 2], ['wool', 1, 2]] },
  boar: { name: 'Kanec', hp: 12, radius: 0.8, cy: 0.7, dmg: 10, drops: [['raw_pork', 2, 3], ['bone', 0, 1]] },
  chicken: { name: 'Slepice', hp: 4, radius: 0.45, cy: 0.45, drops: [['raw_chicken', 1, 1], ['egg', 0, 1]] },
  cow: { name: 'Kráva', hp: 10, radius: 0.95, cy: 1.0, drops: [['raw_beef', 2, 3], ['bone', 0, 1]] },
  deer: { name: 'Jelen', hp: 8, radius: 0.8, cy: 1.0, drops: [['raw_venison', 2, 3], ['bone', 0, 1]] },
  wolf: { name: 'Vlk', hp: 14, radius: 0.7, cy: 0.6, dmg: 8, drops: [['bone', 1, 3]] },
  crawler: { name: 'Stínožrout', hp: 10, radius: 0.7, cy: 0.5, dmg: 14, drops: [['essence', 1, 2]] },
  // Markomani: nepřátelští bojovníci Markovy dimenze v železné zbroji se železným mečem.
  markoman: {
    name: 'Markoman', hp: 26, radius: 0.75, cy: 1.1, dmg: 12, tall: true,
    drops: [['markapple', 1, 1, 0.3], ['iron', 1, 2, 0.4], ['markwood', 1, 2, 0.5], ['markorite_raw', 1, 1, 0.3], ['iron_sword', 1, 1, 0.08],
      ['iron_helmet', 1, 1, 0.04], ['iron_chestplate', 1, 1, 0.03], ['iron_leggings', 1, 1, 0.03], ['iron_boots', 1, 1, 0.04]],
  },
  golem: { name: 'Krystalový golem', hp: 60, radius: 1.2, cy: 1.5, dmg: 22, tall: true, drops: [['shard', 1, 3], ['markorite', 1, 1, 0.5], ['markapple', 1, 1, 0.25]] },
};
export const HOSTILE_SPEED = { boar: 5.2, crawler: 4.7, markoman: 4.4, wolf: 6.2, golem: 2.4 };
export const mobs = []; // { nid, type, def, pos, vel, hp, ry, flash, dead, invT, … }
// Jak dlouho zůstane mrtvý tvor vidět (převrátí se na bok a rozplyne v obláčku).
export const DEATH_TIME = 0.8;

// y: výška (jen u tvorů ze spawneru v podzemí); jinak stojí na povrchu.
export function spawnMob(type, x, z, y) {
  const def = MOBS[type];
  const under = y !== undefined && y < terrainH(x, z) - 2;
  const m = {
    nid: ++NET.mobN, type, def, under, vy: 0, pos: new Vec3(x, y ?? terrainH(x, z), z), vel: new Vec3(), hp: def.hp, ry: 0,
    phase: Math.random() * 6, flash: 0, cd: 0, dead: false, deathT: 0, wander: Math.random() * 6.28, moving: false, idleT: Math.random() * 3,
    fleeT: 0, aggro: false, soundT: 3 + Math.random() * 8,
  };
  mobs.push(m);
  return m;
}
export function removeMob(m) {
  const i = mobs.indexOf(m);
  if (i >= 0) mobs.splice(i, 1);
}
// Zásah tvora (yaw = odkud přišla rána, kb = síla odhození: 1 běžně, víc při úderu v běhu).
// Útok připojeného hráče přijde hostiteli zprávou 'hit'. Po zásahu je tvor 0,5 s nezranitelný; vrací false, když rána nic neudělala.
export function hurtMob(m, dmg, yaw, kb = 1) {
  if (m.dead || m.invT > 0) return false;
  m.invT = MOB_INVULN;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  m.hp -= dmg;
  m.flash = 1;
  const push = (m.type === 'golem' ? 2 : 8) * kb;
  m.vel.x += fx * push;
  m.vel.z += fz * push;
  emit('mobHit', m, !NET.killer, dmg); // jiskry a zvuk; !NET.killer = udeřil hráč u této obrazovky
  if (m.type === 'sheep' || m.type === 'deer' || m.type === 'chicken' || m.type === 'cow') m.fleeT = 5;
  if (m.type === 'boar' || m.type === 'wolf') m.aggro = true;
  if (m.hp <= 0) killMob(m, true);
  return true;
}
// Kořist: ze zabití hráčem jde do batohu; z pasti (hroty) do nejbližší truhly do 5 bloků – základ farmy.
export function killMob(m, drops, trap = false) {
  m.dead = true;
  emit('mobKilled', m);
  if (!drops) return;
  let chest = null;
  if (trap) {
    let best = 26;
    for (const [k, arr] of chests) {
      const [x, y, z] = k.split(',').map(Number);
      const d2 = (x + 0.5 - m.pos.x) ** 2 + (y - m.pos.y) ** 2 + (z + 0.5 - m.pos.z) ** 2;
      if (d2 < best && blocks.get(k) === 'chest') { best = d2; chest = arr; }
    }
  }
  for (const [id, a, b, chance] of m.def.drops) {
    if (chance !== undefined && Math.random() >= chance) continue;
    const n = randInt(a, b);
    if (chest) insertStack(chest, { id, n });
    else if (NET.killer) NET.give(NET.killer, id, n); // zabil ho jiný hráč
    else NET.localLoot?.(m, id, n); // hráč u této obrazovky (je-li blízko)
  }
  if (chest) emit('chestLoot', chest);
}

export function updateMobs(dt, day) {
  const TG = NET.targets(); // hráči, na které tvorové reagují
  if (!TG.length) { for (const m of [...mobs]) removeMob(m); return; } // na serveru nikdo není
  for (const m of [...mobs]) {
    if (m.dead) {
      m.deathT += dt;
      if (m.deathT > DEATH_TIME) removeMob(m);
      continue;
    }
    const T = nearestTarget(TG, m.pos), tp = T.pos;
    const dx = tp.x - m.pos.x, dz = tp.z - m.pos.z, dist = Math.hypot(dx, dz) || 0.01;
    const dyP = tp.y - m.pos.y;
    if (dist > 120) { removeMob(m); continue; }
    m.tdist = dist;
    let dirX = 0, dirZ = 0, speed = 0;
    const wander = (sp) => {
      if ((m.idleT -= dt) <= 0) { m.moving = !m.moving; m.idleT = 2 + Math.random() * 4; m.wander = Math.random() * Math.PI * 2; }
      if (m.moving) { dirX = Math.cos(m.wander); dirZ = Math.sin(m.wander); speed = sp; }
    };
    const night = day < 0.4;
    let hostile = !T.creative && (m.type === 'crawler' || m.type === 'markoman' || m.type === 'golem' || ((m.type === 'boar' || m.type === 'wolf') && m.aggro) || (m.type === 'wolf' && night));
    if (m.type === 'crawler' && T.set === 'shadow') hostile = false; // stínové brnění
    if (m.type === 'deer' && dist < 7 && !T.creative) m.fleeT = Math.max(m.fleeT, 2); // plachý
    if (m.type === 'chicken' && (m.eggT = (m.eggT ?? 20 + Math.random() * 30) - dt) <= 0) { m.eggT = 35 + Math.random() * 30; m.eggs = Math.min(2, (m.eggs || 0) + 1); }
    if (m.type === 'cow' && m.milkT > 0) m.milkT -= dt;
    if ((m.type === 'sheep' || m.type === 'deer' || m.type === 'chicken' || m.type === 'cow') && m.fleeT > 0) {
      m.fleeT -= dt; dirX = -dx / dist; dirZ = -dz / dist; speed = m.type === 'deer' ? 7 : 5.5;
    } else if (hostile && T.alive && Math.abs(dyP) < 5 && dist < (m.type === 'crawler' ? 26 : 30) && !(m.type !== 'boar' && shrineDist(tp.x, tp.z) < 11) && !(m.type === 'crawler' && T.safe)) {
      dirX = dx / dist; dirZ = dz / dist; speed = HOSTILE_SPEED[m.type];
    } else {
      if ((m.type === 'boar' || m.type === 'wolf') && dist > 30) m.aggro = false;
      wander(m.type === 'crawler' ? 1.3 : m.type === 'golem' ? 0.8 : 1.0);
    }
    if (m.type === 'crawler' || m.type === 'markoman' || m.type === 'golem' || m.type === 'wolf') {
      const sh = shrineOf(m.pos.x), sd = shrineDist(m.pos.x, m.pos.z);
      if (sd < 13) { dirX = (m.pos.x - sh.x) / sd; dirZ = (m.pos.z - sh.z) / sd; speed = 3; }
    }
    if (m.type === 'crawler') {
      for (const s of lights.values()) { // světlu se vyhýbá
        const lx = m.pos.x - (s.x + 0.5), lz = m.pos.z - (s.z + 0.5), ld = Math.hypot(lx, lz);
        if (ld < 6) { dirX = lx / ld; dirZ = lz / ld; speed = 3; }
      }
      // Na denním světle shoří (v podzemí ne).
      if (day > 0.75 && !m.under) { m.hp -= dt * 2.5; if (Math.random() < dt * 20) emit('mobBurn', m); if (m.hp <= 0) { killMob(m, false); continue; } }
    }

    const k = Math.min(1, dt * 4);
    m.vel.x += (dirX * speed - m.vel.x) * k;
    m.vel.z += (dirZ * speed - m.vel.z) * k;
    const nx = m.pos.x + m.vel.x * dt, nz = m.pos.z + m.vel.z * dt;
    const bounce = () => { m.vel.x *= -0.3; m.vel.z *= -0.3; m.wander += Math.PI; };
    const h = m.def.tall ? 2 : 1;
    if (m.under) {
      // Pod zemí (kobky, jeskyně): chůze po blocích, schod max. 1 blok, pád s gravitací.
      const fl = voxFloor(nx, m.pos.y, nz);
      let blocked = fl > m.pos.y + 1.05;
      for (let i = 0; i < h && !blocked; i++) if (solidAny(Math.floor(nx), Math.floor(Math.max(fl, m.pos.y)) + i, Math.floor(nz))) blocked = true;
      if (blocked) bounce(); else { m.pos.x = nx; m.pos.z = nz; }
      const floor = voxFloor(m.pos.x, m.pos.y, m.pos.z);
      if (floor >= m.pos.y) { m.pos.y = floor; m.vy = 0; }
      else { m.vy -= 18 * dt; m.pos.y = Math.max(floor, m.pos.y + m.vy * dt); if (m.pos.y === floor) m.vy = 0; }
    } else {
      const gy = groundHeight(nx, nz);
      // Do vykopané díry ani do zdi tvorové na povrchu nevlezou.
      let blocked = !isFinite(gy);
      for (let i = 0; i < h && !blocked; i++) if (solidAt(Math.floor(nx), Math.floor(gy + 0.5) + i, Math.floor(nz))) blocked = true;
      if (blocked) bounce(); else { m.pos.x = nx; m.pos.z = nz; }
      for (const c of collidersNear(m.pos.x, m.pos.z)) { // stromy a balvany
        const ox = m.pos.x - c.x, oz = m.pos.z - c.z, d = Math.hypot(ox, oz), min = c.r + 0.55;
        if (d < min && d > 1e-4) { m.pos.x = c.x + (ox / d) * min; m.pos.z = c.z + (oz / d) * min; }
      }
      const my = groundHeight(m.pos.x, m.pos.z);
      if (isFinite(my)) m.pos.y = my;
      // Stojí-li na položeném bloku (podlaha pevnosti), vyleze na něj.
      const bf = Math.floor(m.pos.y + 0.05);
      if (solidAt(Math.floor(m.pos.x), bf, Math.floor(m.pos.z))) m.pos.y = bf + 1;
    }
    // Hroty: zraňují tvory, kteří na nich stojí; kořist padá do truhly.
    if (blocks.get(bkey(Math.floor(m.pos.x), Math.floor(m.pos.y + 0.1), Math.floor(m.pos.z))) === 'spikes') {
      m.hp -= 9 * dt;
      m.flash = Math.max(m.flash, 0.4);
      if (m.hp <= 0) { killMob(m, true, true); continue; }
    }
    if (Math.hypot(m.vel.x, m.vel.z) > 0.15) m.ry = Math.atan2(-m.vel.x, -m.vel.z); // natočení ve směru pohybu

    m.flash = Math.max(0, m.flash - dt * 5);
    if (m.invT > 0) m.invT -= dt;
    m.cd -= dt;
    const reach = { markoman: 1.7, golem: 2.4 }[m.type] || 1.4;
    if (hostile && dist < reach && Math.abs(dyP) < 2 && m.cd <= 0 && T.alive) {
      m.cd = m.type === 'golem' ? 1.6 : m.type === 'wolf' ? 0.8 : 1.1;
      m.atkT = 0.35;
      emit('mobAttack', m);
      if (T.pid) NET.sendTo(T.pid, ['dmg', m.def.dmg, dx / dist, dz / dist]); else NET.hurtLocal?.(m.def.dmg, dx / dist, dz / dist);
      m.vel.x -= (dx / dist) * 4;
      m.vel.z -= (dz / dist) * 4;
    }
    if ((m.soundT -= dt) <= 0) {
      m.soundT = 5 + Math.random() * 10;
      if (dist < 25) emit('mobSound', m);
    }
  }
}

let spawnT = 3;
export function updateSpawns(dt, night) {
  if ((spawnT -= dt) > 0) return;
  spawnT = 2;
  const c = NET.spawnCenter(); // tvorové se rodí kolem některého z hráčů
  if (!c) return; // na serveru nikdo není
  // zvěř se nepase v poušti a na sopce
  const grazing = () => { const p = spot(); return p && !['desert', 'volcanic'].includes(biomeAt(p[0], p[1])) ? p : null; };
  const count = (t) => mobs.filter((m) => m.type === t && !m.dead).length;
  const spot = () => {
    const a = Math.random() * Math.PI * 2, r = 35 + Math.random() * 25;
    const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
    return shrineDist(x, z) < 35 || nearLight(x, z, 12) || (oceanK(x, z) > 0.02 && terrainH(x, z) < SEA + 0.3) ? null : [x, z]; // ne v moři
  };
  if (isMark(c.x)) { // Markova dimenze: Markomani a krystaloví golemové
    if (count('markoman') < (night > 0.5 ? 8 : 5)) { const p = spot(); if (p) spawnMob('markoman', ...p); }
    if (count('golem') < 2) { const p = spot(); if (p) spawnMob('golem', ...p); }
    return;
  }
  if (night > 0.5 && count('crawler') < 7) { const p = spot(); if (p) spawnMob('crawler', ...p); }
  if (night > 0.5 && count('wolf') < 4) { const p = grazing(); if (p && forest(...p) > 0.5) for (let i = 0; i < 2; i++) spawnMob('wolf', p[0] + i * 2, p[1]); }
  if (count('sheep') < 6) {
    const p = spot();
    if (p && forest(...p) < 0.55) for (let i = 0; i < randInt(2, 3); i++) spawnMob('sheep', p[0] + Math.random() * 4, p[1] + Math.random() * 4);
  }
  if (count('boar') < 3) { const p = grazing(); if (p && forest(...p) > 0.45) spawnMob('boar', ...p); }
  if (count('chicken') < 5) { const p = grazing(); if (p && forest(...p) < 0.55) for (let i = 0; i < randInt(2, 4); i++) spawnMob('chicken', p[0] + Math.random() * 3, p[1] + Math.random() * 3); }
  if (count('cow') < 4) { const p = grazing(); if (p && forest(...p) < 0.5) for (let i = 0; i < 2; i++) spawnMob('cow', p[0] + i * 3, p[1] + i * 2); }
  if (night < 0.5 && count('deer') < 4) { const p = grazing(); if (p && forest(...p) > 0.35) for (let i = 0; i < 2; i++) spawnMob('deer', p[0] + i * 3, p[1] + i); }
}

// Spawnery: když je hráč do 24 m, občas zrodí tvora vedle sebe (max. 4 v okolí).
let spawnerT = 0;
export function updateSpawners(dt) {
  if ((spawnerT -= dt) > 0) return;
  spawnerT = 1;
  for (const [k, type] of spawners) {
    if (blocks.get(k) !== 'spawner') { spawners.delete(k); continue; }
    const [x, y, z] = k.split(',').map(Number);
    if (NET.nearestDist(x + 0.5, y, z + 0.5) > 24 || Math.random() > 0.3) continue;
    if (mobs.filter((m) => !m.dead && m.type === type && Math.hypot(m.pos.x - x, m.pos.z - z) < 10).length >= 4) continue;
    for (let tries = 0; tries < 8; tries++) {
      const sx = x + randInt(-2, 2), sz = z + randInt(-2, 2);
      if ((sx === x && sz === z) || solidAny(sx, y, sz) || solidAny(sx, y + 1, sz)) continue;
      if (!solidAny(sx, y - 1, sz) && y - 1 !== topY(sx, sz)) continue;
      spawnMob(type, sx + 0.5, sz + 0.5, y);
      emit('spawnerSpawn', sx + 0.5, y + 0.8, sz + 0.5);
      break;
    }
  }
}
