// Počasí ve hře: déšť (kapky kolem hráče, cákance, mokrá zem a louže), bouřka (blesky, hrom) a ranní mlha.
// Jaké počasí zrovna je, určují pravidla (shared/sim/weather.js) z dne a času, takže je u všech hráčů stejné.
// Modul nemá vedlejší účinky při načtení: modely vytvoří initWeather() ze smyčky hry.
import * as THREE from 'three';
import { dayCount, dayTime } from '../../../shared/sim/day.js';
import { weatherAt, windAt } from '../../../shared/sim/weather.js';
import { Sound } from '../audio/sound.js';
import { toast } from '../ui/hud.js';
import { TERRAIN_GLSL } from './glsl.js';
import { FX, GLOW } from './look.js';
import { U, camera, scene } from './renderer.js';

/** Aktuální počasí (plynulé): rain, storm, fog 0–1; overcast = zataženo; wet = mokrý povrch; flash = blesk. */
export const weather = { rain: 0, storm: 0, fog: 0, overcast: 0, wet: 0, flash: 0, override: null, under: 0 };
/** Pro ladění a testy: game.setWeather({ rain: 1, storm: 1 }) – jen v tomto prohlížeči; null = zase podle pravidel. */
export function setWeather(w) { weather.override = w ? { rain: 0, storm: 0, fog: 0, ...w } : null; }

let rainMesh = null, splashMesh = null, bolt = null;
const RAIN_R = 22, RAIN_H = 26, SPLASH_R = 9;

// ------------------------------------------------------------ kapky deště: instanced čárky v kvádru kolem kamery
function makeRain() {
  const n = FX.rain, geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.5, 1, 0, 0.5, 1, 0], 3));
  geo.setIndex([0, 1, 2, 2, 1, 3]);
  const seed = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) seed.set([Math.random(), Math.random(), Math.random(), i / n], i * 4);
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  geo.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.time, uCam: U.cam, uWind: U.wind, uAmbient: U.ambient, uRain: { value: 0 } },
    // kapky nezapisují hloubku: jinak by mlha v post-processingu za každou kapkou zmizela a v dálce by visely
    // ostré tmavé „tyčky“ (pozadí bez oparu)
    transparent: true, depthWrite: false, fog: false,
    vertexShader: /* glsl */`
      uniform float uTime, uRain;
      uniform vec3 uCam;
      uniform vec4 uWind;
      attribute vec4 aSeed;
      varying float vA, vT, vX;
      ${TERRAIN_GLSL}
      void main() {
        vA = 0.0; vT = position.y; vX = position.x * 2.0;
        if (aSeed.w > uRain) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; } // slabý déšť = méně kapek
        float R = ${RAIN_R.toFixed(1)}, H = ${RAIN_H.toFixed(1)};
        vec2 off = aSeed.xy * 2.0 * R;
        vec2 wp = uCam.xz + mod(off - uCam.xz, 2.0 * R) - R;
        float speed = 15.0 + aSeed.z * 5.0;
        float y = uCam.y + H * 0.45 - mod(aSeed.z * H + uTime * speed, H);
        vec3 vel = normalize(vec3(uWind.x * 0.22 * uWind.w, -1.0, uWind.y * 0.22 * uWind.w));
        if (y < terrainH(wp) - 0.1) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        vec3 base = vec3(wp.x, y, wp.y);
        vec3 dropDir = -vel;
        float dist = distance(base, uCam);
        // tenká krátká čárka natočená ke kameře: šířka asi pixel (v dálce se místo rozšiřování zprůhlední),
        // délka jako rozmazání pohybem; vzdálené kapky slábnou dřív, ať nevisí v dálce jako tyčky
        vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        float streak = (0.32 + aSeed.y * 0.3) * (1.0 + dist * 0.018);
        float w = 0.005 + dist * 0.0011;
        vec3 p = base + camRight * position.x * w + dropDir * position.y * streak;
        vA = (1.0 - smoothstep(4.0, 15.0, dist)) * smoothstep(0.5, 1.6, dist) * (0.55 + 0.45 * aSeed.x);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uAmbient;
      varying float vA, vT, vX;
      void main() {
        if (vA <= 0.0) discard;
        // průhledná kapka: měkké okraje do stran, k oběma koncům se ztrácí (hlava kapky je jasnější)
        float a = vA * 0.42 * (1.0 - vX * vX) * smoothstep(0.0, 0.35, vT) * (1.0 - smoothstep(0.75, 1.0, vT)) * (0.55 + 0.45 * vT);
        if (a < 0.02) discard;
        gl_FragColor = vec4(uAmbient * 1.25 + 0.04, a);
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.renderOrder = 5;
  m.userData.sh = 1; // nevrhá stín
  return m;
}
// Cákance: malé kroužky na zemi kolem hráče, každý se roztáhne a zmizí
function makeSplashes() {
  const n = Math.round(FX.rain / 8), geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, -1, 1, 0, -1, -1, 0, 1, 1, 0, 1], 3));
  geo.setIndex([0, 2, 1, 1, 2, 3]);
  const seed = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) seed.set([Math.random(), Math.random(), Math.random(), i / n], i * 4);
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  geo.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.time, uCam: U.cam, uAmbient: U.ambient, uRain: { value: 0 } },
    transparent: true, depthWrite: false, fog: false,
    vertexShader: /* glsl */`
      uniform float uTime, uRain;
      uniform vec3 uCam;
      attribute vec4 aSeed;
      varying vec2 vP;
      varying float vK;
      ${TERRAIN_GLSL}
      void main() {
        vP = position.xz; vK = 0.0;
        if (aSeed.w > uRain) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        float cyc = uTime * (1.6 + aSeed.z) + aSeed.z * 13.0, k = fract(cyc);
        float id = floor(cyc);
        vec2 r = fract(vec2(sin(id * 12.9 + aSeed.x * 78.2), sin(id * 39.3 + aSeed.y * 11.7)) * 43758.5);
        vec2 wp = uCam.xz + (r * 2.0 - 1.0) * ${SPLASH_R.toFixed(1)};
        vK = k;
        float s = 0.03 + k * 0.11;
        vec3 p = vec3(wp.x + position.x * s, terrainH(wp) + 0.03, wp.y + position.z * s);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uAmbient;
      varying vec2 vP;
      varying float vK;
      void main() {
        float d = length(vP);
        float ring = smoothstep(0.62, 0.8, d) * smoothstep(1.0, 0.82, d);
        float a = ring * (1.0 - vK) * 0.45;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uAmbient * 1.5 + 0.05, a);
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.userData.sh = 1;
  return m;
}
export function initWeather() {
  if (rainMesh) return;
  rainMesh = makeRain();
  splashMesh = makeSplashes();
  rainMesh.visible = splashMesh.visible = false;
  scene.add(rainMesh, splashMesh);
}

