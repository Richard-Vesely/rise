// Tráva: posekání, dorůstání a vykreslení.
import './ground.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { NET, r2 } from '../../../shared/net/net.js';
import { MARK_X } from '../../../shared/world/terrain.js';
import { DIG_N } from '../../../shared/world/voxels.js';
import { GRASS_LAYERS } from '../game/prefs.js';
import { digTex } from '../world/dig.js';
import { NOISE_GLSL, TERRAIN_GLSL } from './glsl.js';
import { AMBIENT_GLSL, POINT_GLSL, SHADOW_PARS_GLSL } from './light-glsl.js';
import { scene, shaderUniforms } from './renderer.js';

// ============================================================ tráva
// Maska posekané trávy: 0,5 m na pixel, opakuje se po 128 m. Tráva postupně doroste.
const CUT_N = 256, CUT_WORLD = 128;
const cutData = new Uint8Array(CUT_N * CUT_N);
const cutTex = new THREE.DataTexture(cutData, CUT_N, CUT_N, THREE.RedFormat, THREE.UnsignedByteType);
cutTex.wrapS = cutTex.wrapT = THREE.RepeatWrapping;
cutTex.magFilter = cutTex.minFilter = THREE.LinearFilter;
cutTex.needsUpdate = true;
const cutIndex = (x, z) => {
  const px = ((Math.floor((x / CUT_WORLD) * CUT_N) % CUT_N) + CUT_N) % CUT_N;
  const pz = ((Math.floor((z / CUT_WORLD) * CUT_N) % CUT_N) + CUT_N) % CUT_N;
  return pz * CUT_N + px;
};
export const isCut = (x, z) => cutData[cutIndex(x, z)] > 120;
export function cutGrass(x, z, r = 0.9) {
  NET.op(['c', r2(x), r2(z), r]);
  const step = CUT_WORLD / CUT_N;
  for (let dz = -r; dz <= r; dz += step) for (let dx = -r; dx <= r; dx += step) if (dx * dx + dz * dz <= r * r) cutData[cutIndex(x + dx, z + dz)] = 255;
  cutTex.needsUpdate = true;
}
let regrowT = 0;
export function regrowGrass(dt) {
  if ((regrowT += dt) < 2) return;
  regrowT = 0;
  let any = false;
  for (let i = 0; i < cutData.length; i++) if (cutData[i]) { cutData[i] = Math.max(0, cutData[i] - 2); any = true; }
  if (any) cutTex.needsUpdate = true;
}

