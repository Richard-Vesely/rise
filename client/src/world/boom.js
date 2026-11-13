// Efekty Markových úderů z nebe (zpráva ['fx', druh, x, y, z, t], pravidla v shared/sim/strikes.js):
// atomovka = padající raketa, záblesk, ohnivá koule, atomový hřib a tlaková vlna; meteor = hořící koule s ohonem a malý výbuch.
// Kráter (kostky pryč) a zranění posílá svět zvlášť; tady je jen to, co je vidět a slyšet.
// Bez vedlejších účinků při načtení: vlastní smyčka snímků běží, jen dokud je nějaký efekt vidět.
import * as THREE from 'three';
import { Sound } from '../audio/sound.js';
import { camera, scene } from '../render/renderer.js';
import { debris, sparks } from '../render/particles.js';

const live = []; // { t, upd(t, dt) => true dokud žije, done() }
let raf = 0, last = 0, flashEl = null;
const add = (fx) => { live.push(fx); if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  for (let i = live.length - 1; i >= 0; i--) { const f = live[i]; f.t += dt; if (!f.upd(f.t, dt)) { f.done?.(); live.splice(i, 1); } }
  raf = live.length ? requestAnimationFrame(frame) : 0;
}
const glow = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
const smoke = (color) => new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false });
const drop = (o) => { scene.remove(o); o.traverse((c) => { c.geometry?.dispose(); c.material?.dispose(); }); };
const near = (x, y, z) => camera.position.distanceTo(new THREE.Vector3(x, y, z));

/** Bílý záblesk přes obrazovku (síla 0–1). */
function flash(k) {
  if (k <= 0.02) return;
  if (!flashEl) { flashEl = document.createElement('div'); flashEl.style.cssText = 'position:fixed;inset:0;background:#fff8e8;pointer-events:none;z-index:40;opacity:0'; document.body.appendChild(flashEl); }
  const el = flashEl;
  add({ t: 0, upd: (t) => { el.style.opacity = String(Math.max(0, k * (1 - t / 1.6))); return t < 1.6; } });
}

/** Padající těleso (raketa nebo meteor): z výšky do (x, y, z) za fall sekund, pak onHit(). */
function falling(obj, from, to, fall, trail, onHit) {
  scene.add(obj);
  const dir = to.clone().sub(from).normalize();
  obj.lookAt(obj.position.copy(from).add(dir));
  add({ t: 0, upd: (t) => {
    const k = Math.min(1, t / Math.max(0.01, fall));
    obj.position.lerpVectors(from, to, k * k * 0.4 + k * 0.6); // trochu zrychluje
    sparks.emit(obj.position.x, obj.position.y, obj.position.z, trail, 3, 1.2, 0.5);
    debris.emit(obj.position.x, obj.position.y, obj.position.z, [0.25, 0.22, 0.2], 1, 0.6, 0.3);
    return k < 1;
  }, done: () => { drop(obj); onHit(); } });
}

function missile() {
  const g = new THREE.Group(), body = new THREE.MeshLambertMaterial({ color: 0xdfe3e6 });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 5, 12), body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.6, 12), new THREE.MeshLambertMaterial({ color: 0xc42a1c }));
  nose.position.y = 3.3;
  g.add(tube, nose);
  for (let i = 0; i < 4; i++) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 1), new THREE.MeshLambertMaterial({ color: 0x2b2f33 })); fin.position.y = -2; fin.rotation.y = (i * Math.PI) / 2; fin.position.x = Math.sin(fin.rotation.y) * 0.6; fin.position.z = Math.cos(fin.rotation.y) * 0.6; g.add(fin); }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.45, 2.4, 10), glow(0xffa030));
  flame.position.y = -3.6; flame.rotation.x = Math.PI;
  g.add(flame);
  const w = new THREE.Group(); // lookAt míří osou z, raketa je podél osy y
  g.rotation.x = -Math.PI / 2;
  w.add(g);
  return w;
}