// ------------------------------------------------------------ blesk: klikatá zářivá čára z mraků k zemi
const boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 0.85, 1).multiplyScalar(6 * GLOW), fog: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
function makeBolt(x, z, top, bottom) {
  const pts = [], view = new THREE.Vector3(x, 0, z).sub(camera.position).setY(0).normalize();
  const side = new THREE.Vector3(-view.z, 0, view.x);
  const pos = [], idx = [];
  const strand = (x0, y0, z0, y1, w, depth) => {
    let px = x0, pz = z0;
    const segs = 14, start = pos.length / 3;
    for (let i = 0; i <= segs; i++) {
      const y = y0 + (y1 - y0) * (i / segs);
      if (i) { px += (Math.random() - 0.5) * 18; pz += (Math.random() - 0.5) * 18; }
      pts.push([px, y, pz]);
      const ww = w * (1 - i / segs * 0.6);
      pos.push(px - side.x * ww, y, pz - side.z * ww, px + side.x * ww, y, pz + side.z * ww);
      if (i) { const a = start + (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
      if (depth < 1 && i > 2 && i < segs - 3 && Math.random() < 0.18) strand(px, y, pz, y - (y - y1) * (0.3 + Math.random() * 0.3), w * 0.5, depth + 1);
    }
  };
  strand(x, top, z, bottom, 1.1, 0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, boltMat);
  m.frustumCulled = false;
  m.userData.sh = 1;
  return m;
}

// ------------------------------------------------------------ zvuk: déšť (přes zvukové okolí) a hrom
// Šum deště a kapky hraje zvukové okolí (audio/ambience.js) podle Sound.rainLevel; tady je jen hrom.
function rainAudio(level) { Sound.rainLevel = level; }
function thunder(dist) {
  const c = Sound.ctx;
  if (!c || !Sound.master) return;
  const delay = Math.min(dist / 343, 2.5), dur = 3 + Math.random() * 3, t = c.currentTime + delay;
  const len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.04 * w) / 1.04; d[i] = last * 4 + (i < c.sampleRate * 0.25 ? w * 0.4 * (1 - i / (c.sampleRate * 0.25)) : 0); }
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = buf; f.type = 'lowpass'; f.frequency.value = 260 + 2000 / (1 + dist / 120);
  const vol = Math.min(0.9, 140 / (dist + 60));
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.05);
  g.gain.setTargetAtTime(vol * 0.5, t + 0.4, 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(Sound.master);
  s.start(t);
}

