// Vozidla: auto (model a jízda) a co mají všechna vozidla společné: nastoupit a vystoupit, zobrazení, kamera, nitro.
// Druhy vozidel jsou v kinds.js; kolo v bike.js, lodě v boat.js, letadla v plane.js, spolujezdci v passengers.js,
// okno vozidla a ukazatele v vehicle-ui.js.
import '../world/fishing.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { NET } from '../../../shared/net/net.js';
import { others } from '../../../shared/net/room.js';
import { mobs } from '../../../shared/sim/mobs.js';
import { clamp, randInt, wrapAngle } from '../../../shared/util.js';
import { solidAny, voxFloor } from '../../../shared/world/collision.js';
import { PH, PW } from '../../../shared/world/constants.js';
import { waterAt } from '../../../shared/world/nature.js';
import { vehicles } from '../../../shared/world/state.js';
import { terrainH } from '../../../shared/world/terrain.js';
import { groundHeight } from '../../../shared/world/voxels.js';
import { Sound } from '../audio/sound.js';
import { MP } from '../game/boot.js';
import { gameTime } from '../game/loop.js';
import { TOUCH } from '../game/prefs.js';
import { hitMob } from '../mobs/mobs.js';
import { clearTarget, groundRing, outline, preview, target } from '../player/interaction.js';
import { collidesBlocks, input, keys, player } from '../player/player.js';
import { tmpV } from '../render/daylight.js';
import { forestColliders } from '../render/forest.js';
import { holder } from '../render/held-item.js';
import { sparks } from '../render/particles.js';
import { U, camera, scene } from '../render/renderer.js';
import { $ } from '../ui/dom.js';
import { toast } from '../ui/hud.js';
import { buildCarModel } from './car-model.js';
import { animateLook, exhaustOf, lookKey } from './veh-look.js';
import { bell, buildBikeModel, placeBikeCamera, rideBike, setGear } from './bike.js';
import { boatHorn, buildBoatModel, placeBoatCamera, sailBoat, updateWake } from './boat.js';
import { NITRO_TIME, isBoat, isPlane, kindOf, powerMul, trunkSize } from './kinds.js';
import { leaveRide, placeRider, tryRide } from './passengers.js';
import { PLANE, flyPlane, placePlaneCamera } from './plane.js';
import { buildPlaneModel } from './plane-model.js';
import { vehicleHud } from './vehicle-ui.js';
export { renderCarUI } from './vehicle-ui.js';
export { setGear };

// ============================================================ vozidla: auto
// Stav vozidla se ukládá a v multiplayeru synchronizuje jako malá mapa (vehicles). Kdo řídí, počítá fyziku u sebe
// a polohu posílá s pozicí hráče (12× za sekundu); ostatní vozidlo plynule dopočítávají.
export const CAR = { len: 4.2, wid: 1.9, wb: 2.6, track: 1.6, maxFwd: 22, maxRev: 6, accel: 7, brake: 16, steerMax: 0.55, fuelMax: 40, step: 0.65 };
export const myDriverId = () => (MP ? NET.pid : 'me');
/** Rozměry a vlastnosti podle druhu vozidla (kinds.js). */
export const vehDim = kindOf;
const remoteVeh = new Map(); // id vozidla -> poslední poloha od hráče, který ho řídí (neukládá se)
export const carWarn = { t: 0 }; // odpočet do dalšího upozornění (všechna vozidla)
export let carCam = 0;
export function toggleCarCam() { carCam = 1 - carCam; } // 0 = z první osoby, 1 = ze třetí osoby
export const vehMeshes = new Map(); // id vozidla -> model ({ group, wheels, pivots, … })
// Jediné reflektorové světlo pro vozidlo, které řídíš (stálý počet světel = žádné překompilování shaderů)
const carSpot = new THREE.SpotLight(0xfff2d0, 0, 45, 0.55, 0.5, 1.2);
scene.add(carSpot, carSpot.target);

