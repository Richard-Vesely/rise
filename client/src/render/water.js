// Voda v rybnících: vlnky (normály z několika vln a šumu), odraz oblohy podle úhlu pohledu (Fresnel), barva podle hloubky
// (u břehu tyrkysová, uprostřed tmavě modrozelená), rozbitá pěna jen tam, kde vlnky narážejí na břeh, a drobné třpytky
// slunce místo jedné oslnivé skvrny. Hloubku počítá shader z výšky terénu (terrainH v glsl.js), bez hloubkové textury.
// Kolem břehu rostou rákosí a orobince a leží kameny (všechny kvality), takže rybník nevypadá jako dokonalý kruh.
// S nízkou grafikou zůstává jednoduchý materiál hladiny jako dřív.
import * as THREE from 'three';
import { hash2 } from '../../../shared/util.js';
import { WORLD_GEN, terrainH } from '../../../shared/world/terrain.js';
import { lumpy } from './forest.js';
import { NOISE_GLSL, TERRAIN_GLSL } from './glsl.js';
import { FX, LK } from './look.js';
import { U, scene } from './renderer.js';
import { rockTex } from './textures.js';
import { updateOcean } from './ocean.js';

const mats = [];
/** Materiál hladiny; mark = fialová voda Markovy dimenze. */
export function makeWaterMaterial(mark = false) {
  if (!FX.post) {
    const m = new THREE.MeshStandardMaterial({ color: 0x1d5288, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.86 });
    if (mark) m.color.set(0x6a3ad0);
    return m;
  }
  const W = LK.water;
  const lin = (c) => new THREE.Color().setRGB(...c, THREE.SRGBColorSpace);
  const shallow = mark ? lin([0.45, 0.25, 0.85]) : lin(W.shallow), deep = mark ? lin([0.12, 0.04, 0.3]) : lin(W.deep);
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.14, metalness: 0, transparent: true, depthWrite: true });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uOceans: U.oceans, uTime: U.time, uShallow: { value: shallow }, uDeep: { value: deep }, uFoam: { value: W.foam }, uSunDirW: U.sunDir, uSunColW: U.sunColor, uWetW: U.rain, uWindW: U.wind });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos;
        uniform float uTime, uFoam, uWetW;
        uniform vec3 uShallow, uDeep, uSunDirW, uSunColW;
        uniform vec4 uWindW;
        vec3 waterN;
        ${TERRAIN_GLSL}
        ${NOISE_GLSL}
        // výška vln: pár dlouhých vln + drobné vlnky ze šumu; vítr a déšť je zesílí
        float waveH(vec2 p) {
          float t = uTime, a = 0.8 + 0.25 * uWindW.w;
          float h = sin(dot(p, vec2(0.62, 0.31)) + t * 1.3) * 0.030 + sin(dot(p, vec2(-0.27, 0.71)) * 1.7 + t * 1.7) * 0.018
                  + sin(dot(p, vec2(0.91, -0.53)) * 2.9 + t * 2.6) * 0.008;
          h += (vnoise(p * 2.3 + vec2(t * 0.35, t * 0.2)) + vnoise(p * 4.1 - vec2(t * 0.25, -t * 0.4))) * 0.012;
          return h * a;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float depth = max(vWPos.y - terrainH(vWPos.xz), 0.0);
        float kD = 1.0 - exp(-depth * 0.75);
        diffuseColor.rgb = mix(uShallow, uDeep, kD);
        // pěna: jen rozbité chuchvalce těsně u břehu, které se s vlnkami posouvají (žádný souvislý prstenec)
        float fn = vnoise(vWPos.xz * 2.6 + vec2(uTime * 0.3, -uTime * 0.2)) * 0.55 + vnoise(vWPos.xz * 6.1 - uTime * 0.45) * 0.45;
        float lap = 0.5 + 0.5 * sin(uTime * 1.1 + vnoise(vWPos.xz * 0.7) * 6.0);
        float foam = smoothstep(0.1 + 0.06 * lap, 0.0, depth) * smoothstep(0.52, 0.72, fn) * uFoam;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.95, 1.0), clamp(foam, 0.0, 1.0));
        // okraj hladiny se třepí šumem: břeh pak není dokonalý kruh
        float edge = smoothstep(0.0, 0.05 + 0.1 * vnoise(vWPos.xz * 1.3), depth);
        diffuseColor.a = mix(0.35, 0.93, 1.0 - exp(-depth * 1.6));
        diffuseColor.a = max(diffuseColor.a, clamp(foam, 0.0, 1.0)) * edge;
        if (diffuseColor.a < 0.01) discard;`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        {
          float e = 0.06, h0 = waveH(vWPos.xz);
          vec3 wn = normalize(vec3(h0 - waveH(vWPos.xz + vec2(e, 0.0)), e, h0 - waveH(vWPos.xz + vec2(0.0, e))));
          // kapky deště čeří hladinu
          if (uWetW > 0.01) { vec2 q = vWPos.xz * 3.0; float r = vnoise(q * 3.0 + uTime * 6.0) - 0.5; wn = normalize(wn + vec3(r, 0.0, -r) * 0.25 * uWetW); }
          waterN = wn;
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
          // Fresnel: při pohledu zešikma voda víc odráží oblohu (a míň je vidět dno)
          vec3 V = normalize(cameraPosition - vWPos);
          float F = 0.02 + 0.98 * pow(1.0 - max(dot(wn, V), 0.0), 5.0);
          diffuseColor.a = diffuseColor.a + (1.0 - diffuseColor.a) * F * step(0.01, diffuseColor.a);
          diffuseColor.rgb *= 1.0 - 0.5 * F; // odraz místo barvy vody
        }`)
      .replace('#include <opaque_fragment>', `
        {
          // odlesk slunce: strop jasu (žádná oslnivá skvrna), místo toho drobné ostré třpytky podél dráhy slunce
          outgoingLight = min(outgoingLight, vec3(1.6));
          vec3 V = normalize(cameraPosition - vWPos);
          vec2 g = vWPos.xz * 9.0;
          float spark = vnoise(g + vec2(uTime * 1.7, uTime * 1.1)) * vnoise(g * 1.9 - uTime * 2.3);
          vec3 sn = normalize(waterN + vec3(spark - 0.25, 0.0, 0.25 - spark) * 0.9);
          vec3 R = reflect(-V, sn);
          float glint = pow(max(dot(R, uSunDirW), 0.0), 900.0) * smoothstep(0.32, 0.5, spark);
          outgoingLight += uSunColW * min(glint * 3.0, 2.5) * step(0.0, uSunDirW.y);
        }
        #include <opaque_fragment>`);
  };
  mats.push(m);
  return m;
}

