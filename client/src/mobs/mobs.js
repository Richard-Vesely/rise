// Tvorové v prohlížeči: 3D modely, animace, zvuky a jiskry. Chování a rození je v shared/sim/mobs.js.
import '../player/interaction.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { daylight } from '../../../shared/sim/day.js';
import { wrapAngle } from '../../../shared/util.js';
import { RIM, animateCharacter, buildMobModel } from './mob-models.js';
import { on } from '../../../shared/events.js';
import { NET } from '../../../shared/net/net.js';
import { DEATH_TIME, hurtMob, mobs } from '../../../shared/sim/mobs.js';
import { MOB_INVULN } from '../../../shared/tools.js';
import { nearLight } from '../../../shared/world/collision.js';
import { shrineDist } from '../../../shared/world/terrain.js';
import { Sound } from '../audio/sound.js';
import { toolSound } from '../audio/tool-sounds.js';
import { addItem } from '../player/inventory.js';
import { player } from '../player/player.js';
import { damagePlayer } from '../player/survival.js';
import { emitChips, emitStars } from '../render/chips.js';
import { debris, sparks } from '../render/particles.js';
import { scene } from '../render/renderer.js';
import { invOpen, renderInventory, ui } from '../ui/inventory-ui.js';
import { noteHit } from '../player/xp.js';

// ============================================================ tvorové: modely (mob-models.js), animace a „život“
// Oči mrkají, hlava sleduje hráče do 8 m, uši a ocas sebou škubnou, zvířata se na místě pasou a rozhlížejí,
// při běhu se práší, stínožrout za sebou nechává kouř, golemovi pulzují praskliny. Zásah = krátce zčervená,
// smrt = převrátí se na bok a zmizí v obláčku (DEATH_TIME z pravidel). Stejná animace pro tvory, které simuluje tahle hra,
// i pro loutky klienta.
const views = new Map();
export function viewOf(m) {
  let V = views.get(m);
  if (!V) {
    V = buildMobModel(m.type);
    V.mats = V.flash;
    V.group.position.set(m.pos.x, m.pos.y, m.pos.z);
    V.group.rotation.y = m.ry;
    Object.assign(V, { yaw: m.ry, t: Math.random() * 10, blink: 1 + Math.random() * 4, idleT: 2 + Math.random() * 4, idle: null, ear: 0, earT: 2 + Math.random() * 5, step: 0 });
    scene.add(V.group, V.shadow);
    views.set(m, V);
  }
  return V;
}
// Každý snímek: model pro nového tvora, pryč s modelem tvora, který zmizel.
export function syncMobViews() {
  for (const m of mobs) viewOf(m);
  if (views.size > mobs.length) {
    const alive = new Set(mobs);
    for (const [m, V] of views) if (!alive.has(m)) { scene.remove(V.group, V.shadow); views.delete(m); }
  }
}
const lerpA = (a, b, k) => a + wrapAngle(b - a) * k;
// Rudé svítící oči: tvor loví hráče (štvanice). Vidí je všichni (server posílá stav v ['mobs']).
const RED_EYE = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff1a10).multiplyScalar(2.2) });
function redEyes(V, on) {
  V.red = on;
  if (!V.eyeMeshes) {
    V.eyeMeshes = [];
    for (const g of V.eyes) g.traverse((o) => { if (o.isMesh) V.eyeMeshes.push(o); });
    V.group.traverse((o) => { if (o.isMesh && o.userData.eye) V.eyeMeshes.push(o); }); // oči mimo skupinu očí (stínožrout)
  }
  for (const o of V.eyeMeshes) { o.userData.mat0 ??= o.material; o.material = on ? RED_EYE : o.userData.mat0; }
}
/**
 * Jeden snímek animace tvora. sp = rychlost (m/s), podle ní se hýbou nohy.
 * @param {ReturnType<typeof viewOf>} V
 */
