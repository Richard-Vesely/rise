// Postavičky: ostatní hráči (podle jejich pozice `pose`) a vlastní postava v pohledu ze třetí osoby (klávesa V).
// Model, brnění a animace jsou v render/character.js, oblek v menu/costume.js.
import './multiplayer.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { ITEMS, cleanCostume, encodeCostume, LIGHT_COLORS, newerCostume } from '../../../shared/data/index.js';
import { NET, r2 } from '../../../shared/net/net.js';
import { others } from '../../../shared/net/room.js';
import { clamp } from '../../../shared/util.js';
import { solidAny } from '../../../shared/world/collision.js';
import { vehicles } from '../../../shared/world/state.js';
import { terrainH } from '../../../shared/world/terrain.js';
import { columnDug, topY } from '../../../shared/world/voxels.js';
import { Sound } from '../audio/sound.js';
import { dining } from '../dining/dining.js';
import { BOOT } from '../game/boot.js';
import { loadCostume, saveCostume } from '../menu/costume.js';
import { heldStack } from '../player/inventory.js';
import { creative, input, isLocked, player } from '../player/player.js';
import { animateCharacter, buildCharacter, disposeCharacter, setCharacterArmor } from '../render/character.js';
import { buildHeld, holder, swingT } from '../render/held-item.js';
import { ICONS } from '../render/icons.js';
import { debris, sparks } from '../render/particles.js';
import { camera, scene } from '../render/renderer.js';
import { toast } from '../ui/hud.js';
import { armor, fullSet, invOpen, ui } from '../ui/inventory-ui.js';
import { hornN } from '../vehicles/car.js';

// ---------- můj oblek: z prohlížeče (podle jména), na serveru kroužku novější verze z profilu
let myCostume = loadCostume(NET.name);
const fromServer = BOOT.welcome?.me?.look;
if (fromServer) {
  const best = newerCostume(myCostume, cleanCostume(fromServer, NET.name));
  if (best !== myCostume) myCostume = saveCostume(NET.name, best, best.t || Date.now());
}
let myLk = encodeCostume(myCostume);
addEventListener('rise-costume', (e) => {
  myCostume = cleanCostume(e.detail, NET.name);
  if (e.detail?.t) myCostume.t = e.detail.t;
  myLk = encodeCostume(myCostume);
  if (me) { scene.remove(me.group); disposeCharacter(me); me = null; }
  if (window.gameStarted) toast('Nový oblek je na tobě!');
});

// ---------- jmenovka: skleněná cedulka se jménem, tečkou v barvě světel obleku a ukazatelem zdraví
function drawTag(T) {
  const c = T.canvas, g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.font = '700 46px "Exo 2", system-ui, sans-serif';
  const tw = Math.min(400, g.measureText(T.name).width), w = tw + 92, x0 = 256 - w / 2, h = 72, y0 = 14;
  const round = (x, y, ww, hh, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, ww, hh, r) : g.rect(x, y, ww, hh); };
  round(x0, y0, w, h, 14);
  g.fillStyle = 'rgba(15,20,28,0.82)'; g.fill();
  g.lineWidth = 3; g.strokeStyle = 'rgba(56,232,255,0.55)';
  round(x0 + 2.5, y0 + 2.5, w - 5, h - 5, 12); g.stroke();
  g.fillStyle = T.light; g.shadowColor = T.light; g.shadowBlur = 12;
  g.beginPath(); g.arc(x0 + 34, y0 + h / 2, 10, 0, 7); g.fill();
  g.shadowBlur = 0;
  g.fillStyle = '#f2f7fc'; g.textBaseline = 'middle';
  g.fillText(T.name, x0 + 56, y0 + h / 2 + 2, 400);
  if (T.hp < 100) { // zdraví jen když není plné
    const bw = w - 40, k = clamp(T.hp / 100, 0, 1);
    g.fillStyle = 'rgba(15,20,28,0.8)'; round(256 - bw / 2 - 3, y0 + h + 8, bw + 6, 16, 8); g.fill();
    g.fillStyle = k > 0.5 ? '#5cff8a' : k > 0.25 ? '#ffb066' : '#ff5a5a';
    round(256 - bw / 2, y0 + h + 11, Math.max(10, bw * k), 10, 5); g.fill();
  }
  T.tex.needsUpdate = true;
}
function nameTag(name, light) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  s.scale.set(1.5, 0.375, 1);
  s.center.set(0.5, 0.3);
  const T = { canvas: c, tex, name, light, hp: 100, sprite: s };
  drawTag(T);
  document.fonts?.load('700 46px "Exo 2"').then(() => drawTag(T), () => {});
  s.userData.tag = T;
  return s;
}

