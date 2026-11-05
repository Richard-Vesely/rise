// Postava hráče ve futuristickém obleku: 3D model (kloubová kostra z kvádrů se zaoblenými hranami), brnění na modelu
// a procedurální animace (chůze, běh, plížení, nečinnost, máchnutí, jídlo, let, sezení, dopad).
// Používají ji postavičky ostatních hráčů (net/avatars.js), vlastní postava v pohledu ze třetí osoby,
// ruka v pohledu z první osoby (render/held-item.js) i náhled ve výběru obleku (menu/costume.js).
// Modul nemá vedlejší účinky při načtení (jen funkce a sdílené materiály), takže ho smí načíst i hlavní menu.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EMBLEMS, HAIR_COLORS, LIGHT_COLORS, SKIN_TONES, SUIT_COLORS, VISOR_COLORS, cleanCostume, isHero } from '../../../shared/data/costumes.js';
import { ITEMS } from '../../../shared/data/index.js';

// ============================================================ sdílené tvary a textury
const geoCache = new Map();
/** Kvádr se zaoblenými hranami (sdílený podle rozměrů): hrany chytají světlo, postava nepůsobí jako krabice. */
export function rbox(w, h, d, r = 0.03) {
  const k = `${w}|${h}|${d}|${r}`;
  let g = geoCache.get(k);
  if (!g) geoCache.set(k, (g = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.05, h / 2.05, d / 2.05))));
  return g;
}
const cyl = (rt, rb, h, s = 12) => { const k = `c${rt}|${rb}|${h}|${s}`; let g = geoCache.get(k); if (!g) geoCache.set(k, (g = new THREE.CylinderGeometry(rt, rb, h, s))); return g; };

function canvasTex(size, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const rnd = (s) => () => ((s = (s * 16807) % 2147483647) / 2147483647);
let _fabric, _plate, _blob, _crack;
// Látka: jemná tkanina se švy (šedobílá, barvu dává materiál).
const fabricTex = () => (_fabric ||= canvasTex(64, (g, n) => {
  const r = rnd(11);
  g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, n, n);
  for (let i = 0; i < 900; i++) { const v = 215 + r() * 40; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * n, r() * n, 1, 1); }
  g.fillStyle = 'rgba(0,0,0,0.06)';
  for (let y = 0; y < n; y += 4) g.fillRect(0, y, n, 1); // jemné žebrování
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, n, 2); g.fillRect(0, 0, 2, n); // šev na kraji dílu
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, 2, n, 1);
}));
// Pláty: panely s drážkami a nýty.
const plateTex = () => (_plate ||= canvasTex(64, (g, n) => {
  const r = rnd(5);
  g.fillStyle = '#ececec'; g.fillRect(0, 0, n, n);
  for (let i = 0; i < 400; i++) { const v = 220 + r() * 35; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * n, r() * n, 2, 1); }
  g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 2;
  g.strokeRect(3, 3, n - 6, n - 6);
  g.beginPath(); g.moveTo(3, n * 0.55); g.lineTo(n - 3, n * 0.55); g.stroke();
  g.fillStyle = 'rgba(0,0,0,0.5)';
  for (const [x, y] of [[8, 8], [n - 8, 8], [8, n - 8], [n - 8, n - 8]]) { g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill(); }
}));
/** Měkký kulatý stín pod postavou a tvory (na všech úrovních grafiky). */
export const blobTex = () => (_blob ||= canvasTex(64, (g, n) => {
  const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, n, n);
}, false));
// Praskliny (svítící žilky) pro krystalové a stínové brnění a golema.
export const crackTex = () => (_crack ||= canvasTex(64, (g, n) => {
  const r = rnd(29);
  g.fillStyle = '#000'; g.fillRect(0, 0, n, n);
  g.strokeStyle = '#fff'; g.lineWidth = 1.4; g.lineCap = 'round';
  for (let k = 0; k < 7; k++) {
    let x = r() * n, y = r() * n;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 5; s++) { x += (r() - 0.5) * 22; y += (r() - 0.5) * 22; g.lineTo(x, y); }
    g.stroke();
  }
}));
const blobGeo = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2);
let _blobMat;
/** Stín: kruh s měkkým okrajem, poloměr r. */
export function blobShadow(r = 0.45) {
  _blobMat ||= new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: true });
  const m = new THREE.Mesh(blobGeo, _blobMat);
  m.scale.setScalar(r);
  m.renderOrder = 1;
  return m;
}

// Znak na hrudi (bílý tvar, září barvou světel obleku).
const emblemCache = new Map();
export function emblemTex(e) {
  if (emblemCache.has(e)) return emblemCache.get(e);
  const t = canvasTex(64, (g, n) => {
    g.clearRect(0, 0, n, n);
    g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineWidth = 5; g.lineJoin = 'round';
    const c = n / 2, P = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); };
    const name = EMBLEMS[e];
    if (name === 'Hvězda') P(Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 11 : 26; return [c + Math.cos(a) * r, c + 2 + Math.sin(a) * r]; }));
    else if (name === 'Blesk') P([[36, 4], [14, 36], [30, 36], [24, 60], [50, 26], [34, 26], [42, 4]]);
    else if (name === 'List') { g.beginPath(); g.ellipse(c, c, 13, 26, 0.6, 0, 7); g.fill(); g.strokeStyle = '#000'; g.globalCompositeOperation = 'destination-out'; g.lineWidth = 3; g.beginPath(); g.moveTo(18, 48); g.lineTo(46, 16); g.stroke(); }
    else if (name === 'Planeta') { g.beginPath(); g.arc(c, c, 15, 0, 7); g.fill(); g.lineWidth = 4; g.beginPath(); g.ellipse(c, c, 28, 8, -0.4, 0, 7); g.stroke(); }
    else if (name === 'Srdce') { g.beginPath(); g.moveTo(c, 54); g.bezierCurveTo(4, 30, 14, 4, c, 20); g.bezierCurveTo(50, 4, 60, 30, c, 54); g.fill(); }
    else if (name === 'Koruna') P([[8, 50], [8, 18], [20, 32], [c, 10], [44, 32], [56, 18], [56, 50]]);
    else if (name === 'Ř') { g.font = '900 48px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Ř', c, c + 4); }
  });
  emblemCache.set(e, t);
  return t;
}

/**
 * Sloučí nehybné díly: v každém kloubu (skupině) se kvádry se stejným materiálem spojí do jednoho tvaru.
 * Postava pak místo ~60 kreslení potřebuje ~25 (důležité pro slabší notebooky). Díly s userData.keep zůstanou zvlášť.
 * @param {THREE.Object3D} root
 * @param {(m: THREE.Mesh) => boolean} [filter]
 */
export function mergeStatic(root, filter = () => true) {
  const groups = [];
  root.traverse((o) => { if (o.isGroup || o === root) groups.push(o); });
  for (const G of groups) {
    const buckets = new Map();
    for (const c of G.children) {
      if (!c.isMesh || c.children.length || c.userData.keep || !c.visible || !filter(c)) continue;
      if (!buckets.has(c.material)) buckets.set(c.material, []);
      buckets.get(c.material).push(c);
    }
    for (const [mat, list] of buckets) {
      if (list.length < 2) continue;
      const geos = list.map((m) => {
        m.updateMatrix();
        const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        g.applyMatrix4(m.matrix);
        for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
        return g;
      });
      const merged = mergeGeometries(geos);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.userData = { ...list[0].userData, merged: true };
      for (const m of list) G.remove(m);
      G.add(mesh);
    }
  }
}

