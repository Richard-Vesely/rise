import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { player, sleep, startServer, stop } from './server-helpers.mjs';

const update=(key,check)=>m=>m[0]==='kv'&&m[1].some(([map,k,st])=>map==='power'&&k===key&&st&&check(st));
test('server owns clay launches and interceptions, broadcasts to both players and preserves ammo on restart',{timeout:60000},async()=>{
  const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'rise-clay-'));
  const env={DATA_DIR:dataDir,ROOM_PASSWORD:'hlina-test',SAVE_SECONDS:'1'};
  let server=await startServer(env),a,b,c;
  try{
    a=player(server.port,'Hlinar','hlina-test');assert.ok(await a.waitFor(m=>m[0]==='welcome'));
    b=player(server.port,'Pozorovatel','hlina-test');assert.ok(await b.waitFor(m=>m[0]==='welcome'));
    a.send(['ops',0,[[0,'dirt_source'],[1,'dirt_cable'],[2,'dirt_silo'],[3,'dirt_cable'],[4,'dirt_defense']].map(([x,id])=>['m','blocks',`${x},60,0`,id])]);
    a.send(['ops',0,[['m','blocks','4,60,1','missile_radar'],['m','blocks','4,60,2','missile_control']]]);
    a.send(['kv',[['power','0,60,0',{fuel:10,pw:0}],['power','2,60,0',{ammo:1,fire:true,pw:0}]]]);
    assert.ok(await a.waitFor(update('2,60,0',st=>st.launched===1&&st.ammo===0)));
    assert.ok(await b.waitFor(update('4,60,0',st=>st.intercepted===1)));
    await sleep(1200);await a.close();await b.close();await stop(server);
    server=await startServer(env);c=player(server.port,'Hlinar','hlina-test');
    assert.ok(await c.waitFor(m=>m[0]==='welcome'));
    assert.equal(c.welcome.world.power['2,60,0'].ammo,0);
    assert.equal(c.welcome.world.power['4,60,0'].intercepted,1);
  }finally{
    for(const client of [a,b,c])if(client)await client.close();
    await stop(server);
  }
});
