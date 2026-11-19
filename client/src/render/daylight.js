// Den a noc na obloze, soumrak, měsíc, přizpůsobení oka a tma v podzemí (čas dne: shared/sim/day.js).
import '../player/survival.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { advanceDay, dayCount, dayTime, daylight, sunElevation } from '../../../shared/sim/day.js';
import { lerp, smoothstep } from '../../../shared/util.js';
import { EYE } from '../../../shared/world/constants.js';
import { waterAt } from '../../../shared/world/nature.js';
import { terrainH } from '../../../shared/world/terrain.js';
import { gameTime } from '../game/loop.js';
import { GFX } from '../game/prefs.js';
import { player } from '../player/player.js';
import { toast } from '../ui/hud.js';
import { FX, LK } from './look.js';
import { post } from './post.js';
import { FOG, U, camera, renderer, scene } from './renderer.js';
import { hemi, moon, skyU, stars, sunDir, sunLight } from './sky.js';
import { weather } from './weather.js';

// ============================================================ den a noc
let wasNight = false; // (čas dne a počítadlo dní jsou v shared/sim/day.js)
export const tmpV = new THREE.Vector3();
const tmpC = new THREE.Color();
const DAY_FOG = new THREE.Color(0xc4d3de), NIGHT_FOG = new THREE.Color(0x0b1220), DUSK_FOG = new THREE.Color(0xe0a080), RAIN_FOG = new THREE.Color(0x8a949e);
const AMB_TINT = new THREE.Vector3(...LK.ambTint).multiplyScalar(LK.amb), SKY_AMB = new THREE.Vector3(...LK.skyAmb), GROUND_AMB = new THREE.Vector3(...LK.groundAmb);
U.skyAmb.value.copy(SKY_AMB);
U.groundAmb.value.copy(GROUND_AMB);
// Viditelné části dne (jen vzhled; pravidla – noc, stínožrouti – dál počítají daylight() ze shared/sim/day.js):
// sunK = přímé slunce, golden = zlatá hodina (slunce nízko), skyK = světlo oblohy (slábne až dlouho po západu – modrá hodina),
// twilight = červánky (slunce těsně pod obzorem), starK = hvězdy (až po občanském soumraku), moonK = měsíc.
export const vis = { elev: 0, sunK: 1, golden: 0, skyK: 1, twilight: 0, starK: 0, moonK: 0, night: 0 };
export function updateDay(dt) {
  advanceDay(dt);
  const elev = sunElevation();
  sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev * 62), THREE.MathUtils.degToRad(120 + dayTime * 360));
  const v = vis;
  v.elev = elev;
  // Soumrak 18:00–19:30 (slunce až ~22° pod obzorem): obloha slábne pomalu, červánky drží do ~19:15,
  // hvězdy se ukážou až po občanském soumraku (~19:00). Svítání je zrcadlově 4:30–6:00.
  v.sunK = smoothstep(-0.03, 0.1, elev);
  v.golden = (1 - smoothstep(0.04, 0.36, elev)) * v.sunK;
  v.skyK = smoothstep(-0.46, 0.04, elev);
  v.twilight = (1 - smoothstep(0.02, 0.2, elev)) * smoothstep(-0.46, -0.16, elev);
  v.starK = 1 - smoothstep(-0.4, -0.24, elev);
  v.moonK = 1 - smoothstep(-0.2, 0.0, elev);
  v.night = 1 - v.skyK;
  const W = weather, over = W.overcast; // zataženo (déšť, bouřka) tlumí slunce a odbarví světlo
  // obloha: slunce pro shader oblohy nikdy nezapadne úplně hluboko, aby zůstala záře u obzoru; červánky přidá shader (sky.js)
  skyU.sunPosition.value.copy(sunDir);
  if (elev < -0.02) skyU.sunPosition.value.y = Math.max(skyU.sunPosition.value.y, -0.02);
  skyU.skyGain.value = (FX.post ? LK.sky.gain : 1) * lerp(0.35, 1, smoothstep(-0.4, 0.05, elev));
  skyU.turbidity.value = lerp(LK.sky.turbidity, 9, 1 - smoothstep(0.0, 0.4, elev));
  skyU.uTwilight.value = v.twilight;
  skyU.uNightSky.value = v.night;
  skyU.uOvercast.value = over;
  U.night.value = smoothstep(0.35, 0.95, v.night);
  U.twilight.value = v.twilight;
  if (elev >= -0.03) {
    U.sunDir.value.copy(sunDir);
    if (U.sunDir.value.y < 0.02) U.sunDir.value.y = 0.02; // nízké slunce těsně u obzoru ještě kreslí dlouhé stíny
    U.sunDir.value.normalize();
    const k = v.sunK * 3.0 * (1 - 0.8 * over);
    U.sunColor.value.set(k, lerp(0.92, 0.6, v.golden) * k, lerp(0.8, 0.36, v.golden) * k).multiplyScalar(LK.sun);
  } else {
    // měsíc: studené modré světlo (asi 9 % slunce) z opačné strany, stíny vrhá taky
    U.sunDir.value.copy(sunDir).negate();
    const k = v.moonK * 3.0 * LK.moon * LK.sun * (1 - 0.7 * over);
    U.sunColor.value.set(0.62 * k, 0.78 * k, 1.15 * k);
  }
  // okolní světlo oblohy: ve dne asi třetina slunce, za soumraku teplejší, v noci modré (jako na měsíci)
  const NA = LK.nightAmb; // (čte se každý snímek: vzhled jde ladit za běhu přes game.LK)
  U.ambient.value.set(lerp(NA[0], 0.62, v.skyK), lerp(NA[1], 0.74, v.skyK), lerp(NA[2], 1.0, v.skyK))
    .multiplyScalar(lerp(1, 0.82, v.golden)).multiply(AMB_TINT);
  if (v.twilight > 0) U.ambient.value.add(tmpV.set(0.07, 0.04, 0.06).multiplyScalar(v.twilight)); // červánky barví stíny do růžova
  if (over > 0) { const l = (U.ambient.value.x + U.ambient.value.y + U.ambient.value.z) / 3; U.ambient.value.lerp(tmpV.set(l * 0.92, l * 0.97, l * 1.05), over * 0.7).multiplyScalar(1 - 0.25 * over); }
  if (W.flash > 0) U.ambient.value.add(tmpV.set(0.9, 0.95, 1.2).multiplyScalar(W.flash * 1.4)); // blesk ozáří krajinu
  post.flash = W.flash;
  FOG.color.copy(NIGHT_FOG).lerp(DAY_FOG, v.skyK).lerp(DUSK_FOG, Math.max(v.golden, v.twilight) * 0.5);
  if (over > 0 || W.fog > 0) FOG.color.lerp(tmpC.copy(RAIN_FOG).multiplyScalar(lerp(0.12, 1, v.skyK)), Math.min(1, over * 0.8 + W.fog * 0.6));
  FOG.density = GFX.fog * (1 + W.rain * 1.1 + W.fog * 7);
  // nízká grafika: ACES a jas jako dřív; s post-processingem jas řídí přizpůsobení oka (applyUnderground)
  renderer.toneMappingExposure = FX.post ? 1 : lerp(1.42, 0.92, smoothstep(-0.12, 0.12, elev)) * 0.6;
  const sc = U.sunColor.value, am = U.ambient.value;
  sunLight.position.copy(U.sunDir.value).multiplyScalar(100);
  sunLight.color.setRGB(sc.x, sc.y, sc.z);
  sunLight.intensity = Math.PI * 0.9;
  hemi.color.setRGB(am.x, am.y, am.z);
  hemi.color.multiply(tmpC.setRGB(SKY_AMB.x, SKY_AMB.y, SKY_AMB.z));
  hemi.groundColor.setRGB(am.x * GROUND_AMB.x, am.y * GROUND_AMB.y, am.z * GROUND_AMB.z);
  hemi.intensity = Math.PI * 0.8;
  scene.environmentIntensity = (0.25 + v.skyK * 0.35) * (1 - 0.3 * over);
  stars.material.opacity = v.starK * (1 - over);
  moon.material.opacity = v.moonK * (1 - over * 0.85);
  moon.position.copy(camera.position).addScaledVector(tmpV.copy(sunDir).negate(), 4000);
  post.night = U.night.value;
  post.weather = Math.min(1, over * 0.85 + W.fog);
  // pravidla (stínožrouti, zvířata, toast) dál podle daylight() – stejně na serveru i v prohlížeči
  const { day, night } = daylight();
  const isNight = night > 0.6;
  if (isNight && !wasNight && gameTime > 1) toast('Padá noc… stínožrouti se probouzejí');
  if (!isNight && wasNight) toast(`Svítá – den ${dayCount}`);
  wasNight = isNight;
  return { night, day };
}