/**
 * Postava (nebo tvor) se kreslí jako kostra: každý kloub (skupina) je kost a všechny kvádry se stejným materiálem
 * jsou jeden SkinnedMesh. Místo ~50 kreslení na postavu jich je ~10, animace kloubů funguje dál stejně.
 * Při prvním volání musí být kořen v klidové poloze (počátek, bez otočení); kostra se uloží do root.userData.skeleton.
 * Další volání (brnění) použijí stejnou kostru a poznají klidovou polohu z ní.
 * @param {THREE.Object3D} root
 * @param {(m: THREE.Mesh) => boolean} [filter]
 * @returns {THREE.SkinnedMesh[]}
 */
export function skinRig(root, filter = () => true) {
  root.updateMatrixWorld(true);
  let skeleton = root.userData.skeleton;
  if (!skeleton) {
    const bones = [root];
    root.traverse((o) => { if (o.isGroup && o !== root) bones.push(o); });
    skeleton = root.userData.skeleton = new THREE.Skeleton(bones); // inverze = klidová poloha teď
  }
  const index = new Map(skeleton.bones.map((b, i) => [b, i]));
  const rootInv = root.matrixWorld.clone().invert();
  const buckets = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || o.children.length || !o.visible || !filter(o)) return;
    let b = o.parent;
    while (b && !index.has(b)) b = b.parent;
    if (!b) return;
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push([o, index.get(b)]);
  });
  const out = [], rel = new THREE.Matrix4(), bind = new THREE.Matrix4();
  for (const [mat, list] of buckets) {
    const geos = list.map(([m, bi]) => {
      const bone = skeleton.bones[bi];
      // poloha dílu vůči jeho kosti → do klidové polohy celé postavy
      rel.copy(bone.matrixWorld).invert().multiply(m.matrixWorld);
      bind.copy(skeleton.boneInverses[bi]).invert().multiply(rel);
      if (bi === 0) bind.copy(rootInv).multiply(m.matrixWorld);
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(bind);
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      const n = g.attributes.position.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
      return g;
    });
    const merged = mergeGeometries(geos);
    for (const g of geos) g.dispose();
    for (const [m] of list) m.parent.remove(m);
    if (!merged) continue;
    const sm = new THREE.SkinnedMesh(merged, mat);
    sm.userData = { ...list[0][0].userData, merged: true };
    sm.castShadow = true;
    merged.computeBoundingSphere();
    sm.boundingSphere = merged.boundingSphere.clone();
    sm.boundingSphere.radius += 0.8; // animace (máchnutí, krok) sahá kousek za klidovou polohu
    root.add(sm);
    sm.bind(skeleton, new THREE.Matrix4());
    out.push(sm);
  }
  return out;
}

// ============================================================ měsíční obrys: v noci slabá modrá záře na okrajích
// (postavy a tvory jsou ve tmě vidět podle obrysu; sílu nastavuje mobs.js podle toho, jak je tma)
export const RIM = { value: new THREE.Color(0, 0, 0) };
export function addRim(m) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = RIM;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uRim * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);');
  };
  m.customProgramCacheKey = () => 'rim';
  return m;
}