// ---------- předmět v ruce postavičky (stejný model jako v první osobě, otočený dopředu)
function setHeld(R, id) {
  R.held = id;
  R.hand.clear();
  if (!id || !ITEMS[id] || !ICONS[id]) return;
  const m = buildHeld(id);
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, -0.02, -0.02);
  m.scale.multiplyScalar(0.95);
  m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  R.hand.add(m);
}
// průměrná barva ikony předmětu (drobky při jídle)
const iconCol = {};
function iconColor(id) {
  if (iconCol[id]) return iconCol[id];
  let r = 0.8, g = 0.6, b = 0.4;
  try {
    const d = ICONS[id].canvas.getContext('2d').getImageData(0, 0, 16, 16).data;
    let n = 0; r = g = b = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 200) continue; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    if (n) { r /= n * 255; g /= n * 255; b /= n * 255; } else r = g = b = 0.7;
  } catch {}
  return (iconCol[id] = [r, g, b]);
}
// Prach od nohou, trysky při letu, drobky při jídle (pro ostatní hráče i vlastní postavu ze třetí osoby).
function effects(R, s, pos, dt) {
  const A = R.anim, step = Math.floor(A.phase / Math.PI);
  if (step !== R.lastStep) { // kroky samotné zní z audio/soundscape.js
    R.lastStep = step;
    if (!s.fly && !s.sit && s.speed > 6) debris.emit(pos.x, pos.y + 0.05, pos.z, [0.55, 0.5, 0.42], 3, 1.2, 0.8); // prach při běhu
  }
  if (s.fly && (R.costume.s === 'pilot' || R.costume.s === 'sky') && Math.random() < dt * 30) {
    const back = new THREE.Vector3(0, 0, 0.24).applyAxisAngle(THREE.Object3D.DEFAULT_UP, R.group.rotation.y);
    const c = new THREE.Color(LIGHT_COLORS[R.costume.l][1]);
    sparks.emit(pos.x + back.x, pos.y + 0.95, pos.z + back.z, [c.r, c.g, c.b], 1, 0.6, -2.5);
  }
  if (s.eat && s.held && Math.random() < dt * 5) {
    const f = new THREE.Vector3(0, 0, -0.3).applyAxisAngle(THREE.Object3D.DEFAULT_UP, R.group.rotation.y);
    debris.emit(pos.x + f.x, pos.y + 1.5, pos.z + f.z, iconColor(s.held), 2, 1, 0.5);
  }
}
function makeAvatar(P) {
  const look = cleanCostume(P.pose?.lk, P.name);
  const R = buildCharacter(look);
  R.lk = P.pose?.lk || '';
  R.tag = nameTag(P.name, LIGHT_COLORS[look.l][1]);
  R.tag.position.y = 2.12;
  R.group.add(R.tag);
  scene.add(R.group);
  R.init = false;
  return R;
}
const shown = new Map(); // hráč -> postavička ve scéně
export function updateAvatars(dt) {
  for (const [P, A] of shown) if (others.get(P.pid) !== P) { scene.remove(A.group); disposeCharacter(A); shown.delete(P); } // hráč odešel
  const k = 1 - Math.exp(-dt * 12);
  for (const P of others.values()) {
    const q = P.pose;
    if (!q) continue;
    if (P.avatar && (q.lk || '') !== P.avatar.lk) { scene.remove(P.avatar.group); disposeCharacter(P.avatar); P.avatar = null; } // jiný oblek
    if (!P.avatar) shown.set(P, (P.avatar = makeAvatar(P)));
    const A = P.avatar;
    A.group.visible = q.alive !== false && !q.veh; // v autě není postavička vidět (sedí uvnitř)
    const tx = q.x, ty = q.y - (q.sit ? 0.42 : 0), tz = q.z, pos = A.group.position;
    if (!A.init || Math.hypot(pos.x - tx, pos.z - tz) > 12) { pos.set(tx, ty, tz); A.anim.bodyYaw = q.yaw; A.init = true; }
    else pos.lerp(new THREE.Vector3(tx, ty, tz), k);
    if (q.held !== A.held) setHeld(A, q.held);
    const ar = (q.ar || []).map((id) => (id && ITEMS[id]?.armor ? id : null));
    if (ar.join('|') !== A.armorKey) setCharacterArmor(A, ar);
    const hp = typeof q.hp === 'number' ? q.hp : 100, hurt = hp < (A.lastHp ?? hp) - 0.5;
    A.lastHp = hp;
    const T = A.tag.userData.tag, hpStep = Math.ceil(hp / 5) * 5, tagName = (q.pv && !NET.pvp ? '⚔ ' : '') + P.name; // ⚔ = má zapnuté souboje
    if (T.hp !== hpStep || T.name !== tagName) { T.hp = hpStep; T.name = tagName; drawTag(T); }
    const d = Math.hypot(pos.x - camera.position.x, pos.z - camera.position.z);
    A.tag.material.opacity = clamp((48 - d) / 16, 0, 1);
    const s = { speed: Math.min(q.mv || 0, 12), yaw: q.yaw, pitch: q.pitch || 0, run: (q.mv || 0) > 6, sneak: !!q.sn, fly: !!q.fly || !!q.flyT, sit: !!q.sit,
      swing: !!q.sw, eat: !!q.eat, held: q.held, y: q.y, hurt };
    if (A.group.visible) { animateCharacter(A, s, dt); effects(A, s, pos, dt); }
  }
}