function makeGrass(layer) {
  const { area, count, seg: SEG } = layer;
  const rand = (r) => r[0] + Math.random() * (r[1] - r[0]);
  const pos = [];
  for (let i = 0; i < SEG; i++) { const t = i / SEG, w = 1 - Math.pow(t, 1.4); pos.push(-w, t, 0, w, t, 0); }
  pos.push(0, 1, 0);
  const index = [];
  for (let i = 0; i < SEG - 1; i++) { const a = 2 * i; index.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
  index.push(2 * (SEG - 1), 2 * (SEG - 1) + 1, 2 * SEG);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(index);
  const offsets = new Float32Array(count * 2), params = new Float32Array(count * 4), extra = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    offsets[i * 2] = (Math.random() - 0.5) * area;
    offsets[i * 2 + 1] = (Math.random() - 0.5) * area;
    const flower = Math.random() < layer.flowers ? 1 + Math.floor(Math.random() * 3) : 0;
    params.set([rand(layer.height) * (flower ? 1.3 : 1), Math.random() * Math.PI * 2, Math.random() * 0.45, rand(layer.width) * (flower ? 2 : 1)], i * 4);
    extra.set([Math.random(), flower], i * 2);
  }
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 2));
  geo.setAttribute('aParams', new THREE.InstancedBufferAttribute(params, 4));
  geo.setAttribute('aExtra', new THREE.InstancedBufferAttribute(extra, 2));
  geo.instanceCount = count;
  const mat = new THREE.ShaderMaterial({
    fog: true,
    side: THREE.DoubleSide,
    uniforms: shaderUniforms({ uSize: { value: area }, uFade: { value: new THREE.Vector4(...layer.fadeIn, ...layer.fadeOut) }, uCut: { value: cutTex }, uDig: { value: digTex } }),
    vertexShader: /* glsl */`
      #include <fog_pars_vertex>
      uniform float uTime, uSize;
      uniform vec3 uCam;
      uniform vec4 uWind;
      uniform float uWet;
      uniform vec4 uFade;
      uniform sampler2D uCut, uDig;
      attribute vec2 aOffset, aExtra;
      attribute vec4 aParams;
      varying float vT, vVar, vFlower, vMeadow, vShadow, vPatch;
      varying vec3 vNormal, vWorld, vPoint;
      varying vec4 vWa, vWb;
      uniform vec3 uSunDir;
      ${NOISE_GLSL}
      ${TERRAIN_GLSL}
      ${SHADOW_PARS_GLSL}
      ${POINT_GLSL}
      void main() {
        vec2 wp = uCam.xz + mod(aOffset - uCam.xz + uSize * 0.5, uSize) - uSize * 0.5;
        float t = position.y;
        float m = meadow(wp);
        vec4 wa, wb;
        biomeWeights(wp, wa, wb);
        vWa = wa; vWb = wb;
        // poušť, tundra a sopka jsou bez trávy; savana a džungle mají vysokou trávu, houbový les nízkou
        float tall = dot(wa, vec4(1.0, 1.0, 0.0, 1.5)) + dot(wb, vec4(0.0, 1.35, 0.0, 0.55));
        float h = aParams.x * (0.45 + 0.95 * m) * tall;
        float dist = length(wp - uCam.xz);
        float keep = 1.0 - smoothstep(uFade.z, uFade.w, dist);
        if (uFade.y > 0.0) keep *= smoothstep(uFade.x, uFade.y, dist);
        h *= step(fract(aExtra.x * 7.31), keep);
        h *= smoothstep(9.7, 10.4, shrineDist(wp));
        h *= 1.0 - beachK(wp, terrainHW(wp, wa, wb)); // na pláži a pod mořem tráva neroste
        h *= 1.0 - smoothstep(0.3, 0.55, texture2D(uCut, wp / ${CUT_WORLD.toFixed(1)}).r); // posekaná tráva
        if (texture2D(uDig, (floor(wp) + 0.5) / ${DIG_N.toFixed(1)}).r > 0.5) h = 0.0;      // vykopaná díra
        if (uWet > 0.01) h *= 1.0 - smoothstep(0.66, 0.74, vnoise(wp * 0.13) * 0.75 + vnoise(wp * 1.7) * 0.3) * smoothstep(0.2, 0.6, uWet); // v louži tráva není
        vec2 dir = vec2(cos(aParams.y), sin(aParams.y));
        vec2 side = vec2(-dir.y, dir.x);
        // společný vítr (renderer.js U.wind): poryvy se valí krajinou jako vlny přes trávu i stromy
        vec2 windDir = uWind.xy;
        float gust = vnoise(wp * 0.045 - windDir * uTime * 0.8) * (0.75 + 0.5 * uWind.z);
        float sway = sin(uTime * 2.3 + dot(wp, windDir) * 0.7 + aParams.y * 3.0) * 0.18;
        vec2 bend = dir * aParams.z + windDir * (gust * gust * 1.3 + sway) * min(uWind.w, 2.2);
        float k = t * t;
        vec3 local;
        local.xz = side * position.x * aParams.w + bend * k * h;
        local.y = t * h * (1.0 - 0.3 * k * min(length(bend), 1.0));
        vec3 world = vec3(wp.x, terrainHW(wp, wa, wb), wp.y) + local;
        vNormal = normalize(vec3(dir.x, 0.35 + t * 0.6, dir.y));
        vT = t; vVar = aExtra.x; vFlower = aExtra.y; vMeadow = m; vWorld = world;
        vPatch = vnoise(wp * 0.06 + 13.0) * 0.6 + vnoise(wp * 0.21) * 0.4; // skvrny žlutozelené a sytě zelené trávy
        // stín slunce pro celé stéblo (ve vrcholech je to mnohem levnější než v pixelech)
        vShadow = h > 0.0 && dist < 70.0 ? sunShadow(world, vec3(0.0, 1.0, 0.0), aExtra.x) : 1.0;
        vPoint = h > 0.0 ? pointLights(world, vec3(0.0, 1.0, 0.0), 1.0) : vec3(0.0); // pochodně (stébla svítí ze všech stran)
        vec4 mvPosition = viewMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uSunDir, uSunColor, uAmbient, uHeadPos, uHeadDir;
      uniform float uHeadOn;
      vec3 headlight(vec3 p) { vec3 L = p - uHeadPos; float d = length(L); return vec3(1.0, 0.94, 0.78) * smoothstep(0.8, 0.95, dot(L / max(d, 0.001), uHeadDir)) * (1.0 - smoothstep(8.0, 38.0, d)) * uHeadOn * 2.2; }
      uniform float uSSS, uWet;
      varying float vT, vVar, vFlower, vMeadow, vShadow, vPatch;
      varying vec3 vNormal, vWorld, vPoint;
      varying vec4 vWa, vWb;
      ${NOISE_GLSL}
      ${AMBIENT_GLSL}
      void main() {
        float mk = step(${MARK_X.toFixed(1)}, vWorld.x);
        vec3 base = mix(vec3(0.03, 0.06, 0.012), vec3(0.01, 0.02, 0.07), mk);
        vec3 tip = meadowColor(vMeadow, vVar, mk) * (0.8 + vVar * 0.4);
        float other = 1.0 - vWa.x;
        if (other > 0.001) { // tráva v ostatních biomech
          vec3 btip = (vec3(0.18, 0.34, 0.08) * vWa.y + vec3(0.02, 0.16, 0.02) * vWa.w + vec3(0.35, 0.42, 0.30) * vWb.x + vec3(0.55, 0.45, 0.14) * vWb.y + vec3(0.30, 0.18, 0.38) * vWb.w + vec3(0.4, 0.33, 0.15) * (vWa.z + vWb.z)) / other;
          tip = mix(tip, btip * (0.8 + vVar * 0.4), other);
          base = mix(base, btip * 0.3, other);
        }
        tip *= mix(vec3(0.85, 1.02, 0.85), vec3(1.22, 1.1, 0.62), smoothstep(0.35, 0.75, vPatch));
        vec3 col = mix(base, tip, smoothstep(0.0, 0.9, vT));
        col = foliage(col);
        col *= 1.0 - 0.3 * uWet; // mokrá tráva je tmavší
        if (vFlower > 0.5 && vT > 0.8) { // drobné kvítky: žluté, bílé a fialové
          col = vFlower < 1.5 ? vec3(0.95, 0.72, 0.08) : vFlower < 2.5 ? vec3(0.92, 0.92, 0.88) : vec3(0.5, 0.26, 0.82);
        }
        if (vWa.y > 0.5 && vVar < 0.08 && vT > 0.7) col = vec3(0.95, 0.55, 0.75); // okvětní lístky třešní
        bool glow = vWb.w > 0.5 && vFlower > 0.5 && vT > 0.75; // svítící houbičky
        if (glow) col = vFlower < 2.0 ? vec3(0.3, 0.95, 1.0) : vec3(1.0, 0.35, 0.6);
        float diff = abs(dot(normalize(vNormal), uSunDir)) * 0.55 + 0.45;
        float ao = mix(0.3, 1.0, smoothstep(0.0, 0.7, vT));
        vec3 lit = col * (hemiLight(vec3(0.0, 0.6 + vT * 0.4, 0.0), uAmbient) + uSunColor * diff * vShadow + vPoint) * ao;
        vec3 view = normalize(vWorld - cameraPosition);
        // proti slunci stébla prosvítají (žlutozeleně)
        lit += col * vec3(1.0, 1.05, 0.7) * uSunColor * pow(max(dot(view, uSunDir), 0.0), 5.0) * vT * uSSS * 1.6 * vShadow;
        if (uHeadOn > 0.0) lit += col * headlight(vWorld);
        if (glow) lit = col * 1.6;
        gl_FragColor = vec4(lit, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}
export const grassLayers = GRASS_LAYERS.map(makeGrass);
grassLayers.forEach((g) => scene.add(g));
