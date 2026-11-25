// Z čeho je věc, na kterou šlapeš nebo kterou těžíš (podle toho zní kroky, těžba, rozbití a položení).
// Jen čte data a stav světa ze shared/ (žádné DOM ani Three.js), takže jde testovat v Node.
import { BLOCKS } from '../../../shared/data/index.js';
import { waterAt } from '../../../shared/world/nature.js';
import { bkey, blocks } from '../../../shared/world/state.js';
import { biomeAt, shrineDist } from '../../../shared/world/terrain.js';
import { V, getVox, topY } from '../../../shared/world/voxels.js';

// Materiály: stone, grass, leaves, dirt, sand, snow, wood, metal, glass, crystal, water (recepty v sfx.js).
const BLOCK_MAT = {
  sand: 'sand', snow_block: 'snow', glass: 'glass', glass_pane: 'glass', obsidian: 'glass',
  farmland: 'dirt', dirt: 'dirt', markdirt: 'dirt', mushroom_block: 'dirt', mushroom_stem: 'wood',
  wheat_crop: 'leaves', tomato_crop: 'leaves', potato_crop: 'leaves', rice_crop: 'leaves', glowshroom: 'leaves',
  torch: 'wood', campfire: 'wood', lantern: 'metal', spikes: 'metal', spawner: 'metal', stove: 'metal', furnace: 'stone', well: 'stone',
  quartz_block: 'stone', quartz_pillar: 'stone', roof_tiles: 'stone', concrete: 'stone',
  tech_panel: 'metal', white_panel: 'stone', neon_cyan: 'glass', neon_amber: 'glass', neon_magenta: 'glass',
};
const METAL = /iron|steel|copper|gold|bars|cable/;
/** Materiál položeného bloku (podle id, materiálu schodů/půlbloků, kovu, elektřiny a nástroje). */
export function blockMaterial(id) {
  const B = BLOCKS[id];
  if (!B) return 'stone';
  if (B.elec?.clay) return 'metal';
  if (BLOCK_MAT[id]) return BLOCK_MAT[id];
  if (B.mat && B.mat !== id) return blockMaterial(B.mat);
  if (B.elec || METAL.test(id)) return 'metal';
  if (B.tool === 'axe') return 'wood';
  if (B.tool === 'shovel') return 'dirt';
  return 'stone';
}
const VOX_MAT = { [V.DIRT]: 'dirt', [V.MARKDIRT]: 'dirt', [V.SAND]: 'sand', [V.SNOW]: 'snow', [V.CRYSTAL]: 'crystal', [V.MARKORITE]: 'crystal', [V.QUARTZ]: 'crystal' };
/** Materiál přírodního bloku podzemí. */
export const voxMaterial = (v) => VOX_MAT[v] || 'stone';
const BIOME_MAT = { desert: 'sand', tundra: 'snow', volcanic: 'stone' };
/** Materiál povrchu (tráva, písek pouště, sníh tundry, čedič sopky; podlaha svatyně je kámen). */
export function surfaceMaterial(x, z) {
  if (shrineDist(x, z) < 9.6) return 'stone';
  return BIOME_MAT[biomeAt(x, z)] || 'grass';
}
/** Na čem stojí nohy v bodě (x, y, z): voda, položený blok, blok podzemí, nebo povrch. */
export function materialAt(x, y, z) {
  if (waterAt(x, y + 0.05, z) !== null) return 'water';
  const fx = Math.floor(x), fz = Math.floor(z), fy = Math.floor(y - 0.05);
  const b = blocks.get(bkey(fx, fy, fz)) || blocks.get(bkey(fx, Math.floor(y), fz));
  if (b && BLOCKS[b]?.solid !== false) return blockMaterial(b);
  if (fy < topY(fx, fz)) { const v = getVox(fx, fy, fz); if (v !== V.AIR) return voxMaterial(v); }
  return surfaceMaterial(x, z);
}
const TREE_MAT = { cactus: 'leaves', mushroom: 'dirt', deadbush: 'leaves' };
/** Materiál toho, na co hráč míří (strom, balvan, tráva, blok, podzemí, auto…). */
export function targetMaterial(t) {
  if (!t) return 'stone';
  switch (t.kind) {
    case 'tree': return TREE_MAT[t.tree?.kind] || 'wood';
    case 'grass': return 'grass';
    case 'block': return blockMaterial(t.type);
    case 'vox': return voxMaterial(t.vox);
    case 'vehicle': return 'metal';
    case 'paper': return 'leaves';
    default: return 'stone';
  }
}
