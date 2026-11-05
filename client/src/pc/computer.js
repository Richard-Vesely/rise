// Počítač s ŘíšeOS: model, okna, aplikace.
import '../machines/power.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { NET } from '../../../shared/net/net.js';
import { dayCount, dayTime } from '../../../shared/sim/day.js';
import { elecOf, netOf, netStats, powerOf } from '../../../shared/sim/power.js';
import { clamp } from '../../../shared/util.js';
import { blocks, power } from '../../../shared/world/state.js';
import { Sound } from '../audio/sound.js';
import { input, keys, lockPointer, player, unlockPointer } from '../player/player.js';
import { addStatus, addStrip, builder, techMats } from '../machines/machine-models.js';
import { tanksInit } from './tanks.js';

// ============================================================ počítač: model, operační systém ŘíšeOS a hra Tanky 2D
// Zapnutí je společné pro všechny hráče (power[k].pc, ukládá se a synchronizuje jako stav ostatních zařízení),
// obrazovku systému (okna, hra) má každý hráč u sebe. Zapnutý počítač bere ze sítě 60 W; když energie dojde, vypne se.
export let pcOpen = false;
const PC_WALLS = [['Louka', '#4a9ae8', '#8ad87a'], ['Západ slunce', '#ff9a4a', '#6a2a8a'], ['Noc', '#0a1a3a', '#4a2a7a'], ['Les', '#1a4a2a', '#7ab84a'], ['Poušť', '#f0c87a', '#c8683a']];
// Změna stavu počítače: u hráče v multiplayeru se na chvíli ignoruje stav od hostitele, dokud změna neodejde (jinak by ji přepsal)
export function pcSet(k, fields) {
  Object.assign(powerOf(k), fields);
  if (NET.client) NET.pend.set('power|' + k, performance.now() + 1500);
}
const pcWall = (st) => PC_WALLS[st?.wall || 0] || PC_WALLS[0];

