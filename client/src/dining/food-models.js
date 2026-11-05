// 3D modely jídel a předmětů z ikon.
import './dine-view.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as THREE from 'three';
import { clamp, hash2, lerp, smoothstep } from '../../../shared/util.js';
import { ICONS, iconCanvas } from '../render/icons.js';
import { DINE_BITES, ceramicMat, foodColor, foodG, part } from './dine-view.js';

// ============================================================ realistické 3D modely jídel
// Každé jídlo je složené z kousků (dílky pizzy, plátky masa…). Při jedení kousky postupně mizí.
// Rozměry odpovídají talíři o poloměru 0,17 (na stole se zvětší).
const dishTexCache = {};
function dishTex(name, fn) {
  if (dishTexCache[name]) return dishTexCache[name];
  const N = 64, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const [r, gg, b] = fn(x, y);
    img.data.set([clamp(r, 0, 255), clamp(gg, 0, 255), clamp(b, 0, 255), 255], (y * N + x) * 4);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return (dishTexCache[name] = t);
}
const nz = (x, y, s) => hash2(x * 7 + s, y * 13 - s);
// hrubší měkké skvrny (interpolovaný šum, opakuje se po 64 px)
const blob = (x, y, s, k) => {
  const c = 1 << k, m = 64 >> k, fx = x / c, fy = y / c, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = smoothstep(0, 1, fx - x0), ty = smoothstep(0, 1, fy - y0);
  const h = (a, b) => nz(((a % m) + m) % m, ((b % m) + m) % m, s);
  return lerp(lerp(h(x0, y0), h(x0 + 1, y0), tx), lerp(h(x0, y0 + 1), h(x0 + 1, y0 + 1), tx), ty);
};
const TX = {
  crust: () => dishTex('crust', (x, y) => { const v = 0.8 + nz(x, y, 1) * 0.3 - (blob(x, y, 2, 2) > 0.86 ? 0.35 : 0); return [190 * v, 112 * v, 48 * v]; }),
  cheese: () => dishTex('cheese', (x, y) => {
    if (blob(x, y, 4, 1) > 0.93) return [140, 70, 20]; // propečené skvrny
    if (blob(x, y, 30, 3) > 0.72) return [150, 25, 10]; // prosvítající rajčatový základ
    const v = 0.88 + nz(x, y, 5) * 0.15;
    return blob(x, y, 3, 2) > 0.5 ? [240 * v, 160 * v, 38 * v] : [225 * v, 125 * v, 20 * v];
  }),
  sauce: () => dishTex('sauce', (x, y) => { const v = 0.75 + nz(x, y, 9) * 0.35; return [150 * v, 22 * v, 10 * v]; }),
  crumb: () => dishTex('crumb', (x, y) => { const r = nz(x, y, 6); const v = r > 0.85 ? 1.22 : r < 0.12 ? 0.6 : 0.88 + r * 0.22; return [180 * v, 102 * v, 30 * v]; }),
  seared: () => dishTex('seared', (x, y) => { if ((x + y) % 16 < 2) return [38, 18, 8]; const v = 0.7 + nz(x, y, 7) * 0.4; return [92 * v, 44 * v, 20 * v]; }),
  meatcut: () => dishTex('meatcut', (x, y) => { const d = Math.abs(y - 31.5) / 32, v = 0.9 + nz(x, y, 8) * 0.15; return d > 0.72 ? [80 * v, 38 * v, 18 * v] : d > 0.55 ? [150 * v, 72 * v, 55 * v] : [180 * v, 72 * v, 75 * v]; }),
  pastry: () => dishTex('pastry', (x, y) => { const v = (blob(x, y, 31, 2) > 0.7 ? 0.75 : 1) * (0.88 + nz(x, y, 10) * 0.2); return [200 * v, 135 * v, 62 * v]; }),
  // řez štrúdlem: spirála těsta s jablečnou náplní
  swirl: () => dishTex('swirl', (x, y) => {
    const dx = x - 31.5, dy = y - 31.5, r = Math.hypot(dx, dy) / 32, a = Math.atan2(dy, dx);
    if (r > 0.86) return [190, 125, 55];
    const t = (r * 4 - a / (Math.PI * 2) + 10) % 1, v = 0.9 + nz(x, y, 32) * 0.15;
    return t < 0.3 ? [235 * v, 200 * v, 140 * v] : nz(x, y, 33) > 0.85 ? [110, 60, 25] : [225 * v, 185 * v, 90 * v];
  }),
  dumpling: () => dishTex('dumpling', (x, y) => { const v = nz(x, y, 11) > 0.88 ? 0.82 : 0.96 + nz(x, y, 12) * 0.06; return [242 * v, 236 * v, 218 * v]; }),
  potato: () => dishTex('potato', (x, y) => { const v = 0.85 + nz(x, y, 13) * 0.25 - (blob(x, y, 14, 2) > 0.85 ? 0.25 : 0); return [212 * v, 150 * v, 58 * v]; }),
  skin: () => dishTex('skin', (x, y) => { const v = 0.75 + nz(x, y, 15) * 0.35 - (blob(x, y, 16, 2) > 0.8 ? 0.2 : 0); return [170 * v, 92 * v, 32 * v]; }),
  fish: () => dishTex('fish', (x, y) => { const v = 0.8 + nz(x, y, 17) * 0.3; return (x + (y >> 2)) % 9 < 2 ? [120 * v, 80 * v, 40 * v] : [200 * v, 140 * v, 70 * v]; }),
  rice: () => dishTex('rice', (x, y) => { const v = (x + y * 3) % 5 < 1 ? 0.85 : 0.97 + nz(x, y, 18) * 0.03; return [250 * v, 248 * v, 238 * v]; }),
  salmon: () => dishTex('salmon', (x, y) => ((x + y) % 10 < 2 ? [250, 210, 190] : [245, 120 + nz(x, y, 19) * 20, 80])),
  bun: () => dishTex('bun', (x, y) => { const v = 0.85 + nz(x, y, 20) * 0.2; return nz(x, y, 21) > 0.95 ? [255, 248, 225] : [185 * v, 108 * v, 38 * v]; }),
  broth: () => dishTex('broth', (x, y) => { const fat = blob(x, y, 22, 3) > 0.8 && nz(x, y, 23) > 0.3; const v = 0.9 + nz(x, y, 24) * 0.1; return fat ? [250, 220, 120] : [225 * v, 170 * v, 70 * v]; }),
  goulash: () => dishTex('goulash', (x, y) => { const v = 0.75 + nz(x, y, 25) * 0.3; return blob(x, y, 26, 3) > 0.75 ? [150 * v, 50 * v, 20 * v] : [120 * v, 38 * v, 15 * v]; }),
  mash: () => dishTex('mash', (x, y) => { const v = 0.92 + nz(x, y, 27) * 0.1; return [245 * v, 228 * v, 180 * v]; }),
};
const MM = (o) => new THREE.MeshStandardMaterial({ roughness: 0.65, ...(o.map ? { bumpMap: o.map, bumpScale: 1.5 } : {}), ...o }); // textura zároveň dává hrbolatý povrch
const mesh = (geo, mat, x = 0, y = 0, z = 0, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (parent) parent.add(m); return m; };
// Hrbolatost pro malé předměty (šum v jemném měřítku)
function lumpyGeo(geo, amt, seed) {
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 90 + seed) * Math.sin(v.y * 70 + seed * 1.7) * Math.sin(v.z * 80 + seed * 0.7);
    v.x *= 1 + n * amt; v.z *= 1 + n * amt; v.y *= 1 + n * amt * 0.5;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}