export function poseMob(V, m, dt, sp) {
  V.t += dt;
  const k = (r) => 1 - Math.exp(-dt * r);
  if (m.dead) { animateDeath(V, m); return; }
  // Drak míří tělem i hlavou hned na cíl, bez opožděného otáčení zády.
  if (m.type === 'dragon') V.yaw = m.ry;
  m.phase += dt * (sp * 2.2 + (m.type === 'crawler' ? 2 : 0));
  const amt = Math.min(sp / 2, 1);
  let hop = 0;
  if (V.kind === 'blob') {
    hop = Math.abs(Math.sin(m.phase)) * (sp > 2 ? 0.5 : 0.18);
    const squash = 1 + Math.cos(m.phase * 2) * 0.12;
    V.body.scale.set(1 / Math.sqrt(squash), 0.8 * squash, 1.15 / Math.sqrt(squash));
    if (Math.random() < dt * (sp > 1 ? 14 : 5)) debris.emit(m.pos.x + (Math.random() - 0.5) * 0.6, m.pos.y + 0.7, m.pos.z + (Math.random() - 0.5) * 0.6, [0.12, 0.08, 0.16], 1, 0.4, 1.2); // kouř
  } else if (V.rig) { // markoman: animace postavy
    m.atkT = Math.max(0, (m.atkT || 0) - dt);
    animateCharacter(V.rig, { speed: sp, yaw: 0, pitch: 0, run: sp > 4, swing: m.atkT > 0.2, held: 'iron_sword' }, dt);
    V.rig.group.rotation.y = 0;
    V.rig.anim.bodyYaw = 0;
  } else if (V.kind === 'dragon') {
    V.legs.forEach((l, i) => { l.rotation.x = Math.sin(m.phase * 1.3 + (i === 0 || i === 3 ? 0 : Math.PI)) * amt * 0.45; });
    const flying = m.pos.y - m.groundY > 0.5;
    V.body.position.y = V.bodyY + Math.sin(V.t * 2) * 0.06;
    V.wings.forEach((w, i) => { w.rotation.z = (i ? 1 : -1) * (0.25 + Math.sin(V.t * (flying ? 8 : 1.7)) * (flying ? 0.52 : 0.12) + (m.windup > 0 ? 0.5 : 0)); });
    m.atkT = Math.max(0, (m.atkT || 0) - dt);
    V.jaw.rotation.x = m.windup > 0 ? 0.6 : m.atkT > 0 ? 0.9 : 0.08;
  } else if (V.kind === 'biped') { // golem
    const swing = Math.sin(m.phase * 1.1) * amt * 0.8;
    V.legs[0].rotation.x = swing; V.legs[1].rotation.x = -swing;
    m.atkT = Math.max(0, (m.atkT || 0) - dt);
    const atk = m.atkT > 0 ? -2.4 * Math.sin((1 - m.atkT / 0.35) * Math.PI) : 0;
    V.arms[0].rotation.x = atk || -swing * 0.8;
    V.arms[1].rotation.x = atk || swing * 0.6;
    V.body.position.y = V.bodyY + Math.abs(swing) * 0.05;
    if (Math.random() < dt * 3) sparks.emit(m.pos.x + (Math.random() - 0.5) * 1.2, m.pos.y + 2.2, m.pos.z + (Math.random() - 0.5) * 1.2, [0.35, 0.9, 1], 1, 0.3, 1.2); // světélka z krystalů
  } else { // čtyřnožci a slepice
    const fr = m.type === 'chicken' ? 3.4 : 2.2, swing = Math.sin(m.phase * fr) * amt * (m.type === 'chicken' ? 0.9 : 0.7);
    V.legs.forEach((l, i) => (l.rotation.x = (i === 0 || i === 3 ? 1 : -1) * swing));
    V.body.position.y = V.bodyY + Math.abs(Math.cos(m.phase * fr)) * 0.035 * amt;
    V.body.rotation.x = Math.sin(m.phase * fr * 2) * 0.02 * amt;
    for (const w of V.wings) w.rotation.z = (w.position.x > 0 ? -1 : 1) * (sp > 3.5 ? 0.5 + Math.sin(V.t * 40) * 0.5 : 0.05); // slepice na útěku mává křídly
    const step = Math.floor((m.phase * fr) / Math.PI);
    if (step !== V.step) { V.step = step; if (sp > 3.5 && m.type !== 'chicken') debris.emit(m.pos.x, m.pos.y + 0.05, m.pos.z, [0.5, 0.45, 0.36], 2, 1, 0.6); } // prach při běhu
  }
  // hlava: sleduje hráče do 8 m, na místě se občas pase, čichá nebo rozhlédne
  if (V.head && V.kind !== 'blob') {
    const dx = player.pos.x - m.pos.x, dz = player.pos.z - m.pos.z, d = Math.hypot(dx, dz);
    const still = sp < 0.4;
    if (still && m.type !== 'dragon' && (V.idleT -= dt) < 0) { V.idleT = 3 + Math.random() * 5; V.idle = V.idle ? null : ['graze', 'look', 'graze', 'sniff'][Math.floor(Math.random() * 4)]; V.idleDir = (Math.random() - 0.5) * 1.6; }
    if (!still) V.idle = null;
    let yaw = 0, pitch = 0;
    if (d < 8 && d > 0.5 && (V.idle !== 'graze' || d < 3)) { // hráč blízko: zvedne hlavu a dívá se na něj
      yaw = m.type === 'dragon' ? 0 : Math.max(-1, Math.min(1, wrapAngle(Math.atan2(-dx, -dz) - V.yaw)));
      pitch = Math.atan2(player.pos.y + 1.4 - (m.pos.y + (m.def.cy || 0.6) * 1.5), d) * 0.6;
    } else if (V.idle === 'graze') pitch = m.type === 'chicken' ? -1 + Math.abs(Math.sin(V.t * 7)) * 0.4 : -1.05 + Math.sin(V.t * 3) * 0.06;
    else if (V.idle === 'look') yaw = V.idleDir;
    else if (V.idle === 'sniff') pitch = -0.35 + Math.sin(V.t * 14) * 0.04;
    if (V.rig) { V.rig.head.rotation.y = lerpA(V.rig.head.rotation.y, yaw, k(5)); }
    else {
      V.head.rotation.y = m.type === 'dragon' ? 0 : lerpA(V.head.rotation.y, yaw, k(5));
      V.head.rotation.x += (V.headRest + pitch - V.head.rotation.x) * k(5);
    }
  }
  // mrkání, uši, ocas
  if ((V.blink -= dt) < 0) V.blink = 3 + Math.random() * 3;
  const open = V.blink < 0.12 ? 0.12 : 1;
  for (const e of V.eyes) e.scale.y = open;
  if (!!m.hunt !== !!V.red) redEyes(V, !!m.hunt); // štvanice z hole vlastníka (shared/sim/hunt.js)
  if ((V.earT -= dt) < 0) { V.earT = 2 + Math.random() * 5; V.ear = 1; }
  V.ear = Math.max(0, V.ear - dt * 6);
  V.ears.forEach((e, i) => (e.rotation.x = Math.sin(V.ear * Math.PI) * (i ? 0.5 : -0.5)));
  if (V.tail) {
    if (m.type === 'dragon') V.tail.rotation.y = Math.sin(V.t * 1.5) * 0.15;
    else if (m.type === 'wolf') V.tail.rotation.y = Math.sin(V.t * (sp > 3 ? 4 : 1.5)) * 0.3;
    else V.tail.rotation.z = Math.sin(V.t * (m.type === 'cow' ? 1.8 : 6)) * (m.type === 'cow' ? 0.25 : 0.15);
  }
  // golemovi pulzují praskliny, stínožroutovi žilky
  for (const mat of V.flash) if (mat.userData.pulse) mat.emissiveIntensity = (m.type === 'golem' ? 0.5 : 0.35) + Math.sin(V.t * 2.4) * 0.3;
  V.group.position.set(m.pos.x, m.pos.y + hop + hitHop(m, dt), m.pos.z);
  V.yaw = lerpA(V.yaw, m.ry, k(12));
  V.group.rotation.set(0, V.yaw, 0);
  V.shadow.position.set(m.pos.x, m.pos.y + 0.03, m.pos.z);
  V.shadow.visible = true;
  paintFlash(V, m.flash || 0);
}
// Zásah: tvor zčervená (jako v Minecraftu). Svítící části (oči, krystaly) zůstanou; pulzující praskliny si záři řídí samy.
const FLASH_RED = new THREE.Color(0.9, 0.06, 0.04);
export function paintFlash(V, f) {
  if (V.lastFlash === f) return;
  V.lastFlash = f;
  for (const mat of V.mats) {
    if (mat.userData.glow) continue;
    const base = (mat.userData.baseColor ??= mat.color.clone()); // bílá ovce musí zčervenat, ne jen zesvětlat
    mat.color.copy(base).lerp(FLASH_RED, f * 0.7);
    if (!mat.userData.pulse) mat.emissive.setRGB(f * 0.45, f * 0.02, 0);
  }
}
// Po zásahu tvor krátce poskočí (odhození vypadá jako rána, ne jako posun)
export function hitHop(m, dt) {
  if (!(m.hitHop > 0)) return 0;
  m.hitHop = Math.max(0, m.hitHop - dt);
  return Math.sin((1 - m.hitHop / 0.28) * Math.PI) * 0.28;
}
// Smrt: tvor se převrátí na bok, zčervená a rozplyne se v obláčku kouře
export function animateDeath(V, m) {
  const k = Math.min(1, m.deathT / 0.35);
  V.baseScale ??= V.group.scale.x;
  V.group.rotation.set(0, V.yaw ?? m.ry, (m.nid % 2 ? 1 : -1) * k * k * (Math.PI / 2));
  const fade = Math.max(0, Math.min(1, (DEATH_TIME - m.deathT) / 0.2));
  V.group.scale.setScalar(Math.max(0.01, fade) * V.baseScale);
  V.shadow.visible = fade > 0.5;
  paintFlash(V, 0.55);
  if (!m.puffed && m.deathT > DEATH_TIME - 0.22) {
    m.puffed = true;
    const at = [m.pos.x, m.pos.y + m.def.cy * 0.6, m.pos.z];
    debris.emit(...at, [0.8, 0.8, 0.82], 26, 1.4, 1.4);
    if (m.type === 'crawler' || m.type === 'markoman' || m.type === 'golem') sparks.emit(...at, m.type === 'golem' ? [0.4, 0.9, 1] : [0.6, 0.25, 1], 20, 2, 1.5);
    toolSound('poof');
  }
}
const MOON = new THREE.Color(0x6e8bc4);
// Animace tvorů, které simuluje tato hra (hra pro jednoho, hostitel): volá se hned po updateMobs se stejným dt.
export function animateMobs(dt) {
  for (const m of mobs) poseMob(viewOf(m), m, dt, Math.hypot(m.vel.x, m.vel.z));
  mobLife(dt);
}
/** Pro hostitele i klienta: měsíční obrys tvorů a postav podle toho, jak je tma. */
export function mobLife() {
  RIM.value.copy(MOON).multiplyScalar(daylight().night * 0.6);
}

