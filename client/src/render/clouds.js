// Mraky: kopule kolem kamery s pomalu plujícími mraky ze šumu. Okraje proti slunci prosvítají, v noci jsou tmavé.
// Jen se střední a vysokou grafikou (FX.clouds). Hustotu a jas určuje vzhled (LK.clouds).
import * as THREE from 'three';
import { FX, LK } from './look.js';
import { cubeUVDefines, post } from './post.js';
import { U, camera, scene } from './renderer.js';

let dome = null;
const CU = { uCover: { value: LK.clouds.cover }, uSoft: { value: LK.clouds.soft }, uBright: { value: LK.clouds.bright } };
export function initClouds() {
  if (!FX.clouds || dome) return;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSunDir: U.sunDir, uSunColor: U.sunColor, uAmbient: U.ambient, uTime: U.time, uNight: U.night, uTwilight: U.twilight, uRain: U.rain, ...CU },
    transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww; // vždy úplně vzadu (za vším ostatním)
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSunDir, uSunColor, uAmbient;
      uniform float uTime, uNight, uCover, uSoft, uBright, uTwilight, uRain;
      varying vec3 vDir;
      float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize(vDir);
        if (d.y < 0.01) discard;
        // mraky plují ve směru větru; za deště je jich víc a jsou tmavší
        vec2 p = d.xz / (d.y + 0.08) * 1.6 + vec2(uTime * 0.012, uTime * 0.004);
        float n = fbm(p);
        float cover = uCover - 0.3 * uRain;
        float c = smoothstep(cover - uSoft, cover + uSoft, n);
        if (c < 0.003) discard;
        // světlo: kus směrem ke slunci je mrak řidší = osvětlená hrana; spodek hustého mraku je tmavší
        float toward = fbm(p + normalize(uSunDir.xz + 1e-4) * 0.12);
        float lit = clamp(0.72 + (n - toward) * 2.5, 0.35, 1.1);
        float mu = max(dot(d, uSunDir), 0.0);
        // barvy bez přepalu jednotlivých kanálů (jinak u slunce vznikají duhové pruhy): jas zvlášť, barva slunce zvlášť
        float sunL = dot(uSunColor, vec3(0.3, 0.59, 0.11));
        vec3 sunHue = uSunColor / max(sunL, 1e-4);
        float sunAmt = sunL * (0.42 * lit + pow(mu, 6.0) * 0.5 * (1.0 - c * 0.5));
        vec3 sun = sunHue * min(sunAmt, 3.0);
        vec3 amb = vec3(dot(uAmbient, vec3(0.3, 0.59, 0.11))) * vec3(0.82, 0.9, 1.05) * 1.35; // mraky jsou bílé, ne v barvě stínů
        vec3 col = (amb + sun) * uBright * mix(1.0, 0.72, c * c) * (1.0 - 0.55 * uRain);
        // červánky: spodky mraků zrůžoví a zoranžoví
        col += vec3(1.0, 0.45, 0.35) * uTwilight * (0.25 + 0.35 * mu) * (1.0 - c * 0.4);
        // v noci jsou mraky jen tmavě šedomodré (měsíc)
        col *= mix(1.0, 0.55, uNight);
        // strop jasu (měkce, se zachovaným odstínem): mrak u slunce nesmí přes práh záře (bloom), jinak má tvrdý svítící okraj
        float mx = max(max(col.r, col.g), col.b);
        if (mx > 0.8) col *= (0.8 + (mx - 0.8) / (1.0 + (mx - 0.8) / 0.35)) / mx;
        float a = c * smoothstep(0.01, 0.18, d.y) * mix(0.95, 0.8, uNight);
        gl_FragColor = vec4(col, min(a + uRain * 0.3 * c, 1.0));
      }`,
  });
  dome = new THREE.Mesh(new THREE.SphereGeometry(3500, 32, 16), mat);
  dome.renderOrder = -1;
  dome.frustumCulled = false;
  scene.add(dome);
}
export function updateClouds() {
  if (!dome) return;
  dome.position.copy(camera.position);
  CU.uCover.value = LK.clouds.cover; CU.uSoft.value = LK.clouds.soft; CU.uBright.value = LK.clouds.bright;
}

// Vzdálená pásma hor na obzoru (střední a vysoká): dvě siluety za krajinou dodají hloubku – bližší hřeben je o kus tmavší
// a modřejší, vzdálenější světlejší a skoro v barvě oparu (vzdušná perspektiva). Úpatí obou se ztrácí v oparu údolí.
// Zapisují hloubku (měsíc a hvězdy jsou za nimi); post-processing je zahalí oparem jako oblohu (vše dál než 2,5 km),
// barva jde z barvy oblohy těsně nad obzorem v daném směru.
const ridges = [];
const RU = { haze: { value: new THREE.Color() }, tint: { value: new THREE.Color() }, env: { value: null }, envOn: { value: 0 }, envGain: { value: 1 } };
function makeRidge(R, seed, base, amp, far) {
  const N = 384, pos = [], idx = [], slope = [];
  const H = (a) => base + amp * (Math.abs(Math.sin(a * 3 + seed)) * (0.6 + 0.4 * Math.sin(a * 7.1 + seed * 2.0)) + 0.36 * Math.sin(a * 17.3 + seed) * Math.sin(a * 5.2) + 0.17 * Math.sin(a * 41.0 + seed * 3.0) + 0.06 * Math.sin(a * 97.0 + seed));
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2, h = H(a);
    pos.push(Math.cos(a) * R, -40, Math.sin(a) * R, Math.cos(a) * R, h, Math.sin(a) * R);
    // sklon hřebene (výška na metr podél obzoru): podle něj je svah ke slunci světlejší a odvrácený tmavší
    const sl = Math.max(-1, Math.min(1, (H(a + 0.002) - H(a - 0.002)) / (0.004 * R) * 2.5));
    slope.push(sl, sl);
    if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSlope', new THREE.Float32BufferAttribute(slope, 1));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uHaze: RU.haze, uTint: RU.tint, uNight: U.night, uSunDir: U.sunDir, uEnv: RU.env, uEnvOn: RU.envOn, uEnvGain: RU.envGain, uK: { value: far ? 0.42 : 0.72 }, uTop: { value: base + amp } },
    side: THREE.DoubleSide, fog: false,
    vertexShader: /* glsl */`
      attribute float aSlope;
      varying float vH, vSlope;
      varying vec3 vDir;
      void main() { vH = position.y; vDir = position; vSlope = aSlope; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      #define ENVMAP_TYPE_CUBE_UV
      ${cubeUVDefines(1024)}
      #include <cube_uv_reflection_fragment>
      uniform vec3 uHaze, uTint;
      uniform float uK, uTop, uEnvOn, uEnvGain, uNight;
      uniform vec3 uSunDir;
      uniform sampler2D uEnv;
      varying float vH, vSlope;
      varying vec3 vDir;
      void main() {
        // barva oparu = barva oblohy těsně nad obzorem v tomto směru (za soumraku růžová, proti slunci teplejší)
        vec3 haze = uHaze;
        if (uEnvOn > 0.5) haze = mix(haze, textureCubeUV(uEnv, normalize(vec3(vDir.x, length(vDir.xz) * 0.06, vDir.z)), 0.6).rgb * uEnvGain, 0.85);
        // nahoře je vidět hora (tmavší, do modra), dole opar údolí
        float k = uK * smoothstep(-30.0, uTop * 0.85, vH);
        vec3 col = mix(haze, haze * uTint, k);
        // svah natočený ke slunci je světlejší, odvrácený tmavší; v noci jsou hory tmavá silueta
        vec2 tang = normalize(vec2(-vDir.z, vDir.x));
        col *= 1.0 + 0.22 * k * clamp(vSlope * dot(tang, normalize(uSunDir.xz + 1e-4)), -1.0, 1.0) * step(0.0, uSunDir.y);
        gl_FragColor = vec4(col * mix(1.0, 0.5, uNight), 1.0);
      }`,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  m.renderOrder = far ? -1.2 : -1.1;
  m.userData.sh = 1;
  scene.add(m);
  ridges.push(m);
}
export function initRidge() {
  if (!FX.ridge || ridges.length) return;
  makeRidge(3200, 4.1, 95, 120, true);
  makeRidge(2600, 1.3, 50, 95, false);
}
export function updateRidge(fogColor, under = 0) {
  for (const r of ridges) {
    r.position.set(camera.position.x, 0, camera.position.z);
    r.visible = under < 0.5;
  }
  RU.haze.value.copy(fogColor).multiply(new THREE.Color(0.9, 0.95, 1.02));
  RU.tint.value.setRGB(0.36, 0.47, 0.66); // stín hor: modrošedý
  const env = scene.environment;
  RU.env.value = env; RU.envOn.value = env?.image?.height === 1024 ? 1 : 0; RU.envGain.value = 1 - 0.45 * post.night;
}
