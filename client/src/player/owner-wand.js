// Hůl vlastníka serveru na straně hráče (jen server kroužku; kdo je vlastník, ví jen server: server/owner-wand.js).
// - Kouzla hole: Avada Kedavra (zelený paprsek) a Štvanice (rudý paprsek). Paprsek letí hned, hra najde prvního tvora
//   nebo hráče na jeho cestě a pošle serveru ['ospell', kouzlo, 'm' | 'p', nid | pid]. Jestli platí, rozhoduje server.
// - Lektvar nekonečných XP: pravé tlačítko = vypít; dá přesně tolik XP, kolik chybí do další úrovně (nabídka kouzla),
//   a nikdy se nevypije. Jen vlastníkovi na serveru kroužku (XP jsou stav hráče, hra jim věří jako zbytku batohu).
// - Hlídání předmětů vlastníka (hůl, lektvar): nepatří do truhly, stroje, auta ani do mřížky (vrátí se do batohu);
//   vlastník má od každého jen jeden; kdo není vlastník (nebo hraje sám / u hostitele v prohlížeči), tomu zmizí.
// Bez vedlejších účinků při načtení.
import * as THREE from 'three';
import { ITEMS } from '../../../shared/data/index.js';
import { AVADA, ownerItem, xpToLevelUp } from '../../../shared/data/magic.js';
import { NET } from '../../../shared/net/net.js';
import { others } from '../../../shared/net/room.js';
import { isMark } from '../../../shared/world/terrain.js';
import { Sound } from '../audio/sound.js';
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
import { addXp, magic } from './xp.js';

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

// ---------- lektvar nekonečných XP (pravé tlačítko s ním v ruce, player/gadgets.js hlídá odpočet)
/** Vypije lektvar: přesně tolik XP, kolik chybí do další úrovně. Lektvar zůstává. Vrací počet XP (0 = nefungoval). */
export function drinkXpPotion() {
  if (!NET.client || !DON.owner) { toast('Lektvar nekonečných XP funguje jen vlastníkovi na serveru kroužku'); return 0; }
  if (!player.alive) return 0;
  const n = xpToLevelUp(magic.xp);
  addXp(n); // nová úroveň: +XP nad lištou, zpráva a nabídka kouzla (xp.js)
  sparks.emit(player.pos.x, player.pos.y + 1.2, player.pos.z, [0.4, 1, 0.45], 26, 2, 2);
  sparks.emit(player.pos.x, player.pos.y + 1.2, player.pos.z, [1, 0.85, 0.3], 16, 2.5, 2);
  Sound.bite?.('drink');
  Sound.eat?.();
  return n;
}

// ---------- hlídání předmětů vlastníka (každý snímek; jen když je jasné, jestli jsem vlastník)
const OUTSIDE = { chest: 'chest', fire: 'fire', furnace: 'furnace', power: 'power', car: 'car', kitchen: 'kitchen', dar: 'dar' };
let told = false;
export function guardOwnerItems() {
  if (NET.client && !DON.got) return; // server ještě neřekl, kdo je vlastník
  const mine = NET.client && DON.owner;
  let changed = false, lost = null;
  if (invOpen) for (const c of ['craft', OUTSIDE[ui.mode]]) { // truhla, stroj, auto, mřížka: zpátky do batohu
    if (!c) continue;
    const arr = container(c);
    for (let i = 0; i < arr.length; i++) {
      const id = arr[i]?.id;
      if (!ownerItem(id)) continue;
      arr[i] = null; changed = true; lost = id;
      if (mine) { addItem(id, 1, true); toast(`${ITEMS[id].name} patří jen do batohu`); }
    }
  }
  const have = new Set();
  const check = (s) => { // true = pryč (cizí, nebo druhý kus téhož)
    if (!ownerItem(s?.id)) return false;
    if (!mine || have.has(s.id)) { lost = s.id; return true; }
    have.add(s.id);
    return false;
  };
  for (let i = 0; i < inv.slots.length; i++) if (check(inv.slots[i])) { inv.slots[i] = null; changed = true; }
  if (check(inv.cursor)) { inv.cursor = null; changed = true; }
  if (changed && !mine && !told) { told = true; toast(`${ITEMS[lost].name} patří jen vlastníkovi serveru`); }
  if (changed) refreshUI();
}
