// 3D modely tvorů (jen vzhled; chování je v shared/sim/mobs.js, animace v mobs.js).
// Hranaté jako v Hytale: kvádry se zaoblenými hranami, srst / vlna / peří s normálovými mapami, oči s odleskem,
// hlava na kloubu (sleduje hráče, pase se), uši, ocas, křídla. Nepřátelé mají svítící oči.
// Bez vedlejších účinků při načtení (textury se vyrobí až při prvním tvorovi).
import * as THREE from 'three';
import { RIM, addRim, animateCharacter, armorMat, blobShadow, buildCharacter, crackTex, mergeStatic, rbox, setCharacterArmor, skinRig } from '../render/character.js';

export { RIM };

// ============================================================ textury srsti: barva + normálová mapa (výška → sklon)
const texCache = {};
// nejtmavší místo textury (0–255) a síla normálové mapy podle druhu: jemná srst, výraznější vlna a kámen
const LO = { wool: 185, fur: 195, hide: 228, feather: 215, skin: 200, stone: 150 };
const BUMP = { wool: 1, fur: 0.7, hide: 0.3, feather: 0.45, skin: 0.6, stone: 1 };
function furTextures(kind) {
  if (texCache[kind]) return texCache[kind];
  const N = 64, h = new Float32Array(N * N);
  let s = { wool: 3, fur: 7, hide: 11, feather: 13, skin: 17, stone: 19 }[kind] || 1;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const add = (x, y, v) => { x = ((x % N) + N) % N; y = ((y % N) + N) % N; h[y * N + x] = Math.max(h[y * N + x], v); };
  if (kind === 'wool') { // kudrlinky
    for (let k = 0; k < 140; k++) { const cx = r() * N, cy = r() * N, rad = 3 + r() * 4; for (let y = -8; y <= 8; y++) for (let x = -8; x <= 8; x++) { const d = Math.hypot(x, y) / rad; if (d < 1) add(Math.round(cx + x), Math.round(cy + y), Math.sqrt(1 - d * d) * (0.6 + r() * 0.1)); } }
  } else if (kind === 'feather') { // šupinky peří v řadách
    for (let row = 0; row < 9; row++) for (let col = 0; col < 7; col++) { const cx = col * 9.2 + (row % 2) * 4.6, cy = row * 7.2; for (let y = 0; y < 9; y++) for (let x = -5; x <= 5; x++) { const d = Math.hypot(x / 5, (y - 1) / 8); if (d < 1) add(Math.round(cx + x), Math.round(cy + y), (1 - d) * 0.9); } }
  } else if (kind === 'skin' || kind === 'stone') {
    for (let k = 0; k < 60; k++) { const cx = r() * N, cy = r() * N, rad = 4 + r() * 10; for (let y = -14; y <= 14; y++) for (let x = -14; x <= 14; x++) { const d = Math.hypot(x, y) / rad; if (d < 1) add(Math.round(cx + x), Math.round(cy + y), (1 - d) * (kind === 'stone' ? 0.8 : 0.35)); } }
  } else { // srst: krátké chlupy shora dolů
    const len = kind === 'hide' ? 4 : 7;
    for (let k = 0; k < 900; k++) { const x0 = r() * N, y0 = r() * N, v = 0.4 + r() * 0.6, sl = (r() - 0.5) * 0.5; for (let t = 0; t < len; t++) add(Math.round(x0 + t * sl), Math.round(y0 + t), v * (1 - t / len * 0.5)); }
  }
  const mk = (fill) => { const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), img = g.createImageData(N, N); fill(img.data); g.putImageData(img, 0, 0); return c; };
  const H = (x, y) => h[(((y % N) + N) % N) * N + (((x % N) + N) % N)];
  const map = new THREE.CanvasTexture(mk((d) => { for (let i = 0; i < N * N; i++) { const v = LO[kind] + h[i] * (255 - LO[kind]); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; } }));
  map.colorSpace = THREE.SRGBColorSpace;
  const str = kind === 'stone' ? 2.5 : 1.6;
  const normalMap = new THREE.CanvasTexture(mk((d) => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * str, dy = (H(x, y + 1) - H(x, y - 1)) * str, l = Math.hypot(dx, dy, 1), i = (y * N + x) * 4;
      d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  }));
  for (const t of [map, normalMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
  return (texCache[kind] = { map, normalMap });
}

// ============================================================ stavebnice
function kit(g, irisHex = 0x4a3020) {
  const flash = [];
  const mat = (o, kind) => {
    const t = kind ? furTextures(kind) : null;
    const m = addRim(new THREE.MeshStandardMaterial({ roughness: 0.9, ...(t ? { map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(BUMP[kind], BUMP[kind]) } : {}), ...o }));
    flash.push(m);
    return m;
  };
  const box = (parent, w, h, d, m, x, y, z, r = 0.04) => { const me = new THREE.Mesh(rbox(w, h, d, r), m); me.position.set(x, y, z); me.castShadow = true; parent.add(me); return me; };
  const pivot = (parent, x, y, z) => { const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p); return p; };
  const eyes = [];
  // oko ve stylu Hytale: velké bělmo, barevná duhovka, zornička a odlesk (nebo svítící oko u nepřátel)
  const eyeBlack = new THREE.MeshStandardMaterial({ color: 0x120c0a, roughness: 0.12 }), shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const white = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.35 }), iris = new THREE.MeshStandardMaterial({ color: irisHex, roughness: 0.2 });
  const eyeGroups = new Map();
  const eye = (parent, x, y, z, size = 0.05, glow = null, side = 0) => {
    let eg = eyeGroups.get(parent);
    if (!eg) { eg = new THREE.Group(); eg.position.y = y; parent.add(eg); eyeGroups.set(parent, eg); eyes.push(eg); } // obě oči mrkají spolu
    const e = new THREE.Group();
    e.position.set(x, y - eg.position.y, z);
    if (side) { e.rotation.y = -side * 0.95; e.position.z -= size * 0.35; } // oko na rohu hlavy: kouká šikmo dopředu a je vidět i zepředu (jako v Hytale)
    if (glow) e.add(new THREE.Mesh(rbox(size, size, size * 0.5, size * 0.2), glow));
    else {
      const s = size * 1.35, add = (geo, m, x, y, z) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); e.add(me); };
      add(rbox(s * 1.05, s * 1.2, s * 0.4, s * 0.12), white, 0, 0, -s * 0.05); // bělmo
      add(rbox(s * 0.72, s * 0.86, 0.012, s * 0.1), iris, s * 0.04, -s * 0.06, -s * 0.26); // duhovka
      add(rbox(s * 0.36, s * 0.5, 0.014, s * 0.06), eyeBlack, s * 0.05, -s * 0.07, -s * 0.272); // zornička
      add(rbox(s * 0.22, s * 0.22, 0.004, 0.002), shine, -s * 0.12, s * 0.16, -s * 0.284); // odlesk
    }
    e.updateMatrix();
    for (const c of [...e.children]) { c.applyMatrix4(e.matrix); eg.add(c); } // díly oka rovnou do skupiny očí
    return e;
  };
  const leg = (parent, legs, m, x, y, z, len, w, hoof) => {
    const p = pivot(parent, x, y, z);
    box(p, w, len, w * 1.05, m, 0, -len / 2, 0, Math.min(0.035, w * 0.3));
    if (hoof) box(p, w * 1.08, 0.08, w * 1.12, hoof, 0, -len + 0.04, -0.005, 0.02);
    legs.push(p);
    return p;
  };
  return { mat, box, pivot, eye, eyes, leg, flash };
}
const glowMat = (hex, k = 2.4) => { const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), fog: false }); m.userData.glow = true; return m; };