// ---------- 3D model: skříň, monitor s obrazovkou (canvas), klávesnice a myš; přední strana je +z
export function buildComputerModel(g) {
  const T = techMats(), { box, cyl } = builder(g);
  box(0.24, 0.5, 0.5, T.housing, -0.35, 0.25, -0.08, 0.02); // skříň
  box(0.2, 0.03, 0.01, T.dark, -0.35, 0.4, 0.175);
  addStrip(g, 0.012, 0.3, 0.01, -0.3, 0.22, 0.176); // svítící proužek (tyrkysový = elektřina)
  addStatus(g, -0.39, 0.45, 0.178);
  box(0.22, 0.02, 0.15, T.housing, 0.12, 0.01, -0.14, 0.008); // podstavec monitoru
  cyl(0.02, 0.02, 0.22, T.chrome, 0.12, 0.13, -0.17, 8);
  box(0.66, 0.42, 0.035, T.dark, 0.12, 0.44, -0.14, 0.015); // tenký rámeček
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapT = THREE.RepeatWrapping;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.37), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  scr.position.set(0.12, 0.44, -0.121);
  g.add(scr);
  // přes obraz běží jemné řádky a světelný pruh (zapnutý počítač „žije“)
  const scan = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.37), new THREE.MeshBasicMaterial({ map: scanTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0.5 }));
  scan.position.set(0.12, 0.44, -0.119);
  scan.visible = false;
  scan.userData.keep = true;
  g.add(scan);
  box(0.46, 0.022, 0.15, T.dark, 0.06, 0.011, 0.2, 0.008); // klávesnice s podsvícením
  addStrip(g, 0.43, 0.006, 0.12, 0.06, 0.024, 0.2);
  box(0.06, 0.025, 0.09, T.trim, 0.38, 0.0125, 0.22, 0.012); // myš
  g.userData.screen = { ctx: c.getContext('2d'), tex, key: '', scan };
}
// Řádky přes obrazovku a pruh, který po ní pomalu jede dolů (posouvá se texturou)
let scanT = null;
function scanTex() {
  if (scanT) return scanT;
  const c = document.createElement('canvas');
  c.width = 4; c.height = 128;
  const x = c.getContext('2d');
  for (let y = 0; y < 128; y++) { const bar = Math.max(0, 1 - Math.abs(y - 100) / 14); x.fillStyle = `rgba(150,240,255,${(y % 3 === 0 ? 0.1 : 0.02) + bar * 0.35})`; x.fillRect(0, y, 4, 1); }
  scanT = new THREE.CanvasTexture(c);
  scanT.wrapT = THREE.RepeatWrapping;
  scanT.colorSpace = THREE.SRGBColorSpace;
  return scanT;
}
// Obraz na monitoru ve světě (vidí ho i ostatní hráči): vypnuto, start, plocha
// standby = počítač je vypnutý, ale v síti s proudem: na obrazovce běží pohotovostní terminál (řádky pomalu jedou nahoru)
export function drawPCScreen(k, S, st, standby = false) {
  const local = pc.k === k && (pc.phase === 'boot' || pc.phase === 'shut') ? pc.phase : null;
  const mode = local || (st?.pc && st.pw ? 'desk' : standby ? 'standby' : 'off');
  S.mode = mode;
  const key = mode + (st?.wall || 0);
  if (S.key === key) return;
  S.key = key;
  const x = S.ctx, W = 256, H = 160;
  S.tex.offset.y = 0;
  x.fillStyle = '#050608';
  x.fillRect(0, 0, W, H);
  if (mode === 'standby') {
    // svislé opakování: textura se posouvá (power.js), takže řádky „běží“ bez překreslování plátna
    x.fillStyle = '#04121a';
    x.fillRect(0, 0, W, H);
    x.font = '11px monospace';
    const lines = ['ŘíšeOS 2.6 · pohotovost', '> síť: OK', '> napájení ✓', '> čekám na hráče…', '> kontrola disku 100 %', '> teplota 31 °C', '> zálohy: hotovo', '> pravým tlačítkem zapni', '> síť: OK', '> ping 3 ms'];
    lines.forEach((t, i) => { x.fillStyle = i === 0 ? '#9ff4ff' : i % 3 === 1 ? '#5cff8a' : '#38c8e0'; x.fillText(t, 10, 14 + i * 16); });
    x.fillStyle = 'rgba(56,232,255,0.5)';
    x.fillRect(W - 40, 8, 30, 3); x.fillRect(W - 40, 15, 18, 3);
    x.strokeStyle = 'rgba(56,232,255,0.35)';
    x.strokeRect(1.5, 1.5, W - 3, H - 3);
  } else if (mode === 'boot' || mode === 'shut') {
    x.fillStyle = '#0a1424';
    x.fillRect(0, 0, W, H);
    x.fillStyle = '#e8eef8';
    x.font = 'bold 26px sans-serif';
    x.textAlign = 'center';
    x.fillText('ŘíšeOS', W / 2, 78);
    x.font = '13px sans-serif';
    x.fillText(mode === 'boot' ? 'Spouštění…' : 'Vypínání…', W / 2, 104);
  } else if (mode === 'desk') {
    const [, a, b] = pcWall(st), gr = x.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, a);
    gr.addColorStop(1, b);
    x.fillStyle = gr;
    x.fillRect(0, 0, W, H);
    for (let i = 0; i < 3; i++) { x.fillStyle = 'rgba(255,255,255,0.85)'; x.fillRect(10, 10 + i * 34, 22, 22); x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(8, 34 + i * 34, 26, 4); }
    x.fillStyle = 'rgba(16,20,30,0.85)';
    x.fillRect(0, H - 16, W, 16);
    x.fillStyle = '#4a9ae8';
    x.fillRect(3, H - 13, 26, 10);
  }
  S.tex.needsUpdate = true;
}

// ---------- obrazovka operačního systému (HTML přes celou obrazovku)
const pcEl = document.createElement('div');
pcEl.id = 'pc';
pcEl.innerHTML = `<div class="pc-mon"><div class="pc-scr"></div>
  <div class="pc-bez"><span class="pc-brand">ŘíšeTech</span><span class="pc-led"></span><button class="pc-pwr" data-pc="power" title="Zapnout / vypnout">⏻</button>
  <span class="pc-hint"></span><button class="pc-leave" data-pc="leave">✕ Odejít <small>(Esc)</small></button></div></div>`;
document.body.appendChild(pcEl);
const pcScr = pcEl.querySelector('.pc-scr');
export const pc = { k: null, phase: null, t: 0, lostT: 0, wins: [], z: 10, active: null, clockT: 0 };

