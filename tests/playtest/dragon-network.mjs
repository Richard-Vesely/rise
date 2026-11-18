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
    return {client:game.NET.client,hp:m.hp,visible:fx.root.visible,ring:fx.ring.visible,to:m.dragonCast.to.z,hud:T.text('dragonHealth')};
  });
  assert.equal(visual.client,true);assert.equal(visual.hp,300);assert.equal(visual.visible,true);assert.equal(visual.ring,true);
  assert.ok(Math.abs(visual.to+52)<0.1);assert.ok(visual.hud.includes('300 / 300'));
  await page.waitForFunction(()=>game.player.hp<90,null,{timeout:10000,polling:50});
  const hp=await page.evaluate(()=>game.player.hp);
  assert.ok(hp>65&&hp<80,'host applies one 28-damage explosion to the remote player');
  await page.evaluate(()=>game.setCreative(true));
  await page.waitForFunction(()=>{const m=game.mobs.find(m=>m.type==='dragon');return m&&!m.dragonCast;},null,{timeout:5000});
  assert.deepEqual(page.errors,[]);
  console.log('PASS real server synchronizes visible fire warnings and applies remote damage once; creative cancels attacks');
} finally {await browser.close();await srv.close({graceMs:0});}