// Kousky se ubírají postupně; viditelných zůstane tolik, kolik odpovídá zbytku jídla.
const piecesState = (pieces, extra = {}) => ({
  pieces,
  consume(frac) { pieces.forEach((p, i) => (p.visible = i < Math.round(pieces.length * frac))); },
  next() { for (let i = pieces.length - 1; i >= 0; i--) if (pieces[i].visible) return pieces[i]; return null; }, // kousek, který se sní příště
  ...extra,
});
// Plát masa nakrájený na plátky: vnější strany opečené, řezy růžové
function slicedMeat(parent, w, h, d, n, sideTex = 'meatcut', topTex = 'seared') {
  const pieces = [], seared = MM({ map: TX[topTex](), roughness: 0.55 }), cut = MM({ map: TX[sideTex](), roughness: 0.6 });
  for (let i = 0; i < n; i++) {
    const mats = [cut, cut, seared, seared, seared, seared];
    if (i === 0) mats[1] = seared;
    if (i === n - 1) mats[0] = seared;
    const sw = w / n;
    const p = mesh(new RoundedBoxGeometry(sw * 0.86, h, d, 2, Math.min(sw, h) * 0.18), mats, -w / 2 + sw * (i + 0.5) + i * 0.006, h / 2 + 0.01, (i % 2) * 0.006, parent);
    p.rotation.set(0, (i % 2 ? 1 : -1) * 0.06, -0.12);
    pieces.push(p);
  }
  return pieces.reverse(); // jí se od kraje
}
const lemon = (parent, x, z) => {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.012, 16, 1, false, 0, Math.PI), MM({ color: 0xf6e04a, roughness: 0.4 }), 0, 0, 0, g);
  g.rotation.y = x * 9;
  g.position.set(x, 0.014, z);
  parent.add(g);
};
const herb = (parent, x, z, y = 0.03) => { const m = mesh(new THREE.BoxGeometry(0.02, 0.003, 0.01), MM({ color: 0x2a8a2a }), x, y, z, parent); m.rotation.y = x * 20; };

