// Předměty v ruce ve stylu Hytale (grafický update): tmavý obrys kolem modelů, rybářský prut a motyka jako 3D modely,
// ostatní předměty jako tlusté kostičky z ikony s tmavým obrysem. Používá render/held-item.js (i pro ostatní hráče).
// Bez vedlejších účinků při načtení (jen funkce a sdílené materiály).
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ICONS } from './icons.js';

// ---------- obrys: „nafouknutý“ obal z rubu (inverted hull), tloušťka v metrech modelu
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x15100d, side: THREE.BackSide });
outlineMat.userData.shared = true;
const hulls = new WeakMap();
function hullGeo(geo, t) {
  let h = hulls.get(geo);
  if (h) return h;
  let g = geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  g = mergeVertices(g, 1e-4); // společné vrcholy na hranách: obal se na rozích netrhá
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * t, p.getY(i) + n.getY(i) * t, p.getZ(i) + n.getZ(i) * t);
  hulls.set(geo, g);
  return g;
}
/** Přidá ke každému dílu modelu tmavý obrys (kromě svítících dílů, čar a sprajtů). */
export function addOutline(root, t = 0.0075) {
  const list = [];
  const glows = (m) => !!m && (m.blending === THREE.AdditiveBlending || (m.emissive && m.emissive.getHex() !== 0 && m.emissiveIntensity > 0.5));
  root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && !o.userData.noOutline && !glows(o.material)) list.push(o); });
  for (const m of list) {
    const h = new THREE.Mesh(hullGeo(m.geometry, t), outlineMat);
    h.position.copy(m.position); h.quaternion.copy(m.quaternion); h.scale.copy(m.scale);
    h.userData.noOutline = true;
    m.parent.add(h);
  }
  return root;
}

// ---------- rybářský prut: korková rukojeť, naviják, tenčící se prut s očky a vlasec navinutý na cívce
const cork = new THREE.MeshStandardMaterial({ color: 0xc89a62, roughness: 0.95 });
const rodMat = new THREE.MeshStandardMaterial({ color: 0x4a2c1a, roughness: 0.55 });
const metal = new THREE.MeshStandardMaterial({ color: 0xb8bec8, roughness: 0.3, metalness: 1 });
const reelMat = new THREE.MeshStandardMaterial({ color: 0x2f6a9a, roughness: 0.4, metalness: 0.4 });
const lineMat = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.6 });
const leather = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.9 });
for (const m of [cork, rodMat, metal, reelMat, lineMat, leather]) m.userData.shared = true;
export function rodModel(mesh) {
  mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.2, 10), cork, 0, -0.08); // rukojeť
  mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.03, 10), leather, 0, 0.035);
  mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.5, 8), rodMat, 0, 0.3); // spodní díl
  mesh(new THREE.CylinderGeometry(0.008, 0.016, 0.42, 8), rodMat, 0, 0.76); // špička
  for (const y of [0.3, 0.55, 0.8]) mesh(new THREE.TorusGeometry(0.018, 0.004, 6, 12), metal, 0.024, y).rotation.y = Math.PI / 2; // očka
  const reel = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 16), reelMat, 0.06, 0.02); // naviják
  reel.rotation.z = Math.PI / 2;
  const spool = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.042, 16), lineMat, 0.06, 0.02);
  spool.rotation.z = Math.PI / 2;
  mesh(new THREE.BoxGeometry(0.012, 0.04, 0.012), metal, 0.1, 0.05); // klička
  mesh(new THREE.SphereGeometry(0.014, 8, 6), leather, 0.1, 0.075);
}

// ---------- štít: prkna s železným lemem a puklicí, líc míří dopředu (−Z)
const plankMat = new THREE.MeshStandardMaterial({ color: 0x9a6a38, roughness: 0.85 });
const plankDark = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9 });
for (const m of [plankMat, plankDark]) m.userData.shared = true;
export function shieldModel(mesh) {
  mesh(new THREE.BoxGeometry(0.44, 0.54, 0.045), plankMat, 0, 0.16);
  for (const x of [-0.11, 0, 0.11]) mesh(new THREE.BoxGeometry(0.012, 0.52, 0.048), plankDark, x, 0.16); // spáry mezi prkny
  for (const [w, h, x, y] of [[0.47, 0.035, 0, 0.43], [0.47, 0.035, 0, -0.11], [0.035, 0.57, -0.22, 0.16], [0.035, 0.57, 0.22, 0.16]]) mesh(new THREE.BoxGeometry(w, h, 0.055), metal, x, y); // lem
  const boss = mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.04, 14), metal, 0, 0.18, -0.04); // puklice
  boss.rotation.x = Math.PI / 2;
}

// ---------- motyka: násada s omotávkou a široký kovový list do strany
const ironMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.35, metalness: 0.9 });
ironMat.userData.shared = true;
export function hoeModel(mesh, handleMat, gripMat) {
  mesh(new THREE.CylinderGeometry(0.019, 0.023, 0.66, 10), handleMat, 0, 0.12);
  mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.16, 10), gripMat, 0, -0.1);
  mesh(new THREE.BoxGeometry(0.07, 0.07, 0.06), ironMat, 0, 0.43); // objímka
  mesh(new THREE.BoxGeometry(0.12, 0.03, 0.03), ironMat, -0.08, 0.43); // rameno
  const blade = mesh(new THREE.BoxGeometry(0.12, 0.13, 0.012), ironMat, -0.15, 0.36); // plochý list míří dolů (motyka, ne kladivo)
  blade.rotation.z = 0.25;
}

// ---------- ostatní předměty: tlusté kostičky z ikony 16×16 s tmavým obrysem okolo (jako v Hytale)
const voxCache = {};
/**
 * @param {string} id
 * @param {number} px velikost kostičky
 */
export function chunkyVoxels(id, px = 0.017) {
  let data = voxCache[id];
  if (!data) {
    let src = ICONS[id].canvas;
    if (src.width !== 16) { const c = document.createElement('canvas'); c.width = c.height = 16; c.getContext('2d').drawImage(src, 0, 0, 16, 16); src = c; }
    const d = src.getContext('2d').getImageData(0, 0, 16, 16).data, on = (x, y) => x >= 0 && y >= 0 && x < 16 && y < 16 && d[(y * 16 + x) * 4 + 3] > 128;
    data = voxCache[id] = [];
    for (let y = -1; y <= 16; y++) for (let x = -1; x <= 16; x++) {
      if (on(x, y)) { const i = (y * 16 + x) * 4; data.push([x, y, new THREE.Color(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255).convertSRGBToLinear(), false]); }
      else if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) data.push([x, y, new THREE.Color(0x15100d), true]); // obrys
    }
  }
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(px, px, px * 2.6), new THREE.MeshStandardMaterial({ roughness: 0.7 }), data.length);
  const o = new THREE.Object3D();
  data.forEach(([x, y, c, edge], i) => {
    o.position.set((x - 7.5) * px, (7.5 - y) * px, 0);
    o.scale.set(1, 1, edge ? 0.8 : 1);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
    mesh.setColorAt(i, c);
  });
  return mesh;
}