// Pod zemí je tma: slunce a obloha slábnou podle hloubky, svítí pochodně, táboráky a krystaly. Chladné okolní světlo jeskyně
// (modrošedé) proti teplému světlu pochodní dělá jeskyni skutečnou a hrany kamene jsou vidět i mimo světla.
const CAVE_FOG = new THREE.Color(0x0a0d12), CAVE_AMB = new THREE.Color();
export let underground = 0;
let adapt = 1;
export function applyUnderground(dt = 0.016) {
  const depth = terrainH(player.pos.x, player.pos.z) - (player.pos.y + EYE);
  underground = lerp(underground, smoothstep(1.5, 5, depth), 0.08);
  const u = underground;
  CAVE_AMB.setRGB(...LK.caveAmb);
  sunLight.intensity *= 1 - 0.97 * u;
  hemi.intensity *= 1 - 0.7 * u; // ať jsou kolem pochodní vidět teplé kruhy světla
  hemi.color.lerp(CAVE_AMB, u);
  hemi.groundColor.lerp(tmpC.copy(CAVE_AMB).multiplyScalar(0.55), u);
  scene.environmentIntensity *= 1 - 0.9 * u;
  FOG.color.lerp(CAVE_FOG, u);
  FOG.density = lerp(FOG.density, 0.028, u);
  // kamera pod hladinou rybníka
  const wl = waterAt(camera.position.x, camera.position.y, camera.position.z);
  post.water = wl !== null ? 1 : 0;
  post.waterLevel = wl ?? -1e9;
  if (!FX.post) {
    renderer.toneMappingExposure = lerp(renderer.toneMappingExposure, 1.58 * 0.6, u); post.under = u;
    if (post.water) { FOG.color.setRGB(0.03, 0.16, 0.17); FOG.density = 0.16; } // pod vodou krátký modrozelený dohled
    return;
  }
  // přizpůsobení oka: v noci až +0,8 EV, v jeskyni až +1,2 EV, plynule za ~1,5 s (jako když si oči zvyknou na tmu).
  // Svítí-li blízko pochodně nebo lampy, oko se tolik nepřizpůsobí (jinak by osvětlený kámen zblízka přepálilo do béžova).
  const A = LK.adapt, near = nearLight(camera.position);
  const ev = Math.max(post.night * A.night, u * A.cave) * (1 - 0.75 * smoothstep(0.15, 1.6, near));
  adapt += (2 ** ev - adapt) * (1 - Math.exp(-dt / A.speed));
  post.exposure = adapt;
  post.under = u;
}
// Kolik světla pochodní a lamp dopadá na místo (stejný útlum jako v POINT_GLSL), pro přizpůsobení oka
function nearLight(p) {
  let sum = 0;
  for (let i = 0; i < U.pl.value.length; i++) {
    const l = U.pl.value[i];
    if (l.w <= 0) continue;
    const d = Math.max(0.5, Math.hypot(l.x - p.x, l.y - p.y, l.z - p.z)), cut = Math.max(0, 1 - (d / 16) ** 4);
    sum += l.w * cut * cut / d ** 1.7 * 0.3183;
  }
  return sum;
}
