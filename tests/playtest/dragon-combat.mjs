// Real combat inputs: give only a starting loadout, then win with movement and normal weapons.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, serveDir, openPage, waitGame, shot } from './lib.mjs';
const server = await serveDir(process.argv[2] || 'dist');
const browser = await launch();
fs.mkdirSync('test-results', { recursive: true });
try {
  for (const style of (process.argv[3] ? [process.argv[3]] : ['careless', 'bow', 'sword'])) {
    const page = await openPage(browser, server.url);
    await page.click('#mSolo'); await waitGame(page);
    await page.evaluate((style) => {
      document.getElementById('intro').style.display = 'none';
      game.setCreative(true); T.clearInv(); T.tp(-40000, -52, 0); T.step(80);
      if (style !== 'careless') {
        for (const [i, part] of ['helmet','chestplate','leggings','boots'].entries()) game.armor[i] = { id: 'iron_' + part, n: 1 };
        T.give(style === 'bow' ? 'bow' : 'iron_sword', 1);
        T.give('arrow', 64); T.hold(style === 'bow' ? 'bow' : 'iron_sword');
      }
      game.setCreative(false); game.player.hp = 100; game.player.hunger = 90;
      window.battle = { t: 0, shots: 0, minHP: 100, landings: 0, wasResting: false, damageTaken: 0, previousHP: 100, minDragonHP: 300 };
    }, style);
    // See the attack before playing through it.
    if (style === 'bow') {
      await page.evaluate(() => {
        const m=game.mobs.find(m=>m.type==='dragon'); T.aim(m.pos.x,m.pos.y+2,m.pos.z); T.step(4);
      });
      await shot(page, 'test-results/dragon-fire-warning.png');
      const visible = await page.evaluate(() => {
        const m=game.mobs.find(m=>m.type==='dragon'); const f=game.mobView(m).dragonFire;
        return { hp:m.hp, warning: f.root.visible && f.ring.visible, label:f.label.visible };
      });
      assert.deepEqual(visible,{hp:300,warning:true,label:true});
    }
    let result;
    for (let batch=0;batch<36;batch++) {
      result=await page.evaluate(({style})=>{
        const p=game.player, b=window.battle;
        for(let i=0;i<100;i++) {
          const m=game.mobs.find(m=>m.type==='dragon');
          if(!p.alive || !m || m.dead) break;
          const dx=m.pos.x-p.pos.x,dz=m.pos.z-p.pos.z,d=Math.hypot(dx,dz);
          // Aim each frame; gravity compensation for the ordinary bow.
          T.aim(m.pos.x,m.pos.y+2+(style==='bow'?15*d*d/(2*46*46):0),m.pos.z);
          game.keys.clear(); game.input.lmb=false; game.input.rmb=false;
          if(style!=='careless') {
            const c=m.dragonCast;
            const casting=c&&!c.burst;
            const inDanger=casting&&Math.hypot(p.pos.x-c.to.x,p.pos.z-c.to.z)<3.8;
            if(casting) {
              if(b.dodgeId!==c.id) {
                b.dodgeId=c.id;
                const rx=Math.cos(p.yaw),rz=-Math.sin(p.yaw);
                const score=(side)=>Math.abs(c.to.x+rx*side*5+40000)+Math.max(0,-(c.to.z+rz*side*5)-80)*3;
                b.dodgeKey=score(1)<=score(-1)?'KeyD':'KeyA';
              }
              if(inDanger)game.keys.add(b.dodgeKey);
            } else if(style==='sword'&&d>2.8 || style==='bow'&&d>23) {
              game.keys.add('KeyW'); if(style==='sword')game.keys.add('ShiftLeft');
            } else if(style==='bow'&&d<10)game.keys.add('KeyS');
            if(style==='bow') {
              const firing=Math.floor(b.t/0.05)%25;
              game.input.rmb=firing<22;
              if(firing===22)b.shots++;
            } else game.input.lmb=true;
          }
          const rest=m.dragonRest>0;
          if(rest&&!b.wasResting)b.landings++;
          b.wasResting=rest;
          T.step(1); b.t+=0.05;
          if(p.hp<b.previousHP)b.damageTaken+=b.previousHP-p.hp;
          b.minDragonHP=Math.min(b.minDragonHP,m.hp); b.previousHP=p.hp; b.minHP=Math.min(b.minHP,p.hp);
        }
        const m=game.mobs.find(m=>m.type==='dragon');
        return {style,seconds:Math.round(b.t*10)/10,alive:p.alive,hp:p.hp,dragonHP:m?.hp??0,
          won:!!m?.dead,shots:b.shots,minHP:b.minHP,minDragonHP:b.minDragonHP,damageTaken:b.damageTaken,landings:b.landings,
          reward:T.count('markorite'),pos:[p.pos.x,p.pos.z],dragonPos:m?[m.pos.x,m.pos.z]:null};
      },{style});
      if(!result.alive||result.won)break;
    }
    console.log(JSON.stringify(result));
    if(style==='careless')assert.equal(result.alive,false,'standing still must be dangerous');
    else {
      assert.equal(result.won,true,`${style}: ordinary inputs must win without god mode`);
      assert.equal(result.alive,true); assert.equal(result.reward,128);
    }
    assert.deepEqual(page.errors,[]);
    await page.context().close();
  }
  console.log('PASS selected combat trials used ordinary inputs without god mode');
} finally {await browser.close();await server.close();}
