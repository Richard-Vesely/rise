// Velký čtyřnohý drak: šupiny, blanitá křídla, rohy, čelisti a dlouhý ocas.
import * as THREE from 'three';
import { blobShadow, skinRig } from '../render/character.js';

export function buildDragonModel(g, K) {
  const { mat, box, pivot, eye, leg } = K;
  const scales = mat({ color: 0x692e26, roughness: 0.65, metalness: 0.15 }, 'skin');
  const belly = mat({ color: 0xcb9956, roughness: 0.8 });
  const horn = mat({ color: 0xd6c5a2 });
  const membrane = mat({ color: 0x9b422a, side: THREE.DoubleSide, roughness: 0.85 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffad36 }); glow.userData.glow = true;
  const body = pivot(g, 0, 2.15, 0), legs = [], wings = [];
  box(body, 2.5, 1.7, 3.8, scales, 0, 0, 0, 0.3);
  box(body, 1.8, 0.5, 3.1, belly, 0, -0.72, -0.1, 0.15);
  const cone = (parent, x, y, z, r, h, tilt = 0) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), horn);
    m.position.set(x, y, z); m.rotation.x = tilt; m.castShadow = true; parent.add(m); return m;
  };
  for (let z = -1.4; z < 1.9; z += 0.65) cone(body, 0, 1.05, z, 0.23, 0.7, 0.35);
  for (const sx of [-1, 1]) for (const z of [-1.25, 1.25]) {
    const l = leg(g, legs, scales, sx * 1.15, 1.45, z, 1.35, 0.63);
    box(l, 0.8, 0.34, 1.05, scales, 0, -1.25, -0.2, 0.12);
    for (const dx of [-0.24, 0, 0.24]) cone(l, dx, -1.22, -0.78, 0.1, 0.42, -Math.PI / 2);
  }
  box(body, 1.25, 1.5, 1.2, scales, 0, 0.5, -1.8, 0.2);
  const head = pivot(g, 0, 2.95, -2.1);
  box(head, 1.65, 1.0, 1.6, scales, 0, 0, -0.35, 0.18);
  box(head, 1.25, 0.48, 1.3, scales, 0, -0.15, -1.3, 0.12);
  const jaw = pivot(head, 0, -0.4, -0.4);
  box(jaw, 1.2, 0.24, 1.55, belly, 0, 0, -0.7, 0.06);
  for (const sx of [-1, 1]) {
    cone(head, sx * 0.6, 0.95, 0.1, 0.24, 1.35, 0.5);
    eye(head, sx * 0.73, 0.12, -0.95, 0.23, glow, sx);
    box(head, 0.48, 0.22, 0.7, scales, sx * 0.65, 0.38, -0.85, 0.05);
    for (const z of [-1.1, -1.55]) cone(head, sx * 0.51, -0.46, z, 0.11, 0.32, Math.PI);
  }
  for (const sx of [-1, 1]) {
    const w = pivot(body, sx * 1.1, 0.65, 0);
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.8); shape.lineTo(3.6, -1.5); shape.lineTo(3, 0);
    shape.lineTo(2.1, 1.4); shape.lineTo(1.1, 0.8); shape.lineTo(0, 1.6);
    const wing = new THREE.Mesh(new THREE.ShapeGeometry(shape), membrane);
    wing.rotation.x = Math.PI / 2 - 0.5; wing.scale.x = sx; wing.castShadow = true; w.add(wing);
    const spar = box(w, 3.8, 0.18, 0.2, scales, sx * 1.7, 0, -1.1, 0.06);
    spar.rotation.y = sx * 0.19;
    wings.push(w);
  }
  const tail = pivot(body, 0, -0.2, 1.8);
  for (let i = 0; i < 4; i++) {
    box(tail, 0.95 - i * 0.2, 0.8 - i * 0.16, 1.05, scales, 0, -i * 0.12, 0.45 + i * 0.85, 0.12 - i * 0.02);
    cone(tail, 0, 0.4 - i * 0.15, 0.5 + i * 0.85, 0.18 - i * 0.025, 0.6 - i * 0.08, 0.4);
  }
  skinRig(g);
  return { group: g, body, bodyY: body.position.y, head, headRest: 0, jaw, legs, wings, tail,
    ears: [], eyes: K.eyes, arms: [], flash: K.flash, kind: 'dragon', shadow: blobShadow(2.7), big: true };
}
