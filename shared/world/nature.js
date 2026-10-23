// Příroda: úlomky světla, druhy stromů v biomech a rybníky s vodou.
import { hash2, smoothstep } from '../util.js';
import { ROCK_CELL, SHARD_CELL, TREE_CELL } from './constants.js';
import { removed } from './state.js';
import { SEA, biomeAt, forest, isMark, oceanK, pondDip, pondOf, shrineDist, terrainH, volcanoDist } from './terrain.js';

// ============================================================ úlomky světla (generují se po celém světě)
export function shardAt(cx, cz) {
  if (hash2(cx + 77, cz - 55) > 0.45) return null;
  const x = (cx + 0.2 + hash2(cx, cz + 1) * 0.6) * SHARD_CELL, z = (cz + 0.2 + hash2(cx + 1, cz) * 0.6) * SHARD_CELL;
  if (isMark(x) || shrineDist(x, z) < 55) return null; // v Markově dimenzi jsou krystaly jen pod zemí
  return { key: `s${cx},${cz}`, x, z };
}

// Stromy v biomech: hustota, druh a výška kmene
export const TREE_DENSITY = { cherry: 0.3, jungle: 0.7, tundra: 0.14, savanna: 0.045, volcanic: 0.025, mushroom: 0.14, desert: 0.05 };
export const TREE_OF_BIOME = { cherry: 'cherry', jungle: 'jungle', tundra: 'spruce', savanna: 'acacia', volcanic: 'dead', mushroom: 'mushroom' };
export const TREE_TRUNK = { oak: 3, pine: 2.2, cherry: 2.6, jungle: 6.5, spruce: 2.4, acacia: 3.4, dead: 2.4, deadbush: 1.3, cactus: 2.2, mushroom: 3 };
export const TREE_NAMES = { oak: 'Dub', pine: 'Smrk', cherry: 'Třešeň', jungle: 'Strom z džungle', spruce: 'Zasněžený smrk', acacia: 'Akácie', dead: 'Suchý strom', deadbush: 'Suchý keř', cactus: 'Kaktus', mushroom: 'Obří houba' };
export const TREE_THICK = { jungle: 1.4, cactus: 1.7, mushroom: 1.6, deadbush: 0.6 }; // tloušťka kmene (ostatní 1)
// Strom v buňce mřížky 8×8 m (nebo null): poloha, velikost, druh. Pokácené stromy jsou v `removed`.
export function treeAt(cx, cz) {
  const key = `t${cx},${cz}`;
  if (removed.has(key)) return null;
  const r = hash2(cx, cz);
  const x = (cx + 0.15 + hash2(cx + 911, cz) * 0.7) * TREE_CELL;
  const z = (cz + 0.15 + hash2(cx, cz + 577) * 0.7) * TREE_CELL;
  const f = forest(x, z), mark = isMark(x), bio = mark ? 'meadow' : biomeAt(x, z);
  let kind;
  if (bio === 'meadow') {
    if (r > (f > 0.62 ? 0.6 : f > 0.5 ? 0.15 : 0.025)) return null;
    kind = hash2(cx + 7, cz + 11) < 0.25 + 0.5 * smoothstep(0.55, 0.8, f) ? 'pine' : 'oak';
  } else {
    if (r > TREE_DENSITY[bio]) return null;
    kind = bio === 'desert' ? (hash2(cx + 19, cz + 23) < 0.65 ? 'cactus' : 'deadbush') : TREE_OF_BIOME[bio];
  }
  if (shrineDist(x, z) < 30 || pondDip(x, z) > 0 || atSea(x, z)) return null; // ne ve vodě ani na pláži
  if (bio === 'volcanic' && volcanoDist(x, z) < 22) return null; // ani v kráteru s lávou
  const sh = shardAt(Math.floor(x / SHARD_CELL), Math.floor(z / SHARD_CELL));
  if (sh && (sh.x - x) ** 2 + (sh.z - z) ** 2 < 40) return null;
  const s = (0.75 + hash2(cx + 3, cz + 5) * 0.6) * (kind === 'deadbush' ? 0.45 : 1);
  return { key, x, z, s, rot: r * 1000, kind, pine: kind === 'pine' || kind === 'spruce', mark, trunkH: TREE_TRUNK[kind] * s * (mark ? 1.4 : 1), v: hash2(cx + 13, cz + 17) };
}
// Balvan v buňce mřížky 11×11 m (nebo null); 16 % balvanů je s železnou rudou. Vytěžené balvany jsou v `removed`.
export function rockAt(cx, cz) {
  const key = `r${cx},${cz}`;
  const r = hash2(cx + 5000, cz - 3000);
  const x = (cx + hash2(cx, cz + 99) * 0.8) * ROCK_CELL, z = (cz + hash2(cx + 99, cz) * 0.8) * ROCK_CELL;
  if (removed.has(key) || r > (forest(x, z) < 0.45 ? 0.12 : 0.06) || shrineDist(x, z) < 20 || pondDip(x, z) > 0 || atSea(x, z)) return null;
  const iron = hash2(cx - 7, cz + 13) < 0.16;
  const s = (iron ? 0.6 : 0.35) + hash2(cx + 1, cz + 2) ** 2 * 1.3;
  return { key, x, z, s, iron, r };
}
// Kmeny a velké balvany kolem bodu (kruhy { x, z, r }), do kterých nejde vejít – pro tvory.
const near = [];
export function collidersNear(x, z, M = 2.5) {
  near.length = 0;
  for (let cz = Math.floor((z - M) / TREE_CELL); cz <= Math.floor((z + M) / TREE_CELL); cz++)
    for (let cx = Math.floor((x - M) / TREE_CELL); cx <= Math.floor((x + M) / TREE_CELL); cx++) {
      const t = treeAt(cx, cz);
      if (t) near.push({ x: t.x, z: t.z, r: 0.3 * t.s * (TREE_THICK[t.kind] || 1) });
    }
  for (let cz = Math.floor((z - M) / ROCK_CELL); cz <= Math.floor((z + M) / ROCK_CELL); cz++)
    for (let cx = Math.floor((x - M) / ROCK_CELL); cx <= Math.floor((x + M) / ROCK_CELL); cx++) {
      const k = rockAt(cx, cz);
      if (k && k.s > 0.6) near.push({ x: k.x, z: k.z, r: 0.9 * k.s });
    }
  return near;
}

