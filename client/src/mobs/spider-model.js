// Obří pavouk z vězení (shared/world/prison.js): černé chlupaté tělo s rudou kresbou, osm dlouhých nohou s kolenem
// nad tělem, osm svítících rudých očí a kusadla. Animace nohou je v mobs.js (kind 'spider'). Jen vzhled, bez vedlejších účinků.
import * as THREE from 'three';
import { blobShadow, rbox, skinRig } from '../render/character.js';

const UP = new THREE.Vector3(0, 1, 0);

export function buildSpiderModel(g, K) {
  const { mat, box, pivot, eye } = K;
  const fur = mat({ color: 0x2a2224 }, 'fur'), dark = mat({ color: 0x141012, roughness: 0.5 }, 'hide');
  const red = mat({ color: 0xb01828, roughness: 0.6 }), fang = mat({ color: 0xe8dcc4, roughness: 0.35 });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a2a).multiplyScalar(2.6), fog: false });
  glow.userData.glow = true;
  // článek nohy mezi dvěma body (souřadnice uvnitř rodiče)
  const seg = (parent, a, b, w, m) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
    const me = new THREE.Mesh(rbox(w, d.length(), w, w * 0.35), m);
    me.position.copy(A).add(B).multiplyScalar(0.5);
    me.quaternion.setFromUnitVectors(UP, d.normalize());
    me.castShadow = true;
    parent.add(me);
  };
  const body = pivot(g, 0, 0.95, 0);
  box(body, 1.35, 1.0, 1.5, fur, 0, 0.2, 0.75, 0.4); // zadeček
  box(body, 0.5, 0.06, 0.7, red, 0, 0.71, 0.75, 0.03); // rudá kresba na hřbetě
  box(body, 0.9, 0.55, 0.85, fur, 0, 0, -0.35, 0.2); // hlavohruď
  const head = pivot(body, 0, 0.05, -0.75);
  box(head, 0.62, 0.42, 0.42, dark, 0, 0, -0.1, 0.14);
  for (const [x, y, s] of [[0.11, 0.1, 0.09], [0.26, 0.06, 0.07], [0.15, -0.04, 0.06], [0.28, -0.06, 0.05]])
    for (const sx of [-1, 1]) eye(head, sx * x, y, -0.32, s, glow);
  for (const sx of [-1, 1]) { const f = box(head, 0.08, 0.3, 0.08, fang, sx * 0.12, -0.27, -0.27, 0.03); f.rotation.x = 0.35; }
  const legs = [];
  const zs = [-0.62, -0.42, -0.22, -0.02], feet = [-1.35, -0.55, 0.25, 1.05];
  for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) {
    const p = pivot(g, sx * 0.4, 0.95, zs[i] - 0.3);
    const knee = [sx * 1.0, 0.75, (feet[i] - zs[i]) * 0.35], foot = [sx * 1.75, -0.95, feet[i] - zs[i] + 0.3];
    seg(p, [0, 0, 0], knee, 0.16, fur);
    seg(p, knee, foot, 0.11, dark);
    legs.push(p);
  }
  skinRig(g);
  return { group: g, body, bodyY: body.position.y, head, headRest: 0, legs, wings: [], tail: null,
    ears: [], eyes: K.eyes, arms: [], flash: K.flash, kind: 'spider', shadow: blobShadow(1.5), big: true };
}
