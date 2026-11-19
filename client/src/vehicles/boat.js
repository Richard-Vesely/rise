// Lodě: motorový člun a plachetnice. Plutí po hladině (houpání na vlnách, mělčina u břehu), brázda a spršky.
// Plachetnici pohání vítr (shared/sim/weather.js windAt): stejný pro všechny hráče, takže plachty míří všem stejně.
// Proti větru plout nejde (plachta třepetá), nejrychleji to jede s větrem z boku. Jen funkce a konstanty (nic se nespouští při načtení).
import * as THREE from 'three';
import { dayCount, dayTime } from '../../../shared/sim/day.js';
import { windAt } from '../../../shared/sim/weather.js';
import { clamp } from '../../../shared/util.js';
import { solidAny } from '../../../shared/world/collision.js';
import { waterAt } from '../../../shared/world/nature.js';
import { terrainH } from '../../../shared/world/terrain.js';
import { Sound } from '../audio/sound.js';
import { input, keys, player } from '../player/player.js';
import { debris } from '../render/particles.js';
import { camera, scene } from '../render/renderer.js';
import { toast } from '../ui/hud.js';
import { carCam, carLocal, carWarn, nitroOn } from './car.js';
import { powerMul } from './kinds.js';
import { buildMotorboat, buildSailboat, shapeSail } from './boat-model.js';

// draft = ponor (jak hluboko je dno lodi pod hladinou); počátek lodi je na hladině
export const BOATS = {
  motorboat: { len: 5.2, wid: 2.0, maxFwd: 15, accel: 4.5, rev: 3.5, turn: 0.8, draft: 0.32 },
  sailboat: { len: 5.6, wid: 2.1, turn: 0.6, draft: 0.45 },
};
/** Výška hladiny v bodě, nebo null (souš). */
export const levelAt = (x, z) => waterAt(x, -1e9, z);
const depthAt = (x, z) => { const lv = levelAt(x, z); return lv === null ? -1 : lv - terrainH(x, z); };
const hullPts = (B) => [[0, -B.len / 2 + 0.2], [0, B.len / 2 - 0.15], [-B.wid / 2, 0.3], [B.wid / 2, 0.3], [-B.wid * 0.35, -B.len / 4], [B.wid * 0.35, -B.len / 4]];
/** Vejde se loď na vodu v bodě (hloubka pod celým trupem, žádný blok)? Vrátí '' nebo důvod. */
export function boatBlocker(type, x, z, yaw, lv) {
  const B = BOATS[type];
  for (const [lx, lz] of hullPts(B)) {
    const [px, pz] = carLocal({ x, z, yaw }, lx, lz);
    if (depthAt(px, pz) < B.draft + 0.08) return 'moc mělko nebo břeh';
    if (solidAny(Math.floor(px), Math.floor(lv), Math.floor(pz)) || solidAny(Math.floor(px), Math.floor(lv + 0.6), Math.floor(pz))) return 'překáží blok';
  }
  return '';
}
/** Místo pro spuštění lodi na vodu ve směru pohledu (do 14 m): { ok, x, y, z } nebo { ok: false, why }. */
export function boatSpot(type) {
  const o = camera.position, d = new THREE.Vector3();
  camera.getWorldDirection(d);
  let why = 'tady není voda – loď spusť na rybník nebo jezero';
  for (let t = 1.5; t < 14; t += 0.25) {
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t, lv = waterAt(x, y, z);
    if (lv === null) { if (y < terrainH(x, z) - 0.05) break; continue; }
    // loď sjede po vodě dál od břehu, až je pod ní dost hluboko (a není na hráči)
    for (let k = 0; k <= 24; k += 1.5) {
      const bx = x + d.x * k / Math.hypot(d.x, d.z || 1e-6), bz = z + d.z * k / Math.hypot(d.x, d.z || 1e-6), blv = levelAt(bx, bz);
      if (blv === null) continue;
      why = boatBlocker(type, bx, bz, player.yaw, blv);
      if (!why && Math.hypot(bx - player.pos.x, bz - player.pos.z) > 2) return { ok: true, x: bx, y: blv, z: bz };
    }
    break;
  }
  return { ok: false, why };
}

