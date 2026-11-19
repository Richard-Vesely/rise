// Elektrická síť v prohlížeči: modely kabelů a zařízení, jejich svícení a okno se stavem sítě.
import './furnace.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { BLOCKS } from '../../../shared/data/index.js';
import { BAT_CAP, BAT_RATE, CHARGE_TIME, DIRS6, EFURNACE_TIME, demandOf, elecOf, flipSwitch, netOf, netStats, powerOf, sunLevel } from '../../../shared/sim/power.js';
import { clamp } from '../../../shared/util.js';
import { bkey, blocks, power } from '../../../shared/world/state.js';
import { topY } from '../../../shared/world/voxels.js';
import { Sound } from '../audio/sound.js';
import { buildComputerModel, drawPCScreen } from '../pc/computer.js';
import { buildPrinterModel, printerDev } from '../pc/printer.js';
import { specials } from '../render/blocks.js';
import { dummy } from '../render/forest.js';
import { U as UNI, camera, scene } from '../render/renderer.js';
import { toast } from '../ui/hud.js';
import { iconImg, slotHTML, ui } from '../ui/inventory-ui.js';
import { TECH, addHolo, addStatus, addStrip, builder, drawHolo, glowMat, mergeStatic, setStatus, techMats, updateHolo } from './machine-models.js';

// ============================================================ elektrická síť
// Pravidla sítě (výroba, spotřeba, baterie, vypínač, tiskárna) jsou v shared/sim/power.js; tady jsou modely a okno zařízení.