// ---------- vlastní postava a pohled ze třetí osoby (V: z první osoby → zezadu → zepředu)
export let viewMode = 0;
const VIEW_NAMES = ['Pohled z první osoby', 'Pohled zezadu', 'Pohled zepředu'];
export function toggleView() {
  viewMode = (viewMode + 1) % 3;
  toast(VIEW_NAMES[viewMode] + ' (V)');
  Sound.ui?.(viewMode ? 'open' : 'close');
}
let me = null, myArmorKey = null, myHeld;
/** Vlastní postava (jen když už byla vidět ze třetí osoby). */
export const localBody = () => me;
const eye = new THREE.Vector3(), applied = new THREE.Vector3(), dir = new THREE.Vector3();
let camDist = 0;
// Kamera ze třetí osoby: posune se až těsně před první pevný blok, aby nebyla ve zdi.
function blocked(x, y, z) {
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
  if (solidAny(fx, fy, fz)) return true;
  return y < terrainH(x, z) + 0.15 && y > topY(fx, fz) - 0.5 && !columnDug(fx, fz);
}
function thirdPersonCamera() {
  if (!(viewMode > 0 && me?.group.visible)) { camDist = 0; return; }
  if (camera.position.distanceToSquared(applied) < 1e-8) return; // v tomhle snímku už posunutá (scéna se kreslí víckrát)
  eye.copy(camera.position); // hra kameru každý snímek vrací do očí
  dir.set(0, 0, viewMode === 1 ? 1 : -1).applyQuaternion(camera.quaternion);
  let want = 4;
  for (let t = 0.3; t <= 4.2; t += 0.15) if (blocked(eye.x + dir.x * t, eye.y + dir.y * t, eye.z + dir.z * t)) { want = Math.max(0.3, t - 0.35); break; }
  camDist = want < camDist ? want : camDist + (want - camDist) * 0.15;
  camera.position.copy(eye).addScaledVector(dir, camDist);
  if (viewMode === 2) camera.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.PI));
  camera.updateMatrixWorld(true);
  applied.copy(camera.position);
  // kamera těsně u hlavy (zeď za zády): hlava by zakryla celý pohled, tak se schová
  const hide = camDist < 0.95 && viewMode === 1;
  if (me.head.scale.x < 0.5 !== hide) { me.head.scale.setScalar(hide ? 0.001 : 1); me.head.updateMatrixWorld(true); }
}
// Kamera se posouvá těsně před vykreslením (po míření a těžbě), takže míření zůstává z očí.
const prevBefore = scene.onBeforeRender;
scene.onBeforeRender = function (...a) { prevBefore?.apply(this, a); thirdPersonCamera(); };

