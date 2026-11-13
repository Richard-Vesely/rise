// Přežití: zranění, smrt, hlad; sbírání úlomků.
import '../dining/dining.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { NET } from '../../../shared/net/net.js';
import { mobs, removeMob } from '../../../shared/sim/mobs.js';
import { bkey, blocks, removed } from '../../../shared/world/state.js';
import { shrineOf, terrainH, volcanoDist } from '../../../shared/world/terrain.js';
import { Sound } from '../audio/sound.js';
import { MP } from '../game/boot.js';
import { gameClock, gameTime } from '../game/loop.js';
import { sparks } from '../render/particles.js';
import { scene } from '../render/renderer.js';
import { shardObjs } from '../render/shards.js';
import { $ } from '../ui/dom.js';
import { setVignette, toast, vignette } from '../ui/hud.js';
import { armor, armorPoints, fullSet, refreshUI } from '../ui/inventory-ui.js';
import { exitVehicle } from '../vehicles/car.js';
import { hurtPulse } from './camera-feel.js';
import { wearArmor } from './durability.js';
import { arenaReset } from './arena.js';
import { addItem, inv } from './inventory.js';
import { creative, player } from './player.js';
import { magic } from './xp.js';
import { popGroundItem } from '../../../shared/sim/ground-items.js';
import { ownerItem } from '../../../shared/data/magic.js';

// ============================================================ přežití
export function damagePlayer(amount, dx, dz) {
  if (!player.alive || creative) return;
  if (magic.wardT > 0) amount *= 0.5; // kouzlo Ochranný štít (xp.js)
  if (dx || dz) { // brnění tlumí útoky a přitom se opotřebuje
    const raw = amount;
    amount *= 1 - Math.min(0.8, armorPoints() * 0.035);
    wearArmor(raw, [player.pos.x, player.pos.y + 1.1, player.pos.z]);
  }
  player.hp -= amount;
  player.lastHurt = gameTime;
  player.shake = 0.12;
  hurtPulse(dx, dz);
  flashHearts();
  if (dx || dz) { player.vel.x += dx * 6; player.vel.z += dz * 6; player.vel.y = 3.5; player.onGround = false; }
  setVignette(1);
  Sound.hurt();
  if (player.hp <= 0) die();
}
// Srdíčko a lišta zdraví bliknou
function flashHearts() {
  const w = $('hpfill')?.closest('.wrap');
  if (!w) return;
  w.classList.remove('hit');
  void w.offsetWidth; // znovu spustit animaci
  w.classList.add('hit');
}
function die() {
  if (player.vehicle || player.riding) exitVehicle();
  player.alive = false;
  player.hp = 0;
  const lost = NET.pvp ? 0 : dropEverything(); // batoh a brnění vypadnou na zem (v aréně je nová výbava)
  $('fade').style.opacity = 1;
  setTimeout(() => {
    const jail = NET.jail?.at; // vězeň se probudí zase ve vězení (player/prison.js)
    if (NET.pvp && !jail) { player.alive = true; arenaReset(); $('fade').style.opacity = 0; toast('Zpátky v aréně s novou výbavou'); return; } // aréna: nová výbava a místo (arena.js)
    const home = shrineOf(player.pos.x);
    if (jail) player.pos.set(jail[0], jail[1], jail[2]); else player.pos.set(home.x, 0.45, home.z + 14);
    player.vel.set(0, 0, 0);
    player.yaw = 0;
    player.hp = 100;
    player.hunger = Math.max(player.hunger, 60);
    player.alive = true;
    if (!MP) for (const m of [...mobs]) if (m.type === 'crawler') removeMob(m);
    $('fade').style.opacity = 0;
    toast(jail ? (lost ? 'Jsi zase ve vězení. Tvoje věci leží tam, kde jsi padl (5 minut).' : 'Jsi zase ve vězení.') : lost ? 'Svatyně tě přivedla zpět. Tvoje věci leží tam, kde jsi padl (5 minut).' : 'Svatyně tě přivedla zpět');
  }, 2600);
}
// Smrt: všechno z batohu, kurzoru a brnění vypadne na zem tam, kde hráč padl (jako v Minecraftu); za 5 minut to zmizí
// (shared/sim/ground-items.js DESPAWN). Vrací, kolik políček vypadlo.
function dropEverything() {
  const { x, y, z } = player.pos;
  let n = 0;
  const drop = (s) => { if (s) { popGroundItem(s.id, s.n, x, y + 0.8, z, s.w || 0); n++; } };
  inv.slots.forEach((s, i) => { if (ownerItem(s?.id)) return; drop(s); inv.slots[i] = null; }); // hůl vlastníka zůstává v batohu
  if (ownerItem(inv.cursor?.id)) { const i = inv.slots.indexOf(null); if (i >= 0) inv.slots[i] = inv.cursor; } else drop(inv.cursor);
  inv.cursor = null;
  armor.forEach((s, i) => { drop(s); armor[i] = null; });
  refreshUI();
  return n;
}
let starveT = 0, hungerWarned = false;
let lavaWarned = 0;
export function updateSurvival(dt) {
  if (creative) { player.hunger = 100; player.hp = 100; return; }
  // Láva na dně kráteru sopky pálí
  if (volcanoDist(player.pos.x, player.pos.z) < 11 && player.pos.y < terrainH(player.pos.x, player.pos.z) + 0.5) {
    player.hp -= 22 * dt;
    setVignette(Math.max(vignette, 0.8));
    if (Math.random() < dt * 12) sparks.emit(player.pos.x, player.pos.y + 0.3, player.pos.z, [1, 0.45, 0.1], 4, 2, 2);
    if ((lavaWarned -= dt) <= 0) { lavaWarned = 4; toast('Láva pálí! Uteč z kráteru'); Sound.hurt(); }
    if (player.hp <= 0) { die(); return; }
  }
  if (fullSet() === 'sky') player.hp = Math.min(100, player.hp + dt);
  if (blocks.get(bkey(Math.floor(player.pos.x), Math.floor(player.pos.y + 0.1), Math.floor(player.pos.z))) === 'spikes') {
    player.hp -= 3 * dt; setVignette(Math.max(vignette, 0.5));
    if (player.hp <= 0) die();
  }
  player.hunger = Math.max(0, player.hunger - dt * (player.sprinting ? 0.3 : 0.11));
  if (player.hunger < 25 && !hungerWarned) { hungerWarned = true; toast('Máš hlad – sněz něco (pravé tlačítko)'); }
  if (player.hunger > 40) hungerWarned = false;
  if (player.hunger <= 0 && (starveT += dt) > 3) { starveT = 0; damagePlayer(4, 0, 0); }
  if (player.hunger > 30 && gameTime - player.lastHurt > 4) player.hp = Math.min(100, player.hp + dt * 1.5);
}
export function updateShards(dt) {
  for (const [k, s] of shardObjs) {
    s.crystal.rotation.y += dt * 1.2;
    s.crystal.position.y = 1.3 + Math.sin(gameClock * 2 + s.x) * 0.15;
    if (player.alive && Math.hypot(player.pos.x - s.x, player.pos.z - s.z) < 1.9) {
      removed.add(k);
      scene.remove(s.group);
      shardObjs.delete(k);
      addItem('shard', 1);
      sparks.emit(s.x, s.group.position.y + 1.3, s.z, [0.4, 0.95, 1.0], 80, 5, 3);
      Sound.pickup();
      toast('Úlomek světla!');
    }
  }
}