const DISHES = {
  pizza(p) {
    const pieces = [], crust = MM({ map: TX.crust() }), cheese = MM({ map: TX.cheese(), roughness: 0.45 }), sauce = MM({ map: TX.sauce(), roughness: 0.4 });
    const mush = MM({ color: 0x9a8064 }), salami = MM({ color: 0x9a1e10, roughness: 0.4 });
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Group(), a0 = (i / 8) * Math.PI * 2 + Math.PI * 0.75, a = Math.PI / 4 - 0.02; // poslední dílky zůstanou na vzdálenější straně talíře
      mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.01, 10, 1, false, a0, a), crust, 0, 0.012, 0, s);
      mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.003, 10, 1, false, a0, a), sauce, 0, 0.018, 0, s);
      mesh(new THREE.CylinderGeometry(0.128, 0.128, 0.004, 10, 1, false, a0, a), cheese, 0, 0.021, 0, s);
      const rimG = new THREE.Group(); // nafouklý okraj nad obloukem dílku
      mesh(new THREE.TorusGeometry(0.143, 0.009, 6, 8, a), crust, 0, 0, 0, rimG).rotation.x = -Math.PI / 2;
      rimG.rotation.y = a0 - Math.PI / 2;
      rimG.position.y = 0.018;
      s.add(rimG);
      const am = a0 + a / 2, cs = Math.sin(am), cc = Math.cos(am);
      mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.004, 14), salami, cs * 0.095, 0.025, cc * 0.095, s);
      const m1 = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.004, 10, 1, false, 0, Math.PI), mush, cs * 0.05, 0.026, cc * 0.05, s);
      m1.rotation.y = a0;
      if (i % 2 === 0) herb(s, cs * 0.1, cc * 0.1, 0.026);
      p.add(s);
      pieces.push(s);
    }
    return piecesState(pieces);
  },
  schnitzel(p) {
    // Nepravidelný obalovaný plátek nakrájený na proužky + citron
    const pieces = [], crumb = MM({ map: TX.crumb(), roughness: 0.8 });
    const n = 4, rx = 0.11, rz = 0.075;
    for (let i = 0; i < n; i++) {
      const x0 = -rx + (2 * rx * i) / n, x1 = -rx + (2 * rx * (i + 1)) / n - 0.004, pts = [];
      for (let k = 0; k <= 8; k++) { const x = x0 + ((x1 - x0) * k) / 8; pts.push(new THREE.Vector2(x, rz * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2)) * (0.92 + Math.sin(x * 80) * 0.08))); }
      for (let k = 8; k >= 0; k--) { const x = x0 + ((x1 - x0) * k) / 8; pts.push(new THREE.Vector2(x, -rz * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2)) * (0.92 + Math.cos(x * 70) * 0.08))); }
      const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2 });
      geo.rotateX(Math.PI / 2);
      const m = mesh(geo, crumb, 0, 0.026, 0, p);
      pieces.push(m);
    }
    lemon(p, 0.12, 0.06);
    herb(p, 0.1, -0.07);
    return piecesState(pieces.reverse());
  },
  steak(p) {
    const pieces = slicedMeat(p, 0.17, 0.035, 0.1, 4);
    const butter = mesh(new RoundedBoxGeometry(0.03, 0.012, 0.03, 2, 0.004), MM({ color: 0xffe68a, roughness: 0.3 }), 0.02, 0.052, 0, p);
    pieces[pieces.length - 1].attach(butter);
    herb(p, -0.06, 0.07);
    return piecesState(pieces);
  },
  pancakes(p) {
    const pieces = [], m = MM({ map: TX.crust() });
    for (let i = 0; i < 3; i++) pieces.push(mesh(new THREE.CylinderGeometry(0.1 - i * 0.004, 0.1 - i * 0.004, 0.009, 28), m, (i - 1) * 0.004, 0.014 + i * 0.01, 0, p));
    const syrup = mesh(new THREE.CylinderGeometry(0.07, 0.075, 0.003, 24), MM({ color: 0x8a4a12, roughness: 0.15, transparent: true, opacity: 0.85 }), 0, 0.047, 0);
    pieces[2].attach(syrup);
    return piecesState(pieces);
  },
  berry_pancakes(p) {
    const pieces = [], m = MM({ map: TX.crust() }), berry = MM({ color: 0x2a3aa8, roughness: 0.3 });
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Group();
      const roll = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.15, 16), m, 0, 0, 0, r);
      roll.rotation.z = Math.PI / 2;
      for (let k = 0; k < 4; k++) mesh(new THREE.SphereGeometry(0.008, 8, 6), berry, -0.05 + k * 0.03, 0.024, 0, r);
      r.position.set(0, 0.03, -0.05 + i * 0.05);
      p.add(r);
      pieces.push(r);
    }
    return piecesState(pieces);
  },
  strudel(p) {
    const pieces = [], m = MM({ map: TX.pastry() }), cutM = MM({ map: TX.swirl(), roughness: 0.5 }), sugar = MM({ color: 0xffffff, roughness: 0.9 });
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Group();
      const c = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.042, 18), [m, cutM, cutM], 0, 0, 0, s);
      c.rotation.z = Math.PI / 2;
      c.scale.z = 0.75;
      for (let k = 0; k < 6; k++) mesh(new THREE.SphereGeometry(0.0035, 4, 3), sugar, (nz(i, k, 3) - 0.5) * 0.04, 0.03, (nz(k, i, 4) - 0.5) * 0.03, s);
      s.position.set(-0.08 + i * 0.054, 0.035, 0);
      s.rotation.y = (i % 2 ? 1 : -1) * 0.1;
      p.add(s);
      pieces.push(s);
    }
    return piecesState(pieces.reverse());
  },
  pork_dumplings(p) {
    const sauceM = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.004, 24), MM({ color: 0x7a3a14, roughness: 0.25 }), 0.02, 0.011, 0.01, p);
    sauceM.scale.z = 0.7;
    const meat = slicedMeat(p, 0.1, 0.022, 0.07, 3);
    meat.forEach((m) => { m.position.x -= 0.045; m.position.z -= 0.03; });
    const dm = MM({ map: TX.dumpling(), roughness: 0.8 }), pieces = [...meat];
    for (let i = 0; i < 4; i++) {
      const d = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.014, 18), dm, 0.04 + (i % 2) * 0.05, 0.022, 0.03 + Math.floor(i / 2) * 0.045 - 0.04, p);
      d.rotation.x = 0.15;
      pieces.push(d);
    }
    return piecesState(pieces);
  },
  mutton_potatoes(p) {
    const pieces = slicedMeat(p, 0.09, 0.04, 0.07, 2);
    pieces.forEach((m) => (m.position.x -= 0.04));
    const pm = MM({ map: TX.potato(), roughness: 0.5 });
    for (let i = 0; i < 3; i++) {
      const h = mesh(new THREE.SphereGeometry(0.028, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), pm, 0.05 + (i % 2) * 0.03, 0.01, -0.04 + i * 0.04, p);
      pieces.push(h);
    }
    herb(p, -0.02, 0.06);
    return piecesState(pieces);
  },
  roast_chicken(p) {
    const skin = MM({ map: TX.skin(), roughness: 0.35 }), bone = MM({ color: 0xf2ead8 });
    const pieces = [];
    const body = mesh(lumpyGeo(new THREE.SphereGeometry(0.06, 18, 14), 0.04, 6), skin, 0, 0.05, 0, p);
    body.scale.set(1.3, 0.8, 1);
    for (const s of [-1, 1]) {
      const leg = new THREE.Group();
      const th = mesh(new THREE.SphereGeometry(0.03, 12, 10), skin, 0, 0, 0, leg);
      th.scale.set(1.4, 0.9, 1);
      mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.04, 6), bone, 0.045, 0.01, 0, leg).rotation.z = -1.2;
      leg.position.set(0.05, 0.035, s * 0.05);
      leg.rotation.y = s * 0.5;
      p.add(leg);
      pieces.push(leg);
    }
    pieces.push(body);
    lemon(p, -0.1, 0.07);
    return piecesState(pieces.reverse());
  },
  fried_trout(p) {
    const skin = MM({ map: TX.fish(), roughness: 0.4 }), pieces = [];
    for (let i = 0; i < 3; i++) {
      // tři překrývající se díly jednoho štíhlého těla (hlava, střed, ocasní část)
      const seg = mesh(new THREE.SphereGeometry(0.05, 20, 12), skin, -0.065 + i * 0.055, 0.026, 0, p);
      seg.scale.set(1.25 - Math.abs(i - 1) * 0.15, 0.38, 0.62 - i * 0.12);
      pieces.push(seg);
    }
    const tail = mesh(new THREE.ConeGeometry(0.032, 0.05, 4), skin, 0.12, 0.026, 0, p);
    tail.rotation.z = Math.PI / 2;
    tail.scale.y = 0.3;
    pieces[2].attach(tail);
    const eye = mesh(new THREE.SphereGeometry(0.005, 8, 6), MM({ color: 0x111111, roughness: 0.1 }), -0.1, 0.036, 0.018, p);
    pieces[0].attach(eye);
    lemon(p, -0.02, 0.08);
    herb(p, 0.05, -0.06);
    return piecesState(pieces);
  },
  fried_egg(p) {
    const white = MM({ color: 0xfbfbf6, roughness: 0.35 }), pieces = [];
    for (let i = 0; i < 3; i++) {
      const w = mesh(lumpyGeo(new THREE.CylinderGeometry(0.075, 0.075, 0.008, 20, 1, false, (i / 3) * Math.PI * 2, (Math.PI * 2) / 3 - 0.03), 0.08, 3 + i), white, 0, 0.013, 0, p);
      pieces.push(w);
    }
    const yolk = mesh(new THREE.SphereGeometry(0.028, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), MM({ color: 0xffa818, roughness: 0.15 }), 0.01, 0.016, 0.005, p);
    yolk.scale.y = 0.7;
    pieces[0].attach(yolk);
    return piecesState(pieces);
  },
  eggs_bacon(p) {
    const st = DISHES.fried_egg(p);
    st.pieces.forEach((w) => { w.position.x -= 0.04; w.scale.setScalar(0.8); });
    const bacon = MM({ color: 0xa8402a, roughness: 0.5 }), fat = MM({ color: 0xf2dcc8, roughness: 0.5 });
    for (let i = 0; i < 2; i++) {
      const b = new THREE.Group();
      for (let k = 0; k < 6; k++) {
        const seg = mesh(new THREE.BoxGeometry(0.02, 0.005, 0.022), k % 2 ? bacon : fat, -0.05 + k * 0.019, 0.016 + Math.sin(k * 1.4) * 0.006, 0, b);
        seg.rotation.z = Math.cos(k * 1.4) * 0.4;
      }
      b.position.set(0.06, 0, -0.035 + i * 0.05);
      b.rotation.y = 1.4;
      p.add(b);
      st.pieces.push(b);
    }
    return st;
  },
  baked_potato(p) {
    const pm = MM({ map: TX.potato(), roughness: 0.5 }), skin = MM({ color: 0x6a4420, roughness: 0.8 }), pieces = [];
    for (const s of [-1, 1]) {
      const h = new THREE.Group();
      mesh(new THREE.SphereGeometry(0.045, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), skin, 0, 0.04, 0, h);
      const top = mesh(new THREE.CircleGeometry(0.044, 16).rotateX(-Math.PI / 2), pm, 0, 0.041, 0, h);
      top.scale.z = 0.9;
      mesh(new RoundedBoxGeometry(0.02, 0.01, 0.02, 2, 0.004), MM({ color: 0xffe68a, roughness: 0.3 }), 0, 0.046, 0, h);
      h.position.set(s * 0.05, 0, 0);
      p.add(h);
      pieces.push(h);
    }
    return piecesState(pieces);
  },
  dumplings(p) {
    const dm = MM({ map: TX.dumpling(), roughness: 0.8 }), pieces = [];
    for (let i = 0; i < 5; i++) {
      const d = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.014, 18), dm, -0.08 + i * 0.04, 0.03, 0, p);
      d.rotation.z = 1.2;
      pieces.push(d);
    }
    return piecesState(pieces.reverse());
  },
  fries(p) {
    const cone = mesh(new THREE.CylinderGeometry(0.06, 0.035, 0.09, 16, 1, true), MM({ color: 0xe8e2d0, side: THREE.DoubleSide, roughness: 0.9 }), 0, 0.055, 0, p);
    cone.rotation.x = -0.35;
    const fry = MM({ map: TX.potato(), roughness: 0.45 }), pieces = [];
    for (let k = 0; k < 4; k++) {
      const bunch = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const f = mesh(new THREE.BoxGeometry(0.008, 0.07, 0.008), fry, (nz(i, k, 1) - 0.5) * 0.07, 0.09 + nz(k, i, 2) * 0.02, (nz(i + 3, k, 3) - 0.5) * 0.06, bunch);
        f.rotation.set((nz(i, k, 4) - 0.5) * 0.5, 0, (nz(k, i, 5) - 0.5) * 0.5);
      }
      bunch.rotation.x = -0.35;
      p.add(bunch);
      pieces.push(bunch);
    }
    return piecesState(pieces);
  },
  mushroom_fry(p) {
    const m = MM({ color: 0x8a6438, roughness: 0.6 }), egg = MM({ color: 0xffd860, roughness: 0.5 }), pieces = [];
    for (let k = 0; k < 4; k++) {
      const c = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const sl = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.004, 10, 1, false, 0, Math.PI), i % 3 ? m : egg, (nz(i, k, 6) - 0.5) * 0.05, 0.016 + i * 0.002, (nz(k, i, 7) - 0.5) * 0.05, c);
        sl.rotation.set(nz(i, k, 8), nz(k, i, 9) * 6, 0);
      }
      c.position.set(Math.cos(k * 1.57) * 0.05, 0, Math.sin(k * 1.57) * 0.05);
      p.add(c);
      pieces.push(c);
    }
    return piecesState(pieces);
  },
  scrambled_eggs(p) {
    const m = MM({ color: 0xffd84a, roughness: 0.55 }), pieces = [];
    for (let i = 0; i < 6; i++) {
      const l = mesh(lumpyGeo(new THREE.IcosahedronGeometry(0.025, 2), 0.25, i + 1), m, Math.cos(i) * 0.05, 0.022, Math.sin(i * 1.3) * 0.05, p);
      l.scale.y = 0.6;
      pieces.push(l);
    }
    herb(p, 0, 0, 0.04);
    return piecesState(pieces);
  },
  fruit_salad(p) {
    const bowl = mesh(new THREE.SphereGeometry(0.1, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), ceramicMat.clone(), 0, 0.085, 0, p);
    bowl.material.side = THREE.DoubleSide;
    const cols = [0xd8202a, 0x8ac040, 0x2a3aa8, 0xf0e0a0], pieces = [];
    for (let k = 0; k < 4; k++) {
      const c = new THREE.Group();
      for (let i = 0; i < 5; i++) mesh(i % 2 ? new THREE.SphereGeometry(0.009, 8, 6) : new THREE.BoxGeometry(0.016, 0.016, 0.016), MM({ color: cols[(i + k) % 4], roughness: 0.35 }), (nz(i, k, 1) - 0.5) * 0.1, 0.06 + nz(k, i, 2) * 0.012, (nz(i + 2, k, 3) - 0.5) * 0.1, c);
      p.add(c);
      pieces.push(c);
    }
    return piecesState(pieces);
  },
  nigiri(p) {
    const rice = MM({ map: TX.rice(), roughness: 0.7 }), fish = MM({ map: TX.salmon(), roughness: 0.3 }), pieces = [];
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      mesh(new RoundedBoxGeometry(0.06, 0.025, 0.035, 2, 0.01), rice, 0, 0.022, 0, g);
      mesh(new RoundedBoxGeometry(0.07, 0.01, 0.04, 2, 0.004), fish, 0, 0.04, 0, g);
      g.position.set(0, 0, -0.03 + i * 0.06);
      p.add(g);
      pieces.push(g);
    }
    return piecesState(pieces);
  },
  hamburger(p) {
    const bun = MM({ map: TX.bun(), roughness: 0.5 }), g = new THREE.Group();
    mesh(new THREE.CylinderGeometry(0.06, 0.058, 0.02, 24), bun, 0, 0.02, 0, g);
    mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.016, 24), MM({ map: TX.seared() }), 0, 0.038, 0, g);
    const ch = mesh(new THREE.BoxGeometry(0.1, 0.004, 0.1), MM({ color: 0xffc830, roughness: 0.4 }), 0, 0.048, 0, g);
    ch.rotation.y = 0.4;
    mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.006, 20), MM({ color: 0xd8302a, roughness: 0.35 }), 0, 0.054, 0, g);
    mesh(lumpyGeo(new THREE.CylinderGeometry(0.066, 0.066, 0.005, 20), 0.15, 2), MM({ color: 0x5ab83a, roughness: 0.6 }), 0, 0.06, 0, g);
    const top = mesh(new THREE.SphereGeometry(0.06, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), bun, 0, 0.062, 0, g);
    top.scale.y = 0.6;
    p.add(g);
    return piecesState([g]);
  },
  bread(p) {
    const loaf = mesh(lumpyGeo(new THREE.SphereGeometry(0.08, 24, 14), 0.04, 3), MM({ map: TX.crust(), roughness: 0.6 }), 0, 0.045, 0, p);
    loaf.scale.set(1.3, 0.62, 0.9);
    return piecesState([loaf]);
  },
};
// Masa z táboráku a ostatní pečeně = plátky masa
for (const id of ['cooked_mutton', 'cooked_pork', 'cooked_venison', 'meat']) DISHES[id] = (p) => piecesState(slicedMeat(p, 0.14, 0.03, 0.09, 3));

