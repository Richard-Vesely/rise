// Modely luku a šípu (luk v ruce: render/held-item.js, letící šípy: player/bow.js). Bez vedlejších účinků při načtení.
import * as THREE from 'three';

const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a5a2e, roughness: 0.75 });
const gripMat = new THREE.MeshStandardMaterial({ color: 0x3a2614, roughness: 0.9 });
const shaftMat = new THREE.MeshStandardMaterial({ color: 0x9a7448, roughness: 0.8 });
const tipMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd4, metalness: 0.8, roughness: 0.35 });
const featherMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.9, side: THREE.DoubleSide });
const stringMat = new THREE.LineBasicMaterial({ color: 0xe8e2d0 });

/** Šíp podél osy +Z (hrot vpředu), délka 0,62 m, střed v počátku. */
export function arrowMesh() {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.56, 6), shaftMat);
  shaft.rotation.x = Math.PI / 2;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.07, 6), tipMat);
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 0.31;
  g.add(shaft, tip);
  for (let i = 0; i < 3; i++) { // tři letky na konci
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.045, 0.11), featherMat);
    f.position.set(Math.cos(i * 2.1) * 0.022, Math.sin(i * 2.1) * 0.022, -0.23);
    f.rotation.set(Math.PI / 2, 0, i * 2.1);
    g.add(f);
  }
  return g;
}

/**
 * Luk svisle, tětiva k hráči (+Z), držadlo v počátku. userData.pull(k) natáhne tětivu (0–1) a ukáže založený šíp.
 * @returns {THREE.Group}
 */
export function bowModel() {
  const g = new THREE.Group(), R = 0.42, ARC = 2.0;
  const b = new THREE.Group(); // v rovině XY oblouk vyboulený k +X, potom otočený tak, aby +X mířilo dopředu (−Z)
  const limb = new THREE.Mesh(new THREE.TorusGeometry(R, 0.018, 6, 28, ARC), woodMat);
  limb.rotation.z = -ARC / 2;
  limb.position.x = -R;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.13, 8), gripMat);
  const ex = R * Math.cos(ARC / 2) - R, ey = R * Math.sin(ARC / 2);
  const pts = new Float32Array([ex, ey, 0, ex, 0, 0, ex, -ey, 0]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  const string = new THREE.Line(geo, stringMat);
  const arrow = arrowMesh();
  arrow.rotation.y = Math.PI / 2; // šíp podél +X (dopředu)
  arrow.visible = false;
  b.add(limb, grip, string, arrow);
  b.rotation.y = Math.PI / 2;
  g.add(b);
  g.userData.pull = (k) => {
    const x = ex - 0.24 * k;
    pts[3] = x;
    geo.attributes.position.needsUpdate = true;
    arrow.visible = k > 0.02;
    arrow.position.x = x + 0.3;
  };
  return g;
}
