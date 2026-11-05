// Podzemí: 3D model chunků 16×16.
import './blocks.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { on } from '../../../shared/events.js';
import { V, VMIN, VOX, editAt, naturalAt, topY, voxEdits } from '../../../shared/world/voxels.js';
import { dirtyVoxChunks } from '../world/dig.js';
import { TERRAIN_GLSL } from './glsl.js';
import { QUALITY } from '../game/prefs.js';
import { LK } from './look.js';
import { U, renderer, scene } from './renderer.js';
import { arrayTex } from './texgen.js';
import { fireBaker, relightChunks, relightNearVox, scanFires } from './torch-light.js';
import { buildVoxTextures } from './vox-tex.js';

// ============================================================ podzemí – vykreslení
// Textury bloků podzemí (client/src/render/vox-tex.js): pole textur, každý druh bloku má vlastní vrstvu
// (barva, reliéf, drsnost/kov/svícení), takže se při oddálení nemíchají sousední dlaždice jako v atlasu.
const VT = buildVoxTextures(QUALITY === 'low' ? 64 : 128);
export const voxTex = {
  alb: arrayTex(VT.alb, VT.T, VT.T, VT.D, true), orm: arrayTex(VT.orm, VT.T, VT.T, VT.D), nrm: arrayTex(VT.nrm, VT.T, VT.T, VT.D),
};
for (const t of Object.values(voxTex)) t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

// Jeden materiál pro celé podzemí. Části bloků, které vyčnívají nad hladký terén, se nekreslí (kraje díry tak
// přesně navazují na povrch). Hrany bloků jsou trochu tmavší (je vidět, kde blok končí), krystaly a markorit svítí
// jen svými zrny a jiskří, kovová zrna rud se lesknou. Reliéf (normálová mapa) jen se střední a vysokou grafikou.
export const voxUniforms = { uVAlb: { value: voxTex.alb }, uVOrm: { value: voxTex.orm }, uVNrm: { value: voxTex.nrm }, uVGlow: { value: 1.25 }, uVNrmK: { value: QUALITY === 'high' ? 0.7 : 0.6 }, uVEdge: { value: 0.15 } }; // uVEdge: tmavší hrana bloku (víc = jeskyně jako obkládačky)
function voxMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1 });
  if (QUALITY !== 'low') mat.defines = { VOX_NRM: '' };
  mat.customProgramCacheKey = () => 'vox' + QUALITY;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, voxUniforms, { uTime: U.time, uFire });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aTile;
