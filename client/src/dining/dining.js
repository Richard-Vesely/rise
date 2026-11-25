// Jedení příborem: krájení, namotávání, lžíce, hůlky.
import './food-models.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as THREE from 'three';
import { ITEMS } from '../../../shared/data/index.js';
import { lerp } from '../../../shared/util.js';
import { tableItems } from '../../../shared/world/state.js';
import { Sound } from '../audio/sound.js';
import { nearTableBonus, refreshSpecial } from '../player/eating.js';
import { addItem, consumeSelected, countItem } from '../player/inventory.js';
import { input, keys, player } from '../player/player.js';
import { holder } from '../render/held-item.js';
import { $ } from '../ui/dom.js';
import { toast } from '../ui/hud.js';
import { DINE_BITES, DINE_STYLE, DT, PLATE_TO_VIEW, bite, dineView, foodG, part } from './dine-view.js';
import { buildPlateFood, dishCenter, dishMorsel } from './food-models.js';

// Základní polohy příborů (v prostoru kamery)
const REST = {
  fork: { p: [-0.15, -0.22, -0.46], r: [-0.9, 0.35, 0.2] },
  knife: { p: [0.15, -0.22, -0.46], r: [-0.9, -0.35, -0.2] },
  spoon: { p: [0.12, -0.21, -0.44], r: [-0.8, -0.2, 0] },
  chopA: { p: [0.12, -0.19, -0.43], r: [-0.75, -0.25, 0] },
  chopB: { p: [0.135, -0.2, -0.43], r: [-0.8, -0.2, 0] },
};
const MOUTH = [0, -0.07, -0.24];
const ACT_TIME = { cut: 1.3, spoon: 0.8, chop: 0.7, stab: 0.6 }, CHEW_TIME = 1.1;
export let dining = null;
const dineHint = document.createElement('div');
dineHint.id = 'dineHint';
document.body.append(dineHint);

export function canDine(id, src, tableKey) {
  const style = DINE_STYLE[id];
  if (!style) return null;
  const hasCutlery = countItem('cutlery') > 0 || (src === 'table' && tableItems.get(tableKey)?.cutlery);
  if (style === 'chop') return countItem('chopsticks') > 0 ? 'chop' : hasCutlery ? 'stab' : null;
  return hasCutlery ? style : null;
}
export function startDining(id, src, tableKey, style) {
  if (src === 'hand') consumeSelected();
  else { const t = tableItems.get(tableKey); if (t) { t.food = null; refreshSpecial(tableKey); } }
  const bites = DINE_BITES[id] || 3;
  dining = { id, src, tableKey, style, bites, left: bites, phase: 'idle', t: 0, twirl: 0, prevRmb: true, prevLmb: true };
  dining.food = buildPlateFood(id, style);
  for (const [k, o] of Object.entries(DT)) o.visible = { fork: style !== 'spoon' && style !== 'chop', knife: style === 'cut', spoon: style === 'spoon', chopA: style === 'chop', chopB: style === 'chop' }[k];
  bite.clear();
  dineView.visible = true;
  holder.visible = false;
  Sound.place();
}
function endDining(msg) {
  dining = null;
  $('progress').style.opacity = 0;
  dineView.visible = false;
  holder.visible = true;
  bite.clear();
  if (msg) toast(msg);
}
function setPose(o, pose, k = 1) {
  o.position.lerp(new THREE.Vector3(...pose.p), k);
  o.rotation.set(lerp(o.rotation.x, pose.r[0], k), lerp(o.rotation.y, pose.r[1], k), lerp(o.rotation.z, pose.r[2], k));
}
export function takeBite() {
  const d = ITEMS[dining.id], f = 1 / dining.bites;
  const bonus = dining.src === 'table' ? nearTableBonus() : 1;
  player.hunger = Math.min(100, player.hunger + d.food * f * bonus);
  if (d.heal) player.hp = Math.min(100, player.hp + d.heal * f * bonus);
  dining.left--;
  Sound.eat();
  bite.clear();
  const st = dining.food, frac = dining.left / dining.bites;
  if (st.dish) st.dish.consume(frac);
  else if (st.pieces.length) { const p = st.pieces.pop(); foodG.remove(p); }
  else if (dining.style === 'cut') { st.main.scale.x = Math.max(0.05, frac); st.main.position.x = -0.1 * (1 - frac); }
  else if (dining.style === 'twirl') st.main.scale.setScalar(0.35 + 0.65 * frac);
  else if (dining.style === 'spoon') { st.main.position.y = 0.085 - (1 - frac) * 0.07; st.main.scale.setScalar(0.6 + 0.4 * frac); }
  if (dining.left <= 0) {
    if (d.fly) player.flyT = Math.max(player.flyT||0,d.fly);
    endDining(bonus > 1 ? `Dojedeno! Stolování +${Math.round((bonus - 1) * 100)} %` : 'Dojedeno!');
  }
}
// Kousek jídla na příboru
function makeMorsel() {
  bite.clear();
  const st = dining.food;
  if (dining.style === 'twirl') {
    const spool = part(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 12).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf0cf78, roughness: 0.5 }), 0, 0, 0, bite);
    part(new THREE.SphereGeometry(0.008, 6, 4), new THREE.MeshStandardMaterial({ color: 0xb0200f }), 0, 0.012, 0, bite);
    return spool;
  }
  if (st.dish && dining.style !== 'spoon') { const m = dishMorsel(st.dish, foodG, bite); if (m) return m; }
  if (dining.style === 'spoon') return part(new THREE.CircleGeometry(0.02, 12).rotateX(-Math.PI / 2), st.mat, 0, 0, 0, bite);
  if (dining.style === 'chop' && st.pieces.length) { const p = st.pieces[st.pieces.length - 1].clone(); bite.add(p); p.position.set(0, 0, 0); return p; }
  return part(new RoundedBoxGeometry(0.03, 0.02, 0.025, 2, 0.006), st.mat, 0, 0, 0, bite);
}
const tipOf = (o, len) => new THREE.Vector3(0, 0, -len).applyEuler(o.rotation).add(o.position);

