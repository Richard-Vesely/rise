// Co je pevné: položené bloky a podzemí. Používají to tvorové, předměty na zemi, auta i stavby.
import { structuresAt } from './missile-structures.js';
import { BLOCKS } from '../data/index.js';
import { bkey, blocks, lights } from './state.js';
import { VMIN, solidVox } from './voxels.js';

export const solidAt = (x, y, z) => { const t = blocks.get(bkey(x, y, z)); return (!!t && BLOCKS[t].solid)||structuresAt(x,y,z).length>0; };
export const solidAny = (x, y, z) => solidAt(x, y, z) || solidVox(x, y, z);
// Podlaha pod tvorem v podzemí: nejvyšší pevný blok do 1 bloku nad jeho nohama.
export function voxFloor(x, y, z) {
  const fx = Math.floor(x), fz = Math.floor(z);
  for (let cy = Math.floor(y + 1.05) - 1; cy >= Math.floor(y) - 12; cy--) if (solidAny(fx, cy, fz)) return cy + 1;
  return VMIN;
}
// Svítí poblíž pochodeň, táborák nebo lampa? (stínožrouti se jí vyhýbají; spawner se nepočítá)
export const nearLight = (x, z, r) => { for (const s of lights.values()) if ((s.x + 0.5 - x) ** 2 + (s.z + 0.5 - z) ** 2 < r * r) return true; return false; };