// ------------------------------------------------------------ každý snímek
let boltT = 0, nextBolt = 6, flashT = 0, lastRain = 0;
/**
 * Posune počasí: cíl podle pravidel (nebo game.setWeather), plynulé přechody, mokrost, vítr, blesky, zvuk.
 * @param {number} dt čas snímku (s)
 * @param {number} clock čas hry (s)
 * @param {number} under jak moc je hráč pod zemí (0–1)
 */
export function updateWeather(dt, clock, under = 0) {
  const W = weather, target = W.override || weatherAt(dayCount, dayTime);
  const k = 1 - Math.exp(-dt / 4); // přechody během pár sekund
  W.rain += (target.rain - W.rain) * k;
  W.storm += (target.storm - W.storm) * k;
  W.fog += (target.fog - W.fog) * k;
  W.overcast = Math.min(1, W.rain * 0.85 + W.storm * 0.3);
  W.under = under;
  // povrch zmokne za ~25 s deště a vyschne za ~1,5 min
  W.wet = W.rain > 0.08 ? Math.min(1, W.wet + dt * W.rain / 25) : Math.max(0, W.wet - dt / 90);
  U.wet.value = W.wet * (1 - under);
  U.rain.value = W.rain;
  // vítr: poryvy z času, za deště a v bouřce silnější
  const gust = 0.5 + 0.5 * Math.sin(clock * 0.35) * Math.sin(clock * 0.13 + 1);
  const wd = windAt(dayCount, dayTime); // směr větru je stejný jako pro plachetnice (shared/sim/weather.js)
  U.wind.value.set(wd.x, wd.z, gust, 0.6 + wd.speed * 0.08 + W.rain * 0.5 + W.storm * 1.1);
  // hlášky
  if (target.rain > 0.3 && lastRain <= 0.3 && clock > 2) toast(target.storm > 0.5 ? 'Blíží se bouřka – schovej se!' : 'Začíná pršet');
  if (target.rain <= 0.3 && lastRain > 0.3 && clock > 2) toast('Přestalo pršet');
  lastRain = target.rain;
  // kapky a cákance (v podzemí ne)
  if (rainMesh) {
    const vis = W.rain * (1 - under);
    rainMesh.visible = splashMesh.visible = vis > 0.01;
    rainMesh.material.uniforms.uRain.value = vis;
    splashMesh.material.uniforms.uRain.value = vis * 0.9;
  }
  // blesky jen za bouřky; záblesk dvakrát rychle za sebou
  if (W.storm > 0.5 && (nextBolt -= dt) <= 0) {
    nextBolt = 4 + Math.random() * 9;
    const a = Math.random() * Math.PI * 2, dist = 140 + Math.random() * 320;
    const x = camera.position.x + Math.cos(a) * dist, z = camera.position.z + Math.sin(a) * dist;
    if (bolt) { scene.remove(bolt); bolt.geometry.dispose(); }
    bolt = makeBolt(x, z, camera.position.y + 260, camera.position.y - 30);
    scene.add(bolt);
    boltT = 0.28; flashT = 0.45;
    thunder(dist);
  }
  if (bolt && (boltT -= dt) <= 0) { scene.remove(bolt); bolt.geometry.dispose(); bolt = null; }
  if (bolt) bolt.visible = boltT > 0.18 || (boltT > 0.05 && boltT < 0.12);
  flashT = Math.max(0, flashT - dt);
  W.flash = flashT > 0 ? (flashT > 0.33 ? 1 : flashT > 0.25 ? 0.2 : flashT > 0.12 ? 0.75 : flashT / 0.12 * 0.4) * (1 - under) : 0;
  rainAudio(W.rain);
}
