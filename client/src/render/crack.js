// Praskliny na bloku při těžbě: 10 stupňů (jako v Minecraftu), textury se nakreslí kódem.
// Přes blok se položí o kousek větší kvádr se ztmavenými prasklinami (u schodů a půlbloků jen jejich tvar).
import * as THREE from 'three';
import { BLOCKS, shapeBoxes } from '../../../shared/data/index.js';
import { blockMeta, bkey } from '../../../shared/world/state.js';
import { terrainH } from '../../../shared/world/terrain.js';
import { QUALITY } from '../game/prefs.js';
import { scene } from './renderer.js';

export const STAGES = 10;
let mesh = null, textures = null, cube = null, decal = null, decalCell = '';
const shapeGeo = new Map();

// Praskliny rostou od středu: každý stupeň přidá další úsečky (stejné náhodné číslo = stejný vzor pro všechny stupně).
function makeTextures() {
  const N = QUALITY === 'low' ? 64 : 128, s = N / 64;
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // větve: [x, y, úhel, tloušťka]; každý krok prodlouží živé větve, občas se některá rozdvojí
  const segs = [], a0 = rand() * 6.28;
  let tips = [[32, 32, a0, 1.5], [32, 32, a0 + 2.3, 1.3], [32, 32, a0 + 4.2, 1.2]];
  const maxStep = 26;
  for (let step = 0; step < maxStep; step++) {
    const nt = [];
    for (const [x, y, a, w] of tips) {
      const na = a + (rand() - 0.5) * 0.9, len = 2 + rand() * 2.6;
      const nx = x + Math.cos(na) * len, ny = y + Math.sin(na) * len;
      segs.push({ x, y, nx, ny, step, w });
      if (nx > 1 && nx < 63 && ny > 1 && ny < 63) nt.push([nx, ny, na, Math.max(0.45, w * 0.94)]);
      if (rand() < 0.1 && step < 18) nt.push([nx, ny, na + (rand() < 0.5 ? 1 : -1) * (0.7 + rand() * 0.6), Math.max(0.45, w * 0.65)]);
    }
    tips = nt.length ? nt : [[8 + rand() * 48, 8 + rand() * 48, rand() * 6.28, 0.8]];
  }
  const out = [];
  for (let st = 0; st < STAGES; st++) {
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d');
    g.lineCap = 'round';
    const limit = ((st + 1) / STAGES) * maxStep;
    // světlý okraj (lom kamene chytá světlo), pak tmavá prasklina
    for (const pass of [0, 1]) {
      for (const q of segs) {
        if (q.step > limit) continue;
        g.strokeStyle = pass ? `rgba(16,12,10,${0.6 + st * 0.035})` : 'rgba(255,248,235,0.14)';
        g.lineWidth = q.w * s * (pass ? 1 : 1.6) * (0.8 + st * 0.03);
        g.beginPath();
        g.moveTo((q.x + (pass ? 0 : 0.6)) * s, (q.y + (pass ? 0 : 0.6)) * s);
        g.lineTo((q.nx + (pass ? 0 : 0.6)) * s, (q.ny + (pass ? 0 : 0.6)) * s);
        g.stroke();
      }
    }
    // pozdní stupně: drobné odštěpky a ztmavení
    if (st >= 6) { g.fillStyle = `rgba(0,0,0,${(st - 5) * 0.03})`; g.fillRect(0, 0, N, N); }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    out.push(t);
  }
  return out;
}
function init() {
  textures = makeTextures();
  cube = new THREE.BoxGeometry(1.004, 1.004, 1.004);
  mesh = new THREE.Mesh(cube, new THREE.MeshBasicMaterial({ map: textures[0], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4, toneMapped: true }));
  mesh.renderOrder = 2;
  mesh.visible = false;
  scene.add(mesh);
  // Povrch terénu je hladký (ne kostky): praskliny jako nálepka, která kopíruje svah
  decal = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 4, 4).rotateX(-Math.PI / 2), mesh.material);
  decal.renderOrder = 2;
  decal.visible = false;
  scene.add(decal);
}
function fitDecal(x, z) {
  const key = x + ',' + z;
  if (decalCell === key) return;
  decalCell = key;
  const p = decal.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, terrainH(x + 0.5 + p.getX(i), z + 0.5 + p.getZ(i)) + 0.02); // hladký povrch terénu
  p.needsUpdate = true;
  decal.geometry.computeBoundingSphere();
  decal.position.set(x + 0.5, 0, z + 0.5);
}
// Tvar schodů / půlbloku (kvádry v buňce)
function geoFor(shape, meta) {
  const key = shape + ':' + meta;
  if (!shapeGeo.has(key)) {
    const parts = shapeBoxes(shape, meta).map(([x0, y0, z0, x1, y1, z1]) => new THREE.BoxGeometry(x1 - x0 + 0.004, y1 - y0 + 0.004, z1 - z0 + 0.004).translate((x0 + x1) / 2 - 0.5, (y0 + y1) / 2 - 0.5, (z0 + z1) / 2 - 0.5));
    const g = parts.length === 1 ? parts[0] : mergeBoxes(parts);
    shapeGeo.set(key, g);
  }
  return shapeGeo.get(key);
}
function mergeBoxes(parts) {
  const pos = [], nor = [], uv = [], idx = [];
  let off = 0;
  for (const p of parts) {
    pos.push(...p.attributes.position.array); nor.push(...p.attributes.normal.array); uv.push(...p.attributes.uv.array);
    for (const i of p.index.array) idx.push(i + off);
    off += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
let hitAt = -1;
/** Úder do bloku: obal s prasklinami se na chvilku nafoukne (cuknutí bloku jako v Hytale). */
export function crackHit() { hitAt = performance.now(); }
/** Má cíl praskliny? (bloky a podzemí; malé modely jako pochodeň nebo táborák ne) */
export function crackable(t) {
  if (!t || !t.cell) return false;
  if (t.kind === 'vox') return true;
  if (t.kind !== 'block') return false;
  const b = BLOCKS[t.type];
  return !!b && (b.solid || !!b.shape) && t.type !== 'chair';
}
/**
 * Ukáže praskliny na cíli podle postupu těžby 0–1 (0 nebo null = schovat).
 * @param {object|null} t cíl z pickTarget()
 * @param {number} progress
 */
export function showCracks(t, progress) {
  if (!progress || progress <= 0 || !crackable(t)) { if (mesh) mesh.visible = decal.visible = false; return; }
  if (!mesh) init();
  const st = Math.min(STAGES - 1, Math.floor(progress * STAGES));
  if (mesh.material.map !== textures[st]) { mesh.material.map = textures[st]; mesh.material.needsUpdate = true; }
  const [x, y, z] = t.cell;
  if (t.surface) { fitDecal(x, z); decal.visible = true; mesh.visible = false; return; }
  decal.visible = false;
  const sh = t.kind === 'block' && BLOCKS[t.type].shape;
  mesh.geometry = sh ? geoFor(sh, blockMeta.get(bkey(x, y, z)) || 0) : cube;
  mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
  const k = Math.max(0, 1 - (performance.now() - hitAt) / 130); // cuknutí po úderu (130 ms)
  mesh.scale.setScalar(1 + 0.07 * k * k);
  mesh.visible = true;
}
/** Aktuální stupeň (pro testy): -1 = bez prasklin. */
export const crackStage = () => (mesh?.visible || decal?.visible ? textures.indexOf(mesh.material.map) : -1);
