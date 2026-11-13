// Čarovná hůl: pravé tlačítko sešle vybrané kouzlo (seznam a čísla: shared/data/magic.js; XP, mana a výběr: xp.js).
// Střely (magická, ohnivá, ledová) letí rovně, zraní tvora stejně jako meč (hitMob) a ve hře se souboji i hráče.
// Ostatní: blesk, léčení, regenerace, štít, skok, přenesení, let, světlo, těžba na dálku, duchovní vlk.
// Hůl vlastníka serveru navíc: Avada Kedavra a Štvanice (owner-wand.js; platí jen to, co ověří server).
// Efekty vidí jen ten, kdo kouzlí. Bez vedlejších účinků při načtení.
import * as THREE from 'three';
import { SPELLS } from '../../../shared/data/magic.js';
import { mobs } from '../../../shared/sim/mobs.js';
import { groundHeight } from '../../../shared/world/voxels.js';
import { toolSound } from '../audio/tool-sounds.js';
import { hitMob } from '../mobs/mobs.js';
import { buildMobModel } from '../mobs/mob-models.js';
import { GLOW } from '../render/look.js';
import { debris, sparks } from '../render/particles.js';
import { camera, scene } from '../render/renderer.js';
import { glowTex } from '../render/sky.js';
import { toast } from '../ui/hud.js';
import { mobOn, solid } from './bow.js';
import { guardOwnerItems, ownerSpell, updateOwnerFx } from './owner-wand.js';
import { input, player } from './player.js';
import { hitPlayer, playerOn } from './pvp.js';
import { pickTarget, raycastBlocks } from './targeting.js';
import { activeSpell, holdingWand, magic } from './xp.js';

const HOSTILE = new Set(['crawler', 'markoman', 'golem', 'wolf', 'boar', 'dragon']);
const COLORS = { bolt: 0x9a7cff, fireball: 0xff7a2a, frost: 0x8ae8ff, light: 0xfff0b0 };
const fx = []; // letící střely, světla, vlk: { update(dt) → false = konec }
let prevRmb = false;

