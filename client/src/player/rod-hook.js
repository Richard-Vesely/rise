// Prut na hráče a tvory: pravé tlačítko s prutem na hráče nebo tvora (do 24 m) ho zahákne (vlasec vede k němu),
// druhé pravé tlačítko ho přitáhne těsně před tebe, i když jsi mezitím prošel portálem do jiné dimenze.
// Přitažení dělá ten, kdo drží svět (zpráva ['pull', 'p'|'m', id, x, y, z], shared/net/room.js pullTarget);
// přitažený hráč dostane ['tp', x, y, z, kdo] (pulledTo níže). Bez vedlejších účinků při načtení.
import * as THREE from 'three';
import { NET } from '../../../shared/net/net.js';
import { others, pullTarget } from '../../../shared/net/room.js';
import { mobs } from '../../../shared/sim/mobs.js';
import { Sound } from '../audio/sound.js';
import { rebuildForest } from '../render/forest.js';
import { sparks } from '../render/particles.js';
import { camera, scene } from '../render/renderer.js';
import { updateEnvironment } from '../render/sky.js';
import { toast } from '../ui/hud.js';
import { heldStack } from './inventory.js';
import { player } from './player.js';

const REACH = 24;
export const hook = { kind: null, id: null, name: '' }; // kind: 'p' hráč (id = pid), 'm' tvor (id = nid / tvor)
let line = null;
const tipPos = () => new THREE.Vector3(0.45, 0.25, -1.4).applyQuaternion(camera.quaternion).add(camera.position);

/** Kde je zaháknutý cíl (střed těla) nebo null, když zmizel. */
function hookedPos() {
  if (hook.kind === 'p') { const q = others.get(hook.id)?.pose; return q && q.alive !== false ? new THREE.Vector3(q.x, q.y + 0.9, q.z) : null; }
  if (hook.kind === 'm') { const m = mobs.find((x) => (!NET.client ? x === hook.id : x.nid === hook.id) && !x.dead); return m ? new THREE.Vector3(m.pos.x, m.pos.y + (m.def?.cy || 0.5), m.pos.z) : null; }
  return null;
}

/** Paprsek z očí: nejbližší hráč nebo tvor do 24 m. Zahákne ho a vrátí true. */
export function tryHook() {
  const o = camera.position, d = new THREE.Vector3();
  camera.getWorldDirection(d);
  let best = null, bt = REACH;
  const test = (cx, cy, cz, r, hit) => {
    const vx = cx - o.x, vy = cy - o.y, vz = cz - o.z, t = vx * d.x + vy * d.y + vz * d.z;
    if (t < 0 || t > bt) return;
    if ((vx - d.x * t) ** 2 + (vy - d.y * t) ** 2 + (vz - d.z * t) ** 2 < r * r) { bt = t; best = hit; }
  };
  for (const P of others.values()) { const q = P.pose; if (q && q.alive !== false) test(q.x, q.y + 0.9, q.z, 0.7, { kind: 'p', id: P.pid, name: P.name }); }
  for (const m of mobs) if (!m.dead) test(m.pos.x, m.pos.y + (m.def?.cy || 0.5), m.pos.z, Math.max(0.6, m.def?.radius || 0.6), { kind: 'm', id: !NET.client ? m : m.nid, name: m.def?.name || 'tvor' });
  if (!best) return false;
  Object.assign(hook, best);
  Sound.swing();
  toast(`Zaháknuto: ${best.name}. Pravé tlačítko = přitáhnout`);
  return true;
}

/** Druhé pravé tlačítko: přitáhnout zaháknutého před sebe. */
export function pullHooked() {
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  const x = player.pos.x + fx * 1.6, y = player.pos.y + 0.2, z = player.pos.z + fz * 1.6;
  const { kind, id, name } = hook;
  hook.kind = null;
  if (line) line.visible = false;
  if (NET.client) NET.req(['pull', kind, kind === 'm' ? id : String(id), x, y, z]);
  else pullTarget('host', kind, id, x, y, z); // hra pro jednoho i hostitel: svět je tady
  sparks.emit(x, y + 0.8, z, [0.7, 0.9, 1], 20, 2, 1.5);
  Sound.burst({ dur: 0.3, f0: 2400, f1: 500, q: 1, vol: 0.25 });
  toast(`Přitáhl jsi: ${name}`);
}

/** Každý snímek: vlasec k zaháknutému; bez prutu v ruce nebo když cíl zmizí, háček se pustí. */
export function updateHook() {
  if (!hook.kind) return;
  const at = heldStack()?.id === 'fishing_rod' ? hookedPos() : null;
  if (!at) { hook.kind = null; if (line) line.visible = false; return; }
  if (!line) {
    line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xdddddd }));
    line.frustumCulled = false;
    scene.add(line);
  }
  line.visible = at.distanceTo(player.pos) < 80; // daleko (jiná dimenze) se vlasec nekreslí, háček drží dál
  if (line.visible) line.geometry.setFromPoints([tipPos(), at]);
}

/** Přitáhl tě někdo prutem (zpráva ['tp', x, y, z, kdo]). */
export function pulledTo(x, y, z, by) {
  if (![x, y, z].every(Number.isFinite) || !player.alive) return;
  const far = Math.hypot(x - player.pos.x, z - player.pos.z) > 60;
  player.pos.set(x, y, z);
  player.vel.set(0, 0, 0);
  if (far) { rebuildForest(x, z, true); updateEnvironment(); } // jiná dimenze nebo daleko: les a obloha podle nového místa
  sparks.emit(x, y + 0.8, z, [0.7, 0.9, 1], 20, 2, 1.5);
  toast(`${by || 'Někdo'} tě přitáhl prutem!`);
}
