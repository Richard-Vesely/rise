// Vězení (jen server kroužku, pravomoc vlastníka serveru: server/prison.js). Bludiště z bílých nezničitelných bloků
// vysoko na nebi daleko od všeho (rozhodl Richard 18.11.2026: vězení má být zábavné, ven za ~5 minut).
// - Bludiště PRISON_N × PRISON_N buněk (chodba 3 bloky, zeď 1 blok, výška zdi 4: nepřeskočí se). Vězeň začíná uprostřed.
// - Na každé straně je brána ven (PRISON_EXITS). Při každém zavření do vězení vybere server jednu, ostatní vězně nepustí.
// - V slepých uličkách stojí runové kameny (PRISON_RUNES; úkol „najdi runy“ v server/prison-tasks.js).
// - Žijí tu obří pavouci (shared/sim/mobs.js, spiderSpot); dají se zabít (úkol „příšery“).
// Bludiště je vždy stejné (pevné semínko), takže ho všichni (server i prohlížeče) znají bez posílání. Postaví ho jednou
// server při startu světa (server/sim.js); bloky jsou "fixed" (shared/data/blocks.js), nikdo je nevytěží (guardStatueOps,
// guardPrisonerOps). Staré vězení (plošina se sochou) se při stavbě smaže. Bez vedlejších účinků při načtení.
import { bkey, blocks, ruinsBuilt } from './state.js';
import { clearNature } from './statue.js';
import { getVox } from './voxels.js';

/** Počet buněk na stranu (liché: start je v prostřední buňce). */
export const PRISON_N = 9;
const CELL = 4; // 3 bloky chodba + 1 blok zeď
const WALL = 4; // výška zdi
/** Kde vězení je: střed podlahy (x, z), výška podlahy y, poloviční šířka (podlaha je 2·half + 1 bloků), výška zdi. */
export const PRISON = { x: 0, z: -24000, y: 120, half: (PRISON_N * CELL) / 2, wall: WALL };
/** Kolik obřích pavouků najednou žije ve vězení. */
export const PRISON_SPIDERS = 5;
/** Kam se vězeň postaví: prostřední buňka bludiště (stojí na podlaze). */
export const PRISON_SPOT = [PRISON.x + 0.5, PRISON.y + 1, PRISON.z + 0.5];
/** Kam se propuštěný hráč vrátí: spawn (stejný jako ve welcome, shared/net/room.js). */
export const SPAWN_SPOT = [1.5, 0.95, 15.5];
const KEY = 'prison-maze-v1';
const X0 = PRISON.x - PRISON.half, Z0 = PRISON.z - PRISON.half; // roh bludiště (blok 0, 0)
const MID = (PRISON_N - 1) / 2;

/** Je bod (x, y, z) ve vězení (v bludišti nebo kousek nad ním)? */
export const inPrison = (x, y, z) =>
  Math.abs(x - (PRISON.x + 0.5)) <= PRISON.half + 1.5 && Math.abs(z - (PRISON.z + 0.5)) <= PRISON.half + 1.5 && y >= PRISON.y - 3 && y <= PRISON.y + 14;

/** Střed buňky (cx, cz) ve světě: [x, z]. */
export const cellCenter = (cx, cz) => [X0 + CELL * cx + 2.5, Z0 + CELL * cz + 2.5];

// Pevná náhoda (mulberry32): bludiště je pro všechny stejné.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Brány ven: id, jméno, buňka u brány, bloky brány (x, z ve světě; výška y+1…y+3) a kam ukazuje kompas.
 * Sever = −z (kompas „S“), východ = +x, jih = +z, západ = −x.
 */
export const PRISON_EXITS = [
  { id: 'sever', name: 'severní', cell: [MID, 0], side: [0, -1] },
  { id: 'vychod', name: 'východní', cell: [PRISON_N - 1, MID], side: [1, 0] },
  { id: 'jih', name: 'jižní', cell: [MID, PRISON_N - 1], side: [0, 1] },
  { id: 'zapad', name: 'západní', cell: [0, MID], side: [-1, 0] },
].map((e) => {
  const [cx, cz] = e.cell, [sx, sz] = e.side;
  const bx = sx ? (sx > 0 ? CELL * PRISON_N : 0) : null, bz = sz ? (sz > 0 ? CELL * PRISON_N : 0) : null;
  const cols = [1, 2, 3].map((i) => (bx !== null ? [X0 + bx, Z0 + CELL * cz + i] : [X0 + CELL * cx + i, Z0 + bz]));
  return { ...e, cols, at: [cols[1][0] + 0.5, cols[1][1] + 0.5] };
});

