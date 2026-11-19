// Jízdní kolo: jízda (šlapání stojí trochu hladu), tři převody, náklon v zatáčce, zvonek. Model je v bike-model.js.
// Jen funkce a konstanty (nic se nespouští při načtení); volá je vehicles/car.js.
import { mobs } from '../../../shared/sim/mobs.js';
import { clamp } from '../../../shared/util.js';
import { solidAny } from '../../../shared/world/collision.js';
import { waterAt } from '../../../shared/world/nature.js';
import { terrainH } from '../../../shared/world/terrain.js';
import { Sound } from '../audio/sound.js';
import { hitMob } from '../mobs/mobs.js';
import { input, keys, player } from '../player/player.js';
import { forestColliders } from '../render/forest.js';
import { camera } from '../render/renderer.js';
import { toast } from '../ui/hud.js';
import { carCam, carLocal, carWarn, floorAt } from './car.js';
import { bikeModel } from './bike-model.js';

// Převody: nejvyšší rychlost (m/s) a zrychlení. 1 = do kopce, 3 = rovinka (~49 km/h). Z kopce se kolo rozjede i bez šlapání.
export const BIKE = { wb: 1.08, r: 0.34, gears: [{ max: 6, acc: 5.5 }, { max: 9.5, acc: 3.8 }, { max: 13.5, acc: 2.6 }], brake: 8, steerMax: 0.65, step: 0.45 };

// ---------- model (bike-model.js): dopředu je -z, počátek na zemi mezi koly
export const buildBikeModel = (color, v) => bikeModel(color, v, BIKE.r);

