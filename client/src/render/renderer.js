// Renderer, scéna, kamera a společné uniformy shaderů.
import '../game/save-load.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { GFX } from '../game/prefs.js';
import { FX, GLOW, LK } from './look.js';

// ============================================================ renderer, scéna
// Se střední a vysokou grafikou kreslí post-processing (client/src/render/post.js): vyhlazuje sám a tónuje až na konci.
export const renderer = new THREE.WebGLRenderer({ antialias: GFX.aa && !FX.post, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, GFX.pr));
renderer.setSize(innerWidth, innerHeight);
// nízká grafika tónuje rovnou v materiálech: ACES (levné a kontrastní, jako dřív); vzhled ladí až post-processing
renderer.toneMapping = FX.post ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.55;
document.body.prepend(renderer.domElement);
// Svítící materiály (emissive) září se střední a vysokou grafikou víc, aby je chytil bloom. Platí pro všechny materiály
// najednou, proto se to dělá v kousku shaderu (ještě než se zkompiluje první materiál).
if (GLOW !== 1) THREE.ShaderChunk.emissivemap_fragment += `
totalEmissiveRadiance *= ${GLOW.toFixed(3)};`;

export const scene = new THREE.Scene();
// Mlha: barvu a hustotu nastavuje den a noc (daylight.js). S nízkou grafikou ji kreslí materiály (FogExp2),
// se střední a vysokou ji kreslí post-processing podle hloubky (řídne s výškou, svítí v ní slunce).
export const FOG = new THREE.FogExp2(0xc4d3de, GFX.fog); // hustší mlha při nižší grafice skryje kratší dohled
scene.fog = FX.post ? null : FOG;
export const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 12000);
camera.rotation.order = 'YXZ';
scene.add(camera);

export const U = {
  sunDir: { value: new THREE.Vector3(0, 1, 0) },
  sunColor: { value: new THREE.Vector3(1, 1, 1) },
  ambient: { value: new THREE.Vector3(0.4, 0.5, 0.7) },
  time: { value: 0 },
  cam: { value: new THREE.Vector3() },
  night: { value: 0 },
  twilight: { value: 0 }, // červánky (slunce těsně pod obzorem)
  // počasí (render/weather.js): wet = jak mokrý je povrch (tmavší, lesklý, louže), rain = síla deště
  wet: { value: 0 }, rain: { value: 0 },
  // nejbližší rybníky pro terén (mokrý břeh): x, z, poloměr, výška hladiny (render/water.js)
  ponds: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) },
  // jeden společný vítr pro trávu, koruny stromů, déšť i částice: (směr x, směr z, poryv 0–1, síla)
  wind: { value: new THREE.Vector4(0.94, 0.33, 0.5, 1) },
  // světlomety auta, které řídíš (terén a tráva mají vlastní osvětlení, tak se kužel počítá v jejich shaderu)
  headPos: { value: new THREE.Vector3() }, headDir: { value: new THREE.Vector3(0, 0, -1) }, headOn: { value: 0 },
  // stíny slunce pro vlastní shadery (terén, tráva): mapa, matice, (zapnuto, 1/rozlišení, posun podél normály, měkkost)
  shadowMap: { value: null }, shadowMatrix: { value: new THREE.Matrix4() }, shadowP: { value: new THREE.Vector4(0, 1 / 1024, 0.06, 2) },
  shadowStrength: { value: 0.85 },
  // okolní světlo: obloha shora, odraz od země zdola; prosvítání trávy proti slunci
  // světla pochodní a lamp (pevný počet, render/blocks.js) i pro terén a trávu: poloha + síla, barva
  pl: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) }, plColor: { value: Array.from({ length: 6 }, () => new THREE.Vector3()) },
  // odlesky oblohy (PMREM z render/sky.js) pro vlastní shadery: louže, opar
  env: { value: null }, envOn: { value: 0 },
  skyAmb: { value: new THREE.Vector3(0.5, 0.6, 0.9) }, groundAmb: { value: new THREE.Vector3(0.3, 0.3, 0.25) }, sss: { value: LK.sss }, foliage: { value: LK.foliage },
};
export const shaderUniforms = (extra = {}) => ({
  ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
  uSunDir: U.sunDir, uSunColor: U.sunColor, uAmbient: U.ambient, uTime: U.time, uCam: U.cam, uNight: U.night, uWet: U.wet, uWind: U.wind, uTwilight: U.twilight, uHeadPos: U.headPos, uHeadDir: U.headDir, uHeadOn: U.headOn,
  uShadowMap: U.shadowMap, uShadowMatrix: U.shadowMatrix, uShadowP: U.shadowP, uShadowStrength: U.shadowStrength, uSkyAmb: U.skyAmb, uGroundAmb: U.groundAmb, uSSS: U.sss, uFoliage: U.foliage, uPL: U.pl, uPLC: U.plColor,
  ...extra,
});