const aim = () => { const d = new THREE.Vector3(); camera.getWorldDirection(d); return d; };
function glowSprite(color, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(color).multiplyScalar(GLOW * 1.2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.scale.setScalar(size);
  return s;
}
const rgb = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const yawOf = (v) => Math.atan2(-v.x, -v.z);
/** Zásah tvora i hráče (ve hře se souboji) jednou střelou. */
function strike(m, dmg, v) { if (m.pid) hitPlayer(m, dmg, yawOf(v), 0.8, true); else hitMob(m, dmg, yawOf(v), 0.8, { charge: 1 }); }
/** Tvorové (a hráči se souboji) v kouli kolem bodu. */
function around(p, r) { return mobs.filter((m) => !m.dead && Math.hypot(m.pos.x - p.x, m.pos.y + m.def.cy - p.y, m.pos.z - p.z) < r + m.def.radius); }

// ---------- střely
function bolt(id) {
  const v = aim(), pos = camera.position.clone().addScaledVector(v, 0.6);
  pos.y -= 0.1;
  const s = glowSprite(COLORS[id], id === 'fireball' ? 0.9 : 0.6), speed = id === 'fireball' ? 26 : 38;
  v.multiplyScalar(speed);
  scene.add(s);
  let t = 0;
  fx.push({ update(dt) {
    t += dt;
    const steps = Math.ceil((v.length() * dt) / 0.3);
    for (let n = 0; n < steps; n++) {
      const from = pos.clone();
      pos.addScaledVector(v, dt / steps);
      const m = mobOn(from, pos) || playerOn(from, pos);
      if (m || solid(pos.x, pos.y, pos.z) || t > 3) { s.removeFromParent(); impact(id, pos, m, v); return false; }
    }
    s.position.copy(pos);
    if (Math.random() < 0.6) sparks.emit(pos.x, pos.y, pos.z, rgb(COLORS[id]), 1, 0.5, 0.1);
    return true;
  } });
}
/**
 * Obecná střela (vychytávky z obchodu, player/gadgets.js): letí rovně, zraní prvního tvora / hráče se souboji.
 * @param {{ color: number, size: number, speed: number, ttl: number, dmg: number, trail?: number, spread?: number }} o
 */
export function shot(o) {
  const v = aim();
  if (o.spread) { v.x += (Math.random() - 0.5) * o.spread; v.y += (Math.random() - 0.5) * o.spread; v.z += (Math.random() - 0.5) * o.spread; v.normalize(); }
  const pos = camera.position.clone().addScaledVector(v, 0.7);
  pos.y -= 0.15;
  const s = glowSprite(o.color, o.size), col = rgb(o.color);
  v.multiplyScalar(o.speed);
  scene.add(s);
  let t = 0;
  fx.push({ update(dt) {
    t += dt;
    const steps = Math.ceil((v.length() * dt) / 0.3);
    for (let n = 0; n < steps; n++) {
      const from = pos.clone();
      pos.addScaledVector(v, dt / steps);
      const m = mobOn(from, pos) || playerOn(from, pos);
      if (m || solid(pos.x, pos.y, pos.z) || t > o.ttl) {
        s.removeFromParent();
        if (m) { strike(m, o.dmg, v); sparks.emit(pos.x, pos.y, pos.z, col, 10, 2.5, 1); }
        return false;
      }
    }
    s.position.copy(pos);
    s.scale.setScalar(o.size * (o.grow ? 1 + t * o.grow : 1));
    if (Math.random() < (o.trail ?? 0.6)) sparks.emit(pos.x, pos.y, pos.z, col, 1, 0.5, 0.1);
    return true;
  } });
}
function impact(id, pos, m, v) {
  sparks.emit(pos.x, pos.y, pos.z, rgb(COLORS[id]), id === 'fireball' ? 40 : 16, id === 'fireball' ? 5 : 3, 1.5);
  if (id === 'bolt') { if (m) strike(m, 6, v); toolSound('arrowHit'); return; }
  if (id === 'frost') { if (m) { strike(m, 8, v); if (!m.pid) m.slowT = 4; } toolSound('arrowHit'); return; }
  // ohnivá koule: výbuch 3 m a hoření (3× po 2)
  toolSound('hit', 1);
  debris.emit(pos.x, pos.y, pos.z, [0.35, 0.3, 0.28], 20, 2, 1.2);
  const hitList = [...around(pos, 3), ...(m && m.pid ? [m] : [])];
  for (const x of hitList) strike(x, 10, v);
  for (let k = 1; k <= 3; k++) setTimeout(() => { for (const x of hitList) if (!x.pid && !x.dead) { hitMob(x, 2, 0, 0); sparks.emit(x.pos.x, x.pos.y + x.def.cy, x.pos.z, [1, 0.5, 0.1], 6, 1.5, 1); } }, k * 1000);
}

// ---------- blesk: udeří z nebe tam, kam míříš (až 40 m)
function lightning() {
  const t = pickTarget(40);
  const p = t?.mob ? t.mob.pos.clone().setY(t.mob.pos.y + 0.5) : t?.point ? new THREE.Vector3(...t.point) : camera.position.clone().addScaledVector(aim(), 25);
  const geo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 9 }, (_, i) => new THREE.Vector3(p.x + (i && i < 8 ? (Math.random() - 0.5) * 1.6 : 0), p.y + 40 - i * 5, p.z + (i && i < 8 ? (Math.random() - 0.5) * 1.6 : 0))));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(0xd8f0ff).multiplyScalar(GLOW * 3) }));
  scene.add(line);
  const flash = new THREE.PointLight(0xcfe8ff, 60, 40);
  flash.position.set(p.x, p.y + 4, p.z);
  scene.add(flash);
  sparks.emit(p.x, p.y + 0.2, p.z, [0.8, 0.9, 1], 50, 6, 3);
  toolSound('crit');
  for (const m of around(p, 3)) strike(m, 18, new THREE.Vector3(m.pos.x - p.x, 0, m.pos.z - p.z));
  let t2 = 0;
  fx.push({ update(dt) { t2 += dt; flash.intensity = 60 * Math.max(0, 1 - t2 / 0.4); line.visible = t2 < 0.25 && Math.random() > 0.2; if (t2 > 0.4) { line.removeFromParent(); flash.removeFromParent(); return false; } return true; } });
}

