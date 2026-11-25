import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {terrainH} from '../../shared/world/terrain.js';
import {player,pose,startServer,stop,sleep} from './server-helpers.mjs';
test('server validates launcher muzzle and broadcasts one projectile with its origin to both players',{timeout:30000},async()=>{
  const srv=await startServer({DATA_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'rise-launcher-'))});let a,b;
  try{
    a=player(srv.port,'Strelec');assert.ok(await a.waitFor(m=>m[0]==='welcome'));
    b=player(srv.port,'Divak');assert.ok(await b.waitFor(m=>m[0]==='welcome'));
    const y=terrainH(330,300);
    a.send(['pose',{...pose(300,300),y:y+1}]);b.send(['pose',{...pose(330,300),y}]);await sleep(200);
    a.send(['nuke',330,y,300,[100,y+1.5,300]]);await sleep(300);
    assert.equal(b.msgs.some(m=>m[0]==='fx'&&m[1]==='nuke-shot'),false);
    a.send(['nuke',330,y,300,[300,y+1.5,300]]);
    for(const p of [a,b]){const fx=await p.waitFor(m=>m[0]==='fx'&&m[1]==='nuke-shot');assert.ok(fx);assert.deepEqual(fx[6],[300,y+1.5,300]);}
    assert.ok(await b.waitFor(m=>m[0]==='ops'&&m[1].some(o=>o[0]==='v')));
    assert.equal(b.msgs.some(m=>m[0]==='dmg'),false); // svědek má PvP vypnuté
  }finally{if(a)await a.close();if(b)await b.close();await stop(srv);}
});
