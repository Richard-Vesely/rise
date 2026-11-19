// Stavby ve světě: kde stojí (ruiny, pevnosti, věže, tábory, kobky…), kořist v jejich truhlách a jak se postaví.
import { emit } from '../events.js';
import { NET } from '../net/net.js';
import { spawnMob } from '../sim/mobs.js';
import { hash2, rng } from '../util.js';
import { bkey, blockMeta, blocks, chests, ruinsBuilt, spawners } from './state.js';
import { VOLC_CELL, biomeAt, inLake, isMark, regionOf, shrineDist } from './terrain.js';
import { V, setVox, surfY, topY } from './voxels.js';
import { DRAGON_DEN, isDragon } from './dragon-land.js';
import { buildDragonDen } from './dragon-den.js';

// Kořist: [předmět, min, max, šance]
export const LOOT = {
  ruin: [
    ['markorite', 1, 3, 0.55], ['markorite_raw', 2, 4, 0.5], ['shard', 1, 3, 0.6], ['iron', 2, 6, 0.6], ['meat', 2, 5, 0.5],
    ['torch', 4, 12, 0.5], ['essence', 1, 4, 0.4], ['coal', 3, 8, 0.4], ['crystal_pick', 1, 1, 0.14], ['crystal_sword', 1, 1, 0.12],
    ['iron_helmet', 1, 1, 0.15], ['iron_chestplate', 1, 1, 0.15], ['crystal_helmet', 1, 1, 0.08], ['markapple', 1, 1, 0.2], ['markorite_sword', 1, 1, 0.04],
  ],
  camp: [['meat', 2, 5, 0.8], ['torch', 4, 10, 0.7], ['iron', 1, 4, 0.5], ['coal', 3, 8, 0.6], ['stone_pick', 1, 1, 0.3], ['iron_sword', 1, 1, 0.12], ['berries', 3, 8, 0.6], ['wool', 2, 5, 0.4]],
  tower: [['iron', 3, 8, 0.7], ['shard', 1, 2, 0.5], ['iron_helmet', 1, 1, 0.25], ['iron_boots', 1, 1, 0.25], ['crystal_sword', 1, 1, 0.08], ['torch', 6, 12, 0.6], ['meat', 2, 4, 0.5], ['sky_boots', 1, 1, 0.07]],
  dungeon: [
    ['iron', 3, 9, 0.8], ['shard', 2, 4, 0.6], ['markapple', 1, 2, 0.3], ['essence', 2, 5, 0.5], ['crystal_pick', 1, 1, 0.15], ['coal', 4, 10, 0.5],
    ['sky_helmet', 1, 1, 0.12], ['sky_chestplate', 1, 1, 0.1], ['sky_leggings', 1, 1, 0.1], ['sky_boots', 1, 1, 0.12], ['shadow_helmet', 1, 1, 0.1], ['markorite', 1, 3, 0.3],
  ],
  pyramid: [['iron', 2, 6, 0.6], ['shard', 1, 3, 0.5], ['cactus', 2, 5, 0.5], ['glass', 4, 10, 0.5], ['crystal_sword', 1, 1, 0.1], ['markapple', 1, 1, 0.12], ['smooth_sandstone', 8, 16, 0.4], ['sky_helmet', 1, 1, 0.06]],
  temple: [['banana', 3, 8, 0.7], ['iron', 2, 5, 0.6], ['blue_flower', 2, 5, 0.5], ['crystal_pick', 1, 1, 0.1], ['shard', 1, 2, 0.4], ['jungle_planks', 8, 16, 0.4], ['essence', 1, 3, 0.3]],
  igloo: [['snowball', 4, 12, 0.7], ['meat', 2, 5, 0.7], ['iron', 1, 3, 0.5], ['torch', 4, 8, 0.6], ['iron_boots', 1, 1, 0.2], ['coal', 3, 8, 0.5]],
  pavilion: [['cherries', 3, 8, 0.8], ['red_flower', 2, 6, 0.6], ['lantern', 1, 2, 0.4], ['cherry_planks', 8, 16, 0.5], ['iron', 1, 3, 0.4], ['shard', 1, 1, 0.25]],
  hut: [['wheat_seeds', 3, 8, 0.6], ['meat', 2, 4, 0.6], ['acacia_planks', 6, 12, 0.5], ['stone_pick', 1, 1, 0.3], ['yellow_flower', 2, 5, 0.5], ['iron', 1, 3, 0.4]],
  mushhouse: [['glowshroom', 3, 6, 0.7], ['mushroom', 4, 10, 0.8], ['mushroom_block', 4, 8, 0.5], ['essence', 1, 3, 0.4], ['shard', 1, 2, 0.4], ['markapple', 1, 1, 0.1]],
  altar: [['obsidian', 2, 6, 0.6], ['crystal_chestplate', 1, 1, 0.2], ['crystal_sword', 1, 1, 0.2], ['shard', 2, 5, 0.7], ['markorite', 1, 2, 0.3], ['iron', 4, 10, 0.6], ['basalt', 8, 16, 0.4]],
  fortress: [
    ['markorite', 2, 5, 0.8], ['markapple', 1, 3, 0.6], ['iron', 4, 10, 0.7], ['markorite_helmet', 1, 1, 0.12], ['markorite_boots', 1, 1, 0.12],
    ['markorite_sword', 1, 1, 0.1], ['sky_chestplate', 1, 1, 0.1], ['shard', 2, 5, 0.6], ['crystal_chestplate', 1, 1, 0.12],
  ],
};
export function rollLoot(rnd, table) {
  const slots = Array(27).fill(null);
  for (const [id, a, b, chance] of table) {
    if (rnd() >= chance) continue;
    let i;
    do i = Math.floor(rnd() * 27); while (slots[i]);
    slots[i] = { id, n: a + Math.floor(rnd() * (b - a + 1)) };
  }
  if (!slots.some(Boolean)) slots[13] = { id: table[0][0], n: 1 };
  return slots;
}

