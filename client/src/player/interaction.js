// Těžba, útok, pokládání a použití předmětů.
import './targeting.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { BLOCKS, CROPS, ITEMS } from '../../../shared/data/index.js';
import { NET } from '../../../shared/net/net.js';
import { others } from '../../../shared/net/room.js';
import { randInt } from '../../../shared/util.js';
import { BREAK_PAUSE, INSTANT, attackCharge, attackResult, attackSpeed, breakTime, lacksTool, useCost } from '../../../shared/tools.js';
import { solidAt } from '../../../shared/world/collision.js';
import { nearPond, waterAt } from '../../../shared/world/nature.js';
import { bkey, blockMeta, blocks, chairRot, chests, crops, fires, furnaces, pcDisks, power, removed, ruinsOpened, spawners, stoves, tableItems, vehicles } from '../../../shared/world/state.js';
import { structuresNear } from '../../../shared/world/structures.js';
import { torchPlacement } from '../../../shared/world/torch.js';
import { biomeAt, forest } from '../../../shared/world/terrain.js';
import { V, VOX, columnDug, getVox, setVox, topY } from '../../../shared/world/voxels.js';
import { blockMaterial, targetMaterial, voxMaterial } from '../audio/materials.js';
import { Sound } from '../audio/sound.js';
import { toolSound } from '../audio/tool-sounds.js';
import { MP } from '../game/boot.js';
import { harvestCrop } from '../machines/kitchen.js';
import { toggleSwitch } from '../machines/power.js';
import { hitMob } from '../mobs/mobs.js';
import { openPC } from '../pc/computer.js';
import { dropSpotsAt, takeSpot, useDocs, withPaper } from '../pc/papers-world.js';
import { blockMat, rebuildBlocks } from '../render/blocks.js';
import { breakCount, emitChips, paletteOf } from '../render/chips.js';
import { crackHit, crackable, showCracks } from '../render/crack.js';
import { rebuildForest } from '../render/forest.js';
import { cutGrass } from '../render/grass.js';
import { startSwing } from '../render/held-item.js';
import { debris, sparks } from '../render/particles.js';
import { camera, scene } from '../render/renderer.js';
import { $ } from '../ui/dom.js';
import { toast } from '../ui/hud.js';
import { openInventory, renderHotbar } from '../ui/inventory-ui.js';
import { carHits, floorAt, myDriverId, spawnVehicle, vehDim } from '../vehicles/car.js';
import { boatSpot } from '../vehicles/boat.js'; // (po car.js: načte se v jeho pořadí)
import { isBoat } from '../vehicles/kinds.js';
import { planeSpot, seaplaneSpot } from '../vehicles/plane.js';
import { useRod } from '../world/fishing.js';
import { dropper } from '../world/ground-items.js';
import { usePortal } from '../world/shrine.js';
import { placedAny } from '../world/world-state.js';
import { cancelDraw, updateArrows, updateBow } from './bow.js';
import { hitPlayer } from './pvp.js';
import { sitOn, startEating, useTable } from './eating.js';
import { hitKick, hitStop } from './camera-feel.js';
import { wearHeld } from './durability.js';
import { addItem, addStack, consumeSelected, heldStack, inv } from './inventory.js';
import { creative, input, isLocked, player, playerIntersects } from './player.js';
import { pickTarget } from './targeting.js';