// ============================================================ materiály obleku
// Vzhled jednotlivých druhů obleku: pláty (barva, kovovost), lem, a jestli je látka světlá (plášť vědce).
const STYLE = {
  explorer: { plate: 0xdfe4ea, metal: 0.25, rough: 0.42, trim: 0x8a929e },
  engineer: { plate: 0x2a2f38, metal: 0.9, rough: 0.38, trim: 0xd8a040 },
  pilot: { plate: 0x3a404c, metal: 0.7, rough: 0.35, trim: 0xc9d0da },
  guard: { plate: 0xb8c0cc, metal: 0.95, rough: 0.3, trim: 0x2a2f38 },
  scientist: { plate: 0xeef2f5, metal: 0.1, rough: 0.55, trim: 0x8a929e },
  shadow: { plate: 0x1b1724, metal: 0.5, rough: 0.45, trim: 0x3a2f4c, fabric: 0x221d2c },
  sky: { plate: 0xf4f1ea, metal: 0.3, rough: 0.25, trim: 0xe0b040, fabric: 0xf0ede6 },
  // hrdinové (obličej a vlasy): pláty = boty a doplňky, lem = zlaté ornamenty
  mage: { plate: 0x2a2238, metal: 0.4, rough: 0.5, trim: 0xe0b040 },
  knight: { plate: 0xb8c0cc, metal: 0.95, rough: 0.3, trim: 0xd0a040 },
  ranger: { plate: 0x6a4a2e, metal: 0.05, rough: 0.8, trim: 0xb08a50 },
};
// Nic není úplně bílé (pravidlo vzhledu): bílý oblek by na slunci přezářil a s post-processingem se rozmazal do záře.
const tame = (c, max = 0.72) => { const h = {}; c.getHSL(h); if (h.l > max) c.setHSL(h.h, h.s, max); return c; };
/** Barvy obleku (látka, tmavé spoje, pláty, světla) – pro ruku z první osoby v render/held-item.js. */
export function suitPalette(costume) {
  const c = cleanCostume(costume), st = STYLE[c.s], suit = new THREE.Color(SUIT_COLORS[c.c][1]);
  const fabric = c.s === 'scientist' ? new THREE.Color(0xf2f5f7).lerp(suit, 0.12) : st.fabric ? new THREE.Color(st.fabric).lerp(suit, 0.18) : suit;
  tame(fabric);
  return { fabric, dark: fabric.clone().multiplyScalar(0.42), plate: tame(new THREE.Color(st.plate)), light: new THREE.Color(LIGHT_COLORS[c.l][1]) };
}
function suitMats(c) {
  const st = STYLE[c.s];
  const suit = new THREE.Color(SUIT_COLORS[c.c][1]);
  const light = new THREE.Color(LIGHT_COLORS[c.l][1]);
  const fabricC = tame(st.fabric ? new THREE.Color(st.fabric).lerp(suit, 0.18) : suit.clone());
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const M = {
    light,
    fabric: std({ color: fabricC, map: fabricTex(), roughness: 0.8 }),
    fabricDark: std({ color: fabricC.clone().multiplyScalar(0.42), map: fabricTex(), roughness: 0.85 }),
    paint: std({ color: tame(c.s === 'shadow' ? new THREE.Color(0x2a2236) : c.s === 'sky' ? new THREE.Color(0xf6f3ec) : suit.clone(), 0.7), roughness: 0.32, metalness: 0.25 }),
    plate: std({ color: tame(new THREE.Color(st.plate), 0.7), map: plateTex(), roughness: st.rough, metalness: st.metal }),
    trim: std({ color: st.trim, roughness: 0.3, metalness: 1 }),
    rubber: std({ color: 0x343a46, roughness: 0.7 }),
    visor: std({ color: new THREE.Color(VISOR_COLORS[c.v][1]).multiplyScalar(0.5), roughness: 0.05, metalness: 0.85, envMapIntensity: 1.4 }), // tónované sklo
    glow: std({ color: light.clone().multiplyScalar(0.3), emissive: light, emissiveIntensity: 2.2, roughness: 0.4 }),
    shine: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }),
    coat: std({ color: tame(new THREE.Color(0xf2f5f7).lerp(suit, 0.12)), map: fabricTex(), roughness: 0.85, side: THREE.DoubleSide }),
    cape: std({ color: c.s === 'shadow' ? new THREE.Color(0x15111d) : suit.clone().multiplyScalar(0.7), map: fabricTex(), roughness: 0.9, side: THREE.DoubleSide }),
  };
  M.glow.userData.glow = true;
  if (isHero(c.s)) heroMats(c, M, st);
  M.emblem = std({ map: emblemTex(c.e), transparent: true, alphaTest: 0.4, color: 0xffffff, emissive: light, emissiveMap: emblemTex(c.e), emissiveIntensity: 1.1, roughness: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  M.flashable = [M.fabric, M.fabricDark, M.paint, M.plate, M.rubber, M.coat, M.cape];
  for (const m of [...M.flashable, M.trim]) addRim(m);
  return M;
}

// Hrdinové: místo svítících linek zlaté ornamenty, kožené rukavice a podrážky, pleť, vlasy a obličej.
function heroMats(c, M, st) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  M.glow = std({ color: st.trim, metalness: 1, roughness: 0.3, emissive: M.light, emissiveIntensity: 0.12 });
  M.gem = std({ color: M.light.clone().multiplyScalar(0.5), emissive: M.light, emissiveIntensity: 1.6, metalness: 0.3, roughness: 0.15 });
  M.gem.userData.glow = true;
  M.fabric.color.multiplyScalar(c.s === 'mage' ? 0.62 : 0.8); // sytější látka (hábit jako na obrázku z Hytale)
  M.fabricDark.color.multiplyScalar(0.8);
  M.rubber = std({ color: c.s === 'knight' ? 0x3a3f48 : 0x4a3222, roughness: 0.75 });
  M.paint = std({ color: tame(new THREE.Color(SUIT_COLORS[c.c][1]).multiplyScalar(0.6)), map: fabricTex(), roughness: 0.6 });
  const skin = new THREE.Color(SKIN_TONES[c.e][1]), hair = new THREE.Color(HAIR_COLORS[c.v][1]);
  M.skin = std({ color: skin, roughness: 0.7 });
  M.hair = std({ color: hair, map: hairTex(), roughness: 0.75 });
  M.hairDark = std({ color: hair.clone().multiplyScalar(0.62), map: hairTex(), roughness: 0.8 });
  M.eyeWhite = std({ color: 0xf2f0ec, roughness: 0.4 });
  M.iris = std({ color: M.light.clone().multiplyScalar(0.55), emissive: M.light, emissiveIntensity: 0.35, roughness: 0.25 });
  M.pupil = std({ color: 0x14121a, roughness: 0.3 });
  M.face = std({ map: faceTex(skin, hair), transparent: true, alphaTest: 0.3, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -1 });
  M.flashable = [M.fabric, M.fabricDark, M.paint, M.plate, M.rubber, M.coat, M.cape, M.skin];
  for (const m of [M.rubber, M.paint, M.skin, M.hair, M.hairDark]) addRim(m);
}
let _hair;
// pruhy ve vlasech (prameny)
const hairTex = () => (_hair ||= canvasTex(32, (g, n) => {
  const r = rnd(5);
  for (let x = 0; x < n; x++) { const v = 200 + r() * 55; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, 0, 1, n); }
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${0.08 + r() * 0.12})`; g.fillRect(Math.floor(r() * n), Math.floor(r() * n), 1, 3 + Math.floor(r() * 6)); }
}));
// obličej (bez očí, ty jsou zvlášť a mrkají): obočí, nos, pusa, tváře – pixelový styl
function faceTex(skin, hair) {
  const t = canvasTex(32, (g) => {
    const px = (c, x, y, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    const sh = `#${skin.clone().multiplyScalar(0.78).getHexString()}`, br = `#${hair.clone().multiplyScalar(0.55).getHexString()}`;
    px(br, 6, 11, 7, 2); px(br, 19, 11, 7, 2); px(br, 5, 12, 2, 1); px(br, 25, 12, 2, 1); // obočí
    px(sh, 15, 15, 2, 5); px(sh, 14, 19, 4, 1); // nos
    px('#a0544e', 13, 23, 6, 1); px(sh, 12, 22, 1, 1); px(sh, 19, 22, 1, 1); // pusa
    px('rgba(230,120,120,0.35)', 6, 19, 4, 2); px('rgba(230,120,120,0.35)', 22, 19, 4, 2); // tváře
  });
  t.magFilter = THREE.NearestFilter; // ostré pixely
  return t;
}
// Účesy: kvádry [w, h, d, x, y, z, rotace x, rotace z] na hlavě (hlava 0,46 m, střed y 0,23)
const HAIR = {
  mage: [ // rozcuchané, nahoru a do stran, ofina přes čelo
    [0.5, 0.12, 0.5, 0, 0.47, 0.01], [0.16, 0.2, 0.16, -0.12, 0.56, 0.02, 0.3, 0.45], [0.15, 0.22, 0.15, 0.06, 0.58, -0.04, -0.35, -0.2],
    [0.14, 0.18, 0.14, 0.17, 0.53, 0.08, 0.2, -0.6], [0.13, 0.2, 0.13, -0.02, 0.57, 0.14, 0.6, 0.1], [0.12, 0.16, 0.12, -0.2, 0.5, -0.1, -0.2, 0.8],
    [0.5, 0.1, 0.12, 0, 0.4, -0.2, 0, 0], [0.14, 0.14, 0.08, -0.15, 0.33, -0.23, 0, 0.25], [0.12, 0.16, 0.08, 0.02, 0.32, -0.235, 0, -0.15], [0.12, 0.12, 0.08, 0.17, 0.35, -0.23, 0, -0.35],
    [0.07, 0.3, 0.42, -0.245, 0.3, 0.03], [0.07, 0.3, 0.42, 0.245, 0.3, 0.03], [0.48, 0.36, 0.08, 0, 0.29, 0.235], [0.4, 0.14, 0.1, 0, 0.1, 0.24, 0.2, 0],
  ],
  knight: [ // krátké, upravené
    [0.49, 0.09, 0.49, 0, 0.47, 0], [0.49, 0.08, 0.1, 0, 0.42, -0.2], [0.06, 0.2, 0.44, -0.24, 0.36, 0.02], [0.06, 0.2, 0.44, 0.24, 0.36, 0.02], [0.48, 0.28, 0.07, 0, 0.33, 0.235],
  ],
  ranger: [ // delší, za uši, culík vzadu
    [0.5, 0.1, 0.5, 0, 0.47, 0], [0.5, 0.1, 0.12, 0, 0.41, -0.2, 0, 0.12], [0.07, 0.34, 0.44, -0.245, 0.3, 0.02], [0.07, 0.34, 0.44, 0.245, 0.3, 0.02],
    [0.48, 0.42, 0.08, 0, 0.27, 0.235], [0.12, 0.3, 0.1, 0, 0.05, 0.29, -0.25, 0],
  ],
};
/** Hlava hrdiny: kostka pleti, obličej, oči (mrkají), uši a účes. */
function heroHead(R, M, c) {
  const head = R.head;
  R.helmet = part(head, 0.46, 0.46, 0.46, M.skin, 0, 0.23, 0, 0.04);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46), M.face);
  face.position.set(0, 0.23, -0.2315);
  face.rotation.y = Math.PI;
  head.add(face);
  R.visor = new THREE.Object3D(); // hrdinové hledí nemají (doplňky obleků s ním počítají)
  const eyes = pivot(head, 0, 0.255, -0.232);
  for (const sx of [-1, 1]) {
    part(eyes, 0.1, 0.075, 0.012, M.eyeWhite, sx * 0.085, 0, 0, 0.004);
    part(eyes, 0.05, 0.07, 0.014, M.iris, sx * 0.075, -0.002, -0.002, 0.004);
    part(eyes, 0.024, 0.04, 0.016, M.pupil, sx * 0.072, -0.004, -0.004, 0.004);
  }
  R.eyes = [eyes];
  for (const sx of [-1, 1]) part(head, 0.04, 0.1, 0.07, M.skin, sx * 0.245, 0.22, 0.02, 0.015); // uši
  for (const [w, h, d, x, y, z, rx = 0, rz = 0] of HAIR[c.s] || HAIR.knight) {
    const m = part(head, w, h, d, y > 0.5 ? M.hairDark : M.hair, x, y, z, 0.025);
    m.rotation.set(rx, 0, rz);
  }
}

