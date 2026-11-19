// Zvuková krajina: zjistí, kde hráč je (biom, les, jeskyně, voda, sopka, den/noc, střecha nad hlavou), a podle toho
// řídí zvuky okolí, hudbu, hučení strojů a ohňů, ucho (kamera), tlumení pod vodou, kroky ostatních hráčů,
// zvuky jejich staveb a hlasy tvorů u připojeného hráče. Volá ho herní smyčka (game/loop.js) každý snímek.
import * as THREE from 'three';
import { KITCHEN } from '../../../shared/data/index.js';
import { on } from '../../../shared/events.js';
import { NET } from '../../../shared/net/net.js';
import { others } from '../../../shared/net/room.js';
import { dayTime, daylight } from '../../../shared/sim/day.js';
import { mobs } from '../../../shared/sim/mobs.js';
import { netOf } from '../../../shared/sim/power.js';
import { pondLevel, waterAt } from '../../../shared/world/nature.js';
import { bkey, blocks, furnaces, portalActive, power, stoves } from '../../../shared/world/state.js';
import { SHRINES, biomeAt, isMark, pondOf, shrineDist, terrainH, volcanoOf } from '../../../shared/world/terrain.js';
import { V, getVox, topY } from '../../../shared/world/voxels.js';
import { inv } from '../player/inventory.js';
import { player } from '../player/player.js';
import { specials } from '../render/blocks.js';
import { underground } from '../render/daylight.js';
import { forestTrees } from '../render/forest.js';
import { camera } from '../render/renderer.js';
import { shardObjs } from '../render/shards.js';
import { Ambience } from './ambience.js';
import { Hums } from './hums.js';
import { blockMaterial, materialAt, voxMaterial } from './materials.js';
import { Music } from './music.js';
import { Sound } from './sound.js';
import { initUISounds } from './ui-sounds.js';

const fwd = new THREE.Vector3();
const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const env = { biome: 'meadow', day: 1, dawn: 0, gust: 0.5, forest: 0, cave: 0, indoor: 0, water: 0, under: false, mark: false, volcano: 0, rain: 0, height: 0, pond: null, crater: null };
let envT = 0, humT = 0, started = false, lastSel = -1, opT = 0, opN = 0;

// Prostředí kolem hráče (5× za sekundu stačí).
function sense(gust) {
  const p = player.pos, cam = camera.position;
  env.mark = isMark(p.x);
  env.biome = biomeAt(p.x, p.z);
  env.day = daylight().day;
  env.dawn = clamp01(1 - Math.abs(dayTime - 0.27) / 0.06);
  env.gust = gust;
  env.cave = underground;
  env.height = Math.max(0, cam.y - terrainH(cam.x, cam.z));
  env.rain = Sound.rainLevel || 0; // déšť nastaví počasí, až bude (Sound.rainLevel = 0–1)
  // střecha nad hlavou (postavený dům, převis): bloky nad hráčem
  const fx = Math.floor(p.x), fy = Math.floor(p.y), fz = Math.floor(p.z);
  let roof = 0;
  for (let dy = 2; dy < 10 && !roof; dy++) if (blocks.has(bkey(fx, fy + dy, fz)) || (fy + dy <= topY(fx, fz) && getVox(fx, fy + dy, fz) !== V.AIR)) roof = 1;
  env.indoor = roof * (1 - env.cave);
  // les: stromy do 18 m
  let n = 0;
  for (const t of forestTrees) if (Math.abs(t.x - p.x) < 18 && Math.abs(t.z - p.z) < 18) n++;
  env.forest = clamp01(n / 9);
  // rybník (žáby, šplouchání) – jen opravdové rybníky s vodou
  const pd = pondOf(p.x, p.z);
  env.pond = pd && shrineDist(pd.x, pd.z) >= 90 ? pd : null;
  env.water = env.pond ? clamp01(1 - (Math.hypot(p.x - pd.x, p.z - pd.z) - pd.r) / 14) : 0;
  if (env.pond) env.pond.y = pondLevel(pd);
  // sopka: láva v kráteru
  const v = env.mark ? null : volcanoOf(p.x, p.z), vd = v ? Math.hypot(p.x - v.x, p.z - v.z) : 1e9;
  env.volcano = clamp01(1 - (vd - 20) / 70);
  env.crater = v && vd < 120 ? { x: v.x, y: terrainH(v.x, v.z), z: v.z } : null;
  env.under = waterAt(cam.x, cam.y, cam.z) !== null;
}