// Barvy nových vozidel (garáž je umí přelakovat na kteroukoli z PAINTS)
const CAR_COLORS = [0xc82a2a, 0x2a5ab0, 0x2a8a3a, 0xe8c030, 0xe8e8e8, 0x2a2a30, 0xe07a20];
const COLORS = { plane: [0x2a5ab0, 0xc82a2a, 0x2a2a30, 0xe07a20], seaplane: [0x2a6ab0, 0xe8c030, 0xc82a2a, 0x2ab0a0], motorboat: [0xe8e8e8, 0x2a5ab0, 0xc82a2a, 0x2a2a30], sailboat: [0x2a5ab0, 0x2ab0a0, 0x2a8a3a, 0xc82a2a] };
function buildModel(v) {
  if (isPlane(v.type)) return buildPlaneModel(v.color ?? 0x8a2a22, v.type === 'seaplane', v);
  if (v.type === 'bike') return buildBikeModel(v.color ?? 0xd83a2a, v);
  if (isBoat(v.type)) return buildBoatModel(v.type, v.color ?? 0xe8e8e8, v);
  return buildCarModel(v.color ?? 0xc82a2a, v);
}

// ---------- vytvoření, nastoupení, vystoupení
export function spawnVehicle(type, x, z, yaw) {
  const id = NET.uid(), cols = COLORS[type] || CAR_COLORS;
  const y = floorAt(x, z, terrainH(x, z) + 1);
  vehicles.set(id, { type, x, y, z, yaw, pitch: isPlane(type) ? PLANE.groundPitch : 0, roll: 0, spd: 0, steer: 0, fuel: 0, bat: 0, slots: Array(1 + trunkSize(type)).fill(null), lights: false, driver: null,
    color: cols[randInt(0, cols.length - 1)], ...(isPlane(type) ? { vx: 0, vy: 0, vz: 0, thr: 0, ground: true } : {}), ...(type === 'bike' ? { gear: 2 } : {}), ...(isBoat(type) ? { thr: 0 } : {}) });
  return id;
}
const HELP = {
  plane: ['Mezerník / Shift = plyn · S nos nahoru, W dolů · A/D náklon (na zemi řízení) · N nitro · L světla · V kamera · F vystoupit', 'Plyn + / − · joystick = knipl (dolů = nos nahoru, do stran = náklon) · kamera, vystoupit'],
  seaplane: ['Hydroplán: rozjeď se po vodě (Mezerník = plyn), vzlétneš kolem 76 km/h · S nos nahoru, W dolů · A/D náklon · N nitro · F vystoupit', 'Plyn + / − · joystick = knipl · na vodě se rozjeď, vzlétneš kolem 76 km/h'],
  bike: ['W šlapat · S / Mezerník brzda · A/D řídit · 1/2/3 převod · B zvonek · L světlo · V kamera · F sesednout', 'Joystick = šlapat a řídit · tlačítka: brzda, převod, zvonek, kamera, sesednout'],
  motorboat: ['W/S plyn a zpátečka · A/D kormidlo · N nitro · L světla · B houkačka · V kamera · F vystoupit (na břehu)', 'Joystick = plyn a kormidlo · tlačítka: nitro, světla, houkačka, kamera, vystoupit'],
  sailboat: ['W vytáhnout plachtu, S svinout · A/D kormidlo · plachta se natočí sama · přímo proti větru to nejde – pluj šikmo (křižuj)! · V kamera · F vystoupit', 'Joystick nahoru = plachta, do stran = kormidlo · proti větru pluj šikmo'],
  car: ['W/S plyn a brzda · A/D zatáčení · Mezerník brzda · N nitro · L světla · B klakson · V kamera · F vystoupit', 'Joystick = jízda a zatáčení · tlačítka: brzda, světla, klakson, kamera, vystoupit'],
};
export function enterVehicle(id) {
  const v = vehicles.get(id);
  if (!v) return;
  if (v.driver && v.driver !== myDriverId()) { if (!tryRide(id)) toast(`${kindOf(v.type).name}: už tu někdo sedí`); return; }
  v.driver = myDriverId();
  player.vehicle = id;
  player.sitting = null;
  player.yaw = 0; // ve voze je natočení kamery relativní k vozidlu
  player.pitch = -0.08;
  holder.visible = false;
  v.engine = false;
  nitro.t = 0;
  Sound.place();
  toast((HELP[v.type] || HELP.car)[TOUCH ? 1 : 0]);
}
// Vystoupí vedle vozidla: na volné místo, z lodi nejradši na břeh (jinak do vody, kde se plave)
export function placeOutside(v) {
  const K = kindOf(v.type), c = Math.cos(v.yaw), s = Math.sin(v.yaw), spots = [];
  for (const side of [-1, 1]) spots.push([side * K.exit, 0]);
  spots.push([0, -(K.len / 2 + 0.8)], [0, K.len / 2 + 0.8]);
  if (isBoat(v.type) || v.type === 'seaplane') for (let r = 2; r <= 7; r += 1) for (let a = 0; a < 12; a++) spots.push([Math.cos(a * Math.PI / 6) * (K.wid / 2 + r), Math.sin(a * Math.PI / 6) * (K.len / 2 + r * 0.6)]);
  let first = null;
  for (const [lx, lz] of spots) {
    const x = v.x + c * lx + s * lz, z = v.z - s * lx + c * lz, y = floorAt(x, z, v.y + 1);
    if (!isFinite(y)) continue;
    player.pos.set(x, y + 0.02, z);
    if (collidesBlocks(player.pos)) continue;
    if (waterAt(x, y + 0.5, z) === null) return; // suchá zem
    first ||= [x, y, z];
  }
  if (first) player.pos.set(first[0], first[1] + 0.02, first[2]);
}
export function exitVehicle() {
  if (player.riding) { leaveRide(); return; }
  const v = vehicles.get(player.vehicle);
  // z letadla se vystupuje jen na zemi (nebo na vodě), když stojí
  if (v && isPlane(v.type) && player.alive && (!v.ground || Math.hypot(v.vx || 0, v.vz || 0) > 3)) { toast('Vystoupit můžeš, až letadlo stojí na zemi nebo na vodě'); return; }
  player.vehicle = null;
  holder.visible = true;
  Sound.engine?.(false, 0);
  nitro.t = 0;
  if (!v) return;
  v.driver = null;
  v.engine = false;
  v.spd = 0;
  v.pd = 0;
  if (isBoat(v.type) && v.type === 'motorboat') v.thr = 0;
  placeOutside(v);
  player.vel.set(0, 0, 0);
  player.yaw = v.yaw + player.yaw;
  Sound.place();
}

