import test from 'node:test';
import assert from 'node:assert/strict';
import {blocks,blockMeta,power} from '../../shared/world/state.js';
import {loadWorld,worldState} from '../../shared/world/save.js';
import {solidAt} from '../../shared/world/collision.js';
import {MISSILE_SIZE,structureBox,structuresAt,rebuildMissileStructures,structurePorts} from '../../shared/world/missile-structures.js';
import {rebuildNets,updatePower,powerOf,netOf} from '../../shared/sim/power.js';
import {NET} from '../../shared/net/net.js';
function reset(){blocks.clear();blockMeta.clear();power.clear();NET.client=false;rebuildMissileStructures();}
test('full-size dimensions rotate and occupied cells resolve back to the saved anchor',()=>{
  reset();assert.deepEqual(MISSILE_SIZE.dirt_defense,[3,5,7]);
  assert.deepEqual(structureBox('missile_radar'),[-1,0,-3,2,5,4]);
  assert.deepEqual(structureBox('missile_radar',1),[-3,0,-1,4,5,2]);
  blocks.set('10,60,10','missile_radar');rebuildMissileStructures();
  assert.equal(structuresAt(10,64,7)[0].k,'10,60,10');assert.equal(solidAt(10,64,7),true);
  assert.equal(solidAt(10,65,7),false);assert.equal(solidAt(12,60,10),false);
  blockMeta.set('10,60,10',1);rebuildMissileStructures();
  assert.equal(solidAt(7,64,10),true);assert.equal(solidAt(10,64,7),false);
});
test('removing the anchor clears the entire collision footprint without ghost blocks',()=>{
  reset();blocks.set('0,60,0','dirt_silo');rebuildMissileStructures();assert.equal(solidAt(2,64,2),true);
  blocks.delete('0,60,0');assert.equal(solidAt(2,64,2),false);rebuildMissileStructures();assert.equal(structuresAt(2,64,2).length,0);
});
test('cables at outer ports power separated large devices, breaking them disconnects the grid',()=>{
  reset();blocks.set('0,60,0','dirt_source');blocks.set('7,60,0','dirt_silo');
  for(const x of [1,2,3,4])blocks.set(`${x},60,0`,'dirt_cable');
  power.set('0,60,0',{fuel:2});rebuildNets();updatePower(.25,1);
  assert.equal(powerOf('7,60,0').pw,1);assert.equal(netOf.get('0,60,0'),netOf.get('7,60,0'));
  blocks.delete('3,60,0');rebuildNets();updatePower(.25,1);assert.equal(powerOf('7,60,0').pw,0);
  assert.ok(structurePorts('missile_radar',10,60,10,1).some(p=>p.join(',')==='6,60,10'));
});
test('old anchor-only saves retain orientation, ammo, fuel and the reconstructed footprint',()=>{
  reset();blocks.set('10,60,10','missile_radar');blockMeta.set('10,60,10',1);power.set('10,60,10',{pw:0});
  const saved=JSON.parse(JSON.stringify(worldState()));reset();loadWorld(saved);rebuildNets();
  assert.equal(blocks.get('10,60,10'),'missile_radar');assert.equal(solidAt(7,64,10),true);assert.equal(blockMeta.get('10,60,10'),1);
});