// ---------- vykreslení kabelů: středový uzel + ramena k sousedním elektrickým blokům (InstancedMesh)
// Jádro kabelu ukazuje svůj kov (měď, zlato). Kudy teče proud, běží po kabelu tyrkysové pulzy: čím větší odběr,
// tím rychleji a jasněji. Bez proudu je kabel tmavý. aPow = 0 bez proudu, jinak 0,3–1 podle zatížení sítě.
const PULSE = new THREE.Color(TECH.cyan);
function cableMat(color, roughness) {
  // metalness pod 1: trocha vlastní barvy, aby zlato za soumraku neodráželo jen modrou oblohu
  const m = new THREE.MeshStandardMaterial({ color, metalness: 0.85, roughness, envMapIntensity: 1.1 });
  m.customProgramCacheKey = () => 'cable';
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = UNI.time;
    sh.uniforms.uPulse = { value: PULSE };
    sh.uniforms.uMetal = { value: new THREE.Color(color) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aPow;
varying float vPow;
varying vec3 vCW;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vPow = aPow;
vCW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform vec3 uPulse, uMetal;
varying float vPow;
varying vec3 vCW;`)
      .replace('#include <emissivemap_fragment>', `if (vPow > 0.0) {
  float run = fract((vCW.x + vCW.y + vCW.z) * 1.6 - uTime * (0.7 + 2.6 * vPow));
  totalEmissiveRadiance += uPulse * (vPow * 2.6 * smoothstep(0.86, 0.97, run) * (1.0 - smoothstep(0.97, 1.0, run)));
}
// kov jádra je vidět i za soumraku: slabý vlastní lesk v barvě kovu (zlato zůstane zlaté, ne tyrkysové od oblohy)
totalEmissiveRadiance += uMetal * 0.16;
#include <emissivemap_fragment>`);
  };
  return m;
}
const cableMats = { copper: cableMat(0xd07a42, 0.34), gold: cableMat(0xffc63a, 0.26) };
const sheathMat = new THREE.MeshStandardMaterial({ color: 0x17191e, roughness: 0.7, metalness: 0.2 });
// uzel: kulatá spojka v tmavé objímce; rameno: kovové jádro
const cableGeos = {
  c: new THREE.CylinderGeometry(0.085, 0.085, 0.17, 12),
  a: new THREE.CylinderGeometry(0.06, 0.06, 0.42, 10).rotateZ(Math.PI / 2).translate(0.29, 0, 0),
  s: new THREE.CylinderGeometry(0.1, 0.1, 0.06, 12),
};
const ARM_ROT = [[0, 0, 0], [0, Math.PI, 0], [0, 0, Math.PI / 2], [0, 0, -Math.PI / 2], [0, -Math.PI / 2, 0], [0, Math.PI / 2, 0]];
const cablePool = new Map();
let cableT = 0;
export function rebuildCables() {
  const lists = new Map();
  const push = (key, m) => { if (!lists.has(key)) lists.set(key, []); lists.get(key).push(m); };
  for (const [k, t] of blocks) {
    const B = BLOCKS[t];
    if (!B.cable) continue;
    const [x, y, z] = k.split(',').map(Number);
    dummy.position.set(x + 0.5, y + 0.5, z + 0.5);
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    push(`${B.cable}|c`, [dummy.matrix.clone(), k]);
    push('sheath|s', [dummy.matrix.clone(), k]);
    DIRS6.forEach(([dx, dy, dz], i) => {
      if (!elecOf(blocks.get(bkey(x + dx, y + dy, z + dz)))) return;
      dummy.rotation.set(...ARM_ROT[i]);
      dummy.updateMatrix();
      push(`${B.cable}|a`, [dummy.matrix.clone(), k]);
    });
  }
  for (const [key, list] of lists) {
    let m = cablePool.get(key);
    if (!m || m.instanceMatrix.count < list.length) {
      if (m) { scene.remove(m); m.dispose(); }
      const [mat, part] = key.split('|');
      const n = Math.max(64, Math.ceil(list.length * 1.5));
      m = new THREE.InstancedMesh(cableGeos[part].clone(), mat === 'sheath' ? sheathMat : cableMats[mat], n);
      m.geometry.setAttribute('aPow', new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
      m.frustumCulled = false;
      scene.add(m);
      cablePool.set(key, m);
    }
    list.forEach(([mt], i) => m.setMatrixAt(i, mt));
    m.userData.keys = list.map(([, k]) => k);
    m.count = list.length;
    m.instanceMatrix.needsUpdate = true;
  }
  for (const [key, m] of cablePool) if (!lists.has(key)) { m.count = 0; m.userData.keys = []; }
  cableT = 0;
}
// Zatížení kabelu: 0 = bez proudu, jinak 0,3–1 podle toho, kolik síť vyrábí a odebírá (4× za sekundu)
function updateCablePulses(dt) {
  if ((cableT -= dt) > 0) return;
  cableT = 0.25;
  for (const m of cablePool.values()) {
    const a = m.geometry.getAttribute('aPow'), keys = m.userData.keys || [];
    for (let i = 0; i < keys.length; i++) {
      const st = netStats(keys[i]), flow = st ? Math.max(st[0], st[1]) : 0;
      a.array[i] = flow > 0 ? 0.3 + 0.7 * Math.min(1, flow / 200) : 0;
    }
    a.needsUpdate = true;
  }
}

// ---------- modely zařízení (volá buildSpecial); přední strana je +z. Vzhled a materiály: machines/machine-models.js
export function buildElecModel(type, g) {
  const T = techMats(), { box, cyl } = builder(g), U = g.userData;
  const red = () => new THREE.MeshStandardMaterial({ color: 0xd82a2a, roughness: 0.35 });
  if (type === 'coal_generator') {
    box(0.94, 0.06, 0.88, T.dark, 0, 0.03, 0);
    box(0.9, 0.72, 0.84, T.housing, 0, 0.42, 0, 0.04);
    box(0.7, 0.05, 0.6, T.trim, 0, 0.8, -0.04, 0.02);
    box(0.5, 0.24, 0.03, T.dark, 0, 0.26, 0.425, 0.01); // dvířka topeniště
    U.glow = box(0.42, 0.14, 0.02, glowMat(TECH.amber), 0, 0.26, 0.437).material;
    for (let i = 0; i < 4; i++) box(0.56, 0.025, 0.02, T.dark, 0, 0.5 + i * 0.055, 0.425); // větrací mřížka
    addStrip(g, 0.72, 0.022, 0.012, 0, 0.71, 0.425);
    addStatus(g, 0.36, 0.6, 0.43);
    // ventilátor na boku (točí se, když generátor běží)
    const fan = new THREE.Group();
    fan.position.set(-0.46, 0.46, 0);
    fan.rotation.z = Math.PI / 2;
    g.add(fan);
    const grille = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.022, 8, 24).rotateY(Math.PI / 2), T.chrome);
    grille.position.copy(fan.position);
    g.add(grille);
    for (let i = 0; i < 5; i++) { const bl = box(0.16, 0.012, 0.06, T.dark, 0, 0, 0, 0, fan); bl.geometry.translate(0.09, 0, 0); bl.rotation.set(0, (i / 5) * Math.PI * 2, 0.35); }
    cyl(0.04, 0.04, 0.04, T.chrome, 0, 0.01, 0, 10, fan);
    U.fan = fan;
    cyl(0.06, 0.07, 0.42, T.chrome, -0.28, 1.0, -0.25, 12); // výfuk
    cyl(0.075, 0.075, 0.05, T.dark, -0.28, 1.22, -0.25, 12);
    const out = cyl(0.11, 0.11, 0.08, T.copper, 0.47, 0.45, 0, 16); // výstup proudu
    out.rotation.z = Math.PI / 2;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.015, 6, 20).rotateY(Math.PI / 2), glowMat(TECH.cyan, 0.15));
    ring.position.set(0.515, 0.45, 0);
    g.add(ring);
    U.strips.push(ring.material);
    addHolo(g, type, 1.45);
  } else if (type === 'solar_panel') {
    box(0.4, 0.04, 0.4, T.dark, 0, 0.02, 0, 0.01);
    cyl(0.045, 0.055, 0.56, T.chrome, 0, 0.3, 0, 10);
    addStatus(g, 0, 0.1, 0.2);
    const panel = new THREE.Group();
    panel.position.y = 0.62;
    panel.rotation.x = 0.45; // nakloněný ke slunci
    g.add(panel);
    box(1, 0.05, 1, T.chrome, 0, 0, 0, 0.015, panel); // hliníkový rám
    const tx = solarTex();
    const cells = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.94).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({
      map: tx.map, emissiveMap: tx.edge, emissive: TECH.cyan, emissiveIntensity: 0, metalness: 0.4, roughness: 0.12, envMapIntensity: 1.6,
    }));
    cells.position.y = 0.027;
    panel.add(cells);
    U.cells = cells.material;
    addHolo(g, type, 1.35);
  } else if (type === 'battery_block') {
    box(0.84, 0.05, 0.84, T.dark, 0, 0.025, 0);
    box(0.8, 0.8, 0.8, T.housing, 0, 0.45, 0, 0.04);
    box(0.66, 0.05, 0.66, T.trim, 0, 0.87, 0, 0.02);
    cyl(0.06, 0.06, 0.07, T.copper, -0.18, 0.92, 0, 12); // + pól
    cyl(0.06, 0.06, 0.07, T.chrome, 0.18, 0.92, 0, 12); // − pól
    box(0.26, 0.66, 0.02, T.dark, 0, 0.45, 0.405, 0.01); // okénko s ukazatelem nabití
    U.bars = [0, 1, 2, 3, 4].map((i) => box(0.2, 0.09, 0.02, glowMat(TECH.cyan), 0, 0.2 + i * 0.125, 0.413).material);
    addStatus(g, 0.3, 0.75, 0.41);
    addHolo(g, type, 1.4);
  } else if (type === 'power_switch') {
    box(0.36, 0.06, 0.36, T.trim, 0, 0.03, 0, 0.02);
    box(0.2, 0.03, 0.12, T.dark, 0, 0.07, 0, 0.01);
    const pivot = new THREE.Group();
    pivot.position.y = 0.07;
    g.add(pivot);
    box(0.05, 0.26, 0.05, T.chrome, 0, 0.13, 0, 0, pivot);
    box(0.1, 0.08, 0.1, red(), 0, 0.27, 0, 0.02, pivot);
    U.lever = pivot;
    addStatus(g, 0.12, 0.075, 0.12);
  } else if (type === 'electric_lamp') { // pouliční lampa: štíhlý sloup, rameno s teple bílým světelným panelem
    box(0.36, 0.05, 0.36, T.dark, 0, 0.025, 0, 0.01);
    cyl(0.03, 0.04, 1.26, T.housing, 0, 0.66, 0, 10);
    box(0.44, 0.07, 0.16, T.housing, 0.1, 1.3, 0, 0.025);
    U.glow = box(0.34, 0.015, 0.1, glowMat(TECH.warm, 0, 0x1a1712), 0.12, 1.258, 0).material;
    addStrip(g, 0.02, 0.5, 0.02, 0, 0.6, 0.035);
  } else if (type === 'bulb_lamp') {
    cyl(0.012, 0.012, 0.42, T.dark, 0, 0.79, 0, 6);
    cyl(0.045, 0.04, 0.08, T.housing, 0, 0.56, 0, 12);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), glowMat(TECH.warm, 0, 0x2a2620));
    bulb.position.y = 0.44;
    g.add(bulb);
    U.glow = bulb.material;
  } else if (type === 'motor_block') {
    box(0.7, 0.08, 0.56, T.dark, 0, 0.04, 0, 0.02);
    const body = cyl(0.32, 0.32, 0.62, T.housing, 0, 0.45, 0, 24);
    body.rotation.x = Math.PI / 2;
    for (let i = 0; i < 5; i++) { const fin = cyl(0.335, 0.335, 0.025, T.dark, 0, 0.45, -0.22 + i * 0.11, 24); fin.rotation.x = Math.PI / 2; }
    for (const z of [-0.31, 0.31]) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.014, 6, 28), glowMat(TECH.cyan, 0.15));
      r.position.set(0, 0.45, z);
      g.add(r);
      (U.strips ||= []).push(r.material);
    }
    const shaft = new THREE.Group();
    shaft.position.set(0, 0.45, 0.4);
    g.add(shaft);
    const sh = cyl(0.05, 0.05, 0.2, T.chrome, 0, 0, 0, 10, shaft);
    sh.rotation.x = Math.PI / 2;
    box(0.3, 0.06, 0.04, red(), 0, 0, 0.09, 0, shaft);
    U.shaft = shaft;
    addStatus(g, 0.25, 0.12, 0.29);
    addHolo(g, type, 1.15);
  } else if (type === 'electric_furnace') {
    box(1, 1, 1, T.housing, 0, 0.5, 0, 0.04);
    box(0.84, 0.84, 0.02, T.trim, 0, 0.5, 0.5, 0.01);
    box(0.6, 0.36, 0.02, T.dark, 0, 0.45, 0.515, 0.01);
    U.glow = box(0.54, 0.3, 0.02, glowMat(TECH.amber), 0, 0.45, 0.522).material;
    addStrip(g, 0.6, 0.02, 0.01, 0, 0.78, 0.515);
    addStatus(g, 0.33, 0.84, 0.515);
    addHolo(g, type, 1.4);
  } else if (type === 'charger') {
    box(0.7, 0.42, 0.6, T.trim, 0, 0.21, 0, 0.04);
    box(0.44, 0.03, 0.26, T.dark, 0, 0.43, -0.04, 0.01);
    addStrip(g, 0.46, 0.012, 0.28, 0, 0.415, -0.04);
    addStatus(g, 0.25, 0.3, 0.305);
    addHolo(g, type, 1.05);
  } else if (type === 'computer') { buildComputerModel(g); addHolo(g, type, 1.1); }
  else if (type === 'printer') { buildPrinterModel(g); addHolo(g, type, 0.95); }
  mergeStatic(g);
}
// Solární články: tmavě modré se stříbrnou mřížkou; hrany článků svítí tyrkysově, když na panel svítí slunce
let solarT = null;
function solarTex() {
  if (solarT) return solarT;
  const mk = (fn, srgb = true) => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); fn(x); const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  const grid = (x, col, w) => { x.fillStyle = col; for (let i = 0; i <= 128; i += 32) { x.fillRect(i - w / 2, 0, w, 128); x.fillRect(0, i - w / 2, 128, w); } };
  solarT = {
    map: mk((x) => { x.fillStyle = '#0e1c44'; x.fillRect(0, 0, 128, 128); for (let i = 0; i < 128; i += 4) { x.fillStyle = 'rgba(120,150,220,0.12)'; x.fillRect(0, i, 128, 1); } grid(x, '#b8c4d4', 2); }),
    edge: mk((x) => { x.fillStyle = '#000'; x.fillRect(0, 0, 128, 128); grid(x, '#ffffff', 2); }),
  };
  return solarT;
}
// Vzhled zařízení podle stavu (svítí, točí se, ukazuje nabití, hologram s údajem)
let wasOn = new Map();
export function updatePowerVisuals(dt, time) {
  updateCablePulses(dt);
  const cam = camera.position;
  for (const [k, s] of specials) {
    const e = elecOf(s.type);
    if (!e) continue;
    const st = power.get(k), U = s.obj.userData;
    let on = !!st?.pw;
    if (e.solar) on = sunLevel > 0.05 && s.y >= topY(s.x, s.z) && netOf.has(k);
    if (e.store) on = (st?.e || 0) > 0;
    if (U.glow) U.glow.emissiveIntensity = on ? (s.type === 'coal_generator' || s.type === 'electric_furnace' ? 1.3 + Math.sin(time * 9 + s.x) * 0.3 : 2.4) : 0;
    if (U.shaft && on) U.shaft.rotation.z += dt * 18;
    if (U.fan && on) U.fan.rotation.y += dt * 14;
    if (U.bars) U.bars.forEach((b, i) => (b.emissiveIntensity = (st?.e || 0) / BAT_CAP > i / 5 + 0.01 ? 1.8 : 0.05));
    if (U.lever) U.lever.rotation.x = st?.on === false ? 0.6 : -0.6;
    if (U.led) U.led.emissiveIntensity = on ? 1.6 : 0.2;
    if (U.status) setStatus(U.status, e.switch ? st?.on !== false : on, time);
    if (U.strips) for (const m of U.strips) m.emissiveIntensity = on ? 1.5 + 0.25 * Math.sin(time * 2.2 + s.x) : 0.08;
    if (U.cells) U.cells.emissiveIntensity = on ? 0.25 + sunLevel * 0.9 : 0;
    if (U.screen) {
      const net = netOf.get(k), standby = !!net && !st?.pc && net.gens.length + net.solars.length + net.bats.length > 0;
      drawPCScreen(k, U.screen, st, standby);
      U.screen.scan.visible = !!(st?.pc && on) || standby;
      if (U.screen.scan.visible) U.screen.scan.material.map.offset.y = -time * 0.2;
      if (U.screen.mode === 'standby') U.screen.tex.offset.y = -((time * 0.06) % 1);
    }
    if (U.sheet) { U.sheet.visible = on; if (on) U.sheet.position.z = 0.24 + ((time * 0.33) % 1) * 0.12; } // list vyjíždí z tiskárny
    if (U.holo) {
      const H = U.holo, show = e.store ? netOf.has(k) : on;
      if (show) drawHolo(H, e.gen ? `+${e.gen} W` : e.solar ? `+${Math.round(e.solar * sunLevel)} W` : e.store ? `${Math.round(((st?.e || 0) / BAT_CAP) * 100)} %` : `${e.use} W`);
      updateHolo(H, s.obj, show, cam, dt, time);
    }
    // zvuk, když se stroj poblíž rozběhne
    if (on && wasOn.get(k) === false && !e.switch && (cam.x - s.x) ** 2 + (cam.z - s.z) ** 2 < 15 * 15) Sound.powerUp();
    wasOn.set(k, on);
  }
  if (wasOn.size > specials.size * 2 + 64) wasOn = new Map([...wasOn].filter(([k]) => specials.has(k)));
}
// Pravé tlačítko na vypínač: zapnout / vypnout (síť se hned přepočítá)
export function toggleSwitch(k) {
  const on = flipSwitch(k);
  Sound.place();
  toast(on ? 'Vypínač zapnut' : 'Vypínač vypnut – síť rozpojena');
}
// Okno zařízení: stav sítě (výroba, spotřeba, baterie, kapacita) a ovládání zařízení
export function renderPowerUI(area) {
  const k = ui.fireKey, t = blocks.get(k);
  if (!t) { area.innerHTML = ''; return; }
  const e = elecOf(t), st = e.cable ? null : powerOf(k), net = netOf.get(k), s = netStats(k);
  const kj = (j) => (j / 1000).toFixed(1);
  const devs = net ? net.keys.length - net.cables : 0;
  let dev = '';
  const bar = (p, cls = '') => `<div class="parrow ${cls}" style="width:120px"><i style="width:${clamp(p, 0, 100)}%"></i></div>`;
  if (e.gen) dev = `<div class="fire-ui"><div class="fire-col">${slotHTML(st.slots[0], 0, '', 'power')}<div class="flame ${st.pw ? 'on' : ''}">${iconImg('campfire')}</div></div>
      <div>${bar(st.burnMax ? (st.burn / st.burnMax) * 100 : 0, 'fuelbar')}<div class="mc-note">${st.pw ? `Vyrábí ${e.gen} W` : st.slots[0] ? 'Stojí – síť teď energii nepotřebuje' : 'Stojí – vlož palivo (uhlí, dřevo, líh)'}</div></div></div>`;
  else if (e.solar) { const [x, y, z] = k.split(',').map(Number), lit = y >= topY(x, z); dev = `<div class="mc-note">Výkon teď: ${lit ? Math.round(e.solar * sunLevel) : 0} W z ${e.solar} W ${lit ? `(slunce ${Math.round(sunLevel * 100)} %)` : '– pod zemí nesvítí slunce'}</div>`; }
  else if (e.store) dev = `<div>${bar((st.e / BAT_CAP) * 100)}<div class="mc-note">Nabití: ${kj(st.e)} / ${kj(BAT_CAP)} kJ · nabíjí a vybíjí max. ${BAT_RATE} W</div></div>`;
  else if (t === 'printer') dev = printerDev(st);
  else if (t === 'electric_furnace' || t === 'charger') {
    const time = t === 'charger' ? CHARGE_TIME : EFURNACE_TIME;
    dev = `<div class="fire-ui">${slotHTML(st.slots[0], 0, '', 'power')}${bar(((st.t || 0) / time) * 100)}${slotHTML(st.slots[1], 1, 'out', 'power')}</div>
      <div class="mc-note">${t === 'charger' ? 'Vlož vybitou autobaterii, za 10 s je nabitá.' : 'Taví bez paliva, dvakrát rychleji než pec.'} ${st.pw ? 'Pracuje.' : demandOf(k, t) ? '<span style="color:#ff8a7a">Málo energie – stojí.</span>' : ''}</div>`;
  } else if (e.use) dev = `<div class="mc-note">Příkon ${e.use} W · ${st.pw ? 'zapnuto (napájeno)' : '<span style="color:#ff8a7a">bez energie</span>'}</div>`;
  const stats = !net ? '<div class="mc-note">Není připojeno k žádné síti.</div>' : !s ? '<div class="mc-note">Síť se počítá…</div>'
    : `<div class="power-stats">
        <div>⚡ Výroba <b>${s[0]} W</b></div><div>💡 Spotřeba <b>${s[1]} W</b>${s[2] > s[1] ? ` <span style="color:#ff8a7a">(chce ${s[2]} W)</span>` : ''}</div>
        <div>🔋 Baterie <b>${kj(s[3])} / ${kj(s[5])} kJ</b></div><div>〰 Kabely unesou <b>${s[4]} W</b></div>
        <div>Zařízení v síti: <b>${devs}</b> · kabelů ${net.cables}</div>
      </div>`;
  area.innerHTML = `<div class="mc-title">${BLOCKS[t].name}</div>${dev}<div class="mc-title" style="margin-top:8px">Elektrická síť</div>${stats}
    <div class="mc-note">Kabely spojují zařízení, která se dotýkají. Vypínač síť rozpojí. Měděný kabel unese ${elecOf('cable_copper').cap} W, zlatý ${elecOf('cable_gold').cap} W.</div>`;
}
