// Rybníky a jezera (voda) a rybaření.
import './ground-items.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { randInt } from '../../../shared/util.js';
import { pondLevel, waterAt } from '../../../shared/world/nature.js';
import { LAKE_CELL, POND_CELL, isMark, lakeOf, pondOf, shrineDist, terrainH } from '../../../shared/world/terrain.js';
import { Sound } from '../audio/sound.js';
import { useCost } from '../../../shared/tools.js';
import { wearHeld } from '../player/durability.js';
import { addItem, heldStack } from '../player/inventory.js';
import { player } from '../player/player.js';
import { debris, sparks } from '../render/particles.js';
import { camera, scene } from '../render/renderer.js';
import { decorPond, makeWaterMaterial } from '../render/water.js';
import { toast } from '../ui/hud.js';

const waterMat = makeWaterMaterial(), markWaterMat = makeWaterMaterial(true); // vlnky, odrazy a pěna: render/water.js
const pondMeshes = new Map();
function addWater(p, wanted) {
  if (shrineDist(p.x, p.z) < 90) return;
  wanted.add(p.key);
  if (pondMeshes.has(p.key)) return;
  const m = new THREE.Mesh(new THREE.CircleGeometry(p.r, p.lake ? 128 : 48).rotateX(-Math.PI / 2), waterMat);
  m.position.set(p.x, pondLevel(p), p.z);
  if (isMark(p.x)) m.material = markWaterMat;
  decorPond(m, p, pondLevel(p), isMark(p.x)); // rákosí a kameny u břehu, mokrý břeh v terénu
  scene.add(m);
  pondMeshes.set(p.key, m);
}
export function refreshPonds(px, pz) {
  const R = 260, wanted = new Set();
  for (let cz = Math.floor((pz - R) / POND_CELL); cz <= Math.floor((pz + R) / POND_CELL); cz++)
    for (let cx = Math.floor((px - R) / POND_CELL); cx <= Math.floor((px + R) / POND_CELL); cx++) {
      const p = pondOf((cx + 0.5) * POND_CELL, (cz + 0.5) * POND_CELL);
      if (p && !p.lake) addWater(p, wanted);
    }
  // jezera: větší mřížka, hladina se ukáže už z dálky
  for (let cz = Math.floor((pz - R - 180) / LAKE_CELL); cz <= Math.floor((pz + R + 180) / LAKE_CELL); cz++)
    for (let cx = Math.floor((px - R - 180) / LAKE_CELL); cx <= Math.floor((px + R + 180) / LAKE_CELL); cx++) {
      const L = lakeOf((cx + 0.5) * LAKE_CELL, (cz + 0.5) * LAKE_CELL);
      if (L && Math.hypot(L.x - px, L.z - pz) < R + L.r) addWater(L, wanted);
    }
  for (const [k, m] of pondMeshes) if (!wanted.has(k)) { scene.remove(m); pondMeshes.delete(k); }
}

// Prut: pravé tlačítko nahodí splávek do vody; když zabere (splávek se ponoří), znovu pravé tlačítko = úlovek.
export const fishing = { active: false, pos: new THREE.Vector3(), t: 0, bite: 0, biting: false };
const bobber = new THREE.Group();
{
  const red = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe03020 }));
  const white = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf4f4f4 }));
  bobber.add(red, white);
}
const fishLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xdddddd }));
bobber.visible = fishLine.visible = false;
fishLine.frustumCulled = false;
scene.add(bobber, fishLine);
export function useRod() {
  if (fishing.active) {
    if (fishing.biting) {
      const r = Math.random(), id = r < 0.45 ? 'raw_trout' : r < 0.8 ? 'raw_salmon' : 'seaweed';
      addItem(id, id === 'seaweed' ? randInt(1, 3) : 1);
      sparks.emit(fishing.pos.x, fishing.pos.y + 0.2, fishing.pos.z, [0.6, 0.85, 1], 25, 2.5, 2);
      Sound.pickup();
      wearHeld(useCost('fishing_rod', 'use')); // prut se úlovkem opotřebuje
    } else Sound.rustle();
    fishing.active = bobber.visible = fishLine.visible = false;
    return;
  }
  // najdi hladinu ve směru pohledu (do 18 m)
  const o = camera.position, d = new THREE.Vector3();
  camera.getWorldDirection(d);
  for (let t = 1; t < 18; t += 0.2) {
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    if (y < terrainH(x, z) - 0.05) break;
    const lv = waterAt(x, y, z);
    if (lv !== null) {
      Object.assign(fishing, { active: true, t: 0, bite: 3 + Math.random() * 6, biting: false });
      fishing.pos.set(x, lv, z);
      bobber.visible = fishLine.visible = true;
      Sound.swing();
      return;
    }
  }
  toast('Nahoď prut do vody (rybník nebo jezero)');
}
export function updateFishing(dt) {
  if (!fishing.active) return;
  if (heldStack()?.id !== 'fishing_rod' || player.pos.distanceTo(fishing.pos) > 22) { fishing.active = bobber.visible = fishLine.visible = false; return; }
  fishing.t += dt;
  if (!fishing.biting && fishing.t > fishing.bite) {
    fishing.biting = true;
    fishing.biteT = 1.6;
    debris.emit(fishing.pos.x, fishing.pos.y + 0.05, fishing.pos.z, [0.7, 0.85, 1], 18, 1.5, 2);
    Sound.burst({ dur: 0.25, f0: 1200, f1: 300, q: 0.8, vol: 0.3, type: 'lowpass' });
    toast('Zabírá! Rychle pravé tlačítko!');
  }
  if (fishing.biting && (fishing.biteT -= dt) <= 0) { fishing.biting = false; fishing.t = 0; fishing.bite = 3 + Math.random() * 6; } // ryba utekla
  const dip = fishing.biting ? -0.08 + Math.sin(fishing.t * 25) * 0.03 : Math.sin(fishing.t * 2) * 0.015;
  bobber.position.set(fishing.pos.x, fishing.pos.y + dip, fishing.pos.z);
  const tip = new THREE.Vector3(0.45, 0.25, -1.4).applyQuaternion(camera.quaternion).add(camera.position);
  fishLine.geometry.setFromPoints([tip, bobber.position]);
}
