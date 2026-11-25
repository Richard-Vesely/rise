// Model štítu (v ruce: render/held-item.js, druhá ruka: render/offhand-view.js, postavičky: net/avatars.js).
// Prkna s železným lemem a puklicí, líc míří dopředu (−Z). Bez vedlejších účinků při načtení.
import * as THREE from 'three';

const plankMat = new THREE.MeshStandardMaterial({ color: 0x9a6a38, roughness: 0.85 });
const plankDark = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9 });
const metal = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.35, metalness: 0.9 });
for (const m of [plankMat, plankDark, metal]) m.userData.shared = true; // postavičky je při odchodu hráče neuvolňují

/** Přidá díly štítu přes mesh(geo, mat, x, y, z) z buildHeld (render/held-item.js). */
export function shieldModel(mesh) {
  mesh(new THREE.BoxGeometry(0.44, 0.54, 0.045), plankMat, 0, 0.16);
  for (const x of [-0.11, 0, 0.11]) mesh(new THREE.BoxGeometry(0.012, 0.52, 0.048), plankDark, x, 0.16); // spáry mezi prkny
  for (const [w, h, x, y] of [[0.47, 0.035, 0, 0.43], [0.47, 0.035, 0, -0.11], [0.035, 0.57, -0.22, 0.16], [0.035, 0.57, 0.22, 0.16]]) mesh(new THREE.BoxGeometry(w, h, 0.055), metal, x, y); // lem
  const boss = mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.04, 14), metal, 0, 0.18, -0.04); // puklice
  boss.rotation.x = Math.PI / 2;
}