// ============================================================ stavba modelu
const pivot = (parent, x, y, z) => { const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p); return p; };
function part(parent, w, h, d, mat, x, y, z, r = 0.03) {
  const m = new THREE.Mesh(rbox(w, h, d, r), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
function cylPart(parent, rt, rb, h, mat, x, y, z, rx = 0, rz = 0, seg = 12) {
  const m = new THREE.Mesh(cyl(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, 0, rz);
  parent.add(m);
  return m;
}

/**
 * Postava v obleku. Počátek je u chodidel, postava kouká k −Z (jako kamera při yaw 0).
 * @param {object|string} costume oblek (viz shared/data/costumes.js)
 * @param {{ shadow?: boolean }} [opts]
 */
export function buildCharacter(costume, opts = {}) {
  const c = cleanCostume(costume);
  const M = suitMats(c);
  const g = new THREE.Group();
  const R = { group: g, costume: c, M, extras: {}, armorKey: '', held: undefined };
  // --- nohy (kyčle → koleno)
  const hips = (R.hips = pivot(g, 0, 0.8, 0));
  const legs = [-1, 1].map((sx) => {
    const hip = pivot(hips, sx * 0.115, 0, 0);
    part(hip, 0.19, 0.42, 0.21, M.fabric, 0, -0.19, 0, 0.05);
    part(hip, 0.2, 0.04, 0.22, M.fabricDark, 0, -0.06, 0, 0.015);
    part(hip, 0.014, 0.28, 0.05, M.glow, sx * 0.097, -0.21, 0, 0.005); // svítící linka na boku stehna
    const knee = pivot(hip, 0, -0.4, 0);
    part(knee, 0.16, 0.1, 0.06, M.paint, 0, 0, -0.105, 0.02); // chránič kolena
    part(knee, 0.175, 0.3, 0.195, M.fabric, 0, -0.14, 0, 0.05);
    part(knee, 0.21, 0.15, 0.29, M.plate, 0, -0.325, -0.03, 0.05); // bota
    part(knee, 0.18, 0.02, 0.2, M.glow, 0, -0.245, -0.005, 0.008); // svítící lem boty
    part(knee, 0.215, 0.035, 0.295, M.rubber, 0, -0.385, -0.03, 0.012); // podrážka
    return { hip, knee };
  });
  R.legL = legs[0]; R.legR = legs[1];
  // --- trup
  const torso = (R.torso = pivot(hips, 0, 0, 0));
  part(torso, 0.44, 0.16, 0.25, M.fabricDark, 0, 0.06, 0, 0.05);
  part(torso, 0.47, 0.065, 0.28, M.plate, 0, 0.135, 0, 0.02); // opasek
  part(torso, 0.08, 0.045, 0.012, M.glow, 0, 0.135, -0.142, 0.005); // přezka
  R.chest = pivot(torso, 0, 0.41, 0); // hrudník dýchá
  part(R.chest, 0.5, 0.48, 0.27, M.fabric, 0, 0, 0, 0.07);
  part(torso, 0.4, 0.25, 0.045, M.plate, 0, 0.49, -0.14, 0.02); // hrudní plát
  for (const sx of [-1, 1]) part(torso, 0.022, 0.2, 0.02, M.glow, sx * 0.18, 0.49, -0.163, 0.006);
  const emb = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.13), M.emblem);
  emb.position.set(0, 0.5, -0.1635);
  emb.rotation.y = Math.PI;
  if (c.e && !isHero(c.s)) torso.add(emb);
  part(torso, 0.3, 0.06, 0.22, M.rubber, 0, 0.66, 0, 0.025); // límec
  // --- hlava (přilba s hledím, u hrdinů obličej a vlasy)
  const head = (R.head = pivot(torso, 0, 0.67, 0));
  head.rotation.order = 'YXZ';
  if (isHero(c.s)) heroHead(R, M, c);
  else {
    R.helmet = part(head, 0.44, 0.42, 0.44, M.paint, 0, 0.22, 0, 0.1);
    R.visor = part(head, 0.37, 0.19, 0.05, M.visor, 0, 0.22, -0.208, 0.035);
    part(head, 0.07, 0.012, 0.004, M.shine, -0.1, 0.285, -0.234, 0.002).rotation.z = 0.25; // odlesk na hledí
    const eyes = pivot(head, 0, 0.215, -0.235); // oči mrkají
    for (const sx of [-1, 1]) part(eyes, 0.06, 0.03, 0.006, M.glow, sx * 0.075, 0, 0, 0.008);
    R.eyes = [eyes];
    for (const sx of [-1, 1]) {
      cylPart(head, 0.065, 0.065, 0.04, M.plate, sx * 0.225, 0.2, 0, 0, Math.PI / 2);
      cylPart(head, 0.035, 0.035, 0.045, M.glow, sx * 0.226, 0.2, 0, 0, Math.PI / 2);
    }
  }
  // --- ruce (rameno → loket)
  const arms = [-1, 1].map((sx) => {
    const sh = pivot(torso, sx * 0.335, 0.58, 0);
    R.extras['pad' + sx] = part(sh, 0.2, 0.13, 0.25, M.paint, sx * 0.01, 0.01, 0, 0.05); // nárameník
    part(sh, 0.15, 0.3, 0.17, M.fabric, 0, -0.14, 0, 0.05);
    part(sh, 0.014, 0.2, 0.045, M.glow, sx * 0.077, -0.15, 0, 0.005); // linka na paži
    const elbow = pivot(sh, 0, -0.28, 0);
    part(elbow, 0.14, 0.2, 0.16, M.fabric, 0, -0.08, 0, 0.05);
    part(elbow, 0.165, 0.075, 0.185, M.plate, 0, -0.17, 0, 0.025); // manžeta
    part(elbow, 0.17, 0.016, 0.19, M.glow, 0, -0.13, 0, 0.006);
    part(elbow, 0.15, 0.12, 0.17, M.rubber, 0, -0.26, 0, 0.045); // rukavice
    const hand = pivot(elbow, 0, -0.29, -0.02);
    return { sh, elbow, hand };
  });
  R.armL = arms[0]; R.armR = arms[1];
  R.hand = arms[1].hand;
  SUIT_EXTRAS[c.s]?.(R, M);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  skinRig(g);
  if (opts.shadow !== false) { R.shadow = blobShadow(0.42); R.shadow.position.y = 0.03; g.add(R.shadow); }
  R.anim = { phase: 0, bodyYaw: 0, sneak: 0, fly: 0, sit: 0, run: 0, swing: -1, swingKind: 'punch', eat: 0, squash: 0, vy: 0, lastY: null, look: 0, lookT: 6 + Math.random() * 6, lookTo: 0, blink: 2 + Math.random() * 3, flash: 0, t: Math.random() * 10, air: 0 };
  return R;
}

// Doplňky jednotlivých obleků.
const SUIT_EXTRAS = {
  explorer(R, M) {
    const t = R.torso;
    part(t, 0.36, 0.42, 0.16, M.plate, 0, 0.4, 0.2, 0.05); // batoh
    part(t, 0.3, 0.12, 0.05, M.paint, 0, 0.5, 0.29, 0.02);
    part(t, 0.24, 0.02, 0.01, M.glow, 0, 0.3, 0.285, 0.005);
    cylPart(t, 0.008, 0.012, 0.42, M.trim, -0.13, 0.78, 0.22, 0, 0.08, 6); // anténa
    R.extras.tip = pivot(t, -0.147, 0.99, 0.22); // blikající světýlko antény
    R.extras.tip.add(new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), M.glow));
    part(R.legR.hip, 0.08, 0.13, 0.15, M.plate, 0.12, -0.22, 0, 0.025); // kapsa na stehně
  },
  engineer(R, M) {
    const t = R.torso, h = R.head;
    part(h, 0.47, 0.07, 0.5, M.plate, 0, 0.42, -0.02, 0.03); // hřeben přilby
    part(h, 0.48, 0.03, 0.08, M.plate, 0, 0.36, -0.235, 0.012); // kšilt
    cylPart(h, 0.035, 0.035, 0.04, M.trim, 0, 0.395, -0.25, Math.PI / 2, 0);
    R.extras.lamp = cylPart(h, 0.026, 0.026, 0.012, M.glow, 0, 0.395, -0.271, Math.PI / 2, 0); // čelovka
    part(t, 0.4, 0.46, 0.2, M.plate, 0, 0.4, 0.22, 0.05); // energetický článek na zádech
    cylPart(t, 0.06, 0.06, 0.3, M.glow, 0, 0.42, 0.33, 0, 0, 10);
    for (const sx of [-1, 1]) part(t, 0.06, 0.34, 0.06, M.trim, sx * 0.15, 0.42, 0.33, 0.02);
    for (const sx of [-1, 1]) part(t, 0.1, 0.1, 0.1, M.plate, sx * 0.22, 0.11, -0.06, 0.02); // brašny na opasku
    const wrench = cylPart(t, 0.012, 0.012, 0.2, M.trim, 0.27, 0.06, 0.05, 0, 0.1, 6);
    wrench.add(new THREE.Mesh(rbox(0.05, 0.03, 0.02, 0.008), M.trim)).position.y = 0.1;
    for (const sx of [-1, 1]) R.extras['pad' + sx].scale.set(1.25, 1.3, 1.15);
  },
  pilot(R, M) {
    const t = R.torso, h = R.head;
    R.visor.scale.set(1.1, 1.6, 1);
    R.visor.position.y = 0.2;
    part(h, 0.04, 0.12, 0.3, M.plate, 0, 0.45, 0.04, 0.015); // ploutvička na přilbě
    for (const sx of [-1, 1]) {
      const s = part(t, 0.05, 0.56, 0.02, M.rubber, sx * 0.12, 0.42, -0.148, 0.01); // popruhy
      s.rotation.z = sx * 0.28;
    }
    part(t, 0.3, 0.32, 0.12, M.plate, 0, 0.44, 0.19, 0.04); // tryskový batoh
    R.extras.jets = [];
    for (const sx of [-1, 1]) {
      cylPart(t, 0.07, 0.06, 0.36, M.trim, sx * 0.13, 0.4, 0.24, 0, 0, 12);
      const jet = pivot(t, sx * 0.13, 0.21, 0.24);
      cylPart(jet, 0.05, 0.05, 0.02, M.glow, 0, 0, 0, 0, 0, 12);
      R.extras.jets.push(jet);
      const fin = part(t, 0.16, 0.14, 0.02, M.paint, sx * 0.24, 0.52, 0.22, 0.01);
      fin.rotation.z = sx * -0.5;
    }
  },
  guard(R, M) {
    const t = R.torso, h = R.head;
    R.visor.scale.set(1, 0.45, 1);
    R.visor.position.y = 0.25;
    part(h, 0.05, 0.1, 0.46, M.plate, 0, 0.47, 0, 0.02); // hřeben
    part(h, 0.07, 0.17, 0.05, M.plate, 0, 0.12, -0.23, 0.02); // nosník
    for (const sx of [-1, 1]) {
      R.extras['pad' + sx].scale.set(1.5, 1.4, 1.35);
      R.extras['pad' + sx].position.y = 0.04;
      part(sx < 0 ? R.armL.sh : R.armR.sh, 0.31, 0.03, 0.34, M.glow, sx * 0.015, 0.105, 0, 0.01); // svítící lem nárameníku
    }
    const cape = (R.extras.cape = pivot(t, 0, 0.63, 0.16));
    part(cape, 0.54, 0.95, 0.025, M.cape, 0, -0.47, 0.01, 0.01);
    part(cape, 0.54, 0.02, 0.03, M.glow, 0, -0.93, 0.01, 0.006);
  },
  scientist(R, M) {
    const t = R.torso, h = R.head;
    R.helmet.material = M.coat;
    R.visor.scale.set(1.05, 0.5, 1);
    R.visor.position.y = 0.23;
    const holo = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.11), new THREE.MeshBasicMaterial({ color: M.light, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, map: holoTex() }));
    R.extras.holo = pivot(h, 0.24, 0.3, -0.24); // hologram vedle hlavy
    R.extras.holo.rotation.y = 0.5;
    R.extras.holo.add(holo);
    R.extras.holoMat = holo.material;
    part(t, 0.53, 0.5, 0.29, M.coat, 0, 0.41, 0.005, 0.07); // plášť přes hrudník
    part(t, 0.4, 0.25, 0.045, M.plate, 0, 0.49, -0.155, 0.02);
    // šosy pláště: vpředu dva, vzadu jeden; houpou se s nohama
    R.extras.flaps = [];
    for (const [x, z, w] of [[-0.12, -0.13, 0.22], [0.12, -0.13, 0.22], [0, 0.13, 0.46]]) {
      const p = pivot(R.hips, x, 0.08, z);
      part(p, w, 0.46, 0.025, M.coat, 0, -0.22, 0, 0.01);
      R.extras.flaps.push(p);
    }
    for (const a of [R.armL, R.armR]) part(a.sh, 0.17, 0.32, 0.19, M.coat, 0, -0.13, 0, 0.05);
  },
  shadow(R, M) {
    const t = R.torso, h = R.head;
    part(h, 0.5, 0.48, 0.5, M.cape, 0, 0.25, 0.02, 0.14); // kápě
    part(h, 0.36, 0.3, 0.04, M.rubber, 0, 0.22, -0.235, 0.03);
    R.visor.visible = false;
    for (const e of R.eyes) { e.position.z = -0.258; e.scale.set(1.2, 0.7, 1); }
    R.extras.strips = [];
    for (const [x, len] of [[-0.18, 0.95], [-0.06, 1.1], [0.06, 0.9], [0.18, 1.05]]) {
      const p = pivot(t, x, 0.62, 0.16);
      part(p, 0.13, len, 0.02, M.cape, 0, -len / 2, 0, 0.008);
      R.extras.strips.push(p);
    }
  },
  sky(R, M) {
    const t = R.torso, h = R.head;
    const gold = M.trim;
    part(h, 0.46, 0.05, 0.46, gold, 0, 0.36, 0, 0.02);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.018, 8, 32), new THREE.MeshStandardMaterial({ color: 0xffd890, emissive: 0xffb066, emissiveIntensity: 2.4, roughness: 0.3, metalness: 1 }));
    halo.rotation.x = Math.PI / 2;
    R.extras.halo = pivot(h, 0, 0.6, 0); // svatozář se točí a vznáší
    R.extras.halo.add(halo);
    for (const sx of [-1, 1]) part(t, 0.03, 0.4, 0.03, gold, sx * 0.24, 0.42, -0.13, 0.01);
    R.extras.jets = [];
    for (const sx of [-1, 1]) {
      const wing = part(t, 0.06, 0.4, 0.22, M.paint, sx * 0.2, 0.5, 0.2, 0.03);
      wing.rotation.z = sx * -0.35;
      cylPart(t, 0.05, 0.035, 0.18, gold, sx * 0.1, 0.34, 0.19, 0, 0, 10);
      const jet = pivot(t, sx * 0.1, 0.245, 0.19);
      cylPart(jet, 0.033, 0.033, 0.015, M.glow, 0, 0, 0, 0, 0, 10);
      R.extras.jets.push(jet);
    }
  },
  // Mág: dlouhý hábit se zlatými ornamenty, drahokam na hrudi, široké rukávy, zlaté spony na ramenou
  mage(R, M) {
    const t = R.torso, gold = M.trim;
    part(t, 0.53, 0.5, 0.3, M.fabric, 0, 0.41, 0.005, 0.07); // hábit přes hrudník
    part(t, 0.06, 0.48, 0.02, gold, 0, 0.4, -0.16, 0.01); // zlatý pruh dolů
    for (const sx of [-1, 1]) { const s = part(t, 0.04, 0.3, 0.02, gold, sx * 0.13, 0.52, -0.158, 0.008); s.rotation.z = sx * 0.5; } // límec do V
    const gem = part(t, 0.1, 0.1, 0.03, M.gem, 0, 0.5, -0.172, 0.01); // drahokam
    gem.rotation.z = Math.PI / 4;
    part(t, 0.15, 0.15, 0.02, gold, 0, 0.5, -0.162, 0.01).rotation.z = Math.PI / 4;
    part(t, 0.5, 0.07, 0.31, gold, 0, 0.14, 0, 0.02); // pás
    R.extras.flaps = []; // šosy hábitu: vpředu dva, vzadu jeden; houpou se s nohama
    for (const [x, z, w] of [[-0.13, -0.14, 0.25], [0.13, -0.14, 0.25], [0, 0.14, 0.5]]) {
      const p = pivot(R.hips, x, 0.08, z);
      part(p, w, 0.66, 0.03, M.fabric, 0, -0.32, 0, 0.01);
      part(p, w + 0.01, 0.04, 0.035, gold, 0, -0.62, 0, 0.008); // zlatý lem
      part(p, w * 0.5, 0.18, 0.035, M.fabricDark, 0, -0.45, 0, 0.008).rotation.z = 0.6; // ornament
      R.extras.flaps.push(p);
    }
    for (const a of [R.armL, R.armR]) {
      part(a.sh, 0.2, 0.2, 0.28, gold, 0, 0.03, 0, 0.05); // zlatá spona na rameni
      part(a.elbow, 0.21, 0.24, 0.23, M.fabric, 0, -0.14, 0, 0.05); // široký rukáv
      part(a.elbow, 0.22, 0.03, 0.24, gold, 0, -0.26, 0, 0.008);
    }
  },
  // Rytíř: kroužková tunika (kov) s barevným tabardem, nárameníky, krátký plášť
  knight(R, M) {
    const t = R.torso;
    part(t, 0.52, 0.5, 0.29, M.plate, 0, 0.41, 0, 0.06); // kroužková košile
    part(t, 0.3, 0.62, 0.02, M.fabric, 0, 0.3, -0.155, 0.01); // tabard vpředu
    part(t, 0.3, 0.62, 0.02, M.fabric, 0, 0.3, 0.155, 0.01);
    part(t, 0.12, 0.12, 0.025, M.gem, 0, 0.45, -0.167, 0.01).rotation.z = Math.PI / 4; // erb
    part(t, 0.5, 0.06, 0.31, M.rubber, 0, 0.14, 0, 0.02);
    for (const sx of [-1, 1]) { R.extras['pad' + sx].material = M.plate; R.extras['pad' + sx].scale.set(1.45, 1.35, 1.3); }
    const cape = (R.extras.cape = pivot(t, 0, 0.63, 0.17));
    part(cape, 0.5, 0.7, 0.025, M.cape, 0, -0.35, 0.01, 0.01);
    part(cape, 0.5, 0.03, 0.03, M.trim, 0, -0.69, 0.01, 0.006);
  },
  // Hraničář: kožená vesta, kápě spuštěná na zádech, toulec se šípy, vlající šála
  ranger(R, M) {
    const t = R.torso;
    part(t, 0.52, 0.46, 0.29, M.rubber, 0, 0.42, 0, 0.06); // kožená vesta
    part(t, 0.2, 0.46, 0.02, M.fabric, 0, 0.42, -0.152, 0.01); // košile ve výstřihu
    for (const sx of [-1, 1]) part(t, 0.03, 0.46, 0.02, M.trim, sx * 0.11, 0.42, -0.156, 0.006); // šněrování
    part(t, 0.5, 0.06, 0.31, M.plate, 0, 0.14, 0, 0.02);
    part(t, 0.4, 0.2, 0.18, M.cape, 0, 0.66, 0.15, 0.06); // spuštěná kápě
    const q = pivot(t, 0.1, 0.45, 0.2); // toulec
    q.rotation.z = -0.5;
    cylPart(q, 0.07, 0.06, 0.48, M.plate, 0, 0, 0, 0, 0, 10);
    for (const x of [-0.03, 0.02, 0.04]) { cylPart(q, 0.006, 0.006, 0.2, M.trim, x, 0.32, x * 0.5, 0, 0, 5); part(q, 0.035, 0.05, 0.004, M.eyeWhite, x, 0.42, x * 0.5, 0.002); }
    R.extras.strips = []; // šála vlaje za hlavou
    for (const [x, len] of [[-0.06, 0.4], [0.06, 0.32]]) {
      const p = pivot(t, x, 0.66, 0.14);
      part(p, 0.1, len, 0.02, M.cape, 0, -len / 2, 0, 0.008);
      R.extras.strips.push(p);
    }
    part(t, 0.32, 0.08, 0.26, M.cape, 0, 0.66, -0.01, 0.03); // šála kolem krku
  },
};
let _holo;
function holoTex() {
  return (_holo ||= canvasTex(64, (g, n) => {
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(0, 0, n, n);
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(2, 2, n - 4, n - 4);
    g.fillStyle = '#fff';
    for (let i = 0; i < 5; i++) g.fillRect(8, 10 + i * 9, 14 + ((i * 37) % 30), 3);
    g.beginPath(); g.moveTo(34, 52); for (let x = 0; x < 24; x++) g.lineTo(34 + x, 40 - Math.sin(x * 0.6) * 8 - x * 0.3); g.stroke();
    for (let y = 0; y < n; y += 3) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y, n, 1); }
  }));
}

