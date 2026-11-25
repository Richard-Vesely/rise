// Arcidábel v prohlížeči (pravidla: shared/sim/archdevil.js): ukazatel zdraví, příchod v ohnivém sloupu, ohnivá aura,
// mávání křídel, varovné kruhy před super útoky a jejich efekty (ohnivá vlna, skok s rázovou vlnou, portály ďáblů),
// výbuch při smrti. Kreslí se u všech hráčů ze stavu útoku (m.bossAtk; u připojeného hráče přichází v 'mobs').
// Zranění dělá jen ten, kdo drží svět. Bez vedlejších účinků při načtení (volá se každý snímek z player/interaction.js).
import * as THREE from 'three';
import { NET } from '../../../shared/net/net.js';
import { mobs } from '../../../shared/sim/mobs.js';
import { Sound } from '../audio/sound.js';
import { player } from '../player/player.js';
import { debris, sparks } from '../render/particles.js';
import { scene } from '../render/renderer.js';
import { toast } from '../ui/hud.js';
import { viewOf } from './mobs.js';

const seen = new Map(); // nid -> { atkId, burst, dead }
const fx = []; // běžící efekty { t, upd(t, dt) → false = konec, done() }
let bar = null, ring = null;
const glowM = (c, o = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
const drop = (o) => { scene.remove(o); o.traverse((c) => { c.geometry?.dispose(); c.material?.dispose(); }); };
const near = (p, r) => Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < r;
function roar(p, big = 1) {
  Sound.at(p.x, p.y + 3, p.z, function () {
    this.burst({ buf: this.brown, dur: 1.6 * big, f0: 500, f1: 70, q: 0.8, vol: 0.9, type: 'lowpass', attack: 0.08, vary: 0 });
    this.tone(70, 1.2 * big, 0.35, 'sawtooth', 0, 45, { filter: ['lowpass', 400, 1] });
  }, { ref: 10, max: 160, keep: 4 });
}
function boom(p, vol = 1) {
  Sound.at(p.x, p.y + 1, p.z, function () {
    this.burst({ dur: 0.4, f0: 4000, f1: 300, q: 0.5, vol: 0.7 * vol, type: 'lowpass' });
    this.burst({ buf: this.brown, dur: 2.2, f0: 600, f1: 40, q: 0.6, vol: 1.1 * vol, type: 'lowpass', attack: 0.02, vary: 0 });
  }, { ref: 10, max: 200, keep: 4 });
}
const add = (o) => fx.push({ t: 0, ...o });

// ---------- efekty
function firePillar(p) { // příchod: ohnivý sloup, záblesk a řev
  const col = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3, 30, 24, 1, true), glowM(0xff6a1a, 0.8));
  col.position.set(p.x, p.y + 15, p.z);
  scene.add(col);
  roar(p, 1.5); boom(p, 1.2);
  if (near(p, 40)) player.shake = Math.max(player.shake || 0, 0.8);
  add({ upd: (t) => { col.scale.set(1 + t, 1, 1 + t); col.material.opacity = Math.max(0, 0.8 - t / 2); for (let i = 0; i < 3; i++) sparks.emit(p.x + (Math.random() - 0.5) * 4, p.y + Math.random() * 20, p.z + (Math.random() - 0.5) * 4, [1, 0.5, 0.1], 3, 3, 4); return t < 2; }, done: () => drop(col) });
}
function warnRing(a) { // rudý kruh na zemi, který se plní, než útok udeří
  const g = new THREE.Group(), edge = new THREE.Mesh(new THREE.RingGeometry(a.r - 0.25, a.r, 48), glowM(0xff2a10, 0.9));
  const fill = new THREE.Mesh(new THREE.CircleGeometry(a.r, 48), glowM(a.kind === 'summon' ? 0x9a2aff : 0xff3a10, 0.25));
  edge.rotation.x = fill.rotation.x = -Math.PI / 2;
  g.add(edge, fill);
  g.position.set(a.at.x, a.at.y + 0.08, a.at.z);
  scene.add(g);
  add({ upd: (t) => { const k = Math.min(1, t / a.charge); fill.scale.setScalar(Math.max(0.01, k)); edge.material.opacity = 0.5 + 0.5 * Math.abs(Math.sin(t * 12)); return t < a.charge; }, done: () => drop(g) });
}
function nova(a) { // ohnivá vlna: rozpínající se prstenec ohně
  const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.35, 8, 48), glowM(0xff7a20));
  r.rotation.x = Math.PI / 2; r.position.set(a.at.x, a.at.y + 0.6, a.at.z);
  scene.add(r);
  boom(a.at);
  if (near(a.at, a.r + 6)) player.shake = Math.max(player.shake || 0, 0.5);
  add({ upd: (t) => {
    const k = t / 0.6, R = 1 + a.r * Math.min(1, k);
    r.scale.set(R, R, 1 + k * 2); r.material.opacity = Math.max(0, 1 - k);
    for (let i = 0; i < 6; i++) { const ang = Math.random() * Math.PI * 2; sparks.emit(a.at.x + Math.cos(ang) * R, a.at.y + 0.5, a.at.z + Math.sin(ang) * R, [1, 0.45, 0.1], 2, 2, 3); }
    return t < 0.6;
  }, done: () => drop(r) });
}
function slam(a) { // dopad po skoku: rázová vlna, kamení a otřes
  const w = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.2, 48), glowM(0xffd0a0, 0.9));
  w.rotation.x = -Math.PI / 2; w.position.set(a.at.x, a.at.y + 0.1, a.at.z);
  scene.add(w);
  boom(a.at, 1.3);
  for (let i = 0; i < 4; i++) { debris.emit(a.at.x, a.at.y + 0.5, a.at.z, [0.35, 0.28, 0.22], 30, 8, 7); sparks.emit(a.at.x, a.at.y + 0.5, a.at.z, [1, 0.6, 0.2], 25, 7, 5); }
  if (near(a.at, 25)) player.shake = Math.max(player.shake || 0, 1);
  add({ upd: (t) => { const R = 1 + t * 22; w.scale.set(R, R, 1); w.material.opacity = Math.max(0, 0.9 - t * 1.6); return t < 0.6; }, done: () => drop(w) });
}
function summon(a, m) { // vyvolání: tři fialové portály a sloupy dýmu kolem bosse
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2, x = m.pos.x + Math.cos(ang) * 3, z = m.pos.z + Math.sin(ang) * 3;
    const p = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.12, 8, 32), glowM(0xb04aff));
    p.position.set(x, a.at.y + 1.2, z); p.rotation.y = ang;
    scene.add(p);
    add({ upd: (t) => { p.rotation.z += 0.2; p.scale.setScalar(Math.min(1, t * 3) * (t > 1.2 ? Math.max(0, 1 - (t - 1.2) * 2) : 1)); sparks.emit(x, a.at.y + 1.2, z, [0.7, 0.3, 1], 2, 1.5, 1); debris.emit(x, a.at.y + 0.3, z, [0.15, 0.1, 0.18], 2, 0.6, 2.5); return t < 1.7; }, done: () => drop(p) });
  }
  roar(m.pos);
}
function death(m) { // smrt: velký výbuch ohně
  const p = m.pos, ball = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), glowM(0xffa040));
  ball.position.set(p.x, p.y + 3, p.z);
  scene.add(ball);
  roar(p, 2); boom(p, 1.6);
  if (near(p, 40)) player.shake = Math.max(player.shake || 0, 1.2);
  add({ upd: (t) => { ball.scale.setScalar(1 + t * 14); ball.material.opacity = Math.max(0, 1 - t / 1.4); for (let i = 0; i < 4; i++) sparks.emit(p.x, p.y + 3, p.z, [1, 0.5 + Math.random() * 0.3, 0.1], 10, 12, 6); return t < 1.4; }, done: () => drop(ball) });
  toast('🔥 Arcidábel padl! Seber legendární ohnivou zbroj a Zlobří roh.');
}

