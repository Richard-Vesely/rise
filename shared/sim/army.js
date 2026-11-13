// Markova armáda (ve všech dimenzích): Markomani a krystaloví golemové, kterým velí hráč jménem Marek příkazy v chatu.
// Příkazy ani odpovědi nikdo jiný nevidí (shared/net/room.js je nerozesílá). Běží u toho, kdo drží svět (server nebo
// hostitel v prohlížeči); tvorové se pohybují běžnou simulací (shared/sim/mobs.js: armyPlan místo vlastní volby cíle).
//   /armada [počet]  svolá armádu (výchozí a nejvýš ARMY_MAX = 90 jednotek: každá pátá je krystalový golem, ostatní Markomani) · /utok <hráč> · /stop (k Markovi) · /palac (postaví
//   palác před Markem) · /tezit (vykope důl, rudy jdou Markovi) · /rozpustit · /svet <název> (přepojí Marka do jiného
//   světa serveru) · /markorit [počet] (markoritové ingoty do batohu) · /at <hráč> (atomovka, sim/strikes.js) · /meteor (meteorický déšť) · /pomoc
import { BLOCKS } from '../data/index.js';
import { NET } from '../net/net.js';
import { Vec3 } from '../vec3.js';
import { bkey, blocks } from '../world/state.js';
import { V, VOX, getVox, setVox, surfY, topY } from '../world/voxels.js';
import { addStrike, meteorShower, strikeHooks, updateStrikes } from './strikes.js';

/** Je to hráč, který velí armádě? */
export const isMarek = (name) => String(name || '').trim().toLowerCase() === 'marek';
export const ARMY_MAX = 90;
export const ARMY = { leader: undefined, mode: 'follow', target: null, targetMob: null, job: null, last: null };
const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const CMDS = new Set(['armada', 'army', 'utok', 'attack', 'stop', 'kenoze', 'domu', 'rozpustit', 'palac', 'palace', 'tezit', 'mine', 'svet', 'world', 'markorit', 'pomoc', 'help']);
/** Je text příkaz armády (třeba /armada 20)? */
export const isArmyCommand = (text) => typeof text === 'string' && text.startsWith('/') && CMDS.has(plain(text.slice(1)).split(/\s+/)[0]);

// ---------- příkazy (volá shared/net/room.js a pro hostitele v prohlížeči client/src/net/mp-ui.js)
/**
 * @param {string|null} pid kdo píše ('host' = hostitel v prohlížeči)
 * @param {object} ctx { name, pose, players: [{ pid, name }], spawn(type, x, z), mobs, give(id, n), reply(text), leader? }
 *   (leader: true/false = smí velet, rozhodl server; bez něj velí hráč jménem Marek)
 * @returns {boolean} true = byl to příkaz armády (nerozesílat do chatu)
 */