// Druhy staveb: velikost buňky mřížky, šance, dimenze (true = Markova, false = domov, null = obě).
export const STRUCTS = {
  dragon_den: { icon: '◆', name: 'Dračí jeskyně' },
  ruin: { cell: 70, chance: 0.5, mark: true, salt: [333, 77], icon: '▣', name: 'Ruiny' },
  fortress: { cell: 240, chance: 0.65, mark: true, salt: [911, 19], icon: '⛫', name: 'Markomanská pevnost' },
  tower: { cell: 190, chance: 0.55, mark: false, salt: [515, 41], icon: '♜', name: 'Strážní věž' },
  camp: { cell: 150, chance: 0.5, mark: false, salt: [717, 63], icon: '⛺', name: 'Opuštěný tábor' },
  dungeon: { cell: 170, chance: 0.6, mark: null, salt: [123, 88], icon: '☠', name: 'Kobka' },
  // Zajímavá místa v biomech (stavba stojí jen tam, kde je její biom)
  pyramid: { cell: 260, chance: 0.7, mark: false, salt: [402, 51], icon: '▲', name: 'Pouštní pyramida', biome: 'desert' },
  temple: { cell: 240, chance: 0.7, mark: false, salt: [608, 13], icon: '♣', name: 'Chrám v džungli', biome: 'jungle' },
  igloo: { cell: 200, chance: 0.7, mark: false, salt: [244, 97], icon: '◓', name: 'Iglú', biome: 'tundra' },
  pavilion: { cell: 220, chance: 0.7, mark: false, salt: [831, 29], icon: '✿', name: 'Třešňový altán', biome: 'cherry' },
  hut: { cell: 220, chance: 0.7, mark: false, salt: [157, 64], icon: '⌂', name: 'Chatrč na savaně', biome: 'savanna' },
  mushhouse: { cell: 200, chance: 0.75, mark: false, salt: [933, 71], icon: '♠', name: 'Houbový domek', biome: 'mushroom' },
  altar: { cell: VOLC_CELL, chance: 1, mark: false, salt: [0, 0], icon: '◆', name: 'Obsidiánový oltář', biome: 'volcanic' },
};
function structAt(type, cx, cz) {
  const S = STRUCTS[type];
  if (type === 'altar') { // oltář stojí na úbočí sopky
    const v = regionOf((cx + 0.5) * VOLC_CELL, (cz + 0.5) * VOLC_CELL, VOLC_CELL, 71, 0.5);
    return v ? { type, key: `altar${cx},${cz}`, x: Math.floor(v.x + 38), z: Math.floor(v.z) } : null;
  }
  if (hash2(cx + S.salt[0], cz - S.salt[1]) > S.chance) return null;
  const x = Math.floor((cx + 0.3 + hash2(cx, cz + 5) * 0.4) * S.cell), z = Math.floor((cz + 0.3 + hash2(cx + 5, cz) * 0.4) * S.cell);
  if ((S.mark !== null && isMark(x) !== S.mark) || shrineDist(x, z) < 45 || inLake(x, z, 1.25)) return null; // ne v jezeře
  if (S.biome && biomeAt(x, z) !== S.biome) return null;
  return { type, key: type === 'ruin' ? `ru${cx},${cz}` : `${type}${cx},${cz}`, x, z };
}
export function structuresNear(px, pz, R) {
  if (isDragon(px)) return Math.hypot(px - DRAGON_DEN.x, pz - DRAGON_DEN.z) < R ? [{ ...DRAGON_DEN }] : [];
  const out = [];
  for (const type of Object.keys(STRUCTS)) {
    if (type === 'dragon_den') continue;
    const C = STRUCTS[type].cell;
    for (let cz = Math.floor((pz - R) / C); cz <= Math.floor((pz + R) / C); cz++)
      for (let cx = Math.floor((px - R) / C); cx <= Math.floor((px + R) / C); cx++) {
        const s = structAt(type, cx, cz);
        if (s && (s.x - px) ** 2 + (s.z - pz) ** 2 < R * R) out.push(s);
      }
  }
  return out;
}
export const ruinsNear = structuresNear;

