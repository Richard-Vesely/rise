// Světlo ohňů (pochodně, lucerny, táboráky) zapečené do podzemí. Skutečných světel je jen pár (render/blocks.js,
// nejbližší ohně), ale jeskyně se 30 pochodněmi má svítit celá: každý chunk podzemí si při stavbě spočítá, kolik
// světla z ohňů v okolí (do FIRE_R bloků) dopadá na každý roh každé stěny. Světlo ubývá se vzdáleností, stěna
// odvrácená od ohně dostane méně a skála mezi ohněm a stěnou světlo zastaví (po stěnách, ne po pixelech, takže stíny
// jsou kostičkové jako v Minecraftu). Shader podzemí (vox-mesh.js) ho přičte jako teplé světlo, které jemně mihotá. Nic se nepočítá za snímku.
// Jen funkce (volá je render/vox-mesh.js).
import { blockMeta, lights } from '../../../shared/world/state.js';
import { torchFlame, torchMeta } from '../../../shared/world/torch.js';
import { V, VMIN, getVox, topY } from '../../../shared/world/voxels.js';

/** Dosah světla ohně v blocích. */
export const FIRE_R = 13;
const FIRE = { torch: 1, lantern: 1.1, campfire: 1.45 }; // síla podle druhu ohně

/** Ohně, jejichž světlo může dosáhnout do obdélníku buněk x0..x1, z0..z1: { x, y, z (plamen), cx, cy, cz (buňka), k: síla }. */
export function fireSources(x0, z0, x1, z1) {
  const out = [];
  for (const [key, s] of lights) {
    const k = FIRE[s.type];
    if (!k || s.x < x0 - FIRE_R || s.x > x1 + FIRE_R || s.z < z0 - FIRE_R || s.z > z1 + FIRE_R) continue;
    const f = s.type === 'torch' ? torchFlame(torchMeta(key, s.x, s.y, s.z)) : [0, s.type === 'campfire' ? 0.5 : 0.3, 0];
    out.push({ x: s.x + 0.5 + f[0], y: s.y + f[1], z: s.z + 0.5 + f[2], cx: s.x, cy: s.y, cz: s.z, k });
  }
  return out;
}
// Síla (k), vzdálenost poloviční síly (a), strop součtu víc ohňů (cap), kolik dostane stěna bokem k ohni (side).
// Naladěno na snímcích (tests/playtest/shots.mjs, pohled torches): nejbližší ohně mají navíc skutečné světlo.
const TUNE = { k: 0.6, a: 1.8, cap: 1.0, side: 0.35 };
// Jas podle vzdálenosti: blízko ohně silný, dál rychle slábne a na kraji dosahu plynule zmizí.
function falloff(d) {
  const w = 1 - (d / FIRE_R) ** 4;
  return TUNE.k * w * w / (1 + (d / TUNE.a) ** 2);
}

/**
 * Pro stavbu jednoho chunku: null, když v dosahu žádný oheň není. known(x, y, z) = je buňka pevná podle už spočítaných
 * dat chunků (undefined = neví, pak se zeptá podzemí). Vrací { visible(ax, ay, az), at(vis, x, y, z, n) }:
 * visible = ohně, které vidí buňku vzduchu před stěnou; at = světlo v rohu stěny (x, y, z) s normálou n.
 */
export function fireBaker(bx, bz, P, known) {
  const src = fireSources(bx, bz, bx + P - 1, bz + P - 1);
  if (!src.length) return null;
  const far = new Map(), tops = new Map();
  const solid = (x, y, z) => {
    const r = known(x, y, z);
    if (r !== undefined) return r;
    if (y <= VMIN) return true;
    const ck = (x + 131072) * 262144 + (z + 131072);
    let top = tops.get(ck);
    if (top === undefined) tops.set(ck, (top = topY(x, z)));
    if (y > top) return false;
    const key = ck * 1024 + (y - VMIN);
    let v = far.get(key);
    if (v === undefined) far.set(key, (v = getVox(x, y, z, top) !== V.AIR));
    return v;
  };
  const R2 = (FIRE_R + 1) ** 2;
  return {
    visible(ax, ay, az) {
      const out = [];
      const ox = ax + 0.5, oy = ay + 0.5, oz = az + 0.5;
      for (const s of src) {
        const dx = s.x - ox, dy = s.y - oy, dz = s.z - oz, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > R2) continue;
        // paprsek od buňky k plameni po půl bloku: skála mezi nimi světlo zastaví
        const n = Math.ceil(Math.sqrt(d2) * 2);
        let ok = true;
        for (let i = 1; i < n && ok; i++) {
          const t = i / n, x = Math.floor(ox + dx * t), y = Math.floor(oy + dy * t), z = Math.floor(oz + dz * t);
          if ((x === ax && y === ay && z === az) || (x === s.cx && y === s.cy && z === s.cz)) continue;
          if (solid(x, y, z)) ok = false;
        }
        if (ok) out.push(s);
      }
      return out;
    },
    at(vis, x, y, z, nrm) {
      let sum = 0;
      for (const s of vis) {
        const dx = s.x - x, dy = s.y - y, dz = s.z - z, d = Math.hypot(dx, dy, dz);
        if (d >= FIRE_R) continue;
        const lam = d < 0.01 ? 1 : Math.max(0, (dx * nrm[0] + dy * nrm[1] + dz * nrm[2]) / d);
        sum += s.k * falloff(d) * (TUNE.side + (1 - TUNE.side) * lam); // i boční stěna trochu světla dostane (jako v Minecraftu)
      }
      return Math.min(sum, TUNE.cap);
    },
  };
}

// ---------- kdy chunky přepočítat: přibyl, zmizel nebo se otočil oheň, nebo se vedle ohně kopalo
export const relightChunks = new Set();
function relightAround(x, z) {
  const r = FIRE_R + 1;
  for (let cz = Math.floor((z - r) / 16); cz <= Math.floor((z + r) / 16); cz++)
    for (let cx = Math.floor((x - r) / 16); cx <= Math.floor((x + r) / 16); cx++) relightChunks.add(`${cx},${cz}`);
}
const known = new Map(); // klíč ohně -> otisk (druh + jak drží)
let scanAt = 0;
/** Desetkrát za sekundu porovná ohně ve světě s minule (funguje stejně pro vlastní stavbu, cizí hráče i načtení). */
export function scanFires() {
  const now = performance.now();
  if (now < scanAt) return;
  scanAt = now + 100;
  for (const [k, s] of lights) {
    if (!FIRE[s.type]) continue;
    const sig = s.type + (blockMeta.get(k) ?? '');
    if (known.get(k) !== sig) { known.set(k, sig); relightAround(s.x, s.z); }
  }
  for (const k of known.keys()) if (!lights.has(k)) { const [x, , z] = k.split(',').map(Number); known.delete(k); relightAround(x, z); }
}
/** Změna podzemí (kopání): blízký oheň teď může svítit dál (nebo méně). */
export function relightNearVox(x, y, z) {
  for (const s of lights.values()) {
    if (!FIRE[s.type]) continue;
    if (Math.abs(s.x - x) <= FIRE_R && Math.abs(s.y - y) <= FIRE_R && Math.abs(s.z - z) <= FIRE_R) { relightAround(x, z); return; }
  }
}