// ---------- útok hráče u této obrazovky; připojený hráč posílá ránu hostiteli
// kb = síla odhození, fx = { crit, charge } jen pro efekty. Vrací false, když byl tvor ještě nezranitelný.
let localFx = null;
export function hitMob(m, dmg, yaw = player.yaw, kb = 1, fx = {}) {
  noteHit(m); // XP, když tvor do 4 s padne (player/xp.js)
  if (NET.client) { // útok jde hostiteli, tady jen odezva
    const now = performance.now() / 1000;
    if (m.dead || now - (m.hitAt || -9) < MOB_INVULN) return false;
    m.hitAt = now;
    NET.req(['hit', m.nid, dmg, yaw, kb]);
    m.flash = 1;
    hitFx(m, dmg, true, fx);
    return true;
  }
  localFx = fx;
  try { return hurtMob(m, dmg, yaw, kb); } finally { localFx = null; }
}
const HIT_COL = { crawler: [[0.45, 0.15, 0.7], [0.2, 0.05, 0.3]], golem: [[0.45, 0.95, 1], [0.7, 0.75, 0.8]], markoman: [[0.55, 0.06, 0.06], [0.7, 0.72, 0.76]] };
// Odezva zásahu: jiskry, kapky (kostičky), u kritického zásahu hvězdičky, zvuk a poskočení
function hitFx(m, dmg, local, fx) {
  const at = [m.pos.x, m.pos.y + m.def.cy, m.pos.z];
  sparks.emit(...at, m.type === 'crawler' ? [0.7, 0.25, 1.0] : m.type === 'golem' ? [0.4, 0.9, 1] : [1, 0.3, 0.2], 8 + Math.min(16, Math.round(dmg * 1.5)), 3.5, 1.5);
  emitChips(at, HIT_COL[m.type] || [[0.6, 0.05, 0.05], [0.35, 0.02, 0.03]], Math.min(14, 3 + Math.round(dmg)), { speed: 1.8, up: 2, size: [0.03, 0.06], life: [0.3, 0.8], spread: m.def.radius * 0.6 });
  m.hitHop = 0.28;
  if (fx?.crit) { emitStars(at, [1, 0.92, 0.55], 16, 3.5); toolSound('crit'); }
  if (local) toolSound((fx?.charge ?? 1) < 0.5 ? 'weak' : 'hit', fx?.charge ?? 1); else mobAt(m, () => Sound.hit()); // rána jiného hráče zní od tvora
}
export const playerSafe = () => shrineDist(player.pos.x, player.pos.z) < 11 || nearLight(player.pos.x, player.pos.z, 5);

