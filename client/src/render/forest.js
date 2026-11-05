// Les a balvany kolem hráče.
import '../world/world-state.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { hash2 } from '../../../shared/util.js';
import { ROCK_CELL, TREE_CELL } from '../../../shared/world/constants.js';
import { TREE_THICK, rockAt, treeAt } from '../../../shared/world/nature.js';
import { isMark, terrainH } from '../../../shared/world/terrain.js';
import { GFX } from '../game/prefs.js';
import { refreshPonds } from '../world/fishing.js';
import { FX } from './look.js';
import { U, scene } from './renderer.js';
import { SHADOW_LAYER } from './shadows.js';
import { refreshShards } from './shards.js';
import { barkTex, normalMapFrom, rockTex } from './textures.js';
import { crownGeo, leafCardGeo, leafTexture, lumpy, needleTexture, pineCardGeo, pineTierGeo, windy } from './foliage.js';

// ============================================================ les a balvany
export { lumpy };
const MAX_TREES = 3000, TREE_RADIUS = GFX.trees; // dohled lesa podle nastavení grafiky
// Les se kreslí po výsečích kolem hráče (8 výsečí + blízký kruh): co je za zády, kamera vůbec nekreslí (frustum culling).
// Blízké koruny jsou podrobné, vzdálené levné (LOD); nízká grafika má všude levné. Šetří to většinu práce grafické karty.
const SECTORS = 8, NEAR_R = 26, LOD_R = FX.post ? (FX.quality === 'high' ? 62 : 48) : 0;
function makeBatch(geo, mat, cap) {
  const meshes = [];
  for (let i = 0; i <= SECTORS; i++) {
    const m = new THREE.InstancedMesh(geo, mat, i === 0 ? Math.ceil(cap * 0.35) : Math.ceil(cap * 0.5));
    m.count = 0; m.userData.noCast = FX.shadows;
    scene.add(m);
    meshes.push(m);
  }
  return { meshes, n: new Int32Array(SECTORS + 1), geo };
}
const sectorOf = (dx, dz) => (dx * dx + dz * dz < NEAR_R * NEAR_R ? 0 : 1 + (Math.floor(((Math.atan2(dz, dx) / (Math.PI * 2)) + 1) * SECTORS) % SECTORS));
function finishBatch(b) {
  b.meshes.forEach((m, i) => {
    m.count = b.n[i];
    m.visible = m.count > 0;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    if (m.count) { m.computeBoundingSphere(); m.boundingSphere.radius += 3; } // + kývání ve větru
  });
}
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5b4632, roughness: 0.95 });
if (FX.post) { trunkMat.normalMap = normalMapFrom(barkTex); trunkMat.normalScale.setScalar(1.2); } // kůra (reliéf)
const crownMat = windy(new THREE.MeshStandardMaterial({ roughness: 0.8 }));
const trunks = makeBatch(new THREE.CylinderGeometry(0.16, 0.28, 1, 9).translate(0, 0.5, 0), windy(trunkMat, 'trunk'), MAX_TREES);
const blobsFar = makeBatch(crownGeo(1), crownMat, MAX_TREES * 5);
const blobsNear = LOD_R ? makeBatch(crownGeo(3), crownMat, 3000) : null;
const cones = makeBatch(pineTierGeo(), windy(new THREE.MeshStandardMaterial({ roughness: 0.85 }), 'pine'), MAX_TREES * 4);
const LEAF_N = FX.leafCards ? 2600 : 0;
const leafMat = (map) => windy(new THREE.MeshStandardMaterial({ map, alphaTest: 0.45, alphaToCoverage: FX.msaa > 0, side: THREE.DoubleSide, roughness: 0.75 }), 'leaves');
const leaves = FX.leafCards ? makeBatch(leafCardGeo(), leafMat(leafTexture()), LEAF_N) : null;
const needles = FX.leafCards ? makeBatch(pineCardGeo(), leafMat(needleTexture()), LEAF_N) : null;
const rocks = makeBatch(lumpy(new THREE.IcosahedronGeometry(1, 1), 0.3, 4.2).scale(1, 0.6, 1), new THREE.MeshStandardMaterial({ map: rockTex, roughness: 0.95, flatShading: true }), 1500);
// Stínové kopie blízkých stromů a balvanů: vrhají stín, ale vidět nejsou (vrstva SHADOW_LAYER, viz render/shadows.js).
// Celý les do mapy stínů kreslit nejde (tisíce stromů), tak se do ní dávají jen ty v dosahu stínů.
const SHADOW_R2 = (FX.shadowRange + 34) ** 2, proxyMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
const proxies = new Map();
if (FX.shadows) for (const [src, n] of [[trunks, 1200], [blobsFar, 3000], [cones, 2400], [rocks, 400]]) {
  const p = new THREE.InstancedMesh(src.geo, proxyMat, n);
  Object.assign(p, { frustumCulled: false, count: 0, castShadow: true });
  p.layers.set(SHADOW_LAYER);
  p.userData.sh = 1;
  scene.add(p);
  proxies.set(src, p);
}
if (blobsNear) proxies.set(blobsNear, proxies.get(blobsFar)); // stín koruny stačí z levného tvaru
// (kde roste který strom a leží který balvan: treeAt a rockAt v shared/world/nature.js)