// ============================================================ brnění na modelu
// Materiály podle úrovně: železo (ocel), krystal (ledové pláty se svítícími prasklinami),
// markorit (fialový kov s pulzující září), stínová sada (tmavá se zářícími švy), nebeská sada (bílý smalt a zlato).
const armorMats = {};
export function armorMat(tier) {
  if (armorMats[tier]) return armorMats[tier];
  const std = (o) => new THREE.MeshStandardMaterial({ map: plateTex(), ...o });
  const m = {
    3: std({ color: 0xc3c9d2, metalness: 0.9, roughness: 0.3 }),
    4: std({ color: 0xbff4ff, metalness: 0.25, roughness: 0.12, emissive: 0x38e8ff, emissiveMap: crackTex(), emissiveIntensity: 1.4 }),
    5: std({ color: 0x8a46c4, metalness: 0.8, roughness: 0.28, emissive: 0xd04bff, emissiveMap: crackTex(), emissiveIntensity: 0.9 }),
    shadow: std({ color: 0x241e30, metalness: 0.4, roughness: 0.5, emissive: 0xd04bff, emissiveMap: crackTex(), emissiveIntensity: 0.8 }),
    sky: std({ color: tame(new THREE.Color(0xf4f1ea), 0.7), metalness: 0.35, roughness: 0.22, emissive: 0xffb066, emissiveIntensity: 0.12 }),
  }[tier] || std({ color: 0x9aa0a8, metalness: 0.6, roughness: 0.4 });
  m.userData.tier = tier;
  return (armorMats[tier] = addRim(m));
}
const goldTrim = new THREE.MeshStandardMaterial({ color: 0xe0b040, metalness: 1, roughness: 0.28 });
/**
 * Brnění na postavě: pláty na helmě, hrudi, ramenou, stehnech a botách podle toho, co hráč nosí.
 * @param {ReturnType<typeof buildCharacter>} R
 * @param {(string|null)[]} ids [helma, brnění, kalhoty, boty]
 */
