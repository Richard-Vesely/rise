// Dotykové ovládání.
import '../game/save.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { ITEMS } from '../../../shared/data/index.js';
import { clamp } from '../../../shared/util.js';
import { bkey, blocks, vehicles } from '../../../shared/world/state.js';
import { Sound } from '../audio/sound.js';
import { dining } from '../dining/dining.js';
import { MP } from '../game/boot.js';
import { TOUCH, lookSens, prefNum } from '../game/prefs.js';
import { saveGame } from '../game/save.js';
import { toggleView } from '../net/avatars.js';
import { chatOpen, openChat, pauseOpen } from '../net/mp-ui.js';
import { resetUseCd, target } from '../player/interaction.js';
import { heldStack, inv } from '../player/inventory.js';
import { creative, guideOpen, input, isLocked, keys, lockPointer, player, setResetting, toggleGuide, unlockPointer } from '../player/player.js';
import { enterVehicle, exitVehicle, honk, toggleCarCam } from '../vehicles/car.js';
import { dropHeld } from '../world/ground-items.js';
import { $ } from './dom.js';
import { toast } from './hud.js';
import { closeInventory, invEl, invOpen, openInventory, renderHotbar } from './inventory-ui.js';

// ============================================================ dotykové ovládání (telefony a tablety)
// Levá půlka obrazovky = joystick (objeví se tam, kam položíš prst), pravá = otáčení kamery.
// Tlačítka posílají stejné vstupy jako myš a klávesnice (input.lmb / input.rmb / klávesy), takže herní logika je jedna.
export const touchUI = (() => {
  if (!TOUCH) return { update() {} };
  document.body.classList.add('touch');
  const root = document.createElement('div');
  root.id = 'touch';
  root.innerHTML = `
    <div id="tJoy"><div id="tKnob"></div></div>
    <div class="tbtn big" data-hold="lmb" id="tLmb"><span>⛏</span><small>Těžit</small></div>
    <div class="tbtn big" data-hold="rmb" id="tRmb"><span>✋</span><small>Použít</small></div>
    <div class="tbtn big" data-key="Space" id="tJump"><span>⤒</span><small>Skok</small></div>
    <div class="tbtn" data-toggle="sprint" id="tSprint"><span>»</span><small>Běh</small></div>
    <div class="tbtn" data-key="ShiftLeft" id="tDown" hidden><span>⤓</span><small>Dolů</small></div>
    <div class="tcol">
      <div class="tbtn small" data-act="inv"><span>🎒</span><small>Batoh</small></div>
      <div class="tbtn small" data-act="craft"><span>🔨</span><small>Výroba</small></div>
      <div class="tbtn small" data-act="drop"><span>⇣</span><small>Hodit</small></div>
      <div class="tbtn small" data-act="guide"><span>📖</span><small>Návod</small></div>
      <div class="tbtn small" data-act="view"><span>👁</span><small>Pohled</small></div>
      ${MP ? '<div class="tbtn small" data-act="chat"><span>💬</span><small>Chat</small></div>' : ''}
      <div class="tbtn small" data-act="menu"><span>⏸</span><small>${MP ? 'Menu' : 'Pauza'}</small></div>
    </div>
    <div class="tcar">
      <div class="tbtn small" data-act="vhorn"><span>📯</span><small>Klakson</small></div>
      <div class="tbtn small" data-act="vlights"><span>💡</span><small>Světla</small></div>
      <div class="tbtn small" data-act="vcam"><span>🎥</span><small>Kamera</small></div>
      <div class="tbtn small" data-act="vexit"><span>🚪</span><small>Vystoupit</small></div>
    </div>
    <div class="tbtn" data-act="venter" id="tEnter" hidden><span>🚗</span><small>Nastoupit</small></div>
    <div id="tTap">Klepni pro hraní</div>`;
  document.body.append(root);
  const rotate = document.createElement('div');
  rotate.id = 'rotate';
  rotate.innerHTML = '<div><div style="font-size:46px">⟳</div>Otoč telefon na šířku</div>';
  document.body.append(rotate);
  $('hint').style.display = 'none';
  const el = (id) => root.querySelector('#' + id);
  const joy = el('tJoy'), knob = el('tKnob');
  const JR = () => joy.offsetWidth / 2; // poloměr joysticku podle velikosti tlačítek
  let joyId = null, joyX = 0, joyY = 0, lookId = null, lookX = 0, lookY = 0, sprint = false;
  const held = new Map(); // id dotyku -> tlačítko
  const key = (code, down) => dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code }));
  const setScale = (s) => document.documentElement.style.setProperty('--tb', `${Math.round(64 * s)}px`);
  setScale(prefNum('btnScale', 1));
  addEventListener('rise-prefs', () => { setScale(prefNum('btnScale', 1)); });
  // Celá obrazovka a natočení na šířku (Android; iPhone celou obrazovku pro stránky nepovoluje)
  const fullscreen = () => {
    if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).then(() => screen.orientation?.lock?.('landscape').catch(() => {}), () => {});
  };
  const nearBench = () => {
    const p = player.pos;
    for (let y = Math.floor(p.y) - 2; y <= Math.floor(p.y) + 2; y++) for (let z = Math.floor(p.z) - 4; z <= Math.floor(p.z) + 4; z++) for (let x = Math.floor(p.x) - 4; x <= Math.floor(p.x) + 4; x++)
      if (blocks.get(bkey(x, y, z)) === 'adv_bench' || blocks.get(bkey(x, y, z)) === 'workbench') return bkey(x, y, z);
    return null;
  };
  function press(b, down) {
    b.classList.toggle('on', down || (b.dataset.toggle === 'sprint' && sprint));
    if (b.dataset.hold) { input[b.dataset.hold] = down; if (down && b.dataset.hold === 'rmb') resetUseCd(); return; }
    if (b.dataset.key) { key(b.dataset.key, down); return; }
    if (!down) return;
    if (b.dataset.toggle === 'sprint') { sprint = !sprint; b.classList.toggle('on', sprint); return; }
    const a = b.dataset.act;
    if (a === 'inv') openInventory();
    else if (a === 'craft') { const k = nearBench(); openInventory(k ? (blocks.get(k) === 'adv_bench' ? 'adv' : 'bench') : 'inv', k); if (!k) toast('Velký recept 3×3 vyrobíš u pracovního stolu'); }
    else if (a === 'drop') dropHeld(false);
    else if (a === 'guide') toggleGuide();
    else if (a === 'view') toggleView(); // z první osoby / zezadu / zepředu
    else if (a === 'chat') openChat();
    else if (a === 'menu') unlockPointer();
    else if (a === 'vexit') exitVehicle();
    else if (a === 'venter' && target?.kind === 'vehicle') enterVehicle(target.id);
    else if (a === 'vhorn') honk();
    else if (a === 'vcam') { toggleCarCam(); player.yaw = 0; }
    else if (a === 'vlights') key('KeyL', true);
  }
  root.addEventListener('touchstart', (e) => {
    e.preventDefault();
    Sound.init();
    if (!isLocked()) { fullscreen(); lockPointer(); return; } // první klepnutí spustí hru
    for (const t of e.changedTouches) {
      const b = t.target.closest?.('.tbtn');
      if (b) { held.set(t.identifier, b); press(b, true); continue; }
      if (t.clientX < innerWidth * 0.42 && joyId === null) {
        joyId = t.identifier; joyX = t.clientX; joyY = t.clientY;
        joy.style.left = `${joyX - JR()}px`; joy.style.top = `${joyY - JR()}px`; joy.style.bottom = 'auto';
        joy.classList.add('on');
      } else if (lookId === null) { lookId = t.identifier; lookX = t.clientX; lookY = t.clientY; }
    }
  }, { passive: false });
  root.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) {
        let dx = t.clientX - joyX, dy = t.clientY - joyY;
        const r = JR(), d = Math.hypot(dx, dy);
        if (d > r) { dx *= r / d; dy *= r / d; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        input.joy = { x: dx / r, y: dy / r };
      } else if (t.identifier === lookId) {
        player.yaw -= (t.clientX - lookX) * 0.0055 * lookSens;
        player.pitch = clamp(player.pitch - (t.clientY - lookY) * 0.0055 * lookSens, -1.5, 1.5);
        lookX = t.clientX; lookY = t.clientY;
      }
    }
  }, { passive: false });
  const end = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) { joyId = null; input.joy = null; knob.style.transform = ''; joy.classList.remove('on'); joy.style.left = joy.style.top = joy.style.bottom = ''; }
      if (t.identifier === lookId) lookId = null;
      const b = held.get(t.identifier);
      if (b) { held.delete(t.identifier); press(b, false); }
    }
  };
  root.addEventListener('touchend', end, { passive: false });
  root.addEventListener('touchcancel', end, { passive: false });
  // Hotbar: klepnutím vybereš políčko
  $('hotbar').addEventListener('touchstart', (e) => {
    e.preventDefault();
    const s = e.target.closest('.slot');
    if (!s) return;
    inv.sel = [...$('hotbar').children].indexOf(s);
    renderHotbar();
  }, { passive: false });
  $('guide').addEventListener('click', () => guideOpen && toggleGuide()); // návod se zavře klepnutím
  const releaseAll = () => {
    for (const [, b] of held) press(b, false);
    held.clear(); joyId = lookId = null; input.joy = null; knob.style.transform = '';
  };
  document.addEventListener('pointerlockchange', () => { if (!isLocked()) releaseAll(); });
  let labelT = 0;
  const label = (b, icon, text) => { const h = `<span>${icon}</span><small>${text}</small>`; if (b.innerHTML !== h) b.innerHTML = h; };
  return {
    update(dt) {
      const ui = invOpen || guideOpen || (MP && (chatOpen || pauseOpen));
      root.classList.toggle('hidden', ui);
      document.body.classList.toggle('inv-open', invOpen);
      root.classList.toggle('paused', !ui && !isLocked());
      if (ui) { if (held.size || input.joy) releaseAll(); return; }
      // Běh (přepínač) a Dolů (jen při létání) sdílejí klávesu Shift
      const flying = (creative && player.flying) || player.flyT > 0;
      el('tDown').hidden = !flying;
      el('tSprint').hidden = flying;
      const wantShift = flying || player.vehicle ? [...held.values()].some((b) => b.id === 'tDown') : sprint;
      if (wantShift) keys.add('ShiftLeft'); else keys.delete('ShiftLeft');
      root.classList.toggle('incar', !!player.vehicle);
      el('tEnter').hidden = !!player.vehicle || target?.kind !== 'vehicle';
      const inPlane = vehicles.get(player.vehicle)?.type === 'plane';
      root.classList.toggle('inplane', inPlane);
      if (inPlane) { label(el('tJump'), '⇧', 'Plyn +'); label(el('tDown'), '⇩', 'Plyn −'); el('tDown').hidden = false; }
      else if (player.vehicle) label(el('tJump'), '■', 'Brzda');
      if ((labelT -= dt) > 0) return;
      labelT = 0.2;
      const s = heldStack(), d = s && ITEMS[s.id];
      label(el('tLmb'), target?.kind === 'mob' ? '⚔' : '⛏', target?.kind === 'mob' ? 'Útok' : 'Těžit');
      if (dining) label(el('tRmb'), '🍴', 'Krájet');
      else if (target?.kind === 'block' && ['workbench', 'campfire', 'chest', 'safe', 'stove', 'table', 'chair', 'well'].includes(target.type)) label(el('tRmb'), '✋', 'Použít');
      else if (d?.food) label(el('tRmb'), '🍖', 'Jíst');
      else if (d?.block) label(el('tRmb'), '🧱', 'Položit');
      else label(el('tRmb'), '✋', 'Použít');
    },
  };
})();