export function armyCommand(pid, text, ctx) {
  if (!(ctx.leader ?? isMarek(ctx.name)) || !text.startsWith('/')) return false;
  const [cmd, ...rest] = plain(text.slice(1)).split(/\s+/);
  const arg = rest.join(' ');
  const say = ctx.reply, p = ctx.pose;
  ARMY.leader = pid;
  ARMY.give = ctx.give;
  ARMY.reply = say;
  if (ctx.fx) strikeHooks({ fx: ctx.fx, hurt: ctx.hurt });
  const army = ctx.mobs.filter((m) => m.army && !m.dead);
  switch (cmd) {
    case 'armada': case 'army': {
      if (!p) return true;
      const total = Math.max(1, Math.min(ARMY_MAX - army.length, parseInt(arg, 10) || ARMY_MAX)), golems = Math.floor(total / 5), n = total - golems;
      if (army.length >= ARMY_MAX) { say(`Armáda už má ${army.length} jednotek (nejvýš ${ARMY_MAX}). Nejdřív /rozpustit.`); return true; }
      for (let i = 0; i < n + golems; i++) {
        const a = (i / (n + golems)) * Math.PI * 2, r = 4 + (i % 4) * 1.5;
        const m = ctx.spawn(i < n ? 'markoman' : 'golem', p.x + Math.cos(a) * r, p.z + Math.sin(a) * r);
        if (m) { m.army = true; m.slot = army.length + i; }
      }
      ARMY.mode = 'follow';
      say(`Armáda svolána: ${n} Markomanů${golems ? ` a ${golems} golemů` : ''} (celkem ${army.length + total}). /pomoc = příkazy.`);
      return true;
    }
    case 'utok': case 'attack': {
      const who = ctx.players.find((P) => plain(P.name) === arg) || ctx.players.find((P) => plain(P.name).startsWith(arg));
      if (!arg || !who) { say(`Hráče „${arg}“ nevidím. Hráči: ${ctx.players.map((P) => P.name).join(', ') || 'nikdo'}`); return true; }
      if (who.pid === pid) { say('Na sebe útočit nebudeme.'); return true; }
      ARMY.mode = 'attack'; ARMY.target = who.pid; ARMY.targetMob = null;
      say(`Útok na ${who.name}!`);
      return true;
    }
    case 'stop': case 'kenoze': case 'domu': ARMY.mode = 'follow'; ARMY.target = null; ARMY.targetMob = null; say('Armáda jde k tobě.'); return true;
    case 'rozpustit': for (const m of army) { m.dead = true; m.deathT = 0; } ARMY.mode = 'follow'; ARMY.job = null; say('Armáda rozpuštěna.'); return true;
    case 'palac': case 'palace': {
      if (!p) return true;
      const fx = -Math.sin(p.yaw || 0), fz = -Math.cos(p.yaw || 0);
      ARMY.job = palaceJob(Math.round(p.x + fx * 16), Math.round(p.z + fz * 16));
      ARMY.mode = 'build';
      say(`Stavíme palác (${ARMY.job.list.length} bloků, asi ${Math.ceil(ARMY.job.list.length / 20)} s).`);
      return true;
    }
    case 'tezit': case 'mine': {
      if (!p) return true;
      const fx = -Math.sin(p.yaw || 0), fz = -Math.cos(p.yaw || 0);
      ARMY.job = mineJob(Math.round(p.x + fx * 8), Math.round(p.z + fz * 8));
      ARMY.mode = 'mine';
      say('Kopeme důl, rudy ti budou chodit do batohu.');
      return true;
    }
    case 'svet': case 'world': // přepojení do jiného světa serveru: prohlížeč Marka si najde svět podle jména a připojí se
      if (!ctx.goto) { say('Jiné světy jsou jen na serveru kroužku.'); return true; }
      if (!arg) { say('Napiš název světa, třeba /svet kreativni'); return true; }
      say(`Přepojuji do světa „${arg}“…`);
      ctx.goto(arg);
      return true;
    case 'markorit': { // vzácný markorit pro Marka
      const n = Math.max(1, Math.min(640, parseInt(arg, 10) || 64));
      ctx.give('markorite', n);
      say(`Markorit: +${n}`);
      return true;
    }
    case 'at': case 'atom': case 'atomovka': { // atomovka na hráče: raketa spadne za 2,5 s, kráter ≈ 800 kostek, všichni v dosahu padnou
      const who = ctx.players.find((P) => plain(P.name) === arg) || (arg && ctx.players.find((P) => plain(P.name).startsWith(arg)));
      const T = who && ctx.poseOf?.(who.pid);
      if (!who || !T) { say(`Na koho? Napiš /at a jméno. Hráči: ${ctx.players.map((P) => P.name).join(', ') || 'nikdo'}`); return true; }
      const n = addStrike('nuke', T.x, T.y, T.z);
      say(`☢ Atomovka letí na ${who.name}! Dopad za 2,5 s, kráter asi ${n} kostek.`);
      return true;
    }
    case 'meteor': case 'meteory': { // meteorický déšť kolem Marka (Marka nezraní)
      if (!p) return true;
      meteorShower(p.x, p.z, pid);
      say('☄ Meteorický déšť! 30 meteorů během 14 s kolem tebe (tebe nezasáhnou).');
      return true;
    }
    case 'pomoc': case 'help':
      say(`/armada [počet, nejvýš ${ARMY_MAX}] · /utok <hráč> · /stop · /palac · /tezit · /rozpustit · /svet <název> · /markorit [počet] · /at <hráč> · /meteor`);
      return true;
  }
  return false;
}

