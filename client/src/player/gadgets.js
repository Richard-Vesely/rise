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
import { shot } from './magic.js';
import { input, player } from './player.js';

let prevRmb = false, cd = 0, flameT = 0;

/** Každý snímek (interaction.js): vrací true, když pravé tlačítko patří vychytávce v ruce. */
export function updateGadgets(dt, special) {
  const fresh = input.rmb && !prevRmb;
  prevRmb = input.rmb;
  cd -= dt;
  const id = heldStack()?.id, d = ITEMS[id];
  if (!d || !(d.throw || d.wings || d.flame || d.medkit) || special) return false;
  if (d.throw && fresh && cd <= 0) { // trojzubec
    cd = d.throw.cd;
    shot({ color: 0x38c8e8, size: 0.8, speed: 42, ttl: 1.6, dmg: d.throw.dmg, trail: 1 });
    toolSound('whoosh', 1);
    wearHeld(2);
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
