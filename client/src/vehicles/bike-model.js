// Model jízdního kola „Jasná budoucnost“: silný rám v barvě kola s vrchním lakem a tyrkysovým proužkem na spodní
// trubce, grafitové komponenty, aero ráfky se třemi paprsky a svítícím prstencem, LED světlo vpředu a pod sedlem.
// Terénní pneumatiky z garáže jsou širší a mají hrubý vzorek. Přední vidlice s řídítky se natáčí, kliky se točí.
// Jen funkce (nic se nespouští při načtení); volá ho vehicles/bike.js. Dopředu je -z, počátek na zemi mezi koly.
import * as THREE from 'three';
import { boxer, headMat, hubRingGeo, mergeGeos, mergeStatic, modsOf, paintMat, rimGeo, tailMat, tube, tyreGeo, vehMats } from './veh-look.js';

// kolo (osa x): pneumatika, ráfek se třemi paprsky, svítící prstence na obou bocích
function wheel(R, T, offroad) {
  const spin = new THREE.Group();
  spin.add(new THREE.Mesh(tyreGeo(R, 0.05, offroad, 0.14), T.rubber));
  spin.add(new THREE.Mesh(rimGeo(R - 0.045, 0.045, 3, 0), T.graphite));
  spin.add(new THREE.Mesh(mergeGeos([hubRingGeo(R - 0.075, 0.006).translate(0.02, 0, 0), hubRingGeo(R - 0.075, 0.006).translate(-0.02, 0, 0)]), T.glow));
  return spin;
}
export function bikeModel(color, v, R) {
  const g = new THREE.Group(), box = boxer(g), T = vehMats(), paint = paintMat(color, 0.5), mods = modsOf(v);
  const C = [0, 0.32, 0], S = [0, 0.86, 0.17], H = [0, 0.92, -0.4], Hb = [0, 0.7, -0.45], RH = [0, R, 0.54];
  // rám: silná spodní trubka (se svítícím proužkem), horní a sedlová trubka, zdvojené zadní stavby
  g.add(tube(C, Hb, 0.036, paint, 10), tube(S, H, 0.026, paint, 10), tube(C, S, 0.028, paint, 10), tube(Hb, H, 0.034, T.graphite, 10));
  g.add(tube([0, 0.355, -0.02], [0, 0.735, -0.43], 0.012, T.glow, 6));
  for (const x of [-0.05, 0.05]) g.add(tube([x, C[1], C[2]], [x, R, 0.54], 0.015, paint), tube([x, 0.84, 0.17], [x, R, 0.54], 0.013, paint));
  g.add(tube([0, 0.86, 0.17], [0, 0.98, 0.21], 0.016, T.graphite)); // sedlovka
  box(0.13, 0.05, 0.26, T.seat, 0, 1.0, 0.2, 0.02); // sedlo
  box(0.06, 0.03, 0.12, T.seat, 0, 0.995, 0.06, 0.012); // špička sedla
  const tail = tailMat();
  box(0.07, 0.025, 0.015, tail, 0, 0.94, 0.33, 0.006); // zadní LED pod sedlem
  g.add(tube([0.05, C[1], C[2]], [0.05, R, 0.54], 0.006, T.graphite)); // řetěz
  const rear = wheel(R, T, mods.offroad);
  rear.position.set(0, R, 0.54);
  g.add(rear);
  // přední vidlice s řídítky se natáčí kolem hlavové trubky
  const pivot = new THREE.Group();
  pivot.position.set(0, 0, -0.5);
  g.add(pivot);
  const front = wheel(R, T, mods.offroad);
  front.position.set(0, R, -0.04);
  pivot.add(front);
  for (const x of [-0.045, 0.045]) pivot.add(tube([x, R, -0.04], [x, 0.72, 0.06], 0.015, paint));
  pivot.add(tube([0, 0.72, 0.06], [0, 1.0, 0.1], 0.018, T.graphite));
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.58, 8).rotateZ(Math.PI / 2), T.graphite);
  bar.position.set(0, 1.0, 0.12);
  pivot.add(bar);
  for (const x of [-0.27, 0.27]) { const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.1, 8).rotateZ(Math.PI / 2), T.rubber); grip.position.set(x, 1.0, 0.12); pivot.add(grip); }
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), T.chrome);
  bell.position.set(-0.17, 1.02, 0.12);
  pivot.add(bell);
  const head = headMat();
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.035, 0.03), head); // LED světlo na hlavové trubce
  lamp.position.set(0, 0.86, 0.0);
  pivot.add(lamp);
  mergeStatic(pivot);
  // kliky se šlapkami a převodník (otáčí se při šlapání)
  const crank = new THREE.Group();
  crank.position.set(0, C[1], C[2]);
  g.add(crank);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 6, 20).rotateY(Math.PI / 2).translate(0.045, 0, 0), T.chrome);
  crank.add(ring);
  const arms = [], pedals = [];
  for (const s of [-1, 1]) {
    arms.push(new THREE.BoxGeometry(0.02, 0.17, 0.03).translate(s * 0.07, s * 0.075, 0));
    pedals.push(new THREE.BoxGeometry(0.1, 0.02, 0.06).translate(s * 0.12, s * 0.15, 0));
  }
  crank.add(new THREE.Mesh(mergeGeos(arms), T.graphite), new THREE.Mesh(mergeGeos(pedals), T.rubber));
  mergeStatic(g);
  const m = { group: g, wheels: [rear, front], pivots: [pivot], head, tail, crank, drl: 0.5 };
  m.update = (src, dt) => { if (src.pd || (src.spd || 0) < 0) crank.rotation.x -= ((src.spd || 0) / R) * dt * 0.45; }; // šlape jen při šlapání
  return m;
}
