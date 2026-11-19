// Aréna ve světě se souboji hráčů (volba pvp ve WORLDS): kruhová cihlová plocha se zdí, pilíři na krytí a pochodněmi,
// 40 m západně od svatyně (rovina bez rybníka). Postaví ji jednou server při startu světa (server/sim.js); hráči ji
// dostanou se světem. Místo pro oživení si spočítá každý sám (terén je všude stejný). Bez vedlejších účinků při načtení.
import { ROCK_CELL, TREE_CELL } from './constants.js';
import { rockAt, treeAt } from './nature.js';
import { bkey, blocks, removed, ruinsBuilt } from './state.js';
import { V, setVox, surfY, topY } from './voxels.js';

export const ARENA = { x: -40, z: 0, r: 13, wall: 4 };
const KEY = 'arena';
/** Výška podlahy arény (bloky podlahy leží v této vrstvě, hráči stojí o blok výš). */
export const arenaFloor = () => surfY(ARENA.x, ARENA.z);
// Pilíře na krytí: [dx, dz] středy 2×2 sloupů
const PILLARS = [[-6, -6], [5, -6], [-6, 5], [5, 5], [-1, -10], [-1, 9], [-10, -1], [9, -1]];

/** Postaví arénu, pokud ještě nestojí. */
export function ensureArena() {
  if (ruinsBuilt.has(KEY)) return false;
  ruinsBuilt.add(KEY);
  const F = arenaFloor(), R = ARENA.r;
  const put = (x, y, z, t) => blocks.set(bkey(x, y, z), t);
  for (let dx = -R - 2; dx <= R + 2; dx++) for (let dz = -R - 2; dz <= R + 2; dz++) {
    const d = Math.hypot(dx, dz);
    if (d > R + 1.5) continue;
    const x = ARENA.x + dx, z = ARENA.z + dz, top = topY(x, z);
    for (let y = F; y <= top + 2; y++) setVox(x, y, z, V.AIR); // kopec uvnitř arény zmizí
    for (let y = top + 1; y < F; y++) put(x, y, z, 'cobble'); // dolík se vyplní
    put(x, F, z, d > R - 2.5 && d <= R + 0.5 ? 'cobble' : 'bricks'); // podlaha, kraj tmavší
    if (d > R + 0.5) for (let y = 1; y <= ARENA.wall; y++) put(x, F + y, z, 'bricks'); // zeď
  }
  for (const [px, pz] of PILLARS) for (let ix = 0; ix < 2; ix++) for (let iz = 0; iz < 2; iz++) for (let y = 1; y <= 3; y++) put(ARENA.x + px + ix, F + y, ARENA.z + pz + iz, y === 3 ? 'bricks' : 'cobble');
  for (const [px, pz] of PILLARS) put(ARENA.x + px, F + 4, ARENA.z + pz, 'torch'); // světlo drží stínožrouty dál
  for (let a = 0; a < 12; a++) { // pochodně na zdi
    const ang = (a / 12) * Math.PI * 2, x = Math.round(ARENA.x + Math.cos(ang) * (R + 1)), z = Math.round(ARENA.z + Math.sin(ang) * (R + 1));
    if (blocks.get(bkey(x, F + ARENA.wall, z)) === 'bricks') put(x, F + ARENA.wall + 1, z, 'torch');
  }
  // stromy a balvany uvnitř zmizí (jako pokácené)
  const span = R + 3;
  for (let cx = Math.floor((ARENA.x - span) / TREE_CELL) - 1; cx <= Math.floor((ARENA.x + span) / TREE_CELL) + 1; cx++)
    for (let cz = Math.floor((ARENA.z - span) / TREE_CELL) - 1; cz <= Math.floor((ARENA.z + span) / TREE_CELL) + 1; cz++) {
      const t = treeAt(cx, cz);
      if (t && Math.hypot(t.x - ARENA.x, t.z - ARENA.z) < span) removed.add(t.key);
    }
  for (let cx = Math.floor((ARENA.x - span) / ROCK_CELL) - 1; cx <= Math.floor((ARENA.x + span) / ROCK_CELL) + 1; cx++)
    for (let cz = Math.floor((ARENA.z - span) / ROCK_CELL) - 1; cz <= Math.floor((ARENA.z + span) / ROCK_CELL) + 1; cz++) {
      const r = rockAt(cx, cz);
      if (r && Math.hypot(r.x - ARENA.x, r.z - ARENA.z) < span) removed.add(r.key);
    }
  return true;
}

/** Náhodné volné místo v aréně [x, y, z] (mimo pilíře, kus od zdi). */
export function arenaSpawn(rnd = Math.random) {
  const F = arenaFloor();
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2, d = 2 + rnd() * (ARENA.r - 5);
    const x = Math.floor(ARENA.x + Math.cos(a) * d), z = Math.floor(ARENA.z + Math.sin(a) * d);
    if (!blocks.has(bkey(x, F + 1, z)) && !blocks.has(bkey(x, F + 2, z))) return [x + 0.5, F + 1, z + 0.5];
  }
  return [ARENA.x + 0.5, F + 1, ARENA.z + 0.5];
}
/** Je místo uvnitř arény? */
export const inArena = (x, z) => Math.hypot(x - ARENA.x, z - ARENA.z) < ARENA.r + 1;