// ------------------------------------------------------------ rákosí, orobince a kameny u břehu
function reedTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  let s = 7;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 14; i++) {
    const x = 6 + r() * 52, h = 60 + r() * 64, lean = (r() - 0.5) * 18;
    g.strokeStyle = `hsl(${85 + r() * 25}, ${45 + r() * 20}%, ${24 + r() * 16}%)`;
    g.lineWidth = 1.5 + r() * 2;
    g.beginPath(); g.moveTo(x, 128); g.quadraticCurveTo(x + lean * 0.3, 128 - h * 0.6, x + lean, 128 - h); g.stroke();
    if (r() < 0.35) { // orobinec: hnědý doutník nahoře
      g.fillStyle = `hsl(25, 45%, ${18 + r() * 10}%)`;
      g.beginPath(); g.ellipse(x + lean * 0.92, 128 - h + 12, 3, 9, 0, 0, Math.PI * 2); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let reedGeo = null, reedMat = null, stoneGeo = null, stoneMat = null;
function decorMaterials() {
  if (reedGeo) return;
  const a = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), b = a.clone().rotateY(Math.PI / 2);
  reedGeo = new THREE.BufferGeometry().copy(a);
  reedGeo.setIndex([...a.index.array, ...Array.from(b.index.array, (i) => i + 4)]);
  for (const k of ['position', 'normal', 'uv']) reedGeo.setAttribute(k, new THREE.Float32BufferAttribute([...a.attributes[k].array, ...b.attributes[k].array], a.attributes[k].itemSize));
  for (let i = 0; i < reedGeo.attributes.normal.count; i++) reedGeo.attributes.normal.setXYZ(i, 0, 1, 0); // osvětlené jako tráva (shora)
  reedMat = new THREE.MeshStandardMaterial({ map: reedTexture(), alphaTest: 0.5, alphaToCoverage: FX.msaa > 0, side: THREE.DoubleSide, roughness: 0.8 });
  reedMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.time; sh.uniforms.uWind = U.wind;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec4 uWind;').replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
      { vec3 ip = instanceMatrix[3].xyz; float k = position.y * position.y;
        transformed.x += sin(uTime * 1.9 + ip.x * 1.3 + ip.z) * 0.08 * k * uWind.w;
        transformed.z += cos(uTime * 1.5 + ip.z * 1.1) * 0.05 * k * uWind.w; }
      #endif`);
  };
  stoneGeo = lumpy(new THREE.IcosahedronGeometry(1, 1), 0.3, 7.1).scale(1, 0.55, 1);
  stoneMat = new THREE.MeshStandardMaterial({ map: rockTex, roughness: 0.6, color: 0x8a8f93 });
}
const dm = new THREE.Object3D();
/** Ozdobí rybník (mesh hladiny p) rákosím a kameny podél skutečného břehu. Volá se, když se hladina vytvoří. */
export function decorPond(mesh, p, level, mark = false) {
  decorMaterials();
  const reeds = new THREE.InstancedMesh(reedGeo, reedMat, 90), stones = new THREE.InstancedMesh(stoneGeo, stoneMat, 14);
  let nr = 0, ns = 0;
  const col = new THREE.Color();
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2 + hash2(i, p.x | 0) * 0.08;
    // najdi břeh: první místo od středu ven, kde je zem nad hladinou
    let r = p.r * 0.5;
    while (r < p.r * 1.15 && terrainH(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r) < level) r += 0.15;
    const clump = hash2(Math.floor(i / 5), (p.z | 0) + 17);
    if (clump < 0.45) continue; // rákosí roste v trsech, mezi nimi je volný břeh
    for (let j = 0; j < 2 && nr < 90; j++) {
      const rr = r + (hash2(i, j + 3) - 0.6) * 0.9, aa = a + (hash2(j, i + 9) - 0.5) * 0.06;
      const x = p.x + Math.cos(aa) * rr, z = p.z + Math.sin(aa) * rr;
      dm.position.set(x - p.x, Math.max(terrainH(x, z), level - 0.3) - level - 0.05, z - p.z);
      dm.rotation.set(0, hash2(i * 7, j) * 6.28, 0);
      const h = 0.9 + hash2(i, j) * 0.9;
      dm.scale.set(0.8 + hash2(j, i) * 0.6, h, 0.8 + hash2(j, i) * 0.6);
      dm.updateMatrix();
      reeds.setMatrixAt(nr, dm.matrix);
      reeds.setColorAt(nr++, mark ? col.setHSL(0.72, 0.5, 0.6) : col.setHSL(0.18, 0.2, 0.85 + hash2(i, j) * 0.3));
    }
    if (hash2(i, 77) < 0.2 && ns < 14) {
      const x = p.x + Math.cos(a) * (r + 0.3), z = p.z + Math.sin(a) * (r + 0.3), s = 0.18 + hash2(i, 5) * 0.3;
      dm.position.set(x - p.x, terrainH(x, z) - level - s * 0.2, z - p.z);
      dm.rotation.set(hash2(i, 1), hash2(i, 2) * 6, 0);
      dm.scale.setScalar(s);
      dm.updateMatrix();
      stones.setMatrixAt(ns++, dm.matrix);
    }
  }
  reeds.count = nr; stones.count = ns;
  for (const o of [reeds, stones]) { o.frustumCulled = false; o.instanceMatrix.needsUpdate = true; mesh.add(o); }
  if (reeds.instanceColor) reeds.instanceColor.needsUpdate = true;
  ponds.set(mesh, { x: p.x, z: p.z, r: p.r, level });
}

