// Socha darů u spawnu (jen server kroužku): kamenný podstavec, na něm zlatá postava a před ní pokladnička,
// do které hráči dávají dary vlastníkovi serveru. Postaví ji jednou server při startu světa (server/sim.js),
// hráči ji dostanou se světem. Bloky sochy jsou "fixed" (shared/data/blocks.js): nedají se vytěžit a server
// odmítne každou změnu na jejich místě (guardStatueOps). Pokladnička samotná je v server/donation-box.js.
// Bez vedlejších účinků při načtení.
import { ROCK_CELL, TREE_CELL } from './constants.js';
import { rockAt, treeAt } from './nature.js';
import { bkey, blocks, removed, ruinsBuilt } from './state.js';
import { inLake, pondOf } from './terrain.js';
import { V, setVox, surfY, topY } from './voxels.js';
import { BLOCKS } from '../data/index.js';

const KEY = 'statue';
// Kam sochu postavit: první místo, kde nikdo nic nepostavil (spawn je [1.5, 15.5], svatyně v [0, 0]).
// Postava stojí na (x, z) a dívá se na sever (k spawnu), pokladnička je 2 bloky před ní (z − 2).
export const STATUE_SPOTS = [{ x: 9, z: 23 }, { x: -9, z: 26 }, { x: 14, z: 30 }, { x: -14, z: 32 }, { x: 22, z: 22 }, { x: 0, z: 36 }];
const FOOT = { x0: -1, x1: 1, z0: -3, z1: 1 }; // půdorys: podstavec 3×3 + pokladnička, s okrajem 1 bloku

/** Je blok na klíči součást sochy (nedá se změnit)? */
export const isFixedKey = (k) => !!BLOCKS[blocks.get(k)]?.fixed;

// Volné místo: žádné bloky hráčů v půdorysu (s okrajem), žádný rybník ani jezero.
function free(s) {
  if (inLake(s.x, s.z, 1.25) || pondOf(s.x, s.z)) return false;
  for (const k of blocks.keys()) {
    const [x, , z] = k.split(',').map(Number);
    if (x >= s.x + FOOT.x0 - 1 && x <= s.x + FOOT.x1 + 1 && z >= s.z + FOOT.z0 - 1 && z <= s.z + FOOT.z1 + 1) return false;
  }
  return true;
}

/**
 * Postaví sochu, pokud ještě nestojí. Vrací místo { x, z } (nebo null, když už stojí nebo není kde).
 * Bloky kladou SyncMap, takže se uloží se světem jako každá jiná stavba.
 */
export function ensureStatue() {
  if (ruinsBuilt.has(KEY)) return null;
  const s = STATUE_SPOTS.find(free);
  if (!s) return null;
  ruinsBuilt.add(KEY);
  const B = surfY(s.x, s.z); // první vrstva nad zemí
  const put = (x, y, z, t) => blocks.set(bkey(x, y, z), t);
  // základ: kopeček pod sochou zmizí, dolík se vyplní kamenem sochy
  for (let dx = FOOT.x0; dx <= FOOT.x1; dx++) for (let dz = FOOT.z0; dz <= FOOT.z1; dz++) {
    const x = s.x + dx, z = s.z + dz, top = topY(x, z);
    for (let y = B; y <= top + 2; y++) setVox(x, y, z, V.AIR);
    for (let y = top + 1; y < B; y++) put(x, y, z, 'statue_stone');
  }
  // podstavec 3×3, dva bloky vysoký
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let y = 0; y < 2; y++) put(s.x + dx, B + y, s.z + dz, 'statue_stone');
  // zlatá postava: nohy, tělo, ruce podél těla, hlava
  for (let y = 2; y <= 6; y++) put(s.x, B + y, s.z, 'statue_gold');
  for (const dx of [-1, 1]) for (const y of [4, 5]) put(s.x + dx, B + y, s.z, 'statue_gold');
  // pokladnička před sochou
  put(s.x, B, s.z - 2, 'donation_box');
  clearNature(s.x, s.z, 4); // stromy a balvany v půdorysu zmizí (jako pokácené)
  return s;
}

/** Stromy a balvany do vzdálenosti span od (x, z) zmizí (jako pokácené). Pro stavby serveru: socha, vězení. */
export function clearNature(x, z, span) {
  for (let cx = Math.floor((x - span) / TREE_CELL) - 1; cx <= Math.floor((x + span) / TREE_CELL) + 1; cx++)
    for (let cz = Math.floor((z - span) / TREE_CELL) - 1; cz <= Math.floor((z + span) / TREE_CELL) + 1; cz++) {
      const t = treeAt(cx, cz);
      if (t && Math.hypot(t.x - x, t.z - z) < span) removed.add(t.key);
    }
  for (let cx = Math.floor((x - span) / ROCK_CELL) - 1; cx <= Math.floor((x + span) / ROCK_CELL) + 1; cx++)
    for (let cz = Math.floor((z - span) / ROCK_CELL) - 1; cz <= Math.floor((z + span) / ROCK_CELL) + 1; cz++) {
      const r = rockAt(cx, cz);
      if (r && Math.hypot(r.x - x, r.z - z) < span) removed.add(r.key);
    }
}

/**
 * Změny světa od hráče, které by sahaly na sochu (blok, otočení, podzemí pod ní), se zahodí.
 * Vrací { ops: co projde, fix: opravy pro hráče (skutečný stav) }.
 * @param {unknown[]} ops
 */
export function guardStatueOps(ops) {
  const ok = [], fix = [];
  for (const o of ops) {
    if (!Array.isArray(o)) continue;
    if (o[0] === 'm' && (o[1] === 'blocks' || o[1] === 'blockMeta') && isFixedKey(String(o[2]))) {
      fix.push(['m', 'blocks', String(o[2]), blocks.get(String(o[2]))]);
      continue;
    }
    if (o[0] === 'v' && isFixedKey(bkey(o[1], Number(o[2]) + 1, o[3]))) continue; // podkopání sochy
    ok.push(o);
  }
  return { ops: ok, fix };
}