// ---------- nitro (náplně z garáže): N nebo dotykové tlačítko, 3 s plného výkonu
export const nitro = { t: 0 };
export const nitroOn = () => nitro.t > 0;
export function useNitro() {
  const v = vehicles.get(player.vehicle);
  if (!v || !kindOf(v.type).mods.includes('nitro')) return;
  if (nitro.t > 0) return;
  if (!(v.mods?.nitro > 0)) { toast('Nitro je prázdné – naplň ho v garáži (láhev Nitro)'); return; }
  v.mods = { ...v.mods, nitro: v.mods.nitro - 1 };
  nitro.t = NITRO_TIME;
  player.shake = 0.25;
  Sound.burst({ dur: 0.9, f0: 300, f1: 2400, q: 0.6, vol: 0.35 }); Sound.burst({ dur: 1.4, f0: 900, f1: 200, q: 0.5, vol: 0.2, type: 'lowpass', delay: 0.2 });
  toast(`🔥 NITRO! (zbývá ${v.mods.nitro})`);
}

// ---------- fyzika jízdy
// Podlaha pod bodem: terén (když není vykopaný) nebo horní stěna bloku / podzemí; jen do výšky schodu nad yRef
export function floorAt(x, z, yRef, step = CAR.step) {
  const g = groundHeight(x, z), vf = voxFloor(x, yRef + 0.2, z);
  return Math.max(isFinite(g) && g <= yRef + step ? g : -Infinity, vf);
}
export const carLocal = (v, lx, lz) => { const c = Math.cos(v.yaw), s = Math.sin(v.yaw); return [v.x + c * lx + s * lz, v.z - s * lx + c * lz]; };
// Narazí karoserie (body po obvodu ve výšce 0,5–1,5 m) do bloku, stromu nebo balvanu?
export function carHits(v, x, z, yaw) {
  const t = { ...v, x, z, yaw };
  for (const [lx, lz] of [[-0.9, -2.05], [0.9, -2.05], [-0.9, 2.05], [0.9, 2.05], [-0.95, 0], [0.95, 0], [0, -2.1], [0, 2.1]]) {
    const [px, pz] = carLocal(t, lx, lz);
    for (const dy of [0.6, 1.3]) if (solidAny(Math.floor(px), Math.floor(v.y + dy), Math.floor(pz))) return true;
    if (v.y > terrainH(px, pz) - 2) for (const c of forestColliders) if ((px - c.x) ** 2 + (pz - c.z) ** 2 < (c.r + 0.15) ** 2) return true;
  }
  return false;
}
export let hornN = 0, carHitT = 0;
export function driveVehicle(dt) {
  const v = vehicles.get(player.vehicle);
  if (!v) { exitVehicle(); return 0; }
  if (target) { clearTarget(); outline.visible = groundRing.visible = preview.visible = false; $('targetLabel').innerHTML = ''; $('progress').style.opacity = 0; } // za volantem se nemíří
  if (nitro.t > 0) nitro.t = Math.max(0, nitro.t - dt);
  if (isPlane(v.type)) return flyPlane(v, dt);
  if (v.type === 'bike') return rideBike(v, dt);
  if (isBoat(v.type)) return sailBoat(v, dt);
  const joy = input.joy, off = !!v.mods?.offroad, boost = nitro.t > 0;
  const fwd = clamp((keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) + (joy ? -joy.y : 0), -1, 1);
  const steerIn = clamp((keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) + (joy ? -joy.x : 0), -1, 1);
  const hand = keys.has('Space');
  // startování: palivo + nabitá baterie
  if (!v.engine && Math.abs(fwd) > 0.2) {
    if (v.fuel <= 0) { if ((carWarn.t -= dt) <= 0) { carWarn.t = 3; toast('Došlo palivo – natankuj z kanystru (pravé tl. s kanystrem na auto)'); } }
    else if (!(v.slots[0]?.id === 'car_battery' && v.bat > 0)) { if ((carWarn.t -= dt) <= 0) { carWarn.t = 3; toast('Auto nenastartuje – do kufru vlož nabitou autobaterii'); } }
    else { v.engine = true; v.bat = Math.max(0, v.bat - 2); Sound.burst({ dur: 0.6, f0: 300, f1: 120, q: 1.5, vol: 0.3, type: 'lowpass' }); }
  }
  if (v.engine && v.fuel <= 0) { v.engine = false; toast('Motor zhasl – došlo palivo'); }
  // zrychlení, brzdy, zpátečka, odpor; turbo a nitro z garáže přidají výkon
  const thr = v.engine ? fwd : 0, maxF = CAR.maxFwd * (v.mods?.engine ? 1.25 : 1) * (boost ? 1.35 : 1), acc = CAR.accel * powerMul(v, boost);
  if (hand) v.spd -= Math.sign(v.spd) * Math.min(Math.abs(v.spd), CAR.brake * 1.2 * dt);
  else if (thr > 0) v.spd = v.spd < -0.3 ? Math.min(0, v.spd + CAR.brake * dt) : Math.min(maxF, v.spd + acc * thr * (1 - v.spd / (maxF * 1.15)) * dt); // pomalé couvání ze svahu plyn přetlačí (jinak by se auto do kopce nerozjelo)
  else if (thr < 0) v.spd = v.spd > 0.3 ? Math.max(0, v.spd - CAR.brake * dt) : Math.max(-CAR.maxRev, v.spd + CAR.accel * 0.6 * thr * dt);
  else if (fwd < 0 && v.spd > 0) v.spd = Math.max(0, v.spd - CAR.brake * dt); // brzda funguje i s vypnutým motorem
  v.spd *= 1 - Math.min(1, (0.25 + Math.abs(v.spd) * 0.012) * dt); // valivý a vzdušný odpor
  if (Math.abs(v.spd) < 0.02 && !thr) v.spd = 0;
  // svah: auto do kopce zpomaluje, z kopce zrychluje (terénní pneumatiky do kopce míň)
  const sl = Math.sin(v.pitch || 0);
  v.spd -= sl * 9.8 * dt * (off && sl > 0 ? 0.3 : 0.6);
  // natáčení kol a zatáčení (kolo se otáčí kolem zadní nápravy)
  v.steer += (steerIn * CAR.steerMax * (1 - Math.min(0.6, Math.abs(v.spd) / 40)) - v.steer) * Math.min(1, dt * 6);
  const yawRate = (v.spd * Math.tan(v.steer)) / CAR.wb;
  const nyaw = v.yaw + yawRate * dt;
  const nx = v.x - Math.sin(nyaw) * v.spd * dt, nz = v.z - Math.cos(nyaw) * v.spd * dt;
  // kola: výška podlahy pod každým kolem
  const step = off ? 0.9 : CAR.step;
  const wy = [[-0.95, -1.3], [0.95, -1.3], [-0.95, 1.3], [0.95, 1.3]].map(([lx, lz]) => { const [px, pz] = carLocal({ x: nx, z: nz, yaw: nyaw }, lx, lz); return floorAt(px, pz, v.y, step); });
  const blockedStep = wy.some((h) => !isFinite(h)) || (v.spd > 0 ? Math.max(wy[0], wy[1]) : Math.max(wy[2], wy[3])) > v.y + step;
  if (blockedStep || carHits(v, nx, nz, nyaw)) {
    if (Math.abs(v.spd) > 4 && (carHitT -= dt) <= 0) { carHitT = 0.5; Sound.burst({ dur: 0.25, f0: 500, f1: 120, q: 1, vol: 0.5, type: 'lowpass' }); player.shake = 0.3; }
    v.spd *= -0.25;
  } else { v.x = nx; v.z = nz; v.yaw = nyaw; }
  // výška, náklon a pád
  const fy = Math.max(...wy.map((h) => (isFinite(h) ? h : -99)));
  const avg = wy.reduce((s, h) => s + (isFinite(h) ? h : fy), 0) / 4;
  if (avg < v.y - 0.08) { v.vy = (v.vy || 0) - 18 * dt; v.y = Math.max(avg, v.y + v.vy * dt); } else { v.y += (avg - v.y) * Math.min(1, dt * 12); v.vy = 0; }
  const f = (wy[0] + wy[1]) / 2, r = (wy[2] + wy[3]) / 2, l = (wy[0] + wy[2]) / 2, rt = (wy[1] + wy[3]) / 2;
  v.pitch = isFinite(f - r) ? clamp(Math.atan2(f - r, CAR.wb), -0.6, 0.6) : 0;
  v.roll = isFinite(l - rt) ? clamp(Math.atan2(l - rt, CAR.track), -0.5, 0.5) : 0;
  if (waterAt(v.x, v.y + 0.3, v.z) !== null) v.spd *= 1 - Math.min(1, dt * (off ? 0.8 : 2)); // voda brzdí
  // palivo a baterie: motor žere palivo podle plynu a dobíjí baterii; světla s vypnutým motorem vybíjejí
  if (v.engine) { v.fuel = Math.max(0, v.fuel - (0.012 + Math.abs(thr) * 0.06) * dt); v.bat = Math.min(100, v.bat + 0.5 * dt); }
  else if (v.lights) v.bat = Math.max(0, v.bat - 0.4 * dt);
  if (v.lights && v.bat <= 0 && !v.engine) { v.lights = false; toast('Baterie je vybitá – světla zhasla'); }
  if (v.slots[0]?.id === 'car_battery' && v.bat <= 0 && !v.engine) v.slots[0] = { id: 'car_battery_empty', n: 1 };
  // srážka s tvorem
  if (Math.abs(v.spd) > 5) for (const m of mobs) {
    if (m.dead || (m.carT || 0) > gameTime) continue;
    const [fx, fz] = carLocal(v, 0, -Math.sign(v.spd) * 2);
    if (Math.hypot(m.pos.x - fx, m.pos.z - fz) < 1.4 + m.def.radius) { m.carT = gameTime + 0.6; hitMob(m, Math.abs(v.spd) * 0.8, v.yaw); }
  }
  // hráč sedí v autě (pozice kvůli načítání okolí, tvorům a síti)
  const [sx, sz] = carLocal(v, -0.42, 0.35);
  player.pos.set(sx, v.y + 0.6, sz);
  player.vel.set(0, 0, 0);
  player.onGround = true;
  placeCarCamera(v);
  Sound.engine(v.engine, Math.abs(v.spd) / CAR.maxFwd + Math.max(0, thr) * 0.25 + (boost ? 0.3 : 0));
  return Math.abs(v.spd);
}
const camE = new THREE.Euler();
export function placeCarCamera(v) {
  if (isPlane(v.type)) return placePlaneCamera(v);
  if (v.type === 'bike') return placeBikeCamera(v);
  if (isBoat(v.type)) return placeBoatCamera(v);
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  if (carCam === 0) { // oči řidiče nad sedadlem, pod střechou (i když auto stojí ve svahu nebo se naklání)
    camera.position.set(-0.42, 1.42, 0.62).applyEuler(camE.set(v.pitch || 0, v.yaw, -(v.roll || 0), 'YXZ')).add(tmpV.set(v.x, v.y, v.z));
    e.set(player.pitch + (v.pitch || 0), v.yaw + clamp(player.yaw, -2.4, 2.4), 0);
  } else {
    const yaw = v.yaw + player.yaw, d = 7.5;
    let cx = v.x + Math.sin(yaw) * d, cz = v.z + Math.cos(yaw) * d, cy = v.y + 2.6 - player.pitch * 6;
    cy = Math.max(cy, terrainH(cx, cz) + 0.6);
    camera.position.set(cx, cy, cz);
    e.set(Math.atan2(v.y + 1.2 - cy, d), yaw, 0);
  }
  camera.quaternion.setFromEuler(e);
  camera.rotation.set(e.x, e.y, e.z);
}
// Klakson / zvonek / lodní houkačka podle vozidla
const hornOf = (type) => (type === 'bike' ? bell() : isBoat(type) ? boatHorn(type) : Sound.horn());
export function honk() { const v = vehicles.get(player.vehicle); if (!v || isPlane(v.type)) return; hornN++; hornOf(v.type); }
/** L: světla (auto potřebuje nabitou baterii nebo běžící motor, kolo má dynamo). */
export function toggleLights(v) {
  if (v.type === 'car' && !v.lights && !v.engine && !(v.slots[0]?.id === 'car_battery' && v.bat > 0)) { toast('Světla nesvítí – vybitá autobaterie'); return; }
  if (v.type === 'sailboat') { toast('Plachetnice nemá světla'); return; }
  v.lights = !v.lights;
}
/** Poloha vozidla, které řídím, do pozice hráče (posílá se ostatním 12× za sekundu). */
export function vehPose() {
  const v = vehicles.get(player.vehicle);
  if (!v) return null;
  const r2 = (x) => Math.round(x * 100) / 100;
  return { id: player.vehicle, x: r2(v.x), y: r2(v.y), z: r2(v.z), yaw: r2(v.yaw), pitch: r2(v.pitch || 0), roll: r2(v.roll || 0), spd: r2(v.spd), steer: r2(v.steer), thr: r2(v.thr || 0), lights: v.lights ? 1 : 0,
    ...(v.boom ? { bm: r2(v.boom) } : {}), ...(v.lf ? { lf: 1 } : {}), ...(v.pd ? { pd: 1 } : {}), ...(nitro.t > 0 ? { nb: 1 } : {}) };
}

