// Druhá ruka v první osobě (levá): předmět z inv.off (player/offhand.js) s rukavicí obleku vlevo dole,
// štít se při krytí zvedne před tělo. Volá ho render/held-item.js každý snímek. Bez vedlejších účinků při načtení
// (skupina se ke kameře přidá až při prvním volání).
import * as THREE from 'three';
import { ITEMS } from '../../../shared/data/index.js';
import { NET } from '../../../shared/net/net.js';
import { lerp, smoothstep } from '../../../shared/util.js';
import { loadCostume } from '../menu/costume.js';
import { inv } from '../player/inventory.js';
import { player } from '../player/player.js';
import { buildFPArm, disposeCharacter } from './character.js';
import { ICONS } from './icons.js';
import { camera } from './renderer.js';

const offHolder = new THREE.Group();
const models = {};
let offId, grip = null, guardK = 0, started = false;
// předloktí míří dolů doleva ke kameře (zrcadlo pravé ruky v held-item.js)
const ARM_HOLD_L = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-0.3, -0.72, 0.62).normalize());
function buildGrip() {
  if (grip) { grip.parent?.remove(grip); disposeCharacter(grip); }
  grip = buildFPArm(loadCostume(NET.name));
  grip.scale.set(-0.72, 0.72, 0.72); // zrcadlově: levá ruka
  grip.quaternion.copy(ARM_HOLD_L);
  grip.position.set(0, -0.035, 0.015);
}

/**
 * Každý snímek z updateSwing (render/held-item.js).
 * @param {number} dt
 * @param {number} sway houpání při chůzi (0–1,5)
 * @param {number} d fáze kroku
 * @param {boolean} shown je vidět pravá ruka (ne ve vozidle, ne ze třetí osoby)
 * @param {(id: string) => THREE.Group} build model předmětu (buildHeld)
 */
export function updateOffhand(dt, sway, d, shown, build) {
  if (!started) { started = true; camera.add(offHolder); addEventListener('rise-costume', () => { offId = undefined; grip = null; }); }
  const s = inv.off[0], id = s ? s.id : null;
  if (id !== offId) {
    offId = id;
    offHolder.clear();
    if (id && ITEMS[id] && ICONS[id]) {
      if (!grip) buildGrip();
      offHolder.add(models[id] ||= build(id), grip);
    }
  }
  offHolder.visible = !!id && shown && !player.eating;
  // klid vlevo dole, při krytí štítem v druhé ruce před tělem (štít v hlavní ruce zvedá held-item.js)
  guardK = lerp(guardK, player.blocking === 'off' ? 1 : 0, 1 - Math.exp(-dt * 14));
  const k = smoothstep(0, 1, guardK);
  offHolder.position.set(lerp(-0.34, -0.22, k) - Math.sin(d) * 0.018 * sway, lerp(-0.38, -0.27, k) - Math.abs(Math.cos(d)) * 0.022 * sway, lerp(-0.62, -0.46, k));
  offHolder.rotation.set(lerp(-0.3, 0.05, k), lerp(-0.15, 0.5, k), lerp(0.4, 0.05, k));
}
