// Kousky shaderů: terén a biomy (dvojče JS vzorce v shared/world/terrain.js) a šum trávy.
import { BIOME_START, MARK_CX, MARK_X, MUSH_CELL, MUSH_R, OCEAN_START, POND_CELL, SEA, VOLC_CELL, VOLC_R } from '../../../shared/world/terrain.js';

export const TERRAIN_GLSL = /* glsl */`
  uniform float uOceans; // 1 = svět s oceány (WORLD_GEN.oceans, nastavuje render/water.js)
  float shrineDist(vec2 p) { return length(p - vec2(p.x > ${MARK_X.toFixed(1)} ? ${MARK_CX.toFixed(1)} : 0.0, 0.0)); }
  float hash2i(float fx, float fz) {
    uint h = (uint(int(fx)) * 374761393u) ^ (uint(int(fz)) * 668265263u);
    h = (h ^ (h >> 13u)) * 1274126177u;
    h ^= h >> 16u;
    return float(h) / 4294967296.0;
  }
  float pondDip(vec2 p) {
    vec2 c = floor(p / ${POND_CELL.toFixed(1)});
    if (hash2i(c.x + 31.0, c.y + 913.0) >= 0.45) return 0.0;
    vec2 ctr = vec2(c.x + 0.3 + 0.4 * hash2i(c.x + 2.0, c.y + 9.0), c.y + 0.3 + 0.4 * hash2i(c.x + 9.0, c.y + 2.0)) * ${POND_CELL.toFixed(1)};
    float r = 9.0 + 5.0 * hash2i(c.x + 4.0, c.y + 4.0);
    float d = length(p - ctr) / r;
    if (d >= 1.0) return 0.0;
    float k = 1.0 - d * d;
    return 2.6 * k * k * smoothstep(60.0, 90.0, shrineDist(ctr));
  }
  // smoothstep, který (na rozdíl od vestavěného) funguje i s obrácenými hranami – stejně jako v JS
  float sst(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
  float regionDist(vec2 p, float cell, float salt, float chance) {
    vec2 c = floor(p / cell);
    if (p.x > ${MARK_X.toFixed(1)} || hash2i(c.x + salt, c.y - salt * 3.0) >= chance) return 1e9;
    vec2 ctr = vec2(c.x + 0.3 + 0.4 * hash2i(c.x + salt + 1.0, c.y + 7.0), c.y + 0.3 + 0.4 * hash2i(c.x + 7.0, c.y + salt + 1.0)) * cell;
    return length(p - ctr);
  }
  float volcanoDist(vec2 p) { return regionDist(p, ${VOLC_CELL.toFixed(1)}, 71.0, 0.5); }
  // wa = (louka, třešně, poušť, džungle), wb = (tundra, savana, sopka, houby)
  void biomeWeights(vec2 p, out vec4 wa, out vec4 wb) {
    wa = vec4(1.0, 0.0, 0.0, 0.0); wb = vec4(0.0);
    if (p.x > ${MARK_X.toFixed(1)}) return;
    float ring = sst(${BIOME_START.toFixed(1)}, ${(BIOME_START + 160).toFixed(1)}, shrineDist(p));
    if (ring <= 0.0) return;
    float t = sin(p.x * 0.0017 + 1.1) * cos(p.y * 0.0021 - 0.4) * 0.6 + sin((p.x + p.y) * 0.0009 + 2.3) * 0.4;
    float hm = cos(p.x * 0.0019 - 0.8) * sin(p.y * 0.0016 + 0.6) * 0.6 + sin((p.x - p.y) * 0.0011 + 0.9) * 0.4;
    float tundra = sst(-0.3, -0.48, t), hot = sst(0.18, 0.36, t), dry = sst(-0.02, -0.22, hm), wet = sst(0.12, 0.3, hm);
    float cherry = sst(0.2, 0.38, hm) * (1.0 - hot) * (1.0 - tundra);
    float vol = sst(${(VOLC_R * 1.7).toFixed(1)}, ${(VOLC_R * 1.05).toFixed(1)}, volcanoDist(p));
    float mus = sst(${(MUSH_R * 1.5).toFixed(1)}, ${(MUSH_R * 0.9).toFixed(1)}, regionDist(p, ${MUSH_CELL.toFixed(1)}, 43.0, 0.45)) * (1.0 - vol);
    float k = (1.0 - vol - mus) * ring;
    wa.y = cherry * k; wa.z = hot * dry * k; wa.w = hot * wet * k;
    wb = vec4(tundra * k, hot * (1.0 - dry) * (1.0 - wet) * k, vol * ring, mus * ring);
    wa.x = 1.0 - wa.y - wa.z - wa.w - wb.x - wb.y - wb.z - wb.w;
  }
  // oceány (dvojče oceanK / oceanH / beachK v shared/world/terrain.js)
  float oceanK(vec2 p) {
    if (uOceans < 0.5 || p.x > ${MARK_X.toFixed(1)}) return 0.0;
    float ring = sst(${OCEAN_START.toFixed(1)}, ${(OCEAN_START + 260).toFixed(1)}, shrineDist(p));
    if (ring <= 0.0) return 0.0;
    float n = sin(p.x * 0.00071 + 0.7) * cos(p.y * 0.00063 - 1.3) * 0.65 + sin((p.x * 0.6 - p.y) * 0.00042 + 2.1) * 0.35;
    return sst(0.18, 0.44, n) * ring;
  }
  float beachK(vec2 p, float h) { return min(1.0, oceanK(p) * 5.0) * sst(${(SEA + 2.6).toFixed(2)}, ${(SEA + 1.0).toFixed(2)}, h); }
  float terrainHW(vec2 p, vec4 wa, vec4 wb) {
    float h = sin(p.x * 0.011 + 1.3) * cos(p.y * 0.013 - 0.7) * 6.0
            + sin(p.x * 0.027 + p.y * 0.018) * 2.4
            + cos(p.y * 0.035 - p.x * 0.021 + 2.0) * 1.4
            + sin(p.x * 0.071 + 0.5) * sin(p.y * 0.064 + 1.7) * 0.5;
    if (p.x > ${MARK_X.toFixed(1)}) h = h * 1.6 + sin(p.x * 0.0045 + p.y * 0.006) * 5.0;
    if (wa.x < 1.0) {
      float dune = 0.5 + 0.5 * sin(p.x * 0.07 + sin(p.y * 0.023) * 2.5);
      dune = dune * dune * 2.4;
      float vd = volcanoDist(p);
      float cone = vd < ${VOLC_R.toFixed(1)} ? 30.0 * pow(1.0 - vd / ${VOLC_R.toFixed(1)}, 1.8) - 14.0 * pow(max(0.0, 1.0 - vd / 18.0), 1.5) : 0.0;
      h = wa.x * h + wa.y * (h * 1.15 + 0.6) + wa.z * (h * 0.45 + dune) + wa.w * (h * 1.3 + sin(p.x * 0.043 + 0.4) * sin(p.y * 0.051 + 1.2) * 2.2)
        + wb.x * (h * 0.55 + 0.8) + wb.y * (h * 0.7 + 0.4) + wb.z * (h * 0.9 + cone) + wb.w * (h * 0.8 + 0.5);
    }
    float o = oceanK(p);
    if (o > 0.0) {
      float isl = max(0.0, sin(p.x * 0.0047 + 1.0) * sin(p.y * 0.0053 + 2.0) - 0.72) * 60.0;
      h = h + (${(SEA - 9).toFixed(1)} + h * 0.25 + isl - h) * o;
    }
    return h * smoothstep(16.0, 70.0, shrineDist(p)) - pondDip(p) * (1.0 - wb.z);
  }
  float terrainH(vec2 p) { vec4 wa, wb; biomeWeights(p, wa, wb); return terrainHW(p, wa, wb); }
`;

