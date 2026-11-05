// Model dvouplošníku a hydroplánu „Jasná budoucnost“: hladký soustružený trup s vrchním lakem, kapkovitý kryt kabiny
// z tónovaného skla (zevnitř neviditelný, aby nezakrýval výhled), dvě bílá křídla spojená na koncích svislými štíty
// (uzavřené „krabicové“ křídlo místo dřevěných vzpěr) se svítící hranou, chromový kužel vrtule a tyrkysový prstenec
// sání, dvě trysky po stranách trupu, které svítí podle plynu (z nich šlehá nitro), kapotovaný podvozek nebo plováky.
// Vylepšení z garáže: turbo (sání pod motorem), nitro (modré prstence trysek). Rozměry sedí se srážkami v plane.js.
// Jen funkce (nic se nespouští při načtení); volá ho vehicles/car.js. Dopředu je -z, počátek na zemi pod trupem.
import * as THREE from 'three';
import { boxer, glowMat, mergeGeos, mergeStatic, mirrorX, modsOf, paintMat, tube, tyreGeo, vehMats, TECH } from './veh-look.js';

// Znak AI kroužku na křídla letadla (canvas): glow = jen svítící prstenec (emissiveMap)
const emblemCache = {};
export function emblemTex(glow = false) {
  if (emblemCache[glow]) return emblemCache[glow];
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.translate(64, 64);
  if (!glow) { x.fillStyle = '#0f1a2e'; x.beginPath(); x.arc(0, 0, 62, 0, Math.PI * 2); x.fill(); }
  else { x.fillStyle = '#000'; x.fillRect(-64, -64, 128, 128); }
  x.strokeStyle = glow ? '#fff' : '#38e8ff';
  x.lineWidth = 8;
  x.beginPath(); x.arc(0, 0, 52, 0, Math.PI * 2); x.stroke();
  if (!glow) {
    x.fillStyle = '#f4f6fa';
    x.font = 'bold 72px system-ui, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('Ř', 0, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return (emblemCache[glow] = t);
}
let emblemM = null;
const emblemMat = () => (emblemM ||= new THREE.MeshStandardMaterial({ map: emblemTex(), transparent: true, roughness: 0.4, emissive: TECH.cyan, emissiveMap: emblemTex(true), emissiveIntensity: 0.7 }));

// křídlo: lichoběžníkový půdorys (x do strany, z dozadu) vytažený do tloušťky, zaoblené hrany
function wingGeo(span, rootZ, tipZ, t = 0.1) {
  const [r0, r1] = rootZ, [t0, t1] = tipZ;
  const s = new THREE.Shape([new THREE.Vector2(0, r0), new THREE.Vector2(span - 0.15, t0), new THREE.Vector2(span, t0 + 0.12), new THREE.Vector2(span, t1 - 0.08), new THREE.Vector2(span - 0.1, t1), new THREE.Vector2(0, r1)]);
  return new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.035, bevelSegments: 2, curveSegments: 4 }).rotateX(Math.PI / 2).translate(0, t / 2, 0);
}
// soustružený profil (poloměr, z) kolem osy z
const latheZ = (prof, seg = 20) => new THREE.LatheGeometry(prof.map(([r, z]) => new THREE.Vector2(r, z)), seg).rotateX(Math.PI / 2);