// ---------- práce: palác (stavba po blocích) a důl (kopání po kostkách)
function palaceJob(cx, cz) {
  const F = surfY(cx, cz), list = [], R = 8;
  const put = (x, y, z, t) => list.push(['b', cx + x, F + y, cz + z, t]);
  for (let x = -R - 1; x <= R + 1; x++) for (let z = -R - 1; z <= R + 1; z++) {
    const X = cx + x, Z = cz + z, top = topY(X, Z);
    for (let y = F; y <= top + 2; y++) list.push(['v', X, y, Z]); // kopec v půdorysu pryč
    for (let y = top + 1; y < F; y++) list.push(['b', X, y, Z, 'cobble']); // dolík vyplnit
    put(x, 0, z, Math.abs(x) <= R && Math.abs(z) <= R ? ((x + z) % 2 ? 'bricks' : 'quartz_block') : 'obsidian'); // podlaha šachovnice
  }
  for (let y = 1; y <= 7; y++) for (let x = -R; x <= R; x++) for (let z = -R; z <= R; z++) {
    const edge = Math.abs(x) === R || Math.abs(z) === R;
    if (!edge) continue;
    if (z === R && Math.abs(x) <= 1 && y <= 4) continue; // brána
    const win = (y === 3 || y === 4) && (x + z) % 3 === 0 && !(Math.abs(x) === R && Math.abs(z) === R); // okna, ne v rozích
    put(x, y, z, win ? 'glass' : y === 7 ? 'gold_block' : 'bricks');
  }
  for (let x = -R + 1; x < R; x++) for (let z = -R + 1; z < R; z++) put(x, 8, z, 'mark_planks'); // střecha
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let y = 1; y <= 12; y++) for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) { // věže
    const tx = sx * R + (sx < 0 ? x - 1 : 1 - x), tz = sz * R + (sz < 0 ? z - 1 : 1 - z);
    if (y === 12 && (x + z) % 2) continue; // cimbuří
    put(tx, y, tz, y >= 11 ? 'gold_block' : 'obsidian');
  }
  for (let y = 9; y <= 13; y++) put(0, y, 0, y === 13 ? 'gold_block' : 'quartz_block'); // věžička uprostřed
  for (const [x, z] of [[-2, R + 1], [2, R + 1], [-R + 2, -R + 2], [R - 2, -R + 2], [-R + 2, R - 2], [R - 2, R - 2]]) put(x, 1, z, 'torch');
  return { kind: 'build', x: cx, z: cz, list, i: 0, acc: 0, speed: 20 };
}
function mineJob(cx, cz) {
  const list = [], top = topY(cx, cz);
  for (let d = 0; d < 12; d++) for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) if (x * x + z * z <= 10 + d * 0.3) list.push(['v', cx + x, top - d, cz + z]);
  return { kind: 'mine', x: cx, z: cz, list, i: 0, acc: 0, speed: 6 };
}

