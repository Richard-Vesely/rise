// Svatyně a portál do Markovy dimenze.
import '../render/shards.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { NET } from '../../../shared/net/net.js';
import { mobs, removeMob } from '../../../shared/sim/mobs.js';
import { portalActive, setPortalActive } from '../../../shared/world/state.js';
import { SHRINES } from '../../../shared/world/terrain.js';
import { DRAGON_HOME, DRAGON_SHRINE } from '../../../shared/world/dragon-land.js';
import { buildDragonPortal } from './dragon-portal.js';
import { Sound } from '../audio/sound.js';
import { MP } from '../game/boot.js';
import { countItem, removeItem } from '../player/inventory.js';
import { keys, player } from '../player/player.js';
import { rebuildForest } from '../render/forest.js';
import { sparks } from '../render/particles.js';
import { U, scene } from '../render/renderer.js';
import { updateEnvironment } from '../render/sky.js';
import { stoneTex } from '../render/textures.js';
import { $ } from '../ui/dom.js';
import { toast } from '../ui/hud.js';
import { renderHotbar } from '../ui/inventory-ui.js';

// ============================================================ svatyně a portály (místo oživení, bezpečná zóna)
// Domácí svatyně se aktivuje 3 úlomky světla a otevře portál do Markovy dimenze; tamní svatyně vede zpět.
export const shrineColliders = [];
const floorTex = stoneTex.clone();
floorTex.repeat.set(5, 5);
floorTex.needsUpdate = true;
const portalShader = (color1, color2) => new THREE.ShaderMaterial({
  uniforms: { uTime: U.time, uOpen: { value: 0 }, uC1: { value: new THREE.Color(color1) }, uC2: { value: new THREE.Color(color2) } },
  transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform float uTime, uOpen;
    uniform vec3 uC1, uC2;
    varying vec2 vUv;
    void main() {
      vec2 p = vUv - 0.5;
      float r = length(p) * 2.0, a = atan(p.y, p.x);
      float s1 = sin(a * 5.0 + r * 12.0 - uTime * 3.0) * 0.5 + 0.5;
      float s2 = sin(a * 3.0 - r * 8.0 + uTime * 2.0) * 0.5 + 0.5;
      vec3 col = mix(uC1, uC2, s1 * s2);
      float alpha = uOpen * smoothstep(1.0, 0.85, r) * (0.5 + 0.5 * s1);
      gl_FragColor = vec4(col * (1.2 + smoothstep(0.6, 0.0, r) * 2.5) * alpha, 1.0);
    }`,
});
function buildShrine(shrine) {
  const { x: cx, z: cz, mark } = shrine;
  const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.9, color: mark ? 0x9a8ad8 : 0xd8d2c4 });
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95, color: mark ? 0x7a70b0 : 0xbab3a4 });
  const add = (geo, mat, x, y, z, ry = 0, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(cx + x, y, cz + z);
    m.rotation.set(rx, ry, rz);
    scene.add(m);
    return m;
  };
  add(new THREE.CylinderGeometry(9.6, 9.9, 1, 64), floorMat, 0, -0.3, 0);
  add(new THREE.CylinderGeometry(4.6, 4.7, 0.25, 48), floorMat, 0, 0.325, 0);
  const heights = mark ? [6, 6, 6, 4.5, 6, 6, 3, 6] : [6, 6, 2.3, 6, 3.6, 6, 6, 1.4];
  const pillars = heights.map((h, i) => {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.cos(a) * 7.4, z = Math.sin(a) * 7.4, tilt = h < 6 ? 0.05 : 0;
    add(new THREE.BoxGeometry(1.2, h, 1.2), stoneMat, x, 0.2 + h / 2, z, -a, tilt, tilt);
    shrineColliders.push({ x: cx + x, z: cz + z, r: 0.85 });
    return { x, z };
  });
  for (const [i, j] of [[0, 1], [5, 6]]) {
    const p = pillars[i], q = pillars[j];
    add(new THREE.BoxGeometry(Math.hypot(q.x - p.x, q.z - p.z) + 1.2, 0.75, 1.35), stoneMat, (p.x + q.x) / 2, 6.55, (p.z + q.z) / 2, -Math.atan2(q.z - p.z, q.x - p.x));
  }
  if (!mark) {
    add(new THREE.BoxGeometry(1.15, 3.2, 1.15), stoneMat, 9.8, 0.45, 5.6, 0.6, 0, Math.PI / 2 - 0.1);
    add(new THREE.BoxGeometry(1.1, 2.0, 1.1), stoneMat, -3.2, 0.75, 9.9, 1.3, 0, Math.PI / 2);
    shrineColliders.push({ x: cx + 9.8, z: cz + 5.6, r: 1.2 }, { x: cx - 3.2, z: cz + 9.9, r: 1.0 });
  }
  const glow = mark ? 0xd24ee8 : 0x2ad8ff;
  shrine.ring = add(new THREE.TorusGeometry(2.45, 0.32, 18, 72), new THREE.MeshStandardMaterial({ map: stoneTex, color: 0x9aa3a8, roughness: 0.6, metalness: 0.2, emissive: glow, emissiveIntensity: 0.15 }), 0, 3.05, 0);
  add(new THREE.BoxGeometry(1.0, 0.9, 1.0), stoneMat, -2.45, 0.9, 0);
  add(new THREE.BoxGeometry(1.0, 0.9, 1.0), stoneMat, 2.45, 0.9, 0);
  shrineColliders.push({ x: cx - 2.5, z: cz, r: 0.6 }, { x: cx + 2.5, z: cz, r: 0.6 });
  // Tři lůžka na úlomky světla nad portálem
  shrine.sockets = [-0.6, 0, 0.6].map((dx) => {
    const m = add(new THREE.OctahedronGeometry(0.2).scale(1, 1.5, 1), new THREE.MeshStandardMaterial({ color: 0x334048, roughness: 0.3, metalness: 0.5, emissive: 0x6ff2ff, emissiveIntensity: 0 }), dx, 5.85 + (dx ? -0.1 : 0.08), 0.35);
    return m;
  });
  shrine.surface = add(new THREE.CircleGeometry(2.2, 64), portalShader(mark ? 0x7a1aff : 0x2a40ff, mark ? 0xffa0ff : 0xd0a0ff), 0, 3.05, 0);
  shrine.light = new THREE.PointLight(mark ? 0xd070ff : 0x9a7aff, 0, 30, 1.6);
  shrine.light.position.set(cx, 3.2, cz + 1);
  scene.add(shrine.light);
  shrine.open = 0;
}
SHRINES.forEach(buildShrine);
for (const s of [DRAGON_HOME, DRAGON_SHRINE]) buildDragonPortal(s, scene, stoneTex, portalShader, shrineColliders);
export const portals = [...SHRINES, DRAGON_HOME, DRAGON_SHRINE];
export const shrineActive = (s) => s.dragon || s.mark || portalActive;
export function updatePortals(dt) {
  for (const s of portals) {
    const want = shrineActive(s) ? 1 : 0;
    s.open += (want - s.open) * Math.min(1, dt * 0.8);
    s.surface.material.uniforms.uOpen.value = s.open;
    s.ring.material.emissiveIntensity = 0.15 + s.open * 1.2;
    s.light.intensity = s.open * 35;
    s.sockets.forEach((m) => (m.material.emissiveIntensity = shrineActive(s) ? 3 : 0));
    if (s.open > 0.5 && Math.random() < dt * 25) {
      const a = Math.random() * Math.PI * 2;
      sparks.emit(s.x + Math.cos(a) * 2.4, 3.05 + Math.sin(a) * 2.4, s.z, s.dragon ? [1, 0.55, 0.15] : s.mark ? [1, 0.5, 1] : [0.6, 0.6, 1], 1, 0.6, 0.5);
    }
  }
}
// Pravé tlačítko na spící portál: vloží 3 úlomky světla a probudí svatyni.
export function usePortal(s) {
  if (shrineActive(s)) { toast('Projdi portálem'); return; }
  if (countItem('shard') < 3) { toast(`Svatyně potřebuje 3 úlomky světla (máš ${countItem('shard')})`); return; }
  removeItem('shard', 3);
  renderHotbar();
  setPortalActive(true);
  NET.op(['p']);
  Sound.portal();
  sparks.emit(s.x, 4, s.z, [0.6, 0.7, 1], 120, 6, 2);
  toast('Svatyně se probudila! Portál do Markovy dimenze je otevřený.');
}
// Průchod portálem přenese hráče do druhé svatyně.
let portalCd = 0;
export function checkPortal(dt) {
  if ((portalCd -= dt) > 0) return;
  const p = player.pos;
  const s = portals.find((s) => s.open >= 0.8 && Math.abs(p.x - s.x) <= 1.7 && Math.abs(p.z - s.z) <= 0.6 && p.y >= -1 && p.y <= 4);
  if (!s) return;
  const to = s.dragon ? (s.returnHome ? DRAGON_HOME : DRAGON_SHRINE) : SHRINES[s.mark ? 0 : 1];
  teleport(to.x, to.z + (to === DRAGON_SHRINE ? -3.5 : 3.5));
  if (to === DRAGON_SHRINE) player.yaw = 0; // pohled k osvětlené cestě do jeskyně
  toast(s.dragon ? (s.returnHome ? 'Zpět doma' : 'Země draka — jeskyně leží před tebou. Připrav si zbroj!') : to.mark ? 'Markova dimenze' : 'Zpět doma');
}
export function teleport(x, z) {
  portalCd = 3;
  player.pos.set(x, 0.45, z);
  player.vel.set(0, 0, 0);
  player.yaw = Math.PI; // čelem od portálu
  keys.clear();
  if (!MP) for (const m of [...mobs]) removeMob(m); // ve hře pro více hráčů tvorové zůstanou ostatním
  rebuildForest(x, z, true);
  updateEnvironment();
  Sound.portal();
  $('fade').style.transition = 'none';
  $('fade').style.background = '#fff';
  $('fade').textContent = '';
  $('fade').style.opacity = 0.9;
  requestAnimationFrame(() => { $('fade').style.transition = 'opacity 1.2s'; $('fade').style.opacity = 0; });
  setTimeout(() => { $('fade').style.background = ''; $('fade').textContent = 'Padl jsi…'; $('fade').style.transition = ''; }, 1300);
}
