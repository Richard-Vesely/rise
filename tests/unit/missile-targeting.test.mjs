import test from 'node:test';
import assert from 'node:assert/strict';
import { NET } from '../../shared/net/net.js';
import { others } from '../../shared/net/room.js';
import { blocks,power } from '../../shared/world/state.js';
import { markPowerDirty,updatePower } from '../../shared/sim/power.js';
import { mobs,spawnMob } from '../../shared/sim/mobs.js';
import { missileTarget } from '../../shared/sim/missile-targeting.js';
const key=x=>`${x},60,0`;
function setup(){
  blocks.clear();power.clear();others.clear();mobs.length=0;const messages=[];
  Object.assign(NET,{pvp:true,pvpMark:false,client:false});
  const a={pos:{x:0,y:60,z:5},pid:'a',alive:true},b={pos:{x:20,y:60,z:0},pid:'b',alive:true};
  NET.targets=()=>[a,b];
  for(const p of [a,b])others.set(p.pid,{name:p.pid,pose:{...p.pos,alive:true,cr:0},conn:{open:true,send:m=>messages.push(m)}});
  for(const [x,id] of [[0,'dirt_source'],[1,'dirt_cable'],[2,'dirt_silo'],[3,'missile_radar'],[4,'missile_control']])blocks.set(key(x),id);
  power.set(key(0),{fuel:5});power.set(key(2),{ammo:2});markPowerDirty();updatePower(.25,1);
  const fire=()=>{power.get(key(4)).launch={by:'a',pid:'b'};updatePower(.25,1);};
  return {a,b,messages,fire};
}
const tick=()=>{for(let i=0;i<18;i++)updatePower(.25,1);};
test('control launches at the selected player, consumes ammo and applies one PvP impact',()=>{
  const {messages,fire}=setup();fire();const silo=power.get(key(2));
  assert.equal(silo.ammo,1);assert.equal(silo.shots[0].target,'b');assert.deepEqual(silo.shots[0].to,[20,61,0]);
  tick();assert.equal(silo.hits,1);assert.equal(messages.filter(m=>m[0]==='dmg').length,1);assert.equal(messages.find(m=>m[0]==='dmg')[1],30);
});
test('moving away from the selected position dodges the missile',()=>{
  const {b,messages,fire}=setup();fire();b.pos.z=15;others.get('b').pose.z=15;tick();
  assert.equal(messages.filter(m=>m[0]==='dmg').length,0);assert.equal(power.get(key(2)).landed,1);
});
test('interception prevents player damage',()=>{
  const {messages,fire}=setup();blocks.set(key(5),'dirt_defense');markPowerDirty();updatePower(.25,1);fire();tick();
  assert.equal(power.get(key(5)).intercepted,1);assert.equal(messages.filter(m=>m[0]==='dmg').length,0);
});
test('no PvP, missing radar, empty silo and targets out of range reject launch',()=>{
  for(const change of [()=>{NET.pvp=false;},()=>{blocks.delete(key(3));markPowerDirty();},()=>{power.get(key(2)).ammo=0;},b=>{b.pos.x=200;}]){
    const {b,fire}=setup();change(b);fire();assert.equal(power.get(key(2)).launched||0,0);
  }
});
test('self, creative, dead, disconnected and wrong-dimension targets are excluded',()=>{
  const {b}=setup(),origin=[0,60,0];
  assert.equal(missileTarget('a','a',origin),null);
  b.creative=true;assert.equal(missileTarget('a','b',origin),null);b.creative=false;
  b.alive=false;assert.equal(missileTarget('a','b',origin),null);b.alive=true;
  assert.equal(missileTarget('a','offline',origin),null);
  NET.pvp=false;NET.pvpMark=true;assert.equal(missileTarget('a','b',origin),null);
});
test('disabling PvP during flight prevents damage',()=>{
  const {messages,fire}=setup();fire();NET.pvp=false;tick();assert.equal(messages.filter(m=>m[0]==='dmg').length,0);
});

test('animals can be targeted without PvP, consume one rocket and receive damage once',()=>{
  setup();NET.pvp=false;const cow=spawnMob('cow',20,0,60),loot=[];
  const give=NET.give;NET.give=(...args)=>loot.push(args);
  try{
    power.get(key(4)).launch={by:'a',pid:'animal:'+cow.nid};updatePower(.25,1);
    assert.equal(power.get(key(2)).ammo,1);tick();assert.equal(cow.dead,true);
    assert.equal(power.get(key(2)).hits,1);assert.ok(loot.length>0);const count=loot.length;tick();assert.equal(loot.length,count);
  }finally{NET.give=give;}
});
test('escaping animals are missed; dead, distant and non-animal targets cannot be selected',()=>{
  setup();NET.pvp=false;const sheep=spawnMob('sheep',20,0,60);
  power.get(key(4)).launch={by:'a',pid:'animal:'+sheep.nid};updatePower(.25,1);sheep.pos.x+=15;tick();assert.equal(sheep.dead,false);
  sheep.dead=true;assert.equal(missileTarget('a','animal:'+sheep.nid,[0,60,0]),null);
  const far=spawnMob('cow',200,0,60);assert.equal(missileTarget('a','animal:'+far.nid,[0,60,0]),null);
  const monster=spawnMob('golem',20,0,60);assert.equal(missileTarget('a','animal:'+monster.nid,[0,60,0]),null);
});
test('defense intercepts an animal-targeted rocket before it can hit',()=>{
  setup();NET.pvp=false;const cow=spawnMob('cow',20,0,60);
  blocks.set(key(5),'dirt_defense');markPowerDirty();updatePower(.25,1);
  power.get(key(4)).launch={by:'a',pid:'animal:'+cow.nid};updatePower(.25,1);tick();
  assert.equal(cow.hp,cow.def.hp);assert.equal(cow.dead,false);assert.equal(power.get(key(5)).intercepted,1);
});