// ============================================================ těžba, útok, pokládání
export const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 }));
outline.visible = false;
scene.add(outline);
// Kroužek na zemi = kam míříš; průhledná kostka = kam se položí blok.
export const groundRing = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.28, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, fog: false }));
groundRing.visible = false;
scene.add(groundRing);
export const preview = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }));
preview.visible = false;
scene.add(preview);
export let target = null, swingCd = 0, useCd = 0;
export function clearTarget() { target = null; }
export function resetUseCd() { useCd = 0; }
// Kam se položí blok: k zasažené stěně, na povrch terénu nebo na podlahu svatyně.
function placementCell(t) {
  if (!t) return null;
  if (t.surface || t.kind === 'grass' || t.kind === 'ground') { const [x, y, z] = t.point; return [Math.floor(x), Math.floor(y + 0.2), Math.floor(z)]; }
  if (t.kind === 'block' || t.kind === 'vox') return t.cell.map((v, i) => v + t.normal[i]);
  return null;
}
// Je buňka volná pro nový blok? (nic tam není položené ani to není plná zemina pod povrchem)
export function cellFree(x, y, z) {
  if (blocks.has(bkey(x, y, z))) return false;
  const top = topY(x, z);
  if (y > top) return true;
  if (y === top && !columnDug(x, z)) return true; // horní blok je schovaný pod terénem
  return getVox(x, y, z, top) === V.AIR;
}
const mining = { key: null, p: 0, tick: 0, pause: 0, time: 1 };
// Zvuk z místa, kde se těží nebo staví (do 5 m plná hlasitost, jen směr zleva / zprava)
const sfxAt = (pt, fn) => (pt ? Sound.at(pt[0], pt[1], pt[2], fn, { ref: 5 }) : fn());
const CHIP = { tree: [0.42, 0.3, 0.17], rock: [0.5, 0.5, 0.48], iron: [0.65, 0.35, 0.15], grass: [0.25, 0.5, 0.12], planks: [0.6, 0.45, 0.28], cobble: [0.5, 0.5, 0.48], bricks: [0.55, 0.52, 0.48], dirt: [0.42, 0.3, 0.2] };
const shade = (c, k) => c.map((v) => Math.min(1, v * k));
// Barvy úlomků cíle: z textury bloku, z barvy podzemního bloku, kůra stromu…
function chipColors(t) {
  if (t.kind === 'vox') { const c = VOX[t.vox].chip; return [c, shade(c, 0.75), shade(c, 1.2)]; }
  if (t.kind === 'block') {
    const m = blockMat(t.type), base = CHIP[t.type] || CHIP.planks;
    const pal = paletteOf('block:' + t.type, m?.map?.image, base);
    if (!m?.color || m.color.getHex() === 0xffffff) return pal;
    const tint = m.color.clone().convertLinearToSRGB();
    return pal.map((c) => [c[0] * tint.r, c[1] * tint.g, c[2] * tint.b]);
  }
  if (t.kind === 'tree') return t.tree.mark ? [[0.3, 0.45, 0.75], [0.2, 0.3, 0.55]] : [CHIP.tree, shade(CHIP.tree, 0.7), [0.55, 0.42, 0.28]];
  if (t.kind === 'rock') return t.rock.iron ? [CHIP.iron, CHIP.rock, shade(CHIP.rock, 0.7)] : [CHIP.rock, shade(CHIP.rock, 0.75), shade(CHIP.rock, 1.2)];
  if (t.kind === 'grass') return [[0.2, 0.36, 0.1], [0.27, 0.42, 0.13], [0.16, 0.29, 0.08]];
  if (t.kind === 'vehicle') return [[0.75, 0.15, 0.12], [0.3, 0.3, 0.32], [0.7, 0.72, 0.75]];
  return [CHIP.planks];
}
const hitPoint = (t) => t.point || t.at || (t.cell ? t.cell.map((v) => v + 0.5) : [player.pos.x, player.pos.y, player.pos.z]);
// Každých 0,2 s při těžbě: drobky z místa úderu a úder podle materiálu (audio/sfx.js; u stromu občas spadne list)
function mineTick(t, heldId) {
  const at = hitPoint(t), n = t.normal || [0, 1, 0];
  const out = [at[0] + n[0] * 0.06, at[1] + n[1] * 0.06, at[2] + n[2] * 0.06], cols = chipColors(t);
  // Hytale: každý úder vyrazí hrst kostiček materiálu a obláček prachu a blok sebou cukne
  emitChips(out, cols, 3 + ((Math.random() * 3) | 0), { speed: 1.6, up: 2, size: [0.045, 0.1], life: [0.35, 0.9], spread: 0.1, dir: n.map((v) => v * 0.8) });
  debris.emit(...out, dust(cols), 3, 0.5, 0.4);
  crackHit();
  sfxAt(t.at || at, () => Sound.blockHit(targetMaterial(t), ITEMS[heldId]?.tool));
  if (t.kind === 'tree' && !t.tree.mark && Math.random() < 0.6) debris.emit(t.tree.x + (Math.random() - 0.5) * 2, t.tree.y + t.tree.trunkH, t.tree.z + (Math.random() - 0.5) * 2, [0.22, 0.45, 0.12], 2, 0.6, 0.2);
}
// Rozbití: hromada úlomků (64 na vysoké grafice, 16 na nízké); zvuk materiálu hraje každá větev breakTarget
function breakFx(t, at) {
  if (t.kind === 'grass') emitChips(at, chipColors(t), Math.ceil(breakCount() / 4), { speed: 1.4, up: 2, size: [0.025, 0.045], life: [0.3, 0.8], spread: 0.3 }); // jen pár stébel
  else {
    const cols = chipColors(t);
    emitChips(at, cols, breakCount(), { speed: 2.4, up: 2.4, spread: t.kind === 'tree' ? 0.6 : 0.45 });
    emitChips(at, cols, 5 + ((Math.random() * 3) | 0), { speed: 2, up: 3, size: [0.13, 0.22], life: [1.2, 2], spread: 0.3 }); // velké kusy, poskočí a chvíli leží
    debris.emit(at[0], at[1], at[2], dust(cols), 14, 1.4, 0.9); // obláček prachu
  }
}
// Prach: barva materiálu, zesvětlená do šeda
const dust = (cols) => { const c = Array.isArray(cols?.[0]) ? cols[0] : [0.6, 0.55, 0.5]; return c.map((v) => v * 0.55 + 0.35); };

