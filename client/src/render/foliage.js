// Tvary a materiály stromů: koruny (blízké podrobné, vzdálené levné), patra smrků, lístky a větvičky s jehličím.
// Jen funkce, žádné vedlejší účinky při načtení (používá je render/forest.js).
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { FX, LK } from './look.js';
import { U } from './renderer.js';

export function lumpy(geo, amt, seed) {
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 3.1 + seed) * Math.sin(v.y * 2.7 + seed * 1.7) * Math.sin(v.z * 3.3 + seed * 0.7);
    v.multiplyScalar(1 + n * amt);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// Vítr v korunách: koruna se kývá (víc nahoře), listí se třepotá. Posun dělá vertex shader, takže to nic nestojí.
// Všechno řídí společný vítr U.wind (stejný jako tráva a déšť). kind: 'trunk' = kmen se ohýbá jen nahoře a má tmavší patu,
// 'crown' = koruna (uvnitř tmavší, skvrnitá jako trsy listí, proti slunci prosvítá okraj), 'leaves' = lístky a jehličí
// (třepotají se nejvíc), 'pine' = patro smrku (zespodu tmavší).
export function windy(mat, kind = 'crown') {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uTime: U.time, uWind: U.wind, uCardR: { value: FX.leafCards }, uSSS: U.sss, uCrownTex: { value: kind === 'crown' ? crownTexture() : null } });
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform float uCardR, uSSS;
      uniform sampler2D uCrownTex;
      varying float vLocalY, vDist;
      varying vec3 vLocal, vLocalN;
      float fh(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float fn3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(fh(i), fh(i + vec3(1, 0, 0)), f.x), mix(fh(i + vec3(0, 1, 0)), fh(i + vec3(1, 1, 0)), f.x), f.y),
                   mix(mix(fh(i + vec3(0, 0, 1)), fh(i + vec3(1, 0, 1)), f.x), mix(fh(i + vec3(0, 1, 1)), fh(i + vec3(1, 1, 1)), f.x), f.y), f.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb = max(mix(vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))), diffuseColor.rgb, ${LK.foliage.toFixed(3)}), 0.0) * ${(kind === 'trunk' ? 1 : LK.leaves).toFixed(3)};
      ${kind === 'trunk' ? 'diffuseColor.rgb *= mix(0.5, 1.0, smoothstep(0.0, 0.22, vLocalY)); // pata kmene u země je tmavší' : ''}
      ${kind === 'crown' ? `{ // listí po celé koruně (textura promítnutá ze tří stran), trsy světlejších a tmavších shluků,
        // jádro koruny (spodek, vnitřek) je tmavší – koruna pak nevypadá jako hladký balon
        vec3 an = abs(normalize(vLocalN)); an /= an.x + an.y + an.z;
        float lf = texture2D(uCrownTex, vLocal.zy * 0.9).r * an.x + texture2D(uCrownTex, vLocal.xz * 0.9).r * an.y + texture2D(uCrownTex, vLocal.xy * 0.9).r * an.z;
        float cl = fn3(vLocal * 3.1) * 0.65 + fn3(vLocal * 7.5) * 0.35;
        diffuseColor.rgb *= mix(0.4, 1.18, lf) * mix(0.7, 1.1, smoothstep(0.25, 0.8, cl)) * mix(0.72, 1.0, smoothstep(-0.7, 0.5, vLocalY));
        ${FX.leafCards ? 'diffuseColor.rgb *= mix(0.78, 1.0, smoothstep(uCardR * 0.8, uCardR, vDist)); // zblízka je jádro pod lístky tmavší' : ''}
      }` : ''}
      ${kind === 'pine' ? 'diffuseColor.rgb *= mix(0.55, 1.0, smoothstep(-0.1, 0.6, vLocalY)) * (0.85 + 0.3 * fn3(vLocal * 7.0));' : ''}
      ${kind === 'leaves' ? 'diffuseColor.rgb *= 0.95 + 0.15 * vLocalY;' : ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      ${kind === 'trunk' ? '' : `{ // světlo prosvítá okrajem koruny, když je za ní slunce
        float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.0);
        totalEmissiveRadiance += diffuseColor.rgb * rim * uSSS * 0.3 * smoothstep(-0.3, 0.3, vLocalY);
      }`}`);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec4 uWind;\nvarying float vLocalY, vDist;\nvarying vec3 vLocal, vLocalN;').replace('#include <begin_vertex>', `#include <begin_vertex>
      vLocalY = position.y; vDist = 0.0; vLocal = position; vLocalN = normal;
      #ifdef USE_INSTANCING
      {
        vec3 ip = instanceMatrix[3].xyz;
        vDist = distance(ip, cameraPosition);
        float ph = ip.x * 0.37 + ip.z * 0.21;
        vLocal += ip * 0.13;
        // poryv se valí krajinou ve směru větru (stejná vlna jako v trávě)
        float wave = sin(dot(ip.xz, uWind.xy) * 0.05 - uTime * 0.9);
        float gust = (0.55 + 0.45 * wave) * (0.7 + 0.6 * uWind.z) * uWind.w;
        vec2 sway = uWind.xy * (sin(uTime * 1.2 + ph) * 0.6 + sin(uTime * 2.1 + ph * 1.7) * 0.3 + 0.35 * wave) * gust * ${(0.045 * LK.wind).toFixed(4)};
        ${kind === 'trunk' ? 'transformed.xz += sway * transformed.y * transformed.y * 0.6;'
    : kind === 'crown' || kind === 'pine' ? `transformed.xz += sway * (0.6 + 0.4 * clamp(position.y, -1.0, 1.0));
        transformed += normalize(position + vec3(0.0, 0.001, 0.0)) * sin(uTime * 7.0 + dot(position, vec3(4.0)) + ph) * ${(0.018 * LK.wind).toFixed(4)} * gust;`
      : `transformed.xz += sway * (0.6 + 0.4 * clamp(position.y, -1.0, 1.0));
        transformed += normal * sin(uTime * 9.0 + dot(position, vec3(7.0)) + ph) * ${(0.05 * LK.wind).toFixed(4)} * gust;`}
      }
      #endif`);
  };
  return mat;
}