let layout = null;
/**
 * Bludiště (spočítá se jednou): east[cz][cx] = průchod z buňky (cx, cz) na východ, south[cz][cx] = na jih,
 * runes = runové kameny [{ x, y, z }] ve slepých uličkách.
 */
export function prisonMaze() {
  if (layout) return layout;
  const N = PRISON_N, rnd = rng(20261118);
  const east = Array.from({ length: N }, () => Array(N).fill(false)), south = Array.from({ length: N }, () => Array(N).fill(false));
  const seen = Array.from({ length: N }, () => Array(N).fill(false));
  const stack = [[MID, MID]];
  seen[MID][MID] = true;
  while (stack.length) { // bludiště bez smyček (prohledávání do hloubky)
    const [cx, cz] = stack[stack.length - 1];
    const next = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => [cx + dx, cz + dz, dx, dz])
      .filter(([x, z]) => x >= 0 && z >= 0 && x < N && z < N && !seen[z][x]);
    if (!next.length) { stack.pop(); continue; }
    const [x, z, dx, dz] = next[Math.floor(rnd() * next.length)];
    if (dx) east[cz][Math.min(cx, x)] = true; else south[Math.min(cz, z)][cx] = true;
    seen[z][x] = true;
    stack.push([x, z]);
  }
  for (let i = 0, n = 0; i < 200 && n < 6; i++) { // pár průchodů navíc: víc cest k bráně
    const cx = Math.floor(rnd() * (N - 1)), cz = Math.floor(rnd() * (N - 1));
    const arr = rnd() < 0.5 ? east : south;
    if (!arr[cz][cx]) { arr[cz][cx] = true; n++; }
  }
  const doors = (cx, cz) => (cx < N - 1 && east[cz][cx]) + (cx > 0 && east[cz][cx - 1]) + (cz < N - 1 && south[cz][cx]) + (cz > 0 && south[cz - 1][cx]);
  const busy = new Set([`${MID},${MID}`, ...PRISON_EXITS.map((e) => e.cell.join())]);
  const ends = [];
  for (let cz = 0; cz < N; cz++) for (let cx = 0; cx < N; cx++) if (doors(cx, cz) === 1 && !busy.has(`${cx},${cz}`)) ends.push([cx, cz]);
  ends.sort((a, b) => Math.hypot(b[0] - MID, b[1] - MID) - Math.hypot(a[0] - MID, a[1] - MID) || a[0] - b[0] || a[1] - b[1]);
  const runes = ends.slice(0, 8).map(([cx, cz]) => ({ x: X0 + CELL * cx + 2, y: PRISON.y + 1, z: Z0 + CELL * cz + 2 }));
  layout = { east, south, runes };
  return layout;
}
/** Runové kameny v bludišti [{ x, y, z }] (bloky). */
export const prisonRunes = () => prisonMaze().runes;

/** Je blok (bx, bz) v rámci bludiště (0…N·CELL) zeď? */
function isWall(bx, bz) {
  const { east, south } = prisonMaze();
  const ix = bx % CELL === 0, iz = bz % CELL === 0;
  if (ix && iz) return true; // sloupek
  if (ix) { // svislá zeď mezi buňkami (bx/CELL − 1) a (bx/CELL)
    const cx = bx / CELL - 1, cz = Math.floor(bz / CELL);
    return cx < 0 || cx >= PRISON_N - 1 || !east[cz][cx];
  }
  if (iz) {
    const cz = bz / CELL - 1, cx = Math.floor(bx / CELL);
    return cz < 0 || cz >= PRISON_N - 1 || !south[cz][cx];
  }
  return false;
}

/**
 * Postaví bludiště, pokud ještě nestojí (staré vězení smaže). Vrací true, když ho právě postavilo.
 * Bloky kladou SyncMap, takže se uloží se světem jako každá jiná stavba.
 */
