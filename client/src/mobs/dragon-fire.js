// Pouze kreslení: o zásahu rozhoduje hostitel. Stejné značky vidí i připojený hráč.
import * as THREE from 'three';
import { dragonFirePosition } from '../../../shared/sim/dragon.js';
import { Sound } from '../audio/sound.js';

export function createDragonFire(scene) {
  const root = new THREE.Group(); root.name = 'dragon-fire';
  const mat = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 2.6, 48), mat(0xff5e16, 0.9));
  ring.rotation.x = -Math.PI / 2;
  const fill = new THREE.Mesh(new THREE.CircleGeometry(2.4, 48), mat(0xff6b20, 0.17));
  fill.rotation.x = -Math.PI / 2;
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.48, 2), mat(0xffa52b));
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 1), mat(0xfff1b0)); ball.add(core);
  const blast = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), mat(0xff6e22, 0.55));
  const textCanvas = document.createElement('canvas'); textCanvas.width = 512; textCanvas.height = 96;
  const ctx = textCanvas.getContext('2d');
  ctx.font = 'bold 28px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff2c5';
  ctx.strokeStyle = '#422212'; ctx.lineWidth = 6;
  ctx.strokeText('UHNI Z OHNIVÉHO KRUHU!', 256, 48); ctx.fillText('UHNI Z OHNIVÉHO KRUHU!', 256, 48);
  const texture = new THREE.CanvasTexture(textCanvas);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  label.scale.set(6, 1.1, 1);
  root.add(ring, fill, ball, blast, label); scene.add(root);
  return { root, ring, fill, ball, blast, label, texture };
}

export function updateDragonFire(fx, m) {
  const c = m.dragonCast;
  fx.root.visible = !!c && !m.dead;
  if (!fx.root.visible) return;
  const launched = c.t >= c.charge, burst = !!c.burst;
  const progress = Math.min(1, c.t / (c.charge + c.flight));
  fx.ring.position.set(c.to.x, c.to.y - 0.92, c.to.z);
  fx.fill.position.copy(fx.ring.position); fx.fill.position.y += 0.01;
  fx.fill.material.opacity = 0.12 + progress * 0.25;
  fx.ring.scale.setScalar(1 + Math.sin(c.t * 15) * 0.04);
  fx.label.position.set(c.to.x, c.to.y + 2, c.to.z);
  fx.label.visible = !burst; fx.ring.visible = fx.fill.visible = !burst;
  fx.ball.visible = !burst;
  const pos = dragonFirePosition(c);
  fx.ball.position.set(pos.x, pos.y, pos.z);
  fx.ball.scale.setScalar(launched ? 1 : 0.25 + 0.75 * Math.min(1, c.t / c.charge));
  fx.ball.rotation.y = c.t * 6;
  fx.blast.visible = burst;
  if (burst) {
    if (fx.burstId !== c.id) {
      fx.burstId = c.id;
      Sound.at(c.burst.x, c.burst.y, c.burst.z, () => Sound.burst({ dur: 0.4, f0: 600, f1: 70, q: 0.7, vol: 0.25, type: 'lowpass' }));
    }
    fx.blast.position.set(c.burst.x, c.burst.y, c.burst.z);
    const fade = Math.min(1, Math.max(0, (c.t - c.charge - c.flight) / 0.4));
    fx.blast.scale.setScalar(0.5 + fade * c.radius);
    fx.blast.material.opacity = (1 - fade) * 0.55;
  }
}
export function removeDragonFire(fx) {
  fx.root.removeFromParent();
  fx.root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); o.material?.dispose(); });
  fx.texture.dispose();
}
