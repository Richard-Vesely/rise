// window.game pro ladění a testy; spuštění smyčky.
import '../net/mp-start.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { BLOCKS, ITEMS, KITCHEN, RECIPES, RECIPE_CATS, SHAPES, smeltResult } from '../../../shared/data/index.js';
import { NET } from '../../../shared/net/net.js';
import { others } from '../../../shared/net/room.js';
import { setDay } from '../../../shared/sim/day.js';
import { groundItems, spawnGroundItem } from '../../../shared/sim/ground-items.js';
import { updateCrops } from '../../../shared/sim/machines.js';
import { mobs, spawnMob } from '../../../shared/sim/mobs.js';
import { netStats, nets, rebuildNets } from '../../../shared/sim/power.js';
import { pondLevel, waterAt } from '../../../shared/world/nature.js';
import { ensureDoc } from '../../../shared/world/papers.js';
import { worldState } from '../../../shared/world/save.js';
import { blockMeta, blocks, chests, crops, fires, furnaces, paperSpots, papers, pcDisks, portalActive, power, ruinsBuilt, spawners, stoves, tableItems, vehicles } from '../../../shared/world/state.js';
import { STRUCTS, buildStructure, ruinsNear, structuresNear } from '../../../shared/world/structures.js';
import { SHRINES, biomeAt, biomeWeights, lakeOf, nearestLake, pondOf, terrainH, volcanoOf } from '../../../shared/world/terrain.js';
import { V, columnDug, getVox, groundHeight, setVox, topY } from '../../../shared/world/voxels.js';
import { materialAt, targetMaterial } from '../audio/materials.js';
import { Sound } from '../audio/sound.js';
import { env as soundEnv } from '../audio/soundscape.js';
import { DINE_STYLE } from '../dining/dine-view.js';
import { canDine, dining, startDining, takeBite } from '../dining/dining.js';
import { buildFoodInto } from '../dining/food-models.js';
import { startCooking } from '../machines/kitchen.js';
import { toggleSwitch } from '../machines/power.js';
import { hitMob, viewOf } from '../mobs/mobs.js';
import { localBody, myPose, toggleView, updateAvatars, viewMode } from '../net/avatars.js';
import { closePC, openApp, openPC, pc, pcPower } from '../pc/computer.js';
import { closeDoc, openDoc } from '../pc/doc-view.js';
import { useDocs } from '../pc/papers-world.js';
import { newPaper, printJob } from '../pc/printer.js';
import { sitOn, startEating, useTable } from '../player/eating.js';
import { wearHeld } from '../player/durability.js';
import { breakTarget, cellFree, mineState, placeBlock, target, useItem } from '../player/interaction.js';
import { addItem, countItem, findRecipe, inv } from '../player/inventory.js';
import { collidesBlocks, creative, input, keys, lockPointer, openCostume, player, setCreative, toggleGuide, unlockPointer } from '../player/player.js';
import { damagePlayer } from '../player/survival.js';
import { pickTarget } from '../player/targeting.js';
import { rebuildBlocks, specials } from '../render/blocks.js';
import { crackStage } from '../render/crack.js';
import { underground } from '../render/daylight.js';
import { forestRocks, forestTrees } from '../render/forest.js';
import { cutGrass } from '../render/grass.js';
import { ICONS } from '../render/icons.js';
import { FX, LK } from '../render/look.js';
import { post } from '../render/post.js';
import { setWeather, weather } from '../render/weather.js';
import { vis } from '../render/daylight.js';
import { camera, renderer, scene } from '../render/renderer.js';
import { voxChunks } from '../render/vox-mesh.js';
import { invTricks } from '../ui/inv-tricks.js';
import { armor, armorPoints, closeInventory, fillCooking, fillRecipe, fullSet, openInventory, renderHotbar, slotClick, takeResult, ui } from '../ui/inventory-ui.js';
import { CAR, enterVehicle, exitVehicle, nitro, seatWorld, spawnVehicle, toggleCarCam, useNitro, vehMeshes } from '../vehicles/car.js';
import { BIKE } from '../vehicles/bike.js';
import { BOATS, levelAt, sailEff, windRel } from '../vehicles/boat.js';
import { KINDS } from '../vehicles/kinds.js';
import { PLANE, planeHits } from '../vehicles/plane.js';
import { windAt } from '../../../shared/sim/weather.js';
import { fishing, useRod } from '../world/fishing.js';
import { dropHeld, throwItem } from '../world/ground-items.js';
import { teleport, usePortal } from '../world/shrine.js';
import { frame, tick } from './loop.js';
import { GFX, QUALITY, TOUCH } from './prefs.js';
import { saveGame } from './save.js';