// ---------- jízda
const wheelsAt = [[0, -0.54], [0, 0.54]];
function bikeHits(v, x, z, yaw) {
  const t = { ...v, x, z, yaw };
  for (const [lx, lz] of [[0, -0.88], [0, 0.88], [-0.3, -0.42], [0.3, -0.42]]) {
    const [px, pz] = carLocal(t, lx, lz);
    for (const dy of [0.45, 1.1]) if (solidAny(Math.floor(px), Math.floor(v.y + dy), Math.floor(pz))) return true;
    if (v.y > terrainH(px, pz) - 2) for (const c of forestColliders) if ((px - c.x) ** 2 + (pz - c.z) ** 2 < (c.r + 0.1) ** 2) return true;
  }
  return false;
}
let bumpT = 0, tickT = 0;
export function rideBike(v, dt) {
  const joy = input.joy;
  const fwd = clamp((keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) + (joy ? -joy.y : 0), -1, 1);
  const steerIn = clamp((keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) + (joy ? -joy.x : 0), -1, 1);
  const off = !!v.mods?.offroad, g = BIKE.gears[clamp(v.gear || 2, 1, 3) - 1], tired = player.hunger <= 0;
  // šlapání: zrychlí do nejvyšší rychlosti převodu, stojí trochu hladu (víc na vyšší převod)
  v.pd = fwd > 0.1 ? 1 : 0;
  if (v.pd) {
    if (v.spd < g.max) v.spd += g.acc * (tired ? 0.35 : 1) * fwd * (1 - Math.max(0, v.spd) / (g.max * 1.05)) * dt;
    player.hunger = Math.max(0, player.hunger - dt * (0.05 + 0.03 * (v.gear || 2)) * fwd);
    if (tired && (carWarn.t -= dt) <= 0) { carWarn.t = 4; toast('Nemáš sílu šlapat – sněz něco'); }
  }
  if (keys.has('Space') || fwd < -0.1) {
    if (v.spd > 0.2) v.spd = Math.max(0, v.spd - BIKE.brake * dt); // brzdy
    else if (fwd < -0.1) v.spd = Math.max(-1.5, v.spd - 2 * dt); // couvání (odstrčení nohama)
    else v.spd = 0;
  }
  v.spd *= 1 - Math.min(1, (0.06 + Math.abs(v.spd) * 0.012) * dt); // valivý a vzdušný odpor
  const sl = Math.sin(v.pitch || 0);
  v.spd -= sl * 9.8 * dt * (sl > 0 && off ? 0.6 : 0.85); // do kopce zpomalí, z kopce se rozjede samo
  if (Math.abs(v.spd) < 0.02 && !v.pd) v.spd = 0;
  // řídítka: při rychlé jízdě se zatáčí jemněji
  v.steer += (steerIn * BIKE.steerMax * (1 - Math.min(0.8, Math.abs(v.spd) / 16)) - v.steer) * Math.min(1, dt * 5);
  const yawRate = (v.spd * Math.tan(v.steer)) / BIKE.wb;
  const nyaw = v.yaw + yawRate * dt;
  const nx = v.x - Math.sin(nyaw) * v.spd * dt, nz = v.z - Math.cos(nyaw) * v.spd * dt;
  const step = off ? 0.6 : BIKE.step;
  const wy = wheelsAt.map(([lx, lz]) => { const [px, pz] = carLocal({ x: nx, z: nz, yaw: nyaw }, lx, lz); return floorAt(px, pz, v.y, step); });
  const lv = waterAt(nx, -1e9, nz), deep = lv !== null && lv - Math.max(...wy.map((h) => (isFinite(h) ? h : -99))) > 0.55;
  const blocked = wy.some((h) => !isFinite(h)) || (v.spd > 0 ? wy[0] : wy[1]) > v.y + step;
  if (blocked || deep || bikeHits(v, nx, nz, nyaw)) {
    if (deep && (carWarn.t -= dt) <= 0) { carWarn.t = 3; toast('Do hluboké vody na kole nevjedeš'); }
    if (Math.abs(v.spd) > 3.5 && (bumpT -= dt) <= 0) { bumpT = 0.5; Sound.burst({ dur: 0.15, f0: 900, f1: 300, q: 1.2, vol: 0.3, type: 'lowpass' }); player.shake = 0.2; }
    v.spd *= -0.2;
  } else { v.x = nx; v.z = nz; v.yaw = nyaw; }
  // výška a sklon podle kol, náklon do zatáčky
  const avg = wy.reduce((s, h) => s + (isFinite(h) ? h : v.y), 0) / 2;
  if (avg < v.y - 0.08) { v.vy = (v.vy || 0) - 18 * dt; v.y = Math.max(avg, v.y + v.vy * dt); } else { v.y += (avg - v.y) * Math.min(1, dt * 12); v.vy = 0; }
  v.pitch = isFinite(wy[0] - wy[1]) ? clamp(Math.atan2(wy[0] - wy[1], BIKE.wb), -0.6, 0.6) : 0;
  const lean = clamp(-Math.atan((v.spd * yawRate) / 9.8), -0.6, 0.6);
  v.roll = (v.roll || 0) + (lean - (v.roll || 0)) * Math.min(1, dt * 6);
  const wl = waterAt(v.x, v.y + 0.05, v.z);
  if (wl !== null) v.spd *= 1 - Math.min(1, dt * (off ? 0.6 : 1.4)); // mělká voda brzdí
  if (Math.abs(v.spd) > 6) for (const m of mobs) { // do zvířete se jen ťukne
    if (m.dead || (m.carT || 0) > performance.now() / 1000) continue;
    const [fx, fz] = carLocal(v, 0, -Math.sign(v.spd) * 0.9);
    if (Math.hypot(m.pos.x - fx, m.pos.z - fz) < 0.6 + m.def.radius) { m.carT = performance.now() / 1000 + 0.8; hitMob(m, Math.abs(v.spd) * 0.25, v.yaw); v.spd *= 0.5; }
  }
  const [sx, sz] = carLocal(v, 0, 0.2);
  player.pos.set(sx, v.y + 0.62, sz);
  player.vel.set(0, 0, 0);
  player.onGround = true;
  placeBikeCamera(v);
  Sound.engine?.(false, 0);
  // volnoběžka cvaká při jízdě bez šlapání, řetěz tiše šumí při šlapání
  if (Math.abs(v.spd) > 1.2 && (tickT -= dt * Math.abs(v.spd) * (v.pd ? 1.2 : 5)) <= 0) {
    tickT = 1;
    if (v.pd) Sound.burst({ dur: 0.08, f0: 1800, f1: 900, q: 1.5, vol: 0.03, type: 'bandpass' });
    else Sound.burst({ dur: 0.012, f0: 5200, f1: 4200, q: 6, vol: 0.05 });
  }
  return Math.abs(v.spd);
}
export function placeBikeCamera(v) {
  if (carCam === 0) {
    const [cx, cz] = carLocal(v, 0, 0.12);
    const lean = v.roll || 0;
    camera.position.set(cx + Math.cos(v.yaw) * Math.sin(lean) * 1.5, v.y + 0.62 + 0.98 * Math.cos(lean), cz - Math.sin(v.yaw) * Math.sin(lean) * 1.5);
    camera.rotation.set(player.pitch + (v.pitch || 0) * 0.6, v.yaw + clamp(player.yaw, -2.4, 2.4), -lean * 0.5, 'YXZ');
  } else {
    const yaw = v.yaw + player.yaw, d = 4.6;
    const cx = v.x + Math.sin(yaw) * d, cz = v.z + Math.cos(yaw) * d;
    const cy = Math.max(v.y + 2 - player.pitch * 4, terrainH(cx, cz) + 0.5);
    camera.position.set(cx, cy, cz);
    camera.rotation.set(Math.atan2(v.y + 0.9 - cy, d), yaw, 0, 'YXZ');
  }
}
/** Převod 1–3 (klávesy 1, 2, 3, na dotyku tlačítko). */
export function setGear(v, g) {
  v.gear = clamp(g, 1, 3);
  Sound.burst({ dur: 0.05, f0: 2400, f1: 1600, q: 3, vol: 0.12 });
  toast(`Převod ${v.gear} – ${['do kopce', 'normální', 'rychlý'][v.gear - 1]}`);
}
export const bell = () => { Sound.ring(2350, 0.7, 0.12, 0, [1, 2.43, 3.9]); Sound.ring(2350, 0.6, 0.09, 0.14, [1, 2.43, 3.9]); };