// ---------- co se děje s tvory (události z pravidel): jiskry, zvuky, kořist, zranění
// Zvuky tvorů znějí z místa, kde tvor je (směr a vzdálenost).
const mobAt = (m, fn, ref = 4) => Sound.at(m.pos.x, m.pos.y + m.def.cy, m.pos.z, fn, { ref });
on('mobHit', (m, local, dmg = 1) => {
  hitFx(m, dmg, local, local ? localFx : null);
  if (m.type === 'golem') mobAt(m, () => Sound.mat('crystal', 'hit', 1.5));
  if (m.type === 'sheep' || m.type === 'boar' || m.type === 'wolf' || m.type === 'cow' || m.type === 'chicken') mobAt(m, () => Sound.mobVoice(m.type));
});
on('mobKilled', (m) => {
  sparks.emit(m.pos.x, m.pos.y + m.def.cy, m.pos.z, m.type === 'crawler' ? [0.6, 0.2, 1.0] : [0.9, 0.85, 0.75], 30, 4, 2);
  mobAt(m, () => { if (m.type === 'crawler' || m.type === 'markoman' || m.type === 'golem') Sound.kill(); else Sound.burst({ dur: 0.35, f0: 1200, f1: 200, q: 0.8, vol: 0.18, type: 'lowpass' }); });
});
on('chestLoot', () => { if (invOpen && ui.mode === 'chest') renderInventory(); });
on('mobBurn', (m) => debris.emit(m.pos.x, m.pos.y + 0.8, m.pos.z, [0.1, 0.1, 0.1], 2, 1, 2));
on('mobAttack', (m) => mobAt(m, () => { if (m.type === 'markoman' || m.type === 'golem') Sound.swing(); else if (m.type === 'dragon' || m.type === 'wolf' || m.type === 'boar' || m.type === 'crawler') Sound.mobVoice(m.type); }));
on('mobSound', (m) => mobAt(m, () => Sound.mobVoice(m.type), m.type === 'wolf' || m.type === 'cow' ? 8 : 4)); // vytí a bučení je slyšet dál
on('spawnerSpawn', (x, y, z) => sparks.emit(x, y, z, [0.8, 0.3, 1], 25, 2, 1));
// Kořist pro hráče u této obrazovky, když je do 24 m; zranění od tvora.
NET.localLoot = (m, id, n) => { if (Math.hypot(m.pos.x - player.pos.x, m.pos.y - player.pos.y, m.pos.z - player.pos.z) < 24) addItem(id, n); };
NET.hurtLocal = (dmg, dx, dz) => damagePlayer(dmg, dx, dz);