function nukeBlast(x, y, z) {
  const d = near(x, y, z);
  flash(Math.max(0, 1 - d / 400));
  Sound.at(x, y, z, function () {
    this.burst({ dur: 0.6, f0: 6000, f1: 300, q: 0.4, vol: 0.9, type: 'lowpass', vary: 0 });
    this.burst({ buf: this.brown, dur: 7, f0: 900, f1: 30, q: 0.5, vol: 1.4, type: 'lowpass', attack: 0.05, vary: 0 });
    this.burst({ buf: this.brown, dur: 9, f0: 250, f1: 25, q: 0.7, vol: 0.9, type: 'lowpass', attack: 0.4, delay: 0.3, vary: 0 });
  }, { ref: 30, max: 2000, keep: 12 });
  const fire = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), glow(0xffd070));
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), glow(0xfff0d0, 0.8));
  ring.rotation.x = -Math.PI / 2;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.4, 1, 16, 1, true), smoke(0x8a5a3a));
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14), smoke(0xb06a34));
  const capGlow = new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 12), glow(0xff7a20, 0.7));
  for (const o of [fire, ring, stem, cap, capGlow]) { o.position.set(x, y, z); scene.add(o); }
  ring.position.y = y + 0.3;
  for (let i = 0; i < 6; i++) { sparks.emit(x, y + 1, z, [1, 0.6, 0.2], 40, 18, 10); debris.emit(x, y + 1, z, [0.35, 0.28, 0.2], 30, 14, 12); }
  add({ t: 0, upd: (t) => {
    const s = Math.min(1, t / 0.9);
    fire.scale.setScalar(3 + 28 * Math.sqrt(s)); // kráter má poloměr asi 15 m
    fire.material.opacity = t < 1 ? 1 : Math.max(0, 1 - (t - 1) / 2);
    fire.material.color.setHSL(0.1 - Math.min(0.08, t * 0.03), 1, Math.max(0.5, 0.85 - t * 0.15));
    const r = 1 + t * 85; ring.scale.set(r, r, 1); ring.material.opacity = Math.max(0, 0.8 - t / 1.6);
    const h = Math.min(56, 8 + t * 14); // hřib roste
    stem.scale.set(1.6 + t * 0.2, h, 1.6 + t * 0.2); stem.position.y = y + h / 2;
    const c = Math.min(26, 6 + t * 6); cap.scale.set(c, c * 0.55, c); cap.position.y = y + h + c * 0.2;
    capGlow.scale.set(c * 0.9, c * 0.45, c * 0.9); capGlow.position.copy(cap.position); capGlow.material.opacity = Math.max(0, 0.7 - t * 0.09);
    const fade = t < 7 ? 0.95 : Math.max(0, 0.95 * (1 - (t - 7) / 5));
    stem.material.opacity = cap.material.opacity = fade;
    cap.material.color.setHSL(0.07, 0.5 * Math.max(0, 1 - t / 6), 0.45 - Math.min(0.15, t * 0.02));
    if (t < 3 && Math.random() < 0.5) sparks.emit(x, y + h, z, [1, 0.5, 0.15], 8, 6, 3);
    return t < 12;
  }, done: () => [fire, ring, stem, cap, capGlow].forEach(drop) });
}

function meteorBlast(x, y, z) {
  Sound.at(x, y, z, function () {
    this.burst({ dur: 0.3, f0: 4000, f1: 300, q: 0.5, vol: 0.6, type: 'lowpass' });
    this.burst({ buf: this.brown, dur: 2.2, f0: 600, f1: 40, q: 0.6, vol: 0.9, type: 'lowpass', attack: 0.02, vary: 0 });
  }, { ref: 8, max: 300, keep: 4 });
  const fire = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), glow(0xffa040));
  fire.position.set(x, y, z);
  scene.add(fire);
  sparks.emit(x, y + 0.5, z, [1, 0.55, 0.15], 40, 9, 6);
  debris.emit(x, y + 0.5, z, [0.3, 0.25, 0.2], 24, 7, 7);
  flash(Math.max(0, 0.35 - near(x, y, z) / 120));
  add({ t: 0, upd: (t) => { fire.scale.setScalar(1 + t * 9); fire.material.opacity = Math.max(0, 1 - t / 0.7); return t < 0.7; }, done: () => drop(fire) });
}

/** Efekt úderu: druh 'nuke' | 'meteor', místo dopadu, t = za kolik sekund dopadne. */
export function boomFx(kind, x, y, z, t = 0) {
  x = +x; y = +y; z = +z; t = Math.max(0, +t || 0);
  if (![x, y, z].every(Number.isFinite)) return;
  const to = new THREE.Vector3(x, y, z);
  if (kind === 'nuke') {
    Sound.at(x, y + 60, z, function () { this.tone(900, Math.max(0.5, t), 0.25, 'sawtooth', 0, 300); }, { ref: 20, max: 600, keep: 4 }); // hvízdání
    falling(missile(), new THREE.Vector3(x + 8, y + 140, z + 6), to, t, [1, 0.7, 0.3], () => nukeBlast(x, y, z));
  } else if (kind === 'meteor') {
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 1), new THREE.MeshBasicMaterial({ color: 0xff6a1a }));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 10), glow(0xffb040, 0.6));
    const g = new THREE.Group(); g.add(rock, halo);
    const a = Math.random() * Math.PI * 2;
    falling(g, new THREE.Vector3(x + Math.cos(a) * 40, y + 90, z + Math.sin(a) * 40), to, t, [1, 0.45, 0.1], () => meteorBlast(x, y, z));
  }
}
