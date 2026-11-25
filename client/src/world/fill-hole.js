import { NET } from '../../../shared/net/net.js';
import { fillHole } from '../../../shared/world/fill-hole.js';
import { terrainH } from '../../../shared/world/terrain.js';

let armed = false, released = false, swallowing = false;
export function fillHoleCommand(text, notify) {
  const command = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/^\//, '').replace(/\s+/g, ' ');
  if (command !== 'zapln diru') return false;
  if (NET.jail) { notify('Ve vězení se terén měnit nedá.'); return true; }
  armed = !armed;
  released = false;
  notify(armed ? 'Zaplň díru: klikni na dno nebo okraj díry. Stejným příkazem výběr zrušíš.' : 'Zaplň díru: výběr zrušen.');
  return true;
}

// Spotřebuje celý klik včetně držení, aby hned po zasypání nezačala těžba.
export function updateFillHole(target, input, player, notify) {
  const down = input.lmb || input.rmb;
  if (swallowing) { swallowing = !!down; return true; }
  if (!armed) return false;
  if (!down) { released = true; return false; }
  if (!released) return true;
  swallowing = true;
  armed = false;
  if (NET.jail) { armed = false; notify('Ve vězení se terén měnit nedá.'); return true; }
  if (!target || !['vox', 'grass', 'ground'].includes(target.kind)) {
    notify('Zaplň díru: výběr zrušen, netrefil ses do díry.'); return true;
  }
  const cell = target.cell || (target.point && target.point.map(Math.floor));
  if (!cell) { notify('Zaplň díru: výběr zrušen, netrefil ses do díry.'); return true; }
  const result = fillHole(cell[0], cell[2]);
  if (result.error) { notify(`Zaplň díru: výběr zrušen. ${result.error}`); return true; }
  // Hráče stojícího uvnitř zvedni na nový povrch.
  if (result.columns.some(([x, z]) => x === Math.floor(player.pos.x) && z === Math.floor(player.pos.z))) {
    player.pos.y = Math.max(player.pos.y, terrainH(player.pos.x, player.pos.z) + 0.1);
    player.vel.y = Math.max(0, player.vel.y);
  }
  notify(`Díra je zaplněná až k okolnímu terénu (${result.filled} bloků).`);
  return true;
}
