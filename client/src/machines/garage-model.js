// Model bloku Garáž: grafitová dílenská skříň s červenými šuplíky, bílá deska s nářadím, sloup s tyrkysovým
// prstencem (vzhled jako ostatní stroje, machines/machine-models.js). Přední strana je +z. Jen funkce (nic se nespouští při načtení).
import * as THREE from 'three';
import { TECH, addStatus, addStrip, builder, glowMat, mergeStatic, techMats } from './machine-models.js';

export function buildGarageModel(g) {
  const T = techMats(), { box, cyl } = builder(g);
  const red = new THREE.MeshStandardMaterial({ color: 0xc8322a, metalness: 0.3, roughness: 0.4 });
  box(0.94, 0.06, 0.8, T.dark, 0, 0.03, 0);
  box(0.9, 0.62, 0.72, T.housing, 0, 0.37, 0, 0.03);
  for (let i = 0; i < 3; i++) { box(0.78, 0.15, 0.02, red, 0, 0.18 + i * 0.18, 0.37, 0.01); box(0.22, 0.025, 0.03, T.chrome, 0, 0.21 + i * 0.18, 0.385); } // šuplíky s úchyty
  box(0.96, 0.05, 0.78, T.trim, 0, 0.71, 0, 0.015); // pracovní deska
  // nářadí na desce: klíč a šroubovák
  box(0.32, 0.02, 0.05, T.chrome, -0.18, 0.745, 0.12).rotation.y = 0.4;
  box(0.22, 0.03, 0.03, red, 0.2, 0.75, 0.15).rotation.y = -0.3;
  // sloup se svítícím prstencem: tady se ladí vozidla
  cyl(0.035, 0.035, 0.9, T.chrome, 0.36, 1.18, -0.26, 10);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.018, 8, 28), glowMat(TECH.cyan, 1.4));
  ring.position.set(0.36, 1.5, -0.26);
  ring.rotation.x = Math.PI / 2;
  ring.userData.keep = true;
  g.add(ring);
  addStrip(g, 0.8, 0.02, 0.012, 0, 0.66, 0.375);
  for (const m of g.userData.strips) m.emissiveIntensity = 1.2;
  const st = addStatus(g, -0.38, 0.66, 0.38);
  st.emissive.setHex(TECH.green); st.emissiveIntensity = 2;
  mergeStatic(g);
}