export function setCharacterArmor(R, ids) {
  R.armorKey = ids.join('|');
  for (const o of R.armorParts || []) { o.parent?.remove(o); if (o.userData.merged) o.geometry.dispose(); }
  R.armorParts = [];
  const add = (parent, id, w, h, d, x, y, z, r = 0.03) => {
    const tier = ITEMS[id]?.tier;
    const m = part(parent, w, h, d, armorMat(tier), x, y, z, r);
    m.userData.armor = true;
    return m;
  };
  const trim = (parent, w, h, d, x, y, z) => { part(parent, w, h, d, goldTrim, x, y, z, 0.008).userData.armor = true; };
  const [helmet, chest, legs, boots] = ids;
  const H = R.head, T = R.torso;
  if (helmet) {
    add(H, helmet, 0.49, 0.13, 0.49, 0, 0.42, 0, 0.05);
    for (const sx of [-1, 1]) add(H, helmet, 0.045, 0.27, 0.42, sx * 0.24, 0.27, 0.01, 0.02);
    add(H, helmet, 0.46, 0.26, 0.045, 0, 0.28, 0.235, 0.02);
    add(H, helmet, 0.47, 0.05, 0.05, 0, 0.345, -0.24, 0.02); // obočí
    if (ITEMS[helmet].tier === 'sky') trim(H, 0.5, 0.02, 0.5, 0, 0.36, 0);
  }
  if (chest) {
    add(T, chest, 0.46, 0.34, 0.055, 0, 0.44, -0.155, 0.03);
    add(T, chest, 0.46, 0.4, 0.05, 0, 0.42, 0.155, 0.03);
    add(T, chest, 0.5, 0.06, 0.3, 0, 0.62, 0, 0.02);
    for (const a of [R.armL, R.armR]) { add(a.sh, chest, 0.23, 0.15, 0.27, 0, 0.045, 0, 0.05); add(a.sh, chest, 0.2, 0.09, 0.24, 0, -0.07, 0, 0.03); }
    if (ITEMS[chest].tier === 'sky') trim(T, 0.47, 0.02, 0.06, 0, 0.61, -0.16);
  }
  if (legs) {
    add(T, legs, 0.48, 0.08, 0.29, 0, 0.12, 0, 0.02);
    for (const l of [R.legL, R.legR]) { add(l.hip, legs, 0.2, 0.26, 0.06, 0, -0.17, -0.11, 0.025); add(l.hip, legs, 0.2, 0.2, 0.05, 0, -0.17, 0.11, 0.02); }
  }
  if (boots) for (const l of [R.legL, R.legR]) { add(l.knee, boots, 0.23, 0.17, 0.31, 0, -0.32, -0.03, 0.05); add(l.knee, boots, 0.19, 0.16, 0.05, 0, -0.16, -0.105, 0.02); }
  R.armorParts = skinRig(R.group, (m) => m.userData.armor);
  // hrdina s helmou: vlasy (vlastní materiály, sloučené do jednoho dílu) se schovají pod ni
  if (R.M.hair) for (const o of R.group.children) if (o.isSkinnedMesh && (o.material === R.M.hair || o.material === R.M.hairDark)) o.visible = !helmet;
}