export function openPC(k) {
  if (pc.k !== k) { closeAllWins(); pc.k = k; pc.phase = null; }
  pcOpen = true;
  keys.clear();
  input.lmb = input.rmb = false;
  unlockPointer();
  pcEl.style.display = 'flex';
  const st = powerOf(k), on = !!(st.pc && st.pw);
  if (!pc.phase || (pc.phase === 'desk') !== on && pc.phase !== 'boot' && pc.phase !== 'shut') setPhase(on ? 'desk' : 'off');
  updateBezel();
}
export function closePC() {
  pcOpen = false;
  pcEl.style.display = 'none';
  for (const w of pc.wins) w.app.blur?.(w);
  lockPointer();
}
function setPhase(p, msg = '') {
  pc.phase = p;
  pc.t = pc.lostT = 0;
  if (p !== 'desk') closeAllWins();
  const lines = (s) => s.split('\n').map((l) => `<div>${l}</div>`).join('');
  if (p === 'off') pcScr.innerHTML = `<div class="pc-off">${msg ? `<div class="pc-err">${lines(msg)}</div>` : ''}<div>Počítač je vypnutý.</div><div class="pc-dim">Zapni ho tlačítkem ⏻ dole na monitoru.</div></div>`;
  else if (p === 'boot' || p === 'shut') pcScr.innerHTML = `<div class="pc-boot"><div class="pc-logo">ŘíšeOS</div><div class="pc-dim">${p === 'boot' ? 'Spouštění systému…' : 'Vypínání…'}</div>${p === 'boot' ? '<div class="pc-prog"><i></i></div>' : ''}</div>`;
  else if (p === 'desk') renderDesk();
}
const pcCanShut = () => pc.wins.every((w) => !w.app.canClose || w.app.canClose(w)); // vypnutí zahodí neuložené dokumenty
function updateBezel() {
  const st = power.get(pc.k) || {}, on = !!(st.pc && st.pw);
  pcEl.querySelector('.pc-led').classList.toggle('on', on);
  pcEl.querySelector('.pc-hint').textContent = on ? `Napájeno · odběr ${elecOf('computer').use} W` : pc.phase === 'boot' ? 'Spouští se…' : 'Vypnuto';
}
export function pcPower() {
  Sound.init();
  if (pc.phase === 'desk' || pc.phase === 'boot') { if (pcCanShut()) setPhase('shut'); return; }
  if (pc.phase === 'shut') return;
  const net = netOf.get(pc.k);
  if (!net || !(net.gens.length + net.solars.length + net.bats.length)) {
    setPhase('off', 'Počítač není připojený ke zdroji elektřiny.\nPropoj ho kabelem s generátorem, solárním panelem nebo baterií.');
    return;
  }
  pcSet(pc.k, { pc: true, cut: 0 });
  Sound.tone(660, 0.12, 0.08, 'sine');
  setPhase('boot');
}
// Volá herní smyčka: start, vypnutí, výpadek napájení, hodiny, aplikace
export function updatePC(dt) {
  if (!pc.k) return;
  const k = pc.k;
  if (blocks.get(k) !== 'computer') { if (pcOpen) closePC(); closeAllWins(); pc.k = null; return; }
  if (pcOpen) {
    const [x, , z] = k.split(',').map(Number);
    if (!player.alive || Math.hypot(x + 0.5 - player.pos.x, z + 0.5 - player.pos.z) > 7) closePC();
  }
  const st = power.get(k) || {};
  pc.t += dt;
  if (pc.phase === 'boot') {
    // u hráče v multiplayeru přichází stav napájení od hostitele se zpožděním, proto čeká déle
    if (pc.t > 2.4 && st.pw) { setPhase('desk'); Sound.craft(); }
    else if (pc.t > (NET.client ? 6 : 2.6)) { pcSet(k, { pc: false }); setPhase('off', 'Síť nemá dost energie – počítač potřebuje 60 W.'); }
  } else if (pc.phase === 'shut') {
    if (pc.t > 1.2) {
      pcSet(k, { pc: false });
      setPhase('off');
      if (pc.restart) { pc.restart = false; pcPower(); } // restart = vypnout a znovu zapnout
    }
  } else if (pc.phase === 'desk') {
    if (!st.pc) setPhase('off', st.cut ? 'Výpadek napájení – počítač se vypnul.' : 'Počítač vypnul jiný hráč.');
    else if (!st.pw) { if ((pc.lostT += dt) > (NET.client ? 4 : 1.2)) { pcSet(k, { pc: false, cut: 1 }); setPhase('off', 'Výpadek napájení – počítač se vypnul.'); } }
    else pc.lostT = 0;
  } else if (st.pc && st.pw && pc.phase === 'off') setPhase('desk'); // zapnul ho jiný hráč
  if (!pcOpen) return;
  updateBezel();
  if (pc.phase === 'desk') {
    if ((pc.clockT -= dt) <= 0) {
      pc.clockT = 1;
      const h = Math.floor(dayTime * 24), mi = Math.floor((dayTime * 24 * 60) % 60), el = pcScr.querySelector('.pc-clock');
      if (el) el.textContent = `Den ${dayCount} · ${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
      for (const w of pc.wins) w.app.slow?.(w);
    }
    for (const w of pc.wins) w.app.tick?.(w, Math.min(dt, 0.05));
  }
}

// ---------- plocha, nabídka Start, okna
export const PC_APPS = {
  tanks: { title: 'Tanky 2D', icon: '🎮', w: 700, h: 500, init: (w) => tanksInit(w), tick: (w, dt) => w.game.step(dt), blur: (w) => w.game.keys.clear() },
  sys: {
    title: 'O počítači', icon: '🖥️', w: 440, h: 340,
    init: (w) => PC_APPS.sys.slow(w),
    slow(w) {
      const st = power.get(pc.k) || {}, s = netStats(pc.k), tk = st.tk || [0, 0];
      w.body.innerHTML = `<div class="pc-info">
        <div class="pc-logo sm">ŘíšeOS 1.0</div>
        <div>Procesor: <b>ŘíšeTech R1 · 1 jádro, 800 MHz</b></div>
        <div>Paměť: <b>64 MB</b> · Disk: <b>2 GB</b></div>
        <div>Napájení: <b>${st.pw ? 'v pořádku' : 'chybí'}</b> · příkon <b>${elecOf('computer').use} W</b></div>
        ${s ? `<div>Síť: výroba <b>${s[0]} W</b>, spotřeba <b>${s[1]} W</b>, baterie <b>${(s[3] / 1000).toFixed(1)} kJ</b></div>` : ''}
        <div>Tanky 2D proti počítači: <b>${tk[0]}</b> výher · <b>${tk[1]}</b> proher</div>
      </div>`;
    },
  },
  wall: {
    title: 'Pozadí plochy', icon: '🎨', w: 440, h: 260,
    init(w) {
      w.body.innerHTML = `<div class="pc-walls">${PC_WALLS.map(([n, a, b], i) => `<button data-wall="${i}" style="background:linear-gradient(135deg,${a},${b})"><span>${n}</span></button>`).join('')}</div>
        <div class="pc-dim">Pozadí se uloží v počítači a vidí ho i ostatní hráči na monitoru.</div>`;
    },
  },
};
function renderDesk() {
  const [, a, b] = pcWall(power.get(pc.k));
  pcScr.innerHTML = `<div class="pc-desk" style="background:linear-gradient(135deg,${a},${b})">
    <div class="pc-icons">${Object.entries(PC_APPS).map(([id, A]) => `<button class="pc-ic" data-app="${id}"><span>${A.icon}</span>${A.title}</button>`).join('')}</div>
    <div class="pc-winl"></div>
    <div class="pc-startm" hidden>${Object.entries(PC_APPS).map(([id, A]) => `<button data-app="${id}">${A.icon} ${A.title}</button>`).join('')}
      <hr><button data-pc="restart">↻ Restartovat</button><button data-pc="power">⏻ Vypnout</button></div>
    <div class="pc-bar"><button class="pc-startb" data-pc="start">◆ Start</button><div class="pc-tasks"></div><span class="pc-clock"></span></div>
  </div>`;
  pc.clockT = 0;
}
function renderTasks() {
  const el = pcScr.querySelector('.pc-tasks');
  if (el) el.innerHTML = pc.wins.map((w) => `<button data-task="${w.id}" class="${w === pc.active ? 'on' : ''}">${w.app.icon} ${w.app.title}</button>`).join('');
}
function focusWin(w) {
  pc.active = w;
  w.el.style.zIndex = ++pc.z;
  for (const o of pc.wins) o.el.classList.toggle('active', o === w);
  renderTasks();
}
export function openApp(id) {
  const ex = pc.wins.find((w) => w.id === id);
  if (ex) return focusWin(ex);
  const layer = pcScr.querySelector('.pc-winl');
  if (!layer) return;
  const A = PC_APPS[id], el = document.createElement('div');
  el.className = 'pc-win';
  el.innerHTML = `<div class="pc-wt"><span>${A.icon} ${A.title}</span><button data-close="${id}" title="Zavřít">✕</button></div><div class="pc-wb"></div>`;
  layer.appendChild(el);
  const LW = layer.clientWidth, LH = layer.clientHeight, n = pc.wins.length;
  if (LW < 720 || LH < 440) el.classList.add('max'); // malá obrazovka: okno přes celou plochu
  else {
    const w = Math.min(A.w, LW - 20), h = Math.min(A.h, LH - 20);
    Object.assign(el.style, { width: w + 'px', height: h + 'px', left: Math.max(4, (LW - w) / 2 + n * 26 - 26) + 'px', top: Math.max(4, (LH - h) / 2 + n * 22 - 22) + 'px' });
  }
  const win = { id, app: A, el, body: el.querySelector('.pc-wb') };
  pc.wins.push(win);
  A.init?.(win);
  focusWin(win);
  pcScr.querySelector('.pc-startm').hidden = true;
}
function closeWin(id, force) {
  const i = pc.wins.findIndex((w) => w.id === id);
  if (i < 0) return;
  if (!force && pc.wins[i].app.canClose && !pc.wins[i].app.canClose(pc.wins[i])) return; // neuložený dokument
  const [w] = pc.wins.splice(i, 1);
  w.app.blur?.(w);
  w.el.remove();
  if (pc.active === w) pc.active = pc.wins[pc.wins.length - 1] || null;
  if (pc.active) focusWin(pc.active); else renderTasks();
}
function closeAllWins() {
  for (const w of [...pc.wins]) closeWin(w.id, true);
}
pcEl.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) { const sm = pcScr.querySelector('.pc-startm'); if (sm && !e.target.closest('.pc-startm')) sm.hidden = true; return; }
  const sm = pcScr.querySelector('.pc-startm');
  if (sm && b.dataset.pc !== 'start') sm.hidden = true;
  if (b.dataset.pc === 'leave') return closePC();
  if (b.dataset.pc === 'power') return pcPower();
  if (b.dataset.pc === 'restart') { if (pcCanShut()) { setPhase('shut'); pc.restart = true; } return; }
  if (b.dataset.pc === 'start') { sm.hidden = !sm.hidden; return; }
  if (b.dataset.app) return openApp(b.dataset.app);
  if (b.dataset.close) return closeWin(b.dataset.close);
  if (b.dataset.task) { const w = pc.wins.find((o) => o.id === b.dataset.task); if (w) focusWin(w); return; }
  if (b.dataset.wall) { pcSet(pc.k, { wall: Number(b.dataset.wall) }); const [, a, c] = pcWall(power.get(pc.k)); pcScr.querySelector('.pc-desk').style.background = `linear-gradient(135deg,${a},${c})`; }
});
// Okno se dá přesunout za titulek a kliknutím se dá dopředu
pcEl.addEventListener('pointerdown', (e) => {
  const wEl = e.target.closest('.pc-win');
  if (!wEl) return;
  const w = pc.wins.find((o) => o.el === wEl);
  if (w && w !== pc.active) focusWin(w);
  const bar = e.target.closest('.pc-wt');
  if (!bar || e.target.closest('button') || wEl.classList.contains('max')) return;
  const sx = e.clientX - wEl.offsetLeft, sy = e.clientY - wEl.offsetTop, layer = wEl.parentElement;
  const move = (ev) => {
    wEl.style.left = clamp(ev.clientX - sx, -wEl.offsetWidth + 60, layer.clientWidth - 60) + 'px';
    wEl.style.top = clamp(ev.clientY - sy, 0, layer.clientHeight - 30) + 'px';
  };
  const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
});
// Klávesnice patří počítači, dokud je otevřený (hra ji nedostane); Esc zavře nabídku nebo odejde od počítače
addEventListener('keydown', (e) => {
  if (!pcOpen) return;
  e.stopImmediatePropagation();
  if (e.code === 'Escape') {
    const sm = pcScr.querySelector('.pc-startm');
    if (sm && !sm.hidden) sm.hidden = true; else closePC();
    e.preventDefault();
    return;
  }
  if (pc.active?.game?.key(e.code, true)) e.preventDefault();
}, true);
addEventListener('keyup', (e) => {
  if (!pcOpen) return;
  e.stopImmediatePropagation();
  pc.active?.game?.key(e.code, false);
}, true);
