// Společný vzhled vozidel „Jasná budoucnost“ (jako stroje a obleky): lak s průhledným vrchním lakem, grafitové a bílé díly,
// chrom, guma, tónované sklo s odlesky oblohy a tyrkysové svítící proužky (tyrkysová = technika). Pneumatiky (i terénní
// z garáže), ráfky se svítícím prstencem a spojení nehybných dílů do méně modelů (méně kreslení za snímek).
// Nízká grafika (MATQ.maps = false) dostane obyčejné materiály bez vrchního laku. Jen funkce a líně vytvořené materiály.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TECH, mergeStatic } from '../machines/machine-models.js';
import { MATQ, setupBlockMat } from '../render/materials.js';

export { TECH, mergeStatic };
const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.5, ...o });

const paints = new Map();
/** Lak v barvě vozidla: metalíza s vrchním lakem (střední, vysoká), na nízké grafice obyčejný lesklý materiál. */
export function paintMat(color, metal = 0.55) {
  const key = `${color}|${metal}`;
  if (!paints.has(key)) {
    paints.set(key, MATQ.maps
      ? new THREE.MeshPhysicalMaterial({ color, metalness: metal, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.6 })
      : std({ color, metalness: Math.min(0.45, metal), roughness: 0.32 }));
  }
  return paints.get(key);
}
// obraz displeje: tyrkysový budík a pár řádků na tmavém pozadí (jeden malý canvas pro všechna vozidla)
function screenTex() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#04080c'; x.fillRect(0, 0, 128, 64);
  x.strokeStyle = '#38e8ff'; x.lineWidth = 5;
  x.beginPath(); x.arc(34, 38, 20, Math.PI * 0.8, Math.PI * 2.2); x.stroke();
  x.fillStyle = '#38e8ff';
  for (let i = 0; i < 5; i++) x.fillRect(68, 10 + i * 10, 18 + ((i * 37) % 38), 5);
  x.fillStyle = '#5cff8a'; x.fillRect(30, 34, 8, 8);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let S = null;
/** Sdílené materiály dílů, které se nemění (jsou stejné pro všechna vozidla). */
export function vehMats() {
  if (S) return S;
  S = {
    white: paintMat(0xe6ebf1, 0.12), // bílý lakovaný plast (křídla, trupy lodí)
    graphite: std({ color: 0x2a2f38, metalness: 0.6, roughness: 0.38 }), // grafit (lišty, nárazníky, kryty)
    black: std({ color: 0x12151a, metalness: 0.4, roughness: 0.3, envMapIntensity: 1.4 }), // lesklá černá (střecha, maska)
    chrome: std({ color: 0xd8dee6, metalness: 1, roughness: 0.16, envMapIntensity: 1.8 }),
    rubber: std({ color: 0x17181c, roughness: 0.88 }),
    seat: std({ color: 0x262a32, roughness: 0.72 }),
    deck: std({ color: 0xc9cdd2, roughness: 0.62 }), // světlá protiskluzová paluba
    // tónované sklo: odráží oblohu (shader skla bloků); zevnitř neviditelné (jen přední stěny), takže nezakrývá výhled
    glass: setupBlockMat(new THREE.MeshStandardMaterial({ color: 0x1a3042, transparent: true, opacity: 0.5, depthWrite: false }), 'glass'),
    glass2: setupBlockMat(new THREE.MeshStandardMaterial({ color: 0x1a3042, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }), 'glass'), // tenký štít (z obou stran)
    glow: glowMat(TECH.cyan, 1.3), // stálé tyrkysové proužky
    screen: std({ color: 0x050a10, emissive: 0xffffff, emissiveMap: screenTex(), emissiveIntensity: 1, roughness: 0.2 }), // displeje (budík a řádky)
    nitro: glowMat(0x3a7bff, 1.6), // modré prvky nitra
  };
  return S;
}
/** Svítící materiál (vlastní pro každé vozidlo, když se jeho jas mění: světla, podsvícení, trysky). */
export const glowMat = (color, intensity = 0, base = 0x0b0d12) => std({ color: base, emissive: color, emissiveIntensity: intensity, roughness: 0.3 });
/** Přední světla (bílé LED) a zadní (červené); jas nastavuje vehicles/car.js podle v.lights. */
export const headMat = () => std({ color: 0xfff8e0, emissive: 0xfff2c0, emissiveIntensity: 0.6 });
export const tailMat = () => std({ color: 0x6a1010, emissive: 0xff2010, emissiveIntensity: 0.25 });

/** Kvádr do skupiny (r > 0 = zaoblené hrany). */
export function boxer(g) {
  return (w, h, d, m, x, y, z, r = 0, parent = g) => {
    const me = new THREE.Mesh(r > 0 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d), m);
    me.position.set(x, y, z);
    parent.add(me);
    return me;
  };
}
/** Trubka mezi dvěma body (rámy kol, vzpěry). */
export function tube(a, b, r, m, seg = 8) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
  const me = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), seg), m);
  me.position.copy(A).addScaledVector(d, 0.5);
  me.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return me;
}
/** Bok z půdorysu: tvar (z, y) vytažený do šířky w (osa x) se zaoblenými hranami. */
export function sideExtrude(pts, w, bevel = 0.06, segs = 3) {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const depth = Math.max(0.01, w - bevel * 2);
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: segs, curveSegments: 8 })
    .rotateY(-Math.PI / 2).translate(depth / 2, 0, 0); // tvar x -> z, vytažení -> x (souměrně kolem 0)
}

