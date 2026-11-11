// Markova dimenze: barvy oblohy a mlhy, polární záře; polární záře i v tundře v noci.
import '../world/structures.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { biomeWeights, isMark } from '../../../shared/world/terrain.js';
import { isDragon } from '../../../shared/world/dragon-land.js';
import { player } from '../player/player.js';
import { LK } from './look.js';
import { post } from './post.js';
import { FOG, U } from './renderer.js';
import { hemi, skyU, sunLight } from './sky.js';

// Markova dimenze: tmavší fialová obloha, modravé světlo, fialovo-purpurová mlha, velká polární záře (azurová a purpurová).
// Stejný řetězec kreslení jako jinde, jen jiné parametry (nic navíc nestojí).
const MARK_FOG = new THREE.Color(0x4a2a86);
const DRAGON_FOG = new THREE.Color(0x9b6547);
const dragonTint = new THREE.Vector3(1.2, 0.82, 0.6);
const markTint = new THREE.Vector3(0.9, 0.85, 1.15), markAmb = new THREE.Vector3(0.8, 0.75, 1.3);
let aurora = 0;
export function applyDimension(dt = 0.016) {
  const mk = isMark(player.pos.x);
  skyU.uDragon.value = isDragon(player.pos.x) ? 1 : 0;
  skyU.rayleigh.value = mk ? 3.4 : LK.sky.rayleigh;
  skyU.mieDirectionalG.value = mk ? 0.9 : 0.82;
  skyU.uSkyTime.value = U.time.value;
  // polární záře: v Markově dimenzi pořád (ve dne slabě), v tundře jen v noci
  const tundra = mk ? 0 : biomeWeights(player.pos.x, player.pos.z)[4];
  const want = mk ? 0.35 + 0.65 * U.night.value : tundra * U.night.value * 0.8;
  aurora += (want - aurora) * Math.min(1, dt * 0.5);
  skyU.uAurora.value = aurora;
  skyU.uAuroraMark.value = mk ? 1 : 0;
  post.mark = mk ? 1 : 0;
  if (isDragon(player.pos.x)) {
    skyU.rayleigh.value = 1.2;
    skyU.skyGain.value *= 0.8;
    FOG.color.lerp(DRAGON_FOG, 0.8);
    U.sunColor.value.multiply(dragonTint);
    const sc = U.sunColor.value;
    sunLight.color.setRGB(sc.x, sc.y, sc.z);
  }
  if (!mk) return;
  skyU.skyGain.value *= 0.7;
  U.sunColor.value.multiply(markTint);
  U.ambient.value.multiply(markAmb);
  const sc = U.sunColor.value, am = U.ambient.value;
  sunLight.color.setRGB(sc.x, sc.y, sc.z);
  hemi.color.setRGB(am.x, am.y, am.z);
  FOG.color.lerp(MARK_FOG, 0.65);
}
