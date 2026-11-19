// Spolujezdci: v multiplayeru si další hráč přisedne (F) do vozidla, které někdo řídí. Místo se nikam neukládá:
// kdo kde sedí, poznají ostatní z jeho pozice (pole rd = { id, s } v pozici hráče). Když hráč odejde ze hry, místo se samo uvolní.
// Spolujezdec sedí v modelu vozidla (ten se plynule posouvá podle řidiče), rozhlíží se myší a F vystoupí.
// Jen funkce (nic se nespouští při načtení).
import * as THREE from 'three';
import { others } from '../../../shared/net/room.js';
import { vehicles } from '../../../shared/world/state.js';
import { Sound } from '../audio/sound.js';
import { TOUCH } from '../game/prefs.js';
import { player } from '../player/player.js';
import { holder } from '../render/held-item.js';
import { camera } from '../render/renderer.js';
import { toast } from '../ui/hud.js';
import { placeOutside, vehMeshes } from './car.js';
import { isPlane, kindOf } from './kinds.js';

/** Místa, na kterých už sedí ostatní (podle jejich pozice). */
export function seatsTaken(id) {
  const s = new Set();
  for (const P of others.values()) { const rd = P.pose?.rd; if (rd?.id === id) s.add(rd.s); }
  return s;
}
/** Přisednout jako spolujezdec. Vrátí false, když vozidlo spolujezdce nevozí. */
export function tryRide(id) {
  const v = vehicles.get(id), K = kindOf(v.type);
  if (K.seats.length < 2) return false;
  const taken = seatsTaken(id);
  for (let s = 1; s < K.seats.length; s++) {
    if (taken.has(s)) continue;
    player.riding = { id, s };
    player.sitting = null;
    holder.visible = false;
    player.yaw = 0; // rozhlížení je relativní k vozidlu
    player.pitch = -0.05;
    player.vel.set(0, 0, 0);
    Sound.place();
    toast(`Jedeš jako spolujezdec (${K.name}) · ${TOUCH ? 'rozhlížíš se tahem prstu · tlačítko Vystoupit' : 'myší se rozhlížíš · F = vystoupit'}`);
    return true;
  }
  toast(`${K.name} je plné`);
  return true;
}
export function leaveRide() {
  const r = player.riding, v = r && vehicles.get(r.id), m = r && vehMeshes.get(r.id);
  if (v && isPlane(v.type) && !v.ground) { toast('Za letu vystoupit nejde'); return; }
  player.riding = null;
  holder.visible = true;
  const yaw = m?.yaw ?? v?.yaw ?? 0;
  if (v) placeOutside(m ? { ...v, x: m.group.position.x, y: m.group.position.y, z: m.group.position.z, yaw } : v);
  player.vel.set(0, 0, 0);
  player.yaw += yaw;
  Sound.place();
}
const pos = new THREE.Vector3(), q = new THREE.Quaternion(), look = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ');
/** Každý snímek (po posunutí modelů): spolujezdec sedí na svém místě, kamera z jeho očí. */
export function placeRider() {
  const r = player.riding, v = vehicles.get(r.id), m = vehMeshes.get(r.id);
  if (!v || !m) { player.riding = null; holder.visible = true; toast('Vozidlo tu už není'); return; }
  const K = kindOf(v.type), s = K.seats[r.s] || K.seats[1];
  m.group.updateMatrixWorld();
  player.pos.copy(m.group.localToWorld(pos.set(s[0], s[1], s[2])));
  player.vel.set(0, 0, 0);
  player.onGround = true;
  camera.position.copy(m.group.localToWorld(pos.set(s[0], s[1] + K.eye, s[2])));
  player.yaw = Math.max(-2.6, Math.min(2.6, player.yaw));
  m.group.getWorldQuaternion(q);
  camera.quaternion.copy(q).multiply(look.setFromEuler(e.set(player.pitch, player.yaw, 0)));
}