// Barva duhovky (zvířata bez svítících očí)
const IRIS = { sheep: 0x9a7a3a, cow: 0x5a3420, chicken: 0xe08a20, deer: 0x3a2412, boar: 0x7a4a1c };
/**
 * Model tvora: { group, body, head, legs, arms, tail, ears, wings, eyes, flash (materiály pro zčervenání), kind }.
 * @param {string} type
 */
export function buildMobModel(type) {
  const g = new THREE.Group(), K = kit(g, IRIS[type]), legs = [], ears = [], wings = [];
  const { mat, box, pivot, eye, leg } = K;
  let body, head = null, tail = null, kind = 'quad', extra = {};
  if (type === 'sheep') {
    const wool = mat({ color: 0xeee9df }, 'wool'), face = mat({ color: 0x3a302b, roughness: 0.8 }, 'hide'), dark = mat({ color: 0x2b2522 });
    body = pivot(g, 0, 0.84, 0);
    box(body, 0.8, 0.66, 1.08, wool, 0, 0, 0, 0.16);
    head = pivot(g, 0, 1.0, -0.5);
    box(head, 0.34, 0.36, 0.38, face, 0, -0.02, -0.17, 0.07);
    box(head, 0.42, 0.18, 0.3, wool, 0, 0.16, -0.1, 0.08); // vlněná čepička
    for (const sx of [-1, 1]) { const ear = pivot(head, sx * 0.19, 0.05, -0.1); box(ear, 0.16, 0.06, 0.09, face, sx * 0.07, 0, 0, 0.02); ears.push(ear); eye(head, sx * 0.172, 0.04, -0.27, 0.05, null, sx); }
    box(head, 0.16, 0.08, 0.04, mat({ color: 0xc08a80 }), 0, -0.12, -0.36, 0.02); // čumáček
    for (const [x, z] of [[-0.22, -0.36], [0.22, -0.36], [-0.22, 0.36], [0.22, 0.36]]) { const l = leg(g, legs, dark, x, 0.56, z, 0.56, 0.13); box(l, 0.19, 0.16, 0.19, wool, 0, -0.06, 0, 0.06); }
    tail = pivot(g, 0, 0.98, 0.54);
    box(tail, 0.18, 0.2, 0.12, wool, 0, -0.08, 0.02, 0.06);
  } else if (type === 'cow') {
    const hide = mat({ color: 0xf2eee6 }, 'hide'), spotM = mat({ color: 0x24201e }, 'hide'), pink = mat({ color: 0xe6a6a2, roughness: 0.6 }), horn = mat({ color: 0xe8e0c8, roughness: 0.5 }), hoof = mat({ color: 0x2a2420 });
    body = pivot(g, 0, 1.08, 0);
    box(body, 1.0, 0.82, 1.6, hide, 0, 0, 0, 0.14);
    for (const [x, y, z, w, h, d] of [[0.505, 0.08, 0.2, 0.02, 0.42, 0.52], [-0.505, -0.05, -0.32, 0.02, 0.36, 0.46], [0.1, 0.415, -0.2, 0.5, 0.02, 0.42], [-0.2, 0.415, 0.45, 0.4, 0.02, 0.32], [-0.505, 0.1, 0.45, 0.02, 0.3, 0.3]])
      box(body, w, h, d, spotM, x, y, z, 0.008);
    head = pivot(g, 0, 1.3, -0.8);
    box(head, 0.52, 0.5, 0.46, hide, 0, 0.02, -0.2, 0.1);
    box(head, 0.18, 0.24, 0.02, spotM, 0.12, 0.08, -0.43, 0.006);
    box(head, 0.44, 0.24, 0.14, pink, 0, -0.12, -0.46, 0.05); // čenich
    for (const sx of [-1, 1]) {
      box(head, 0.07, 0.07, 0.03, mat({ color: 0x5a2a2a }), sx * 0.1, -0.1, -0.535, 0.01); // nozdry
      const hn = box(head, 0.06, 0.18, 0.06, horn, sx * 0.2, 0.32, -0.12, 0.025); hn.rotation.z = sx * -0.35;
      const ear = pivot(head, sx * 0.27, 0.12, -0.12); box(ear, 0.2, 0.08, 0.12, hide, sx * 0.08, 0, 0, 0.03); ears.push(ear);
      eye(head, sx * 0.262, 0.1, -0.33, 0.06, null, sx);
    }
    box(g, 0.3, 0.12, 0.32, pink, 0, 0.62, 0.36, 0.05); // vemeno
    for (const [x, z] of [[-0.32, -0.6], [0.32, -0.6], [-0.32, 0.6], [0.32, 0.6]]) leg(g, legs, hide, x, 0.7, z, 0.7, 0.19, hoof);
    tail = pivot(g, 0, 1.42, 0.8);
    box(tail, 0.06, 0.6, 0.06, hide, 0, -0.3, 0.04, 0.02);
    box(tail, 0.12, 0.14, 0.12, spotM, 0, -0.62, 0.04, 0.04);
  } else if (type === 'chicken') {
    kind = 'bird';
    const white = mat({ color: 0xf4f2ec }, 'feather'), red = mat({ color: 0xd8302a, roughness: 0.6 }), yellow = mat({ color: 0xf0b030, roughness: 0.6 });
    body = pivot(g, 0, 0.44, 0);
    box(body, 0.38, 0.38, 0.5, white, 0, 0, 0, 0.1);
    head = pivot(g, 0, 0.6, -0.2);
    box(head, 0.22, 0.26, 0.22, white, 0, 0.1, -0.04, 0.06);
    box(head, 0.06, 0.1, 0.16, red, 0, 0.27, -0.03, 0.02); // hřebínek
    box(head, 0.1, 0.06, 0.1, yellow, 0, 0.07, -0.19, 0.02); // zobák
    box(head, 0.05, 0.08, 0.04, red, 0, -0.01, -0.16, 0.015); // lalůček
    for (const sx of [-1, 1]) { eye(head, sx * 0.112, 0.13, -0.08, 0.04, null, sx); const w = pivot(g, sx * 0.19, 0.58, 0); box(w, 0.05, 0.26, 0.38, white, 0, -0.12, 0.03, 0.02); wings.push(w); }
    tail = pivot(g, 0, 0.56, 0.24);
    box(tail, 0.2, 0.26, 0.08, white, 0, 0.08, 0.04, 0.03).rotation.x = -0.45;
    for (const x of [-0.08, 0.08]) { const l = leg(g, legs, yellow, x, 0.25, 0, 0.25, 0.045); box(l, 0.12, 0.025, 0.14, yellow, 0, -0.24, -0.03, 0.01); }
  } else if (type === 'deer') {
    const fur = mat({ color: 0x9a6236 }, 'fur'), light = mat({ color: 0xeee2cc }, 'hide'), dark = mat({ color: 0x3a2616 }), antler = mat({ color: 0xdccca4, roughness: 0.6 });
    body = pivot(g, 0, 1.1, 0);
    box(body, 0.56, 0.6, 1.2, fur, 0, 0, 0, 0.14);
    box(body, 0.46, 0.08, 0.9, light, 0, -0.29, 0, 0.03); // světlé břicho
    const neck = box(g, 0.24, 0.6, 0.26, fur, 0, 1.42, -0.6, 0.07);
    neck.rotation.x = 0.5;
    head = pivot(g, 0, 1.68, -0.78);
    box(head, 0.28, 0.28, 0.44, fur, 0, 0, -0.1, 0.07);
    box(head, 0.12, 0.1, 0.06, dark, 0, -0.04, -0.33, 0.03); // nos
    box(head, 0.22, 0.12, 0.2, light, 0, -0.1, -0.2, 0.04);
    for (const sx of [-1, 1]) {
      const ear = pivot(head, sx * 0.14, 0.12, 0.02); box(ear, 0.2, 0.08, 0.1, fur, sx * 0.08, 0.02, 0, 0.03); ear.rotation.z = sx * 0.3; ears.push(ear);
      eye(head, sx * 0.142, 0.04, -0.15, 0.05, null, sx);
      const a = box(head, 0.045, 0.42, 0.045, antler, sx * 0.1, 0.32, 0.02, 0.018); a.rotation.z = -sx * 0.45;
      const b = box(head, 0.035, 0.22, 0.035, antler, sx * 0.24, 0.42, -0.06, 0.015); b.rotation.set(0.55, 0, -sx * 0.2);
      const c = box(head, 0.035, 0.18, 0.035, antler, sx * 0.21, 0.5, 0.1, 0.015); c.rotation.set(-0.4, 0, -sx * 0.9);
    }
    for (const [x, z] of [[-0.18, -0.48], [0.18, -0.48], [-0.18, 0.48], [0.18, 0.48]]) leg(g, legs, fur, x, 0.86, z, 0.86, 0.1, dark);
    tail = pivot(g, 0, 1.28, 0.6);
    box(tail, 0.14, 0.18, 0.08, light, 0, -0.06, 0.03, 0.04);
  } else if (type === 'boar') {
    const fur = mat({ color: 0x5a3c28 }, 'fur'), dark = mat({ color: 0x2a1c14 }, 'fur'), pink = mat({ color: 0xa87060, roughness: 0.6 }), tusk = mat({ color: 0xf2eadc, roughness: 0.4 });
    body = pivot(g, 0, 0.76, 0);
    box(body, 0.7, 0.68, 1.3, fur, 0, 0, 0, 0.14);
    for (let i = 0; i < 5; i++) box(body, 0.12, 0.14, 0.2, dark, 0, 0.36, -0.45 + i * 0.22, 0.04).rotation.x = -0.3; // hřbet se štětinami
    head = pivot(g, 0, 0.8, -0.64);
    box(head, 0.44, 0.42, 0.46, fur, 0, -0.02, -0.18, 0.09);
    box(head, 0.24, 0.18, 0.14, pink, 0, -0.1, -0.46, 0.05);
    for (const sx of [-1, 1]) {
      const t = box(head, 0.04, 0.16, 0.04, tusk, sx * 0.11, -0.06, -0.47, 0.015); t.rotation.x = -0.35;
      const ear = pivot(head, sx * 0.18, 0.18, -0.08); box(ear, 0.1, 0.14, 0.06, dark, 0, 0.06, 0, 0.02); ear.rotation.z = sx * -0.4; ears.push(ear);
      eye(head, sx * 0.222, 0.06, -0.3, 0.05, null, sx);
    }
    for (const [x, z] of [[-0.22, -0.48], [0.22, -0.48], [-0.22, 0.48], [0.22, 0.48]]) leg(g, legs, dark, x, 0.46, z, 0.46, 0.15);
    tail = pivot(g, 0, 0.92, 0.65);
    box(tail, 0.05, 0.22, 0.05, dark, 0, -0.1, 0.02, 0.02);
  } else if (type === 'wolf') {
    const fur = mat({ color: 0x74747c }, 'fur'), light = mat({ color: 0xc4c4c8 }, 'fur'), dark = mat({ color: 0x3a3a40 }, 'fur');
    const amber = glowMat(0xffb066, 2.6);
    body = pivot(g, 0, 0.68, 0);
    box(body, 0.42, 0.44, 1.0, fur, 0, 0, 0.04, 0.1);
    box(body, 0.5, 0.5, 0.36, light, 0, 0.04, -0.34, 0.12); // hříva na hrudi
    head = pivot(g, 0, 0.84, -0.56);
    box(head, 0.34, 0.32, 0.32, fur, 0, 0, -0.1, 0.07);
    box(head, 0.18, 0.15, 0.22, light, 0, -0.07, -0.33, 0.04); // čenich
    box(head, 0.08, 0.06, 0.04, mat({ color: 0x121212, roughness: 0.3 }), 0, -0.02, -0.45, 0.015);
    for (const sx of [-1, 1]) {
      const ear = pivot(head, sx * 0.1, 0.16, -0.02); box(ear, 0.1, 0.16, 0.06, dark, 0, 0.07, 0, 0.02); ears.push(ear);
      eye(head, sx * 0.08, 0.05, -0.262, 0.055, amber);
    }
    for (const [x, z] of [[-0.13, -0.38], [0.13, -0.38], [-0.13, 0.42], [0.13, 0.42]]) leg(g, legs, dark, x, 0.56, z, 0.56, 0.11);
    tail = pivot(g, 0, 0.78, 0.52);
    box(tail, 0.13, 0.13, 0.5, fur, 0, 0, 0.24, 0.05);
    box(tail, 0.1, 0.1, 0.14, light, 0, 0, 0.5, 0.04);
    tail.rotation.x = 0.6;
  } else if (type === 'markoman') {
    // Bojovník Markovy dimenze: postava v obleku strážce se železnou zbrojí a mečem, oči svítí purpurově.
    kind = 'biped';
    const R = buildCharacter({ s: 'knight', c: 10, l: 3, v: 3, e: 7 }, { shadow: false }); // rytíř v purpuru: bledá pleť, černé vlasy, fialové oči
    setCharacterArmor(R, ['iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots']);
    const sw = new THREE.Group();
    const blade = new THREE.Mesh(rbox(0.07, 0.78, 0.02, 0.01), armorMat(3));
    blade.position.y = 0.48;
    const guard = new THREE.Mesh(rbox(0.24, 0.04, 0.06, 0.012), new THREE.MeshStandardMaterial({ color: 0xc9a03a, metalness: 1, roughness: 0.35 }));
    guard.position.y = 0.08;
    sw.add(blade, guard);
    sw.rotation.x = -Math.PI / 2;
    R.hand.add(sw);
    for (const e of R.eyes) e.scale.set(1.3, 1.2, 1);
    g.add(R.group);
    extra.rig = R;
    body = R.hips;
    K.flash.push(...R.M.flashable);
  } else if (type === 'golem') {
    kind = 'biped';
    const stone = mat({ color: 0x8a86a8, emissive: 0x38e8ff, emissiveMap: crackTex(), emissiveIntensity: 0.6 }, 'stone');
    stone.userData.pulse = true;
    const crystal = new THREE.MeshStandardMaterial({ color: 0xbff8ff, emissive: 0x38e8ff, emissiveIntensity: 1.6, roughness: 0.2 });
    crystal.userData.glow = true;
    const glow = glowMat(0x38e8ff, 2.6);
    body = pivot(g, 0, 1.55, 0);
    box(body, 1.25, 1.2, 0.8, stone, 0, 0, 0, 0.14);
    box(body, 1.0, 0.3, 0.7, stone, 0, -0.68, 0, 0.1);
    head = pivot(body, 0, 0.62, -0.08);
    box(head, 0.62, 0.55, 0.56, stone, 0, 0.24, 0, 0.1);
    box(head, 0.66, 0.1, 0.2, stone, 0, 0.36, -0.24, 0.04); // obočí
    for (const sx of [-1, 1]) eye(head, sx * 0.15, 0.24, -0.285, 0.11, glow);
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.18).scale(1, 1.8, 1), crystal);
      c.position.set((i - 2) * 0.24, 0.45 - Math.abs(i - 2) * 0.08, 0.42);
      c.rotation.x = -0.4;
      body.add(c);
    }
    const arms = [];
    for (const sx of [-1, 1]) {
      const a = pivot(body, sx * 0.82, 0.5, 0);
      box(a, 0.48, 0.42, 0.5, stone, 0, -0.08, 0, 0.1); // rameno
      box(a, 0.38, 1.1, 0.38, stone, 0, -0.75, 0, 0.1);
      box(a, 0.46, 0.34, 0.46, stone, 0, -1.38, 0, 0.12); // pěst
      arms.push(a);
    }
    for (const sx of [-1, 1]) leg(g, legs, stone, sx * 0.32, 0.9, 0, 0.9, 0.42);
    extra.arms = arms;
    extra.crystal = crystal;
  } else { // stínožrout: tmavá lesklá koule se zářícími žilkami, ostny a purpurovýma očima
    kind = 'blob';
    const skin = mat({ color: 0x241a30, roughness: 0.3, metalness: 0.2, emissive: 0xd04bff, emissiveMap: crackTex(), emissiveIntensity: 0.9 }, 'skin');
    skin.userData.pulse = true;
    body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 22, 16), skin);
    body.position.y = 0.48;
    body.castShadow = true;
    g.add(body);
    head = body;
    const eyeM = glowMat(0xd04bff, 1.7);
    for (const sx of [-0.2, 0.2]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), eyeM); e.position.set(sx, 0.12, -0.58); e.rotation.z = sx * -1.5; e.scale.set(1.2, 0.5, 0.6); body.add(e); } // zlé šikmé oči (nemrkají)
    const spikeMat = mat({ color: 0x1a1022, roughness: 0.45 });
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.5, 6), spikeMat);
      sp.position.set((i - 2) * 0.14, 0.5 - Math.abs(i - 2) * 0.06, 0.1 + Math.abs(i - 2) * 0.05);
      sp.rotation.set(-0.5, 0, (i - 2) * -0.35);
      body.add(sp);
    }
  }
  if (kind === 'blob') mergeStatic(g); else if (!extra.rig) skinRig(g); // jedno kreslení na materiál
  if (type === 'golem') g.scale.setScalar(1.1);
  if (head && kind !== 'blob' && !extra.rig && type !== 'golem') head.scale.setScalar(type === 'chicken' ? 1.2 : 1.15); // větší hlava: roztomilejší poměry jako v Hytale
  const shadow = blobShadow(type === 'golem' ? 1.25 : type === 'cow' ? 0.95 : type === 'chicken' ? 0.36 : type === 'markoman' ? 0.48 : 0.72);
  return { group: g, body, head, legs, ears, wings, tail, eyes: K.eyes, flash: K.flash, kind, shadow, bodyY: body.position.y, arms: extra.arms || [], rig: extra.rig, crystal: extra.crystal, big: type === 'golem', headRest: head?.rotation.x || 0 };
}
export { animateCharacter };