// Útok: nabití úderu roste od posledního máchnutí (proužek pod zaměřovačem).
let atkSince = 9, prevLmb = false, wasCharged = true;
export let atkCharge = 1;
// Úder tvora, nebo ve světě se souboji jiného hráče (target.kind 'player', pvp.js)
function attackMob(t, heldId) {
  const charge = atkCharge;
  const r = attackResult(heldId, charge, { falling: player.vel.y < -0.5, onGround: player.onGround, sprinting: player.sprinting });
  atkSince = 0;
  wasCharged = false;
  startSwing(0.28, charge);
  const hit = t.kind === 'player' ? hitPlayer(t.player, r.dmg, player.yaw, r.kb, false, charge) : hitMob(t.mob, r.dmg, player.yaw, r.kb, { crit: r.crit, charge });
  if (!hit) { toolSound('whoosh', charge * 0.5); return; } // tvor je ještě chvíli nezranitelný
  wearHeld(useCost(heldId, 'hit'));
  hitKick(0.35 + 0.65 * charge);
  if (charge > 0.9) hitStop(r.crit ? 0.07 : 0.045);
}
// Proužek nabití úderu pod zaměřovačem
function renderAttackMeter(aimMob) {
  const el = $('atkMeter');
  if (!el) return;
  el.classList.toggle('show', atkCharge < 1 || aimMob);
  el.classList.toggle('full', atkCharge >= 1);
  el.firstChild.style.width = `${(atkCharge * 100).toFixed(1)}%`;
}