// ---------- zobrazení všech vozidel (i řízených ostatními hráči)
const vehHud = document.createElement('div');
vehHud.id = 'vehHud';
document.body.append(vehHud);
export function updateVehicles(dt) {
  const me = myDriverId();
  // vozidla řízená ostatními: poloha z jejich pozice (12× za sekundu), plynule
  for (const P of others.values()) {
    const q = P.pose?.veh;
    if (!q) continue;
    const v = vehicles.get(q.id);
    if (!v) continue;
    remoteVeh.set(q.id, q);
    if (P.hornSeen !== undefined && P.pose.hn > P.hornSeen && Math.hypot(q.x - player.pos.x, q.z - player.pos.z) < 60) hornOf(v.type);
    P.hornSeen = P.pose.hn;
  }
  for (const [id, v] of vehicles) {
    let m = vehMeshes.get(id);
    if (m && m.look !== lookKey(v)) { scene.remove(m.group); vehMeshes.delete(id); m = null; } // přelakováno nebo vylepšeno v garáži
    if (!m) { m = buildModel(v); m.color = v.color; m.look = lookKey(v); scene.add(m.group); vehMeshes.set(id, m); m.group.position.set(v.x, v.y, v.z); m.group.rotation.y = v.yaw; m.spin = 0; }
    const remote = v.driver && v.driver !== me ? remoteVeh.get(id) || null : null;
    const src = remote || v;
    const k = remote ? 1 - Math.exp(-dt * 10) : 1;
    m.group.position.lerp(tmpV.set(src.x, src.y, src.z), k);
    m.yaw = m.yaw === undefined ? src.yaw : m.yaw + wrapAngle(src.yaw - m.yaw) * k;
    m.group.rotation.set(0, 0, 0);
    m.group.rotateY(m.yaw);
    m.group.rotateX(src.pitch || 0); // předek výš = kladný náklon
    m.group.rotateZ(-(src.roll || 0));
    m.spin += ((src.spd || 0) / (v.type === 'bike' ? 0.34 : 0.38)) * dt;
    for (const w of m.wheels) w.rotation.x = -m.spin;
    if (m.prop && !isBoat(v.type)) m.prop.rotation.z += (src.thr || 0) * 70 * dt + (src.thr > 0 ? 6 * dt : 0); // vrtule
    for (const p of m.pivots) p.rotation.y = src.steer || 0;
    m.update?.(src, dt, v, !!v.driver);
    const lights = remote ? remote.lights : v.lights, boost = remote ? remote.nb : v.driver === me && nitro.t > 0;
    animateLook(m, src, lights, !!remote || v.engine, boost, dt); // světla, podsvícení, trysky
    if (boost && Math.random() < dt * 40) { const p = m.group.localToWorld(tmpV.set(...exhaustOf(m, kindOf(v.type).len))); sparks.emit(p.x, p.y, p.z, [0.3, 0.7, 1], 3, 2.5, 0.4); } // nitro: modré plameny
    if (v.slots?.[0]?.id && v.batId !== v.slots[0].id) { v.bat = v.slots[0].id === 'car_battery' ? 100 : 0; v.batId = v.slots[0].id; } // nově vložená baterie
    if (!v.slots?.[0]) v.batId = null;
  }
  for (const [id, m] of vehMeshes) if (!vehicles.has(id)) { scene.remove(m.group); vehMeshes.delete(id); }
  updateWake(dt);
  if (player.riding) placeRider(dt); // spolujezdec sedí v modelu vozidla
  const hud = player.vehicle || player.riding?.id;
  const hv = vehicles.get(hud);
  vehHud.style.display = hv ? 'block' : 'none';
  document.body.classList.toggle('in-veh', !!hv); // řádek vozidla je na místě nápovědy kláves: nápověda se schová
  if (hv) { const html = vehicleHud(hv, !!player.riding); if (vehHud.innerHTML !== html) vehHud.innerHTML = html; }
  // reflektor vozidla, ve kterém sedíš
  const v = vehicles.get(player.vehicle);
  if (v && v.lights && !isPlane(v.type)) {
    const front = -kindOf(v.type).len / 2;
    const [hx, hz] = carLocal(v, 0, front), [tx, tz] = carLocal(v, 0, front - 12);
    const hy = v.y + (v.type === 'bike' ? 0.86 : v.type === 'motorboat' ? 0.5 : 0.9);
    carSpot.position.set(hx, hy, hz);
    carSpot.target.position.set(tx, hy - 1.4, tz);
    carSpot.intensity = v.type === 'bike' ? 25 : 60;
    U.headPos.value.set(hx, hy, hz);
    U.headDir.value.set(tx - hx, -1.4, tz - hz).normalize();
    U.headOn.value = 1;
  } else { carSpot.intensity = 0; U.headOn.value = 0; }
}
/** Místo k sezení ve světě (podle modelu vozidla): poloha nohou hráče. Vrátí false, když vozidlo není. */
export function seatWorld(id, seat, out) {
  const m = vehMeshes.get(id), v = vehicles.get(id);
  if (!m || !v) return false;
  const s = kindOf(v.type).seats[seat] || kindOf(v.type).seats[0];
  m.group.updateMatrixWorld();
  m.group.localToWorld(out.set(s[0], s[1], s[2]));
  return true;
}
// Hráč pěšky se do vozidla nepropadne: odsune se z obrysu
export function vehiclePush(p) {
  for (const v of vehicles.values()) {
    if (v.driver === myDriverId()) continue;
    const dx = p.x - v.x, dz = p.z - v.z;
    if (dx * dx + dz * dz > 9 || p.y > v.y + 1.6 || p.y + PH < v.y + 0.2) continue;
    const c = Math.cos(v.yaw), s = Math.sin(v.yaw), lx = c * dx - s * dz, lz = s * dx + c * dz;
    const dm = vehDim(v.type), hx = dm.push / 2 + PW, hz = dm.len / 2 + PW;
    if (Math.abs(lx) >= hx || Math.abs(lz) >= hz) continue;
    let nx = lx, nz = lz;
    if (hx - Math.abs(lx) < hz - Math.abs(lz)) nx = Math.sign(lx || 1) * hx; else nz = Math.sign(lz || 1) * hz;
    p.x = v.x + c * nx + s * nz;
    p.z = v.z - s * nx + c * nz;
  }
}
// Paprsek na vozidlo (míření): kvádr v souřadnicích vozidla (u lodí sahá i pod hladinu)
export function rayVehicle(o, d, maxT) {
  let best = null;
  for (const [id, v] of vehicles) {
    if (id === player.vehicle || id === player.riding?.id || (v.x - o.x) ** 2 + (v.z - o.z) ** 2 > 100) continue;
    const c = Math.cos(v.yaw), s = Math.sin(v.yaw);
    const lo = [c * (o.x - v.x) - s * (o.z - v.z), o.y - v.y, s * (o.x - v.x) + c * (o.z - v.z)], ld = [c * d.x - s * d.z, d.y, s * d.x + c * d.z];
    const dm = vehDim(v.type), mn = [-dm.wid / 2, isBoat(v.type) ? -0.4 : 0.15, -dm.len / 2], mx = [dm.wid / 2, dm.h, dm.len / 2];
    let t0 = 0, t1 = maxT;
    for (let a = 0; a < 3 && t0 <= t1; a++) {
      if (Math.abs(ld[a]) < 1e-9) { if (lo[a] < mn[a] || lo[a] > mx[a]) t0 = Infinity; continue; }
      let ta = (mn[a] - lo[a]) / ld[a], tb = (mx[a] - lo[a]) / ld[a];
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    }
    if (t0 <= t1 && t0 < maxT && (!best || t0 < best.t)) best = { t: t0, id };
  }
  return best;
}
Object.assign(Sound, {
  // Motor: pila přes dolní propust, výška tónu podle otáček
  engine(on, rpm) {
    const c = this.ctx;
    if (!c) return;
    if (!this.eng) {
      const o = c.createOscillator(), f = c.createBiquadFilter(), gn = c.createGain();
      o.type = 'sawtooth';
      f.type = 'lowpass';
      gn.gain.value = 0;
      o.connect(f).connect(gn).connect(this.master);
      o.start();
      this.eng = { o, f, gn };
    }
    const t = c.currentTime;
    this.eng.gn.gain.setTargetAtTime(on ? 0.07 : 0, t, 0.15);
    this.eng.o.frequency.setTargetAtTime(36 + rpm * 95, t, 0.1);
    this.eng.f.frequency.setTargetAtTime(220 + rpm * 600, t, 0.1);
  },
  horn() { this.tone(415, 0.5, 0.16, 'square'); this.tone(523, 0.5, 0.12, 'square'); },
});
