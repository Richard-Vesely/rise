// Teleport duchem (bonus pro dárce 'teleport', player/bonus.js). X = duch vyletí z těla a letí rychle a skrz bloky
// (tělo zůstane stát; ostatní hráči vidí jen tělo, poloha ducha se nikam neposílá). X znovu = hráč se přenese tam, kde
// je duch (ve zdi nebo v zemi o kus výš, kde je místo). Shift+X = duch se vrátí do těla bez přenesení.
// Zranění, smrt nebo konec bonusu vrátí ducha do těla. Modul nic nespouští při načtení (jen funkce).
import * as THREE from 'three';
import { GHOST } from '../../../shared/data/bonus.js';
import { clamp } from '../../../shared/util.js';
import { EYE } from '../../../shared/world/constants.js';
import { VMIN } from '../../../shared/world/voxels.js';
import { Sound } from '../audio/sound.js';
import { camera } from '../render/renderer.js';
import { toast } from '../ui/hud.js';
import { teleport } from '../world/shrine.js';
import { hasPerk } from './bonus.js';
import { collidesBlocks, keys, player } from './player.js';

/** on = hráč je duch; pos = kde je duch (oči). */
export const ghost = { on: false, pos: new THREE.Vector3() };
const TOP = 400; // výš duch nevyletí

// Průsvitný modrý okraj obrazovky, dokud je hráč duch (vytvoří se až poprvé).
let veil = null;
function setVeil(on) {
  if (!veil && on) {
    veil = document.createElement('div');
    veil.id = 'ghost-veil';
    Object.assign(veil.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '4', opacity: '0', transition: 'opacity .25s',
      background: 'radial-gradient(ellipse at center, rgba(190,225,255,0) 40%, rgba(150,200,255,.5) 100%)' });
    document.body.appendChild(veil);
  }
  if (veil) veil.style.opacity = on ? '1' : '0';
}

/** Klávesa X. Vrací true, když ji zpracoval (bez bonusu false: X nic nedělá). */
export function toggleGhost(back = false) {
  if (ghost.on) { if (back) endGhost('Duch je zpátky v těle'); else land(); return true; }
  if (!hasPerk('teleport')) return false;
  if (!player.alive || player.vehicle || player.riding || player.sitting) { toast('Teď duch ven nemůže'); return true; }
  ghost.on = true;
  ghost.pos.set(player.pos.x, player.pos.y + EYE, player.pos.z);
  player.vel.set(0, 0, 0);
  setVeil(true);
  Sound.ui?.('open');
  toast('👻 Duch: Mezerník nahoru, Shift dolů, Ctrl rychleji · X = přenést se sem · Shift+X = zpátky do těla');
  return true;
}

/** Duch se vrátí do těla (bez přenesení). */
export function endGhost(msg) {
  if (!ghost.on) return;
  ghost.on = false;
  setVeil(false);
  if (msg) toast(msg);
}

// Přenesení: tělo jde tam, kde je duch.
function land() {
  const p = { x: ghost.pos.x, y: Math.max(VMIN + 1, ghost.pos.y - EYE), z: ghost.pos.z };
  for (let i = 0; i < 96 && collidesBlocks(p); i++) p.y = Math.floor(p.y) + 1; // ve zdi nebo v zemi: nahoru, kde je místo
  const { yaw, pitch } = player;
  endGhost();
  teleport(p.x, p.z); // záblesk, les a okolí kolem nového místa (world/shrine.js)
  player.pos.y = p.y;
  player.yaw = yaw;
  player.pitch = pitch;
  toast('✨ Přenesen(a)!');
}

/** Každý snímek, dokud je hráč duch (místo updatePlayer): let ducha a kamera. */
export function updateGhost(dt) {
  if (!hasPerk('teleport') || !player.alive) { endGhost(); return 0; }
  let f = 0, s = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
  const up = (keys.has('Space') ? 1 : 0) - (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1 : 0);
  const step = (keys.has('ControlLeft') || keys.has('ControlRight') ? GHOST.fast : GHOST.speed) * dt;
  const len = Math.max(1, Math.hypot(f, s));
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw), cp = Math.cos(player.pitch);
  // dopředu tam, kam se hráč dívá (i nahoru a dolů), do stran vodorovně
  ghost.pos.x += ((s * cos - f * sin * cp) / len) * step;
  ghost.pos.z += ((-s * sin - f * cos * cp) / len) * step;
  ghost.pos.y = clamp(ghost.pos.y + ((f * Math.sin(player.pitch)) / len + up) * step, VMIN, TOP);
  camera.position.copy(ghost.pos);
  camera.rotation.set(player.pitch, player.yaw, 0);
  return 0;
}
