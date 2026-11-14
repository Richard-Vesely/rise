// Vychytávky z obchodu za zlato (data shared/data/shop.js): pravé tlačítko s předmětem v ruce.
//   trojzubec = hod (letí a zraní, do ruky se vrátí sám) · křídla = 30 s letu · plamenomet = drž pravé tl. ·
//   lékárnička = vyléčí do plna. Světelné meče jsou obyčejné meče (silné), svítí v ruce (render/held-item.js).
// Bez vedlejších účinků při načtení.
import { ITEMS } from '../../../shared/data/index.js';
import { toolSound } from '../audio/tool-sounds.js';
import { Sound } from '../audio/sound.js';
import { sparks } from '../render/particles.js';
import { toast } from '../ui/hud.js';
import { wearHeld } from './durability.js';
import { heldStack, removeItem } from './inventory.js';
import { lightning, shot } from './magic.js';
import { pickTarget } from './targeting.js';
import { groundHeight } from '../../../shared/world/voxels.js';
import { camera } from '../render/renderer.js';
import * as THREE from 'three';
import { input, player } from './player.js';

let prevRmb = false, cd = 0, flameT = 0;

/** Každý snímek (interaction.js): vrací true, když pravé tlačítko patří vychytávce v ruce. */
export function updateGadgets(dt, special) {
  const fresh = input.rmb && !prevRmb;
  prevRmb = input.rmb;
  cd -= dt;
  const id = heldStack()?.id, d = ITEMS[id];
  if (!d || !(d.throw || d.wings || d.flame || d.medkit || d.fireball || d.jetpack || d.teleport || d.ray || d.hammer || d.speed || d.grenade || d.firework || d.grapple) || special) return false;
  if (d.throw && fresh && cd <= 0) { // trojzubec
    cd = d.throw.cd;
    shot({ color: 0x38c8e8, size: 0.8, speed: 42, ttl: 1.6, dmg: d.throw.dmg, trail: 1 });
    toolSound('whoosh', 1);
    wearHeld(2);
  } else if (d.fireball && fresh && cd <= 0) { // ohnivá koule z pekla: hodí se a spotřebuje
    cd = 0.5;
    shot({ color: 0xff7a2a, size: 0.9, speed: 30, ttl: 2, dmg: d.fireball.dmg, trail: 1 });
    removeItem(id, 1);
    toolSound('whoosh', 1);
  } else if (d.wings && fresh) {
    player.flyT = Math.max(player.flyT || 0, d.wings);
    sparks.emit(player.pos.x, player.pos.y + 1.2, player.pos.z, [1, 1, 1], 24, 2, 2);
    toolSound('whoosh', 1);
    toast(`Křídla: ${d.wings} s létání! Mezerník = nahoru, Shift = dolů`);
  } else if (d.flame && input.rmb) { // plamenomet: proud ohně, dokud držíš
    flameT -= dt;
    while (flameT <= 0) {
      flameT += 0.05;
      shot({ color: Math.random() < 0.5 ? 0xff7a2a : 0xffc040, size: 0.35, speed: 24, ttl: d.flame.range / 24, dmg: d.flame.dmg, trail: 1, spread: 0.12, grow: 4 });
    }
    if (Math.random() < dt * 8) { Sound.burst({ dur: 0.25, f0: 900, f1: 500, q: 0.6, vol: 0.12, type: 'lowpass' }); wearHeld(1); }
  } else if (d.jetpack && input.rmb) { // raketový batoh: dokud držíš, letíš nahoru
    player.vel.y = Math.max(player.vel.y, 8);
    player.onGround = false;
    if (Math.random() < 0.6) sparks.emit(player.pos.x, player.pos.y + 0.6, player.pos.z, [1, 0.6, 0.2], 3, 1.5, -1);
    if (Math.random() < dt * 4) { Sound.burst({ dur: 0.3, f0: 600, f1: 300, q: 0.5, vol: 0.12, type: 'lowpass' }); wearHeld(1); }
  } else if (d.teleport && fresh) { // teleportační koule: přenese tě, kam se díváš
    const t = pickTarget(d.teleport), dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const to = t?.point ? new THREE.Vector3(...t.point).addScaledVector(dir, -0.7) : camera.position.clone().addScaledVector(dir, d.teleport);
    sparks.emit(player.pos.x, player.pos.y + 1, player.pos.z, [0.6, 0.3, 1], 24, 3, 1.5);
    player.pos.set(to.x, Math.max(to.y - 0.5, groundHeight(to.x, to.z)), to.z);
    player.vel.set(0, 0, 0);
    sparks.emit(player.pos.x, player.pos.y + 1, player.pos.z, [0.6, 0.3, 1], 24, 3, 1.5);
    removeItem(id, 1);
    toolSound('whoosh', 1);
  } else if (d.ray && (d.ray.auto ? input.rmb : fresh) && cd <= 0) { // mrazicí paprsek a blaster
    cd = d.ray.cd;
    shot({ color: d.ray.color, size: d.ray.slow ? 0.6 : 0.35, speed: d.ray.slow ? 34 : 70, ttl: 1.2, dmg: d.ray.dmg, trail: 1, slow: d.ray.slow });
    Sound.burst({ dur: 0.12, f0: d.ray.slow ? 2400 : 1600, f1: d.ray.slow ? 900 : 300, q: 4, vol: 0.15 });
    wearHeld(1);
  } else if (d.hammer && fresh && cd <= 0) { // hromové kladivo: blesk tam, kam míříš
    cd = d.hammer;
    lightning();
    wearHeld(5);
  } else if (d.speed && fresh) { // lektvar rychlosti
    player.speedT = Math.max(player.speedT || 0, d.speed);
    removeItem(id, 1);
    sparks.emit(player.pos.x, player.pos.y + 1, player.pos.z, [0.4, 1, 1], 20, 2, 2);
    toast(`Lektvar rychlosti: ${d.speed} s běháš rychleji!`);
  } else if (d.grenade && fresh && cd <= 0) { // granát: letí obloukem a vybuchne
    cd = 0.6;
    shot({ color: 0x5a6a3a, size: 0.4, speed: 18, ttl: 2.5, dmg: 0, trail: 0.3, gravity: 14, boom: d.grenade });
    removeItem(id, 1);
    toolSound('whoosh', 1);
  } else if (d.firework && fresh && cd <= 0) { // ohňostroj: raketa vyletí a rozprskne se v barvách
    cd = 0.4;
    removeItem(id, 1);
    const x = player.pos.x - Math.sin(player.yaw) * 2, z = player.pos.z - Math.cos(player.yaw) * 2, y0 = player.pos.y + 1, col = [[1, 0.3, 0.3], [0.3, 1, 0.4], [0.4, 0.6, 1], [1, 0.9, 0.3], [1, 0.4, 1]][Math.floor(Math.random() * 5)];
    for (let k = 0; k < 10; k++) setTimeout(() => sparks.emit(x, y0 + k * 1.8, z, [1, 0.8, 0.5], 2, 0.4, -0.5), k * 70);
    setTimeout(() => { sparks.emit(x, y0 + 19, z, col, 120, 9, 0); sparks.emit(x, y0 + 19, z, [1, 1, 1], 30, 5, 0); Sound.burst({ dur: 0.5, f0: 3000, f1: 200, q: 0.5, vol: 0.4, type: 'lowpass' }); }, 720);
    Sound.burst({ dur: 0.7, f0: 400, f1: 3000, q: 2, vol: 0.12 });
  } else if (d.grapple && fresh && cd <= 0) { // hák na laně: přitáhne tě k bloku nebo zemi, kam míříš
    cd = 1;
    const t = pickTarget(d.grapple);
    if (!t?.point) { toast('Hák nemá čeho se chytit (do 35 m)'); return true; }
    const to = new THREE.Vector3(...t.point), dir = to.clone().sub(player.pos);
    const dist = dir.length();
    player.vel.copy(dir.normalize().multiplyScalar(Math.min(30, 8 + dist * 0.9)));
    player.vel.y += 5;
    player.onGround = false;
    sparks.emit(to.x, to.y, to.z, [0.9, 0.9, 0.9], 12, 2, 1);
    toolSound('whoosh', 1);
    wearHeld(1);
  } else if (d.medkit && fresh) {
    if (player.hp >= 100) { toast('Jsi zdravý, lékárnička počká'); return true; }
    player.hp = 100;
    removeItem('medkit', 1);
    sparks.emit(player.pos.x, player.pos.y + 1, player.pos.z, [1, 0.3, 0.3], 24, 2, 2);
    Sound.pickup?.();
    toast('Lékárnička: zdraví do plna');
  }
  return true;
}