// ---------- pohyb
function blink() {
  const d = aim(), o = camera.position.clone(), hit = raycastBlocks(o, d, 20);
  const dist = hit ? Math.max(0, hit.t - 0.8) : 20;
  const to = o.addScaledVector(d, dist);
  const floor = groundHeight(to.x, to.z);
  sparks.emit(player.pos.x, player.pos.y + 1, player.pos.z, [0.7, 0.5, 1], 20, 3, 1.5);
  player.pos.set(to.x, Math.max(to.y - 1.6, floor), to.z);
  player.vel.set(0, 0, 0);
  sparks.emit(player.pos.x, player.pos.y + 1, player.pos.z, [0.7, 0.5, 1], 20, 3, 1.5);
  toolSound('whoosh', 1);
}
// ---------- světlo: koule visí 60 s (nejvýš 4 najednou)
const lights = [];
function light() {
  const t = pickTarget(12), p = t?.point ? new THREE.Vector3(...t.point).addScaledVector(aim(), -0.6) : camera.position.clone().addScaledVector(aim(), 6);
  p.y += 0.6;
  const g = new THREE.Group(), l = new THREE.PointLight(0xffe6a0, 6 * GLOW, 14, 1.5);
  g.add(glowSprite(COLORS.light, 0.7), l);
  g.position.copy(p);
  scene.add(g);
  if (lights.length >= 4) lights.shift().done = true;
  const L = { done: false };
  lights.push(L);
  let t2 = 0;
  fx.push({ update(dt) { t2 += dt; g.position.y = p.y + Math.sin(t2 * 2) * 0.08; if (L.done || t2 > 60) { g.removeFromParent(); return false; } return true; } });
}
// ---------- těžba na dálku (jako železným krumpáčem)
function farmine(breakTarget) {
  const t = pickTarget(16);
  if (!t || t.kind === 'mob' || t.kind === 'player' || t.kind === 'vehicle' || t.breakable === false) { toast('Tady není co vytěžit'); return false; }
  if (t.req && t.req.tier > 2) { toast('Na tohle je kouzlo slabé (potřebuje lepší krumpáč)'); return false; }
  const at = t.at || t.point;
  if (at) sparks.emit(at[0], at[1], at[2], [0.6, 0.9, 1], 20, 3, 1);
  breakTarget(t);
  return true;
}
// ---------- duchovní vlk: 20 s běhá kolem hráče a útočí na nepřátele do 15 m
function wolf() {
  const w = buildMobModel('wolf'), g = w.group;
  g.traverse((o) => { if (o.isMesh) { o.material = new THREE.MeshBasicMaterial({ color: 0x7ae8ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }); o.castShadow = false; } });
  w.shadow?.removeFromParent?.();
  g.position.copy(player.pos).add(new THREE.Vector3(1.5, 0, 1.5));
  scene.add(g);
  let t = 0, cd = 0, prey = null;
  fx.push({ update(dt) {
    t += dt; cd -= dt;
    if (!prey || prey.dead || prey.pos.distanceTo(player.pos) > 18) prey = mobs.filter((m) => !m.dead && HOSTILE.has(m.type) && m.pos.distanceTo(player.pos) < 15).sort((a, b) => a.pos.distanceTo(g.position) - b.pos.distanceTo(g.position))[0] || null;
    const goal = prey ? prey.pos : player.pos.clone().add(new THREE.Vector3(Math.sin(t) * 2, 0, Math.cos(t) * 2));
    const d = new THREE.Vector3(goal.x - g.position.x, 0, goal.z - g.position.z), len = d.length();
    if (len > 0.8) { g.position.addScaledVector(d.normalize(), Math.min(len, (prey ? 9 : 6) * dt)); g.rotation.y = Math.atan2(-d.x, -d.z); }
    g.position.y = groundHeight(g.position.x, g.position.z) + Math.abs(Math.sin(t * 9)) * 0.08;
    if (prey && len < 1.6 && cd <= 0) { cd = 0.9; hitMob(prey, 5, g.rotation.y, 1, { charge: 1 }); sparks.emit(prey.pos.x, prey.pos.y + prey.def.cy, prey.pos.z, [0.5, 0.9, 1], 12, 2, 1); }
    if (t > 20) { sparks.emit(g.position.x, g.position.y + 0.5, g.position.z, [0.5, 0.9, 1], 30, 2, 1.5); g.removeFromParent(); return false; }
    return true;
  } });
}