// ---------- každý snímek
function updateBar(m) {
  if (!bar && !m) return;
  if (!bar) { bar = document.createElement('div'); bar.id = 'bossHealth'; bar.innerHTML = '<b></b><progress></progress><small></small>'; document.body.append(bar); }
  bar.hidden = !m;
  if (!m) return;
  bar.querySelector('b').textContent = `🔥 Arcidábel · ${Math.ceil(Math.max(0, m.hp))} / ${m.def.hp}`;
  bar.querySelector('progress').max = m.def.hp;
  bar.querySelector('progress').value = Math.max(0, m.hp);
  const a = m.bossAtk;
  bar.querySelector('small').textContent = a && !a.burst ? (a.kind === 'nova' ? 'Ohnivá vlna — utíkej z kruhu!' : a.kind === 'slam' ? 'Skáče na tebe — uhni z kruhu!' : 'Vyvolává ďábly!')
    : m.hp <= m.def.hp / 2 ? 'Zuří! Útočí rychleji a silněji. Platí na něj jen meč.' : 'Platí na něj jen meč.';
}
export function updateBossFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t += dt; if (!f.upd(f.t, dt)) { f.done?.(); fx.splice(i, 1); } }
  let shown = null;
  for (const m of mobs) {
    if (m.type !== 'archdevil') continue;
    let S = seen.get(m.nid);
    if (!S) { seen.set(m.nid, (S = { atkId: 0, burst: false, dead: m.dead })); if (!m.dead) { firePillar(m.pos); toast('🔥 Arcidábel se probudil v pekle! Zranit ho jde jen mečem.'); } }
    if (m.dead) { if (!S.dead) { S.dead = true; death(m); } continue; }
    if (Math.hypot(m.pos.x - player.pos.x, m.pos.z - player.pos.z) < 70) shown = m;
    // ohnivá aura a mávání křídly
    if (Math.random() < 0.7) sparks.emit(m.pos.x + (Math.random() - 0.5) * 2.5, m.pos.y + Math.random() * 4.5, m.pos.z + (Math.random() - 0.5) * 2.5, [1, 0.4 + Math.random() * 0.3, 0.1], 1, 0.8, 1.5);
    const V = viewOf(m), wings = V?.group?.userData.bossWings;
    if (wings) { const f = Math.sin(performance.now() / 180) * 0.35; wings[0].rotation.y = 0.5 + f; wings[1].rotation.y = -0.5 - f; }
    // super útok: varování, pak efekt
    const a = m.bossAtk;
    if (a && NET.client) a.t += dt; // u připojeného hráče běží čas útoku tady (hostitel posílá jen začátek)
    if (a && a.id !== S.atkId) { S.atkId = a.id; S.burst = false; if (a.kind !== 'summon') warnRing(a); roar(m.pos, 0.7); }
    if (a && !S.burst && a.t >= a.charge) { S.burst = true; if (a.kind === 'nova') nova(a); else if (a.kind === 'slam') slam(a); else summon(a, m); }
  }
  updateBar(shown);
}
