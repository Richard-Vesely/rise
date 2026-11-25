import assert from 'node:assert/strict';
import {launch,serveDir,openPage,waitGame} from './lib.mjs';
const server=await serveDir(process.argv[2]||'dist'),browser=await launch();
try{
  const page=await openPage(browser,server.url);await page.click('#mSolo');await waitGame(page);
  await page.evaluate(()=>{window.nativeRAF=window.requestAnimationFrame;window.requestAnimationFrame=()=>0;T.clearInv();T.give('coin',15);});
  async function shop(){await page.evaluate(()=>T.press('KeyT'));await page.locator('#chatInput').fill('/shop');await page.locator('#chatInput').press('Enter');}
  await shop();await page.click('[data-buy="nuke_launcher"]');await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>game.countItem('nuke_launcher')),1);
  assert.equal(await page.evaluate(()=>game.countItem('coin')),0);
  await page.evaluate(()=>{
    T.hold('nuke_launcher');window.atomicShotN=0;const original=game.NET.onFx;
    game.NET.onFx=(...args)=>{if(args[0]==='nuke-shot')window.atomicShotN++;original?.(...args);};
  });
  const protectedAmmo=await page.evaluate(()=>{
    const g=game;g.mobs.length=0;g.blocks.set('5,9,10','tech_panel');g.blocks.set('5,10,20','cobble');g.rebuildBlocks();
    T.tp(5.5,10.5,10);T.aim(5.5,10.5,20.5);g.input.rmb=true;T.step(1,.016);g.input.rmb=false;T.step(1,.016);return g.countItem('nuke_item');
  });
  assert.equal(protectedAmmo,0);assert.equal(await page.evaluate(()=>window.atomicShotN),0);console.log('PASS atomic launcher: bought for 15 coins with no separate ammo; protected spawn still refuses firing');
  const fired=await page.evaluate(()=>{
    const g=game;for(let x=-301;x<=-299;x++)for(let z=299;z<=301;z++)g.blocks.set(`${x},39,${z}`,'tech_panel');
    g.blocks.set('-300,40,330','cobble');g.blocks.set('-299,40,330','statue_stone');g.rebuildBlocks();
    T.tp(-299.5,300.5,40);T.aim(-299.5,40.5,330.5);window.requestAnimationFrame=window.nativeRAF;
    g.input.rmb=true;T.step(1,.016);g.input.rmb=false;T.step(1,.016);
    const first=g.countItem('nuke_item'),obj=g.scene.children.find(o=>o.name==='atomic-projectile'),projectile=!!obj;
    obj.updateMatrixWorld(true);
    const nose=g.camera.position.clone().set(0,1,0).applyQuaternion(obj.children[0].getWorldQuaternion(g.camera.quaternion.clone()));
    const toward=g.camera.position.clone().set(-299.5,40.5,330).sub(obj.position).normalize(),oriented=nose.dot(toward)>.98;
    g.input.rmb=true;T.step(1,.016);g.input.rmb=false;T.step(1,.016);
    return {first,after:g.countItem('nuke_item'),shots:window.atomicShotN,coins:g.countItem('coin'),gun:g.countItem('nuke_launcher'),projectile,oriented,model:!!g.scene.getObjectByName('atomic-launcher'),icon:!!g.ICONS.nuke_launcher};
  });
  assert.deepEqual(fired,{first:0,after:0,shots:1,coins:0,gun:1,projectile:true,oriented:true,model:true,icon:true});
  const hit=await page.evaluate(()=>{T.step(25,.05);return {gone:!game.blocks.has('-300,40,330'),fixed:game.blocks.get('-299,40,330'),alive:game.player.alive};});
  assert.deepEqual(hit,{gone:true,fixed:'statue_stone',alive:true});
  console.log('PASS atomic launcher: visible shot and held model, free shot without any ammo, reload blocks a second shot, explosion removes target and preserves fixed blocks');
  const again=await page.evaluate(()=>{
    const g=game;T.give('nuke_item',1);g.blocks.set('-300,40,350','cobble');g.rebuildBlocks();T.aim(-299.5,40.5,350.5);T.step(30,.05);
    g.input.rmb=true;T.step(1,.016);g.input.rmb=false;T.step(1,.016);return {ammo:g.countItem('nuke_item'),gun:g.countItem('nuke_launcher'),shots:window.atomicShotN,coins:g.countItem('coin')};
  });
  assert.deepEqual(again,{ammo:1,gun:1,shots:2,coins:0});assert.deepEqual(page.errors,[]);
  console.log('PASS atomic launcher: reload permits another free shot, loose bombs and coins are not consumed, weapon remains reusable, no browser errors');
}finally{await browser.close();await server.close();}