// ------------------------------------------------------------ každý snímek
const ponds = new Map(); // mesh hladiny → rybník (pro mokrý břeh v terénu)
const near = [];
/** Voda odráží aktuální oblohu (prostředí se přepočítává jednou za pár sekund); terén dostane nejbližší rybníky. */
export function updateWater() {
  U.oceans.value = WORLD_GEN.oceans ? 1 : 0;
  updateOcean(U.cam.value); // hladina moří (ocean.js)
  for (const m of mats) {
    if (m.envMap !== scene.environment) { m.envMap = scene.environment; m.needsUpdate = !m.userData.hadEnv; m.userData.hadEnv = true; }
    m.envMapIntensity = 0.45 + 0.9 * (1 - U.night.value * 0.85);
  }
  near.length = 0;
  const cx = U.cam.value.x, cz = U.cam.value.z;
  for (const [mesh, p] of ponds) { if (!mesh.parent) { ponds.delete(mesh); continue; } near.push(p); }
  near.sort((a, b) => (a.x - cx) ** 2 + (a.z - cz) ** 2 - (b.x - cx) ** 2 - (b.z - cz) ** 2);
  const P = U.ponds.value;
  for (let i = 0; i < P.length; i++) { const p = near[i]; if (p) P[i].set(p.x, p.z, p.r, p.level); else P[i].set(0, 0, 0, 0); }
}
