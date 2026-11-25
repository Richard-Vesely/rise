import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, ITEMS, RECIPES } from '../../shared/data/index.js';
import { NET } from '../../shared/net/net.js';
import { blockMeta, blocks, power } from '../../shared/world/state.js';
import { loadWorld, worldState } from '../../shared/world/save.js';
import { markPowerDirty, netOf, powerOf, rebuildNets, updatePower } from '../../shared/sim/power.js';
import { CLAY_FLIGHT, rocketPosition } from '../../shared/sim/clay-defense.js';
import { blockMaterial } from '../../client/src/audio/materials.js';

const key=x=>`${x},60,0`;
function fresh() {
  blocks.clear();power.clear();blockMeta.clear();NET.mode='sp';NET.client=false;
  blocks.set(key(0),'dirt_source');blocks.set(key(1),'dirt_cable');
  blocks.set(key(2),'dirt_silo');blocks.set(key(3),'dirt_cable');blocks.set(key(4),'dirt_defense');
  blocks.set('4,60,1','missile_radar');blocks.set('4,60,2','missile_control');
  power.set(key(0),{pw:0,fuel:10});
  markPowerDirty();updatePower(.25,1);
  return {silo:powerOf(key(2)),defense:powerOf(key(4))};
}
const tick=seconds=>{for(let n=0;n<seconds/.25;n++)updatePower(.25,1);};

test('missile equipment crafts from metal and electronics and sounds like metal',()=>{
  for(const id of ['dirt_source','dirt_cable','dirt_silo','dirt_defense','dirt_rocket','missile_radar','missile_control']) {
    assert.ok(ITEMS[id]);const r=RECIPES.find(r=>r.out===id);
    assert.ok(r.w<=2&&r.h<=2&&!r.adv);
    assert.ok(Object.values(r.key).every(v=>['steel_plate','copper_wire','circuit_board'].includes(v)));
    if(BLOCKS[id])assert.equal(blockMaterial(id),'metal');
  }
});
test('dirt wires power the system and breaking a wire disables defense; metal networks stay isolated',()=>{
  const {silo,defense}=fresh();assert.equal(silo.pw,1);assert.equal(defense.pw,1);
  blocks.set('0,60,1','electric_lamp');markPowerDirty();updatePower(.25,1);
  assert.equal(powerOf('0,60,1').pw,0);
  assert.notEqual(netOf.get(key(0)),netOf.get('0,60,1'));
  blocks.delete(key(3));markPowerDirty();updatePower(.25,1);
  assert.equal(defense.pw,0);assert.equal(silo.pw,1);
});
test('one loaded rocket launches, flies visibly, and an online defense intercepts it once',()=>{
  const {silo,defense}=fresh();silo.ammo=2;silo.fire=true;
  updatePower(.25,1);assert.equal(silo.ammo,1);assert.equal(silo.shots.length,1);
  assert.equal(silo.launched,1);assert.equal(defense.intercepted||0,0);
  tick(1);assert.equal(silo.shots.length,0);assert.equal(defense.intercepted,1);assert.equal(silo.stopped,1);
  assert.ok(defense.burst.at.every(Number.isFinite));
  tick(1);assert.equal(defense.intercepted,1);assert.equal(silo.ammo,1);
});
test('disconnected defense cannot intercept; ammo, cooldown and power are required',()=>{
  const {silo,defense}=fresh();blocks.delete(key(3));markPowerDirty();
  silo.ammo=1;silo.fire=true;updatePower(.25,1);silo.fire=true;updatePower(.25,1);
  assert.equal(silo.launched,1);assert.equal(silo.ammo,0);
  tick(CLAY_FLIGHT);assert.equal(silo.landed,1);assert.equal(defense.intercepted||0,0);
  silo.fire=true;updatePower(.25,1);assert.equal(silo.launched,1);
  blocks.delete(key(1));markPowerDirty();silo.ammo=1;silo.fire=true;updatePower(.25,1);
  assert.equal(silo.ammo,1);assert.equal(silo.launched,1);
});
test('flight follows silo orientation and device state survives the existing save format',()=>{
  const {silo}=fresh();blocks.delete(key(4));blockMeta.set(key(2),1);markPowerDirty();
  silo.ammo=2;silo.fire=true;updatePower(.25,1);
  const shot=silo.shots[0];assert.ok(shot.to[0]>shot.from[0]+23);
  assert.ok(rocketPosition(shot)[1]>shot.from[1]);
  assert.deepEqual(rocketPosition({...shot,age:CLAY_FLIGHT}),shot.to);
  const saved=JSON.parse(JSON.stringify(worldState()));
  blocks.clear();power.clear();blockMeta.clear();loadWorld(saved);markPowerDirty();rebuildNets();
  assert.equal(powerOf(key(2)).ammo,1);assert.equal(powerOf(key(2)).shots[0].id,shot.id);
  assert.equal(blocks.get(key(1)),'dirt_cable');
});
test('joined clients do not simulate or duplicate rockets',()=>{
  const {silo}=fresh();silo.ammo=1;silo.fire=true;
  const mode=NET.mode;NET.mode='client';NET.client=true;
  try{updatePower(.25,1);assert.equal(silo.ammo,1);assert.equal(silo.fire,true);assert.equal(silo.shots?.length||0,0);}
  finally{NET.mode=mode;NET.client=false;}
});

test('radar and control must both be powered on the launcher network',()=>{
  for(const missing of ['4,60,1','4,60,2']){
    const {silo,defense}=fresh();blocks.delete(missing);markPowerDirty();
    silo.ammo=1;silo.fire=true;tick(CLAY_FLIGHT+.5);
    assert.equal(defense.intercepted||0,0);assert.equal(silo.landed,1);
  }
  const {silo,defense}=fresh();blocks.delete('4,60,2');blocks.set('0,60,1','missile_control');
  blocks.delete(key(3));blocks.set('4,60,-1','dirt_source');power.set('4,60,-1',{pw:0,fuel:10});markPowerDirty();
  silo.ammo=1;silo.fire=true;tick(CLAY_FLIGHT+.5);
  assert.equal(defense.pw,1);assert.equal(defense.intercepted||0,0);
});

test('dirt generator consumes dirt, stops without fuel and preserves burn in saves',()=>{
  fresh();const source=powerOf(key(0));source.fuel=0;source.burn=0;updatePower(.25,1);
  assert.equal(source.pw,0);assert.equal(powerOf(key(2)).pw,0);
  source.fuel=2;updatePower(.25,1);assert.equal(source.fuel,1);assert.equal(source.burn,60);assert.equal(source.pw,1);
  tick(60);assert.equal(source.fuel,0);assert.equal(source.pw,1);assert.equal(source.burn,60);
  const save=JSON.parse(JSON.stringify(worldState()));loadWorld(save);markPowerDirty();
  assert.equal(powerOf(key(0)).burn,60);assert.equal(powerOf(key(0)).fuel,0);
  tick(60);assert.equal(powerOf(key(0)).pw,0);assert.equal(powerOf(key(2)).pw,0);
});
test('idle dirt generator does not consume a new block of fuel',()=>{
  blocks.clear();power.clear();blocks.set(key(0),'dirt_source');power.set(key(0),{fuel:2,burn:0,pw:0});markPowerDirty();
  updatePower(.25,1);assert.equal(powerOf(key(0)).fuel,2);assert.equal(powerOf(key(0)).pw,0);
});
