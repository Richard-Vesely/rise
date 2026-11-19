// Real Node server -> WebSocket -> browser: warning, projectile and damage have one authority.
import assert from 'node:assert/strict';
import { startServer } from '../../server/server.js';
import { launch, openPage, waitGame } from './lib.mjs';
const srv = await startServer({ port: 0, staticDir: 'dist', allowCreative: true, log: () => {} });
const browser = await launch();
try {
  const page = await openPage(browser, `http://127.0.0.1:${srv.port}/`);
  await page.waitForSelector('#mWorlds button[data-world]');
  await page.fill('#mName','DragonTester'); await page.click('#mWorlds button[data-world]');
  await page.waitForSelector('#pgProfile:not([hidden])'); await page.fill('#mPin','1234'); await page.click('#mProfileGo');
  await waitGame(page);
  await page.evaluate(()=>{
    document.getElementById('intro').style.display='none';
    game.setCreative(false); T.tp(-40000,-52,0); T.step(10);
  });
  await page.waitForFunction(()=>game.mobs.some(m=>m.type==='dragon'&&m.dragonCast&&!m.dragonCast.burst),null,{timeout:20000,polling:50});
  const visual=await page.evaluate(()=>{
    const m=game.mobs.find(m=>m.type==='dragon');T.aim(m.pos.x,m.pos.y+2,m.pos.z);T.step(1);
    const fx=game.mobView(m).dragonFire;
    const bar=document.querySelector('#dragonHealth progress');
    return {client:game.NET.client,hp:m.hp,max:bar.max,value:bar.value,visible:fx.root.visible,ring:fx.ring.visible,to:m.dragonCast.to.z,hud:T.text('dragonHealth')};
  });
  assert.equal(visual.client,true);assert.equal(visual.hp,1200);assert.equal(visual.visible,true);assert.equal(visual.ring,true);
  assert.equal(visual.max,1200);assert.equal(visual.value,1200);
  assert.ok(Math.abs(visual.to+52)<0.1);assert.ok(visual.hud.includes('1200 / 1200'));
  await page.waitForFunction(()=>game.player.hp<90,null,{timeout:10000,polling:50});
  const hp=await page.evaluate(()=>game.player.hp);
  assert.ok(hp>50&&hp<65,'host applies one 44-damage explosion to the remote player');
  await page.waitForFunction(()=>game.mobs.some(m=>m.type==='dragon'&&m.dragonCast?.extra?.length===2),null,{timeout:10000,polling:50});
  const fan=await page.evaluate(()=>{
    const m=game.mobs.find(m=>m.type==='dragon');T.step(1);
    return game.mobView(m).dragonFire.extra.every(fx=>fx.root.visible&&fx.ring.visible);
  });
  assert.equal(fan,true,'all three fireballs have synchronized warning circles');
  await page.evaluate(()=>{for(const [i,part] of ['helmet','chestplate','leggings','boots'].entries())game.armor[i]={id:'markorite_'+part,n:1};const m=game.mobs.find(m=>m.type==='dragon');T.tp(m.pos.x,m.pos.z,0);T.step(3);});
  await page.waitForFunction(()=>game.mobs.some(m=>m.type==='dragon'&&m.dragonStomp&&!m.dragonStomp.burst),null,{timeout:5000,polling:50});
  const close=await page.evaluate(()=>{
    const m=game.mobs.find(m=>m.type==='dragon');T.step(1);
    return {radius:m.dragonStomp.radius,visible:game.mobView(m).dragonFire.stomp.root.visible};
  });
  assert.deepEqual(close,{radius:4.5,visible:true});
  await page.waitForFunction(hp=>game.player.hp<hp-15,hp,{timeout:5000,polling:50});
  await page.evaluate(()=>game.setCreative(true));
  await page.waitForFunction(()=>{const m=game.mobs.find(m=>m.type==='dragon');return m&&!m.dragonCast&&!m.dragonStomp;},null,{timeout:5000});
  assert.deepEqual(page.errors,[]);
  console.log('PASS real server synchronizes single shots, fans and stomp warnings; remote damage and creative protection work');
} finally {await browser.close();await srv.close({graceMs:0});}