/** Sešle vybrané kouzlo. */
export function cast(id, breakTarget) {
  const S = SPELLS[id];
  if (!S) return;
  if ((magic.cd[id] || 0) > 0) return;
  if (magic.mana < S.mana) { toast('Málo many ✦'); toolSound('weak'); magic.cd[id] = 0.4; return; }
  const ok = (() => {
    switch (id) {
      case 'bolt': case 'fireball': case 'frost': bolt(id); return true;
      case 'lightning': lightning(); return true;
      case 'heal': player.hp = Math.min(100, player.hp + 35); sparks.emit(player.pos.x, player.pos.y + 1, player.pos.z, [0.4, 1, 0.5], 24, 2, 2); return true;
      case 'regen': magic.regenT = 10; sparks.emit(player.pos.x, player.pos.y + 1, player.pos.z, [0.4, 1, 0.5], 16, 2, 2); return true;
      case 'ward': magic.wardT = 10; sparks.emit(player.pos.x, player.pos.y + 1, player.pos.z, [0.5, 0.8, 1], 30, 2.5, 1); return true;
      case 'leap': { const d = aim(); player.vel.y = 13; player.vel.x += d.x * 6; player.vel.z += d.z * 6; player.onGround = false; return true; }
      case 'blink': blink(); return true;
      case 'levitate': player.flyT = Math.max(player.flyT || 0, 6); toast('✦ 6 s můžeš létat (Mezerník nahoru)'); return true;
      case 'light': light(); return true;
      case 'farmine': return farmine(breakTarget);
      case 'wolf': wolf(); return true;
      case 'avada': case 'hunt': return ownerSpell(id); // hůl vlastníka
    }
    return false;
  })();
  if (!ok) return;
  magic.mana -= S.mana;
  magic.cd[id] = S.cd;
  if (!['bolt', 'fireball', 'frost', 'lightning', 'avada', 'hunt'].includes(id)) toolSound('charged');
}

/**
 * Hůl v ruce: pravé tlačítko (stisk) sešle kouzlo. Vrací true, když pravé tlačítko patří holi.
 * Truhly, stroje a auta se pravým tlačítkem otevírají dál.
 */
export function updateWand(target, breakTarget, special) {
  const fresh = input.rmb && !prevRmb;
  prevRmb = input.rmb;
  if (!holdingWand()) return false;
  if (special) return false;
  if (fresh) { const id = activeSpell(); if (id) cast(id, breakTarget); else toast('Hůl zatím neumí žádné kouzlo – sbírej XP (tvorové, rudy, výroba)'); }
  return true;
}
/** Každý snímek: letící střely a efekty. */
export function updateMagic(dt) {
  for (let i = fx.length - 1; i >= 0; i--) if (!fx[i].update(dt)) fx.splice(i, 1);
  updateOwnerFx(dt);
  guardOwnerItems(); // hůl vlastníka: jen vlastníkovi, jen v batohu
}
