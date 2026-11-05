// Výběr obleku (vzhled postavy): okno s živým 3D náhledem. Otevírá ho hlavní menu (odkaz Oblek) i hra (klávesa O,
// tlačítko Oblek v batohu). Oblek se ukládá v prohlížeči pro každé jméno hráče zvlášť (rise-obleky), na serveru
// kroužku navíc u profilu hráče (stav `me.look`), a ostatním hráčům se posílá v pozici (`lk`, viz net/avatars.js).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EMBLEMS, HAIR_COLORS, LIGHT_COLORS, SKIN_TONES, SUITS, SUIT_COLORS, SUIT_IDS, VISOR_COLORS, cleanCostume, isHero } from '../../../shared/data/costumes.js';
import { animateCharacter, buildCharacter, disposeCharacter, emblemTex } from '../render/character.js';

const KEY = 'rise-obleky';
const readAll = () => { try { const o = JSON.parse(localStorage.getItem(KEY)); return o && typeof o === 'object' ? o : {}; } catch { return {}; } };
/** Oblek hráče s tímhle jménem (uložený v prohlížeči, jinak výchozí podle jména). */
export const loadCostume = (name) => cleanCostume(readAll()[name], name);
/** Uloží oblek a dá vědět hře (událost rise-costume). `t` = čas změny, novější vyhraje nad serverem. */
export function saveCostume(name, c, t = Date.now()) {
  const all = readAll();
  all[name] = { ...cleanCostume(c, name), t };
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch {}
  dispatchEvent(new CustomEvent('rise-costume', { detail: all[name] }));
  return all[name];
}

// Krátké zvuky okna (vlastní malý zvukový kontext, menu ještě nemá zvuk hry).
let actx = null;
function blip(f = 1800, dur = 0.05, vol = 0.05, slide = 0) {
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination);
    o.start(t); o.stop(t + dur + 0.05);
  } catch {}
}
const suitOnSound = () => { blip(220, 0.25, 0.06, 880); setTimeout(() => blip(1320, 0.12, 0.04), 160); };

let box = null, stop = null;
/**
 * Otevře výběr obleku.
 * @param {{ name: string, onClose?: () => void }} opts
 */
