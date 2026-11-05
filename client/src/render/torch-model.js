// Model pochodně ve světě: dřevěná tyčka s ohořelou, žhnoucí hlavicí a plamen ve tvaru kapky.
// Stojící pochodeň je svisle, na zdi je spodkem u zdi a nakloněná od ní o 22,5° (jako v Minecraftu).
// Všechny pochodně sdílejí jednu geometrii a jeden materiál: tyčka + hlavice = 1 kreslení, plamen a záře = 2 sprity.
// Jen funkce (volá je render/blocks.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TORCH_LEAN, WALL_DIRS } from '../../../shared/world/torch.js';
import { FX, GLOW } from './look.js';
import { glowTex } from './sky.js';

// Tyčka (u = 0,25 → dřevo) a hlavice (u = 0,75 → ohořelá, svítí). Textura 2 × 1 pixel, bez filtrování.
function partGeo(geo, u) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u, 0.5);
  return geo;
}
const STICK_GEO = mergeGeometries([
  partGeo(new THREE.CylinderGeometry(0.036, 0.03, 0.5, 8).translate(0, 0.25, 0), 0.25),
  partGeo(new THREE.CylinderGeometry(0.052, 0.042, 0.13, 8).translate(0, 0.54, 0), 0.75),
]);
const tex2 = (a, b) => { const t = new THREE.DataTexture(new Uint8Array([...a, 255, ...b, 255]), 2, 1); t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; };
const STICK_MAT = new THREE.MeshStandardMaterial({
  map: tex2([138, 96, 58], [46, 30, 20]), roughness: 0.85,
  emissive: new THREE.Color(1, 0.48, 0.16), emissiveMap: tex2([0, 0, 0], [255, 255, 255]), emissiveIntensity: 1.6,
});

// Plamen: kapka se žlutobílým jádrem a oranžovým okrajem (sčítá se se scénou, takže září a s bloomem rozkvete).
function flameTexture() {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 64;
  const x = c.getContext('2d');
  const blob = (cy, r, sy, stops) => {
    x.save(); x.translate(16, cy); x.scale(1, sy);
    const g = x.createRadialGradient(0, 0, 0, 0, 0, r);
    for (const [o, col] of stops) g.addColorStop(o, col);
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.fill(); x.restore();
  };
  x.globalCompositeOperation = 'lighter';
  blob(40, 15, 1.6, [[0, 'rgba(255,150,50,0.9)'], [0.55, 'rgba(255,110,30,0.45)'], [1, 'rgba(255,80,20,0)']]); // okraj plamene
  blob(46, 7, 1.7, [[0, 'rgba(255,250,215,1)'], [0.6, 'rgba(255,215,120,0.8)'], [1, 'rgba(255,170,60,0)']]); // jádro
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const FLAME_MAT = new THREE.SpriteMaterial({ map: flameTexture(), color: new THREE.Color(1, 1, 1).multiplyScalar(Math.max(1, GLOW * 0.7)), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
// Teplá záře kolem plamene: levné „světlo“ na blízké stěně a v okolí i u pochodní, na které nezbylo skutečné světlo
// (s bloomem střední a vysoké grafiky slabší, ten záři přidá sám).
const HALO_MAT = new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1, 0.6, 0.3).multiplyScalar(FX.post ? 0.22 : 0.32), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });

/** Postaví pochodeň do skupiny g (spodek buňky uprostřed = 0, 0, 0). meta = jak drží (shared/world/torch.js). */
export function buildTorchModel(g, flames, meta) {
  const t = new THREE.Group();
  t.add(new THREE.Mesh(STICK_GEO, STICK_MAT));
  const f = new THREE.Sprite(FLAME_MAT);
  f.center.set(0.5, 0.12); // plamen roste z hlavice nahoru
  f.position.y = 0.55;
  f.userData.base = 0.2;
  f.userData.tall = 1.75; // plamen je vyšší než širší (blocks.js ho tak i mihotá)
  f.scale.set(0.2, 0.35, 1);
  const h = new THREE.Sprite(HALO_MAT);
  h.position.y = 0.66;
  h.userData.base = 1.5;
  h.userData.halo = true; // zblízka zmizí (blocks.js): tam svítí skutečné světlo a velký sprite by se zařízl do zdi
  h.scale.setScalar(1.5);
  t.add(f, h);
  flames.push(f, h);
  const d = WALL_DIRS[meta - 2];
  if (!d) { g.add(t); return; }
  // na zdi: model je postavený pro zeď na −z (spodek u zdi, vršek se kloní od ní), otočí se ke skutečné zdi
  const turn = new THREE.Group();
  turn.rotation.y = Math.atan2(-d[0], -d[2]);
  t.position.set(0, 0.2, -0.45);
  t.rotation.x = TORCH_LEAN;
  turn.add(t);
  g.add(turn);
}
