// Dutá skalní jeskyně s širokým vstupem směrem k návratovému portálu.
import { bkey, blocks } from './state.js';

export function buildDragonDen(r) {
  for (let dx = -20; dx <= 20; dx++) for (let dz = -20; dz <= 20; dz++) {
    for (let y = 0; y <= 13; y++) {
      const shell = Math.hypot(dx, dz, y * 1.55);
      if (shell < 17 || shell > 20 || (dz > 9 && Math.abs(dx) <= 4 && y < 6)) continue;
      blocks.set(bkey(r.x + dx, y, r.z + dz), (dx + dz + y) % 5 === 0 ? 'obsidian' : 'basalt');
    }
  }
  // Světla ve skále a cesta k jeskyni: všechny bloky používají stávající ukládání.
  for (const dx of [-12, 12]) for (const dz of [-8, 6]) {
    blocks.set(bkey(r.x + dx, 0, r.z + dz), 'basalt');
    blocks.set(bkey(r.x + dx, 1, r.z + dz), 'lantern');
  }
  for (let z = -14; z >= -50; z -= 12) for (const dx of [-5, 5]) {
    blocks.set(bkey(r.x + dx, 0, z), 'basalt');
    blocks.set(bkey(r.x + dx, 1, z), 'torch');
  }
}
