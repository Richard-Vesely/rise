// Model stíhačky (vozidlo 'jet' z obchodu za zlato): štíhlý soustružený trup se špičatým nosem, kapkový kryt kabiny,
// šikmá delta křídla, dva kýly, ocasní plochy a tryska, která svítí podle plynu (nozzles). Rozměry sedí se srážkami
// letadla v plane.js (pilot sedí ve stejném bodě jako v dvouplošníku). Jen funkce; volá ho vehicles/car.js.
import * as THREE from 'three';
import { boxer, glowMat, mergeStatic, tyreGeo, paintMat, vehMats } from './veh-look.js';

const latheZ = (prof, seg = 20) => new THREE.LatheGeometry(prof.map(([r, z]) => new THREE.Vector2(r, z)), seg).rotateX(Math.PI / 2);
/** Plochá deska z půdorysu (x, z) o tloušťce t, ležící ve výšce y. */
function plate(pts, t) {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
  return new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 1 }).rotateX(Math.PI / 2).translate(0, t / 2, 0);
}

export function buildJetModel(color) {
  const g = new THREE.Group(), box = boxer(g), T = vehMats(), paint = paintMat(color, 0.7), dark = paintMat(0x2a2e34, 0.6);
  const body = new THREE.Mesh(latheZ([[0.001, -4.4], [0.12, -4.0], [0.3, -3.2], [0.5, -2.2], [0.62, -1.0], [0.66, 0.4], [0.64, 1.8], [0.58, 3.0], [0.52, 3.6], [0.001, 3.62]], 22), paint);
  body.position.y = 1.35;
  body.scale.set(1, 0.9, 1);
  g.add(body);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), T.glass);
  canopy.scale.set(0.42, 0.5, 1.6);
  canopy.position.set(0, 1.78, 0.2);
  canopy.userData.keep = true;
  g.add(canopy);
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(plate([[0, -1.4], [s * 4, 1.6], [s * 4, 2.4], [0, 2.6]], 0.08), paint);
    wing.position.y = 1.15;
    g.add(wing);
    const tail = new THREE.Mesh(plate([[0, 2.6], [s * 1.8, 3.6], [s * 1.8, 4.0], [0, 3.8]], 0.06), paint);
    tail.position.y = 1.3;
    g.add(tail);
    const fin = new THREE.Mesh(plate([[0, 2.4], [0.1, 2.4], [0.1, 3.7], [0, 3.7]], 1.3), dark); // kýl (svislá deska)
    fin.scale.set(1, 1, 1);
    fin.position.set(s * 0.45, 1.75, 0);
    fin.rotation.z = s * 0.25;
    g.add(fin);
    box(0.08, 0.06, 1.2, glowMat(0xff3a1a, 0.8), s * 3.9, 1.2, 2.0); // červené konce křídel
    box(0.25, 0.25, 2.2, dark, s * 0.75, 1.15, 0.2); // sání vzduchu po stranách
  }
  // tryska: tmavý prstenec a svítící střed (svítí podle plynu, jako trysky dvouplošníku)
  const nozzles = glowMat(0xff7a2a, 0.15);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.42, 0.5, 18, 1, true).rotateX(Math.PI / 2), dark);
  ring.position.set(0, 1.35, 3.85);
  g.add(ring);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.4, 18), nozzles);
  glow.position.set(0, 1.35, 3.95);
  g.add(glow);
  // podvozek: příďové kolo a dvě hlavní
  const wheels = [];
  for (const [x, z] of [[0, -2.6], [-0.9, 0.9], [0.9, 0.9]]) {
    box(0.08, 0.9, 0.08, T.graphite, x, 0.75, z);
    const w = new THREE.Group();
    w.position.set(x, 0.32, z);
    w.add(new THREE.Mesh(tyreGeo(0.32, 0.14), T.rubber));
    g.add(w);
    wheels.push(w);
  }
  const nav = glowMat(0xff2020, 0, 0x220000), navG = glowMat(0x20ff40, 0, 0x002200), navW = glowMat(0xffffff, 0, 0x222222);
  box(0.1, 0.08, 0.16, nav, -4.0, 1.2, 1.7, 0.02);
  box(0.1, 0.08, 0.16, navG, 4.0, 1.2, 1.7, 0.02);
  box(0.08, 0.08, 0.08, navW, 0, 2.95, 3.7);
  mergeStatic(g);
  return { group: g, prop: null, wheels, pivots: [], navs: [nav, navG, navW], nozzles, head: null, tail: null, exhaust: [0, 1.35, 4.2], exhausts: [[0, 1.35, 4.2]] };
}