// Zdroje stálých zvuků kolem (ohně, pece, stroje, kabely, spawnery, portály, úlomky).
function humSources() {
  const p = player.pos, list = [], near = (x, y, z, r = 16) => Math.abs(x - p.x) < r && Math.abs(z - p.z) < r && Math.abs(y - p.y) < r;
  for (const [k, s] of specials) {
    if (!near(s.x, s.y, s.z)) continue;
    const st = power.get(k), pw = !!st?.pw;
    let kind = null;
    switch (s.type) {
      case 'campfire': kind = 'fire'; break;
      case 'torch': case 'lantern': kind = 'torch'; break;
      case 'furnace': if (furnaces.get(k)?.burn > 0) kind = 'furnace'; break;
      case 'stove': { const r = stoves.get(k)?.recipe; if (r != null && KITCHEN[r]?.heat) kind = 'stove'; break; }
      case 'coal_generator': if (pw) kind = 'generator'; break;
      case 'motor_block': if (pw) kind = 'motor'; break;
      case 'electric_furnace': case 'charger': if (pw) kind = 'efurnace'; break;
      case 'computer': if (pw) kind = 'computer'; break;
      case 'electric_lamp': case 'bulb_lamp': if (pw) kind = 'lamp'; break;
      case 'spawner': kind = 'spawner'; break;
    }
    if (kind) list.push({ id: k, kind, x: s.x + 0.5, y: (s.ry ?? s.y) + 0.5, z: s.z + 0.5 });
  }
  // kabely pod proudem do 3 m (síť, ve které něco běží)
  const fx = Math.floor(p.x), fy = Math.floor(p.y), fz = Math.floor(p.z);
  for (let dy = -2; dy <= 3; dy++) for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
    const k = bkey(fx + dx, fy + dy, fz + dz), t = blocks.get(k);
    if (!t || !t.startsWith('cable')) continue;
    const net = netOf.get(k);
    if (net && (net.users.some((u) => power.get(u)?.pw) || net.gens.some((g) => power.get(g)?.pw))) { list.push({ id: 'cable', kind: 'cable', x: fx + dx + 0.5, y: fy + dy + 0.5, z: fz + dz + 0.5 }); dx = dy = dz = 99; }
  }
  for (const s of SHRINES) if (s.mark || portalActive) list.push({ id: 'portal' + s.x, kind: 'portal', x: s.x, y: 3.05, z: s.z });
  for (const [k, o] of shardObjs) list.push({ id: k, kind: 'shard', x: o.x, y: o.group.position.y + 1.3, z: o.z });
  return list;
}

