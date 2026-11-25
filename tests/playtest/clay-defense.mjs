// Ovládání hliněné sítě, skutečné modely, odpal, sestřel a uložení v prohlížeči.
import assert from 'node:assert/strict';
import { launch, serveDir, openPage, waitGame } from './lib.mjs';
async function shot(page,file) {
  await page.evaluate(()=>{window.__skipDraw=false;game.renderer.render(game.scene,game.camera);});
  await page.screenshot({path:file});
  await page.evaluate(()=>{window.__skipDraw=true;});
}
const server=await serveDir(process.argv[2]||'dist'), browser=await launch();
try {
  const page=await openPage(browser,server.url);
  await page.click('#mSolo');await waitGame(page);
  await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});
  const crafted=await page.evaluate(()=>{
    const g=game, result=[];
    for(const id of ['dirt_cable','dirt_source','dirt_silo','dirt_defense','dirt_rocket','missile_radar','missile_control']) {
      T.clearInv();T.give('steel_plate',16);T.give('copper_wire',16);T.give('circuit_board',16);g.openInventory();
      g.fillRecipe(g.RECIPES.find(r=>r.out===id),false);g.takeResult(false);
      result.push({id,made:g.inv.cursor?.id,n:g.inv.cursor?.n,icon:!!g.ICONS[id]});g.closeInventory();
    }
    return result;
  });
  assert(crafted.every(r=>r.id===r.made&&r.n>0&&r.icon),JSON.stringify(crafted));
  console.log('PASS missile system: all seven recipes craft in the backpack and have icons');
  await page.evaluate(()=>{
    game.blocks.set('20,15,60','dirt_source');game.blocks.set('21,15,60','dirt_cable');game.blocks.set('22,15,60','dirt_silo');
    game.rebuildBlocks();game.rebuildNets();T.step(6,.05);T.clearInv();T.give('dirt',2);game.openInventory('power','20,15,60');
  });
  assert.equal(await page.evaluate(()=>game.power.get('22,15,60').pw),0);
  await page.click('#missile-fuel');
  assert.equal(await page.evaluate(()=>game.countItem('dirt')),0);
  assert.equal(await page.evaluate(()=>game.power.get('20,15,60').fuel),2);
  await page.evaluate(()=>{game.closeInventory();T.step(1,.25);});
  assert.equal(await page.evaluate(()=>game.power.get('20,15,60').fuel),1);
  console.log('PASS generator: real button consumes backpack dirt and powers the network');
  const setup=await page.evaluate(()=>{
    const g=game;T.clearInv();T.give('dirt_rocket',2);
    for(const [x,type] of [[20,'dirt_source'],[21,'dirt_cable'],[22,'dirt_silo'],[23,'dirt_cable'],[24,'dirt_defense']])g.blocks.set(`${x},15,60`,type);
    g.blocks.set('24,15,61','missile_radar');g.blocks.set('24,15,62','missile_control');
    g.rebuildBlocks();g.rebuildNets();T.step(6,.05);
    T.tp(22,66,16);g.player.yaw=0;g.player.pitch=-.1;
    const meshes=g.scene.children.filter(m=>m.name==='clay-cable'&&m.count>0);
    const materials=[];
    for(const x of [20,22,24])g.specials.get(`${x},15,60`).obj.traverse(o=>{if(o.isMesh)materials.push(o.material);});
    g.openInventory('power','22,15,60');
    return {silo:g.power.get('22,15,60').pw,defense:g.power.get('24,15,60').pw,wires:meshes.length,soil:materials.some(m=>m.metalness>=.6)&&materials.every(m=>!m.map),title:document.querySelector('#clay-load')?.textContent};
  });
  assert.equal(setup.silo,1);assert.equal(setup.defense,1);assert(setup.wires>=3&&setup.soil&&setup.title);
  console.log('PASS clay: connected dirt wires, metal models and powered device controls');
  await page.click('#clay-load');await page.click('#clay-load');
  assert.equal(await page.evaluate(()=>game.power.get('22,15,60').ammo),2);
  assert.equal(await page.evaluate(()=>game.countItem('dirt_rocket')),0);
  await page.click('#clay-launch');
  const launched=await page.evaluate(()=>{T.step(1,.25);return JSON.parse(JSON.stringify(game.power.get('22,15,60')));});
  assert.equal(launched.ammo,1);assert.equal(launched.shots.length,1);
  await page.evaluate(()=>{game.closeInventory();T.step(1,.001);});
  const rocketMeshes=await page.evaluate(()=>game.scene.children.filter(o=>o.name==='clay-rocket').length);
  assert.equal(rocketMeshes,1);
  await shot(page,'playtest-clay-flight.png');
  const intercepted=await page.evaluate(()=>{T.step(4,.25);return game.power.get('24,15,60').intercepted;});
  assert.equal(intercepted,1);
  assert.equal(await page.evaluate(()=>game.scene.children.filter(o=>o.name==='clay-interception').length),1);
  console.log('PASS clay: real buttons load ammo, launch a visible rocket and defense fires an interceptor');
  const disconnected=await page.evaluate(()=>{
    const g=game;g.blocks.delete('23,15,60');g.rebuildBlocks();g.rebuildNets();T.step(20,.25);
    g.power.get('22,15,60').fire=true;T.step(18,.25);
    return {powered:g.power.get('24,15,60').pw,intercepted:g.power.get('24,15,60').intercepted,landed:g.power.get('22,15,60').landed,ammo:g.power.get('22,15,60').ammo};
  });
  assert.deepEqual(disconnected,{powered:0,intercepted:1,landed:1,ammo:0});
  console.log('PASS clay: disconnected wire prevents interception and the next rocket finishes its flight');
  await page.evaluate(()=>{
    const g=game;g.blocks.set('23,15,60','dirt_cable');g.rebuildBlocks();g.rebuildNets();T.step(3,.25);
    T.tp(26,66,17);T.aim(22.5,15.8,60.5);g.saveGame();
  });
  await shot(page,'playtest-clay-system.png');
  await page.reload({waitUntil:'domcontentloaded'});await page.click('#mSolo');await waitGame(page);
  const restored=await page.evaluate(()=>({ammo:game.power.get('22,15,60').ammo,stopped:game.power.get('24,15,60').intercepted,cable:game.blocks.get('23,15,60')}));
  assert.deepEqual(restored,{ammo:0,stopped:1,cable:'dirt_cable'});
  await page.evaluate(()=>{
    const g=game;window.requestAnimationFrame=()=>0;g.NET.pvp=true;g.NET.pid='host';
    const pos={x:40,y:15,z:60};g.others.set('map-target',{name:'Cíl <b>hráč</b>',pose:{...pos,alive:true,cr:0}});
    g.NET.targets=()=>[{pid:'host',pos:g.player.pos,alive:true},{pid:'map-target',pos,alive:true}];
    g.power.get('22,15,60').ammo=1;g.blocks.set('24,15,60','dirt_cable');g.rebuildBlocks();g.rebuildNets();T.step(2,.25);
    g.openInventory('power','24,15,62');
  });
  assert.equal(await page.locator('#missile-map').count(),1);
  assert.equal(await page.locator('#missile-target-launch').isDisabled(),true);
  await page.click('#missile-map [data-target="map-target"]');
  assert.equal(await page.locator('#missile-target-launch').isEnabled(),true);
  assert.equal(await page.locator('#missile-map img').count(),0);
  await shot(page,'playtest-missile-map.png');
  await page.click('#missile-target-launch');
  const aimed=await page.evaluate(()=>{T.step(1,.25);return game.power.get('22,15,60').shots[0];});
  assert.equal(aimed.target,'map-target');assert.deepEqual(aimed.to,[40,16,60]);
  console.log('PASS player map: selecting a real map marker enables launch and sends a targeted rocket');
  const animalId=await page.evaluate(()=>{
    const g=game;g.NET.pvp=false;g.NET.pvpMark=false;const silo=g.power.get('22,15,60');silo.shots=[];silo.cooldown=0;silo.ammo=1;
    const cow=g.spawnMob('cow',36,60,15);window.mapCow=cow;g.openInventory('power','24,15,62');return cow.nid;
  });
  await page.click('#missile-map [data-target="animal:'+animalId+'"]');
  assert.equal(await page.locator('#missile-target-launch').isEnabled(),true);
  await shot(page,'playtest-animal-map.png');
  await page.click('#missile-target-launch');
  const animalShot=await page.evaluate(()=>{T.step(1,.25);return game.power.get('22,15,60').shots[0];});
  assert.equal(animalShot.target,'animal:'+animalId);
  await page.evaluate(()=>{mapCow.dead=true;game.openInventory('power','24,15,62');});
  assert.equal(await page.locator('#missile-map [data-target="animal:'+animalId+'"]').count(),0);
  console.log('PASS animal map: selectable in solo without PvP, targeted launch works, dead animals disappear');
  assert.deepEqual(page.errors,[]);
  console.log('PASS clay: save/reload keeps equipment, ammo and interception counts; no browser errors');
}finally{await browser.close();await server.close();}
