// Real combat inputs: give only a starting loadout, then win with movement and normal weapons.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { launch, serveDir, openPage, waitGame, shot } from './lib.mjs';
const server = await serveDir(process.argv[2] || 'dist');
const browser = await launch();
fs.mkdirSync('test-results', { recursive: true });
try {
  for (const style of (process.argv[3] ? [process.argv[3]] : ['careless', 'camp', 'sideways', 'bow', 'sword'])) {
    const page = await openPage(browser, server.url);
    await page.click('#mSolo'); await waitGame(page);
    await page.evaluate((style) => {
      document.getElementById('intro').style.display = 'none';
      game.setCreative(true); T.clearInv(); T.tp(-40000, -52, 0); T.step(80);
      if (style !== 'careless' && style !== 'camp') {
        for (const [i, part] of ['helmet','chestplate','leggings','boots'].entries()) game.armor[i] = { id: 'iron_' + part, n: 1 };
        T.give(['bow','sideways'].includes(style) ? 'bow' : 'iron_sword', 1);
        T.give('arrow', 64); T.hold(['bow','sideways'].includes(style) ? 'bow' : 'iron_sword');
      }
      if (style === 'camp') { const m=game.mobs.find(m=>m.type==='dragon'); T.tp(m.pos.x,m.pos.z,0); T.give('markorite_sword',1); T.hold('markorite_sword'); }
      game.setCreative(false); game.player.hp = 100; game.player.hunger = 90;
      window.battle = { t: 0, shots: 0, minHP: 100, landings: 0, wasResting: false, damageTaken: 0, previousHP: 100, minDragonHP: 300 };
    }, style);
    // See the attack before playing through it.
    if (style === 'bow' && !process.env.PLAYTEST_NO_SHOTS) {
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
        const p=game.player, b=window.battle, isBow=['bow','sideways'].includes(style);
        for(let i=0;i<100;i++) {
          const m=game.mobs.find(m=>m.type==='dragon');
          if(!p.alive || !m || m.dead) break;
          const dx=m.pos.x-p.pos.x,dz=m.pos.z-p.pos.z,d=Math.hypot(dx,dz);
          // Aim each frame; gravity compensation for the ordinary bow.
          T.aim(m.pos.x,m.pos.y+2+(isBow?15*d*d/(2*46*46):0),m.pos.z);
          game.keys.clear(); game.input.lmb=false; game.input.rmb=false;
          if(style!=='careless') {
            const c=m.dragonCast, stomp=m.dragonStomp;
            const pending=c&&!c.burst, close=stomp&&!stomp.burst;
            if(style==='camp') {
              if(d>2.8)game.keys.add('KeyW');
              game.input.lmb=true;
            } else if(style==='sideways') {
              // Original easy tactic: sidestep once and stop outside the first circle.
              const danger=pending&&Math.hypot(p.pos.x-c.to.x,p.pos.z-c.to.z)<3.8;
              if(pending&&b.dodgeId!==c.id) {
                b.dodgeId=c.id;
                b.dodgeKey=p.pos.x>-40000?'KeyA':'KeyD';
              }
              if(danger)game.keys.add(b.dodgeKey);
            } else if(close) {
              game.keys.add('KeyS');game.keys.add('ShiftLeft');
            } else if(m.dragonRest>0) {
              if(style==='sword'&&d>2.8) {game.keys.add('KeyW');game.keys.add('ShiftLeft');}
              else if(isBow&&d>21)game.keys.add('KeyW');
            } else if(pending) {
              if(c.extra?.length) {
                // The fan covers both side lanes. Retreat along its axis instead.
                game.keys.add(p.pos.z>-58&&d>10?'KeyW':'KeyS');
              } else {
                if(b.dodgeId!==c.id) {
                  b.dodgeId=c.id;b.dodgeKey=p.pos.x>-40000?'KeyA':'KeyD';
                }
                game.keys.add(b.dodgeKey);
              }
              const safe=[c,...(c.extra||[])].every(shot=>Math.hypot(p.pos.x-shot.to.x,p.pos.z-shot.to.z)>shot.radius+0.8);
              if(c.t>c.charge-0.3&&safe)game.keys.clear();else game.keys.add('ShiftLeft');
            } else if(style==='sword'&&d>2.8 || isBow&&(d>23||game.pickTarget(48)?.kind!=='mob')) {
              game.keys.add('KeyW'); if(style==='sword')game.keys.add('ShiftLeft');
            } else if(isBow&&d<11)game.keys.add('KeyS');
            if(isBow) {
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
    if(['careless','camp'].includes(style))assert.equal(result.alive,false,'standing still or camping underneath must be dangerous');
    else if(style==='sideways')assert.ok(result.damageTaken>10,'the original easy sideways dodge must now take damage');
    else {
      assert.equal(result.won,true,`${style}: ordinary inputs must win without god mode`);
      assert.equal(result.alive,true); assert.equal(result.reward,128);
    }
    assert.deepEqual(page.errors,[]);
    await page.context().close();
  }
  console.log('PASS selected combat trials used ordinary inputs without god mode');
} finally {await browser.close();await server.close();}
