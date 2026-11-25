import assert from 'node:assert/strict';
import {launch,serveDir,openPage,waitGame} from './lib.mjs';
const server=await serveDir(process.argv[2]||'dist'),browser=await launch();
try{
  const page=await openPage(browser,server.url);await page.click('#mSolo');await waitGame(page);
  await page.evaluate(()=>{window.requestAnimationFrame=()=>0;T.clearInv();T.tp(60,60,35);game.player.pitch=1.2;T.step(1,.001);});
  async function chat(text){await page.evaluate(()=>T.press('KeyT'));await page.locator('#chatInput').fill(text);await page.locator('#chatInput').press('Enter');}
  await chat('mám potion');assert.equal(await page.evaluate(()=>game.countItem('flight_potion')),0);
  await chat(' PoTiOn ');assert.equal(await page.evaluate(()=>game.countItem('flight_potion')),1);
  assert.equal(await page.evaluate(()=>!!game.ICONS.flight_potion),true);
  console.log('PASS flight potion: exact chat command grants a bottle with an icon; normal messages grant nothing');
  const drank=await page.evaluate(()=>{T.hold('flight_potion');game.input.rmb=true;T.step(1,.05);game.input.rmb=false;T.step(1,.05);return {timer:game.player.flyT,n:game.countItem('flight_potion')};});
  assert.deepEqual(drank,{timer:100000,n:0});
  const moved=await page.evaluate(()=>{const y=game.player.pos.y;T.key('Space');T.step(8,.05);T.key('Space',false);T.step(30,.25);return {y,after:game.player.pos.y,timer:game.player.flyT,text:document.body.textContent};});
  assert(moved.after>moved.y+1);assert.equal(moved.timer,100000);assert(moved.text.includes('Létání ∞'));
  console.log('PASS flight potion: right-click consumes bottle, Space flies upward, timer never decreases and HUD shows infinity');
  await page.evaluate(()=>game.saveGame());await page.reload({waitUntil:'domcontentloaded'});await page.click('#mSolo');await waitGame(page);
  assert.equal(await page.evaluate(()=>game.player.flyT),100000);
  await page.evaluate(()=>{
    window.requestAnimationFrame=()=>0;T.clearInv();for(let i=0;i<36;i++)game.inv.slots[i]={id:'stone',n:64};
  });
  await chat('potion');assert.equal(await page.evaluate(()=>game.countItem('flight_potion')),0);
  assert.deepEqual(page.errors,[]);console.log('PASS flight potion: effect survives reload; a full backpack stays intact; no browser errors');
}finally{await browser.close();await server.close();}