export const forestTrees = [], forestRocks = [], forestColliders = [];
export const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color(), leafCol = new THREE.Color();
const LEAF_R2 = (FX.leafCards + 30) ** 2; // lístky dostanou stromy o kus dál, než se ukážou (les se přestaví po 24 m)
const OAK_BLOBS = [[0, 1.3, 0, 2.1], [1.3, 0.5, 0.3, 1.5], [-1.1, 0.6, -0.6, 1.5], [0.2, 0.5, -1.3, 1.4], [-0.4, 2.3, 0.3, 1.3]];
let forestKey = '';

// zelenožlutý nádech lístků listnáčů (lineárně; textura lístků je šedá), třešeň ho nemá
const LEAF_TINT = new THREE.Color(0.79, 1, 0.57), WHITE = new THREE.Color(1, 1, 1);
export function rebuildForest(px, pz, force = false) {
  const key = Math.floor(px / 24) + ',' + Math.floor(pz / 24);
  if (key === forestKey && !force) return;
  forestKey = key;
  forestTrees.length = forestRocks.length = forestColliders.length = 0;
  let nt = 0, nb = 0, nc = 0, nr = 0, nl = 0;
  let leafTint = LEAF_TINT;
  for (const p of proxies.values()) p.count = 0;
  for (const b of [trunks, blobsFar, blobsNear, cones, leaves, needles, rocks]) b?.n.fill(0);
  const add = (b, sec) => { const m = b.meshes[sec], i = b.n[sec]; if (i >= m.instanceMatrix.count) return; m.setMatrixAt(i, dummy.matrix); b.n[sec]++; return i; };
  const put = (batch, _i, x, y, z, sx, sy, sz, ry, color, rx = 0, rz = 0) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(rx, ry, rz);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    const dx = x - px, dz = z - pz, d2 = dx * dx + dz * dz, sec = sectorOf(dx, dz);
    const near = batch === blobsFar && blobsNear && d2 < LOD_R * LOD_R;
    const b = near ? blobsNear : batch;
    const i = add(b, sec);
    if (i === undefined) return;
    b.meshes[sec].setColorAt(i, color);
    const p = proxies.get(batch);
    if (p && p.count < p.instanceMatrix.count && d2 < SHADOW_R2) p.setMatrixAt(p.count++, dummy.matrix);
    // lístky kolem blízkých korun (barva o kousek světlejší a žlutější než koruna), jehličí kolem pater smrků
    const cards = batch === blobsFar ? leaves : batch === cones ? needles : null;
    if (cards && nl < LEAF_N && d2 < LEAF_R2) {
      if (cards === leaves) dummy.scale.multiplyScalar(1.04);
      dummy.updateMatrix();
      const j = add(cards, sec);
      if (j !== undefined) { nl++; cards.meshes[sec].setColorAt(j, cards === leaves ? leafCol.copy(color).offsetHSL(0.01, 0.02, 0.03).multiply(leafTint) : leafCol.copy(color).offsetHSL(0, 0.04, 0.05)); }
    }
  };
  const R2 = TREE_RADIUS * TREE_RADIUS;
  for (let cz = Math.floor((pz - TREE_RADIUS) / TREE_CELL); cz <= Math.floor((pz + TREE_RADIUS) / TREE_CELL); cz++) {
    for (let cx = Math.floor((px - TREE_RADIUS) / TREE_CELL); cx <= Math.floor((px + TREE_RADIUS) / TREE_CELL); cx++) {
      const t = treeAt(cx, cz);
      if (!t || (t.x - px) ** 2 + (t.z - pz) ** 2 > R2 || nt >= MAX_TREES) continue;
      const y = terrainH(t.x, t.z) - 0.2;
      t.y = y;
      forestTrees.push(t);
      const K = t.kind, thick = TREE_THICK[K] || 1;
      leafTint = K === 'cherry' ? WHITE : LEAF_TINT;
      const trunkCol = t.mark ? tmpColor.setRGB(0.55, 0.8, 1.5) : K === 'cactus' ? tmpColor.setRGB(0.55, 1.7 + t.v * 0.3, 0.5) : K === 'mushroom' ? tmpColor.setRGB(2.3, 2.2, 1.95)
        : K === 'cherry' ? tmpColor.setHSL(0.02, 0.3, 0.42) : K === 'dead' || K === 'deadbush' ? tmpColor.setHSL(0.08, 0.1, 0.38) : K === 'acacia' ? tmpColor.setHSL(0.06, 0.15, 0.55) : tmpColor.setHSL(0.08, 0.25, 0.75 + t.v * 0.25);
      put(trunks, nt++, t.x, y, t.z, t.s * thick, t.trunkH, t.s * thick, t.rot, trunkCol);
      forestColliders.push({ x: t.x, z: t.z, r: 0.3 * t.s * thick });
      const c = Math.cos(t.rot), s = Math.sin(t.rot);
      if (K === 'cactus' || K === 'dead' || K === 'deadbush') {
        // větve: kaktus má boční "ruce", suchý strom pahýly
        for (const side of [-1, 1]) {
          if (nt >= MAX_TREES) break;
          const ax = c * side * 0.42 * t.s, az = s * side * 0.42 * t.s;
          if (K === 'cactus') put(trunks, nt++, t.x + ax, y + t.trunkH * (side > 0 ? 0.45 : 0.3), t.z + az, t.s * 0.9, t.trunkH * 0.38, t.s * 0.9, t.rot, tmpColor.setRGB(0.55, 1.75, 0.5));
          else put(trunks, nt++, t.x, y + t.trunkH * (0.55 + side * 0.12), t.z, t.s * 0.45, t.trunkH * 0.45, t.s * 0.45, t.rot + side, tmpColor.setHSL(0.08, 0.1, 0.36), 0.8 * side, 0.3);
        }
      } else if (K === 'mushroom') {
        put(blobsFar, nb++, t.x, y + t.trunkH, t.z, 2.3 * t.s, 0.8 * t.s, 2.3 * t.s, t.rot, t.v > 0.6 ? tmpColor.setHSL(0.07, 0.45, 0.33) : tmpColor.setHSL(0.0, 0.72, 0.4 + t.v * 0.08));
      } else if (K === 'acacia') {
        put(blobsFar, nb++, t.x + c * 0.6 * t.s, y + t.trunkH, t.z + s * 0.6 * t.s, 2.9 * t.s, 0.55 * t.s, 2.9 * t.s, t.rot, tmpColor.setHSL(0.2, 0.45, 0.24 + t.v * 0.06));
        put(blobsFar, nb++, t.x - c * 1.2 * t.s, y + t.trunkH - 0.5 * t.s, t.z - s * 1.2 * t.s, 1.8 * t.s, 0.45 * t.s, 1.8 * t.s, t.rot + 1, tmpColor.setHSL(0.21, 0.45, 0.22));
      } else if (K === 'spruce') {
        for (let i = 0; i < 4; i++) {
          const r = (2.0 - i * 0.42) * t.s;
          put(cones, nc++, t.x, y + t.trunkH * 0.5 + i * 1.25 * t.s, t.z, r, 2.4 * t.s, r, t.rot + i, tmpColor.setHSL(0.5, 0.12, 0.62 + t.v * 0.12)); // zasněžené větve
        }
      } else if (K === 'cherry' || K === 'jungle') {
        const big = K === 'jungle' ? 1.35 : 1;
        for (const [ox, oy, oz, r] of OAK_BLOBS) {
          const bx = (ox * c - oz * s) * t.s * big, bz = (ox * s + oz * c) * t.s * big;
          put(blobsFar, nb++, t.x + bx, y + t.trunkH + oy * t.s, t.z + bz, r * t.s * big, r * t.s * big, r * t.s * big, t.rot + ox,
            K === 'cherry' ? tmpColor.setHSL(0.975 + t.v * 0.015, 0.72, 0.66 + t.v * 0.06 + oy * 0.02) : tmpColor.setHSL(0.3 + t.v * 0.04, 0.6, 0.12 + t.v * 0.05));
        }
      } else if (t.pine) {
        for (let i = 0; i < 4; i++) {
          const r = (2.0 - i * 0.42) * t.s;
          put(cones, nc++, t.x, y + t.trunkH * 0.5 + i * 1.25 * t.s, t.z, r, 2.4 * t.s, r, t.rot + i, t.mark ? tmpColor.setHSL(0.74 + t.v * 0.08, 0.6, 0.22 + t.v * 0.08) : tmpColor.setHSL(0.36 + t.v * 0.04, 0.45, 0.13 + t.v * 0.05));
        }
      } else {
        for (const [ox, oy, oz, r] of OAK_BLOBS) {
          const bx = (ox * c - oz * s) * t.s, bz = (ox * s + oz * c) * t.s;
          put(blobsFar, nb++, t.x + bx, y + t.trunkH + oy * t.s, t.z + bz, r * t.s, r * t.s, r * t.s, t.rot + ox, t.mark ? tmpColor.setHSL(0.52 + t.v * 0.1 + oy * 0.02, 0.75, 0.3 + t.v * 0.1) : tmpColor.setHSL(0.24 + t.v * 0.06 + oy * 0.01, 0.5, 0.2 + t.v * 0.08));
        }
      }
    }
  }
  const RR = GFX.rocks;
  for (let cz = Math.floor((pz - RR) / ROCK_CELL); cz <= Math.floor((pz + RR) / ROCK_CELL); cz++) {
    for (let cx = Math.floor((px - RR) / ROCK_CELL); cx <= Math.floor((px + RR) / ROCK_CELL); cx++) {
      const rk = rockAt(cx, cz);
      if (!rk || (rk.x - px) ** 2 + (rk.z - pz) ** 2 > RR * RR || nr >= 1500) continue;
      const { key, x, z, s, iron, r } = rk;
      const y = terrainH(x, z) - 0.25 * s;
      forestRocks.push({ key, x, y, z, s, iron });
      put(rocks, nr++, x, y, z, s * 1.2, s, s, r * 900, iron ? tmpColor.setHSL(0.06, 0.55, 0.42) : isMark(x) ? tmpColor.setHSL(0.72, 0.25, 0.45 + hash2(cx, cz) * 0.25) : tmpColor.setHSL(0.1, 0.06, 0.55 + hash2(cx, cz) * 0.3), r * 3, r * 7);
      if (s > 0.6) forestColliders.push({ x, z, r: 0.9 * s });
    }
  }
  for (const b of [trunks, blobsFar, blobsNear, cones, leaves, needles, rocks]) if (b) finishBatch(b);
  for (const p of proxies.values()) p.instanceMatrix.needsUpdate = true;
  refreshShards(px, pz);
  refreshPonds(px, pz);
}