// Koruna listnáče: spojené vrcholy → měkké stínování místo plošek. Blízká má boule jako trsy listí (květák),
// vzdálená je levná (málo trojúhelníků), na dálku rozdíl není vidět.
export function crownGeo(detail) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, detail).deleteAttribute('normal').deleteAttribute('uv'));
  if (detail >= 3) {
    const p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      const n = Math.sin(v.x * 7.3 + 1.1) * Math.sin(v.y * 6.1 + 0.4) * Math.sin(v.z * 7.7 + 2.3) * 0.11
        + Math.sin(v.x * 13.1 + v.z * 4.0) * Math.sin(v.y * 11.3 - v.x * 3.0) * 0.05;
      v.multiplyScalar(1 + n);
      p.setXYZ(i, v.x, v.y, v.z);
    }
  }
  return lumpy(g, 0.2, 1.3).scale(1, 0.85, 1);
}

// Smrk / borovice: patro z převislých větví (hvězdicový okraj), hladce stínované
export function pineTierGeo(spikes = 11) {
  const pos = [0, 1, 0], idx = []; // špička
  const ring = (y, rad, jag, droop, off) => {
    const start = pos.length / 3;
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2 + off, out = i % 2 === 0;
      const r = rad * (out ? 1 : 1 - jag);
      pos.push(Math.cos(a) * r, y - (out ? droop : 0), Math.sin(a) * r);
    }
    return start;
  };
  const mid = ring(0.45, 0.55, 0.25, 0.04, 0.1), rim = ring(0.0, 1.0, 0.42, 0.12, 0);
  const n = spikes * 2;
  for (let i = 0; i < n; i++) idx.push(0, mid + ((i + 1) % n), mid + i);
  for (let i = 0; i < n; i++) { const a = mid + i, b = mid + ((i + 1) % n), c = rim + i, d = rim + ((i + 1) % n); idx.push(a, b, c, b, d, c); }
  const under = pos.length / 3;
  pos.push(0, 0.12, 0); // spodní strana (pod větvemi)
  for (let i = 0; i < n; i++) idx.push(under, rim + i, rim + ((i + 1) % n));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Textura z plátna jako DataTexture (průhledné pixely dostanou barvu listí, jinak by se okraje v dálce rozmazaly do černa)
