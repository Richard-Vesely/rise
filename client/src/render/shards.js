// Úlomky světla: krystal s paprskem.
import './forest.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { GLOW } from './look.js';
import { SHARD_CELL } from '../../../shared/world/constants.js';
import { shardAt } from '../../../shared/world/nature.js';
import { removed } from '../../../shared/world/state.js';
import { terrainH } from '../../../shared/world/terrain.js';
import { U, scene } from './renderer.js';
import { glowTex } from './sky.js';

// ============================================================ úlomky – vzhled
export const shardObjs = new Map();
const beamMat = new THREE.ShaderMaterial({
  uniforms: { uTime: U.time, uNight: U.night },
  transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */`
    varying vec2 vUv;
    varying vec3 vN, vV;
    void main() {
      vUv = uv;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vN = normalize(mat3(modelMatrix) * normal); vV = cameraPosition - wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: /* glsl */`
    uniform float uTime, uNight;
    varying vec2 vUv;
    varying vec3 vN, vV;
    void main() {
      // měkký světelný sloupec: uprostřed jasný, k okrajům (kde se na plášť díváme z boku) průhledný, zblízka slabší
      float d = length(vV), side = abs(dot(normalize(vN), vV / d));
      float a = pow(max(1.0 - vUv.y, 0.0), 2.5) * (0.55 + 0.15 * sin(uTime * 3.0 + vUv.y * 20.0)) * side * side * smoothstep(1.5, 14.0, d);
      // paprsek je orientační bod: ve dne svítí silněji, aby byl vidět i proti jasné obloze (pevný nejmenší jas)
      // ve dne vzdálené paprsky (přes ~250 m) zmizí: desítky bílých čar na obzoru vypadaly jako chyba; kompas je ukazuje dál, v noci svítí všechny
      float far = mix(1.0 - smoothstep(90.0, 260.0, d), 1.0, uNight);
      gl_FragColor = vec4(vec3(0.35, 0.9, 1.0) * max(a, 0.05 * side * (1.0 - vUv.y)) * 0.75 * far * (1.0 + ${(GLOW > 1 ? 1.4 : 1.0).toFixed(1)} * (1.0 - uNight)), 1.0);
    }`,
});
const crystalGeo = new THREE.OctahedronGeometry(0.42).scale(1, 1.7, 1);
const crystalMat = new THREE.MeshStandardMaterial({ color: 0xbff8ff, emissive: 0x3fdcff, emissiveIntensity: 2.2, roughness: 0.15, metalness: 0.1 });
const beamGeo = new THREE.CylinderGeometry(0.12, 0.5, 90, 12, 1, true).translate(0, 45, 0);
export function refreshShards(px, pz) {
  const R = 420, wanted = new Set();
  for (let cz = Math.floor((pz - R) / SHARD_CELL); cz <= Math.floor((pz + R) / SHARD_CELL); cz++) {
    for (let cx = Math.floor((px - R) / SHARD_CELL); cx <= Math.floor((px + R) / SHARD_CELL); cx++) {
      const s = shardAt(cx, cz);
      if (!s || removed.has(s.key) || (s.x - px) ** 2 + (s.z - pz) ** 2 > R * R) continue;
      wanted.add(s.key);
      if (shardObjs.has(s.key)) continue;
      const g = new THREE.Group();
      g.position.set(s.x, terrainH(s.x, s.z), s.z);
      const crystal = new THREE.Mesh(crystalGeo, crystalMat);
      crystal.position.y = 1.3;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(0x66e8ff).multiplyScalar(GLOW), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      glow.scale.setScalar(3.2);
      glow.position.y = 1.3;
      g.add(crystal, glow, new THREE.Mesh(beamGeo, beamMat));
      scene.add(g);
      shardObjs.set(s.key, { ...s, group: g, crystal });
    }
  }
  for (const [k, o] of shardObjs) if (!wanted.has(k)) { scene.remove(o.group); shardObjs.delete(k); }
}
