// Peklo v prohlížeči (místo a stavba: shared/world/hell.js, data: shared/data/hell.js).
//   Portál do pekla (pravé tl.) → okno s varováním → hráč se objeví v pekle.
//   Oltář u sochy Marka boha všemohoucího (pravé tl.) → okno s výkupným: 3 hudební disky, 24 ohnivých drahokamů
//   a kbelík lávy. Věci zmizí (nikdo je nedostane) a hráč jde domů na spawn.
//   Láva pálí (celá ohnivá sada brnění chrání), prázdný kbelík u lávy = kbelík lávy, nad sochou svítí nápis.
// sendToHell() je připravené pro Richarda (třeba pro tresty); samo ho nic nevolá. Bez vedlejších účinků při načtení.
import * as THREE from 'three';
import { HELL_PRICE, ITEMS } from '../../../shared/data/index.js';
import { ALTAR, HELL, HELL_SPOT, hellBuilt, inHell } from '../../../shared/world/hell.js';
import { bkey, blocks } from '../../../shared/world/state.js';
import { Sound } from '../audio/sound.js';
import { game } from '../game/debug.js';
import { countItem, inv, removeItem } from '../player/inventory.js';
import { keys, lockPointer, player, unlockPointer } from '../player/player.js';
import { rebuildForest } from '../render/forest.js';
import { sparks } from '../render/particles.js';
import { scene } from '../render/renderer.js';
import { updateEnvironment } from '../render/sky.js';
import { toast } from '../ui/hud.js';
import { fullSet, refreshUI } from '../ui/inventory-ui.js';

const HOME = [1.5, 0.95, 15.5]; // spawn (stejný jako ve welcome)
const discsHave = () => inv.slots.reduce((n, s) => n + (s && ITEMS[s.id]?.disc ? s.n : 0), 0);

function moveTo([x, y, z], yaw) {
  player.pos.set(x, y, z);
  player.vel.set(0, 0, 0);
  player.yaw = yaw;
  keys.clear();
  rebuildForest(x, z, true);
  updateEnvironment();
  sparks.emit(x, y + 1, z, [1, 0.4, 0.1], 30, 3, 2);
}

/** Pošle hráče u obrazovky do pekla bez ptaní (pro Richarda: třeba tresty). */
export function sendToHell() {
  if (!hellBuilt()) { toast('Peklo se ještě staví, zkus to za chvíli'); return false; }
  moveTo(HELL_SPOT, 0);
  Sound.burst({ buf: Sound.brown, dur: 2.5, f0: 300, f1: 40, q: 0.6, vol: 0.6, type: 'lowpass', vary: 0 });
  toast('Jsi v pekle! Ven se dostaneš jen přes oltář u sochy Marka boha všemohoucího.');
  return true;
}

let win = null;
const onKey = (e) => { if (win && (e.code === 'Escape' || e.code === 'KeyE')) { e.stopImmediatePropagation(); e.preventDefault(); closeWin(); } };
function closeWin(relock = true) { win?.remove(); win = null; removeEventListener('keydown', onKey, true); if (relock) lockPointer(); }
function openWin(html, onClick) {
  if (win) closeWin(false);
  unlockPointer();
  win = document.createElement('div');
  win.id = 'hellWin';
  win.innerHTML = `<div class="mc-panel hell-panel">${html}</div>`;
  document.body.append(win);
  addEventListener('keydown', onKey, true);
  win.addEventListener('click', (e) => { if (e.target === win) closeWin(); else onClick(e); });
}

/** Pravé tlačítko na portál do pekla: varování, pak dovnitř. */
export function usePortal() {
  openWin(`<div class="mc-title">🔥 Portál do pekla</div>
    <p>V pekle jsou ďáblové, láva a vzácné ohnivé drahokamy. <b>Ven se dostaneš jen přes oltář</b> u sochy Marka boha všemohoucího:
    odevzdáš ${HELL_PRICE.discs} hudební disky, ${HELL_PRICE.fire_gem} ohnivých drahokamů a kbelík lávy.</p>
    <div class="hell-btns"><button class="mc-btn" data-go>Vstoupit do pekla</button><button class="mc-btn" data-no>Zpět</button></div>`, (e) => {
    if (e.target.closest('[data-no]')) closeWin();
    if (e.target.closest('[data-go]')) { closeWin(); sendToHell(); }
  });
}