function alphaTexture(draw, fill) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  let s = 3;
  draw(g, () => (s = (s * 16807) % 2147483647) / 2147483647);
  const img = g.getImageData(0, 0, 128, 128).data;
  for (let i = 0; i < img.length; i += 4) if (img[i + 3] < 128) { img[i] = fill[0]; img[i + 1] = fill[1]; img[i + 2] = fill[2]; img[i + 3] = 0; } else img[i + 3] = 255;
  const t = new THREE.DataTexture(img, 128, 128, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}
// Lístky: hustý trs listů s žilkou, světlejší a tmavší. Šedé (bez barvy): zelený nádech dostanou listnáče
// barvou instance (LEAF_TINT v forest.js), třešeň zůstane růžová a nezhnědne
export const leafTexture = () => alphaTexture((g, r) => {
  for (let i = 0; i < 95; i++) {
    const x = 10 + r() * 108, y = 10 + r() * 108, a = r() * Math.PI * 2, l = 5 + r() * 7;
    const v = 170 + r() * 70;
    g.fillStyle = `rgb(${v | 0},${v | 0},${v | 0})`;
    g.beginPath(); g.ellipse(x, y, l, l * 0.45, a, 0, Math.PI * 2); g.fill();
    g.strokeStyle = `rgba(100,100,100,0.5)`; g.lineWidth = 0.7;
    g.beginPath(); g.moveTo(x - Math.cos(a) * l * 0.8, y - Math.sin(a) * l * 0.8); g.lineTo(x + Math.cos(a) * l * 0.8, y + Math.sin(a) * l * 0.8); g.stroke();
  }
}, [205, 205, 205]);
// Větvička s jehličím: hlavní stonek po délce karty (v = 0 u kmene, 1 na konci), krátké jehličí do stran, ke konci kratší
export const needleTexture = () => alphaTexture((g, r) => {
  const stem = (x0, y0, x1, y1, len, w) => {
    g.strokeStyle = 'rgb(120,105,80)'; g.lineWidth = w;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    const n = 26;
    for (let i = 0; i < n; i++) {
      const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, l = len * (1 - t * 0.6) * (0.75 + r() * 0.5);
      const ang = Math.atan2(y1 - y0, x1 - x0);
      for (const side of [-1, 1]) {
        const a = ang + side * (0.9 + r() * 0.4);
        const v = 165 + r() * 80;
        g.strokeStyle = `rgb(${v * 0.82 | 0},${v | 0},${v * 0.86 | 0})`; g.lineWidth = 1.4 + r() * 0.8;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
    }
  };
  stem(64, 2, 64, 124, 26, 2.5);
  stem(64, 30, 22, 96, 18, 1.5); stem(64, 36, 106, 100, 18, 1.5);
  stem(64, 70, 40, 120, 12, 1.2); stem(64, 74, 90, 122, 12, 1.2);
}, [150, 185, 160]);

// Listí na povrchu koruny: hustě nahusto lístky s tmavými mezerami, dlaždice (navazuje na okrajích), jen jas (kanál R)
let crownTex = null;
function crownTexture() {
  if (crownTex) return crownTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(40,40,40)'; g.fillRect(0, 0, 128, 128);
  let s = 11;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 260; i++) {
    const x = r() * 128, y = r() * 128, a = r() * Math.PI * 2, l = 4 + r() * 5, v = 120 + r() * 135 | 0;
    g.fillStyle = `rgb(${v},${v},${v})`;
    for (const ox of [-128, 0, 128]) for (const oy of [-128, 0, 128]) { g.beginPath(); g.ellipse(x + ox, y + oy, l, l * 0.48, a, 0, Math.PI * 2); g.fill(); }
  }
  crownTex = new THREE.CanvasTexture(c);
  crownTex.wrapS = crownTex.wrapT = THREE.RepeatWrapping;
  crownTex.anisotropy = 4;
  return crownTex;
}