/** Každý snímek: vlastní postava (vidět jen ze třetí osoby), zvuk při oblékání brnění. */
export function updateLocalBody(dt, moving) {
  const ids = armor.map((a) => a?.id || null), key = ids.join('|');
  if (myArmorKey !== null && key !== myArmorKey && ids.filter(Boolean).length > myArmorKey.split('|').filter(Boolean).length) { // oblékl si kus brnění
    Sound.mat?.('metal', 'place', 0.9); Sound.burst({ dur: 0.12, f0: 3200, f1: 1200, q: 2, vol: 0.08, delay: 0.04 }); // cvak plátu
  }
  myArmorKey = key;
  const show = viewMode > 0 && player.alive && !player.vehicle;
  holder.visible = !show;
  if (!show) { if (me) me.group.visible = false; return; }
  if (!me) { me = buildCharacter(myCostume); scene.add(me.group); me.anim.bodyYaw = player.yaw; myHeld = undefined; me.armorKey = null; }
  me.group.visible = true;
  if (me.armorKey !== key) setCharacterArmor(me, ids);
  const held = player.eating?.id || heldStack()?.id || null;
  if (held !== myHeld) { myHeld = held; setHeld(me, held); }
  me.group.position.set(player.pos.x, player.pos.y - (player.sitting ? 0.42 : 0), player.pos.z);
  const s = { speed: moving, yaw: player.yaw, pitch: player.pitch, run: !!player.sprinting, sneak: !!player.sneaking, fly: !!player.flying || player.flyT > 0, sit: !!player.sitting,
    swing: swingT >= 0 || (input.lmb && isLocked()), eat: !!player.eating || !!dining, held, y: player.pos.y, hurt: me.anim.hurtSeen !== undefined && me.anim.hurtSeen !== player.lastHurt };
  me.anim.hurtSeen = player.lastHurt;
  animateCharacter(me, s, dt);
  effects(me, s, me.group.position, dt);
}

export function myPose() {
  return {
    x: r2(player.pos.x), y: r2(player.pos.y), z: r2(player.pos.z), yaw: r2(player.yaw), pitch: r2(player.pitch), held: player.eating?.id || heldStack()?.id || null,
    ui: invOpen && ui.fireKey != null ? String(ui.fireKey) : null, // otevřená truhla / stroj (zámek)
    mv: r2(Math.hypot(player.vel.x, player.vel.z)), sw: swingT >= 0 || (input.lmb && isLocked()) ? 1 : 0, eat: player.eating || dining ? 1 : 0,
    veh: (() => { const v = vehicles.get(player.vehicle); return v ? { id: player.vehicle, x: r2(v.x), y: r2(v.y), z: r2(v.z), yaw: r2(v.yaw), pitch: r2(v.pitch || 0), roll: r2(v.roll || 0), spd: r2(v.spd), steer: r2(v.steer), thr: r2(v.thr || 0), lights: v.lights ? 1 : 0 } : null; })(), hn: hornN,
    ar: armor.map((a) => a?.id || null), sit: player.sitting ? 1 : 0, fly: player.flying ? 1 : 0, flyT: player.flyT > 0 ? 1 : 0, alive: player.alive, cr: creative ? 1 : 0, set: fullSet(), hp: Math.round(player.hp),
    lk: myLk, ...(player.sneaking ? { sn: 1 } : {}), ...(NET.pvpOn ? { pv: 1 } : {}), // pv = zapnuté souboje
  };
}