/** Pravé tlačítko na oltář: výkupné a cesta domů. */
export function useAltar() {
  const have = { discs: discsHave(), fire_gem: countItem('fire_gem'), lava_bucket: countItem('lava_bucket') };
  const ok = Object.entries(HELL_PRICE).every(([k, n]) => have[k] >= n);
  const row = (k, name) => `<li class="${have[k] >= HELL_PRICE[k] ? 'ok' : ''}">${name}: ${Math.min(have[k], HELL_PRICE[k])} / ${HELL_PRICE[k]}</li>`;
  openWin(`<div class="mc-title">⛧ MAREK – BŮH VŠEMOHOUCÍ ⛧</div>
    <p>Chceš domů? Odevzdej oltáři:</p>
    <ul class="hell-price">${row('discs', 'Hudební disky (jakékoli)')}${row('fire_gem', 'Ohnivé drahokamy')}${row('lava_bucket', 'Kbelík lávy')}</ul>
    <p class="mc-note">Odevzdané věci zmizí, nikdo je nedostane. Ohnivé drahokamy jsou vzácné: ohnivá ruda ve sloupech a občas z ďáblů. Lávu nabereš prázdným kbelíkem.</p>
    <div class="hell-btns"><button class="mc-btn" data-pay ${ok ? '' : 'disabled'}>Odevzdat a jít domů</button><button class="mc-btn" data-no>Zavřít</button></div>`, (e) => {
    if (e.target.closest('[data-no]')) closeWin();
    if (!e.target.closest('[data-pay]') || !ok) return;
    let d = HELL_PRICE.discs;
    for (const s of inv.slots) { if (!d) break; if (s && ITEMS[s.id]?.disc) { const k = Math.min(d, s.n); removeItem(s.id, k); d -= k; } }
    removeItem('fire_gem', HELL_PRICE.fire_gem);
    removeItem('lava_bucket', HELL_PRICE.lava_bucket);
    refreshUI();
    closeWin();
    moveTo(HOME, Math.PI);
    Sound.portal?.();
    toast('Oltář přijal výkupné. Jsi doma!');
  });
}

// ---------- každý snímek: láva pálí, nad sochou svítí nápis
let sign = null, burnT = 0;
function makeSign() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(20, 4, 4, 0.75)'; g.fillRect(0, 0, 512, 160);
  g.strokeStyle = '#ffb040'; g.lineWidth = 6; g.strokeRect(6, 6, 500, 148);
  g.fillStyle = '#ffd060'; g.textAlign = 'center';
  g.font = 'bold 64px serif'; g.fillText('MAREK', 256, 72);
  g.font = 'bold 36px serif'; g.fillText('BŮH VŠEMOHOUCÍ', 256, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false }));
  s.scale.set(6, 1.9, 1);
  s.position.set(ALTAR[0] + 0.5, HELL.y + 11.2, ALTAR[2] - 1.5);
  return s;
}
export function updateHell(dt) {
  const p = player.pos, here = inHell(p.x, p.y, p.z);
  if (here && !sign) { sign = makeSign(); scene.add(sign); }
  if (sign) sign.visible = here;
  if (!here || !player.alive) return;
  const inLava = ['', 0.5].some((h) => blocks.get(bkey(Math.floor(p.x), Math.floor(p.y + (h || 0.1)), Math.floor(p.z))) === 'hell_lava');
  if (!inLava || fullSet() === 'fire') return;
  if ((burnT -= dt) > 0) return;
  burnT = 0.5;
  game.damagePlayer?.(6, 0, 0);
  sparks.emit(p.x, p.y + 0.3, p.z, [1, 0.5, 0.1], 12, 2, 2);
  toast('Láva pálí! (celá ohnivá sada brnění tě ochrání)');
}