// Uvolněná myš (inventář, pauza): rozpracované natahování luku se zruší, ať po návratu nevystřelí samo.
document.addEventListener('pointerlockchange', () => { if (!isLocked()) cancelDraw(); });
export function updateInteraction(dt) {
  target = withPaper(pickTarget()); // papíry a rámečky ve světě (14e)
  const held = heldStack(), heldId = held?.id ?? null;
  let warn = '';
  const boxCell = target?.kind === 'block' || (target?.kind === 'vox' && !target.surface) ? target.cell : null;
  outline.visible = !!boxCell;
  if (boxCell) outline.position.set(boxCell[0] + 0.5, boxCell[1] + 0.5, boxCell[2] + 0.5);
  groundRing.visible = !!target?.point && (target.kind === 'ground' || target.kind === 'grass' || !!target.surface);
  if (groundRing.visible) {
    groundRing.position.set(target.point[0], target.point[1] + 0.04, target.point[2]);
    groundRing.material.color.set(target.breakable === false ? 0x999999 : target.kind === 'grass' ? 0xffffff : 0xffd27a);
  }
  const cell = held && ITEMS[held.id].block ? placementCell(target) : null;
  preview.visible = !!cell && cellFree(...cell);
  if (preview.visible) preview.position.set(cell[0] + 0.5, cell[1] + 0.5, cell[2] + 0.5);

  swingCd -= dt;
  useCd -= dt;
  mining.pause -= dt;
  atkSince += dt;
  atkCharge = attackCharge(atkSince, heldId);
  if (atkCharge >= 1 && !wasCharged) { wasCharged = true; if (ITEMS[heldId]?.tool === 'sword' || ITEMS[heldId]?.tool === 'axe') toolSound('charged'); }
  const fresh = input.lmb && !prevLmb;
  prevLmb = input.lmb;
  const foe = target?.kind === 'mob' || target?.kind === 'player';
  if (input.lmb && foe) {
    // klik = úder hned (slabší, když není nabitý), držení = úder vždy, když se nabije
    if ((fresh && atkSince > 0.1) || atkCharge >= 1) attackMob(target, heldId);
    mining.key = null;
    mining.p = 0;
  } else if (creative && input.lmb && target && !foe && target.breakable !== false) {
    if (swingCd <= 0) { startSwing(0.2); swingCd = 0.2; breakTarget(target); }
    mining.key = null;
    mining.p = 0;
  } else if (input.lmb && target && !foe && target.breakable !== false) {
    if (mining.key !== target.key) { mining.key = target.key; mining.p = 0; mining.tick = 0; }
    if (lacksTool(target.req, heldId)) {
      warn = `Potřebuješ ${target.reqName || (target.req.tier > 1 ? 'kamenný krumpáč' : 'krumpáč')}`;
      mining.p = 0;
      if (swingCd <= 0) { startSwing(0.3, 0.6); swingCd = 0.4; sfxAt(target.at, () => Sound.denied()); emitChips(hitPoint(target), chipColors(target), 1, { speed: 0.8, up: 1, size: [0.03, 0.05], life: [0.2, 0.4] }); }
    } else if (mining.pause <= 0) {
      const flying = (creative && player.flying) || player.flyT > 0;
      const eye = camera.position;
      mining.time = breakTime(target, heldId, { underwater: waterAt(eye.x, eye.y, eye.z) !== null, airborne: !player.onGround && !flying });
      mining.p += dt / mining.time;
      if (swingCd <= 0) { startSwing(0.26); swingCd = 0.26; } // ruka máchá pořád dokola
      if ((mining.tick -= dt) <= 0) { mining.tick = 0.2; mineTick(target, heldId); }
      if (mining.p >= 1) {
        const t = target, instant = mining.time <= INSTANT;
        breakTarget(t);
        wearHeld(useCost(heldId, 'mine', { tool: t.tool, instant }));
        mining.key = null;
        mining.p = 0;
        if (!instant) mining.pause = BREAK_PAUSE; // krátká pauza před dalším blokem
      }
    }
  } else {
    if (input.lmb && swingCd <= 0) { // máchnutí do vzduchu
      startSwing(0.3, atkCharge);
      toolSound('whoosh', atkCharge);
      swingCd = Math.max(0.25, 1 / attackSpeed(heldId));
      atkSince = 0;
      wasCharged = false;
    }
    mining.key = null;
    mining.p = 0;
  }
  updateArrows(dt);
  if (updateBow(dt, target)) { /* luk v ruce: pravé tlačítko natahuje (bow.js) */ }
  else {
    if (input.rmb && useCd <= 0) { useCd = ITEMS[heldStack()?.id]?.block ? 0.15 : 0.25; useItem(); }
    if (input.rmb) pillarPlace();
  }

  const label = $('targetLabel');
  label.innerHTML = warn ? `<span class="warn">${warn}</span>` : target ? `${target.name}${target.hint ? `<small>${target.hint}</small>` : ''}` : '';
  showCracks(mining.key ? target : null, mining.p);
  const pr = $('progress'), ring = mining.p > 0 && !crackable(target);
  pr.style.opacity = ring ? 1 : 0;
  if (ring) pr.style.background = `conic-gradient(rgba(140,240,255,0.95) ${mining.p * 360}deg, rgba(255,255,255,0.14) 0deg)`;
  renderAttackMeter(foe);
}
/** Stav těžby a útoku (pro testy a ladění). */
export const mineState = () => ({ key: mining.key, p: mining.p, time: mining.time, pause: Math.max(0, mining.pause), charge: atkCharge });

