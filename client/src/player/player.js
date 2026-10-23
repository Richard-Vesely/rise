// Hráč: ovládání, pohyb a kolize.
import '../pc/editor.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { BLOCKS, shapeBoxes } from '../../../shared/data/index.js';
import { NET } from '../../../shared/net/net.js';
import { clamp } from '../../../shared/util.js';
import { EYE, GRAVITY, JUMP, PH, PW, RUN, WALK } from '../../../shared/world/constants.js';
import { bkey, blockMeta, blocks, vehicles } from '../../../shared/world/state.js';
import { waterAt } from '../../../shared/world/nature.js';
import { shrineOf, terrainH } from '../../../shared/world/terrain.js';
import { V, VMIN, getVox, groundHeight, solidVox, topY } from '../../../shared/world/voxels.js';
import { materialAt } from '../audio/materials.js';
import { Sound } from '../audio/sound.js';
import { MP } from '../game/boot.js';
import { game } from '../game/debug.js';
import { TOUCH, lookSens } from '../game/prefs.js';
import { save } from '../game/save-load.js';
import { toggleView } from '../net/avatars.js';
import { openChat } from '../net/mp-ui.js';
import { pcOpen } from '../pc/computer.js';
import { docOpen } from '../pc/doc-view.js';
import { forestColliders } from '../render/forest.js';
import { sparks } from '../render/particles.js';
import { camera, renderer } from '../render/renderer.js';
import { $ } from '../ui/dom.js';
import { toast } from '../ui/hud.js';
import { closeInventory, fullSet, invOpen, openInventory, renderHotbar, renderInventory } from '../ui/inventory-ui.js';
import { enterVehicle, exitVehicle, honk, toggleCarCam, vehiclePush } from '../vehicles/car.js';
import { dropHeld } from '../world/ground-items.js';
import { shrineColliders } from '../world/shrine.js';
import { resetUseCd, target } from './interaction.js';
import { inv } from './inventory.js';
import { swapHands } from './offhand.js';

// ============================================================ hráč a ovládání
const canvas = renderer.domElement;
let touchLocked = false;
export const isLocked = () => (TOUCH ? touchLocked : document.pointerLockElement === canvas);
// Na počítači Pointer Lock, na dotyku jen přepnutí stavu (ostatní kód poslouchá stejnou událost pointerlockchange).
export function lockPointer() {
  if (!TOUCH) { canvas.requestPointerLock?.()?.catch?.(() => {}); return; }
  if (!touchLocked) { touchLocked = true; document.dispatchEvent(new Event('pointerlockchange')); }
}
export function unlockPointer() {
  if (!TOUCH) { document.exitPointerLock?.(); return; }
  if (touchLocked) { touchLocked = false; document.dispatchEvent(new Event('pointerlockchange')); }
}
export const player = {
  pos: new THREE.Vector3(...(save?.pos || [0, 0.45, 14])), vel: new THREE.Vector3(),
  yaw: save?.yaw ?? 0, pitch: -0.05, onGround: true, bob: 0,
  hp: save?.hp ?? 100, hunger: save?.hunger ?? 100, alive: true, lastHurt: -99, shake: 0, stepSmooth: 0,
};
export const keys = new Set();
export const input = { lmb: false, rmb: false };
export let resetting = false;
export function setResetting(on) { resetting = on; }
// Kreativní režim: létání, okamžité ničení, nekonečné bloky, všechny předměty, žádné zranění.
export let creative = !!save?.creative;
player.flying = creative && !!save?.flying;
player.flyT = save?.flyT || 0;
let lastSpace = 0;
// Návod (klávesa H)
export let guideOpen = false;
export function toggleGuide() {
  guideOpen = !guideOpen;
  if (guideOpen && invOpen) closeInventory();
  $('guide').style.display = guideOpen ? 'grid' : 'none';
  if (guideOpen) unlockPointer(); else lockPointer();
}
$('guideBtn').addEventListener('click', toggleGuide);
// Výběr obleku (klávesa O nebo tlačítko v batohu): okno je v client/src/menu/costume.js
export function openCostume() {
  if (invOpen) closeInventory();
  unlockPointer();
  window.RiseCostume?.open({ name: NET.name, onClose: () => lockPointer() });
}
// tlačítko Oblek je pod brněním v batohu (ui/inventory-ui.js překresluje okno, proto delegace)
$('inventory').addEventListener('click', (e) => { if (e.target.closest('#costumeBtn')) openCostume(); });
$('modeBtn').textContent = `Režim: ${creative ? 'Kreativní' : 'Přežití'}`;
export function setCreative(on) {
  if (on && !NET.perm) { toast('Kreativní režim zakázal hostitel'); return; }
  creative = on;
  if (!on) player.flying = false;
  toast(on ? 'Kreativní režim · 2× Mezerník = létání' : 'Režim přežití');
  $('modeBtn').textContent = `Režim: ${on ? 'Kreativní' : 'Přežití'}`;
  renderInventory();
  renderHotbar();
}

addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return; // psaní do chatu nebo do pole
  if (MP && e.code === 'KeyT' && !e.repeat && !invOpen && !guideOpen && (isLocked() || game.testMode)) { e.preventDefault(); openChat(); return; }
  if (e.code === 'KeyE' && !e.repeat) { invOpen ? closeInventory() : (isLocked() || game.testMode) && openInventory(); return; }
  if (e.code === 'Escape' && invOpen) { closeInventory(); return; }
  if (e.code === 'KeyH' && !e.repeat) { toggleGuide(); return; }
  if (guideOpen) return;
  if (e.code === 'KeyC' && !e.repeat && !invOpen) { setCreative(!creative); return; }
  if (e.code === 'KeyG' && !e.repeat && !invOpen && (isLocked() || game.testMode)) { dropHeld(e.shiftKey); return; }
  // Auto: F nastoupit / vystoupit, L světla, B klakson, V kamera (první / třetí osoba)
  if (e.code === 'KeyF' && !e.repeat && !invOpen && (isLocked() || game.testMode)) {
    if (player.vehicle) exitVehicle(); else if (target?.kind === 'vehicle') enterVehicle(target.id); else swapHands(); // jinak F = prohodit ruce (offhand.js)
    return;
  }
  if (player.vehicle && !e.repeat && !invOpen) {
    const v = vehicles.get(player.vehicle);
    if (e.code === 'KeyL' && v) { if (v.type !== 'plane' && !v.lights && !v.engine && !(v.slots[0]?.id === 'car_battery' && v.bat > 0)) toast('Světla nesvítí – vybitá autobaterie'); else v.lights = !v.lights; return; }
    if (e.code === 'KeyB' && v?.type !== 'plane') { honk(); return; }
    if (e.code === 'KeyV') { toggleCarCam(); player.yaw = 0; return; }
  }
  if (e.code === 'KeyV' && !e.repeat && !invOpen && !player.vehicle) { toggleView(); return; } // pohled z první / třetí osoby
  if (e.code === 'KeyO' && !e.repeat && !invOpen && (isLocked() || game.testMode)) { openCostume(); return; }
  // Nebeská sada: dvojitý skok
  if (e.code === 'Space' && !e.repeat && !creative && fullSet() === 'sky' && !player.onGround && !player.doubleUsed && !(player.flyT > 0)) {
    player.vel.y = JUMP; player.doubleUsed = true; sparks.emit(player.pos.x, player.pos.y, player.pos.z, [1, 0.9, 0.6], 20, 2, 0);
  }
  if (e.code === 'Space' && !e.repeat && creative && !player.vehicle) {
    const now = performance.now();
    if (now - lastSpace < 300) { player.flying = !player.flying; player.vel.y = 0; toast(player.flying ? 'Létání zapnuto' : 'Létání vypnuto'); }
    lastSpace = now;
  }
  const m = e.code.match(/^Digit([1-9])$/);
  if (m) { inv.sel = Number(m[1]) - 1; renderHotbar(); }
  keys.add(e.code);
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); input.lmb = input.rmb = false; });
addEventListener('wheel', (e) => { if (!isLocked()) return; inv.sel = (inv.sel + Math.sign(e.deltaY) + 9) % 9; renderHotbar(); }, { passive: true });
canvas.addEventListener('mousedown', (e) => {
  Sound.init();
  if (!isLocked()) { if (!invOpen) lockPointer(); return; }
  if (e.button === 0) input.lmb = true;
  if (e.button === 2) { input.rmb = true; resetUseCd(); }
});
addEventListener('mouseup', (e) => { if (e.button === 0) input.lmb = false; if (e.button === 2) input.rmb = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('pointerlockchange', () => {
  $('hint').classList.toggle('hidden', isLocked() || invOpen || pcOpen || docOpen);
  if (!isLocked()) input.lmb = input.rmb = false;
});
addEventListener('mousemove', (e) => {
  if (!isLocked()) return;
  player.yaw -= e.movementX * 0.0022 * lookSens;
  player.pitch = clamp(player.pitch - e.movementY * 0.0022 * lookSens, -1.5, 1.5);
});

// Kolize hráče s položenými bloky (osa po ose, jako v Minecraftu). Schody, půlbloky, mříže a zábradlí mají vlastní kvádry.
const hitBoxes = [];
function overlapBoxes(p) {
  hitBoxes.length = 0;
  const x0 = p.x - PW, x1 = p.x + PW, y0 = p.y, y1 = p.y + PH, z0 = p.z - PW, z1 = p.z + PW;
  for (let y = Math.floor(y0); y <= Math.floor(y1 - 1e-3); y++)
    for (let z = Math.floor(z0); z <= Math.floor(z1); z++)
      for (let x = Math.floor(x0); x <= Math.floor(x1); x++) {
        const k = bkey(x, y, z), t = blocks.get(k), B = t && BLOCKS[t];
        if (B?.solid && B.shape) {
          for (const b of shapeBoxes(B.shape, blockMeta.get(k) || 0))
            if (x + b[0] < x1 && x + b[3] > x0 && y + b[1] < y1 && y + b[4] > y0 && z + b[2] < z1 && z + b[5] > z0) hitBoxes.push([x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]]);
        } else if (B?.solid || solidVox(x, y, z)) hitBoxes.push([x, y, z, x + 1, y + 1, z + 1]);
      }
  return hitBoxes;
}
export const collidesBlocks = (p) => overlapBoxes(p).length > 0;
const STEP_H = 0.55; // nejvyšší překážka, přes kterou se přejde bez skoku (schod, půlblok)
let stepOK = false;
function moveAxis(axis, amt) {
  if (!amt) return false;
  const p = player.pos;
  p[axis] += amt;
  let boxes = overlapBoxes(p);
  if (!boxes.length) return false;
  const E = 1e-3;
  if (axis !== 'y' && stepOK) { // nízká překážka: hráč na ni plynule vystoupí
    const top = Math.max(...boxes.map((b) => b[4])), oy = p.y;
    if (top - oy > 0 && top - oy <= STEP_H) {
      p.y = top + E;
      if (!collidesBlocks(p)) { player.stepSmooth -= p.y - oy; return false; }
      p.y = oy;
      boxes = overlapBoxes(p);
    }
  }
  if (axis === 'y') p.y = amt > 0 ? Math.min(...boxes.map((b) => b[1])) - PH - E : Math.max(...boxes.map((b) => b[4])) + E;
  else {
    const i = axis === 'x' ? 0 : 2;
    p[axis] = amt > 0 ? Math.min(...boxes.map((b) => b[i])) - PW - E : Math.max(...boxes.map((b) => b[i + 3])) + PW + E;
  }
  player.vel[axis] = 0;
  return axis === 'y' && amt < 0;
}
export const playerIntersects = (x, y, z) => { const p = player.pos; return p.x - PW < x + 1 && p.x + PW > x && p.y < y + 1 && p.y + PH > y && p.z - PW < z + 1 && p.z + PW > z; };

let lastStepSign = 1;
export function updatePlayer(dt) {
  if (player.sitting) {
    const stand = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].some((k) => keys.has(k)) || !blocks.has(player.sitting);
    if (!stand) {
      camera.position.set(player.pos.x, player.pos.y + EYE * 0.62, player.pos.z);
      camera.rotation.set(player.pitch, player.yaw, 0);
      return 0;
    }
    player.sitting = null;
    player.pos.y += 0.5;
  }
  let f = 0, s = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
  if (input.joy) { f -= input.joy.y; s += input.joy.x; } // dotykový joystick
  const len = Math.max(1, Math.hypot(f, s));
  if (player.flyT > 0) player.flyT = Math.max(0, player.flyT - dt);
  const set = fullSet();
  const flying = (creative && player.flying) || player.flyT > 0;
  const shift = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const sprint = flying ? keys.has('ControlLeft') : shift && player.hunger > 5;
  const speed = (flying ? (sprint ? 24 : 12) : sprint ? RUN : WALK) * (set === 'shadow' && !flying ? 1.25 : 1);
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  const tx = ((s * cos - f * sin) / len) * speed, tz = ((-s * sin - f * cos) / len) * speed;
  const v = player.vel, p = player.pos;
  const accel = Math.min(1, (player.onGround || flying ? 10 : 2.5) * dt);
  v.x += (tx - v.x) * accel;
  v.z += (tz - v.z) * accel;
  if (flying) { // Mezerník = nahoru, Shift = dolů, Ctrl = rychleji
    const up = (keys.has('Space') ? 1 : 0) - (shift ? 1 : 0);
    v.y += (up * 10 - v.y) * Math.min(1, 10 * dt);
  } else {
    if (player.onGround && keys.has('Space')) { v.y = JUMP; player.onGround = false; }
    v.y = Math.max(set === 'sky' ? -7 : -40, v.y - GRAVITY * dt); // nebeská sada: pomalý pád
  }

  // Pojistka: hráč uvízlý uvnitř bloků vyskočí nahoru.
  if (collidesBlocks(p)) { const g0 = groundHeight(p.x, p.z); p.y = isFinite(g0) && g0 > p.y ? g0 : p.y + 1; v.y = 0; }
  const wasGround = player.onGround, fallV = v.y;
  let landed = false;
  // Povrch platí jen pro hráče u povrchu – v jeskyni pod ním chodí po blocích.
  const surface = (prevY) => {
    // Ve vykopaném tunelu nebo jeskyni těsně pod povrchem (např. schody do kobky) povrch hráče nevytlačí nahoru.
    const fx = Math.floor(p.x), fz = Math.floor(p.z), fy = Math.floor(p.y);
    if (fy < topY(fx, fz) && getVox(fx, fy, fz) === V.AIR && getVox(fx, fy + 1, fz) === V.AIR) return;
    const g = groundHeight(p.x, p.z);
    if (p.y < g && prevY >= g - 1.05) { p.y = g; if (v.y < 0) v.y = 0; landed = true; }
  };
  const steps = Math.max(1, Math.ceil((Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) * dt) / 0.3));
  stepOK = wasGround && !flying;
  for (let i = 0; i < steps; i++) {
    moveAxis('x', (v.x * dt) / steps);
    const prevY = p.y;
    if (moveAxis('y', (v.y * dt) / steps)) landed = true;
    surface(prevY);
    moveAxis('z', (v.z * dt) / steps);
    surface(p.y);
  }
  if (p.y > terrainH(p.x, p.z) - 2) {
    for (const list of [forestColliders, shrineColliders]) {
      for (const c of list) {
        const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), min = c.r + PW;
        if (d < min && d > 1e-4) { p.x = c.x + (dx / d) * min; p.z = c.z + (dz / d) * min; }
      }
    }
  }
  vehiclePush(p); // do zaparkovaného auta se nevejde
  const g = groundHeight(p.x, p.z);
  if (!landed && wasGround && v.y <= 0 && p.y > g && p.y - g < 0.45 && !collidesBlocks({ x: p.x, y: g, z: p.z })) { p.y = g; v.y = 0; landed = true; }
  // Chůze dolů po schodech: hráč zůstane na schodu, místo aby z každého seskočil
  if (!landed && wasGround && !flying && v.y <= 0) {
    const oy = p.y;
    if (moveAxis('y', -STEP_H)) { landed = true; player.stepSmooth += oy - p.y; } else p.y = oy;
  }
  player.onGround = landed;
  if (landed) player.doubleUsed = false;
  if (flying && landed && shift) player.flying = false; // přistání ukončí let
  if (p.y < VMIN - 5) { p.set(shrineOf(p.x).x, 0.45, 14); v.set(0, 0, 0); }

  const moving = Math.hypot(v.x, v.z);
  if (player.onGround) player.bob += dt * moving * 1.8;
  const sign = Math.sign(Math.sin(player.bob));
  // Zvuky pohybu: kroky podle materiálu pod nohama, dopad po pádu, šplouchnutí a plavání ve vodě.
  const wet = waterAt(p.x, p.y + 0.05, p.z) !== null, deep = wet && waterAt(p.x, p.y + 1, p.z) !== null;
  if (wet && !player.wasWet && (fallV < -4 || moving > 3)) Sound.splash(Math.min(1.4, 0.6 + Math.max(-fallV, moving) / 12));
  player.wasWet = wet;
  if (landed && !wasGround && fallV < -5.5 && !flying) Sound.land(materialAt(p.x, p.y, p.z), -fallV);
  else if (sign !== lastStepSign && moving > 1 && (player.onGround || deep)) {
    if (deep) Sound.swim(); else Sound.footstep(materialAt(p.x, p.y, p.z), player.sprinting);
  }
  lastStepSign = sign;
  player.sprinting = sprint && moving > 1;
  const bobY = 0; // houpání kamery při chůzi: player/camera-feel.js
  player.shake = Math.max(0, player.shake - dt);
  const sh = player.shake * 0.4;
  player.stepSmooth *= Math.exp(-dt * 12); // kamera po schodu dojede plynule
  camera.position.set(p.x + (Math.random() - 0.5) * sh, p.y + EYE + bobY + player.stepSmooth + (Math.random() - 0.5) * sh, p.z + (Math.random() - 0.5) * sh);
  camera.rotation.set(player.pitch, player.yaw, 0);
  return moving;
}