export function updateDining(dt) {
  if (!dining) return;
  const D = dining, rmb = input.rmb, rClick = rmb && !D.prevRmb, lClick = input.lmb && !D.prevLmb;
  D.prevRmb = rmb; D.prevLmb = input.lmb;
  if (!rmb) D.armed = true; // stisk, kterým se jídlo vzalo, se nepočítá
  if (lClick || ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].some((k) => keys.has(k)) || !player.alive) {
    // nic nesnědl -> jídlo se vrátí (do ruky nebo zpět na stůl)
    if (D.left === D.bites) {
      const t = D.src === 'table' && tableItems.get(D.tableKey);
      if (t && !t.food) { t.food = D.id; refreshSpecial(D.tableKey); } else addItem(D.id, 1, true);
      endDining('Jídlo odloženo');
    } else endDining('Přestal jsi jíst');
    return;
  }
  const { fork, knife, spoon, chopA, chopB } = DT;
  const dc = D.food.dish && dishCenter(D.food.dish, foodG);
  const target = dc ? PLATE_TO_VIEW(dc.x, dc.y + 0.01, dc.z) : D.food.pieces.length ? PLATE_TO_VIEW(D.food.pieces[D.food.pieces.length - 1].position.x, 0.03, D.food.pieces[D.food.pieces.length - 1].position.z) : PLATE_TO_VIEW(D.style === 'cut' ? 0.06 - 0.1 * (1 - D.left / D.bites) : 0, 0.04, 0);
  const lift = (o, len, k) => { const m = new THREE.Vector3(...MOUTH); o.position.lerp(m, k); bite.position.copy(tipOf(o, len)); };
  D.t += dt;
  if (D.phase === 'idle') {
    for (const k of Object.keys(DT)) setPose(DT[k], REST[k], Math.min(1, dt * 8));
    if (D.style === 'twirl' && rmb && D.armed) { D.phase = 'twirl'; D.t = 0; D.twirl = 0; makeMorsel().scale.setScalar(0.01); }
    else if (D.style !== 'twirl' && rmb && D.armed) { D.phase = 'act'; D.t = 0; }
  } else if (D.phase === 'twirl') {
    // vidlička zabodnutá do špaget se točí, na ní roste namotané sousto
    fork.position.lerp(target.clone().add(new THREE.Vector3(0, 0.07, 0.02)), Math.min(1, dt * 10));
    fork.rotation.set(-1.45, 0, D.t * 9);
    D.twirl = Math.min(1, D.twirl + dt * 0.9);
    bite.position.copy(tipOf(fork, 0.1));
    bite.children[0]?.scale.setScalar(0.2 + D.twirl * 0.8);
    D.food.main.rotation.y += dt * 2.5 * (1 - D.twirl * 0.5);
    if (Math.random() < dt * 4) Sound.burst({ dur: 0.05, f0: 900, f1: 600, q: 3, vol: 0.05 });
    if (!rmb) {
      if (D.twirl >= 0.6) { D.phase = 'lift'; D.t = 0; } else { bite.clear(); D.phase = 'idle'; toast('Namotávej déle (drž pravé tlačítko)'); }
    }
  } else if (D.phase === 'act') {
    if (!rmb) { D.phase = 'idle'; D.t = 0; bite.clear(); for (const p of D.food.pieces) p.visible = true; toast('Drž pravé tlačítko'); return; }
    if (D.style === 'cut') { // vidlička přidrží, nůž řeže tam a zpět
      fork.position.lerp(target.clone().add(new THREE.Vector3(-0.03, 0.06, 0)), Math.min(1, dt * 10));
      fork.rotation.set(-1.3, 0.2, 0);
      knife.position.lerp(target.clone().add(new THREE.Vector3(0.035, 0.05, Math.sin(D.t * 22) * 0.03)), Math.min(1, dt * 14));
      knife.rotation.set(-1.2, -0.2, 0);
      if (Math.random() < dt * 9) Sound.burst({ dur: 0.05, f0: 3500, f1: 2500, q: 4, vol: 0.06 });
      if (D.t > ACT_TIME.cut) { makeMorsel(); D.phase = 'lift'; D.t = 0; }
    } else if (D.style === 'spoon') {
      spoon.position.lerp(target.clone().add(new THREE.Vector3(0, 0.02, 0.05)), Math.min(1, dt * 9));
      spoon.rotation.set(-0.4 - Math.sin(Math.min(D.t / 0.6, 1) * Math.PI) * 0.4, -0.2, 0);
      if (D.t > ACT_TIME.spoon) { makeMorsel(); D.phase = 'lift'; D.t = 0; }
    } else if (D.style === 'chop') {
      const k = Math.min(1, dt * 10), close = Math.min(1, D.t / 0.45);
      chopA.position.lerp(target.clone().add(new THREE.Vector3(0.012, 0.06, 0.06)), k);
      chopB.position.lerp(target.clone().add(new THREE.Vector3(0.03 - close * 0.016, 0.065, 0.06)), k);
      chopA.rotation.set(-0.9, 0.05, 0); chopB.rotation.set(-0.9, -0.05 - close * 0.08, 0);
      if (D.t > ACT_TIME.chop) { makeMorsel(); const p = D.food.pieces[D.food.pieces.length - 1]; if (p) p.visible = false; D.phase = 'lift'; D.t = 0; Sound.burst({ dur: 0.03, f0: 2400, f1: 2000, q: 5, vol: 0.08 }); }
    } else { // napíchnout vidličkou
      fork.position.lerp(target.clone().add(new THREE.Vector3(0, 0.07, 0.03)), Math.min(1, dt * 12));
      fork.rotation.set(-1.4, 0, 0);
      if (D.t > ACT_TIME.stab) { makeMorsel(); const p = D.food.pieces[D.food.pieces.length - 1]; if (p) p.visible = false; D.phase = 'lift'; D.t = 0; }
    }
  } else if (D.phase === 'lift') {
    const k = Math.min(1, dt * 6);
    if (D.style === 'spoon') { lift(spoon, 0.065, k); spoon.rotation.x = lerp(spoon.rotation.x, -0.2, k); }
    else if (D.style === 'chop') { lift(chopA, 0.15, k); chopB.position.copy(chopA.position).add(new THREE.Vector3(0.014, 0.005, 0)); }
    else { lift(fork, 0.1, k); fork.rotation.x = lerp(fork.rotation.x, -0.5, k); }
    if (D.style === 'cut') setPose(knife, REST.knife, k);
    if (D.t > 0.55) { takeBite(); if (dining) { dining.phase = 'chew'; dining.t = 0; } }
  } else if (D.phase === 'chew') { // žvýkání – další sousto až po spolknutí
    for (const k of Object.keys(DT)) setPose(DT[k], REST[k], Math.min(1, dt * 6));
    if ((D.munch = (D.munch || 0) - dt) <= 0) { D.munch = 0.28; Sound.bite(D.id); }
    if (D.t > CHEW_TIME) { D.phase = 'idle'; D.t = 0; }
  }
  // kruh kolem křížku: průběh krájení / namotávání / žvýkání
  const pr = $('progress'), prog = D.phase === 'act' ? D.t / ACT_TIME[D.style] : D.phase === 'twirl' ? D.twirl / 0.6 : D.phase === 'chew' ? D.t / CHEW_TIME : 0;
  pr.style.opacity = prog > 0 ? 1 : 0;
  pr.style.background = `conic-gradient(${D.phase === 'chew' ? 'rgba(160,220,255,0.9)' : 'rgba(255,210,120,0.95)'} ${Math.min(1, prog) * 360}deg, rgba(255,255,255,0.15) 0deg)`;
  if (dining) {
    const action = D.phase === 'chew' ? 'žvýkáš…' : { cut: 'DRŽ = krájet', twirl: 'DRŽ = namotávat špagety, pusť = do pusy', spoon: 'DRŽ = nabrat lžící', chop: 'DRŽ = uchopit hůlkami', stab: 'DRŽ = napíchnout vidličkou' }[D.style];
    dineHint.innerHTML = `<b>${ITEMS[D.id].name}</b> · sousto ${D.bites - D.left + 1}/${D.bites}<br>Pravé tl.: ${action} · Levé tl. / pohyb: přestat`;
  }
  dineHint.style.display = dining ? 'block' : 'none';
}