// ---------- modely (boat-model.js): dopředu je -z, počátek na hladině. Tady je jen jejich pohyb: plachty, ráhno, vlaječka.
function rigSailboat(m) {
  const { boom, main, jib, flagG, mz, boat: B } = m;
  m.update = (src, dt, v) => {
    const t = performance.now() / 1000, up = clamp(src.thr ?? 0, 0, 1), luff = src.lf ? 1 : 0;
    boom.rotation.y += ((src.bm ?? src.boom ?? 0) - boom.rotation.y) * Math.min(1, dt * 3); // bm = z pozice řidiče, boom = vlastní stav
    const side = Math.sign(boom.rotation.y || 1), b = (0.35 + 0.15 * up) * side * (1 - luff * 0.8);
    shapeSail(main.geometry, [0, 0.15 + 4.9 * up, 0.05], [0, 0.1, 0.05], [0, 0.1, 2.55], up > 0.02 ? b : 0, luff * 0.12 * up, t);
    main.visible = up > 0.02;
    jib.visible = up > 0.02;
    const cl = [side * 0.55 * Math.abs(Math.sin(boom.rotation.y)) + 0.0, 0.55, mz - 0.25];
    shapeSail(jib.geometry, [0, 1.2 + 3.8 * up, mz - 0.05], [0, 0.55, -B.len / 2 + 0.3], cl, b * 0.6, luff * 0.1 * up, t + 1);
    const w = windAt(dayCount, dayTime), yaw = v.yaw;
    flagG.rotation.y = Math.atan2(w.x * Math.cos(yaw) - w.z * Math.sin(yaw), w.x * Math.sin(yaw) + w.z * Math.cos(yaw)) + Math.sin(t * 9) * 0.08;
  };
  return m;
}
export function buildBoatModel(type, color, v) {
  const m = type === 'sailboat' ? rigSailboat(buildSailboat(BOATS.sailboat, color)) : buildMotorboat(BOATS.motorboat, color, v);
  m.group.traverse((o) => { if (o.isMesh) o.userData.noCast = true; }); // houpající se loď by si stínem rušila vlastní boky
  const inner = m.update;
  // houpání zaparkované lodi, brázda a spršky (i u lodí, které řídí ostatní hráči)
  m.update = (src, dt, v, driven) => {
    inner?.(src, dt, v, driven);
    if (m.prop) m.prop.rotation.z += (src.thr || 0) * 40 * dt;
    if (!driven) { const t = performance.now() / 1000; m.group.position.y += Math.sin(t * 1.6 + v.x * 0.3) * 0.04; m.group.rotateZ(Math.sin(t * 1.1 + v.z) * 0.02); }
    const sp = Math.abs(src.spd || 0);
    if (sp > 0.8 && (m.wakeT = (m.wakeT || 0) - dt * (0.6 + sp * 0.35)) <= 0) {
      m.wakeT = 0.18;
      const lv = levelAt(m.group.position.x, m.group.position.z);
      if (lv !== null) {
        const st = m.group.localToWorld(tmp.set(0, 0, m.boat.len / 2)), s = Math.min(1.6, 0.5 + sp * 0.08);
        wake(st.x, lv, st.z, s, 1.6 + sp * 0.12);
        if (sp > 4) { const bow = m.group.localToWorld(tmp.set(0, 0.2, -m.boat.len / 2 + 0.4)); debris.emit(bow.x, lv + 0.15, bow.z, [0.85, 0.92, 1], Math.round(sp / 3), 1.2 + sp * 0.12, 1.4); } // spršky od přídě
      }
    }
  };
  return m;
}

// ---------- brázda: pěnové kroužky na hladině, které se rozšiřují a mizí (jedna sada pro všechny lodě, vzniká až při prvním použití)
const tmp = new THREE.Vector3(), WAKE_N = 96;
let wakeMesh = null, wakeI = 0;
const wakes = [];
function wake(x, y, z, s, life) {
  if (!wakeMesh) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    wakeMesh = new THREE.InstancedMesh(new THREE.RingGeometry(0.75, 1, 28).rotateX(-Math.PI / 2), mat, WAKE_N);
    wakeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    wakeMesh.frustumCulled = false;
    for (let i = 0; i < WAKE_N; i++) { wakes.push({ age: 9, life: 1 }); wakeMesh.setColorAt(i, new THREE.Color(0, 0, 0)); }
    scene.add(wakeMesh);
  }
  Object.assign(wakes[wakeI], { x, y: y + 0.03, z, s, age: 0, life });
  wakeI = (wakeI + 1) % WAKE_N;
}
const wm = new THREE.Matrix4(), wc = new THREE.Color();
/** Každý snímek: brázdy se rozšiřují a slábnou. */
export function updateWake(dt) {
  if (!wakeMesh) return;
  for (let i = 0; i < WAKE_N; i++) {
    const w = wakes[i];
    w.age += dt;
    const k = w.age / w.life;
    if (k >= 1) { wm.makeScale(0, 0, 0); wakeMesh.setMatrixAt(i, wm); continue; }
    const r = w.s * (0.6 + k * 2.4);
    wm.makeScale(r, 1, r).setPosition(w.x, w.y, w.z);
    wakeMesh.setMatrixAt(i, wm);
    wakeMesh.setColorAt(i, wc.setRGB(0.55, 0.6, 0.65).multiplyScalar((1 - k) ** 1.5 * 0.7));
  }
  wakeMesh.instanceMatrix.needsUpdate = true;
  wakeMesh.instanceColor.needsUpdate = true;
}

