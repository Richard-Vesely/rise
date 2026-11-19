// Předměty ležící na zemi (vyhozené klávesou Q / G, vytěžené bloky): letí, dopadnou, točí se a po 5 minutách zmizí.
// Ve vodě vyplavou k hladině a plavou, v lávě shoří (jako v Minecraftu).
// Sebrat je může kdokoli: ve hře pro jednoho a u hostitele rovnou, připojený hráč o sebrání požádá hostitele ('pk').
import { ITEMS } from '../data/index.js';
import { emit } from '../events.js';
import { NET, r2 } from '../net/net.js';
import { Vec3 } from '../vec3.js';
import { solidAny, voxFloor } from '../world/collision.js';
import { waterAt } from '../world/nature.js';
import { terrainH, volcanoDist } from '../world/terrain.js';
import { groundHeight } from '../world/voxels.js';

// Za jak dlouho jde předmět sebrat (Minecraft: vytěžený blok 10 ticků, vyhozený hráčem 40 ticků)
export const DROP_DELAY = 0.5, THROW_DELAY = 2;
export const DESPAWN = 300; // s: po 5 minutách předmět zmizí
export const FLOAT = 0.12; // jak hluboko pod hladinou předmět plave
/** Láva na dně kráteru sopky (stejné místo pálí i hráče, client/src/player/survival.js). */
export const inLava = (x, y, z) => volcanoDist(x, z) < 11 && y < terrainH(x, z) + 0.5;

