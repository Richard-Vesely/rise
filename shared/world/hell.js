// Peklo: velká uzavřená jeskyně z pekelné skály vysoko na nebi daleko od všeho (podlaha, zdi i střecha, nedá se
// vykopat ven). Uvnitř jsou jezírka lávy, sloupy z ohnivé rudy, ďáblové (shared/sim/mobs.js) a u severní zdi socha
// Marka boha všemohoucího s oltářem. Ven se dostaneš jen přes oltář (výkupné HELL_PRICE v shared/data/hell.js;
// odevzdané věci zmizí). Dovnitř vede portál do pekla (client/src/world/hell.js). Postaví ho jednou ten, kdo drží
// svět (updateSpawns), bloky jsou "fixed". Bez vedlejších účinků při načtení.
import { bkey, blocks, ruinsBuilt } from './state.js';

/** Kde peklo je: střed podlahy (x, z), výška podlahy y, poloviční šířka, výška stropu nad podlahou. */
export const HELL = { x: 0, z: 30000, y: 160, half: 18, roof: 11 };
/** Kam se hráč objeví v pekle: jižní část, čelem k soše. */
export const HELL_SPOT = [HELL.x + 0.5, HELL.y + 1, HELL.z + HELL.half - 3.5];
/** Kde je oltář (klíč bloku) a socha (střed). */
export const ALTAR = [HELL.x, HELL.y + 1, HELL.z - HELL.half + 4];
const KEY = 'hell';

/** Je bod v pekle? */
export const inHell = (x, y, z) =>
  Math.abs(x - (HELL.x + 0.5)) <= HELL.half + 1.5 && Math.abs(z - (HELL.z + 0.5)) <= HELL.half + 1.5 && y >= HELL.y - 3 && y <= HELL.y + HELL.roof + 3;
/** Stojí peklo (podlaha uprostřed)? */
export const hellBuilt = () => blocks.get(bkey(HELL.x, HELL.y, HELL.z)) === 'hell_rock';

// jezírka lávy (střed x, z, poloměr) a sloupy ohnivé rudy (x, z, výška), relativně ke středu
const POOLS = [[-10, -4, 2.6], [9, 3, 3.1], [-6, 9, 2.2], [12, -10, 2.4], [-13, 12, 1.8]];
const ORE = [[-15, -14, 3], [15, 14, 2], [-15, 4, 2], [15, -3, 3], [3, -12, 2], [-4, 3, 1], [6, 12, 2]];

/** Postaví peklo, pokud ještě nestojí. Vrací true, když ho právě postavilo. */
export function ensureHell() {
  if (ruinsBuilt.has(KEY)) return false;
  ruinsBuilt.add(KEY);
  const { x: X, y: Y, z: Z, half: H, roof: R } = HELL;
  const put = (x, y, z, t) => blocks.set(bkey(x, y, z), t);
  const lava = (dx, dz) => POOLS.some(([px, pz, r]) => Math.hypot(dx - px, dz - pz) <= r);
  for (let dx = -H - 1; dx <= H + 1; dx++) for (let dz = -H - 1; dz <= H + 1; dz++) {
    const edge = Math.max(Math.abs(dx), Math.abs(dz)) === H + 1;
    put(X + dx, Y, Z + dz, 'hell_rock'); // podlaha
    put(X + dx, Y + R + 1, Z + dz, 'hell_rock'); // střecha
    if (edge) for (let y = 1; y <= R; y++) put(X + dx, Y + y, Z + dz, 'hell_rock'); // zdi
    else if (lava(dx, dz)) put(X + dx, Y + 1, Z + dz, 'hell_lava'); // láva leží na podlaze (pod ní je skála, nepropadneš)
  }
  for (const [dx, dz, h] of ORE) for (let y = 1; y <= h; y++) put(X + dx, Y + y, Z + dz, 'fire_gem_ore');
  // socha Marka boha všemohoucího: podstavec, postava s rozpaženýma rukama a korunou, před ní oltář
  const [ax, , az] = ALTAR, sz = az - 2;
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) put(ax + dx, Y + 1, sz + dz, 'hell_rock');
  for (let y = 2; y <= 7; y++) put(ax, Y + y, sz, 'hell_statue');
  for (const dx of [-2, -1, 1, 2]) put(ax + dx, Y + 6, sz, 'hell_statue'); // ruce
  for (const dx of [-1, 1]) put(ax + dx, Y + 9, sz, 'hell_statue'); // koruna
  put(ax, Y + 9, sz, 'hell_statue');
  put(ax, Y + 1, az, 'hell_altar');
  return true;
}

/**
 * Kde se má zrodit ďábel: náhodné místo na podlaze (ne v lávě, ne u sochy) aspoň 8 m od hráče.
 * @returns {[number, number, number] | null} [x, y, z]
 */
export function devilSpot(cx, cz, rnd = Math.random) {
  const { x: X, y: Y, z: Z, half: H } = HELL;
  for (let i = 0; i < 12; i++) {
    const x = X + 0.5 + (rnd() * 2 - 1) * (H - 2), z = Z + 0.5 + (rnd() * 2 - 1) * (H - 2);
    if (Math.hypot(x - cx, z - cz) < 8 || z < Z - H + 7) continue;
    if (blocks.has(bkey(Math.floor(x), Y + 1, Math.floor(z)))) continue;
    return [x, Y + 1, z];
  }
  return null;
}
