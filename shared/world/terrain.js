// Terén a biomy: výška povrchu v každém bodě světa (stejný vzorec je v GLSL v client/src/render/glsl.js).
import { hash2, smoothstep } from '../util.js';
import { DRAGON_SHRINE, DRAGON_X, dragonHeight, isDragon } from './dragon-land.js';

// Markova dimenze leží daleko na východě světa (x > MARK_X), její svatyně je v bodě (MARK_CX, 0).
export const MARK_X = 20000, MARK_CX = 40000;
export const isMark = (x) => x > MARK_X;
export const SHRINES = [{ x: 0, z: 0, mark: false }, { x: MARK_CX, z: 0, mark: true }];
export const shrineOf = (x) => isDragon(x) ? DRAGON_SHRINE : SHRINES[isMark(x) ? 1 : 0];
export const shrineDist = (x, z) => { const s = shrineOf(x); return Math.hypot(x - s.x, z - s.z); };

// Terén: stejný vzorec v JavaScriptu (fyzika) i v GLSL (vykreslení). Markova dimenze má divočejší kopce.
// Rybníky: v každé buňce 130×130 m je s pravděpodobností 45 % mělká prohlubeň (stejný výpočet v JS i GLSL). Jezera: níž.
export const POND_CELL = 130;
// Malý rybník v buňce (nebo null). Uvnitř jezera a na jeho břehu rybníky nejsou.
function smallPondOf(x, z) {
  if (isDragon(x)) return null;
  const cx = Math.floor(x / POND_CELL), cz = Math.floor(z / POND_CELL);
  if (hash2(cx + 31, cz + 913) >= 0.45) return null;
  const p = {
    key: `p${cx},${cz}`, cx, cz,
    x: (cx + 0.3 + 0.4 * hash2(cx + 2, cz + 9)) * POND_CELL, z: (cz + 0.3 + 0.4 * hash2(cx + 9, cz + 2)) * POND_CELL,
    r: 9 + 5 * hash2(cx + 4, cz + 4),
  };
  const L = lakeOf(p.x, p.z);
  return L && Math.hypot(p.x - L.x, p.z - L.z) < L.r * LAKE_EDGE + p.r ? null : p;
}
/** Vodní plocha v bodě: jezero (když je bod u něj, do LAKE_EDGE × poloměr) nebo rybník v buňce. Jezero má `lake: true`. */
export function pondOf(x, z) {
  const L = lakeOf(x, z);
  if (L && Math.hypot(x - L.x, z - L.z) < L.r * LAKE_EDGE) return L;
  return smallPondOf(x, z);
}
export function pondDip(x, z) {
  const p = smallPondOf(x, z);
  if (!p) return 0;
  const d = Math.hypot(x - p.x, z - p.z) / p.r;
  if (d >= 1) return 0;
  return 2.6 * (1 - d * d) ** 2 * smoothstep(60, 90, shrineDist(p.x, p.z));
}
// ============================================================ biomy
// Dál než 380 m od domovské svatyně se střídají biomy podle "teploty" a "vlhkosti" (pomalé vlny, stejný výpočet v JS i GLSL),
// takže přechody jsou plynulé. Sopky a houbové lesy jsou vzácné oblasti kolem náhodných středů (mřížka jako u rybníků).
const BIOMES = ['meadow', 'cherry', 'desert', 'jungle', 'tundra', 'savanna', 'volcanic', 'mushroom'];
export const BIOME_NAMES = { meadow: 'Louka a les', cherry: 'Třešňový les', desert: 'Poušť', jungle: 'Džungle', tundra: 'Zasněžená tundra', savanna: 'Savana', volcanic: 'Sopečná oblast', mushroom: 'Houbový les' };
export const BIOME_START = 35, BIOME_SCALE = 12, BIOME_BLEND = 45, VOLC_CELL = 1100, VOLC_R = 110, MUSH_CELL = 900, MUSH_R = 170;
// Střed vzácné oblasti v buňce mřížky (nebo null)
export function regionOf(x, z, cell, salt, chance) {
  const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
  if (hash2(cx + salt, cz - salt * 3) >= chance) return null;
  return { x: (cx + 0.3 + 0.4 * hash2(cx + salt + 1, cz + 7)) * cell, z: (cz + 0.3 + 0.4 * hash2(cx + 7, cz + salt + 1)) * cell };
}
export const volcanoOf = (x, z) => {
  if (isMark(x) || isDragon(x)) return null;
  const v = regionOf(x, z, VOLC_CELL, 71, 0.5);
  return v && oceanK(v.x, v.z) > 0 ? null : v; // ve světě s oceány nejsou sopky v moři
};
export const volcanoDist = (x, z) => { const v = volcanoOf(x, z); return v ? Math.hypot(x - v.x, z - v.z) : 1e9; };
const mushDist = (x, z) => { const v = isMark(x) ? null : regionOf(x, z, MUSH_CELL, 43, 0.45); return v ? Math.hypot(x - v.x, z - v.z) : 1e9; };
// Váhy biomů v bodě (součet = 1), pořadí jako BIOMES
const BW = [1, 0, 0, 0, 0, 0, 0, 0];
export function biomeWeights(x, z, w = BW) {
  w.fill(0);
  w[0] = 1;
  if (isDragon(x)) { w[0] = 0; w[6] = 1; return w; }
  if (isMark(x)) return w;
  const ring = smoothstep(BIOME_START, BIOME_START + BIOME_BLEND, shrineDist(x, z));
  if (ring <= 0) return w;
  // Zvlněné hranice tvoří zálivy a výběžky biomů; stejný výpočet je v GLSL.
  const bx = x * BIOME_SCALE, bz = z * BIOME_SCALE;
  const cx = bx + Math.sin(bz * 0.004) * 180, cz = bz + Math.sin(bx * 0.0035 + 0.7) * 180;
  const t = Math.sin(cx * 0.0017 + 1.1) * Math.cos(cz * 0.0021 - 0.4) * 0.6 + Math.sin((cx + cz) * 0.0009 + 2.3) * 0.4;
  const hm = Math.cos(cx * 0.0019 - 0.8) * Math.sin(cz * 0.0016 + 0.6) * 0.6 + Math.sin((cx - cz) * 0.0011 + 0.9) * 0.4;
  const tundra = smoothstep(-0.3, -0.48, t), hot = smoothstep(-0.02, 0.2, t), dry = smoothstep(0.12, -0.14, hm), wet = smoothstep(0.12, 0.3, hm);
  const cherry = smoothstep(0.2, 0.38, hm) * (1 - hot) * (1 - tundra);
  const vol = smoothstep(VOLC_R * 1.7, VOLC_R * 1.05, volcanoDist(x, z)), mus = smoothstep(MUSH_R * 1.5, MUSH_R * 0.9, mushDist(x, z)) * (1 - vol);
  const k = (1 - vol - mus) * ring; // podíl běžných biomů
  w[1] = cherry * k; w[2] = hot * dry * k; w[3] = hot * wet * k; w[4] = tundra * k; w[5] = hot * (1 - dry) * (1 - wet) * k;
  w[6] = vol * ring; w[7] = mus * ring;
  w[0] = 1 - w[1] - w[2] - w[3] - w[4] - w[5] - w[6] - w[7];
  return w;
}
export const biomeAt = (x, z) => { const w = biomeWeights(x, z); let b = 0; for (let i = 1; i < 8; i++) if (w[i] > w[b]) b = i; return BIOMES[b]; };
// Výška podle biomů: duny v poušti, rovná tundra, kopcovitá džungle, kužel sopky s kráterem…
function biomeHeight(h0, x, z, w) {
  if (w[0] >= 1) return h0;
  const dune = (0.5 + 0.5 * Math.sin(x * 0.07 + Math.sin(z * 0.023) * 2.5)) ** 2 * (3.5 + 2 * (0.5 + 0.5 * Math.sin(z * 0.009 + x * 0.006)));
  const vd = volcanoDist(x, z), cone = vd < VOLC_R ? 30 * (1 - vd / VOLC_R) ** 1.8 - 14 * Math.max(0, 1 - vd / 18) ** 1.5 : 0;
  return w[0] * h0 + w[1] * (h0 * 1.15 + 0.6) + w[2] * (h0 * 0.45 + dune) + w[3] * (h0 * 1.3 + Math.sin(x * 0.043 + 0.4) * Math.sin(z * 0.051 + 1.2) * 2.2)
    + w[4] * (h0 * 0.55 + 0.8) + w[5] * (h0 * 0.7 + 0.4) + w[6] * (h0 * 0.9 + cone) + w[7] * (h0 * 0.8 + 0.5);
}
// ============================================================ oceány
// Dál než OCEAN_START od domovské svatyně jsou velká moře (pomalé vlny s vlnovou délkou kolem 1,5 km, stejný výpočet v JS i GLSL).
// Dno klesá asi 9 m pod hladinu SEA, u břehu vzniknou písečné pláže; z moře tu a tam vystoupí ostrov.
export const SEA = -2.5, OCEAN_START = 520;
// Oceány má jen svět vytvořený s nimi (uloží se jako `oceans` ve světě, shared/world/save.js): starým světům by moře zatopilo
// nebo podemlelo stavby, takže jejich terén zůstává přesně jako dřív. V grafice to samé říká uniform uOceans (glsl.js).
export const WORLD_GEN = { oceans: false };
/** Jak moc je bod v moři (0 = pevnina, 1 = otevřené moře). */
export function oceanK(x, z) {
  if (!WORLD_GEN.oceans || isMark(x) || isDragon(x)) return 0;
  const ring = smoothstep(OCEAN_START, OCEAN_START + 260, shrineDist(x, z));
  if (ring <= 0) return 0;
  const n = Math.sin(x * 0.00071 + 0.7) * Math.cos(z * 0.00063 - 1.3) * 0.65 + Math.sin((x * 0.6 - z) * 0.00042 + 2.1) * 0.35;
  return smoothstep(0.18, 0.44, n) * ring;
}
function oceanH(h, x, z, o) {
  const isl = Math.max(0, Math.sin(x * 0.0047 + 1.0) * Math.sin(z * 0.0053 + 2.0) - 0.72) * 60; // ostrovy
  return h + (SEA - 9 + h * 0.25 + isl - h) * o;
}
/** Pláž: písek u moře a na mořském dně (0–1). */
export const beachK = (x, z, h) => Math.min(1, oceanK(x, z) * 5) * smoothstep(SEA + 2.6, SEA + 1.0, h);
// Terén bez rybníků a jezer (z toho se počítá i rovina, na kterou se srovná okolí jezera)
function baseH(x, z, w) {
  let h = Math.sin(x * 0.011 + 1.3) * Math.cos(z * 0.013 - 0.7) * 6.0
          + Math.sin(x * 0.027 + z * 0.018) * 2.4
          + Math.cos(z * 0.035 - x * 0.021 + 2.0) * 1.4
          + Math.sin(x * 0.071 + 0.5) * Math.sin(z * 0.064 + 1.7) * 0.5;
  if (isMark(x)) h = h * 1.6 + Math.sin(x * 0.0045 + z * 0.006) * 5.0;
  h = biomeHeight(h, x, z, w);
  const o = oceanK(x, z);
  if (o > 0) h = oceanH(h, x, z, o);
  return h * smoothstep(16, 70, shrineDist(x, z));
}
export function terrainH(x, z) {
  if (isDragon(x)) return dragonHeight(x, z);
  const w = biomeWeights(x, z);
  const h = baseH(x, z, w) - pondDip(x, z) * (1 - w[6]); // v sopce rybníky nejsou
  const L = lakeOf(x, z);
  if (!L) return h;
  const d = Math.hypot(x - L.x, z - L.z) / L.r;
  if (d >= LAKE_EDGE) return h;
  return h + (L.hc - h) * smoothstep(LAKE_EDGE, 1.15, d) - L.depth * smoothstep(1, 0.7, d); // rovný břeh, pak dno
}
// ============================================================ jezera
// Vzácná velká jezera (průměr 100–240 m, hloubka 6–8 m) v mřížce 1000×1000 m. Jsou dál než 500 m od domovské svatyně
// (tam stojí stavby hráčů), ne v Markově dimenzi a ne u sopky. Okolí jezera (do LAKE_EDGE × poloměr) se plynule srovná na
// výšku terénu ve středu jezera (do 1,15 poloměru úplně), takže hladina má rovný břeh; od 0,7 poloměru je ploché dno. Stejný výpočet je v GLSL.
export const LAKE_CELL = 1000, LAKE_MIN = 500, LAKE_EDGE = 1.45;
const lakes = new Map();
export function lakeOf(x, z) {
  if (isDragon(x)) return null;
  const cx = Math.floor(x / LAKE_CELL), cz = Math.floor(z / LAKE_CELL), key = `l${cx},${cz}`;
  const ck = (WORLD_GEN.oceans ? 'o' : '') + key; // svět s oceány má jezera jen mimo moře
  let L = lakes.get(ck);
  if (L !== undefined) return L;
  L = null;
  if (hash2(cx + 57, cz + 311) < 0.42) {
    const lx = (cx + 0.25 + 0.5 * hash2(cx + 61, cz + 5)) * LAKE_CELL, lz = (cz + 0.25 + 0.5 * hash2(cx + 5, cz + 61)) * LAKE_CELL;
    const r = 50 + 70 * hash2(cx + 8, cz + 8), e = r * LAKE_EDGE;
    if (lx - e > DRAGON_X && lx + e < MARK_X && Math.hypot(lx, lz) > LAKE_MIN + e && volcanoDist(lx, lz) > VOLC_R * 1.7 + e && oceanK(lx, lz) <= 0) {
      const hc = baseH(lx, lz, biomeWeights(lx, lz));
      L = { key, cx, cz, x: lx, z: lz, r, depth: 6 + 2 * hash2(cx + 9, cz + 3), hc, level: hc - 0.12, lake: true };
    }
  }
  lakes.set(ck, L);
  return L;
}
/** Nejbližší jezero k bodu (prohledá buňky do vzdálenosti R), nebo null. */
export function nearestLake(x, z, R = 6000) {
  let best = null, bd = Infinity;
  for (let cz = Math.floor((z - R) / LAKE_CELL); cz <= Math.floor((z + R) / LAKE_CELL); cz++)
    for (let cx = Math.floor((x - R) / LAKE_CELL); cx <= Math.floor((x + R) / LAKE_CELL); cx++) {
      const L = lakeOf((cx + 0.5) * LAKE_CELL, (cz + 0.5) * LAKE_CELL), d = L ? Math.hypot(L.x - x, L.z - z) : Infinity;
      if (d < bd) { bd = d; best = L; }
    }
  return best;
}
/** Je bod v jezeře (nebo do `m` × poloměr od středu)? Na stromy, balvany, stavby a tvory. */
export const inLake = (x, z, m = 1.08) => { const L = lakeOf(x, z); return !!L && Math.hypot(x - L.x, z - L.z) < L.r * m; };
export const forest = (x, z) => 0.5 + 0.5 * (Math.sin(x * 0.0081 + 0.4) * Math.cos(z * 0.0093 + 1.1) * 0.75 + Math.sin(x * 0.023 - z * 0.017) * 0.3);
