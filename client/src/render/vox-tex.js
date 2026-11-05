// Textury bloků podzemí (kámen, hlína, rudy…): barva, reliéf, drsnost, kov a svícení pro každý pixel.
// Jen funkce: volá ji vox-mesh.js. Každá dlaždice je jedna vrstva pole textur (T×T pixelů, navazuje přes okraje).
import { clamp, hash2 } from '../../../shared/util.js';
import { cavity, heightToNormal, noiseField, worley } from './texgen.js';

// Pořadí dlaždic = VOX[...].tile v shared/world/voxels.js.
export const VOX_TILE_NAMES = ['dirt', 'stone', 'coal', 'iron', 'crystal', 'bedrock', 'markdirt', 'markorite', 'granite', 'marble', 'basalt', 'sand', 'sandstone', 'snow', 'obsidian', 'copper', 'gold', 'quartz'];

/**
 * Vyrobí data všech dlaždic. Vrací bajty RGBA řazené po vrstvách (řádek 0 nahoře):
 * alb = barva (sRGB), orm = R zastínění spár, G drsnost, B kovovost, A svícení; nrm = normálová mapa.
 */
export function buildVoxTextures(T = 128) {
  const D = VOX_TILE_NAMES.length, P = T * T;
  const n1 = noiseField(T, 11, [4, 8, 16, 32], 0), n2 = noiseField(T, 23, [16, 32, 64, 128], 0.08), n3 = noiseField(T, 37, [2, 4, 8, 16], 0);
  const rock = worley(T, 5, 77), ore = worley(T, 6, 91), peb = worley(T, 10, 131), col = worley(T, 4, 171);
  const S = T / 128; // měřítko v pixelech (návrh je pro 128 px)
  const alb = new Uint8Array(P * D * 4), orm = new Uint8Array(P * D * 4), nrm = new Uint8Array(P * D * 4);
  const hgt = new Float32Array(P);
  const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // Kámen: zvrásněná skála – zkroucený šum se schůdky (odštípnuté vrstvy), řídké tenké praskliny, chladná šeď.
  const bil = (f, x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y), tx = x - ix, ty = y - iy, x0 = ((ix % T) + T) % T, y0 = ((iy % T) + T) % T, x1 = (x0 + 1) % T, y1 = (y0 + 1) % T;
    return f[y0 * T + x0] * (1 - tx) * (1 - ty) + f[y0 * T + x1] * tx * (1 - ty) + f[y1 * T + x0] * (1 - tx) * ty + f[y1 * T + x1] * tx * ty;
  };
  const rockH = new Float32Array(P), rockCrack = new Float32Array(P);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const i = y * T + x, wx = x + (n3[i] - 0.5) * 34 * S, wy = y + (bil(n3, x + 40 * S, y + 17 * S) - 0.5) * 34 * S;
    const t = bil(n1, wx, wy) * 12, f = t - Math.floor(t);
    rockH[i] = ((Math.floor(t) + sm(0.55, 1, f)) / 12 - 0.2) * 1.6; // schůdky = ostré hrany odlomených vrstev
    const rg = Math.abs(bil(n2, wx * 0.5, wy * 0.5) - 0.5);
    rockCrack[i] = sm(0.022, 0.0, rg) * sm(0.35, 0.55, bil(n1, x + 64 * S, y + 29 * S));
  }
  const stone = (i, base = [124, 127, 132], crackK = 0.5) => {
    const h = rockH[i], crack = rockCrack[i] * crackK * 2, tone = 0.84 + h * 0.3;
    const v = tone * (0.86 + (n2[i] - 0.5) * 0.2 + (hash2(i, 3) - 0.5) * 0.03) * (1 - 0.5 * crack);
    const warm = (n3[i] - 0.5) * 0.08;
    return [base[0] * v * (1 + warm), base[1] * v, base[2] * v * (1 - warm), h * 0.75 + n2[i] * 0.2 - crack * 0.25, 0.8 + (1 - h) * 0.12 + crack * 0.08, 0, 0];
  };
  const soil = (i, base) => {
    const p = peb.f1[i] < 3.2 * S && peb.id[i] < 0.32, clump = n3[i] > 0.68 ? 0.82 : 1;
    if (p) { const k = 1 - peb.f1[i] / (3.2 * S); const v = 0.8 + peb.id[i] * 0.5; return [base[0] * 0.9 * v + 30, base[1] * 0.95 * v + 26, base[2] * v + 24, 0.55 + k * 0.35, 0.75, 0, 0]; }
    const v = (0.74 + n1[i] * 0.34 + (n2[i] - 0.5) * 0.24) * clump;
    return [base[0] * v, base[1] * v, base[2] * v, 0.35 + n1[i] * 0.2 + n2[i] * 0.2 - (1 - clump) * 0.3, 0.95, 0, 0];
  };
  // Ruda: kámen + zrna/krystaly v buňkách (ore). kind: barvy, tvar (crystal = ostré kosočtverce), kov, drsnost, svícení.
  const oreAt = (i, x, y, o) => {
    const has = ore.id[i] < o.share;
    if (!has) return null;
    const a = ore.id[i] * 9.1, ca = Math.cos(a), sa = Math.sin(a);
    const u = ore.ox[i] * ca + ore.oy[i] * sa, w = -ore.ox[i] * sa + ore.oy[i] * ca;
    const r = (o.size + ore.id[i] * 6) * S;
    const d = o.crystal ? Math.abs(u) / 1.0 + Math.abs(w) / 0.42 : Math.hypot(u, w) * (1 + 0.35 * Math.sin(Math.atan2(w, u) * 3 + a));
    // vedlejší zrnka kolem hlavního
    const d2 = Math.hypot(ore.ox[i] - r * 0.9 * ca, ore.oy[i] - r * 0.9 * sa) * 1.6;
    const dd = Math.min(d / r, d2 / r);
    if (dd >= 1) return null;
    const k = 1 - dd, facet = o.crystal ? (u > 0) === (w > 0) ? 1.12 : 0.86 : 0.9 + n2[i] * 0.2;
    const c = o.alt && k < 0.35 && n2[i] > 0.5 ? o.alt : o.color; // měděnka jen na okrajích zrn
    const rim = sm(0, 0.25, k); // tmavší okraj zrna
    const v = facet * (0.7 + 0.3 * rim) * (0.92 + hash2(x, y) * 0.16);
    return [c[0] * v, c[1] * v, c[2] * v, rockH[i] * 0.75 + sm(0, 0.3, k) * (0.12 + k * (o.crystal ? 0.3 : 0.18)), o.alt && c === o.alt ? 0.8 : o.rough, o.alt && c === o.alt ? 0 : o.metal, o.glow ? Math.min(1, 0.35 + k * 1.2) : 0];
  };
  // zrna jsou velká a hustá (jako v Minecraftu), aby se rudný blok poznal i z dálky a nevypadal jako konfety
  const ORES = {
    coal: { share: 0.55, size: 10, color: [34, 33, 36], rough: 0.35, metal: 0 },
    iron: { share: 0.52, size: 9, color: [200, 146, 104], rough: 0.42, metal: 0.55 },
    crystal: { share: 0.6, size: 12, crystal: true, color: [56, 214, 250], rough: 0.08, metal: 0, glow: true },
    markorite: { share: 0.6, size: 12, crystal: true, color: [228, 58, 220], rough: 0.08, metal: 0, glow: true },
    copper: { share: 0.5, size: 9, color: [222, 122, 66], alt: [84, 176, 138], rough: 0.35, metal: 0.85 },
    gold: { share: 0.52, size: 9, color: [255, 206, 72], rough: 0.22, metal: 1 },
    quartz: { share: 0.6, size: 12, crystal: true, color: [242, 240, 252], rough: 0.12, metal: 0 },
  };

  const tile = (name, x, y, i) => {
    switch (name) {
      case 'dirt': return soil(i, [116, 82, 56]);
      case 'markdirt': return soil(i, [54, 80, 156]);
      case 'stone': return stone(i);
      case 'bedrock': { const v = 0.45 + n1[i] * 0.55 + (n2[i] - 0.5) * 0.3; return [56 * v, 56 * v, 62 * v, n1[i] * 0.7 + n2[i] * 0.3, 0.95, 0, 0]; }
      case 'granite': {
        const h = hash2(Math.floor(x / (2 * S)) * 5 + 3, Math.floor(y / (2 * S)) * 11 + 7), base = stone(i, [180, 130, 112], 0.12);
        if (h > 0.93) return [44, 38, 40, base[3] - 0.05, 0.3, 0.2, 0]; // tmavá slída (lesklá)
        if (h < 0.08) return [234, 228, 220, base[3] + 0.04, 0.5, 0, 0]; // křemen
        return base;
      }
      case 'marble': {
        const vein = Math.abs(Math.sin((x / T * 2.2 + y / T * 1.3 + n3[i] * 2.6) * Math.PI)), k = vein < 0.05 ? 0.6 : vein < 0.12 ? 0.82 : 1;
        const v = (0.93 + n1[i] * 0.07) * k;
        return [238 * v, 236 * v, 232 * v, 0.6 + n1[i] * 0.15 - (1 - k) * 0.08, 0.4, 0, 0];
      }
      case 'basalt': {
        const edge = col.f2[i] - col.f1[i], crack = sm(2.2 * S, 0.3 * S, edge), v = (0.6 + n2[i] * 0.3 + col.id[i] * 0.15) * (1 - 0.5 * crack);
        return [74 * v, 74 * v, 82 * v, 0.6 + Math.min(edge, 12 * S) / (12 * S) * 0.3 - crack * 0.5, 0.88, 0, 0];
      }
      case 'sand': {
        const rip = Math.sin((y / T * 10 + n3[i] * 2.2) * Math.PI * 2) * 0.5 + 0.5, v = 0.86 + n2[i] * 0.12 + rip * 0.05 + (hash2(x, y) - 0.5) * 0.1;
        return [222 * v, 194 * v, 136 * v, rip * 0.35 + n2[i] * 0.2, 0.95, 0, 0];
      }
      case 'sandstone': {
        const layer = Math.sin((y / T * 6 + n3[i] * 1.5) * Math.PI * 2), v = 0.84 + layer * 0.05 + n1[i] * 0.12;
        return [214 * v, 182 * v, 126 * v, 0.5 + layer * 0.12 + n2[i] * 0.15, 0.9, 0, 0];
      }
      case 'snow': { const v = 0.92 + n1[i] * 0.07 + (n2[i] - 0.5) * 0.04; return [240 * v, 246 * v, 252 * v, n1[i] * 0.5, 0.7, 0, hash2(x * 7, y * 3) > 0.996 ? 0.25 : 0]; }
      case 'obsidian': {
        const sh = rock.f2[i] - rock.f1[i], ridge = sm(1.6 * S, 0.2 * S, sh), v = 0.6 + n1[i] * 0.45 + ridge * 0.6;
        return [44 * v, 28 * v, 66 * v, 0.5 + Math.min(sh, 14 * S) / (14 * S) * 0.4, 0.1 + ridge * 0.2, 0, 0];
      }
      default: return oreAt(i, x, y, ORES[name]) || stone(i);
    }
  };

  for (let d = 0; d < D; d++) {
    const name = VOX_TILE_NAMES[d], ro = new Float32Array(P), me = new Float32Array(P), gl = new Float32Array(P);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const i = y * T + x, c = tile(name, x, y, i), o = (d * P + i) * 4;
      alb[o] = clamp(c[0], 0, 255); alb[o + 1] = clamp(c[1], 0, 255); alb[o + 2] = clamp(c[2], 0, 255); alb[o + 3] = 255;
      hgt[i] = clamp(c[3], 0, 1); ro[i] = c[4]; me[i] = c[5]; gl[i] = c[6];
    }
    const cav = cavity(hgt, T, T, Math.round(3 * S), 3.2), nm = heightToNormal(hgt, T, T, name === 'sand' || name === 'snow' ? 1.6 : 3.2);
    nrm.set(nm, d * P * 4);
    for (let i = 0; i < P; i++) {
      const o = (d * P + i) * 4;
      orm[o] = cav[i] * 255; orm[o + 1] = clamp(ro[i], 0.04, 1) * 255; orm[o + 2] = me[i] * 255; orm[o + 3] = gl[i] * 255;
    }
  }
  return { alb, orm, nrm, T, D };
}
