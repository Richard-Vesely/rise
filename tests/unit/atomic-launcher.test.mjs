import test from 'node:test';
import assert from 'node:assert/strict';
import {ITEMS,SHOP} from '../../shared/data/index.js';
import {NET} from '../../shared/net/net.js';
import {NUKE,addNuke,updateStrikes,strikeHooks,nukeAllowedAt} from '../../shared/sim/strikes.js';
import {blocks} from '../../shared/world/state.js';
test('launcher is reusable and sold as a weapon with built-in free bombs',()=>{
  assert.equal(ITEMS.nuke_launcher.nukeLauncher,true);assert.equal(ITEMS.nuke_launcher.stack,1);
  assert.ok(SHOP.some(([id,n])=>id==='nuke_launcher'&&n===15));assert.ok(ITEMS.nuke_item.nuke);
});
test('launcher projectile starts at the supplied muzzle and explodes after travel time; fixed blocks survive',()=>{
  const fx=[];NET.targets=()=>[];strikeHooks({fx:(...args)=>fx.push(args)});
  blocks.set('300,57,300','cobble');blocks.set('301,57,300','statue_stone');
  assert.equal(addNuke('host',300,60,300,[260,61,300]),true);
  updateStrikes(.1,[]);assert.equal(fx[0][0],'nuke-shot');assert.deepEqual(fx[0][5],[260,61,300]);
  assert.ok(fx[0][4]>.8&&fx[0][4]<1);
  assert.equal(blocks.has('300,57,300'),true);updateStrikes(1,[]);
  assert.equal(blocks.has('300,57,300'),false);assert.equal(blocks.get('301,57,300'),'statue_stone');
  updateStrikes(10,[]);assert.equal(fx.length,1);
});
test('invalid muzzle and spawn targets are rejected; old nuke throws keep their original effect',()=>{
  assert.equal(addNuke('host',300,60,300,[NaN,0,0]),false);assert.equal(addNuke('host',300,60,300,[0,0]),false);
  assert.equal(nukeAllowedAt(0,0),false);assert.equal(addNuke('host',0,0,0,[0,1,0]),false);
  const fx=[];strikeHooks({fx:(...args)=>fx.push(args)});assert.equal(addNuke('host',400,60,400),true);
  updateStrikes(.1,[]);assert.equal(fx[0][0],'nuke');assert.equal(fx[0][5],undefined);assert.equal(fx[0][4],NUKE.fall-.1);updateStrikes(10,[]);
});
