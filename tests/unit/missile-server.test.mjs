import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {player,pose,sleep,startServer,stop} from './server-helpers.mjs';
test('two players: server attributes a control launch to its sender and delivers the missile impact',{timeout:60000},async()=>{
  const server=await startServer({DATA_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'rise-target-')),WORLDS:'arena:Aréna:pvp'});
  let a,b;
  try{
    a=player(server.port,'Pilot');assert.ok(await a.waitFor(m=>m[0]==='welcome'));
    b=player(server.port,'Cil');assert.ok(await b.waitFor(m=>m[0]==='welcome'));
    a.send(['pose',{...pose(0,5),y:60}]);b.send(['pose',{...pose(20,0),y:60}]);
    a.send(['ops',0,[[0,'dirt_source'],[1,'dirt_cable'],[2,'dirt_silo'],[3,'missile_radar'],[4,'missile_control']].map(([x,id])=>['m','blocks',`${x},60,0`,id])]);
    a.send(['kv',[['power','0,60,0',{fuel:5}],['power','2,60,0',{ammo:1}]]]);
    await sleep(600);
    // Falešné by se nerespektuje: kdyby zůstalo b, server by odmítl útok na sebe sama.
    a.send(['kv',[['power','4,60,0',{launch:{pid:b.welcome.pid,by:b.welcome.pid}}]]]);
    const launched=await a.waitFor(m=>m[0]==='kv'&&m[1].some(([map,k,s])=>map==='power'&&k==='2,60,0'&&s?.shots?.length));
    assert.ok(launched);
    const shot=launched[1].find(([map,k])=>map==='power'&&k==='2,60,0')[2].shots[0];
    assert.equal(shot.by,a.welcome.pid);assert.equal(shot.target,b.welcome.pid);
    const hit=await b.waitFor(m=>m[0]==='dmg'&&m[1]===30);assert.ok(hit);
    await sleep(500);assert.equal(b.msgs.filter(m=>m[0]==='dmg'&&m[1]===30).length,1);
  }finally{if(a)await a.close();if(b)await b.close();await stop(server);}
});