export const groundItems = []; // { gid, id, n, pos, vel, age, delay, spin, req, w?, wet?, burnt?, lv? (hladina) }
// w = opotřebení nástroje (shared/tools.js); posílá se jen u opotřebovaných kusů jako 8. prvek operace 'g'.
export function spawnGroundItem(id, n, pos, vel, delay = DROP_DELAY, gid = NET.uid(), w = 0) {
  const op = ['g', gid, id, n, [pos.x, pos.y, pos.z].map(r2), [vel.x, vel.y, vel.z].map(r2), delay];
  if (w > 0) op.push(w);
  NET.op(op);
  groundItems.push({ gid, id, n, pos: new Vec3(pos.x, pos.y, pos.z), vel: new Vec3(vel.x, vel.y, vel.z), age: 0, delay, spin: Math.random() * 6, req: 0, ...(w > 0 ? { w } : {}) });
}
/** Vytěžený blok (obsah rozbité truhly, odpadlá pochodeň) vyskočí jako malý předmět s náhodným poskokem (x, y, z = střed místa). */
export function popGroundItem(id, n, x, y, z, w = 0) {
  if (!ITEMS[id] || !(n > 0)) return;
  const a = Math.random() * Math.PI * 2, sp = 0.3 + Math.random() * 0.8, r = () => (Math.random() - 0.5) * 0.5;
  spawnGroundItem(id, n, { x: x + r(), y: y + r() * 0.5, z: z + r() }, { x: Math.cos(a) * sp, y: 3 + Math.random() * 1.2, z: Math.sin(a) * sp }, DROP_DELAY, undefined, w);
}
// Podlaha pod předmětem: povrch terénu nebo horní stěna bloku. Povrch platí, když byl předmět před krokem (y0) nad ním:
// rychle padající předmět (pochodeň ze zdi vysoko) by jinak za jeden krok proletěl pod povrch a zůstal v zemi.
function itemFloor(x, y, z, y0 = y) {
  const g = groundHeight(x, z);
  const vf = voxFloor(x, y, z);
  return isFinite(g) && Math.max(y, y0) >= g - 0.6 ? Math.max(g, vf) : vf;
}
// Stejné předměty ležící u sebe se slijí do jedné hromádky (jako v Minecraftu: do 0,5 × 0,25 × 0,5 bloku).
// Rozhoduje jen ten, kdo drží svět (hra pro jednoho, hostitel, server); ostatní dostanou změnu jako 'gx'.
export function mergeGroundItems() {
  for (let i = 0; i < groundItems.length; i++) {
    const a = groundItems[i];
    if (a.n <= 0 || a.vel.y !== 0) continue;
    const max = ITEMS[a.id]?.stack || 64;
    for (let j = i + 1; j < groundItems.length && a.n < max; j++) {
      const b = groundItems[j];
      if (b.n <= 0 || b.id !== a.id || b.vel.y !== 0) continue;
      if (Math.abs(a.pos.x - b.pos.x) > 0.5 || Math.abs(a.pos.z - b.pos.z) > 0.5 || Math.abs(a.pos.y - b.pos.y) > 0.25) continue;
      const k = Math.min(max - a.n, b.n);
      a.n += k; b.n -= k;
      a.age = Math.min(a.age, b.age); // sloučená hromádka zmizí podle mladšího kusu
      NET.op(['gx', a.gid, a.n]);
      NET.op(['gx', b.gid, b.n]);
    }
  }
}
let mergeT = 0;
// pickup(it) = hráč u této obrazovky zkusí předmět sebrat (prohlížeč); server ho nepředává.
export function updateGroundItems(dt, pickup) {
  if (!NET.client && (mergeT -= dt) <= 0) { mergeT = 0.5; mergeGroundItems(); }
  for (let i = groundItems.length - 1; i >= 0; i--) {
    const it = groundItems[i];
    it.age += dt;
    // pohyb: ve vodě vztlak k hladině, jinak gravitace
    const lv = waterLevel(it);
    if (lv !== null && it.pos.y < lv) floatStep(it, lv, dt);
    else { it.wet = false; it.vel.y -= 18 * dt; }
    const nx = it.pos.x + it.vel.x * dt, nz = it.pos.z + it.vel.z * dt;
    if (solidAny(Math.floor(nx), Math.floor(it.pos.y + 0.1), Math.floor(nz))) { it.vel.x *= -0.2; it.vel.z *= -0.2; }
    else { it.pos.x = nx; it.pos.z = nz; }
    const y0 = it.pos.y;
    it.pos.y += it.vel.y * dt;
    // podlaha (i blok položený na předmět: voxFloor ho vystrčí nahoru)
    const fl = itemFloor(it.pos.x, it.pos.y, it.pos.z, y0);
    if (it.pos.y <= fl) { it.pos.y = fl; it.vel.y = 0; it.vel.x *= 0.8; it.vel.z *= 0.8; }
    it.spin += dt * 1.8;
    if (!it.burnt && inLava(it.pos.x, it.pos.y, it.pos.z)) burn(it);
    // sebrání
    if (it.req > 0) it.req -= dt;
    if (pickup && !it.burnt) pickup(it);
    if (it.n <= 0 || it.age > DESPAWN) groundItems.splice(i, 1);
  }
}
// Hladina vody pod předmětem, nebo null (počítá se znovu, až se předmět posune na jiný metr, výpočet hladiny je drahý)
function waterLevel(it) {
  const cx = Math.floor(it.pos.x), cz = Math.floor(it.pos.z);
  if (it.wx !== cx || it.wz !== cz) { it.wx = cx; it.wz = cz; it.lv = waterAt(cx + 0.5, -Infinity, cz + 0.5); }
  return it.lv;
}
// Ve vodě: předmět zpomalí, vyplave k hladině a houpe se na ní (tlumená pružina); usazený má vel.y = 0, takže se může slít.
function floatStep(it, lv, dt) {
  if (!it.wet) { it.wet = true; if (it.vel.y < -3) emit('itemSplash', it); }
  const ty = lv - FLOAT;
  it.vel.y = Math.min(1.6, it.vel.y + ((ty - it.pos.y) * 14 - it.vel.y * 5) * dt);
  const drag = Math.max(0, 1 - 2.5 * dt);
  it.vel.x *= drag; it.vel.z *= drag;
  if (Math.abs(ty - it.pos.y) < 0.03 && Math.abs(it.vel.y) < 0.15) { it.pos.y = ty; it.vel.y = 0; }
}
// V lávě předmět shoří: obrázek a syčení u všech, o zmizení rozhodne ten, kdo drží svět ('gx' s nulou).
function burn(it) {
  it.burnt = true;
  emit('itemBurn', it);
  if (NET.client) return;
  it.n = 0;
  NET.op(['gx', it.gid, 0]);
}
// Hráč chce sebrat předmět (zpráva 'pk' u hostitele / serveru): kolik kusů dostane, nebo 0.
export function claimGroundItem(gid) {
  const it = groundItems.find((g) => g.gid === gid);
  if (!it || it.n <= 0) return null;
  const got = it.w ? { id: it.id, n: it.n, w: it.w } : { id: it.id, n: it.n };
  it.n = 0;
  NET.op(['gx', it.gid, 0]);
  return got;
}
