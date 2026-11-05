// Povrch terénu (shader).
import './icons-food.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { MARK_X } from '../../../shared/world/terrain.js';
import { DIG_N } from '../../../shared/world/voxels.js';
import { digTex } from '../world/dig.js';
import { NOISE_GLSL, TERRAIN_GLSL } from './glsl.js';
import { AMBIENT_GLSL, POINT_GLSL, SHADOW_PARS_GLSL } from './light-glsl.js';
import { cubeUVDefines } from './post.js';
import { U, scene, shaderUniforms } from './renderer.js';
import { detailTex } from './textures.js';

// ============================================================ zem
function makeGroundGeometry(N = 320, R = 3000) {
  const pos = [], idx = [];
  const map = (u) => Math.sign(u) * Math.pow(Math.abs(u), 2.2) * R;
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) pos.push(map(i / N * 2 - 1), 0, map(j / N * 2 - 1));
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}
const groundMat = new THREE.ShaderMaterial({
  fog: true,
  side: THREE.DoubleSide,
  uniforms: shaderUniforms({ uDetail: { value: detailTex }, uDig: { value: digTex }, uPond: U.ponds, uEnv: U.env, uEnvOn: U.envOn, uRain: U.rain }),
  vertexShader: /* glsl */`
    #include <fog_pars_vertex>
    varying vec3 vWorld, vN;
    varying vec4 vWa, vWb;
    varying float vLava;
    ${TERRAIN_GLSL}
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      biomeWeights(w.xz, vWa, vWb);
      w.y = terrainHW(w.xz, vWa, vWb);
      vLava = sst(13.0, 7.0, volcanoDist(w.xz)) * vWb.z; // dno kráteru = láva
      float e = 0.6;
      float hx = terrainH(w.xz + vec2(e, 0.0)) - terrainH(w.xz - vec2(e, 0.0));
      float hz = terrainH(w.xz + vec2(0.0, e)) - terrainH(w.xz - vec2(0.0, e));
      vN = normalize(vec3(-hx, 2.0 * e, -hz));
      vWorld = w.xyz;
      vec4 mvPosition = viewMatrix * w;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */`
    #include <common>
    #include <fog_pars_fragment>
    #define ENVMAP_TYPE_CUBE_UV
    ${cubeUVDefines(1024)}
    #include <cube_uv_reflection_fragment>
    uniform sampler2D uEnv;
    uniform float uEnvOn;
    uniform sampler2D uDetail, uDig;
    uniform vec3 uSunDir, uSunColor, uAmbient, uCam;
    uniform float uTime, uHeadOn, uWet, uTwilight, uRain, uNight;
    uniform vec3 uHeadPos, uHeadDir;
    uniform vec4 uPond[6]; // blízké rybníky: x, z, poloměr, výška hladiny
    varying vec3 vWorld, vN;
    vec3 headlight(vec3 p) { vec3 L = p - uHeadPos; float d = length(L); return vec3(1.0, 0.94, 0.78) * smoothstep(0.8, 0.95, dot(L / max(d, 0.001), uHeadDir)) * (1.0 - smoothstep(8.0, 38.0, d)) * uHeadOn * 2.2; }
    varying vec4 vWa, vWb;
    varying float vLava;
    ${NOISE_GLSL}
    ${SHADOW_PARS_GLSL}
    ${AMBIENT_GLSL}
    ${POINT_GLSL}
    // síťka kaustik: dvě vrstvy zkroucených vln, jasné tenké čáry tam, kde se vlny potkávají
    float caustic(vec2 p, float t) {
      float c = 0.0;
      for (int i = 0; i < 2; i++) {
        vec2 q = p * (1.0 + float(i) * 0.6) + vec2(t * 0.35, -t * 0.27) * (1.0 - float(i) * 1.8);
        q += vec2(sin(q.y * 1.3 + t * 0.8), cos(q.x * 1.1 - t * 0.6)) * 0.7;
        float v = abs(sin(q.x * 1.7) * sin(q.y * 1.9));
        c += pow(1.0 - v, 9.0);
      }
      return c * 0.5;
    }
    void main() {
      vec2 p = vWorld.xz;
      // Vykopaný sloupec: povrch se nekreslí, je vidět díra do podzemí.
      if (length(p - uCam.xz) < 46.0 && texture2D(uDig, (floor(p) + 0.5) / ${DIG_N.toFixed(1)}).r > 0.5) discard;
      float m = meadow(p);
      float fine = texture2D(uDetail, p * 0.31).r;
      float coarse = texture2D(uDetail, p * 0.023).r;
      float mk = step(${MARK_X.toFixed(1)}, p.x);
      vec3 soil = mix(vec3(0.05, 0.07, 0.02), vec3(0.09, 0.07, 0.04), smoothstep(0.45, 0.75, fine));
      soil = mix(soil, vec3(0.03, 0.04, 0.09), mk); // markdirt
      soil *= 0.6 + fine * 0.8;
      vec3 far = biomeGround(vWa, vWb, meadowColor(m, coarse, mk) * (0.8 + coarse * 0.4), coarse);
      vec3 near = biomeSoil(vWa, vWb, soil, biomeGround(vWa, vWb, vec3(0.0), fine) / max(0.001, vWa.z + vWb.x + vWb.z + vWa.y + vWa.w + vWb.y + vWb.w));
      vec3 col = mix(near, far, smoothstep(8.0, 45.0, length(p - uCam.xz)));
      col = foliage(col);
      vec3 n = normalize(vN);
      // břeh rybníka: pás tmavé mokré hlíny nad hladinou (okraj zvlněný šumem); pod hladinou dno z bahna a písku
      float shore = 0.0, bed = 0.0, bedDepth = 0.0;
      for (int i = 0; i < 6; i++) {
        if (uPond[i].z <= 0.0) continue;
        float dp = length(p - uPond[i].xy);
        if (dp > uPond[i].z + 4.0) continue;
        float above = vWorld.y - uPond[i].w;
        float wob = (fine - 0.5) * 0.25 + (coarse - 0.5) * 0.3;
        shore = max(shore, (1.0 - smoothstep(0.05, 0.55 + wob, above)) * step(-0.4, above));
        if (above < 0.0) { bed = 1.0; bedDepth = -above; }
      }
      if (bed > 0.0) {
        vec3 mud = mix(vec3(0.075, 0.06, 0.035), vec3(0.2, 0.17, 0.1), smoothstep(0.35, 0.8, fine)); // bahno se světlými písčitými skvrnami
        mud = mix(mud, vec3(0.3, 0.26, 0.17), (1.0 - smoothstep(0.0, 0.6, bedDepth)) * 0.6);                // u břehu písek
        col = mix(col, mud * (0.75 + coarse * 0.5), smoothstep(0.0, 0.08, bedDepth));
      }
      // mokrá zem po dešti: tmavší, v rovných místech louže, které odrážejí oblohu
      float wet = max(uWet, shore * 0.85);
      float bareW = 1.0 - (vWa.z + vWb.x) * 0.7; // písek a sníh tolik netmavnou
      col *= 1.0 - 0.38 * wet * bareW;
      float pud = 0.0;
      if (uWet > 0.01) pud = uWet * smoothstep(0.68, 0.76, vnoise(p * 0.13) * 0.75 + vnoise(p * 1.7) * 0.3) * smoothstep(0.93, 0.975, n.y) * bareW; // (stejná maska v trávě)
      vec3 nn = n;
      if (pud > 0.01) {
        // kroužky od kapek na hladině louže
        vec2 cell = floor(p * 1.7), f = fract(p * 1.7) - 0.5;
        float ph = fract(uTime * 0.9 + hash(cell) * 7.0);
        float ring = sin((length(f + (vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5) * 0.4) - ph * 0.5) * 40.0) * (1.0 - ph) * smoothstep(0.5, 0.2, length(f));
        nn = normalize(vec3(n.x + f.x * ring * 0.12, n.y, n.z + f.y * ring * 0.12));
      }
      float diff = max(dot(n, uSunDir), 0.0);
      float shadow = diff > 0.0 ? sunShadow(vWorld, n, ign(gl_FragCoord.xy)) : 1.0;
      diff *= shadow;
      vec3 lit = col * (hemiLight(n, uAmbient) * 0.9 + uSunColor * diff + softLight(pointLights(vWorld, n, 0.0)));
      // kaustiky: světlo zvlněné hladinou se na dně rybníka vlní v jasných síťkách
      if (bed > 0.0 && uSunDir.y > 0.0) lit += col * uSunColor * caustic(p * 1.4, uTime) * 2.2 * smoothstep(0.05, 0.4, bedDepth) * exp(-bedDepth * 0.35) * shadow;
      if (pud > 0.01 || wet > 0.3) {
        vec3 V = normalize(cameraPosition - vWorld);
        float F = 0.03 + 0.97 * pow(1.0 - max(dot(nn, V), 0.0), 5.0);
        vec3 R = reflect(-V, nn);
        // louže odráží oblohu v odraženém směru (mraky, světlejší obzor, za soumraku růžová); bez odlesků jen barva okolí
        vec3 skyC = uAmbient * vec3(0.95, 1.02, 1.12) * 0.75 + vec3(0.9, 0.45, 0.3) * uTwilight * 0.2;
        if (uEnvOn > 0.5) skyC = mix(skyC, textureCubeUV(uEnv, normalize(vec3(R.x, max(R.y, 0.02), R.z)), 0.08).rgb * 0.85 * mix(1.0, 0.35, uNight), 0.85);
        float spec = pow(max(dot(R, uSunDir), 0.0), 180.0) * shadow;
        // odraz je tlumený (blátivá voda, tmavé okolí): při plném odrazu šedé oblohy vypadaly louže jako bílé fleky sněhu
        lit = mix(lit, mix(lit * 0.35, skyC * 0.62, 0.2 + 0.6 * F), pud) + (uSunColor * spec * 2.0 * (1.0 - 0.9 * uRain)) * max(pud, wet * 0.25);
        lit += skyC * F * wet * 0.08;
      }
      // Láva v kráteru sopky svítí sama (pulzuje)
      if (vLava > 0.001) lit = mix(lit, vec3(1.0, 0.3, 0.04) * (1.4 + 0.5 * sin(uTime * 1.3 + p.x * 0.4) * sin(uTime * 0.9 + p.y * 0.3)) * (0.7 + fine * 0.6), vLava);
      if (uHeadOn > 0.0) lit += col * headlight(vWorld);
      gl_FragColor = vec4(lit, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`,
});
export const ground = new THREE.Mesh(makeGroundGeometry(), groundMat);
ground.frustumCulled = false;
scene.add(ground);