// Co padá ze stromů v biomech: [předmět, min, max]
const TREE_DROPS = {
  cherry: [['cherry_log', 3, 5], ['cherries', 0, 3], ['stick', 0, 2]], jungle: [['jungle_log', 5, 8], ['banana', 0, 3], ['resin', 0, 2]], acacia: [['acacia_log', 3, 5], ['stick', 0, 2]],
  spruce: [['log', 4, 6], ['snowball', 0, 2], ['resin', 0, 1]], dead: [['stick', 3, 6]], deadbush: [['stick', 1, 3]], cactus: [['cactus', 1, 3]], mushroom: [['mushroom_block', 2, 4], ['mushroom', 1, 3]],
};
// Co vytěžíš, vyskočí jako předmět (dropper v world/ground-items.js) a magnet ho k tobě přitáhne.
export function breakTarget(t) {
  if (t.kind === 'tree') {
    removed.add(t.key);
    const tr = t.tree;
    const { drop } = dropper(...(t.at || [tr.x, tr.y + 1, tr.z]));
    const drops = !tr.mark && TREE_DROPS[tr.kind];
    if (drops) { for (const [id, a, b] of drops) { const n = randInt(a, b); if (n > 0) drop(id, n); } }
    else {
      drop(tr.mark ? 'markwood' : 'log', (tr.pine ? 4 : 3) + randInt(0, 2));
      if (Math.random() < 0.4) drop('stick', randInt(1, 3));
      if (tr.pine && Math.random() < 0.45) drop('resin', 1); // smrky pouštějí pryskyřici
      if (!tr.pine && !tr.mark && Math.random() < 0.45) drop('apple', randInt(1, 3)); // jabloně
    }
    debris.emit(tr.x, tr.y + tr.trunkH, tr.z, [0.2, 0.45, 0.12], 60, 5, 2);
    breakFx(t, t.at || [tr.x, tr.y + 1, tr.z]);
    sfxAt(t.at, () => { Sound.blockBreak(targetMaterial(t)); Sound.crack(); });
    Sound.at(tr.x, tr.y + tr.trunkH, tr.z, () => Sound.mat('leaves', 'break', 1.4), { ref: 5 }); // padající koruna
    rebuildForest(player.pos.x, player.pos.z, true);
  } else if (t.kind === 'paper') takeSpot(t.id);
  else if (t.kind === 'vehicle') { // rozebrané auto se vrátí do batohu i s kufrem a baterií
    const v = vehicles.get(t.id);
    if (!v) return;
    if (v.driver && v.driver !== myDriverId()) { toast(`${vehDim(v.type).name}: někdo v něm sedí`); return; }
    for (const s of v.slots) if (s) addStack(s, false);
    addItem(vehDim(v.type).item, 1);
    vehicles.delete(t.id);
    breakFx(t, t.at || [v.x, v.y + 0.6, v.z]);
    sfxAt(t.at, () => { Sound.blockBreak('metal'); Sound.crack(); });
  } else if (t.kind === 'rock') {
    removed.add(t.key);
    const r = t.rock, { drop } = dropper(r.x, r.y + 0.4, r.z);
    if (r.iron) { drop('iron_ore', randInt(2, 3)); drop('stone', 1); }
    else drop('stone', 2 + Math.floor(r.s * 3));
    if (Math.random() < 0.3) drop('salt', randInt(1, 2)); // solné krystalky v kameni
    breakFx(t, [r.x, r.y + 0.3, r.z]);
    sfxAt(t.at, () => { Sound.blockBreak('stone'); Sound.crack(); });
    rebuildForest(player.pos.x, player.pos.z, true);
  } else if (t.kind === 'block') {
    const k = bkey(...t.cell);
    if (MP && [...others.values()].some((P) => P.pose?.ui === k)) { toast('Tohle teď používá jiný hráč'); return; } // otevřená truhla nebo stroj
    blocks.delete(k);
    blockMeta.delete(k);
    const { drop, contents } = dropper(t.cell[0] + 0.5, t.cell[1] + 0.5, t.cell[2] + 0.5);
    if (CROPS[t.type]) harvestCrop(t.type, k, drop);
    if (BLOCKS[t.type].drop) drop(BLOCKS[t.type].drop, 1);
    if (tableItems.has(k)) { const t = tableItems.get(k); if (t.food) contents({ id: t.food, n: 1 }); if (t.cutlery) contents({ id: 'cutlery', n: 1 }); tableItems.delete(k); }
    chairRot.delete(k);
    if (player.sitting === k) player.sitting = null;
    if (stoves.has(k)) { const st = stoves.get(k); if (st.slots[0]) contents(st.slots[0]); stoves.delete(k); }
    spawners.delete(k);
    for (const store of [fires.get(k)?.slots, chests.get(k), furnaces.get(k)?.slots, power.get(k)?.slots]) if (store) for (const s of store) if (s) contents(s);
    fires.delete(k);
    power.delete(k);
    pcDisks.delete(k); // rozebraný počítač přijde o uložené dokumenty
    dropSpotsAt(...t.cell); // papíry na bloku spadnou do batohu
    furnaces.delete(k);
    chests.delete(k);
    breakFx(t, t.at);
    sfxAt(t.at, () => Sound.blockBreak(blockMaterial(t.type)));
    rebuildBlocks();
  } else if (t.kind === 'grass') {
    const [gx, gy, gz] = t.point, r = Math.random(), { drop } = dropper(gx, gy + 0.25, gz);
    drop('fiber', randInt(1, 2));
    // V trávě rostou i divoké plodiny: semínka, rajčata, brambory a v lese houby.
    if (r < 0.15) drop('berries', 1);
    else if (r < 0.4) drop('wheat_seeds', 1);
    else if (r < 0.47) drop('tomato_seeds', 1);
    else if (r < 0.52) drop('potato', 1);
    if (forest(gx, gz) > 0.5 && Math.random() < 0.15) drop('mushroom', 1);
    if (Math.random() < (nearPond(gx, gz) ? 0.3 : 0.03)) drop('rice', 1); // divoká rýže roste u vody
    // Květiny a houby podle biomu
    const bio = biomeAt(gx, gz);
    if (Math.random() < (bio === 'cherry' ? 0.15 : 0.04)) drop('red_flower', 1);
    if ((bio === 'meadow' || bio === 'savanna') && Math.random() < 0.08) drop('yellow_flower', 1);
    if (bio === 'jungle' && Math.random() < 0.12) drop('blue_flower', 1);
    if (bio === 'mushroom') { if (Math.random() < 0.18) drop('glowshroom', 1); if (Math.random() < 0.3) drop('mushroom', 1); }
    cutGrass(t.point[0], t.point[2]);
    debris.emit(...t.point, CHIP.grass, 12, 2, 2.5);
    breakFx(t, t.point);
    sfxAt(t.point, () => Sound.blockBreak('grass'));
  } else if (t.kind === 'vox') {
    const [x, y, z] = t.cell, def = VOX[t.vox], { drop } = dropper(x + 0.5, y + 0.5, z + 0.5);
    setVox(x, y, z, V.AIR);
    const [id, a, b] = def.drop;
    drop(id, randInt(a, b));
    if (t.vox === V.STONE && Math.random() < 0.08) drop('salt', 1);
    if (t.vox === V.DIRT && nearPond(x + 0.5, z + 0.5, 4) && Math.random() < 0.4) drop('clay', randInt(1, 2)); // jíl u rybníka
    if (t.surface) cutGrass(x + 0.5, z + 0.5, 1.2);
    dropSpotsAt(x, y, z);
    if (t.surface) dropSpotsAt(x, y + 1, z);
    breakFx(t, [x + 0.5, y + 0.5, z + 0.5]);
    if (def.glow) { sparks.emit(x + 0.5, y + 0.5, z + 0.5, def.chip, 50, 4, 2); Sound.pickup(); }
    sfxAt([x + 0.5, y + 0.5, z + 0.5], () => Sound.blockBreak(voxMaterial(t.vox)));
  }
}

