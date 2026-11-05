// Model auta „Jasná budoucnost“: hladká karoserie z bočního profilu (podběhy kol, skloněná kapota, splývavá záď),
// tónovaná prosklená kabina s panoramatickou střechou, LED pás vpředu i vzadu, tyrkysový proužek po boku a podsvícení
// podvozku, aero ráfky se svítícím prstencem. Vylepšení z garáže jsou vidět: turbo (nasávání na kapotě + křídlo),
// nitro (dvě modré trysky vzadu), terénní pneumatiky (hrubý vzorek + lemy podběhů).
// Jen funkce (nic se nespouští při načtení); volá ho vehicles/car.js. Dopředu je -z, počátek mezi nápravami na zemi.
import * as THREE from 'three';
import { boxer, glowMat, headMat, hubRingGeo, mergeStatic, modsOf, paintMat, rimGeo, sideExtrude, tailMat, tube, tyreGeo, vehMats, TECH } from './veh-look.js';

// podběh kola (oblouk nad kolem) do bočního profilu: střed z, poloměr r, spodní hrana y
function arch(pts, zc, r, y, from, to) {
  const a0 = Math.asin((y - 0.38) / r);
  for (let i = 0; i <= 10; i++) {
    const t = from + (to - from) * (i / 10), a = a0 + (Math.PI - 2 * a0) * t;
    pts.push([zc + Math.cos(a) * r, 0.38 + Math.sin(a) * r]);
  }
}
export function buildCarModel(color, v = null) {
  const g = new THREE.Group(), box = boxer(g), T = vehMats(), paint = paintMat(color), mods = modsOf(v);
  // karoserie: boční profil (z, y) od přední spodní hrany dozadu přes střechu kapoty; obrys roste o zaoblení (~8 cm)
  const body = [[-1.88, 0.36], [-1.97, 0.46], [-1.98, 0.62], [-1.93, 0.76], [-1.6, 0.88], [-1.1, 0.95], [-0.7, 0.98], [0.5, 1.0], [1.55, 1.0], [1.88, 0.96], [1.97, 0.84], [1.98, 0.5], [1.9, 0.38], [1.84, 0.36]];
  arch(body, 1.3, 0.5, 0.36, 0, 1);
  arch(body, -1.3, 0.5, 0.36, 0, 1);
  g.add(new THREE.Mesh(sideExtrude(body, 1.9, 0.1, 4), paint));
  // kabina: tónované sklo (zevnitř neviditelné), sloupky, střecha (zevnitř černá) v barvě laku s panoramatickým oknem
  g.add(new THREE.Mesh(sideExtrude([[-0.72, 0.95], [-0.08, 1.48], [1.42, 1.48], [1.86, 1.0], [1.8, 0.95]], 1.74, 0.05, 2), T.glass));
  g.add(new THREE.Mesh(sideExtrude([[-0.12, 1.5], [0.16, 1.555], [1.3, 1.555], [1.52, 1.5], [1.48, 1.47], [1.28, 1.52], [0.2, 1.52], [-0.06, 1.47]], 1.78, 0.04, 2), T.black));
  box(1.72, 0.02, 1.12, paint, 0, 1.592, 0.74, 0.008); // střecha v barvě laku
  box(1.24, 0.012, 0.92, T.black, 0, 1.604, 0.74); // panoramatické okno (černé sklo)
  for (const s of [-1, 1]) {
    const x = s * 0.86;
    g.add(tube([x, 1.0, -0.68], [x, 1.5, -0.1], 0.035, paint)); // přední sloupek
    box(0.06, 0.5, 0.1, T.black, x, 1.26, 0.72); // prostřední sloupek (černý)
    g.add(tube([x, 1.5, 1.44], [x, 1.02, 1.84], 0.045, paint)); // zadní sloupek
    box(0.1, 0.09, 0.2, T.black, s * 0.98, 1.14, -0.58, 0.03); // zpětné zrcátko
    box(0.04, 0.1, 1.55, T.graphite, s * 0.955, 0.33, 0.0); // práh
    box(0.02, 0.025, 2.3, T.glow, s * 0.962, 0.66, 0.05); // tyrkysový proužek po boku
    box(0.02, 0.42, 0.02, T.black, s * 0.957, 0.72, -0.5); // spáry dveří
    box(0.02, 0.42, 0.02, T.black, s * 0.957, 0.72, 0.82);
  }
  // příď a záď: maska, nárazníky, LED pásy (přední svítí slabě vždy, s rozsvícenými světly naplno)
  const head = headMat(), tail = tailMat();
  box(1.2, 0.12, 0.05, T.black, 0, 0.5, -2.05, 0.02); // spodní maska
  box(1.82, 0.1, 0.12, T.graphite, 0, 0.32, -2.0, 0.04); // přední nárazník (spoiler)
  box(1.82, 0.1, 0.12, T.graphite, 0, 0.32, 2.0, 0.04); // difuzor
  box(1.5, 0.035, 0.04, head, 0, 0.7, -2.045); // LED pás přes celou šířku
  for (const s of [-1, 1]) box(0.36, 0.07, 0.05, head, s * 0.62, 0.64, -2.035, 0.015); // světlomety
  box(1.72, 0.05, 0.04, tail, 0, 0.8, 2.045); // zadní LED pás
  for (const s of [-1, 1]) box(0.3, 0.1, 0.05, tail, s * 0.72, 0.74, 2.04, 0.015);
  // podsvícení podvozku: svítí, když auto jede nebo má rozsvíceno (jas nastavuje car.js)
  const under = glowMat(TECH.cyan, 0);
  box(1.5, 0.02, 2.9, under, 0, 0.27, 0);
  // interiér: sedadla, palubní deska s displejem, volant
  for (const x of [-0.42, 0.42]) { box(0.52, 0.12, 0.52, T.seat, x, 0.98, 0.35, 0.04); box(0.52, 0.6, 0.12, T.seat, x, 1.25, 0.66, 0.04); }
  box(1.3, 0.12, 0.45, T.seat, 0, 0.98, 1.3, 0.04); box(1.3, 0.48, 0.1, T.seat, 0, 1.2, 1.55, 0.04); // zadní lavice
  box(1.66, 0.14, 0.4, T.graphite, 0, 1.04, -0.55, 0.04); // palubní deska
  box(0.46, 0.13, 0.02, T.screen, 0.1, 1.17, -0.4).rotation.x = -0.4; // displej
  box(0.2, 0.06, 0.02, T.screen, -0.42, 1.14, -0.42).rotation.x = -0.4; // přístroje za volantem
  const sw = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.022, 6, 18), T.graphite);
  sw.position.set(-0.42, 1.2, -0.25);
  sw.rotation.x = -0.9;
  g.add(sw);
  // vylepšení z garáže
  if (mods.turbo) {
    box(0.6, 0.1, 0.7, T.graphite, 0, 1.05, -1.15, 0.04).rotation.x = 0.07; // nasávání na kapotě
    box(0.44, 0.03, 0.02, T.glow, 0, 1.06, -1.5);
    box(1.7, 0.04, 0.3, T.graphite, 0, 1.24, 1.9, 0.015); // zadní křídlo
    for (const s of [-1, 1]) box(0.04, 0.2, 0.14, T.graphite, s * 0.55, 1.12, 1.9);
  }
  const exhausts = [];
  if (mods.nitro) for (const s of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.16, 12).rotateX(Math.PI / 2), T.chrome);
    t.position.set(s * 0.55, 0.42, 2.03);
    g.add(t);
    const n = new THREE.Mesh(new THREE.CircleGeometry(0.045, 12), T.nitro);
    n.position.set(s * 0.55, 0.42, 2.115);
    g.add(n);
    exhausts.push([s * 0.55, 0.42, 2.2]);
  }
  if (mods.offroad) for (const s of [-1, 1]) for (const z of [-1.3, 1.3]) { // lemy podběhů
    const f = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.05, 6, 16, Math.PI).rotateY(Math.PI / 2), T.graphite);
    f.position.set(s * 0.96, 0.38, z);
    g.add(f);
  }
  // kola: natáčecí čep -> rotující kolo (pneumatika, aero ráfek s paprsky, svítící prstenec)
  const wheels = [], pivots = [], tyre = tyreGeo(0.38, 0.28, mods.offroad), ring = hubRingGeo(0.25);
  for (const [x, z] of [[-0.95, -1.3], [0.95, -1.3], [-0.95, 1.3], [0.95, 1.3]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.38, z);
    g.add(pivot);
    const spin = new THREE.Group(), r = new THREE.Mesh(ring, T.glow);
    r.position.x = Math.sign(x) * 0.13;
    spin.add(new THREE.Mesh(tyre, T.rubber), new THREE.Mesh(rimGeo(0.27, 0.28, 5, Math.sign(x)), T.graphite), r);
    pivot.add(spin);
    wheels.push(spin);
    if (z < 0) pivots.push(pivot);
  }
  mergeStatic(g);
  return { group: g, wheels, pivots, head, tail, under, drl: 0.6, exhaust: exhausts[0] || [0.6, 0.4, 2.2], exhausts };
}
