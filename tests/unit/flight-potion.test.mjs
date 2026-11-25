import test from 'node:test';
import assert from 'node:assert/strict';
import {FLIGHT_POTION,INFINITE_FLIGHT,flightPotionCommand,flightTime} from '../../shared/sim/flight-potion.js';
import {ITEMS} from '../../shared/data/index.js';
import {cleanMe} from '../../server/me.js';
test('only the exact potion chat word grants the flight bottle, ignoring case and surrounding spaces',()=>{
  for(const text of ['potion','POTION',' PoTiOn '])assert.equal(flightPotionCommand(text),true);
  for(const text of ['','/potion','dej potion','potions',null,42])assert.equal(flightPotionCommand(text),false);
  assert.equal(ITEMS[FLIGHT_POTION].infiniteFlight,true);assert.equal(ITEMS[FLIGHT_POTION].art[0],'bottle');
});
test('infinite flight does not count down, while normal apple and wing timers expire',()=>{
  assert.equal(flightTime(INFINITE_FLIGHT,3600),INFINITE_FLIGHT);
  assert.equal(flightTime(30,.25),29.75);assert.equal(flightTime(10,15),0);
});
test('flight effect and potion round-trip through JSON and existing server profile validation',()=>{
  const me={inv:Array(36).fill(null),armor:Array(4).fill(null),pos:[10,40,20],flyT:INFINITE_FLIGHT};me.inv[0]={id:FLIGHT_POTION,n:1};
  const saved=JSON.parse(JSON.stringify(me)),clean=cleanMe(saved);
  assert.ok(clean);assert.equal(clean.flyT,INFINITE_FLIGHT);assert.deepEqual(clean.inv[0],me.inv[0]);
});