// ============================================================ rybníky a rybaření
// Hladina = nejnižší bod okraje prohlubně, takže voda nikde nepřeteče.
export const pondLevel = (p) => {
  if (p.level === undefined) {
    let lo = Infinity;
    for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2; lo = Math.min(lo, terrainH(p.x + Math.cos(a) * p.r, p.z + Math.sin(a) * p.r)); }
    p.level = lo - 0.12;
  }
  return p.level;
};
// Moře nebo pláž (stromy a balvany tu nerostou)
const atSea = (x, z) => oceanK(x, z) > 0.03 && terrainH(x, z) < SEA + 1.2;
// Je v bodě voda? Vrací výšku hladiny, nebo null (rybník nebo moře).
export function waterAt(x, y, z) {
  if (y <= SEA + 0.05 && oceanK(x, z) > 0.02 && terrainH(x, z) < SEA) return SEA;
  const p = pondOf(x, z);
  if (!p || shrineDist(p.x, p.z) < 90 || Math.hypot(x - p.x, z - p.z) > p.r) return null;
  const lv = pondLevel(p);
  return terrainH(x, z) < lv && y <= lv + 0.05 ? lv : null;
}
export const nearPond = (x, z, extra = 6) => { const p = pondOf(x, z); return !!p && Math.hypot(x - p.x, z - p.z) < p.r + extra; };