export function ensurePrison() {
  if (ruinsBuilt.has(KEY)) return false;
  ruinsBuilt.add(KEY);
  const S = PRISON_N * CELL, Y = PRISON.y;
  const put = (x, y, z, t) => blocks.set(bkey(x, y, z), t);
  for (let bx = -3; bx <= S + 3; bx++) for (let bz = -3; bz <= S + 3; bz++) // staré vězení (plošina, zeď, socha) pryč
    for (let y = Y; y <= Y + WALL + 3; y++) { const k = bkey(X0 + bx, y, Z0 + bz); if (blocks.has(k)) blocks.delete(k); }
  for (let bx = 0; bx <= S; bx++) for (let bz = 0; bz <= S; bz++) {
    put(X0 + bx, Y, Z0 + bz, 'prison_block'); // podlaha
    if (isWall(bx, bz)) for (let y = 1; y <= WALL; y++) put(X0 + bx, Y + y, Z0 + bz, 'prison_block');
    if (bx % 12 === 0 && bz % 12 === 0) put(X0 + bx, Y + WALL + 1, Z0 + bz, 'lantern'); // lucerny na sloupcích (v noci je vidět)
  }
  for (const e of PRISON_EXITS) for (const [x, z] of e.cols) for (let y = 1; y <= 3; y++) put(x, Y + y, z, 'prison_gate');
  for (const r of prisonRunes()) put(r.x, r.y, r.z, 'prison_rune');
  clearNature(PRISON.x, PRISON.z, PRISON.half + 6); // pod vězením nestojí stromy (jejich kmeny by hráče v bludišti zastavily)
  return true;
}

/** Stojí vězení (podlaha uprostřed)? */
export const prisonBuilt = () => blocks.get(bkey(PRISON.x, PRISON.y, PRISON.z)) === 'prison_block';

/** Brána, ke které patří blok (x, y, z): index v PRISON_EXITS, nebo −1. */
export function exitAt(x, y, z) {
  if (y < PRISON.y + 1 || y > PRISON.y + 3) return -1;
  return PRISON_EXITS.findIndex((e) => e.cols.some(([gx, gz]) => gx === x && gz === z));
}
/** Runový kámen na bloku (x, y, z): index v prisonRunes(), nebo −1. */
export const runeAt = (x, y, z) => prisonRunes().findIndex((r) => r.x === x && r.y === y && r.z === z);

/**
 * Kde se má zrodit pavouk: střed náhodné buňky bludiště aspoň 10 m od hráče (cx, cz), ne ve startovní buňce.
 * @param {number} cx
 * @param {number} cz
 * @param {() => number} [rnd]
 * @returns {[number, number, number] | null} [x, y, z]
 */
export function spiderSpot(cx, cz, rnd = Math.random) {
  for (let i = 0; i < 12; i++) {
    const gx = Math.floor(rnd() * PRISON_N), gz = Math.floor(rnd() * PRISON_N);
    if (gx === MID && gz === MID) continue;
    const [x, z] = cellCenter(gx, gz);
    if (Math.hypot(x - cx, z - cz) < 10) continue;
    return [x, PRISON.y + 1, z];
  }
  return null;
}

/**
 * Změny světa od vězně: ve vězení se nestaví ani nekope. Projdou jen předměty hozené na zem (a jejich sebrání);
 * vězeň dostane skutečný stav bloků a podzemí zpátky. Vrací { ops, fix } jako guardStatueOps.
 * @param {unknown[]} ops
 */
export function guardPrisonerOps(ops) {
  const ok = [], fix = [];
  for (const o of ops) {
    if (!Array.isArray(o)) continue;
    if (o[0] === 'g' || o[0] === 'gx') { ok.push(o); continue; }
    if (o[0] === 'm' && (o[1] === 'blocks' || o[1] === 'blockMeta')) {
      const map = o[1] === 'blocks' ? blocks : null;
      if (map) fix.push(['m', 'blocks', String(o[2]), map.get(String(o[2])) ?? null]);
    } else if (o[0] === 'v') {
      const [x, y, z] = [Number(o[1]), Number(o[2]), Number(o[3])];
      if ([x, y, z].every(Number.isInteger)) fix.push(['v', x, y, z, getVox(x, y, z)]);
    }
  }
  return { ops: ok, fix };
}
