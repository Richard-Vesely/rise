// Markovy údery z nebe (příkazy v chatu, shared/sim/army.js): atomovka /at <hráč> a meteorický déšť /meteor.
// Běží u toho, kdo drží svět. Úder je nejdřív ohlášen všem prohlížečům (['fx', druh, x, y, z, za kolik s dopadne]:
// padající raketa / meteor, client/src/world/boom.js), po dopadu vyhloubí kráter (kostky podzemí i postavené bloky)
// a zraní všechny v dosahu (hráče zprávou 'dmg', tvory zabije). Co výbuchy zničily, si pamatuje (do restartu světa):
// /unat (restoreStrikes) to všechno vrátí na místo.
import { NET } from '../net/net.js';
import { bkey, blockMeta, blocks } from '../world/state.js';
import { V, getVox, setVox, topY } from '../world/voxels.js';
import { killMob, mobs } from './mobs.js';

/** Druhy úderů: poloměr kráteru a o kolik je jeho střed pod místem dopadu (atomovka ≈ 800 kostek v zemi), dosah zranění, zranění, doba pádu (s). */
export const STRIKE = {
  nuke: { crater: 14.5, sink: 6.5, reach: 30, dmg: 999, fall: 2.5 }, // ≈ 10 000 kostek
  meteor: { crater: 2.4, sink: 0.8, reach: 4.5, dmg: 9, fall: 1.4 },
};
const queue = []; // { kind, x, y, z, at: s do dopadu, sent, spare }
let hooks = { fx: null, hurt: null };

/** Kam posílat efekty a zranění (nastaví příkaz v chatu: room.js ví, kdo je kde). */
export function strikeHooks(h) { hooks = h; }

/**
 * Naplánuje úder. spare = pid, koho nezraní (Marek u svého meteorického deště).
 * @returns {number} kolik kostek se čeká, že zmizí (jen pro odpověď v chatu)
 */
export function addStrike(kind, x, y, z, delay = 0, spare = null) {
  const S = STRIKE[kind];
  queue.push({ kind, x, y, z, at: delay + S.fall, sent: false, spare });
  const R = S.crater, h = R - S.sink; // část koule nad zemí (vrchlík) se nepočítá
  return Math.round((4 / 3) * Math.PI * R ** 3 - (Math.PI * h * h * (3 * R - h)) / 3);
}

/** Kráter: kostky podzemí (kromě bedrocku) a postavené bloky v kouli pryč. Vrací počet zničených. */
const ruins = []; // [x, y, z, voxel] nebo [x, y, z, null, blok, meta]: co výbuchy zničily (pro /unat)
const RUINS_MAX = 400000;
export function blast(cx, cy, cz, R) {
  let n = 0;
  const r = Math.ceil(R), X = Math.round(cx), Y = Math.round(cy), Z = Math.round(cz);
  for (let x = -r; x <= r; x++) for (let y = -r; y <= r; y++) for (let z = -r; z <= r; z++) {
    if (x * x + y * y + z * z > R * R) continue;
    const k = bkey(X + x, Y + y, Z + z);
    if (blocks.has(k)) {
      if (ruins.length < RUINS_MAX) ruins.push([X + x, Y + y, Z + z, null, blocks.get(k), blockMeta.get(k)]);
      blocks.delete(k); blockMeta.delete(k); n++; continue;
    }
    const v = getVox(X + x, Y + y, Z + z);
    if (v === V.AIR || v === V.BEDROCK) continue;
    if (ruins.length < RUINS_MAX) ruins.push([X + x, Y + y, Z + z, v]);
    setVox(X + x, Y + y, Z + z, V.AIR);
    n++;
  }
  if (n) NET.dirtyBlocks = true;
  return n;
}

/** Každý krok simulace (z updateArmy): ohlásit padající úder, po dopadu kráter a zranění. */
export function updateStrikes(dt) {
  for (let i = queue.length - 1; i >= 0; i--) {
    const s = queue[i], S = STRIKE[s.kind];
    s.at -= dt;
    if (!s.sent && s.at <= S.fall) { s.sent = true; hooks.fx?.(s.kind, s.x, s.y, s.z, Math.max(0, s.at)); }
    if (s.at > 0) continue;
    queue.splice(i, 1);
    blast(s.x, s.y - S.sink, s.z, S.crater);
    hooks.hurt?.(s.x, s.y, s.z, S.reach, S.dmg, s.spare);
    for (const m of mobs) if (!m.dead && !m.army && Math.hypot(m.pos.x - s.x, m.pos.y - s.y, m.pos.z - s.z) < S.reach) killMob(m, true);
  }
}
export const pendingStrikes = () => queue.length;
/** Kolik zničených kostek je zapamatováno (vrátí je /unat). */
export const ruinsCount = () => ruins.length;

/**
 * /unat: vrátí všechno, co atomovky a meteory zničily (od nejnovějšího). Kde už mezitím někdo něco postavil, nechá to být.
 * @returns {number} kolik kostek se vrátilo
 */
export function restoreStrikes() {
  let n = 0;
  while (ruins.length) {
    const [x, y, z, v, type, meta] = ruins.pop(), k = bkey(x, y, z);
    if (blocks.has(k)) continue;
    if (v === null) { if (meta != null) blockMeta.set(k, meta); blocks.set(k, type); n++; continue; }
    if (getVox(x, y, z) !== V.AIR) continue;
    setVox(x, y, z, v);
    n++;
  }
  if (n) NET.dirtyBlocks = true;
  return n;
}

/** Meteorický déšť kolem bodu: n meteorů během ~sec sekund v kruhu o poloměru R. */
export function meteorShower(cx, cz, spare, n = 30, R = 34, sec = 14) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = 6 + Math.sqrt(Math.random()) * (R - 6);
    const x = Math.round(cx + Math.cos(a) * r), z = Math.round(cz + Math.sin(a) * r);
    addStrike('meteor', x, topY(x, z) + 1, z, Math.random() * sec, spare);
  }
}
