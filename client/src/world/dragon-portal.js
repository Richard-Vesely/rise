// Jen stavitel modelu; spouští ho existující modul svatyně.
import * as THREE from 'three';

export function buildDragonPortal(s, scene, stoneTex, portalShader, colliders) {
  const group = new THREE.Group();
  group.position.set(s.x, 0, s.z);
  scene.add(group);
  const stone = new THREE.MeshStandardMaterial({ map: stoneTex, color: 0x544039, roughness: 0.75 });
  const add = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; group.add(m); return m;
  };
  if (s.returnHome) {
    add(new THREE.CylinderGeometry(9.6, 9.9, 1, 48), stone, 0, -0.3, 0);
    add(new THREE.CylinderGeometry(4.6, 4.7, 0.25, 40), stone, 0, 0.325, 0);
  } else add(new THREE.CylinderGeometry(3.3, 3.5, 0.2, 32), stone, 0, -0.1, 0);
  s.ring = add(new THREE.TorusGeometry(2.45, 0.32, 12, 48), new THREE.MeshStandardMaterial({
    color: 0x783b24, roughness: 0.5, metalness: 0.35, emissive: 0xff7b25, emissiveIntensity: 1,
  }), 0, 3.05, 0);
  for (const dx of [-2.5, 2.5]) {
    add(new THREE.BoxGeometry(0.9, 1.2, 1.2), stone, dx, 0.6, 0);
    colliders.push({ x: s.x + dx, z: s.z, r: 0.6 });
    const horn = add(new THREE.ConeGeometry(0.32, 1.3, 6), stone, dx * 0.8, 5.5, 0);
    horn.rotation.z = -Math.sign(dx) * 0.3;
  }
  s.surface = add(new THREE.CircleGeometry(2.2, 48), portalShader(0xff5421, 0xffcc66), 0, 3.05, 0);
  s.surface.material.uniforms.uOpen.value = 1;
  s.light = new THREE.PointLight(0xffae66, 35, 25, 1.6);
  s.light.position.set(0, 3, 1); group.add(s.light);
  s.open = 1; s.sockets = [];
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#241b18'; ctx.fillRect(0, 0, 1024, 192);
  ctx.strokeStyle = '#eaaa65'; ctx.lineWidth = 8; ctx.strokeRect(4, 4, 1016, 184);
  ctx.textAlign = 'center'; ctx.fillStyle = '#ffe4ba'; ctx.font = 'bold 62px sans-serif';
  ctx.fillText(s.returnHome ? 'PORTÁL DOMŮ' : 'ZEMĚ DRAKA', 512, 82);
  ctx.font = '32px sans-serif'; ctx.fillText(s.returnHome ? 'Projdi zpět ke svatyni' : 'Projdi • Pozor na draka!', 512, 145);
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas) }));
  sign.position.set(0, 7.1, 0); sign.scale.set(6.8, 1.275, 1); group.add(sign);
}