// ---------- plutí
/** Vítr vůči lodi: úhel od přídě k místu, odkud fouká (0 = přímo proti větru), strana (+1 = zprava) a síla. */
export function windRel(v) {
  const w = windAt(dayCount, dayTime), fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw), rx = Math.cos(v.yaw), rz = -Math.sin(v.yaw);
  return { a: Math.acos(clamp(-(fx * w.x + fz * w.z), -1, 1)), side: Math.sign(-(rx * w.x + rz * w.z)) || 1, speed: w.speed, w };
}
/** Jak dobře plachta táhne podle úhlu k větru (0 = třepetá, 1 = bočák). */
export function sailEff(a) {
  if (a < 0.6) return 0; // do 34° od větru plachta jen třepetá
  if (a < 1.05) return 0.85 * (a - 0.6) / 0.45; // ostře proti větru
  if (a < 1.75) return 0.85 + 0.15 * (a - 1.05) / 0.7; // bočák (vítr z boku) je nejrychlejší
  return 1 - 0.4 * (a - 1.75) / (Math.PI - 1.75); // po větru
}
export const POINTS_OF_SAIL = (a) => (a < 0.6 ? 'proti větru – plachta třepetá' : a < 1.05 ? 'ostře proti větru' : a < 1.75 ? 'bočák (vítr z boku)' : a < 2.6 ? 'zadoboční vítr' : 'po větru');
let groundT = 0, slapT = 0, flapT = 0;
export function sailBoat(v, dt) {
  const B = BOATS[v.type], joy = input.joy, motor = v.type === 'motorboat';
  const fwd = clamp((keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) + (joy ? -joy.y : 0), -1, 1);
  const steerIn = clamp((keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) + (joy ? -joy.x : 0), -1, 1);
  const lv = levelAt(v.x, v.z) ?? v.y;
  let wr = null;
  if (motor) {
    if (!v.engine && Math.abs(fwd) > 0.2) {
      if (v.fuel <= 0) { if ((carWarn.t -= dt) <= 0) { carWarn.t = 3; toast('Došlo palivo – natankuj z kanystru (pravé tl. s kanystrem na člun)'); } }
      else { v.engine = true; Sound.burst({ dur: 0.5, f0: 260, f1: 110, q: 1.5, vol: 0.3, type: 'lowpass' }); }
    }
    if (v.engine && v.fuel <= 0) { v.engine = false; toast('Motor zhasl – došlo palivo'); }
    const thr = v.engine ? fwd : 0, boost = nitroOn(), maxF = B.maxFwd * (v.mods?.engine ? 1.25 : 1) * (boost ? 1.35 : 1);
    v.thr = thr;
    if (thr > 0) v.spd = v.spd < 0 ? v.spd + 4 * dt : Math.min(maxF, v.spd + B.accel * powerMul(v, boost) * thr * (1 - v.spd / (maxF * 1.1)) * dt);
    else if (thr < 0) v.spd = v.spd > 0.3 ? Math.max(0, v.spd - 4 * dt) : Math.max(-B.rev, v.spd + 2.5 * thr * dt);
    if (v.engine) v.fuel = Math.max(0, v.fuel - (0.01 + Math.abs(thr) * 0.07) * dt);
  } else {
    // plachetnice: W vytáhne plachtu, S ji svine; plachta se sama natočí podle větru
    v.thr = clamp((v.thr || 0) + fwd * 0.6 * dt, 0, 1);
    wr = windRel(v);
    const eff = sailEff(wr.a);
    v.lf = v.thr > 0.05 && eff < 0.05 ? 1 : 0;
    v.boom = -wr.side * clamp((wr.a - 0.3) * 0.55, 0.06, 1.35);
    const target = wr.speed * 1.15 * eff * v.thr;
    v.spd += (target - v.spd) * Math.min(1, dt * (target > v.spd ? 0.35 : 0.2));
    const heel = 0.34 * v.thr * eff * Math.min(1.3, wr.speed / 8);
    v.heel = -wr.side * heel;
    if (v.lf && (flapT -= dt) <= 0) { flapT = 0.12 + Math.random() * 0.1; Sound.burst({ dur: 0.07, f0: 700, f1: 300, q: 0.7, vol: 0.05 * wr.speed / 6, type: 'lowpass' }); } // třepetání plachty
  }
  v.spd *= 1 - Math.min(1, (0.05 + Math.abs(v.spd) * 0.01) * dt); // odpor vody
  // kormidlo účinkuje podle rychlosti (člun s motorem zatočí i z místa)
  v.steer += (steerIn * 0.6 - v.steer) * Math.min(1, dt * 4);
  const eff = motor ? clamp(Math.abs(v.spd) / 4, v.engine && Math.abs(v.thr) > 0.1 ? 0.35 : 0, 1.2) : clamp(Math.abs(v.spd) / 3, 0.08, 1);
  const nyaw = v.yaw + v.steer * B.turn * eff * (v.spd < -0.1 ? -1 : 1) * dt;
  const nx = v.x - Math.sin(nyaw) * v.spd * dt, nz = v.z - Math.cos(nyaw) * v.spd * dt;
  const nlv = levelAt(nx, nz);
  if (nlv === null || boatBlocker(v.type, nx, nz, nyaw, nlv)) {
    if (Math.abs(v.spd) > 1.5 && (groundT -= dt) <= 0) { groundT = 2.5; toast('Mělčina! Loď narazila na břeh'); Sound.burst({ dur: 0.4, f0: 300, f1: 80, q: 0.8, vol: 0.4, type: 'lowpass' }); player.shake = 0.25; }
    v.spd *= -0.25;
    v.yaw += (nyaw - v.yaw) * 0.3; // aspoň se trochu stočí od břehu
  } else { v.x = nx; v.z = nz; v.yaw = nyaw; }
  // vlny: houpání, náklon od větru (plachetnice) a zvednutá příď v rychlosti (člun)
  const t = performance.now() / 1000, wsp = wr ? wr.speed : 5, amp = 0.035 + wsp * 0.006;
  v.y = lv + Math.sin(t * 1.7 + v.x * 0.3) * amp + Math.sin(t * 2.9 + v.z * 0.5) * amp * 0.4;
  v.pitch = Math.sin(t * 1.3 + v.z * 0.2) * amp * 0.5 + (motor ? 0.07 * clamp(Math.abs(v.spd) / 7, 0, 1) * (1 - clamp((Math.abs(v.spd) - 9) / 6, 0, 0.6)) : 0);
  const rollT = (motor ? -v.steer * clamp(v.spd / 10, -0.3, 0.6) * 0.25 : v.heel || 0) + Math.sin(t * 1.1 + v.x * 0.2) * amp * 0.8;
  v.roll = (v.roll || 0) + (rollT - (v.roll || 0)) * Math.min(1, dt * 2.5);
  // hráč na místě kormidelníka
  const seat = v.type === 'sailboat' ? [0, 2.0] : [-0.42, 0.9];
  const [sx, sz] = carLocal(v, ...seat);
  player.pos.set(sx, v.y + 0.25, sz);
  player.vel.set(0, 0, 0);
  player.onGround = true;
  placeBoatCamera(v);
  Sound.engine(motor && v.engine, motor ? Math.abs(v.spd) / B.maxFwd * 0.8 + Math.max(0, v.thr) * 0.35 + 0.1 : 0);
  if (Math.abs(v.spd) > 0.5 && (slapT -= dt * (0.5 + Math.abs(v.spd) * 0.25)) <= 0) { slapT = 0.6 + Math.random() * 0.5; Sound.burst({ dur: 0.18, f0: 900, f1: 250, q: 0.6, vol: 0.06 + Math.min(0.12, Math.abs(v.spd) * 0.01), type: 'lowpass' }); } // šplouchání o trup
  return Math.abs(v.spd);
}
export function placeBoatCamera(v) {
  if (carCam === 0) {
    const seat = v.type === 'sailboat' ? [0, 2.15] : [-0.42, 1.0], [cx, cz] = carLocal(v, ...seat);
    camera.position.set(cx, v.y + 0.25 + 0.95, cz);
    camera.rotation.set(player.pitch + (v.pitch || 0), v.yaw + clamp(player.yaw, -2.6, 2.6), -(v.roll || 0) * 0.7, 'YXZ');
  } else {
    const yaw = v.yaw + player.yaw, d = v.type === 'sailboat' ? 11 : 8;
    const cx = v.x + Math.sin(yaw) * d, cz = v.z + Math.cos(yaw) * d, cy = Math.max(v.y + 3.2 - player.pitch * 6, terrainH(cx, cz) + 0.6);
    camera.position.set(cx, cy, cz);
    camera.rotation.set(Math.atan2(v.y + 1.4 - cy, d), yaw, 0, 'YXZ');
  }
}
export const boatHorn = (type) => (type === 'sailboat' ? Sound.ring(880, 1.2, 0.1, 0, [1, 2.76]) : (Sound.tone(220, 0.9, 0.18, 'sawtooth'), Sound.tone(277, 0.9, 0.12, 'sawtooth')));