// Na břeh nejbližšího jezera (na straně k hráči), hráč se dívá na vodu. Vrátí jezero.
function toLake() {
  const L = nearestLake(player.pos.x, player.pos.z);
  if (!L) return null;
  const a = Math.atan2(player.pos.z - L.z, player.pos.x - L.x), x = L.x + Math.cos(a) * L.r * 1.06, z = L.z + Math.sin(a) * L.r * 1.06;
  teleport(x, z);
  player.pos.y = terrainH(x, z) + 0.05;
  player.yaw = Math.atan2(x - L.x, z - L.z);
  return L;
}
// Loď (nebo hydroplán) na nejbližší jezero: mezi hráčem a středem jezera, přídí ke středu. Vrátí id vozidla.
function spawnOnLake(type = 'motorboat') {
  const L = nearestLake(player.pos.x, player.pos.z);
  if (!L) return null;
  const a = Math.atan2(player.pos.z - L.z, player.pos.x - L.x), x = L.x + Math.cos(a) * L.r * 0.55, z = L.z + Math.sin(a) * L.r * 0.55;
  const id = spawnVehicle(type, x, z, Math.atan2(x - L.x, z - L.z));
  vehicles.get(id).y = type === 'seaplane' ? levelAt(x, z) - 0.18 : levelAt(x, z);
  return id;
}
// Pro ladění v konzoli prohlížeče.
export const game = window.game = {
  testMode: false, tick, input, keys, player, inv, ui, fires, ICONS, addItem, countItem, RECIPES, mobs, spawnMob, blocks, rebuildBlocks, forestTrees, forestRocks,
  slotClick, takeResult, fillRecipe, fillCooking, invTricks, findRecipe, cutGrass, getVox, setVox, topY, columnDug, voxChunks, V, specials,
  get underground() { return underground; }, armor, armorPoints, chests, damagePlayer, SHRINES, usePortal, teleport, ruinsNear, ruinsBuilt, ITEMS,
  get portalActive() { return portalActive; }, get dining() { return dining; }, canDine, tableItems, useTable, sitOn, useRod, fishing, waterAt, pondOf, pondLevel, startEating, groundItems, spawnGroundItem, dropHeld, stoves, crops, KITCHEN, startCooking, updateCrops, spawners, structuresNear, STRUCTS, toggleGuide, fullSet, buildStructure, setCreative, get creative() { return creative; }, cellFree,
  NET, others, worldState, saveGame, renderer, pc, openPC, closePC, pcPower, openApp, papers, pcDisks, paperSpots, openDoc, closeDoc, useDocs, newPaper, printJob, ensureDoc, vehicles, spawnVehicle, enterVehicle, exitVehicle, CAR, PLANE, planeHits, power, nets, netStats, rebuildNets, toggleSwitch, furnaces, smeltResult, RECIPE_CATS, terrainH, groundHeight, biomeAt, biomeWeights, volcanoOf, teleport, blockMeta, BLOCKS, SHAPES, useItem, collidesBlocks, TOUCH, QUALITY, GFX, lockPointer, unlockPointer, breakTarget, placeBlock, throwItem, hitMob, pickTarget, setTime: (t) => setDay(t), get target() { return target; }, mineState, crackStage, wearHeld, renderHotbar, openInventory, closeInventory, startDining, DINE_STYLE, scene, camera, buildFoodInto, takeBite, LK, FX, post, weather, setWeather, vis,
  toggleView, get viewMode() { return viewMode; }, openCostume, myPose, updateAvatars, localBody, mobView: viewOf, // pohled ze třetí osoby (V), výběr obleku (O), postavičky
  lakeOf, nearestLake, toLake, // jezera: game.toLake() = na břeh nejbližšího jezera
  KINDS, BIKE, BOATS, windAt, windRel, sailEff, levelAt, spawnOnLake, nitro, useNitro, vehMeshes, seatWorld, toggleCarCam, // vozidla: game.spawnOnLake('sailboat')
  Sound, soundEnv, materialAt, targetMaterial, // zvuky: game.Sound.music.start('night'), game.soundEnv, game.materialAt(x, y, z)
};
window.gameStarted = true;
frame();
