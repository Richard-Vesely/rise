import assert from 'node:assert/strict';
import {launch,serveDir,openPage,waitGame} from './lib.mjs';
const server=await serveDir(process.argv[2]||'dist'),browser=await launch();
try{
  const page=await openPage(browser,server.url);await page.click('#mSolo');await waitGame(page);
  await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});
  const result=await page.evaluate(()=>{
    const g=game;g.mobs.length=0;
    for(let x=-3;x<=42;x++)for(let z=34;z<=47;z++)g.blocks.set(`${x},19,${z}`,'tech_panel');
    for(const [x,id] of [[0,'dirt_source'],[7,'dirt_silo'],[17,'dirt_defense'],[27,'missile_radar'],[37,'missile_control']])g.blocks.set(`${x},20,40`,id);
    for(const [a,b] of [[1,4],[10,15],[19,25],[29,33]])for(let x=a;x<=b;x++)g.blocks.set(`${x},20,40`,'dirt_cable');
    g.power.set('0,20,40',{fuel:5});g.power.set('7,20,40',{ammo:2});g.rebuildBlocks();g.rebuildNets();T.step(2,.25);
    const dimensions=[];
    for(const x of [0,7,17,27,37]){
      const obj=g.specials.get(`${x},20,40`).obj,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];obj.updateMatrixWorld(true);
      obj.traverse(o=>{if(!o.isMesh)return;const a=o.geometry.attributes.position,v=g.camera.position.clone();for(let i=0;i<a.count;i++){v.fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld);for(let j=0;j<3;j++){min[j]=Math.min(min[j],v.getComponent(j));max[j]=Math.max(max[j],v.getComponent(j));}}});
      dimensions.push(max.map((v,i)=>v-min[i]));
    }
    return {dimensions,power:[7,17,27,37].map(x=>g.power.get(`${x},20,40`).pw),inside:g.collidesBlocks({x:17.5,y:23,z:42}),outside:g.collidesBlocks({x:21,y:23,z:42}),free:g.cellFree(17,23,42)};
  });
  assert.deepEqual(result.power,[1,1,1,1]);assert(result.inside&&!result.outside&&!result.free);
  for(const [i,[w,h,d]] of result.dimensions.entries()){
    const limit=[[1,1,1],[5,5,5],[3,5,7],[3,5,7],[7,4,3]][i];
    assert(w<=limit[0]+.15&&h<=limit[1]+.15&&d<=limit[2]+.15,JSON.stringify(result.dimensions));
    assert(w>limit[0]*.65&&h>limit[1]*.65&&d>limit[2]*.65);
  }
  console.log('PASS large machines: model dimensions match footprints; side ports power every device; full body collides');
  const aim=await page.evaluate(()=>{
    T.tp(17.5,47,22);T.aim(17.5,23,42);const hit=game.pickTarget(8);
    T.clearInv();T.give('missile_radar',1);const placed=game.placeBlock(game.ITEMS.missile_radar,[18,20,42]);
    return {type:hit?.type,cell:hit?.cell,placed,inventory:game.countItem('missile_radar')};
  });
  assert.equal(aim.type,'dirt_defense');assert.deepEqual(aim.cell,[17,20,40]);assert.equal(aim.placed,false);assert.equal(aim.inventory,1);
  console.log('PASS large machines: aiming at outer body resolves its anchor; overlapping placement is refused without consuming item');
  await page.evaluate(()=>{T.tp(21,77,35);T.aim(20,22,40);game.saveGame();window.__skipDraw=false;game.renderer.render(game.scene,game.camera);});
  await page.screenshot({path:'playtest-missile-size.png'});await page.evaluate(()=>{window.__skipDraw=true;});
  const shot=await page.evaluate(()=>{game.power.get('7,20,40').fire=true;T.step(1,.25);return game.power.get('7,20,40').shots[0];});
  assert.equal(shot.from[1],25.1);
  await page.reload({waitUntil:'domcontentloaded'});await page.click('#mSolo');await waitGame(page);
  assert.equal(await page.evaluate(()=>game.collidesBlocks({x:17.5,y:23,z:42})),true);
  assert.deepEqual(page.errors,[]);console.log('PASS large machines: silo launches above roof; save/reload restores collision and devices without browser errors');
}finally{await browser.close();await server.close();}
