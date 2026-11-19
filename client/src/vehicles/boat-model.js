// Modely lodí „Jasná budoucnost“: trup s V-dnem (ostrá hrana, příď se zvedá), boky v barvě lodi, světlá paluba.
// Motorový člun: zahnutý štít z tónovaného skla, pult s displejem, elektrický závěsný motor v bílém krytu se svítícím
// prstencem, LED světla a tyrkysový proužek na bocích; turbo a nitro z garáže jsou na motoru vidět.
// Plachetnice: uhlíkový stěžeň a ráhno, plachty se znakem kroužku a tyrkysovým pruhem, kýl s olověnou hruškou, vanty.
// Jen funkce (nic se nespouští při načtení); volá je vehicles/boat.js. Dopředu je -z, počátek na hladině.
import * as THREE from 'three';
import { boxer, glowMat, headMat, mergeGeos, mergeStatic, modsOf, paintMat, tailMat, tube, vehMats, TECH } from './veh-look.js';

// ---------- trup
// Půdorys (z dozadu, x do strany): od zádě rovně do čtvrtiny délky, pak oblouk ke špičce přídě.
function planform(L, W) {
  const st = [];
  for (let i = 0; i <= 6; i++) st.push([L - 1.25 * L * (i / 6), W]);
  for (let i = 1; i <= 12; i++) { const t = i / 12, u = 1 - t; st.push([u * u * -0.25 * L + 2 * u * t * -0.8 * L - t * t * L, u * u * W + 2 * u * t * 0.95 * W]); }
  return st;
}
/** Trup s V-dnem od kýlu (y = −draft) po palubu (y1): v každém řezu bok, hrana (chine) a kýl; vzadu rovné zrcadlo. */
export function vHullGeo(len, wid, draft, y1) {
  const L = len / 2, W = wid / 2, pos = [], idx = [];
  const rows = planform(L, W).map(([z, w]) => {
    const k = Math.max(0, (-0.35 * L - z) / (0.65 * L)), keel = -draft + (draft + y1 * 0.6) * k ** 1.6; // příď se zvedá
    const cy = keel + (y1 - keel) * 0.45;
    return [[w, y1, z], [w * 0.9, cy, z], [0, keel, z], [-w * 0.9, cy, z], [-w, y1, z]];
  });
  // 4 pásy (bok P, dno P, dno L, bok L), každý vlastní body: hladké podél lodi, ostrá hrana na chine
  for (let s = 0; s < 4; s++) {
    const base = pos.length / 3;
    for (const r of rows) pos.push(...r[s], ...r[s + 1]);
    for (let i = 0; i < rows.length - 1; i++) { const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c); }
  }
  // zrcadlo (záď): vějíř kolem středu
  const r0 = rows[0], cIdx = pos.length / 3;
  pos.push(0, (y1 + r0[2][1]) / 2, L);
  for (const p of r0) pos.push(...p);
  for (let i = 0; i < 4; i++) idx.push(cIdx, cIdx + 2 + i, cIdx + 1 + i);
  idx.push(cIdx, cIdx + 1, cIdx + 5);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
// Půdorys lodi jako tvar (x, z) pro palubu a bočnice
function outline(p, w, l, L) { p.moveTo(-w, l); p.lineTo(w, l); p.lineTo(w, -L * 0.25); p.quadraticCurveTo(w * 0.95, -L * 0.8, 0, -l); p.quadraticCurveTo(-w * 0.95, -L * 0.8, -w, -L * 0.25); p.closePath(); }
/** Paluba: plochá deska v půdorysu lodi (od y0 do y1). */
function deckGeo(len, wid, y0, y1) {
  const s = new THREE.Shape();
  outline(s, wid / 2, len / 2, len / 2);
  return new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: false, curveSegments: 10 }).rotateX(Math.PI / 2).translate(0, y1, 0);
}
/** Bočnice (od y0 do y1) tloušťky t kolem paluby. */
function hullWalls(len, wid, y0, y1, t) {
  const L = len / 2, W = wid / 2, s = new THREE.Shape(), h = new THREE.Path();
  outline(s, W, L, L); outline(h, W - t, L - t * 1.6, L);
  s.holes.push(h);
  return new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: false, curveSegments: 10 }).rotateX(Math.PI / 2).translate(0, y1, 0);
}

