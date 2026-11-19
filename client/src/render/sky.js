// Obloha, slunce, měsíc a hvězdy.
import './renderer.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { Sky } from 'three/addons/objects/Sky.js';
import * as THREE from 'three';
import { rng } from '../../../shared/util.js';
import { FX, LK } from './look.js';
import { U, renderer, scene } from './renderer.js';

// ============================================================ obloha, slunce, měsíc, hvězdy
export const sky = new Sky();
sky.scale.setScalar(10000);
scene.add(sky);
export const skyU = sky.material.uniforms;
skyU.rayleigh.value = LK.sky.rayleigh;
// jas oblohy podle vzhledu (bez toho je obloha proti krajině moc světlá)
// Navíc červánky (oranžový až růžový pás u obzoru, fialová nahoře), noční modř místo černé a šedá zatažená obloha za deště.
// Polární záře (Markova dimenze, tundra v noci): vlnící se závěsy světla v pásu nad obzorem.
Object.assign(skyU, { skyGain: { value: 1 }, uTwilight: { value: 0 }, uNightSky: { value: 0 }, uOvercast: { value: 0 }, uAurora: { value: 0 }, uAuroraMark: { value: 0 }, uSkyTime: { value: 0 }, uDragon: { value: 0 } });
sky.material.fragmentShader = `#define SUN_CAP 14.0\n#define TWI_K ${FX.post ? '1.6' : '1.0'}\n` + 'uniform float skyGain, uTwilight, uNightSky, uOvercast, uAurora, uAuroraMark, uSkyTime, uDragon;\n' + sky.material.fragmentShader.replace('gl_FragColor = vec4( retColor, 1.0 );', /* glsl */`
  vec3 dirS = normalize( vWorldPosition - cameraPosition );
  float hS = max( dirS.y, 0.0 );
  float toSun = dot( normalize( dirS.xz + 1e-5 ), normalize( vSunDirection.xz + 1e-5 ) ) * 0.5 + 0.5;
  vec3 col = retColor * skyGain;
  if ( uTwilight > 0.0 ) {
    vec3 horizonC = mix( vec3( 0.9, 0.22, 0.42 ), vec3( 1.0, 0.45, 0.1 ), toSun * toSun );
    vec3 band = horizonC * exp( -hS * mix( 9.0, 4.0, toSun ) ) * ( 0.35 + 0.9 * toSun * toSun );
    vec3 top = vec3( 0.16, 0.08, 0.32 ) * smoothstep( 0.05, 0.7, hS );
    col += uTwilight * ( band * 0.55 + top * 0.35 ) * TWI_K;
  }
  // noc: tmavě modrá obloha, u obzoru o kousek světlejší
  col += uNightSky * mix( vec3( 0.012, 0.02, 0.05 ), vec3( 0.004, 0.007, 0.022 ), smoothstep( 0.0, 0.5, hS ) );
  if ( uAurora > 0.0 && hS > 0.02 ) {
    float az = atan( dirS.z, dirS.x ), t = uSkyTime;
    float centre = 0.3 + 0.07 * sin( az * 2.0 + t * 0.05 ) + 0.03 * sin( az * 5.0 - t * 0.08 );
    float band = exp( -pow( ( hS - centre ) / 0.09, 2.0 ) );
    float curtain = 0.55 + 0.45 * sin( az * 23.0 + sin( az * 7.0 + t * 0.15 ) * 2.5 + t * 0.2 );
    curtain *= 0.6 + 0.4 * sin( az * 61.0 - t * 0.35 );
    float rays = smoothstep( centre - 0.12, centre + 0.18, hS ); // nahoře přechází do jiné barvy
    vec3 lowC = mix( vec3( 0.15, 1.0, 0.55 ), vec3( 0.2, 0.85, 1.0 ), uAuroraMark ), highC = mix( vec3( 0.55, 0.3, 1.0 ), vec3( 0.95, 0.25, 1.0 ), uAuroraMark );
    col += mix( lowC, highC, rays ) * band * curtain * uAurora * 0.32;
  }
  if ( uOvercast > 0.0 ) { float l = dot( col, vec3( 0.3, 0.59, 0.11 ) ); col = mix( col, vec3( l ) * vec3( 0.86, 0.9, 0.96 ) * 0.75, uOvercast * 0.85 ); }
  // Obloha kolem slunce nesmí přes práh záře (bloom): jinak záře obkreslí kolem slunce kruh s tvrdým duhovým okrajem.
  // Jas oblohy se proto měkce stlačí pod práh (odstín zůstane); září jen samotný kotouč slunce, i ten se stropem jasu.
  float mxS = max( max( col.r, col.g ), col.b );
  float disc = smoothstep( 0.99994, 0.99996, dot( dirS, normalize( vSunDirection ) ) );
  float knee = mxS > 0.85 ? 0.85 + ( mxS - 0.85 ) / ( 1.0 + ( mxS - 0.85 ) / 0.35 ) : mxS;
  float capS = mix( knee, min( mxS, SUN_CAP ), disc );
  if ( mxS > 1e-4 ) col *= capS / mxS;
  col = mix(col, vec3(1.25, 0.55, 0.22) * dot(col, vec3(0.2126, 0.7152, 0.0722)), uDragon * 0.85);
  gl_FragColor = vec4( col, 1.0 );`);
skyU.mieCoefficient.value = 0.004;
skyU.mieDirectionalG.value = 0.82;
export const sunDir = new THREE.Vector3();
export const sunLight = new THREE.DirectionalLight(0xffffff, 3);
scene.add(sunLight);
export const hemi = new THREE.HemisphereLight(0xbcd3ff, 0x40452a, 1);
scene.add(hemi);

function radialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
export const glowTex = radialTexture([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]);
export const moon = new THREE.Sprite(new THREE.SpriteMaterial({
  map: radialTexture([[0, '#fffdf4'], [0.42, '#f4f0e0'], [0.48, 'rgba(220,230,255,0.25)'], [1, 'rgba(200,220,255,0)']]),
  fog: false, depthWrite: false, transparent: true,
}));
moon.scale.setScalar(420);
moon.renderOrder = -2; // měsíc a hvězdy za mraky (render/clouds.js)
scene.add(moon);
export const stars = (() => {
  const n = 2500, pos = new Float32Array(n * 3), r = rng(42);
  for (let i = 0; i < n; i++) {
    const u = r() * Math.PI * 2, v = Math.acos(r() * 0.98);
    pos.set([Math.sin(v) * Math.cos(u) * 4500, Math.cos(v) * 4500, Math.sin(v) * Math.sin(u) * 4500], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.7, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false }));
  p.frustumCulled = false;
  p.renderOrder = -2;
  return p;
})();
scene.add(stars);

const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
let envRT = null;
export function updateEnvironment() {
  const p = sky.position.clone();
  sky.position.set(0, 0, 0);
  envScene.add(sky);
  const rt = pmrem.fromScene(envScene, 0, 1, 20000);
  scene.add(sky);
  sky.position.copy(p);
  if (envRT) envRT.dispose();
  envRT = rt;
  scene.environment = rt.texture;
  U.env.value = rt.texture; U.envOn.value = rt.texture.image?.height === 1024 ? 1 : 0;
}