attribute vec3 aGlow;
attribute float aFire;
varying float vTile;
varying vec3 vGlow;
varying float vFire;
varying vec2 vVUv;
varying vec3 vWPos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vTile = aTile;
vGlow = aGlow;
vFire = aFire;
vVUv = uv;
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2DArray uVAlb, uVOrm, uVNrm;
uniform float uTime, uVGlow, uVNrmK, uVEdge;
uniform vec3 uFire;
varying float vTile;
varying vec3 vGlow;
varying float vFire;
varying vec2 vVUv;
varying vec3 vWPos;
${TERRAIN_GLSL}`)
      .replace('void main() {', `void main() {
  if (vWPos.y > terrainH(vWPos.xz) + 0.02) discard;`)
      .replace('#include <map_fragment>', `vec3 vAuv = vec3(vVUv, vTile);
vec4 vAlb = texture(uVAlb, vAuv);
vec4 vOrm = texture(uVOrm, vAuv);
diffuseColor *= vAlb;
vec2 vEd = abs(fract(vVUv) - 0.5);
diffuseColor.rgb *= 1.0 - uVEdge * smoothstep(0.43, 0.5, max(vEd.x, vEd.y));`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vOrm.g;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vOrm.b;')
      .replace('#include <normal_fragment_maps>', `#ifdef VOX_NRM
{
  vec3 q0 = dFdx(-vViewPosition), q1 = dFdy(-vViewPosition);
  vec2 st0 = dFdx(vVUv), st1 = dFdy(vVUv);
  vec3 q1p = cross(q1, normal), q0p = cross(normal, q0);
  vec3 T = q1p * st0.x + q0p * st1.x, B = q1p * st0.y + q0p * st1.y;
  float det = max(dot(T, T), dot(B, B)), sc = det == 0.0 ? 0.0 : inversesqrt(det);
  vec3 mapN = texture(uVNrm, vAuv).xyz * 2.0 - 1.0;
  mapN.xy *= uVNrmK * (1.0 - 0.75 * smoothstep(8.0, 26.0, length(vViewPosition))); // daleko jemnější (nemihotá se)
  vec3 gN = normal;
  normal = normalize(mat3(T * sc, B * sc, normal) * mapN);
  // reliéf nesmí normálu převrátit od stěny (zblízka u pochodně by vznikly černé lesklé skvrny)
  float nd = dot(normal, gN);
  if (nd < 0.5) normal = normalize(normal + gN * (0.5 - nd) * 1.6);
}
#endif`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
reflectedLight.indirectDiffuse *= vOrm.r;
reflectedLight.indirectSpecular *= vOrm.r;
reflectedLight.directDiffuse *= mix(1.0, vOrm.r, 0.6);`)
      .replace('#include <emissivemap_fragment>', `{
  // jiskření: náhodná zrnka krystalů a kovu se blýsknou podle času a směru pohledu
  float spk = 0.0;
  if (vOrm.a > 0.02 || vOrm.b > 0.5) {
    vec2 cell = floor(vVUv * 24.0) + floor(vWPos.xz) * 3.1 + floor(vWPos.y) * 5.3 + vTile * 7.0;
    float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
    vec3 vd = normalize(vWPos - cameraPosition);
    spk = step(0.72, h) * pow(max(sin(uTime * (1.2 + h * 2.0) + h * 60.0 + dot(vd, vec3(17.0, 23.0, 11.0))), 0.0), 18.0);
  }
  float pulse = 1.0 + 0.12 * sin(uTime * 1.4 + vWPos.x * 0.7 + vWPos.z * 0.9);
  totalEmissiveRadiance += vAlb.rgb * vOrm.a * uVGlow * pulse + spk * mix(vec3(1.0), vAlb.rgb, 0.4) * (vOrm.a > 0.02 ? 1.4 : 0.45);
}
#include <emissivemap_fragment>
// odraz světla svítících rud na okolní stěny (až po zesílení záře: je to světlo, ne svítící povrch)
totalEmissiveRadiance += vAlb.rgb * vGlow * 0.55 * (1.0 + 0.12 * sin(uTime * 1.4 + vWPos.x * 0.7 + vWPos.z * 0.9));
// teplé světlo pochodní a ohňů zapečené do rohů stěn (torch-light.js); mihotá 2–3× za sekundu, sousední ohně trochu jinak
float fireFlick = 0.93 + 0.05 * sin(uTime * 14.5 + dot(vWPos, vec3(0.37, 0.21, 0.29))) + 0.025 * sin(uTime * 33.0 + dot(vWPos, vec3(0.23, 0.5, 0.17)));
totalEmissiveRadiance += diffuseColor.rgb * uFire * vFire * fireFlick;`);
  };
  return mat;
}
// barva a síla zapečeného světla ohňů (teplá bílá jako skutečná světla ohně v blocks.js)
const uFire = { value: new THREE.Color(...LK.torch) };
const voxMat = voxMaterial();

const VFACES = [
  { dir: [-1, 0, 0], corners: [[0, 1, 0, 0, 1], [0, 0, 0, 0, 0], [0, 1, 1, 1, 1], [0, 0, 1, 1, 0]] },
  { dir: [1, 0, 0], corners: [[1, 1, 1, 0, 1], [1, 0, 1, 0, 0], [1, 1, 0, 1, 1], [1, 0, 0, 1, 0]] },
  { dir: [0, -1, 0], corners: [[1, 0, 1, 1, 0], [0, 0, 1, 0, 0], [1, 0, 0, 1, 1], [0, 0, 0, 0, 1]] },
  { dir: [0, 1, 0], corners: [[0, 1, 1, 1, 1], [1, 1, 1, 0, 1], [0, 1, 0, 1, 0], [1, 1, 0, 0, 0]] },
  { dir: [0, 0, -1], corners: [[1, 0, 0, 0, 0], [0, 0, 0, 1, 0], [1, 1, 0, 0, 1], [0, 1, 0, 1, 1]] },
  { dir: [0, 0, 1], corners: [[0, 0, 1, 0, 0], [1, 0, 1, 1, 0], [0, 1, 1, 0, 1], [1, 1, 1, 1, 1]] },
].map((f) => ({ ...f, axis: f.dir.findIndex((v) => v !== 0) }));
const AO_LIGHT = [0.4, 0.62, 0.8, 1.0];
const GLOW_TINT = { [V.CRYSTAL]: [0.25, 0.85, 1.0], [V.MARKORITE]: [0.85, 0.3, 1.0], def: [0.6, 0.6, 0.6] };

// Co je v podzemí chunku (s okrajem 1 bloku ze sousedů): výšky sloupců a druh každého bloku.
function voxColumns(cx, cz, bx, bz, P) {
  const tops = new Int32Array(P * P);
  let maxTop = VMIN;
  for (let z = 0; z < P; z++) for (let x = 0; x < P; x++) { const t = topY(bx + x, bz + z); tops[z * P + x] = t; maxTop = Math.max(maxTop, t); }
  const H = maxTop - VMIN + 2;
  const data = new Uint8Array(P * P * H);
  let edits = false;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (voxEdits.get(`${cx + dx},${cz + dz}`)?.size) edits = true;
  for (let z = 0; z < P; z++) for (let x = 0; x < P; x++) {
    const top = tops[z * P + x], wx = bx + x, wz = bz + z;
    for (let yi = 0; yi <= top - VMIN; yi++) {
      const y = VMIN + yi;
      let v = naturalAt(wx, y, wz, top);
      if (edits) { const e = editAt(wx, y, wz); if (e !== undefined) v = e; }
      data[(yi * P + z) * P + x] = v;
    }
  }
  return { tops, H, data };
}
// Postaví 3D model podzemí jednoho chunku. Kreslí jen stěny, které sousedí se vzduchem v jeskyni nebo v díře.
// relight = jen nové světlo ohňů: podzemí se nezměnilo, použijí se data z minula (ušetří většinu času).
function buildVoxGeometry(cx, cz, relight = false) {
  const P = 18, bx = cx * 16 - 1, bz = cz * 16 - 1;
  const { tops, H, data } = (relight && voxData.get(ckey(cx, cz))) || voxColumns(cx, cz, bx, bz, P);
  const dug = new Uint8Array(P * P);
  for (let i = 0; i < P * P; i++) dug[i] = data[(tops[i] - VMIN) * P * P + i] === V.AIR ? 1 : 0;
  const at = (x, yi, z) => (yi < 0 ? V.BEDROCK : yi >= H || x < 0 || z < 0 || x >= P || z >= P ? V.AIR : data[(yi * P + z) * P + x]);
  const openAir = (x, yi, z) => {
    if (yi < 0 || at(x, yi, z) !== V.AIR) return false;
    const i = z * P + x;
    return yi + VMIN <= tops[i] || dug[i] === 1;
  };

  // Svítící rudy (krystal, markorit), které jsou vidět, slabě nasvítí stěny kolem sebe (do ~3 bloků) svou barvou.
  const glowSrc = [];
  for (let yi = 0; yi < H; yi++) for (let z = 0; z < P; z++) for (let x = 0; x < P; x++) {
    const v = data[(yi * P + z) * P + x];
    if (!VOX[v]?.glow || !VFACES.some((f) => openAir(x + f.dir[0], yi + f.dir[1], z + f.dir[2]))) continue;
    glowSrc.push([x - 0.5, yi + 0.5, z - 0.5, GLOW_TINT[v] || GLOW_TINT.def]);
  }
  // světlo pochodní a ohňů v okolí (null = žádný oheň v dosahu, atribut pak chybí = 0); skálu mezi ohněm a stěnou
  // hledá v datech tohoto a už postavených sousedních chunků
  voxData.set(ckey(cx, cz), { data, H, bx, bz, tops });
  const fb = fireBaker(bx, bz, P, knownSolid);
  const pos = [], nor = [], uv = [], col = [], tile = [], idx = [], glow = glowSrc.length ? [] : null, fire = fb ? [] : null;
  const q = [0, 0, 0], ao = [0, 0, 0, 0];
  for (let yi = 0; yi < H; yi++) for (let z = 1; z <= 16; z++) for (let x = 1; x <= 16; x++) {
    const v = data[(yi * P + z) * P + x];
    if (!v) continue;
    const def = VOX[v];
    for (const f of VFACES) {
      const nx = x + f.dir[0], ny = yi + f.dir[1], nz = z + f.dir[2];
      if (!openAir(nx, ny, nz)) continue;
      const u = (f.axis + 1) % 3, w = (f.axis + 2) % 3, n = pos.length / 3;
      const vis = fb && fb.visible(bx + nx, VMIN + ny, bz + nz); // ohně, které na tuhle stěnu vidí
      for (let i = 0; i < 4; i++) {
        const c = f.corners[i];
        const tall = f.axis !== 1 && VMIN + yi === tops[z * P + x] ? 2 : 1; // horní blok sahá výš (pod hladký terén)
        pos.push(x - 1 + c[0], VMIN + yi + c[1] * tall, z - 1 + c[2]);
        nor.push(...f.dir);
        uv.push(c[3], c[4] * tall);
        tile.push(def.tile);
        const su = c[u] === 1 ? 1 : -1, sw = c[w] === 1 ? 1 : -1;
        q[0] = nx; q[1] = ny; q[2] = nz;
        q[u] += su; const s1 = at(q[0], q[1], q[2]) ? 1 : 0;
        q[w] += sw; const cc = at(q[0], q[1], q[2]) ? 1 : 0;
        q[u] -= su; const s2 = at(q[0], q[1], q[2]) ? 1 : 0;
        ao[i] = s1 && s2 ? 0 : 3 - (s1 + s2 + cc);
        const l = AO_LIGHT[ao[i]];
        col.push(l, l, l);
        if (fire) fire.push(vis.length ? fb.at(vis, bx + x + c[0] + f.dir[0] * 0.1, VMIN + yi + c[1] * tall + f.dir[1] * 0.1, bz + z + c[2] + f.dir[2] * 0.1, f.dir) : 0); // (stín v rohu přidá barva vrcholu)
        if (glow) {
          const px = x - 1 + c[0] + f.dir[0] * 0.3, py = yi + c[1] + f.dir[1] * 0.3, pz = z - 1 + c[2] + f.dir[2] * 0.3;
          let r = 0, gg = 0, b = 0;
          for (const [sx, sy, sz, tint] of glowSrc) {
            const d = Math.hypot(px - sx, py - sy, pz - sz);
            if (d >= 3) continue;
            const k = (1 - d / 3) ** 2 * l;
            r += tint[0] * k; gg += tint[1] * k; b += tint[2] * k;
          }
          glow.push(Math.min(r, 1), Math.min(gg, 1), Math.min(b, 1));
        }
      }
      if (ao[1] + ao[2] > ao[0] + ao[3]) idx.push(n, n + 1, n + 3, n, n + 3, n + 2);
      else idx.push(n, n + 1, n + 2, n + 2, n + 1, n + 3);
    }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aTile', new THREE.Float32BufferAttribute(tile, 1));
  if (glow) geo.setAttribute('aGlow', new THREE.Float32BufferAttribute(glow, 3)); // bez svítících rud atribut chybí = 0
  if (fire) geo.setAttribute('aFire', new THREE.Float32BufferAttribute(fire, 1));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

export const voxChunks = new Map();
// Data podzemí postavených chunků (pro světlo ohňů: je mezi ohněm a stěnou skála?). Klíč je číslo, hledá se často.
const voxData = new Map(), ckey = (cx, cz) => (cx + 50000) * 100000 + cz + 50000;
let lastK = NaN, lastD = null;
function knownSolid(x, y, z) {
  const k = ckey(Math.floor(x / 16), Math.floor(z / 16));
  if (k !== lastK) { lastK = k; lastD = voxData.get(k); }
  if (!lastD) return undefined;
  const yi = y - VMIN;
  return yi < 0 ? true : yi >= lastD.H ? false : lastD.data[(yi * 18 + z - lastD.bz) * 18 + x - lastD.bx] !== V.AIR;
}
const cdist = (k, pcx, pcz) => { const [cx, cz] = k.split(',').map(Number); return (cx - pcx) ** 2 + (cz - pcz) ** 2; };
const VOX_R = 3;
const VOX_OFFSETS = [];
for (let dz = -VOX_R; dz <= VOX_R; dz++) for (let dx = -VOX_R; dx <= VOX_R; dx++) VOX_OFFSETS.push([dx, dz]);
VOX_OFFSETS.sort((a, b) => a[0] ** 2 + a[1] ** 2 - (b[0] ** 2 + b[1] ** 2));
function buildVoxChunk(k, relight = false) {
  const [cx, cz] = k.split(',').map(Number);
  const old = voxChunks.get(k);
  if (old?.mesh) { scene.remove(old.mesh); old.mesh.geometry.dispose(); }
  lastK = NaN;
  const geo = buildVoxGeometry(cx, cz, relight);
  let mesh = null;
  if (geo) {
    mesh = new THREE.Mesh(geo, voxMat);
    mesh.position.set(cx * 16, 0, cz * 16);
    scene.add(mesh);
  }
  voxChunks.set(k, { mesh });
}
on('vox', relightNearVox); // kopání u ohně: světlo může dosáhnout jinam
// Každý snímek: přestaví změněné chunky, přepočítá světlo ohňů (nejbližší chunk hned, další po jednom za snímek)
// a dostaví pár chybějících kolem hráče (max ~6 ms).
export function updateVoxChunks(px, pz) {
  for (const k of dirtyVoxChunks) { if (voxChunks.has(k)) buildVoxChunk(k); relightChunks.delete(k); }
  dirtyVoxChunks.clear();
  const pcx = Math.floor(px / 16), pcz = Math.floor(pz / 16), start = performance.now();
  scanFires();
  for (const k of relightChunks) if (!voxChunks.has(k)) relightChunks.delete(k);
  if (relightChunks.size) {
    const near = [...relightChunks].sort((a, b) => cdist(a, pcx, pcz) - cdist(b, pcx, pcz));
    for (const k of near) { relightChunks.delete(k); buildVoxChunk(k, true); if (performance.now() - start > 4) break; }
  }
  for (const [dx, dz] of VOX_OFFSETS) {
    const k = `${pcx + dx},${pcz + dz}`;
    if (voxChunks.has(k)) continue;
    buildVoxChunk(k);
    if (performance.now() - start > 6) break;
  }
  for (const [k, c] of voxChunks) {
    const [cx, cz] = k.split(',').map(Number);
    if (Math.abs(cx - pcx) > VOX_R + 1 || Math.abs(cz - pcz) > VOX_R + 1) {
      if (c.mesh) { scene.remove(c.mesh); c.mesh.geometry.dispose(); }
      voxChunks.delete(k);
      voxData.delete(ckey(cx, cz));
      lastK = NaN;
    }
  }
}