// ---------- motorový člun
export function buildMotorboat(B, color, v) {
  const g = new THREE.Group(), box = boxer(g), T = vehMats(), paint = paintMat(color, 0.35), mods = modsOf(v);
  g.add(new THREE.Mesh(vHullGeo(B.len, B.wid, B.draft, 0.12), T.graphite));
  g.add(new THREE.Mesh(hullWalls(B.len, B.wid, 0.12, 0.6, 0.1), paint));
  g.add(new THREE.Mesh(deckGeo(B.len - 0.25, B.wid - 0.25, 0.1, 0.14), T.deck));
  for (const s of [-1, 1]) box(0.02, 0.025, 2.9, T.glow, s * 1.005, 0.5, 1.0); // tyrkysový proužek po boku
  // zahnutý štít z tónovaného skla (je vidět z obou stran) s grafitovými sloupky
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.42, 18, 1, true, Math.PI - 0.95, 1.9), T.glass2);
  glass.position.set(0, 0.84, 0.95);
  glass.rotation.x = 0.32;
  glass.userData.keep = true;
  g.add(glass);
  for (const s of [-1, 1]) g.add(tube([s * 0.77, 0.62, 0.42], [s * 0.78, 1.04, 0.5], 0.02, T.graphite));
  // pult s displejem a volantem, sedadla
  box(0.7, 0.45, 0.4, T.white, -0.42, 0.37, 0.4, 0.05);
  box(0.4, 0.02, 0.18, T.screen, -0.42, 0.605, 0.4).rotation.x = -0.25;
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.02, 6, 18), T.graphite);
  wheel.position.set(-0.42, 0.72, 0.62); wheel.rotation.x = -0.9; g.add(wheel);
  for (const [x, z] of [[-0.42, 0.9], [0.45, 0.9], [-0.42, -0.35], [0.45, -0.35]]) { box(0.55, 0.14, 0.5, T.seat, x, 0.24, z, 0.04); box(0.55, 0.45, 0.1, T.seat, x, 0.45, z + 0.27, 0.04); }
  // příď: LED světlomet a chromový úvazník; záď: červená světla
  const head = headMat(), tail = tailMat();
  box(0.32, 0.05, 0.05, head, 0, 0.52, -B.len / 2 + 0.28, 0.015);
  box(0.08, 0.04, 0.2, T.chrome, 0, 0.62, -B.len / 2 + 0.55, 0.015);
  for (const s of [-1, 1]) box(0.1, 0.06, 0.04, tail, s * 0.8, 0.55, B.len / 2 - 0.03, 0.01);
  // tyrkysové podsvícení na čáře ponoru (jas nastavuje car.js)
  const under = glowMat(TECH.cyan, 0);
  for (const s of [-1, 1]) box(0.03, 0.04, 3.4, under, s * 0.96, 0.04, 0.5);
  // elektrický závěsný motor (natáčí se kormidlem): bílý kryt se svítícím prstencem, grafitová noha, vrtule
  const pivot = new THREE.Group(); pivot.position.set(0, 0.4, B.len / 2 + 0.05); g.add(pivot);
  const pb = boxer(pivot), big = mods.turbo ? 1.15 : 1;
  pb(0.38 * big, 0.5 * big, 0.44 * big, T.white, 0, 0.17, 0.14, 0.1);
  pb(0.4 * big, 0.03, 0.46 * big, T.glow, 0, 0.1, 0.14);
  if (mods.turbo) pb(0.2, 0.08, 0.26, T.graphite, 0, 0.47, 0.12, 0.03); // sání turba
  pb(0.08, 0.9, 0.14, T.graphite, 0, -0.45, 0.12, 0.03);
  pb(0.12, 0.1, 0.34, T.graphite, 0, -0.82, 0.16, 0.04); // gondola s motorem vrtule
  const exhausts = [];
  if (mods.nitro) for (const s of [-1, 1]) { pb(0.07, 0.07, 0.06, T.nitro, s * 0.12, 0.25, 0.39, 0.02); exhausts.push([s * 0.12, 0.65, B.len / 2 + 0.5]); }
  mergeStatic(pivot);
  const prop = new THREE.Group(); prop.position.set(0, -0.82, 0.36); pivot.add(prop);
  const blades = [];
  for (let i = 0; i < 3; i++) blades.push(new THREE.BoxGeometry(0.07, 0.24, 0.02).translate(0, 0.13, 0).rotateY(0.4).rotateZ((i / 3) * Math.PI * 2));
  prop.add(new THREE.Mesh(mergeGeos(blades), T.chrome));
  mergeStatic(g);
  return { group: g, wheels: [], pivots: [pivot], head, tail, under, prop, boat: B, drl: 0.4, exhaust: exhausts[0], exhausts };
}