// Inventář na malé obrazovce: celé okno se zmenší tak, aby se vešlo (na šířku vedle sebe).
export function fitInventory() {
  if (!TOUCH || !invOpen) return;
  const w = invEl.querySelector('.mc-window');
  w.style.transform = 'none';
  const r = w.getBoundingClientRect(), k = Math.min(1, (innerWidth - 12) / r.width, (innerHeight - 12) / r.height);
  if (k >= 1) { w.style.transform = ''; return; }
  // zmenšit od levého horního rohu a posunout doprostřed obrazovky
  w.style.transform = `translate(${(innerWidth - r.width * k) / 2 - r.left}px, ${(innerHeight - r.height * k) / 2 - r.top}px) scale(${k})`;
}
addEventListener('resize', fitInventory);
// Klepnutí v inventáři: vzít celý stack / půlku (po jednom) / rychle přesunout – místo pravého tlačítka a Shiftu
let tapMode = 'take';
const TAP_MODES = { take: 'Klepnutí: vzít', half: 'Klepnutí: půlka', move: 'Klepnutí: přesunout' };
export const btnOf = (e) => (TOUCH && tapMode === 'half' ? 2 : e.button);
export const shiftOf = (e) => e.shiftKey || (TOUCH && tapMode === 'move');
if (TOUCH) {
  const foot = invEl.querySelector('.mc-foot');
  foot.querySelector('span').style.display = 'none';
  const tb = document.createElement('button');
  tb.className = 'mc-btn';
  tb.textContent = TAP_MODES[tapMode];
  tb.addEventListener('click', () => { const m = Object.keys(TAP_MODES); tapMode = m[(m.indexOf(tapMode) + 1) % m.length]; tb.textContent = TAP_MODES[tapMode]; });
  const close = document.createElement('button');
  close.className = 'mc-btn';
  close.textContent = '✕ Zavřít';
  close.addEventListener('click', closeInventory);
  foot.prepend(tb);
  foot.append(close);
}

// Nastavení ve hře (tlačítko v inventáři): stejné okno jako v hlavním menu
$('settingsBtn').addEventListener('click', () => {
  window.RiseSettings.open({
    inGame: true,
    restart: !MP, // ve hře pro jednoho jde hra rovnou restartovat s novou grafikou
    onRestart: () => { saveGame(); try { sessionStorage.setItem('rise-autostart', 'sp'); } catch {} setResetting(true); location.reload(); },
  });
});