function open(opts) {
  close();
  const name = opts.name || 'Hráč';
  let cur = loadCostume(name);
  const start = { ...cur };
  box = document.createElement('div');
  box.id = 'costume';
  box.innerHTML = `<div class="glass cos-panel" role="dialog" aria-label="Můj oblek">
    <div class="cos-head"><b>Můj oblek</b><span>${esc(name)}</span></div>
    <div class="cos-body">
      <div class="cos-stage"><canvas></canvas><div class="cos-hint">Táhni myší a otoč postavu</div></div>
      <div class="cos-opts">
        <div class="cos-label">Oblek</div><div class="cos-suits"></div><div class="cos-desc"></div>
        <div class="cos-label">Barva obleku</div><div class="cos-sw" data-k="c"></div>
        <div class="cos-label" data-lab="l">Světla</div><div class="cos-sw" data-k="l"></div>
        <div class="cos-label" data-lab="v">Hledí</div><div class="cos-sw" data-k="v"></div>
        <div class="cos-label" data-lab="e">Znak na hrudi</div><div class="cos-sw cos-emb" data-k="e"></div>
      </div>
    </div>
    <div class="cos-foot"><button class="cos-btn" data-act="random">Náhodně</button><span></span><button class="cos-btn" data-act="cancel">Zrušit</button><button class="cos-btn main" data-act="ok">Hotovo</button></div>
  </div>`;
  document.body.append(box);
  const q = (s) => box.querySelector(s);
  const render = () => {
    // hrdinové (obličej a vlasy) místo hledí volí vlasy, místo znaku pleť a světla jsou oči a drahokam
    const hero = isHero(cur.s), lists = { c: SUIT_COLORS, l: LIGHT_COLORS, v: hero ? HAIR_COLORS : VISOR_COLORS };
    q('[data-lab="l"]').textContent = hero ? 'Oči a drahokam' : 'Světla';
    q('[data-lab="v"]').textContent = hero ? 'Vlasy' : 'Hledí';
    q('[data-lab="e"]').textContent = hero ? 'Pleť' : 'Znak na hrudi';
    q('.cos-suits').innerHTML = SUIT_IDS.map((id) => `<button class="cos-suit ${cur.s === id ? 'on' : ''}" data-s="${id}">${SUITS[id].name}</button>`).join('');
    q('.cos-desc').textContent = SUITS[cur.s].desc;
    for (const k of ['c', 'l', 'v']) q(`[data-k="${k}"]`).innerHTML = lists[k].map(([t, hex], i) => `<button class="cos-dot ${k === 'l' ? 'glow' : ''} ${cur[k] === i ? 'on' : ''}" data-i="${i}" title="${t}" aria-label="${t}" style="--c:${hex}"></button>`).join('');
    if (hero) q('[data-k="e"]').innerHTML = SKIN_TONES.map(([t, hex], i) => `<button class="cos-dot ${cur.e === i ? 'on' : ''}" data-i="${i}" title="${t}" aria-label="${t}" style="--c:${hex}"></button>`).join('');
    else q('[data-k="e"]').innerHTML = EMBLEMS.map((t, i) => `<button class="cos-dot cos-e ${cur.e === i ? 'on' : ''}" data-i="${i}" title="${t}" aria-label="${t}" style="--c:${LIGHT_COLORS[cur.l][1]}">${i ? `<img alt="" src="${emblemTex(i).image.toDataURL()}">` : '–'}</button>`).join('');
  };
  render();
  // ---------- 3D náhled
  const canvas = q('canvas');
  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch { q('.cos-stage').classList.add('nogl'); }
  let R = null, raf = 0, rot = -0.5, drag = null, last = performance.now(), demoT = 0;
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  cam.position.set(0, 1.4, 5.2);
  cam.lookAt(0, 1.12, 0);
  if (renderer) {
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 1.1;
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x302820, 0.8));
    const sun = new THREE.DirectionalLight(0xfff0dd, 2.2);
    sun.position.set(2, 4, 3);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x38e8ff, 1.4);
    rim.position.set(-3, 2, -3);
    scene.add(rim);
    // podstavec: holografický kruh
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.06, 48), new THREE.MeshStandardMaterial({ color: 0x1a2230, metalness: 0.8, roughness: 0.35 }));
    ped.position.y = -0.03;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.012, 8, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x38e8ff).multiplyScalar(1.6) }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.005;
    scene.add(ped, ring);
  }
  const rebuild = () => {
    if (R) { scene.remove(R.group); disposeCharacter(R); }
    R = buildCharacter(cur, { shadow: true });
    scene.add(R.group);
  };
  rebuild();
  const size = () => {
    const w = canvas.clientWidth || 260, h = canvas.clientHeight || 340;
    renderer?.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer?.setSize(w, h, false);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  };
  size();
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const now = performance.now(), dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    demoT += dt;
    if (!drag) rot += dt * 0.35;
    // ukázka: chvíli stojí, pak jde na místě a mávne nástrojem
    const ph = demoT % 9, walking = ph > 3 && ph < 6;
    animateCharacter(R, { speed: walking ? 3.5 : 0, yaw: rot, pitch: 0, swing: ph > 6.6 && ph < 6.9, held: 'iron_pick', fly: false }, dt);
    R.anim.bodyYaw = rot; // tělo otáčí uživatel, ne pohled
    R.group.rotation.y = rot;
    R.head.rotation.y = Math.sin(demoT * 0.6) * 0.3;
    renderer?.render(scene, cam);
  };
  if (renderer) loop();
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, r: rot }; canvas.setPointerCapture?.(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (drag) rot = drag.r + (e.clientX - drag.x) * 0.012; });
  canvas.addEventListener('pointerup', () => { drag = null; });
  addEventListener('resize', size);
  // ---------- volby
  const set = (patch) => { cur = cleanCostume({ ...cur, ...patch }, name); render(); rebuild(); if (!window.gameStarted) blip(1800, 0.04, 0.05); };
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) { if (e.target === box) finish(false); return; }
    if (b.dataset.s) { set({ s: b.dataset.s }); suitOnSound(); return; }
    const k = b.closest('[data-k]')?.dataset.k;
    if (k) { set({ [k]: +b.dataset.i }); return; }
    if (b.dataset.act === 'random') { const r = (n) => Math.floor(Math.random() * n); set({ s: SUIT_IDS[r(SUIT_IDS.length)], c: r(SUIT_COLORS.length), l: r(LIGHT_COLORS.length), v: r(VISOR_COLORS.length), e: r(EMBLEMS.length) }); suitOnSound(); }
    if (b.dataset.act === 'cancel') finish(false);
    if (b.dataset.act === 'ok') finish(true);
  });
  const onKey = (e) => { // dokud je okno otevřené, klávesy nejdou do hry
    e.stopPropagation();
    if (e.code === 'Escape' || e.code === 'KeyO') finish(false); else if (e.code === 'Enter') finish(true);
  };
  addEventListener('keydown', onKey, true);
  function finish(ok) {
    const changed = ['s', 'c', 'l', 'v', 'e'].some((k) => cur[k] !== start[k]);
    if (ok && changed) { saveCostume(name, cur); suitOnSound(); } else blip(900, 0.08, 0.04, 500);
    close();
    opts.onClose?.(ok && changed);
  }
  stop = () => {
    cancelAnimationFrame(raf);
    removeEventListener('resize', size);
    removeEventListener('keydown', onKey, true);
    if (R) disposeCharacter(R);
    scene.environment?.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss?.();
  };
}
function close() { stop?.(); stop = null; box?.remove(); box = null; }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
window.RiseCostume = { open, close, get isOpen() { return !!box; } };