// ============================================================ animace
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (k) => k * k * (3 - 2 * k);
/** Druh máchnutí podle předmětu v ruce. */
export function swingKindOf(id) {
  const d = id && ITEMS[id];
  if (!d) return 'punch';
  if (d.tool === 'sword') return 'sweep';
  if (d.tool === 'axe' || d.tool === 'pick') return 'chop';
  if (d.tool === 'shovel') return 'scoop';
  return 'punch';
}
export const SWING_TIME = 0.3;

/**
 * Jeden snímek animace postavy.
 * @param {ReturnType<typeof buildCharacter>} R
 * @param {{ speed: number, yaw: number, pitch: number, run?: boolean, sneak?: boolean, fly?: boolean, sit?: boolean,
 *   swing?: boolean, eat?: boolean, held?: string|null, y?: number, ground?: boolean, hurt?: boolean }} s
 * @param {number} dt
 */
export function animateCharacter(R, s, dt) {
  const A = R.anim;
  A.t += dt;
  const k = (rate) => 1 - Math.exp(-dt * rate);
  // plynulé přechody mezi stavy
  A.sneak = lerp(A.sneak, s.sneak ? 1 : 0, k(12));
  A.fly = lerp(A.fly, s.fly ? 1 : 0, k(6));
  A.sit = lerp(A.sit, s.sit ? 1 : 0, k(14));
  A.run = lerp(A.run, s.run && s.speed > 1 ? 1 : 0, k(6));
  const amt = clamp(s.speed / 4.3, 0, 1.6) * (1 - A.fly * 0.85) * (1 - A.sit);
  A.phase += dt * s.speed * (1.75 - A.run * 0.35) * (1 - A.sit);
  if (amt < 0.05) A.phase = lerp(A.phase, Math.round(A.phase / Math.PI) * Math.PI, k(6)); // nohy se po zastavení srovnají
  // dopad po pádu: krátké přikrčení
  if (s.y !== undefined) {
    if (A.lastY !== null && dt > 0) {
      const vy = (s.y - A.lastY) / dt;
      if (A.vy < -5 && vy > -1 && !s.fly) A.squash = clamp(-A.vy / 14, 0.3, 1);
      A.vy = lerp(A.vy, vy, k(20));
    }
    A.lastY = s.y;
  }
  A.squash = Math.max(0, A.squash - dt * 4);
  // tělo se otáčí za pohledem: při chůzi hned, na místě až když hlava přetočí víc než 75°
  const look = wrap(s.yaw - A.bodyYaw);
  if (amt > 0.1 || A.sit > 0.5) A.bodyYaw += look * k(10);
  else if (Math.abs(look) > 1.3) A.bodyYaw += (look - Math.sign(look) * 1.3) * k(8);
  A.bodyYaw = wrap(A.bodyYaw);
  // nečinnost: občas se rozhlédne
  if ((A.lookT -= dt) < 0) { A.lookT = 6 + Math.random() * 6; A.lookTo = amt < 0.1 && !s.swing ? (Math.random() - 0.5) * 1.4 : 0; if (A.lookTo) A.lookHold = 1.5 + Math.random(); }
  if (A.lookHold !== undefined && (A.lookHold -= dt) < 0) { A.lookTo = 0; A.lookHold = undefined; }
  A.look = lerp(A.look, A.lookTo, k(3));
  R.group.rotation.y = A.bodyYaw;
  R.head.rotation.set(clamp(s.pitch * 0.85, -1.1, 1.1) * (1 - A.sit * 0.3) + A.sneak * 0.45, clamp(wrap(s.yaw - A.bodyYaw) + A.look, -1.35, 1.35), 0);
  // nohy a ruce
  const sw = Math.sin(A.phase), cw = Math.cos(A.phase);
  const legA = Math.min((0.62 + A.run * 0.3) * amt, 0.95); // krok (při běhu delší, ale nejvýš ~55°)
  const L = R.legL, Rg = R.legR;
  L.hip.rotation.x = sw * legA;
  Rg.hip.rotation.x = -sw * legA;
  const kneeA = (0.5 + A.run * 0.6) * Math.min(amt, 1.1);
  L.knee.rotation.x = -Math.max(0, -cw) * kneeA;
  Rg.knee.rotation.x = -Math.max(0, cw) * kneeA;
  // plížení: pokrčené nohy, předklon; let: nohy dozadu; sezení: stehna dopředu
  for (const l of [L, Rg]) {
    l.hip.rotation.x += A.sneak * 0.45 - A.fly * 0.25 + A.sit * 1.5;
    l.knee.rotation.x += -A.sneak * 0.75 - A.fly * 0.35 - A.sit * 1.5;
  }
  const breathe = Math.sin(A.t * Math.PI * 0.5);
  R.chest.scale.set(1 + breathe * 0.008, 1 + breathe * 0.012, 1 + breathe * 0.01);
  R.hips.position.y = 0.8 - A.sneak * 0.2 + Math.abs(cw) * 0.035 * amt - A.squash * 0.09 - A.sit * 0.02;
  R.torso.rotation.set(-A.run * 0.14 * Math.min(amt, 1) - A.sneak * 0.5 - A.fly * 0.25 + A.squash * -0.12, 0, Math.sin(A.phase) * 0.03 * amt);
  const armA = Math.min((0.55 + A.run * 0.4) * amt, 1.05);
  const idle = (1 - Math.min(amt, 1)) * (1 - A.sit);
  for (const [a, sx, ph] of [[R.armL, -1, -1], [R.armR, 1, 1]]) {
    a.sh.rotation.set(ph * sw * armA + A.sneak * 0.25 + A.sit * 0.35 - A.fly * 0.5, 0, sx * (0.06 + idle * Math.sin(A.t * 1.1 + sx) * 0.025 + A.fly * 0.35));
    a.elbow.rotation.x = 0.12 + A.run * 0.9 * Math.min(amt, 1) + A.sit * 0.4;
  }
  // máchnutí (pravá ruka): seknutí, máchnutí mečem, nabrání lopatou, úder
  if (s.swing && A.swing < 0) { A.swing = 0; A.swingKind = swingKindOf(s.held); }
  if (A.swing >= 0) {
    A.swing += dt / SWING_TIME;
    const f = Math.min(A.swing, 1), q = Math.sin(Math.sqrt(f) * Math.PI), ar = R.armR;
    if (A.swingKind === 'chop') { const up = f < 0.35 ? ease(f / 0.35) : 1 - ease((f - 0.35) / 0.65); ar.sh.rotation.x = lerp(0.6, 2.7, up); ar.elbow.rotation.x = 0.3 + up * 0.3; }
    else if (A.swingKind === 'sweep') { ar.sh.rotation.x = 1.3 + q * 0.2; ar.sh.rotation.z = lerp(0.9, -0.7, ease(f)); ar.elbow.rotation.x = 0.2; }
    else if (A.swingKind === 'scoop') { ar.sh.rotation.x = 0.4 + q * 1.1; ar.elbow.rotation.x = 0.9 - q * 0.6; }
    else { ar.sh.rotation.x = 0.6 + q * 1.1; ar.elbow.rotation.x = 1.0 - q * 0.9; }
    R.torso.rotation.y = q * (A.swingKind === 'sweep' ? -0.35 : -0.2);
    if (A.swing >= 1) A.swing = s.swing ? 0 : -1;
  } else {
    R.torso.rotation.y = 0;
    if (s.held) { R.armR.sh.rotation.x = Math.max(R.armR.sh.rotation.x, 0.25 + A.sit * 0.35); R.armR.elbow.rotation.x = Math.max(R.armR.elbow.rotation.x, 0.4); }
  }
  // jídlo: ruka k ústům, kousání
  A.eat = lerp(A.eat, s.eat ? 1 : 0, k(10));
  if (A.eat > 0.01) {
    const ar = R.armR, bite = Math.abs(Math.sin(A.t * 9)) * 0.12;
    ar.sh.rotation.x = lerp(ar.sh.rotation.x, 1.55 + bite, A.eat);
    ar.sh.rotation.z = lerp(ar.sh.rotation.z, -0.45, A.eat);
    ar.elbow.rotation.x = lerp(ar.elbow.rotation.x, 1.35, A.eat);
    R.head.rotation.x -= A.eat * (0.12 + bite * 0.5);
  }
  // dopad: přikrčení celého těla
  R.group.scale.set(1 + A.squash * 0.05, 1 - A.squash * 0.07, 1 + A.squash * 0.05);
  // mrkání
  if ((A.blink -= dt) < 0) A.blink = 2.5 + Math.random() * 4;
  const closed = A.blink < 0.12 ? 0.15 : 1;
  for (const e of R.eyes) e.scale.y = closed * (R.costume.s === 'shadow' ? 0.7 : 1);
  // zásah: oblek krátce zčervená
  if (s.hurt) A.flash = 1;
  A.flash = Math.max(0, A.flash - dt * 3);
  if (A.flash > 0 || A.flashOn) { for (const m of R.M.flashable) m.emissive.setRGB(A.flash * 0.9, A.flash * 0.08, A.flash * 0.05); A.flashOn = A.flash > 0; }
  animateExtras(R, s, amt, dt);
}
function animateExtras(R, s, amt, dt) {
  const E = R.extras, A = R.anim, t = A.t;
  if (E.tip) E.tip.scale.setScalar(t % 1.6 < 0.8 ? 1 : 0.001);
  if (E.jets) for (const j of E.jets) { j.scale.setScalar(1 + A.fly * 0.6 + Math.sin(t * 40) * 0.05 * A.fly); }
  if (R.M.glow && (E.jets || E.halo)) R.M.glow.emissiveIntensity = 2.2 + A.fly * 2.5;
  if (E.halo) { E.halo.rotation.y += dt * 0.8; E.halo.position.y = 0.6 + Math.sin(t * 2) * 0.02; }
  if (E.holo) { E.holoMat.opacity = 0.35 + Math.sin(t * 30) * 0.04 + (Math.random() < 0.02 ? -0.2 : 0); E.holo.position.y = 0.3 + Math.sin(t * 1.7) * 0.01; }
  const drag = Math.min(s.speed, 9) * 0.07 + A.fly * 0.7 + Math.max(0, A.vy) * 0.03;
  if (E.cape) E.cape.rotation.x = lerp(E.cape.rotation.x, -(0.06 + drag + Math.sin(t * 3.1) * 0.03 + A.sneak * -0.4), 1 - Math.exp(-dt * 6));
  if (E.strips) E.strips.forEach((p, i) => { p.rotation.x = lerp(p.rotation.x, -(0.05 + drag * (0.8 + i * 0.12) + Math.sin(t * 3 + i * 1.7) * 0.06 - A.sneak * 0.4), 1 - Math.exp(-dt * 7)); });
  if (E.flaps) {
    const [fl, fr, bk] = E.flaps;
    fl.rotation.x = Math.max(0, R.legL.hip.rotation.x) * 0.9 + A.sit * -1.3;
    fr.rotation.x = Math.max(0, R.legR.hip.rotation.x) * 0.9 + A.sit * -1.3;
    bk.rotation.x = -Math.max(0, -Math.min(R.legL.hip.rotation.x, R.legR.hip.rotation.x)) * 0.8 - drag * 0.3;
  }
}

