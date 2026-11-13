// Vězení (jen server kroužku, pravomoc vlastníka serveru: server/prison.js). Bílá plošina z nezničitelných bloků
// vysoko na nebi daleko od všeho, kolem ní nízká zeď, uprostřed severní strany malá kopie sochy darů s pokladničkou.
// Žijí tu jen obří pavouci (shared/sim/mobs.js); z nich padá Oko obřího pavouka a za PRISON_RELEASE ok darovaných
// do pokladničky je vězeň volný. Postaví ho jednou server při startu světa (server/sim.js); bloky jsou "fixed"
// (shared/data/blocks.js), takže je nikdo nevytěží ani nezmění (guardStatueOps). Bez vedlejších účinků při načtení.
import { bkey, blocks, ruinsBuilt } from './state.js';
import { clearNature } from './statue.js';
import { getVox } from './voxels.js';

/** Kde vězení je: střed podlahy (x, z), výška podlahy y, poloviční šířka (podlaha je 2·half + 1 bloků), výška zdi. */
export const PRISON = { x: 0, z: -24000, y: 120, half: 12, wall: 3 };
/** Kolik ok obřího pavouka musí vězeň darovat, aby byl volný (rozhodl Richard: zatím 10). */
export const PRISON_RELEASE = 10;
/** Předmět, který vězeň daruje (padá z obřích pavouků). */
export const PRISON_ITEM = 'spider_eye';
/** Kolik obřích pavouků najednou žije ve vězení. */
export const PRISON_SPIDERS = 3;
/** Kam se vězeň postaví: jižní konec plošiny, čelem k soše (stojí na podlaze). */
export const PRISON_SPOT = [PRISON.x + 0.5, PRISON.y + 1, PRISON.z + PRISON.half - 2.5];
/** Kam se propuštěný hráč vrátí: spawn (stejný jako ve welcome, shared/net/room.js). */
export const SPAWN_SPOT = [1.5, 0.95, 15.5];
const KEY = 'prison';

/** Je bod (x, y, z) ve vězení (na plošině nebo kousek nad ní)? */
export const inPrison = (x, y, z) =>
  Math.abs(x - (PRISON.x + 0.5)) <= PRISON.half + 1.5 && Math.abs(z - (PRISON.z + 0.5)) <= PRISON.half + 1.5 && y >= PRISON.y - 3 && y <= PRISON.y + 14;

/**
 * Postaví vězení, pokud ještě nestojí. Vrací true, když ho právě postavilo.
 * Bloky kladou SyncMap, takže se uloží se světem jako každá jiná stavba.
 */
export function ensurePrison() {
  if (ruinsBuilt.has(KEY)) return false;
  ruinsBuilt.add(KEY);
  const { x: X, y: Y, z: Z, half: H, wall } = PRISON;
  const put = (x, y, z, t) => blocks.set(bkey(x, y, z), t);
  for (let dx = -H - 1; dx <= H + 1; dx++) for (let dz = -H - 1; dz <= H + 1; dz++) {
    put(X + dx, Y, Z + dz, 'prison_block'); // podlaha (i pod zdí)
    if (Math.max(Math.abs(dx), Math.abs(dz)) === H + 1) for (let y = 1; y <= wall; y++) put(X + dx, Y + y, Z + dz, 'prison_block'); // zeď
  }
  // kopie sochy darů u severní zdi: podstavec 3×3, zlatá postava, pokladnička před ní (vězeň daruje sem)
  const sz = Z - H + 2;
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) put(X + dx, Y + 1, sz + dz, 'statue_stone');
  for (let y = 2; y <= 5; y++) put(X, Y + y, sz, 'statue_gold');
  for (const dx of [-1, 1]) put(X + dx, Y + 4, sz, 'statue_gold');
  put(X, Y + 1, sz + 2, 'donation_box');
  clearNature(X, Z, H + 4); // pod vězením nestojí stromy (jejich kmeny by hráče na plošině zastavily)
  return true;
}

/** Stojí vězení (podlaha uprostřed)? */
export const prisonBuilt = () => blocks.get(bkey(PRISON.x, PRISON.y, PRISON.z)) === 'prison_block';

/**
 * Kde se má zrodit pavouk: náhodné místo na podlaze aspoň 7 m od hráče (cx, cz), ne u sochy.
 * @param {number} cx
 * @param {number} cz
 * @param {() => number} [rnd]
 * @returns {[number, number, number] | null} [x, y, z]
 */
export function spiderSpot(cx, cz, rnd = Math.random) {
  const { x: X, y: Y, z: Z, half: H } = PRISON;
  for (let i = 0; i < 12; i++) {
    const x = X + 0.5 + (rnd() * 2 - 1) * (H - 1.5), z = Z + 0.5 + (rnd() * 2 - 1) * (H - 1.5);
    if (Math.hypot(x - cx, z - cz) < 7 || z < Z - H + 5) continue;
    return [x, Y + 1, z];
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
