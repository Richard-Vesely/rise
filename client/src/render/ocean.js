// Hladina moří: velká plocha ve výšce SEA, která jezdí s hráčem (po 64 m, ať se vlnky nehýbou). Materiál je stejný jako
// u rybníků (render/water.js: vlnky, odraz oblohy, barva podle hloubky, pěna u břehu); navíc se vykreslí jen tam, kde je
// moře (oceanK v glsl.js) – nížiny na pevnině a jeskyně mimo moře zůstanou suché. Bez vedlejších účinků při načtení.
import * as THREE from 'three';
import { OCEAN_START, SEA, WORLD_GEN, shrineDist } from '../../../shared/world/terrain.js';
import { TERRAIN_GLSL } from './glsl.js';
import { U, scene } from './renderer.js';
import { FX } from './look.js';
import { makeWaterMaterial } from './water.js';

let mesh = null;
const SIZE = 2400, SNAP = 64;
function build() {
  const m = makeWaterMaterial();
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.uOceans = U.oceans;
    if (!FX.post) { // jednoduchý materiál hladiny (nízká grafika): doplnit polohu a terén
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\n${TERRAIN_GLSL}`);
    }
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  if (oceanK(vWPos.xz) < 0.02 || terrainH(vWPos.xz) > vWPos.y) discard; // jen moře');
  };
  m.customProgramCacheKey = () => `ocean-${FX.post ? 1 : 0}`;
  mesh = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE, 1, 1).rotateX(-Math.PI / 2), m);
  mesh.position.y = SEA;
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  scene.add(mesh);
}
/** Posune hladinu za hráčem; daleko od moří (u domovské svatyně) se nekreslí vůbec. */
export function updateOcean(cam) {
  if (!WORLD_GEN.oceans) { if (mesh) mesh.visible = false; return; }
  const near = shrineDist(cam.x, cam.z) > OCEAN_START - SIZE / 2;
  if (!near) { if (mesh) mesh.visible = false; return; }
  if (!mesh) build();
  mesh.visible = true;
  mesh.position.x = Math.round(cam.x / SNAP) * SNAP;
  mesh.position.z = Math.round(cam.z / SNAP) * SNAP;
}