export function useItem() {
  if (useDocs()) return; // dokumenty: číst, položit, pověsit, zarámovat, předat
  // Auto: s kanystrem natankuje, jinak otevře kufr
  if (target?.kind === 'vehicle') {
    const v = vehicles.get(target.id);
    if (!v) return;
    if (heldStack()?.id === 'fuel_canister' && vehDim(v.type).fuelMax) {
      const fmax = vehDim(v.type).fuelMax;
      if (v.fuel >= fmax - 0.5) { toast('Nádrž je plná'); return; }
      v.fuel = Math.min(fmax, v.fuel + 15);
      consumeSelected();
      Sound.pour();
      toast(`Natankováno: ${v.fuel.toFixed(1)} / ${fmax} l`);
    } else openInventory('car', target.id);
    return;
  }
  // Položení vozidla (natočené ve směru pohledu): auto a kolo na zem, letadlo před hráče, loď a hydroplán na vodu
  const vehHeld = heldStack() && ITEMS[heldStack().id].vehicle;
  const placed = (id, y, text) => { vehicles.get(id).y = y; consumeSelected(); Sound.place(); toast(text); };
  if (vehHeld && (isBoat(vehHeld) || vehHeld === 'seaplane')) {
    const spot = vehHeld === 'seaplane' ? seaplaneSpot() : boatSpot(vehHeld);
    if (!spot.ok) { toast(`${vehDim(vehHeld).name} se spouští na vodu – ${spot.why}`); return; }
    placed(spawnVehicle(vehHeld, spot.x, spot.z, player.yaw), spot.y, `${vehDim(vehHeld).name} je na vodě. F = nastoupit, pravé tl. = ${vehDim(vehHeld).fuelMax ? 'palivo a ' : ''}úložný prostor`);
    return;
  }
  if (vehHeld && target?.point && ['grass', 'ground', 'vox', 'block'].includes(target.kind) && (target.kind !== 'block' || target.normal?.[1] === 1)) {
    let [x, , z] = target.point, y = floorAt(x, z, target.point[1] + 0.5);
    if (vehHeld === 'plane') { // letadlo je větší než dosah ruky: postaví se před hráče ocasem k němu
      const spot = planeSpot(target.point);
      if (!spot.ok) { toast(`Tady se letadlo nevejde – ${spot.why} (potřebuje asi 10 × 8 m)`); return; }
      ({ x, y, z } = spot);
    } else if (vehHeld === 'bike') {
      if (solidAt(Math.floor(x), Math.floor(y + 0.5), Math.floor(z)) || Math.hypot(x - player.pos.x, z - player.pos.z) < 0.8) { toast('Tady se kolo nevejde'); return; }
    } else if (carHits({ y }, x, z, player.yaw) || Math.hypot(x - player.pos.x, z - player.pos.z) < 2.2) { toast('Tady se auto nevejde'); return; }
    const K = vehDim(vehHeld);
    placed(spawnVehicle(vehHeld, x, z, player.yaw), y, vehHeld === 'plane' ? 'Dvouplošník stojí. F = nastoupit, pravé tl. = palivo a zavazadla'
      : vehHeld === 'bike' ? 'Kolo stojí. F = nasednout, pravé tl. = košík' : `${K.name} stojí. F = nastoupit, pravé tl. = kufr (palivo a autobaterie)`);
    return;
  }
  // Pravé tlačítko na pracovní stůl nebo táborák otevře jeho okno.
  const STATION_UI = { workbench: 'bench', campfire: 'fire', chest: 'chest', stove: 'kitchen', furnace: 'furnace', adv_bench: 'adv', garage: 'garage' };
  const held0 = heldStack();
  if (target?.kind === 'block' && target.type === 'table') { useTable(bkey(...target.cell)); return; }
  if (target?.kind === 'block' && target.type === 'chair' && !player.sitting) { sitOn(bkey(...target.cell)); return; }
  if (held0?.id === 'fishing_rod') { useRod(); return; }
  // Studna: prázdný kbelík naplníš vodou
  if (target?.kind === 'block' && target.type === 'well') {
    if (held0?.id === 'bucket') { swapHeld('water_bucket'); Sound.pour(); toast('Načerpal jsi vodu'); } else toast('Na vodu potřebuješ prázdný kbelík');
    return;
  }
  // Elektrická zařízení a kabely: vypínač se přepne, ostatní otevřou přehled sítě (s blokem v ruce se staví dál)
  if (target?.kind === 'block' && BLOCKS[target.type].elec && !(held0 && ITEMS[held0.id].block)) {
    const k = bkey(...target.cell);
    if (target.type === 'power_switch') toggleSwitch(k); else if (target.type === 'computer') openPC(k); else openInventory('power', k);
    return;
  }
  if (target?.kind === 'block' && STATION_UI[target.type]) {
    openInventory(STATION_UI[target.type], bkey(...target.cell));
    if (target.type === 'chest') { Sound.chest(); for (const r of structuresNear(target.cell[0], target.cell[2], 14)) ruinsOpened.add(r.key); }
    return;
  }
  if (target?.kind === 'portal') return usePortal(target.shrine);
  // Slepice: sbírání vajec · Kráva: dojení do kbelíku
  if (target?.kind === 'mob') {
    const m = target.mob;
    if (NET.client && (m.type === 'chicken' || (m.type === 'cow' && held0?.id === 'bucket'))) { NET.req(['mu', m.nid]); return; }
    if (m.type === 'chicken') {
      if (m.eggs > 0) { addItem('egg', m.eggs); m.eggs = 0; Sound.pop(); } else toast('Slepice ještě nesnesla vejce');
      return;
    }
    if (m.type === 'cow' && held0?.id === 'bucket') {
      if (m.milkT > 0) { toast('Kráva potřebuje chvíli odpočinout'); return; }
      m.milkT = 40; swapHeld('milk_bucket'); Sound.pour(); toast('Podojil jsi krávu');
      return;
    }
  }
  const s = heldStack();
  if (!s) return;
  const d = ITEMS[s.id];
  // Motyka: zorá trávu nebo hlínu na pole
  if (s.id === 'hoe') { tillGround(); return; }
  // Sázení semínek (a brambor) na ornou půdu
  if (d.plant && target?.kind === 'block' && target.type === 'farmland') {
    const [x, y, z] = target.cell, k = bkey(x, y + 1, z);
    if (!cellFree(x, y + 1, z)) return;
    blocks.set(k, d.plant);
    crops.set(k, { stage: 0, t: 0, next: 25 + Math.random() * 30 });
    consumeSelected();
    rebuildBlocks();
    sfxAt([x + 0.5, y + 1, z + 0.5], () => Sound.blockPlace('leaves'));
    return;
  }
  if (d.food) {
    startEating(s.id, 'hand');
    return;
  }
  // Půlblok na stejný půlblok = celý blok (dvojitý půlblok)
  if (d.block && BLOCKS[d.block].shape === 'slab' && target?.kind === 'block' && target.type === d.block) {
    const k = bkey(...target.cell), up = (blockMeta.get(k) || 0) & 4;
    if ((target.normal[1] === 1 && !up) || (target.normal[1] === -1 && up)) {
      blocks.set(k, BLOCKS[d.block].full);
      blockMeta.delete(k);
      consumeSelected();
      rebuildBlocks();
      sfxAt(target.point, () => Sound.blockPlace(blockMaterial(d.block)));
      return;
    }
  }
  const cell = d.block ? placementCell(target) : null;
  if (cell && cellFree(...cell)) placeBlock(d, cell);
}
// Vymění předmět v ruce za jiný (např. prázdný kbelík -> kbelík vody)
export function swapHeld(id) {
  const s = heldStack();
  if (s.n > 1) { s.n--; addItem(id, 1); }
  else inv.slots[inv.sel] = { id, n: 1 };
  renderHotbar();
}
function tillGround() {
  const t = target;
  if (!t) return;
  let cell = null;
  if (t.kind === 'grass' || (t.kind === 'vox' && t.surface)) {
    cell = [t.cell[0], topY(t.cell[0], t.cell[2]), t.cell[2]];
    if (getVox(...cell) !== V.DIRT && getVox(...cell) !== V.MARKDIRT) { toast('Motykou zorej trávu nebo hlínu'); return; }
    cutGrass(t.cell[0] + 0.5, t.cell[2] + 0.5, 1);
    setVox(...cell, V.AIR); // pole je zapuštěné do země místo hlíny
  }
  else if (t.kind === 'block' && (t.type === 'dirt' || t.type === 'markdirt')) cell = t.cell;
  else if (t.kind === 'vox' && (t.vox === V.DIRT || t.vox === V.MARKDIRT)) { cell = t.cell; setVox(...cell, V.AIR); }
  if (!cell) { toast('Motykou zorej trávu nebo hlínu'); return; }
  if (blocks.has(bkey(...cell)) && blocks.get(bkey(...cell)) !== 'dirt' && blocks.get(bkey(...cell)) !== 'markdirt') return;
  blocks.set(bkey(...cell), 'farmland');
  rebuildBlocks();
  startSwing(0.3);
  wearHeld(useCost('hoe', 'use'));
  debris.emit(cell[0] + 0.5, cell[1] + 1, cell[2] + 0.5, [0.4, 0.28, 0.18], 14, 2, 1.5);
  sfxAt([cell[0] + 0.5, cell[1] + 1, cell[2] + 0.5], () => Sound.blockPlace('dirt'));
}
// Otočení a poloha tvarovaného bloku při položení: schody stoupají směrem od hráče,
// půlblok je nahoře, když míříš na horní polovinu stěny nebo na spodek bloku.
function placeMeta(shape) {
  const rot = ((Math.round(player.yaw / (Math.PI / 2)) % 4) + 4) % 4;
  if (shape !== 'slab') return rot;
  const n = target?.normal, pt = target?.point;
  const up = n && (n[1] === -1 || (n[1] === 0 && pt && pt[1] - Math.floor(pt[1]) > 0.5));
  return up ? 4 : 0;
}
export function placeBlock(d, [x, y, z]) {
  if (BLOCKS[d.block].solid && playerIntersects(x, y, z)) return false;
  // Pochodeň jako v Minecraftu: na zem nebo na zeď, nikdy na strop (shared/world/torch.js)
  const tm = d.block === 'torch' ? torchPlacement(x, y, z, target?.normal, camera.getWorldDirection(new THREE.Vector3()).toArray()) : 0;
  if (tm === null) { toast(waterAt(x + 0.5, y + 0.5, z + 0.5) !== null ? 'Pod vodou pochodeň nehoří' : 'Pochodeň potřebuje pevný blok pod sebou nebo vedle sebe'); return false; }
  // Hlína a kámen vrácené do podzemí se stanou zase přirozenou zeminou (zaplní díru i povrch).
  const NATURAL = { dirt: V.DIRT, markdirt: V.MARKDIRT, cobble: V.STONE };
  if (NATURAL[d.block] && y <= topY(x, z) && getVox(x, y, z) === V.AIR) {
    setVox(x, y, z, NATURAL[d.block]);
  } else {
    const k = bkey(x, y, z), B = BLOCKS[d.block];
    if (tm) blockMeta.set(k, tm); // dřív než blok: ostatní hráči ho hned postaví správně
    blocks.set(k, d.block);
    if (B.shape || B.facing) blockMeta.set(k, placeMeta(B.shape)); else if (!tm) blockMeta.delete(k);
    placedAny[d.block] = true;
    if (d.block === 'chair') chairRot.set(bkey(x, y, z), Math.round(player.yaw / (Math.PI / 2)) * (Math.PI / 2));
    rebuildBlocks();
  }
  consumeSelected();
  sfxAt([x + 0.5, y + 0.5, z + 0.5], () => Sound.blockPlace(blockMaterial(d.block)));
  startSwing(0.22, 0.5);
  return true;
}
// Stavění pod sebe (jako v Minecraftu): dívej se dolů, skákej a drž pravé tlačítko – pod nohama roste sloup.
function pillarPlace() {
  const held = heldStack();
  if (!held || !ITEMS[held.id].block || player.pitch > -0.35 || player.onGround) return;
  const p = player.pos, cell = [Math.floor(p.x), Math.floor(p.y) - 1, Math.floor(p.z)];
  if (cellFree(...cell)) placeBlock(ITEMS[held.id], cell);
}