export function leafCardGeo(shells = [[48, 0.95, 0.44]]) {
  const pos = [], nor = [], uv = [], idx = [], v = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(1, 0, 0);
  let k = 0;
  shells.forEach(([n, rad, sz], si) => {
    for (let i = 0; i < n; i++) {
      // rovnoměrně po kouli (Fibonacci), lehce náhodně; vnitřní slupka pootočená, aby lístky nebyly za sebou
      const y = 1 - (i + 0.5) / n * 2, rr = Math.sqrt(1 - y * y), a = i * 2.39996 + Math.sin(i * 7.3) * 0.4 + si * 1.3;
      v.set(Math.cos(a) * rr, y, Math.sin(a) * rr).normalize();
      t1.crossVectors(Math.abs(v.y) > 0.9 ? side : up, v).normalize();
      t2.crossVectors(v, t1).normalize();
      const rot = Math.sin(i * 3.1 + si) * 1.2, c = Math.cos(rot), sn = Math.sin(rot), size = sz + 0.12 * Math.sin(i * 5.7);
      const center = v.clone().multiplyScalar(rad + 0.1 * Math.sin(i * 2.3));
      for (const [px, py, u, w] of [[-1, -1, 0, 0], [1, -1, 1, 0], [-1, 1, 0, 1], [1, 1, 1, 1]]) {
        const x = (px * c - py * sn) * size, yy = (px * sn + py * c) * size;
        const p = center.clone().addScaledVector(t1, x).addScaledVector(t2, yy).addScaledVector(v, 0.12 * (Math.abs(px) + Math.abs(py) - 1));
        pos.push(p.x, p.y * 0.85, p.z);
        const nn = p.clone().normalize();
        nor.push(nn.x, nn.y, nn.z);
        uv.push(u, w);
      }
      idx.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
      k += 4;
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Větve smrku (jen zblízka): karty s jehličím od kmene šikmo dolů k okraji patra, ve dvou řadách nad sebou.
// Patro má tvar kužele: špička v y = 1, okraj (poloměr 1) v y = 0.
export function pineCardGeo(n = 13) {
  const pos = [], nor = [], uv = [], idx = [];
  let k = 0;
  const card = (a, r0, y0, r1, y1, w, tilt) => {
    const dx = Math.cos(a), dz = Math.sin(a), sx = -dz, sz = dx;
    const P = [[r0, y0, -w * 0.45], [r0, y0, w * 0.45], [r1, y1, -w], [r1, y1, w]];
    for (let j = 0; j < 4; j++) {
      const [r, y, s] = P[j];
      pos.push(dx * r + sx * s, y + s * tilt, dz * r + sz * s);
      // normála: šikmo nahoru a ven (světlo jako na plášti kužele)
      const nn = new THREE.Vector3(dx * 0.6, 0.8, dz * 0.6).normalize();
      nor.push(nn.x, nn.y, nn.z);
      uv.push(j % 2, j < 2 ? 0 : 1);
    }
    idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    k += 4;
  };
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.sin(i * 4.1) * 0.15;
    card(a, 0.05, 0.6, 1.32, -0.2 - 0.08 * Math.sin(i * 2.7), 0.42, 0.1 * Math.sin(i * 1.9));
    const b = a + Math.PI / n;
    card(b, 0.05, 0.95, 0.9, 0.3, 0.32, 0.1 * Math.cos(i * 2.3));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