// ---------- plachetnice
// Plachta: trojúhelník z mřížky bodů, vydutý do strany podle větru; při třepetání se vlní (uv pro látku se znakem)
function sailGeo(nu = 8, nv = 10) {
  const g = new THREE.BufferGeometry(), pos = new Float32Array((nu + 1) * (nv + 1) * 3), uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) uv.push(i / nu, j / nv);
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.userData = { nu, nv };
  return g;
}
// vrcholy: hlava (h), přední spodní roh (t), zadní spodní roh (c); vydutí b do strany x
export function shapeSail(geo, h, t, c, b, flutter, time) {
  const { nu, nv } = geo.userData, p = geo.attributes.position.array;
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const v = j / nv, u = i / nu, k = (j * (nu + 1) + i) * 3;
    // body podél spodku od t do c, nahoru se zužuje k hlavě
    const bx = t[0] + (c[0] - t[0]) * u, by = t[1] + (c[1] - t[1]) * u, bz = t[2] + (c[2] - t[2]) * u;
    const x = bx + (h[0] - bx) * v, y = by + (h[1] - by) * v, z = bz + (h[2] - bz) * v;
    const belly = Math.sin(Math.PI * u) * (1 - v * 0.85);
    const wave = flutter * Math.sin(time * 22 + u * 9 + v * 4) * belly;
    p[k] = x + b * belly + wave; p[k + 1] = y; p[k + 2] = z;
  }
  geo.attributes.position.needsUpdate = true;
  geo.computeVertexNormals();
}
// Látka plachty (canvas): bílá se švy panelů, tyrkysový pruh u spodního lemu a kruhový znak (u = podél spodku, v = nahoru)
let sailT = null;
function sailTex() {
  if (sailT) return sailT;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#f4f3ee'; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(120,130,140,0.35)'; x.lineWidth = 2;
  for (let y = 28; y < 256; y += 30) { x.beginPath(); x.moveTo(0, y); x.lineTo(256, y + 18); x.stroke(); } // švy panelů
  x.fillStyle = '#38e8ff'; x.fillRect(0, 226, 256, 12); // pruh u spodního lemu (v canvasu dole = v = 0)
  x.fillStyle = '#1b2a3e'; x.fillRect(0, 240, 256, 16);
  // kruh se znakem: tmavý disk, tyrkysový prstenec a bílé vlny (souměrné, protože plachta je vidět z obou stran)
  x.fillStyle = '#0f1a2e'; x.beginPath(); x.arc(105, 131, 34, 0, Math.PI * 2); x.fill();
  x.strokeStyle = '#38e8ff'; x.lineWidth = 5; x.beginPath(); x.arc(105, 131, 28, 0, Math.PI * 2); x.stroke();
  x.strokeStyle = '#f4f6fa'; x.lineWidth = 4;
  for (const dy of [-9, 0, 9]) { x.beginPath(); x.moveTo(87, 131 + dy); x.bezierCurveTo(96, 123 + dy, 114, 139 + dy, 123, 131 + dy); x.stroke(); }
  sailT = new THREE.CanvasTexture(c);
  sailT.colorSpace = THREE.SRGBColorSpace;
  return sailT;
}
export function buildSailboat(B, color) {
  const g = new THREE.Group(), box = boxer(g), T = vehMats(), paint = paintMat(color, 0.35);
  const cloth = new THREE.MeshStandardMaterial({ map: sailTex(), roughness: 0.8, side: THREE.DoubleSide });
  g.add(new THREE.Mesh(vHullGeo(B.len, B.wid, B.draft, 0.18), paint));
  g.add(new THREE.Mesh(hullWalls(B.len, B.wid, 0.18, 0.5, 0.09), T.white));
  g.add(new THREE.Mesh(deckGeo(B.len - 0.22, B.wid - 0.22, 0.16, 0.2), T.deck));
  for (const s of [-1, 1]) box(0.02, 0.025, 3.0, T.glow, s * 1.055, 0.42, 1.0);
  // kýl s hruškou (grafit), lavice, kormidlo s pákou
  box(0.07, 0.8, 0.9, T.graphite, 0, -B.draft - 0.35, -0.1, 0.03);
  const bulb = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.7, 4, 12).rotateX(Math.PI / 2), T.graphite);
  bulb.position.set(0, -B.draft - 0.75, -0.05); g.add(bulb);
  for (const [x, z] of [[-0.62, 0.7], [0.62, 0.7], [0, 2.0]]) box(x ? 0.4 : 1.2, 0.12, x ? 1.4 : 0.4, T.white, x, 0.32, z, 0.04);
  const mz = -0.7;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.075, 6.3, 12), T.graphite);
  mast.position.set(0, 3.3, mz); g.add(mast);
  for (const s of [-1, 1]) g.add(tube([s * 0.95, 0.5, mz + 0.25], [0, 6.2, mz], 0.008, T.graphite, 4)); // vanty
  g.add(tube([0, 0.55, -B.len / 2 + 0.3], [0, 6.2, mz], 0.008, T.graphite, 4)); // předstěh
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), T.glow); // světlo na vrcholu stěžně
  top.position.set(0, 6.47, mz); g.add(top);
  // ráhno s hlavní plachtou: otáčí se kolem stěžně (natočení podle větru)
  const boom = new THREE.Group(); boom.position.set(0, 1.15, mz); g.add(boom);
  const bm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 2.7, 10).rotateX(Math.PI / 2), T.graphite);
  bm.position.z = 1.35; boom.add(bm);
  const main = new THREE.Mesh(sailGeo(), cloth); boom.add(main);
  const jib = new THREE.Mesh(sailGeo(6, 8), cloth); g.add(jib);
  // vlaječka na vrcholu stěžně ukazuje, kam fouká vítr
  const flagG = new THREE.Group(); flagG.position.set(0, 6.4, mz); g.add(flagG);
  const fg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.12, 0), new THREE.Vector3(0, -0.12, 0), new THREE.Vector3(0, 0, 0.6)]);
  fg.computeVertexNormals();
  flagG.add(new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ color: TECH.cyan, emissive: TECH.cyan, emissiveIntensity: 0.6, side: THREE.DoubleSide })));
  const pivot = new THREE.Group(); pivot.position.set(0, 0.3, B.len / 2 - 0.05); g.add(pivot);
  const pb = boxer(pivot);
  pb(0.06, 1.0, 0.4, T.graphite, 0, -0.45, 0.15, 0.02); pb(0.05, 0.05, 0.9, T.graphite, 0, 0.25, -0.4, 0.015);
  mergeStatic(pivot);
  mergeStatic(g);
  return { group: g, wheels: [], pivots: [pivot], head: null, tail: null, boat: B, boom, main, jib, flagG, mz };
}
