// Pomocné matematické funkce (bez DOM a Three.js, fungují v prohlížeči i v Node.js).
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
export function hash2(x, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** Pevná náhoda: stejné seed = stejná řada čísel 0–1 (textury a modely vypadají pokaždé stejně). */
export const rng = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
/** Text do HTML: & < > " ' jako číselné entity (jméno hráče, název dokumentu… nic nerozbije ani v atributu). */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/**
 * Protne úsečka a→b kouli se středem (cx, cy, cz) a poloměrem r? (šíp za jeden krok letu, paprsek kouzla.)
 * @param {{ x: number, y: number, z: number }} a
 * @param {{ x: number, y: number, z: number }} b
 */
export function segHitsSphere(a, b, cx, cy, cz, r) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L2 = dx * dx + dy * dy + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((cx - a.x) * dx + (cy - a.y) * dy + (cz - a.z) * dz) / L2));
  const ex = a.x + dx * t - cx, ey = a.y + dy * t - cy, ez = a.z + dz * t - cz;
  return ex * ex + ey * ey + ez * ez < r * r;
}

export function hash3(x, y, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 1103515245) ^ Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// 3D hodnotový šum; pamatuje si poslední mřížkovou buňku, takže generování sloupců je rychlé.
export function makeNoise3(f, fy, ox, oy, oz) {
  let lx = NaN, ly = 0, lz = 0;
  const c = new Float64Array(8);
  return (x, y, z) => {
    x = x * f + ox; y = y * fy + oy; z = z * f + oz;
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    if (ix !== lx || iy !== ly || iz !== lz) {
      lx = ix; ly = iy; lz = iz;
      c[0] = hash3(ix, iy, iz); c[1] = hash3(ix + 1, iy, iz); c[2] = hash3(ix, iy + 1, iz); c[3] = hash3(ix + 1, iy + 1, iz);
      c[4] = hash3(ix, iy, iz + 1); c[5] = hash3(ix + 1, iy, iz + 1); c[6] = hash3(ix, iy + 1, iz + 1); c[7] = hash3(ix + 1, iy + 1, iz + 1);
    }
    let fx = x - ix, fy2 = y - iy, fz = z - iz;
    fx = fx * fx * (3 - 2 * fx); fy2 = fy2 * fy2 * (3 - 2 * fy2); fz = fz * fz * (3 - 2 * fz);
    const a = c[0] + (c[1] - c[0]) * fx, b = c[2] + (c[3] - c[2]) * fx, d = c[4] + (c[5] - c[4]) * fx, e = c[6] + (c[7] - c[6]) * fx;
    const p = a + (b - a) * fy2, q = d + (e - d) * fy2;
    return p + (q - p) * fz;
  };
}