// ---------- kola: pneumatika z profilu (zaoblený bok), terénní má hrubý vzorek; ráfek s paprsky a svítícím prstencem
const tyreCache = new Map();
/** Pneumatika kolem osy x: poloměr r, šířka w, výška boku (část poloměru); offroad = vyšší, širší a s bloky vzorku. */
export function tyreGeo(r, w, offroad = false, wallK = 0.3) {
  const key = `${r}|${w}|${offroad}|${wallK}`;
  if (tyreCache.has(key)) return tyreCache.get(key);
  const rr = offroad ? r * 1.06 : r, ww = offroad ? w * 1.18 : w, side = ww / 2, wall = rr * wallK;
  const prof = [[rr - wall, -side], [rr - wall * 0.25, -side], [rr - 0.02, -side * 0.8], [rr, -side * 0.45], [rr, side * 0.45], [rr - 0.02, side * 0.8], [rr - wall * 0.25, side], [rr - wall, side]];
  let geo = new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 28).rotateZ(Math.PI / 2);
  if (offroad) { // bloky vzorku po obvodu, střídavě vlevo a vpravo
    const parts = [geo], n = 18;
    for (let i = 0; i < n; i++) parts.push(new THREE.BoxGeometry(ww * 0.42, rr * 0.07, rr * 0.16).translate((i % 2 ? 1 : -1) * ww * 0.22, rr + rr * 0.02, 0).rotateX((i / n) * Math.PI * 2));
    geo = mergeGeos(parts) || geo;
  }
  tyreCache.set(key, geo);
  return geo;
}
/** Ráfek (disk s paprsky, osa x) jako jeden model; side = na kterou stranu kouká vnější strana (+1 / −1). */
export function rimGeo(r, w, spokes = 5, side = 1) {
  const parts = [new THREE.CylinderGeometry(r, r, w * 0.6, 20, 1, true).rotateZ(Math.PI / 2), new THREE.CylinderGeometry(r * 0.22, r * 0.22, w * 0.7, 12).rotateZ(Math.PI / 2)];
  for (let i = 0; i < spokes; i++) {
    const s = new THREE.BoxGeometry(w * 0.16, r * 0.92, r * 0.2).translate(side * w * 0.22, r * 0.5, 0);
    s.rotateX((i / spokes) * Math.PI * 2);
    parts.push(s);
  }
  return mergeGeos(parts);
}
/** Spojí geometrie do jedné (jen poloha, normála, uv). */
export function mergeGeos(list) {
  return mergeGeometries(list.map((p) => { const q = p.index ? p.toNonIndexed() : p; for (const k of Object.keys(q.attributes)) if (!['position', 'normal', 'uv'].includes(k)) q.deleteAttribute(k); return q; }));
}
/** Zrcadlová kopie geometrie (x -> −x) se správně otočenými trojúhelníky (aby šla spojit s ostatními díly). */
export function mirrorX(geo) {
  const q = (geo.index ? geo.toNonIndexed() : geo.clone()).scale(-1, 1, 1);
  for (const a of Object.values(q.attributes)) {
    const n = a.itemSize, arr = a.array;
    for (let i = 0; i + 3 * n <= arr.length; i += 3 * n) for (let k = 0; k < n; k++) { const t = arr[i + n + k]; arr[i + n + k] = arr[i + 2 * n + k]; arr[i + 2 * n + k] = t; }
  }
  return q;
}
/** Svítící prstenec na boku kola (osa x). */
export const hubRingGeo = (r, t = 0.012) => new THREE.TorusGeometry(r, t, 4, 24).rotateY(Math.PI / 2);

/** Klíč vzhledu: když se změní lak nebo vylepšení z garáže, model se postaví znovu. */
export const lookKey = (v) => `${v.color}|${v.mods?.offroad ? 1 : 0}${v.mods?.engine ? 1 : 0}${v.mods?.nitro > 0 ? 1 : 0}`;
/** Vylepšení, která jsou na modelu vidět (terénní pneumatiky, turbo, nitro). */
export const modsOf = (v) => ({ offroad: !!v?.mods?.offroad, turbo: !!v?.mods?.engine, nitro: (v?.mods?.nitro || 0) > 0 });
/** Každý snímek: světla (drl = LED denní svícení), podsvícení, trysky podle plynu a poziční světla letadla. */
export function animateLook(m, src, lights, engine, boost, dt) {
  if (m.head) { m.head.emissiveIntensity = lights ? 2.2 : m.drl ?? 0; m.tail.emissiveIntensity = lights ? 1.2 : 0.25; }
  if (m.under) m.under.emissiveIntensity += ((lights || Math.abs(src.spd || 0) > 0.3 ? 1.6 : 0.3) - m.under.emissiveIntensity) * Math.min(1, dt * 4);
  if (m.nozzles) { const t = (src.thr || 0) > 0 && engine ? 0.5 + 2.2 * src.thr + (boost ? 1.5 : 0) : 0.15; m.nozzles.emissiveIntensity += (t - m.nozzles.emissiveIntensity) * Math.min(1, dt * 5); }
  if (m.navs) m.navs.forEach((n, i) => (n.emissiveIntensity = lights ? (i === 2 && Math.sin(performance.now() / 300) < 0 ? 0 : 2) : 0)); // ocasní bliká
}
/** Bod, ze kterého šlehá nitro (u dvou trysek náhodně jedna). */
export const exhaustOf = (m, len) => (m.exhausts?.length ? m.exhausts[Math.floor(Math.random() * m.exhausts.length)] : m.exhaust || [0, 0.5, len / 2]);