// Ostatní hráči: kroky podle materiálu pod nohama (stejný rytmus jako vlastní kroky).
const stepPhase = new Map();
function otherSteps(dt) {
  for (const P of others.values()) {
    const q = P.pose;
    if (!q || q.veh || q.sit || q.fly || q.alive === false || !(q.mv > 1)) continue;
    const ph = (stepPhase.get(P.pid) || 0) + dt * Math.min(q.mv, 9) * 1.8;
    if (Math.floor(ph / Math.PI) !== Math.floor((stepPhase.get(P.pid) || 0) / Math.PI)) Sound.at(q.x, q.y, q.z, () => Sound.footstep(materialAt(q.x, q.y, q.z), q.mv > 6), { max: 28 });
    stepPhase.set(P.pid, ph);
  }
}
// Tvorové: u připojeného hráče jejich hlasy (u hostitele je spouští pravidla, mobSound); těžké kroky golema.
function mobLife(dt) {
  const L = Sound.lis;
  for (const m of mobs) {
    if (m.dead) continue;
    const d = Math.hypot(m.pos.x - L.x, m.pos.z - L.z);
    if (NET.client && (m._snd = (m._snd ?? 3 + Math.random() * 10) - dt) <= 0) { m._snd = 5 + Math.random() * 10; if (d < 25) Sound.at(m.pos.x, m.pos.y + 1, m.pos.z, () => Sound.mobVoice(m.type)); }
    if (m.type === 'golem' && d < 30) {
      const sp = m._lp ? Math.hypot(m.pos.x - m._lp.x, m.pos.z - m._lp.z) / Math.max(dt, 1e-3) : 0;
      m._lp = { x: m.pos.x, z: m.pos.z };
      if (sp > 0.5 && (m._stomp = (m._stomp || 0) - dt) <= 0) { m._stomp = 0.75; Sound.at(m.pos.x, m.pos.y, m.pos.z, () => Sound.stomp(), { ref: 4 }); }
    }
  }
}
// Cizí stavění a bourání (operace od ostatních hráčů): zvuk z místa bloku. Nejvýš pár za chvilku.
function remoteOp(x, y, z, fn) {
  if (opN > 6) return;
  opN++;
  Sound.at(x + 0.5, y + 0.5, z + 0.5, fn, { max: 32 });
}
function listen() {
  on('blockOp', (k, v) => {
    const old = blocks.get(k), [x, y, z] = k.split(',').map(Number);
    if (v === null && old) remoteOp(x, y, z, () => Sound.blockBreak(blockMaterial(old)));
    else if (v && v !== old) remoteOp(x, y, z, () => Sound.blockPlace(blockMaterial(v)));
  });
  on('vox', (x, y, z) => {
    if (!NET.silent) return; // vlastní těžbu ozvučuje interaction.js
    const v = getVox(x, y, z);
    remoteOp(x, y, z, () => (v === V.AIR ? Sound.blockBreak(y >= topY(x, z) - 2 ? 'dirt' : 'stone') : Sound.blockPlace(voxMaterial(v))));
  });
  on('torchDrop', (x, y, z) => remoteOp(x, y, z, () => Sound.blockBreak('wood'))); // pochodeň bez opory odpadla (shared/world/torch.js)
  initUISounds();
}

// Název skladby na chvíli pod hodinami (♪ Ranní louka), jen když je hudba slyšet.
function nowPlaying(title) {
  if (!(Sound.vols?.music > 0) || !(Sound.vols?.vol > 0)) return;
  let el = document.getElementById('nowPlaying');
  if (!el) { el = document.createElement('div'); el.id = 'nowPlaying'; document.body.append(el); }
  el.textContent = `♪ ${title}`;
  el.classList.remove('show');
  void el.offsetWidth; // znovu spustit animaci
  el.classList.add('show');
}

/** Jeden snímek zvukové krajiny. gust = síla poryvu větru 0–1 (stejná jako tráva). */
export function updateSoundscape(dt, gust) {
  const S = Sound;
  if (!S.ctx) return;
  if (!started) { started = true; S.ambience = new Ambience(S); S.hums = new Hums(S); S.music = new Music(S); S.music.onStart = nowPlaying; listen(); }
  camera.getWorldDirection(fwd);
  S.listen(camera.position.x, camera.position.y, camera.position.z, fwd.x, fwd.y, fwd.z);
  if ((envT -= dt) <= 0) {
    envT = 0.2;
    sense(gust);
    S.setMuffle(env.under ? 550 : 20000);
    S.setRoom(0.04 + 0.42 * env.cave + 0.1 * env.indoor);
  }
  env.gust = gust;
  S.ambience.update(dt, env);
  S.music.update(dt, env);
  if ((humT -= dt) <= 0) { humT = 0.25; S.hums.update(humSources()); }
  otherSteps(dt);
  mobLife(dt);
  if (inv.sel !== lastSel) { if (lastSel >= 0) S.ui('select'); lastSel = inv.sel; }
  if ((opT -= dt) <= 0) { opT = 0.15; opN = 0; }
}
