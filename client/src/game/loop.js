// Herní smyčka (tick).
import '../ui/touch.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { NET } from '../../../shared/net/net.js';
import { dayTime } from '../../../shared/sim/day.js';
import { updateCrops, updateFires, updateFurnaces, updateStoves } from '../../../shared/sim/machines.js';
import { updateMobs, updateSpawners, updateSpawns } from '../../../shared/sim/mobs.js';
import { updatePower } from '../../../shared/sim/power.js';
import { EYE } from '../../../shared/world/constants.js';
import { vehicles } from '../../../shared/world/state.js';
import { updateTorches } from '../../../shared/world/torch.js';
import { Sound } from '../audio/sound.js';
import { updateSoundscape } from '../audio/soundscape.js';
import { dining, updateDining } from '../dining/dining.js';
import { refreshFurnaceUI, updateFurnaceGlow } from '../machines/furnace.js';
import { stoveVisuals } from '../machines/kitchen.js';
import { updatePowerVisuals } from '../machines/power.js';
import { animateMobs, syncMobViews } from '../mobs/mobs.js';
import { updateLocalBody } from '../net/avatars.js';
import { updatePuppets } from '../net/multiplayer.js';
import { pcOpen, updatePC } from '../pc/computer.js';
import { docOpen } from '../pc/doc-view.js';
import { updateDocs } from '../pc/papers-world.js';
import { applyCameraFeel, timeScale } from '../player/camera-feel.js';
import { updateEating } from '../player/eating.js';
import { updateInteraction } from '../player/interaction.js';
import { guideOpen, isLocked, player, updatePlayer } from '../player/player.js';
import { updateShards, updateSurvival } from '../player/survival.js';
import { rebuildBlocks, updateLights } from '../render/blocks.js';
import { applyUnderground, underground, updateDay } from '../render/daylight.js';
import { applyDimension } from '../render/dimension.js';
import { rebuildForest } from '../render/forest.js';
import { grassLayers, regrowGrass } from '../render/grass.js';
import { ground } from '../render/ground.js';
import { updateHeldModel, updateSwing } from '../render/held-item.js';
import { updateChips, updateStars } from '../render/chips.js';
import { debris, sparks } from '../render/particles.js';
import { initClouds, initRidge, updateClouds, updateRidge } from '../render/clouds.js';
import { post, renderFrame } from '../render/post.js';
import { FOG, U, camera, renderer, scene } from '../render/renderer.js';
import { initShadows, updateShadows } from '../render/shadows.js';
import { updateWater } from '../render/water.js';
import { initWeather, updateWeather } from '../render/weather.js';
import { initAmbientFx, updateAmbientFx } from '../render/ambient-fx.js';
import { sky, stars, updateEnvironment } from '../render/sky.js';
import { updateVoxChunks } from '../render/vox-mesh.js';
import { $ } from '../ui/dom.js';
import { updateHUD, updateTips } from '../ui/hud.js';
import { invOpen, refreshFireUI, renderCraftArea, renderHotbar, ui } from '../ui/inventory-ui.js';
import { touchUI } from '../ui/touch.js';
import { driveVehicle, placeCarCamera, updateVehicles } from '../vehicles/car.js';
import { updateFishing } from '../world/fishing.js';
import { syncGroundItemViews, tickGroundItems } from '../world/ground-items.js';
import { checkPortal, updatePortals } from '../world/shrine.js';
import { updateRuins } from '../world/structures.js';
import { MP } from './boot.js';
import { game } from './debug.js';
import { GFX } from './prefs.js';
import { save } from './save-load.js';

// ============================================================ herní smyčka
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
export const clock = new THREE.Clock();
export let envDay = 0, gameTime = 0, gameClock = 0, envTimer = 0, frames = 0, fpsTimer = 0, settle = 0;
rebuildForest(player.pos.x, player.pos.z, true);
rebuildBlocks();
updateDay(0);
updateEnvironment();
initShadows();
initClouds();
initRidge();
initWeather();
initAmbientFx();
renderHotbar();
updateTips();
if (!save) $('intro').style.display = 'grid';

