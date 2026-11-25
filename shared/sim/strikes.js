// Atomovka z obchodu za zlato (předmět 'nuke_item', shared/data/shop.js): hráč ji hodí tam, kam míří (do 90 m).
// Běží u toho, kdo drží svět: nejdřív všem ohlásí padající raketu (['fx', 'nuke', x, y, z, t], client/src/world/boom.js),
// po dopadu vyhloubí kráter asi 2000 kostek a zraní hráče a tvory v dosahu.
// Pojistky: nezničí nezničitelné bloky (socha, vězení, peklo: BLOCKS.fixed) ani bedrock, nedá se odpálit blízko svatyní
// a spawnu (NUKE.safe), a hráče zraní jen tam, kde se smí bojovat (strikeHooks.canHurt v shared/net/room.js).
// Bez vedlejších účinků při načtení.
import { BLOCKS } from '../data/index.js';
import { NET } from '../net/net.js';
import { bkey, blocks, blockMeta } from '../world/state.js';
import { SHRINES } from '../world/terrain.js';
import { V, getVox, setVox } from '../world/voxels.js';
import { killMob } from './mobs.js';

/** Atomovka: kráter (poloměr, střed pod místem dopadu ≈ 2000 kostek v zemi), dosah zranění, zranění, pád (s), dohoz (m), bezpečí kolem svatyní (m). */
export const NUKE = { crater: 8.5, sink: 3.5, reach: 14, dmg: 999, fall: 2.5, range: 90, safe: 45, shotSpeed: 40, reload: 2.5 };
const queue = []; // { x, y, z, at, sent, from }
let hooks = { fx: null, canHurt: () => true };
/** Kam posílat efekt a kdo smí být zraněn (nastaví shared/net/room.js). */
export function strikeHooks(h) { hooks = { ...hooks, ...h }; }

/** Dá se tu atomovka odpálit? (ne blízko svatyní: tam je spawn a socha) */
export const nukeAllowedAt = (x, z) => SHRINES.every((s) => Math.hypot(x - s.x, z - s.z) >= NUKE.safe);
/** Kolik kostek kráter zhruba zničí (koule bez vrchlíku nad zemí). */
export function craterSize() {
  const R = NUKE.crater, h = R - NUKE.sink;
  return Math.round((4 / 3) * Math.PI * R ** 3 - (Math.PI * h * h * (3 * R - h)) / 3);
}

/** Naplánuje atomovku hráče from na (x, y, z). Vrací false, když to tu nejde. */
export function addNuke(from, x, y, z, origin) {
  if (![x, y, z].every(Number.isFinite) || !nukeAllowedAt(x, z)) return false;
  if(origin&&(!Array.isArray(origin)||origin.length!==3||!origin.every(Number.isFinite)))return false;
  const at=origin?Math.max(.3,Math.min(NUKE.fall,Math.hypot(x-origin[0],y-origin[1],z-origin[2])/NUKE.shotSpeed)):NUKE.fall;
  queue.push({ x, y, z, at, sent: false, from, ...(origin?{origin:origin.slice()}: {}) });
  return true;
}

/** Kráter: kostky podzemí a postavené bloky v kouli pryč (kromě nezničitelných a bedrocku). Vrací počet zničených. */
export function blast(cx, cy, cz, R) {
  let n = 0;
  const r = Math.ceil(R), X = Math.round(cx), Y = Math.round(cy), Z = Math.round(cz);
  for (let x = -r; x <= r; x++) for (let y = -r; y <= r; y++) for (let z = -r; z <= r; z++) {
    if (x * x + y * y + z * z > R * R) continue;
    const k = bkey(X + x, Y + y, Z + z), t = blocks.get(k);
    if (t) { if (BLOCKS[t]?.fixed) continue; blocks.delete(k); blockMeta.delete(k); n++; continue; }
    const v = getVox(X + x, Y + y, Z + z);
    if (v === V.AIR || v === V.BEDROCK) continue;
    setVox(X + x, Y + y, Z + z, V.AIR);
    n++;
  }
  if (n) NET.dirtyBlocks = true;
  return n;
}

/** Každý krok simulace (z updateMobs): ohlásit padající raketu, po dopadu kráter a zranění. */
export function updateStrikes(dt, mobs) {
  for (let i = queue.length - 1; i >= 0; i--) {
    const s = queue[i];
    s.at -= dt;
    if (!s.sent) { s.sent = true; hooks.fx?.(s.origin?'nuke-shot':'nuke', s.x, s.y, s.z, Math.max(0, s.at),s.origin); }
    if (s.at > 0) continue;
    queue.splice(i, 1);
    blast(s.x, s.y - NUKE.sink, s.z, NUKE.crater);
    for (const T of NET.targets()) {
      if (!T.alive || T.creative || Math.hypot(T.pos.x - s.x, T.pos.y - s.y, T.pos.z - s.z) >= NUKE.reach) continue;
      const pid = T.pid ?? 'host';
      if (!hooks.canHurt(s.from, pid)) continue; // kdo nebojuje, tomu atomovka neublíží
      const d = Math.hypot(T.pos.x - s.x, T.pos.z - s.z) || 1, kx = (T.pos.x - s.x) / d, kz = (T.pos.z - s.z) / d;
      if (T.pid) NET.sendTo(T.pid, ['dmg', NUKE.dmg, kx, kz]); else NET.hurtLocal?.(NUKE.dmg, kx, kz);
    }
    for (const m of mobs) if (!m.dead && !m.def.swordsOnly && Math.hypot(m.pos.x - s.x, m.pos.y - s.y, m.pos.z - s.z) < NUKE.reach) killMob(m, true);
  }
}