/**
 * Předloktí s rukavicí pro pohled z první osoby (stejné barvy jako oblek). Rukavice je v počátku, předloktí míří k +Y.
 * @param {object} costume
 */
export function buildFPArm(costume) {
  const c = cleanCostume(costume), M = suitMats(c);
  const g = new THREE.Group(), arm = new THREE.Group();
  g.add(arm);
  const fabric = c.s === 'scientist' ? M.coat : M.fabric;
  part(arm, 0.14, 0.5, 0.16, fabric, 0, 0.3, 0, 0.05);
  part(arm, 0.165, 0.09, 0.185, M.plate, 0, 0.09, 0, 0.025);
  part(arm, 0.17, 0.018, 0.19, M.glow, 0, 0.14, 0, 0.006);
  part(arm, 0.15, 0.13, 0.17, M.rubber, 0, -0.01, 0, 0.045);
  part(arm, 0.04, 0.09, 0.15, M.rubber, -0.085, -0.02, -0.01, 0.02); // palec
  mergeStatic(arm);
  g.userData.mats = M;
  return g;
}

/** Uklidí materiály postavy (náhled v menu, změna obleku). Sdílené tvary a textury zůstávají. */
export function disposeCharacter(R) {
  const M = R.M || R.userData?.mats;
  if (!M) return;
  for (const m of Object.values(M)) if (m?.isMaterial) m.dispose();
  const root = R.group || R;
  root.traverse((o) => { if (o.isMesh && o.userData.merged) o.geometry.dispose(); });
  root.userData.skeleton?.dispose();
}
