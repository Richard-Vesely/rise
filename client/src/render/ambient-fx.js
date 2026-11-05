// Částice prostředí (všechny kvality, levné): žhavé jiskry a tenký kouř nad táborákem a pochodněmi, prach ve světle
// pochodní v jeskyni a pomalu se vznášející světélka v Markově dimenzi. Bez vedlejších účinků při načtení: initAmbientFx().
import * as THREE from 'three';
import { furnaces } from '../../../shared/world/state.js';
import { isMark, terrainH } from '../../../shared/world/terrain.js';
import { GFX } from '../game/prefs.js';
import { specials } from './blocks.js';
import { GLOW } from './look.js';
import { U, camera, scene } from './renderer.js';
import { glowTex } from './sky.js';

const N = 700;
// Jeden systém, dva způsoby míchání: kouř (normální) a světélka (sčítání = září).
function makeSystem(additive) {
  const pos = new Float32Array(N * 3).fill(-9999), col = new Float32Array(N * 4), size = new Float32Array(N);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 4));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: glowTex }, uScale: { value: innerHeight / 2 } },
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: /* glsl */`
      attribute vec4 aCol;
      attribute float aSize;
      uniform float uScale;
      varying vec4 vCol;
      void main() {
        vCol = aCol;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uScale / max(-mv.z, 0.1);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      varying vec4 vCol;
      void main() {
        float a = texture2D(uMap, gl_PointCoord).r * vCol.a;
        if (a < 0.004) discard;
        gl_FragColor = vec4(vCol.rgb, a);
      }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.userData.sh = 1;
  const P = { pts, pos, col, size, vel: new Float32Array(N * 3), life: new Float32Array(N), max: new Float32Array(N), kind: new Uint8Array(N), base: new Float32Array(N * 4), next: 0, seed: new Float32Array(N) };
  return P;
}
let smoke = null, glow = null;
export function initAmbientFx() {
  if (smoke) return;
  smoke = makeSystem(false);
  glow = makeSystem(true);
  scene.add(smoke.pts, glow.pts);
  addEventListener('resize', () => { for (const s of [smoke, glow]) s.pts.material.uniforms.uScale.value = innerHeight / 2; });
}
// druh: 0 jiskra, 1 kouř, 2 prach, 3 světélko Marka
function emit(S, kind, x, y, z, vx, vy, vz, life, size, r, g, b, a) {
  const i = S.next;
  S.next = (S.next + 1) % N;
  S.pos.set([x, y, z], i * 3);
  S.vel.set([vx, vy, vz], i * 3);
  S.life[i] = S.max[i] = life;
  S.size[i] = size;
  S.kind[i] = kind;
  S.base.set([r, g, b, a], i * 4);
  S.seed[i] = Math.random() * 6.28;
}
const rnd = (a, b) => a + Math.random() * (b - a);
/** Hořící pec (jako v Minecraftu): z komína jde kouř, z otvoru občas vyletí jiskra. */
function furnaceFx(key, s, step, k, wind) {
  if (!(furnaces.get(key)?.burn > 0)) return;
  const dx = s.x + 0.5 - camera.position.x, dz = s.z + 0.5 - camera.position.z;
  if (dx * dx + dz * dz > 900) return;
  const r = s.obj.rotation.y, sn = Math.sin(r), cs = Math.cos(r);
  // komín je v modelu na (0.25, 1.2, -0.2), otvor vpředu na (0, 0.3, 0.55); otočí se s pecí
  const cx = s.x + 0.5 + 0.25 * cs - 0.2 * sn, cz = s.z + 0.5 - 0.25 * sn - 0.2 * cs;
  if (Math.random() < step * 3 * k) {
    const am = U.ambient.value, l = (am.x + am.y + am.z) / 3 * 0.5;
    emit(smoke, 1, cx + rnd(-0.05, 0.05), s.ry + 1.25, cz + rnd(-0.05, 0.05), wind.x * 0.25, rnd(0.5, 0.9), wind.y * 0.25, rnd(2.5, 4), rnd(0.25, 0.4), l + 0.08, l + 0.07, l + 0.06, 0.14);
  }
  if (Math.random() < step * 1.2 * k)
    emit(glow, 0, s.x + 0.5 + 0.55 * sn + rnd(-0.15, 0.15), s.ry + 0.3, s.z + 0.5 + 0.55 * cs + rnd(-0.15, 0.15), sn * rnd(0.1, 0.4), rnd(0.4, 1), cs * rnd(0.1, 0.4), rnd(0.5, 1.1), rnd(0.02, 0.04), 1.0 * GLOW, 0.55 * GLOW, 0.2 * GLOW, 1);
}
let acc = 0, dustAcc = 0, markAcc = 0;
/** Každý snímek: vypustí nové částice u ohňů (do 30 m), v jeskyni prach ve světle, v Markově dimenzi světélka. */
export function updateAmbientFx(dt, under = 0) {
  if (!smoke) return;
  const cp = camera.position, wind = U.wind.value, k = GFX.particles;
  acc += dt;
  if (acc > 0.05) {
    const step = acc; acc = 0;
    for (const [key, s] of specials) {
      if (s.type === 'furnace') { furnaceFx(key, s, step, k, wind); continue; }
      if (s.type !== 'campfire' && s.type !== 'torch' && s.type !== 'lantern') continue;
      const x = s.lp ? s.lp[0] : s.x + 0.5, z = s.lp ? s.lp[2] : s.z + 0.5, dx = x - cp.x, dz = z - cp.z; // lp = plamen pochodně (i na zdi)
      if (dx * dx + dz * dz > 900) continue;
      const fire = s.type === 'campfire', top = s.lp ? s.lp[1] + 0.1 : s.ry + (fire ? 0.45 : 0.5);
      // žhavé jiskry: stoupají, kmitají a hasnou
      if (s.type !== 'lantern' && Math.random() < step * (fire ? 9 : 1.5) * k)
        emit(glow, 0, x + rnd(-0.15, 0.15), top, z + rnd(-0.15, 0.15), rnd(-0.2, 0.2), rnd(0.8, 1.8), rnd(-0.2, 0.2), rnd(0.8, 1.8), rnd(0.025, 0.05), 1.0 * GLOW, 0.55 * GLOW, 0.2 * GLOW, 1);
      // tenký kouř: šedý, roste, vítr ho odnáší
      if (s.type !== 'lantern' && Math.random() < step * (fire ? 6 : 1.2) * k) {
        const am = U.ambient.value, l = (am.x + am.y + am.z) / 3 * 0.5; // kouř je osvětlený oblohou a zespodu ohněm
        emit(smoke, 1, x + rnd(-0.1, 0.1), top + 0.2, z + rnd(-0.1, 0.1), wind.x * 0.25, rnd(0.5, 0.9), wind.y * 0.25, rnd(2.5, 4.5), fire ? rnd(0.35, 0.55) : 0.25, l + 0.09, l + 0.06, l + 0.04, fire ? 0.16 : 0.08);
      }
    }
  }
  // prach poletující ve světle pochodní v jeskyni
  if (under > 0.5 && (dustAcc += dt * 30 * k) > 1) {
    for (; dustAcc > 1; dustAcc--) {
      const l = U.pl.value[Math.floor(Math.random() * U.pl.value.length)];
      if (!l || l.w <= 0) continue;
      emit(glow, 2, l.x + rnd(-3, 3), l.y + rnd(-1.5, 1.5), l.z + rnd(-3, 3), rnd(-0.05, 0.05), rnd(-0.03, 0.04), rnd(-0.05, 0.05), rnd(3, 6), 0.018, 0.5, 0.42, 0.32, 0.6);
    }
  }
  // Markova dimenze: fialová a azurová světélka kolem hráče pomalu stoupají
  if (isMark(cp.x) && under < 0.5 && (markAcc += dt * 40 * k) > 1) {
    for (; markAcc > 1; markAcc--) {
      const x = cp.x + rnd(-24, 24), z = cp.z + rnd(-24, 24), y = terrainH(x, z) + rnd(0.3, 5);
      const c = Math.random() < 0.7 ? [0.85, 0.35, 1.0] : [0.3, 0.85, 1.0];
      emit(glow, 3, x, y, z, rnd(-0.1, 0.1), rnd(0.15, 0.4), rnd(-0.1, 0.1), rnd(4, 8), rnd(0.04, 0.08), c[0] * GLOW * 0.8, c[1] * GLOW * 0.8, c[2] * GLOW * 0.8, 1);
    }
  }
  for (const S of [smoke, glow]) {
    const { pos, vel, life, max, col, base, size, kind, seed } = S;
    for (let i = 0; i < N; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      const j = i * 3, t = 1 - life[i] / max[i];
      if (kind[i] === 1) { vel[j] += wind.x * 0.15 * dt; vel[j + 2] += wind.y * 0.15 * dt; size[i] += dt * 0.35; }
      if (kind[i] === 0 || kind[i] === 3 || kind[i] === 2) { const w = Math.sin(seed[i] + life[i] * 7) * 0.3; vel[j] += w * dt; vel[j + 2] -= w * dt; }
      pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
      // průhlednost: kouř se rozplývá, jiskry blikají a hasnou, světélka pulzují
      const fadeIn = Math.min(1, t * 6), fadeOut = 1 - t;
      const a = kind[i] === 1 ? fadeIn * fadeOut * fadeOut : kind[i] === 0 ? fadeOut * (0.6 + 0.4 * Math.sin(seed[i] + t * 30)) : fadeIn * fadeOut * (0.6 + 0.4 * Math.sin(seed[i] + t * 12));
      col.set([base[i * 4], base[i * 4 + 1], base[i * 4 + 2], base[i * 4 + 3] * a], i * 4);
      if (life[i] <= 0) { pos[j + 1] = -9999; col[i * 4 + 3] = 0; }
    }
    const g = S.pts.geometry;
    g.attributes.position.needsUpdate = g.attributes.aCol.needsUpdate = g.attributes.aSize.needsUpdate = true;
  }
}