// Polévky v míse: hladina s texturou a plovoucími kousky; lžící hladina klesá.
const SOUPS = {
  goulash: { tex: 'goulash', chunks: [0x5a2410, 0x6a3018, 0xe8c070] },
  venison_goulash: { tex: 'goulash', chunks: [0x3a1a0c, 0x8a6438, 0x8a6438] },
  chicken_soup: { tex: 'broth', chunks: [0xf0e0c0, 0xf08a30, 0xf6eccc] },
  bone_broth: { tex: 'broth', chunks: [0xf6e0a0] },
  tomato_sauce: { tex: 'sauce', chunks: [0xa01810] },
  mashed_potatoes: { mound: true },
  cooked_rice: { mound: true, tex: 'rice' },
};
function buildSoup(p, id) {
  const def = SOUPS[id];
  const bowl = mesh(new THREE.SphereGeometry(0.12, 28, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), ceramicMat.clone(), 0, 0.1, 0, p);
  bowl.material.side = THREE.DoubleSide;
  if (def.mound) {
    const mound = mesh(lumpyGeo(new THREE.SphereGeometry(0.095, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), 0.06, 4), MM({ map: TX[def.tex || 'mash'](), roughness: 0.8 }), 0, 0.03, 0, p);
    mound.scale.y = 0.7;
    if (id === 'mashed_potatoes') { const b = mesh(new RoundedBoxGeometry(0.03, 0.01, 0.03, 2, 0.004), MM({ color: 0xffe68a, roughness: 0.2 }), 0, 0.098, 0, p); mound.attach(b); }
    return { mat: mound.material, next: () => null, consume(frac) { mound.scale.set(0.35 + 0.65 * frac, (0.35 + 0.65 * frac) * 0.7, 0.35 + 0.65 * frac); mound.position.y = 0.03 - (1 - frac) * 0.03; } };
  }
  const surf = mesh(new THREE.CircleGeometry(0.11, 28).rotateX(-Math.PI / 2), MM({ map: TX[def.tex](), roughness: 0.15 }), 0, 0.085, 0, p);
  const chunks = [];
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4, r = 0.02 + (i % 3) * 0.025;
    const c = mesh(i % 2 ? new THREE.BoxGeometry(0.016, 0.01, 0.014) : new THREE.CylinderGeometry(0.009, 0.009, 0.005, 10), MM({ color: def.chunks[i % def.chunks.length], roughness: 0.5 }), Math.cos(a) * r, 0.088, Math.sin(a) * r, p);
    c.rotation.y = a;
    chunks.push(c);
  }
  return {
    mat: surf.material,
    next: () => null,
    consume(frac) {
      const y = 0.085 - (1 - frac) * 0.06, rr = (Math.sqrt(Math.max(0, 0.12 ** 2 - (0.1 - y) ** 2)) * 0.95) / 0.11; // užší hladina níž v míse
      surf.position.y = y;
      surf.scale.setScalar(Math.min(1, rr));
      chunks.forEach((c, i) => { c.position.y = y + 0.003; c.visible = i < Math.round(chunks.length * frac); });
    },
  };
}
// Rozhodne, jestli má jídlo vlastní realistický model; když ano, postaví ho.
function buildDish(parent, id) {
  if (SOUPS[id]) { const st = buildSoup(parent, id); st.consume(1); return st; }
  if (!DISHES[id]) return null;
  const st = DISHES[id](parent);
  // materiál pro sousto: první materiál z jídla
  st.next()?.traverse((o) => { if (o.isMesh && !st.mat) st.mat = Array.isArray(o.material) ? o.material[0] : o.material; });
  return st;
}
// Střed dalšího kousku v souřadnicích talíře (kam míří příbor)
export function dishCenter(dish, plate) {
  const piece = dish.next();
  if (!piece) return new THREE.Vector3(0, 0.04, 0);
  plate.updateWorldMatrix(true, true);
  const c = new THREE.Box3().setFromObject(piece).getCenter(new THREE.Vector3());
  return plate.worldToLocal(c);
}
// Sousto = zmenšená kopie dalšího kousku (dílek pizzy, plátek masa…)
export function dishMorsel(dish, plate, into) {
  const piece = dish.next();
  if (!piece) return null;
  plate.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(piece), size = box.getSize(new THREE.Vector3());
  const c = plate.worldToLocal(box.getCenter(new THREE.Vector3()));
  const w = new THREE.Group(), copy = piece.clone();
  copy.position.sub(c);
  w.add(copy);
  // velikost v souřadnicích talíře (box je ve světových, talíř může být zmenšený)
  const k = plate.getWorldScale(new THREE.Vector3()).x;
  w.scale.setScalar(Math.min(1, 0.045 / (Math.max(size.x, size.y, size.z) / k)));
  into.add(w);
  piece.visible = false;
  return w;
}