// ============================================================ stavitelé staveb (r = { type, key, x, z }, rnd = náhoda podle místa)
const put = (x, y, z, type) => blocks.set(bkey(x, y, z), type);
function putChest(x, y, z, table, rnd) { const k = bkey(x, y, z); blocks.set(k, 'chest'); chests.set(k, rollLoot(rnd, LOOT[table])); }
function putSpawner(x, y, z, mob) { const k = bkey(x, y, z); blocks.set(k, 'spawner'); spawners.set(k, mob); }

const putM = (x, y, z, type, meta) => { put(x, y, z, type); blockMeta.set(bkey(x, y, z), meta); }; // blok s otočením / horní půlblok
export const BUILDERS = {
  dragon_den: buildDragonDen,
  // Pouštní pyramida: stupňovitá, dutá, vchod z jihu, uvnitř truhla a pochodně
  pyramid(r, rnd) {
    const b = surfY(r.x, r.z);
    for (let L = 0; L < 6; L++) {
      const half = 6 - L;
      for (let dx = -half; dx <= half; dx++) for (let dz = -half; dz <= half; dz++) {
        const edge = Math.abs(dx) === half || Math.abs(dz) === half;
        if (!edge && L < 4) { if (L === 0) put(r.x + dx, b, r.z + dz, 'smooth_sandstone'); continue; }
        if (dz === half && dx === 0 && L <= 1) continue; // vchod
        put(r.x + dx, b + L, r.z + dz, L % 2 ? 'smooth_sandstone' : 'sandstone');
      }
    }
    putChest(r.x, b + 1, r.z - 2, 'pyramid', rnd);
    put(r.x - 3, b + 1, r.z, 'torch');
    put(r.x + 3, b + 1, r.z, 'torch');
  },
  // Chrám v džungli: kamenný s prkny, střecha z půlbloků
  temple(r, rnd) {
    const b = surfY(r.x, r.z);
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      put(r.x + dx, b, r.z + dz, 'cobble');
      const edge = Math.abs(dx) === 3 || Math.abs(dz) === 3;
      for (let y = 1; y <= 3; y++) if (edge && !(dz === 3 && dx === 0 && y <= 2)) put(r.x + dx, b + y, r.z + dz, (dx + dz + y) % 3 ? 'cobble' : 'jungle_planks');
      putM(r.x + dx, b + 4, r.z + dz, 'jungle_planks_slab', 0);
    }
    for (const dx of [-2, 2]) putM(r.x + dx, b + 1, r.z + 4, 'cobble_stairs', 2);
    putChest(r.x, b + 1, r.z - 2, 'temple', rnd);
    put(r.x - 2, b + 1, r.z - 2, 'torch');
  },
  // Iglú ze sněhových bloků s táborákem a truhlou
  igloo(r, rnd) {
    const b = surfY(r.x, r.z);
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) for (let dy = 0; dy <= 4; dy++) {
      const d = Math.hypot(dx, dy * 1.15, dz);
      if (d > 3.3 && d <= 4.2 && !(dz >= 3 && Math.abs(dx) <= 0 && dy <= 1)) put(r.x + dx, b + dy, r.z + dz, 'snow_block');
    }
    put(r.x, b, r.z, 'campfire');
    putChest(r.x - 2, b, r.z - 1, 'igloo', rnd);
  },
  // Třešňový altán: podlaha, trámové sloupy, střecha z třešňových půlbloků, lucerna
  pavilion(r, rnd) {
    const b = surfY(r.x, r.z);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      put(r.x + dx, b, r.z + dz, 'cherry_planks');
      putM(r.x + dx, b + 4, r.z + dz, 'cherry_planks_slab', 0);
    }
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) for (let y = 1; y <= 3; y++) put(r.x + dx, b + y, r.z + dz, 'log_block');
    for (let d = -3; d <= 3; d++) for (const [x, z, rot] of [[d, -3, 0], [d, 3, 2], [-3, d, 1], [3, d, 3]]) putM(r.x + x, b + 4, r.z + z, 'cherry_planks_stairs', rot);
    put(r.x, b + 1, r.z, 'lantern');
    putChest(r.x + 1, b + 1, r.z - 1, 'pavilion', rnd);
  },
  // Chatrč na savaně z akáciových prken, venku ohniště
  hut(r, rnd) {
    const b = surfY(r.x, r.z);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
      for (let y = 1; y <= 2; y++) if (edge && !(dz === 2 && dx === 0)) put(r.x + dx, b + y, r.z + dz, 'acacia_planks');
      putM(r.x + dx, b + 3, r.z + dz, 'acacia_planks_slab', 0);
    }
    putChest(r.x - 1, b + 1, r.z - 1, 'hut', rnd);
    put(r.x, b + 1, r.z + 5, 'campfire');
  },
  // Houbový domek: dutý třeň s dveřmi, nad ním klobouk, uvnitř svítivé houby
  mushhouse(r, rnd) {
    const b = surfY(r.x, r.z);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let y = 1; y <= 4; y++) {
      if (dx === 0 && dz === 0) continue;
      if (dz === 1 && dx === 0 && y <= 2) continue; // dveře
      put(r.x + dx, b + y, r.z + dz, 'mushroom_stem');
    }
    for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
      const d = Math.hypot(dx, dz);
      if (d <= 4.3) put(r.x + dx, b + 5, r.z + dz, 'mushroom_block');
      if (d > 3.2 && d <= 4.3) put(r.x + dx, b + 4, r.z + dz, 'mushroom_block');
    }
    put(r.x, b + 1, r.z, 'glowshroom');
    putChest(r.x + 3, b + 1, r.z + 3, 'mushhouse', rnd);
  },
  // Obsidiánový oltář na úbočí sopky
  altar(r, rnd) {
    const b = surfY(r.x, r.z);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      put(r.x + dx, b, r.z + dz, Math.abs(dx) === 2 || Math.abs(dz) === 2 ? 'polished_basalt' : 'obsidian');
      for (let y = 1; y <= 2; y++) if (Math.abs(dx) === 2 && Math.abs(dz) === 2) put(r.x + dx, b + y, r.z + dz, 'obsidian');
    }
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) put(r.x + dx, b + 3, r.z + dz, 'lantern');
    putChest(r.x, b + 1, r.z, 'altar', rnd);
  },
  // Zbořené zdi z markwood prken a cihel, uprostřed truhla; hlídají Markomani.
  ruin(r, rnd, mobsOut) {
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      if ((Math.abs(dx) !== 3 && Math.abs(dz) !== 3) || (dz === 3 && Math.abs(dx) <= 1)) continue;
      const base = surfY(r.x + dx, r.z + dz), h = 1 + Math.floor(rnd() * 3);
      for (let y = 0; y < h; y++) put(r.x + dx, base + y, r.z + dz, rnd() < 0.55 ? 'mark_planks' : 'bricks');
    }
    putChest(r.x, surfY(r.x, r.z), r.z, 'ruin', rnd);
    put(r.x + 2, surfY(r.x + 2, r.z + 2), r.z + 2, 'torch');
    for (let i = 0; i < 2; i++) mobsOut.push(['markoman', r.x + 6 + i * 2, r.z + 6]);
  },
  // Markomanská pevnost: hradby 13×13 s věžemi, brána na jihu, uvnitř spawner Markomanů a bohatá truhla.
  fortress(r, rnd, mobsOut) {
    const b = surfY(r.x, r.z);
    for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) {
      const edge = Math.abs(dx) === 6 || Math.abs(dz) === 6, corner = Math.abs(dx) >= 5 && Math.abs(dz) >= 5;
      if (!edge && !corner) { if (Math.abs(dx) <= 4 && Math.abs(dz) <= 4) put(r.x + dx, b, r.z + dz, 'bricks'); continue; }
      const h = corner ? 7 : 4 + ((dx + dz) % 2 === 0 ? 1 : 0);
      for (let y = 0; y < h; y++) {
        if (dz === 6 && Math.abs(dx) <= 1 && y <= 2) continue; // brána
        put(r.x + dx, b + y, r.z + dz, y < 2 ? 'bricks' : 'mark_planks');
      }
    }
    putSpawner(r.x, b + 1, r.z - 2, 'markoman');
    putChest(r.x, b + 1, r.z - 4, 'fortress', rnd);
    putChest(r.x + 3, b + 1, r.z - 4, 'ruin', rnd);
    for (const [dx, dz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) put(r.x + dx, b + 1, r.z + dz, 'torch');
    for (let i = 0; i < 3; i++) mobsOut.push(['markoman', r.x - 2 + i * 2, r.z + 9]);
  },
  // Strážní věž: dutá cihlová věž 5×5, uvnitř schody do kruhu, nahoře plošina s truhlou.
  tower(r, rnd) {
    const b = surfY(r.x, r.z);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      if (Math.abs(dx) !== 2 && Math.abs(dz) !== 2) continue;
      for (let y = 0; y <= 10; y++) {
        if (dz === 2 && dx === 0 && y <= 1) continue; // dveře
        if (y >= 10 && (dx + dz) % 2 !== 0) continue; // cimbuří
        if (y === 6 && dx === 0 && rnd() < 0.7) continue; // okna
        put(r.x + dx, b + y, r.z + dz, 'bricks');
      }
    }
    const ring = [[1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0]];
    for (let k = 0; k < 9; k++) { const [dx, dz] = ring[k % 8]; put(r.x + dx, b + k, r.z + dz, 'planks'); }
    for (const [dx, dz] of ring.concat([[0, 0]])) {
      if ((dx === 1 && dz === 1) || (dx === 0 && dz === 1)) continue; // průlez nad schody
      put(r.x + dx, b + 9, r.z + dz, 'planks');
    }
    putChest(r.x - 1, b + 10, r.z - 1, 'tower', rnd);
    put(r.x + 1, b + 10, r.z - 1, 'torch');
  },
  // Opuštěný tábor: stan, táborák a truhla se zásobami.
  camp(r, rnd) {
    for (let dz = -1; dz <= 1; dz++) {
      put(r.x - 4, surfY(r.x - 4, r.z + dz), r.z + dz, 'planks');
      put(r.x - 2, surfY(r.x - 2, r.z + dz), r.z + dz, 'planks');
      put(r.x - 3, surfY(r.x - 3, r.z + dz) + 1, r.z + dz, 'planks');
    }
    put(r.x, surfY(r.x, r.z), r.z, 'campfire');
    putChest(r.x + 2, surfY(r.x + 2, r.z - 2), r.z - 2, 'camp', rnd);
    put(r.x + 2, surfY(r.x + 2, r.z + 2), r.z + 2, 'torch');
  },
  // Kobka: místnost 9×9 hluboko pod zemí, schody od povrchu, spawner a dvě truhly. Vchod značí cihlový oblouk.
  dungeon(r, rnd) {
    const top = topY(r.x, r.z), fy = top - 14, mark = isMark(r.x);
    for (let dx = -5; dx <= 5; dx++) for (let dz = -5; dz <= 5; dz++) for (let dy = -1; dy <= 4; dy++) {
      const x = r.x + dx, y = fy + dy, z = r.z + dz;
      setVox(x, y, z, V.AIR);
      const wall = Math.abs(dx) === 5 || Math.abs(dz) === 5 || dy === -1 || dy === 4;
      if (wall && !(dz === 5 && dx === 0 && dy >= 0 && dy <= 2)) put(x, y, z, dy === -1 ? 'cobble' : rnd() < 0.8 ? 'bricks' : 'cobble');
    }
    putSpawner(r.x, fy, r.z, mark ? 'markoman' : 'crawler');
    putChest(r.x - 3, fy, r.z - 3, 'dungeon', rnd);
    putChest(r.x + 3, fy, r.z - 3, 'dungeon', rnd);
    for (const [dx, dz] of [[-4, 4], [4, 4], [-4, -4], [4, -4]]) put(r.x + dx, fy, r.z + dz, 'torch');
    // Schody nahoru (každý schod o 1 blok, tunel 3 bloky vysoký)
    let i = 0;
    for (; i < 40; i++) {
      const z = r.z + 6 + i, y = fy + i;
      for (let k = 0; k < 3; k++) setVox(r.x, y + k, z, V.AIR);
      if (y > topY(r.x, z)) break;
    }
    // Oblouk nad vstupem
    const az = r.z + 6 + i, ab = topY(r.x, az);
    for (let y = 0; y < 3; y++) { put(r.x - 1, ab + 1 + y, az, 'bricks'); put(r.x + 1, ab + 1 + y, az, 'bricks'); }
    for (let dx = -1; dx <= 1; dx++) put(r.x + dx, ab + 4, az, 'bricks');
    put(r.x - 1, ab + 4, az + 1, 'torch');
  },
};
// Postaví stavbu (bloky, truhly s kořistí, spawner). Ostatním se pošle jen zpráva 'r' – každý ji postaví stejně (stejná náhoda).
// Strážce (Markomany) zrodí jen ten, kdo drží svět; připojený hráč je uvidí jako loutky od hostitele.
export function buildStructure(r) {
  NET.op(['r', { ...r }]);
  const guards = [];
  NET.quiet(() => {
    ruinsBuilt.add(r.key);
    const rnd = rng(1 + Math.floor(hash2(r.x, r.z) * 1e9));
    BUILDERS[r.type](r, rnd, guards);
  });
  if (!NET.client) for (const [type, x, z] of guards) spawnMob(type, x, z);
  emit('blocksChanged');
}
