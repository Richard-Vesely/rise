// Hůl vlastníka serveru na straně hráče (jen server kroužku; kdo je vlastník, ví jen server: server/owner-wand.js).
// - Kouzla hole: Avada Kedavra (zelený paprsek) a Štvanice (rudý paprsek). Paprsek letí hned, hra najde prvního tvora
//   nebo hráče na jeho cestě a pošle serveru ['ospell', kouzlo, 'm' | 'p', nid | pid]. Jestli platí, rozhoduje server.
// - Hlídání předmětu: hůl nepatří do truhly, stroje, auta ani do mřížky (vrátí se do batohu); vlastník má jen jednu;
//   kdo není vlastník (nebo hraje sám / u hostitele v prohlížeči), tomu hůl zmizí.
// Bez vedlejších účinků při načtení.
import * as THREE from 'three';
import { AVADA, ownerItem } from '../../../shared/data/magic.js';
import { NET } from '../../../shared/net/net.js';
import { others } from '../../../shared/net/room.js';
import { isMark } from '../../../shared/world/terrain.js';
import { toolSound } from '../audio/tool-sounds.js';
import { GLOW } from '../render/look.js';
import { sparks } from '../render/particles.js';
import { camera, scene } from '../render/renderer.js';
import { glowTex } from '../render/sky.js';
import { DON } from '../ui/donation-ui.js';
import { toast } from '../ui/hud.js';
import { container, invOpen, refreshUI, ui } from '../ui/inventory-ui.js';
import { mobOn, solid } from './bow.js';
import { addItem, inv } from './inventory.js';
import { player } from './player.js';

const LOOK = { avada: { color: 0x2bff5a, rgb: [0.2, 1, 0.35] }, hunt: { color: 0xff2a1a, rgb: [1, 0.15, 0.1] } };
const BODY = [[0.55, 0.42], [1.3, 0.42]]; // tělo hráče = dvě koule nad místem, kde stojí (jako player/pvp.js)
const fx = [];

/** Hráč, kterého protne úsečka a→b; ok(pose) = jestli na něj kouzlo může (Avada jen se souboji). */
function playerOn(a, b, ok) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L2 = dx * dx + dy * dy + dz * dz || 1;
  for (const P of others.values()) {
    const q = P.pose;
    if (!q || q.alive === false || !ok(q)) continue;
    for (const [h, r] of BODY) {
      const cy = q.y + h, t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (cy - a.y) * dy + (q.z - a.z) * dz) / L2));
      const ex = a.x + dx * t - q.x, ey = a.y + dy * t - cy, ez = a.z + dz * t - q.z;
      if (ex * ex + ey * ey + ez * ez < r * r) return P;
    }
  }
  return null;
}
const fightsHere = (q) => NET.pvp || (NET.pvpMark && isMark(player.pos.x) && isMark(q.x));

/** Paprsek: zelený (Avada Kedavra) nebo rudý (Štvanice), od hole k cíli; za 0,4 s zhasne. */
function beam(id, from, to) {
  const L = LOOK[id], len = from.distanceTo(to);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(L.color).multiplyScalar(GLOW * 2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, len, 8, 1, true).rotateX(Math.PI / 2), mat);
  const halo = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, len, 10, 1, true).rotateX(Math.PI / 2), mat.clone());
  halo.material.opacity = 0.35;
  const g = new THREE.Group();
  g.add(core, halo);
  g.position.copy(from).lerp(to, 0.5);
  g.lookAt(to);
  const end = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(L.color).multiplyScalar(GLOW * 1.5), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  end.scale.setScalar(1.6);
  end.position.copy(to);
  const light = new THREE.PointLight(L.color, 40, 18);
  light.position.copy(to);
  scene.add(g, end, light);
  sparks.emit(to.x, to.y, to.z, L.rgb, 40, 4, 1.5);
  let t = 0;
  fx.push((dt) => {
    t += dt;
    const k = Math.max(0, 1 - t / 0.4);
    mat.opacity = k; halo.material.opacity = 0.35 * k; light.intensity = 40 * k; end.scale.setScalar(1.6 * k + 0.1);
    if (t < 0.4) return true;
    g.removeFromParent(); end.removeFromParent(); light.removeFromParent();
    mat.dispose(); halo.material.dispose(); end.material.dispose(); core.geometry.dispose(); halo.geometry.dispose();
    return false;
  });
}

/**
 * Sešle kouzlo hole vlastníka ('avada' nebo 'hunt'). Vrací true, když se kouzlo seslalo (paprsek letěl).
 * Cíl ověří server; tady je jen paprsek, zvuk a zpráva serveru.
 */
export function ownerSpell(id) {
  if (!NET.client || !DON.owner) { toast('Kouzla hole vlastníka fungují jen vlastníkovi na serveru kroužku'); return false; }
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const from = new THREE.Vector3(0.22, -0.2, -0.5).applyQuaternion(camera.quaternion).add(camera.position); // konec hole v ruce
  const a = camera.position.clone(), b = new THREE.Vector3(), step = 0.3;
  let hit = null;
  for (let d = 0; d < AVADA.range && !hit; d += step) {
    b.copy(a).addScaledVector(dir, step);
    const m = id === 'avada' ? mobOn(a, b) : null;
    const P = !m && playerOn(a, b, id === 'avada' ? fightsHere : () => true);
    if (m) hit = ['m', m.nid];
    else if (P) hit = ['p', P.pid];
    else if (solid(b.x, b.y, b.z)) break;
    a.copy(b);
  }
  beam(id, from, b);
  toolSound(id === 'avada' ? 'avada' : 'hunt');
  if (hit) NET.req(['ospell', id, ...hit]);
  else if (id === 'hunt') toast('Štvanice: miř na hráče');
  return true;
}
/** Každý snímek: paprsky dohasínají. */
export function updateOwnerFx(dt) { for (let i = fx.length - 1; i >= 0; i--) if (!fx[i](dt)) fx.splice(i, 1); }

// ---------- hlídání hole (každý snímek; jen když je jasné, jestli jsem vlastník)
const OUTSIDE = { chest: 'chest', fire: 'fire', furnace: 'furnace', power: 'power', car: 'car', kitchen: 'kitchen', dar: 'dar' };
let told = false;
export function guardOwnerItems() {
  if (NET.client && !DON.got) return; // server ještě neřekl, kdo je vlastník
  const mine = NET.client && DON.owner;
  let changed = false;
  if (invOpen) for (const c of ['craft', OUTSIDE[ui.mode]]) { // truhla, stroj, auto, mřížka: hůl zpátky do batohu
    if (!c) continue;
    const arr = container(c);
    for (let i = 0; i < arr.length; i++) if (ownerItem(arr[i]?.id)) { arr[i] = null; if (mine) { addItem('owner_wand', 1, true); toast('Hůl vlastníka patří jen do batohu'); } changed = true; }
  }
  let have = 0;
  const check = (s) => { if (!ownerItem(s?.id)) return false; have++; return !mine || have > 1; }; // true = pryč (cizí, nebo druhá)
  for (let i = 0; i < inv.slots.length; i++) if (check(inv.slots[i])) { inv.slots[i] = null; changed = true; }
  if (check(inv.cursor)) { inv.cursor = null; changed = true; }
  if (changed && !mine && !told) { told = true; toast('Hůl vlastníka patří jen vlastníkovi serveru'); }
  if (changed) refreshUI();
}