export function tick(realDt) {
  const playing = (isLocked() || game.testMode) && !invOpen && !guideOpen && !pcOpen && !docOpen;
  const dt = playing ? realDt * timeScale(realDt) : 0; // timeScale: krátké zastavení po silném úderu (hit-stop)
  gameClock += realDt;
  gameTime += dt;
  U.time.value = gameClock;

  let moving = 0;
  // spolujezdec se nehýbe sám: sedí v modelu vozidla (updateVehicles → vehicles/passengers.js)
  if (playing && player.alive) { moving = player.vehicle ? driveVehicle(dt) : player.riding ? 0 : updatePlayer(dt); if (!player.vehicle && !player.riding && !player.sitting) applyCameraFeel(realDt, moving); }
  else if (player.vehicle && vehicles.has(player.vehicle)) { placeCarCamera(vehicles.get(player.vehicle)); Sound.engine(false, 0); }
  else if (!player.riding) { camera.rotation.set(player.pitch, player.yaw, 0); camera.position.set(player.pos.x, player.pos.y + EYE, player.pos.z); }
  updateVehicles(realDt);
  updateHeldModel();
  updateSwing(dt, moving);
  updateLocalBody(realDt, moving); // vlastní postava (pohled ze třetí osoby, klávesa V)

  const W = MP ? realDt : dt;
  updateWeather(realDt, gameClock, underground); // počasí podle dne a času (stejné u všech hráčů)
  const { night, day } = updateDay(W);
  rebuildForest(player.pos.x, player.pos.z);
  updateVoxChunks(player.pos.x, player.pos.z);
  applyDimension(realDt);
  applyUnderground(realDt);
  updateRuins(realDt);
  if ((playing || MP) && !NET.client) updateSpawners(realDt);
  if (playing) {
    if (player.alive && !dining && !player.vehicle && !player.riding) updateInteraction(dt); // z vozidla se netěží
    updateDining(dt);
    updateSurvival(dt);
    if (!MP) { updateMobs(dt, day); animateMobs(dt); updateSpawns(dt, night); }
    updateShards(dt);
    if (!MP) tickGroundItems(dt);
    updateFishing(dt);
    updateEating(dt);
    checkPortal(dt);
  }
  if (MP) { // tvory simuluje jen hostitel, klient je ukazuje podle něj
    if (NET.client) updatePuppets(realDt); else { updateMobs(realDt, day); animateMobs(realDt); updateSpawns(realDt, night); }
    tickGroundItems(realDt);
  }
  syncGroundItemViews();
  syncMobViews();
  if (!NET.client) { updateFires(realDt); refreshFireUI(realDt); }
  if (!NET.client) { updateFurnaces(realDt); refreshFurnaceUI(realDt); } // pec taví u hostitele, klient jen ukazuje
  updateFurnaceGlow(gameClock);
  if (updatePower(realDt, day) && invOpen && ui.mode === 'power') renderCraftArea(); // elektrické sítě (energie 4× za sekundu)
  updatePowerVisuals(realDt, gameClock);
  updatePC(realDt); // počítač: start, napájení, aplikace
  updateDocs(realDt); // papíry a rámečky ve světě
  updateStoves(realDt);
  stoveVisuals(realDt);
  if (!NET.client) updateCrops(W);
  if (!NET.client) updateTorches(realDt); // pochodeň bez opory odpadne (rozhoduje ten, kdo drží svět)
  updatePortals(realDt);
  regrowGrass(realDt);
  updateLights(gameClock);
  updateAmbientFx(realDt, underground); // jiskry a kouř nad ohněm, prach v jeskyni, světélka v Markově dimenzi
  sparks.update(realDt);
  debris.update(realDt);
  updateChips(realDt);
  updateStars(realDt);
  const gust = Math.min(1, U.wind.value.z * (0.6 + 0.4 * U.wind.value.w)); // společný vítr (za deště a bouřky silnější)
  updateSoundscape(realDt, gust); // zvuky okolí, hudba, stroje, kroky ostatních

  U.cam.value.copy(camera.position);
  sky.position.copy(camera.position);
  ground.position.set(Math.round(camera.position.x / 4) * 4, 0, Math.round(camera.position.z / 4) * 4);
  stars.position.copy(camera.position);
  updateClouds();
  updateRidge(FOG.color, underground);
  // odlesky oblohy (drahé, ~10 ms) jen když se znatelně posunul čas dne, nejpozději po 12 s
  if ((envTimer += realDt) > 3 && (Math.abs(dayTime - envDay) > 0.012 || envTimer > 12)) { envTimer = 0; envDay = dayTime; updateEnvironment(); }
  cullFar(realDt);

  frames++;
  if ((fpsTimer += realDt) >= 2) {
    if (++settle > 1 && frames / fpsTimer < 40) for (const g of grassLayers) if (g.geometry.instanceCount > 25000) g.geometry.instanceCount = Math.floor(g.geometry.instanceCount * 0.8);
    frames = 0;
    fpsTimer = 0;
  }
  updateHUD(realDt);
  touchUI.update(realDt);
  NET.update(realDt);
  if (performance.now() - lastFrameAt < 300) { // na pozadí se nevykresluje
    post.menu = invOpen || pcOpen || docOpen || guideOpen || !!document.getElementById('costume'); // svět za oknem (i za výběrem obleku) stačí v polovičním rozlišení
    updateShadows(realDt, underground);
    updateWater();
    renderFrame(realDt);
  }
}
// Objekty za mlhou (stroje, zříceniny, krystaly, vozidla, papíry…) se nekreslí. Skupiny se světlem viditelným zdálky
// (sprity, materiály bez mlhy) a skupiny v počátku souřadnic (obsah rozmístěný po světě) zůstávají. Skrývá jen to, co sama skryla.
let cullT = 0;
function cullFar(dt) {
  if ((cullT -= dt) > 0) return;
  cullT = 0.5;
  const R2 = (2.4 / GFX.fog) ** 2, cx = camera.position.x, cz = camera.position.z;
  for (const o of scene.children) {
    if (!o.isGroup) continue;
    const U = o.userData;
    if (U.noCull === undefined) {
      let keep = o.position.lengthSq() < 1;
      o.traverse((c) => { if (c.isSprite || c.isLight || (c.material && c.material.fog === false)) keep = true; });
      U.noCull = keep;
    }
    if (U.noCull) continue;
    const far = (o.position.x - cx) ** 2 + (o.position.z - cz) ** 2 > R2;
    if (far && o.visible) { o.visible = false; U.culled = true; }
    else if (!far && U.culled) { o.visible = true; U.culled = false; }
  }
}
export let lastFrameAt = 0;
export function frame() {
  lastFrameAt = performance.now();
  requestAnimationFrame(frame);
  tick(Math.min(clock.getDelta(), 0.05));
}