export const NOISE_GLSL = /* glsl */`
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float meadow(vec2 p) { return vnoise(p * 0.07) * 0.65 + vnoise(p * 0.29) * 0.35; }
  // mk = 1 v Markově dimenzi: modrofialová tráva místo zelené.
  vec3 meadowColor(float m, float v, float mk) {
    float k = smoothstep(0.3, 0.9, (1.0 - m) * 0.75 + v * 0.35);
    vec3 home = mix(vec3(0.09, 0.22, 0.03), vec3(0.30, 0.29, 0.09), k);
    vec3 mark = mix(vec3(0.02, 0.15, 0.40), vec3(0.10, 0.10, 0.38), k);
    return mix(home, mark, mk);
  }
  // Barva krajiny podle biomů: tráva louky (m) se mísí s třešňovou trávou, pískem, džunglí, sněhem, savanou, popelem a podhoubím.
  vec3 biomeGround(vec4 wa, vec4 wb, vec3 meadowCol, float v) {
    return meadowCol * wa.x + vec3(0.16, 0.30, 0.07) * wa.y * (0.85 + v * 0.3) + vec3(0.46, 0.35, 0.19) * wa.z * (0.9 + v * 0.2)
      + vec3(0.03, 0.17, 0.02) * wa.w * (0.8 + v * 0.4) + vec3(0.58, 0.62, 0.68) * wb.x * (0.95 + v * 0.08)
      + vec3(0.42, 0.33, 0.10) * wb.y * (0.85 + v * 0.3) + vec3(0.06, 0.055, 0.055) * wb.z * (0.8 + v * 0.4) + vec3(0.22, 0.15, 0.26) * wb.w * (0.85 + v * 0.3);
  }
  // Holá zem blízko kamery: hlína pod trávou, v poušti písek, v tundře sníh, v sopce popel
  vec3 biomeSoil(vec4 wa, vec4 wb, vec3 soil, vec3 groundCol) {
    float bare = wa.z + wb.x + wb.z;
    return mix(soil, groundCol, bare);
  }
`;