export function buildPlaneModel(color, floats = false, v = null) {
  const g = new THREE.Group(), box = boxer(g), T = vehMats(), paint = paintMat(color), mods = modsOf(v);
  // trup: osa ve výšce 1,35 m, od kužele vrtule (-z) po ocas (+z)
  const body = new THREE.Mesh(latheZ([[0.001, -3.0], [0.3, -2.98], [0.47, -2.8], [0.54, -2.4], [0.56, -1.4], [0.55, -0.2], [0.52, 0.8], [0.45, 1.8], [0.34, 2.8], [0.22, 3.7], [0.13, 4.2], [0.001, 4.3]], 22), paint);
  body.position.y = 1.35;
  body.scale.set(1, 1.05, 1);
  g.add(body);
  // kryt kabiny nad oběma sedadly (přední je pod horním křídlem); rám jen vzadu, aby nezakrýval výhled z kokpitu
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), T.glass);
  canopy.scale.set(0.46, 0.58, 1.75);
  canopy.position.set(0, 1.72, 0.3);
  canopy.userData.keep = true;
  g.add(canopy);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.02, 6, 20, Math.PI), T.graphite);
  frame.position.set(0, 1.72, 1.55);
  frame.scale.set(1, 1.18, 1);
  g.add(frame);
  for (const s of [-1, 1]) box(0.025, 0.025, 2.9, T.glow, s * 0.44, 1.73, 0.35); // tyrkysové linky podél krytu kabiny
  // nos: chromový kužel, tyrkysový prstenec sání, vrtule se třemi listy (otáčí se v car.js)
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.5, 18).rotateX(-Math.PI / 2), T.chrome);
  spinner.position.set(0, 1.35, -3.28);
  g.add(spinner);
  const intake = new THREE.Mesh(new THREE.TorusGeometry(0.425, 0.03, 6, 28), T.glow);
  intake.position.set(0, 1.35, -2.86);
  g.add(intake);
  const prop = new THREE.Group();
  prop.position.set(0, 1.35, -3.12);
  g.add(prop);
  const blades = [];
  for (let i = 0; i < 3; i++) blades.push(new THREE.BoxGeometry(0.13, 1.25, 0.035).translate(0, 0.7, 0).rotateY(0.35).rotateZ((i / 3) * Math.PI * 2));
  prop.add(new THREE.Mesh(mergeGeos(blades), T.graphite));
  // křídla: dolní (y 0,95) a horní (y 2,38) spojená na koncích štítem se svítící hranou; mezi trupem a horním křídlem pylony
  const lower = wingGeo(4.55, [-1.7, -0.1], [-1.3, -0.5]), upper = wingGeo(4.65, [-1.9, -0.3], [-1.5, -0.7]);
  for (const s of [-1, 1]) {
    for (const [geo, y] of [[lower, 0.95], [upper, 2.38]]) { const w = new THREE.Mesh(s > 0 ? geo : mirrorX(geo), T.white); w.position.y = y; g.add(w); }
    // koncový štít: úzká šikmá deska mezi konci křídel (svítí její přední hrana)
    const plate = new THREE.Shape([new THREE.Vector2(-1.32, 0.95), new THREE.Vector2(-0.95, 0.95), new THREE.Vector2(-1.15, 2.38), new THREE.Vector2(-1.52, 2.38)]);
    const pg = new THREE.ExtrudeGeometry(plate, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 1 }).rotateY(-Math.PI / 2);
    const pm = new THREE.Mesh(pg, paint);
    pm.position.x = s * 4.55 + 0.03;
    g.add(pm);
    g.add(tube([s * 4.6, 0.97, -1.36], [s * 4.6, 2.36, -1.56], 0.025, T.glow));
    const py = box(0.05, 0.7, 0.36, T.white, s * 0.56, 1.99, -1.0, 0.02); // pylon horního křídla (plochý, bílý)
    py.rotation.z = -s * 0.32;
  }
  for (const x of [-3.4, 3.4]) { const d = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32).rotateX(-Math.PI / 2), emblemMat()); d.position.set(x, 2.468, -1.12); g.add(d); }
  // ocasní plochy: bílá vodorovná, šikmá kýlovka v barvě se svítící hranou
  const tailP = new THREE.Shape([new THREE.Vector2(0, 3.1), new THREE.Vector2(1.6, 3.6), new THREE.Vector2(1.6, 3.95), new THREE.Vector2(0, 4.2)]);
  const tailG = new THREE.ExtrudeGeometry(tailP, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 }).rotateX(Math.PI / 2);
  for (const s of [-1, 1]) { const t = new THREE.Mesh(s > 0 ? tailG : mirrorX(tailG), T.white); t.position.y = 1.52; g.add(t); }
  const finP = new THREE.Shape([new THREE.Vector2(2.9, 0), new THREE.Vector2(4.25, 0), new THREE.Vector2(4.45, 1.2), new THREE.Vector2(3.95, 1.2)]);
  const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(finP, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 }).rotateY(-Math.PI / 2), paint);
  fin.position.set(0.03, 1.48, 0);
  g.add(fin);
  box(0.075, 0.04, 0.48, T.glow, 0, 2.7, 4.2);
  // trysky po stranách trupu: grafitové gondoly, svítící ústí (jas podle plynu nastavuje car.js)
  const nozzles = glowMat(TECH.cyan, 0.15), exhausts = [];
  for (const s of [-1, 1]) {
    const pod = new THREE.Mesh(latheZ([[0.001, 0.9], [0.12, 0.95], [0.17, 1.2], [0.17, 1.9], [0.15, 2.2]], 14), T.graphite);
    pod.position.set(s * 0.6, 1.5, 0);
    g.add(pod);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), nozzles);
    glow.position.set(s * 0.6, 1.5, 2.2);
    g.add(glow);
    if (mods.nitro) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 6, 18), T.nitro); r.position.set(s * 0.6, 1.5, 2.2); g.add(r); }
    exhausts.push([s * 0.6, 1.5, 2.35]);
  }
  if (mods.turbo) { box(0.5, 0.18, 0.9, T.graphite, 0, 0.74, -2.2, 0.06); box(0.36, 0.06, 0.02, T.glow, 0, 0.74, -2.66); } // sání turba pod motorem
  // podvozek: kola v aerodynamických krytech na vzpěrách, ostruha; hydroplán má místo nich dva plováky
  const wheels = [];
  if (floats) {
    const fl = latheZ([[0.001, -2.6], [0.14, -2.5], [0.24, -2.1], [0.27, -1.4], [0.27, 0.6], [0.22, 1.2], [0.1, 1.45], [0.001, 1.5]], 16);
    for (const s of [-1, 1]) {
      const f = new THREE.Mesh(fl, T.white);
      f.position.set(s * 1.25, 0.24, 0);
      f.scale.set(1, 0.9, 1);
      g.add(f);
      box(0.05, 0.08, 3.0, paint, s * 1.25 + s * 0.24, 0.3, -0.5); // pruh v barvě
      box(0.03, 0.025, 2.4, T.glow, s * 1.25 + s * 0.262, 0.18, -0.5); // svítící čára ponoru
      for (const z of [-1.6, 0.2]) g.add(tube([s * 1.22, 0.45, z], [s * 0.38, 1.0, z], 0.045, T.graphite));
    }
    g.add(tube([-1.2, 0.5, -1.6], [1.2, 0.5, -1.6], 0.035, T.graphite));
    g.add(tube([-1.2, 0.5, 0.2], [1.2, 0.5, 0.2], 0.035, T.graphite));
  } else {
    const tyre = tyreGeo(0.42, 0.16);
    for (const s of [-1, 1]) {
      g.add(tube([s * 0.35, 1.0, -1.25], [s * 0.85, 0.5, -1.3], 0.045, T.graphite));
      const w = new THREE.Group();
      w.position.set(s * 0.85, 0.42, -1.3);
      g.add(w);
      w.add(new THREE.Mesh(tyre, T.rubber));
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.18, 14).rotateZ(Math.PI / 2), T.chrome);
      w.add(hub);
      wheels.push(w);
      const spat = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), paint); // kryt kola
      spat.scale.set(0.15, 0.3, 0.62);
      spat.position.set(s * 0.85, 0.62, -1.28);
      g.add(spat);
    }
    g.add(tube([0, 1.0, 3.6], [0, 0.22, 3.95], 0.035, T.graphite)); // ostruha
    const tw = new THREE.Mesh(tyreGeo(0.12, 0.06), T.rubber);
    tw.position.set(0, 0.12, 3.95);
    g.add(tw);
  }
  // poziční světla: červené vlevo, zelené vpravo, bílé na ocasu (na koncích horního křídla)
  const nav = glowMat(0xff2020, 0, 0x220000), navG = glowMat(0x20ff40, 0, 0x002200), navW = glowMat(0xffffff, 0, 0x222222);
  box(0.1, 0.08, 0.16, nav, -4.66, 2.4, -1.1, 0.02);
  box(0.1, 0.08, 0.16, navG, 4.66, 2.4, -1.1, 0.02);
  box(0.08, 0.08, 0.08, navW, 0, 2.6, 4.44);
  mergeStatic(g);
  return { group: g, prop, wheels, pivots: [], navs: [nav, navG, navW], nozzles, head: null, tail: null, exhaust: exhausts[0], exhausts };
}