// 3D model jídla podle stylu (do talíře před očima i na stůl). Ostatní jídla = ikona vytlačená do 3D.
export function buildFoodInto(parent, id, style) {
  const col = foodColor(id), mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 });
  const dish = buildDish(parent, id);
  if (dish) return { mat: dish.mat || mat, pieces: [], dish };
  const state = { mat, pieces: [] };
  if (style === 'twirl') {
    const pasta = new THREE.MeshStandardMaterial({ color: 0xf0cf78, roughness: 0.5 });
    const nest = new THREE.Group();
    for (let i = 0; i < 34; i++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.03 + Math.random() * 0.06, 0.0035, 5, 28), pasta);
      t.rotation.set(Math.PI / 2 + (Math.random() - 0.5) * 0.5, 0, Math.random() * 6);
      t.position.set((Math.random() - 0.5) * 0.04, 0.012 + Math.random() * 0.02, (Math.random() - 0.5) * 0.04);
      nest.add(t);
    }
    const sauce = part(new THREE.SphereGeometry(0.042, 14, 10), new THREE.MeshStandardMaterial({ color: 0xb0200f, roughness: 0.35 }), 0, 0.028, 0, nest);
    sauce.scale.set(1.15, 0.22, 1);
    part(new THREE.BoxGeometry(0.025, 0.003, 0.012), new THREE.MeshStandardMaterial({ color: 0x2a8a2a }), 0.01, 0.05, 0.005, nest);
    parent.add(nest);
    state.main = nest;
  } else if (style === 'spoon') {
    const bowl = part(new THREE.SphereGeometry(0.12, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), ceramicMat.clone(), 0, 0.1, 0, parent);
    bowl.material.side = THREE.DoubleSide;
    const soup = part(new THREE.CircleGeometry(0.11, 24).rotateX(-Math.PI / 2), mat, 0, 0.085, 0, parent);
    state.main = soup;
  } else if (style === 'cut') {
    const slab = part(new RoundedBoxGeometry(0.2, 0.04, 0.14, 2, 0.015), mat, 0, 0.028, 0, parent);
    if (/steak|cooked_|meat|roast/.test(id)) for (let i = 0; i < 4; i++) { // proužky z grilu
      const line = part(new THREE.BoxGeometry(0.012, 0.004, 0.13), new THREE.MeshStandardMaterial({ color: 0x2a140a, roughness: 0.8 }), -0.06 + i * 0.04, 0.021, 0, slab);
      line.rotation.y = 0.5;
    }
    state.main = slab;
  } else if (style === 'icon') {
    const m = iconVoxels(id, 0.016);
    m.rotation.x = -0.25;
    m.position.set(0, 0.13, 0);
    parent.add(m);
    state.main = m;
  } else {
    const n = DINE_BITES[id] || 3, maki = style === 'chop';
    for (let i = 0; i < Math.max(n, 3); i++) {
      const p = new THREE.Group();
      if (maki) {
        part(new THREE.CylinderGeometry(0.022, 0.022, 0.028, 16), new THREE.MeshStandardMaterial({ color: 0x14221a }), 0, 0, 0, p);
        part(new THREE.CylinderGeometry(0.018, 0.018, 0.0285, 16), new THREE.MeshStandardMaterial({ color: 0xf6f6f0 }), 0, 0, 0, p);
        part(new THREE.CylinderGeometry(0.008, 0.008, 0.029, 10), new THREE.MeshStandardMaterial({ color: 0xf07a4a }), 0, 0, 0, p);
      } else part(new RoundedBoxGeometry(0.035, 0.025, 0.03, 2, 0.008), mat, 0, 0, 0, p);
      const a = (i / Math.max(n, 3)) * Math.PI * 2;
      p.position.set(Math.cos(a) * 0.075, 0.022, Math.sin(a) * 0.06);
      parent.add(p);
      state.pieces.push(p);
    }
  }
  return state;
}
export function buildPlateFood(id, style) { foodG.clear(); return buildFoodInto(foodG, id, style); }
// Ikona 16×16 vytlačená do 3D (každý pixel = kostička), jako předměty v Minecraftu.
export function iconVoxels(id, px = 0.02) {
  const voxelCache = (iconVoxels.cache ||= {}); // funkce se volá i dřív, než by se inicializovala konstanta
  let data = voxelCache[id];
  if (!data) {
    let src = ICONS[id].canvas;
    if (src.width !== 16) { // větší ikona (3D ikona bloku): zmenšit na 16×16
      const c = iconCanvas();
      c.width = c.height = 16;
      c.getContext('2d').drawImage(src, 0, 0, 16, 16);
      src = c;
    }
    const d = src.getContext('2d').getImageData(0, 0, 16, 16).data;
    data = voxelCache[id] = [];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const i = (y * 16 + x) * 4;
      if (d[i + 3] > 128) data.push([x, y, new THREE.Color(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255).convertSRGBToLinear()]);
    }
  }
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(px, px, px * 1.6), new THREE.MeshStandardMaterial({ roughness: 0.7 }), data.length);
  const o = new THREE.Object3D();
  data.forEach(([x, y, c], i) => {
    o.position.set((x - 7.5) * px, (7.5 - y) * px, 0);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
    mesh.setColorAt(i, c);
  });
  return mesh;
}
