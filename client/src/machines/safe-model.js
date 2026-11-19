// Model bloku Trezor: ocelová skříňka, dvířka s číselníkem a klikou vpředu (+z). Pro buildSpecial (render/blocks.js).
// Jen funkce (nic se nespouští při načtení).
import * as THREE from 'three';

/** Přidá do skupiny g model trezoru. */
export function buildSafeModel(g) {
  const steel = new THREE.MeshStandardMaterial({ color: 0x4a525c, metalness: 0.8, roughness: 0.45 });
  const door = new THREE.MeshStandardMaterial({ color: 0x5e6874, metalness: 0.85, roughness: 0.35 });
  const shiny = new THREE.MeshStandardMaterial({ color: 0xd8dce4, metalness: 1, roughness: 0.25 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), steel);
  body.position.y = 0.45;
  const front = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.72, 0.04), door);
  front.position.set(0, 0.45, 0.46);
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 20), shiny);
  dial.rotation.x = Math.PI / 2;
  dial.position.set(-0.08, 0.5, 0.49);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.05), shiny);
  handle.position.set(0.22, 0.45, 0.5);
  g.add(body, front, dial, handle);
}
