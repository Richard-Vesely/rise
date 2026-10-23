// Luk: držením pravého tlačítka se natahuje, puštěním vystřelí šíp. Šíp letí obloukem (gravitace),
// zraní tvora, do kterého narazí (stejná zpráva 'hit' jako úder mečem), ve světě se souboji i hráče (pvp.js),
// a zabodne se do země nebo do bloku,
// kde z něj zbude šíp na zemi (jde sebrat). Šípy vidí jen ten, kdo střílí. Bez vedlejších účinků při načtení.
import { BLOCKS, ITEMS } from '../../../shared/data/index.js';
import { mobs } from '../../../shared/sim/mobs.js';
import { spawnGroundItem } from '../../../shared/sim/ground-items.js';
import { solidAt } from '../../../shared/world/collision.js';
import { solidVox } from '../../../shared/world/voxels.js';
import { toolSound } from '../audio/tool-sounds.js';
import { hitMob } from '../mobs/mobs.js';
import { arrowMesh } from '../render/bow-model.js';
import { sparks } from '../render/particles.js';
import { camera, scene } from '../render/renderer.js';
import { toast } from '../ui/hud.js';
import { wearHeld } from './durability.js';
import { hitPlayer, playerOn } from './pvp.js';
import { offArrows, takeOffArrow } from './offhand.js';
import { countItem, heldStack, removeItem } from './inventory.js';
import { creative, input, player } from './player.js';

const GRAVITY = 15, LIFE = 6, STUCK = 4; // m/s², s letu, s zabodnutý (pak z něj je šíp na zemi)
/** @type {{ mesh: any, pos: any, vel: any, dmg: number, t: number, stuck: number }[]} */
const arrows = [];
let drawT = 0, drawing = false, wasFull = false;

/** Vzdá natahování (přepnutí předmětu; uvolněná myš = otevřené okno nebo pauza, interaction.js). */
export function cancelDraw() { drawing = false; drawT = 0; player.draw = 0; }

/**
 * Natahování a výstřel. Vrací true, když pravé tlačítko patří luku (pak se nemá volat useItem).
 * @param {number} dt
 * @param {{ kind: string, type?: string } | null} target to, na co hráč míří (truhla se otevře i s lukem v ruce)
 */
export function updateBow(dt, target) {
  const s = heldStack(), B = s && ITEMS[s.id].bow;
  if (!B) { if (drawing) cancelDraw(); return false; }
  if (!drawing) {
    if (!input.rmb) return true;
    if (target?.kind === 'block' && BLOCKS[target.type]?.special) return false; // stoly, truhly, pec… se otevřou normálně
    if (!creative && !countItem('arrow') && !offArrows()) { if (!updateBow.told) toast('Nemáš šípy (vyrob je z kamene, klacku a vlákna)'); updateBow.told = true; return true; }
    updateBow.told = false;
    drawing = true; drawT = 0; wasFull = false;
    toolSound('bowDraw');
  }
  if (input.rmb) {
    drawT += dt;
    player.draw = Math.min(1, drawT / B.draw);
    if (player.draw >= 1 && !wasFull) { wasFull = true; toolSound('charged'); }
    return true;
  }
  shoot(B, player.draw);
  cancelDraw();
  return true;
}

function shoot(B, k) {
  if (k < 0.1) return; // jen cuknutí: šíp zůstane v toulci
  if (!creative && !takeOffArrow()) { if (!countItem('arrow')) return; removeItem('arrow', 1); } // nejdřív šípy ze druhé ruky
  const dir = camera.getWorldDirection(camera.position.clone().set(0, 0, 0));
  const pos = camera.position.clone().addScaledVector(dir, 0.4);
  pos.y -= 0.08;
  const speed = B.speed * (0.3 + 0.7 * k);
  const mesh = arrowMesh();
  scene.add(mesh);
  arrows.push({ mesh, pos, vel: dir.multiplyScalar(speed), dmg: Math.max(1, Math.round(B.dmg * k * k)), t: 0, stuck: 0 });
  toolSound('bowShoot', k);
  wearHeld(1);
}

const solid = (x, y, z) => { const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z); return solidAt(X, Y, Z) || solidVox(X, Y, Z); };
/** Tvor, kterého úsečka a→b protne (koule kolem těla tvora). */
function mobOn(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L2 = dx * dx + dy * dy + dz * dz || 1;
  for (const m of mobs) {
    if (m.dead) continue;
    const cx = m.pos.x, cy = m.pos.y + m.def.cy, cz = m.pos.z;
    const t = Math.max(0, Math.min(1, ((cx - a.x) * dx + (cy - a.y) * dy + (cz - a.z) * dz) / L2));
    const ex = a.x + dx * t - cx, ey = a.y + dy * t - cy, ez = a.z + dz * t - cz;
    if (ex * ex + ey * ey + ez * ez < (m.def.radius + 0.1) ** 2) return m;
  }
  return null;
}

/** Let šípů (každý snímek). */
export function updateArrows(dt) {
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    if (a.stuck) {
      if ((a.stuck -= dt) <= 0) { // zabodnutý šíp se změní v šíp na zemi, který jde sebrat
        spawnGroundItem('arrow', 1, a.pos.clone().addScaledVector(a.vel.normalize(), -0.3), a.pos.clone().set(0, 0, 0), 0.3);
        remove(i);
      }
      continue;
    }
    a.t += dt;
    if (a.t > LIFE) { remove(i); continue; }
    // po malých krocích, ať rychlý šíp neproletí tenkou stěnou ani tvorem
    const steps = Math.ceil((a.vel.length() * dt) / 0.25);
    for (let n = 0; n < steps; n++) {
      const h = dt / steps, from = a.pos.clone();
      a.vel.y -= GRAVITY * h;
      a.pos.addScaledVector(a.vel, h);
      const m = mobOn(from, a.pos), pl = !m && playerOn(from, a.pos), yaw = Math.atan2(-a.vel.x, -a.vel.z), charge = Math.min(1, a.dmg / 6);
      if (m || pl) {
        if (m) hitMob(m, a.dmg, yaw, 0.6, { charge }); else hitPlayer(pl, a.dmg, yaw, 0.6, true, charge);
        remove(i);
        break;
      }
      if (solid(a.pos.x, a.pos.y, a.pos.z)) {
        a.pos.copy(from).addScaledVector(a.vel, h * 0.5); // trochu do bloku
        a.stuck = STUCK;
        sparks.emit(a.pos.x, a.pos.y, a.pos.z, [0.8, 0.7, 0.5], 5, 1.5, 0.5);
        toolSound('arrowHit');
        break;
      }
    }
    if (arrows[i] === a) { a.mesh.position.copy(a.pos); a.mesh.lookAt(a.pos.x + a.vel.x, a.pos.y + a.vel.y, a.pos.z + a.vel.z); }
  }
}
function remove(i) { scene.remove(arrows[i].mesh); arrows.splice(i, 1); }
/** Pro testy (window.game): kolik šípů letí nebo je zabodnutých. */
export const arrowCount = () => arrows.length;