/** Každý krok simulace (z updateMobs): stavba paláce a kopání dolu. */
export function updateArmy(dt, mobs) {
  updateStrikes(dt);
  const J = ARMY.job;
  if (!J) return;
  J.acc += dt * J.speed;
  while (J.acc >= 1 && J.i < J.list.length) {
    J.acc--;
    const [k, x, y, z, t] = J.list[J.i++];
    if (k === 'b') { if (BLOCKS[t] && !blocks.has(bkey(x, y, z))) blocks.set(bkey(x, y, z), t); }
    else {
      const v = getVox(x, y, z);
      if (v === V.AIR || v === V.BEDROCK) continue;
      setVox(x, y, z, V.AIR);
      if (J.kind === 'mine') { const d = VOX[v]?.drop; if (d && (VOX[v].glow || d[0] !== 'stone' || Math.random() < 0.25)) ARMY.give?.(d[0], d[1]); } // rudy a trochu kamene Markovi
    }
    if (blocks.size) NET.dirtyBlocks = true;
  }
  if (J.i >= J.list.length) { ARMY.job = null; ARMY.mode = 'follow'; ARMY.reply?.(J.kind === 'build' ? 'Palác je hotový!' : 'Důl je vykopaný.'); }
}

/**
 * Marek někoho praštil: armáda jde po něm (jen Markova armáda, jen když ji Marek už vede).
 * Hráč: volá hitPlayer v shared/net/room.js, jen když rána platí (souboje zapnuté). Tvor: zpráva 'hit' a rána hostitele.
 * @param {string} pid kdo udeřil ('host' = hostitel v prohlížeči)
 * @param {string} name jeho jméno
 * @param {{ pid?: string, mob?: object }} who koho udeřil
 */
export function armyHit(pid, name, who) {
  if (!isMarek(name) || ARMY.leader !== pid || !ARMY.leader) return;
  if (who.mob?.army) return; // vlastní vojáky ne
  const same = ARMY.mode === 'attack' && (who.mob ? ARMY.targetMob === who.mob : ARMY.target === who.pid && !ARMY.targetMob);
  ARMY.mode = 'attack'; ARMY.target = who.pid ?? null; ARMY.targetMob = who.mob ?? null;
  if (!same) ARMY.reply?.(who.mob ? `Útok na ${who.mob.def?.name || 'tvora'}!` : `Útok na ${who.name || 'hráče'}!`);
}

/**
 * Kam jde voják armády a na koho útočí (shared/sim/mobs.js). Vrací { T, attack, near } nebo null (armáda bez velitele stojí).
 * @param {object} m voják
 * @param {object[]} TG hráči (NET.targets(): { pos, alive, pid… }, pid null = hostitel u obrazovky)
 */
export function armyPlan(m, TG) {
  const lead = TG.find((t) => (t.pid ?? 'host') === ARMY.leader);
  if (ARMY.mode === 'attack') {
    const M = ARMY.targetMob;
    if (M && !M.dead) return { T: { pos: M.pos, alive: true, mob: M }, attack: true, near: 1.2 };
    const T = !M && TG.find((t) => (t.pid ?? 'host') === ARMY.target);
    if (T && T.alive) return { T, attack: true, near: 1.2 };
    ARMY.mode = 'follow'; ARMY.target = null; ARMY.targetMob = null;
  }
  const slot = m.slot || 0, a = slot * 2.4, ring = Math.floor(slot / 15); // až 90 vojáků: šest kruhů kolem cíle
  let cx, cz, r;
  if (ARMY.job && (ARMY.mode === 'build' || ARMY.mode === 'mine')) { cx = ARMY.job.x; cz = ARMY.job.z; r = (ARMY.mode === 'build' ? 11 : 5) + ring * 1.5; }
  else if (lead) { cx = lead.pos.x; cz = lead.pos.z; r = 3 + ring * 1.8; ARMY.last = { x: cx, z: cz }; }
  else if (ARMY.last) { cx = ARMY.last.x; cz = ARMY.last.z; r = 3 + ring * 1.8; }
  else return null;
  const goal = (m.goal ||= new Vec3()).set(cx + Math.cos(a) * r, m.pos.y, cz + Math.sin(a) * r);
  return { T: { pos: goal, alive: false, pid: undefined, army: true }, attack: false, near: 0.8 };
}
