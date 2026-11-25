import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {player,startServer,stop,sleep} from './server-helpers.mjs';
test('chat potion grants one flight bottle to its sender; ordinary chat remains shared',{timeout:30000},async()=>{
  const srv=await startServer({DATA_DIR:fs.mkdtempSync(path.join(os.tmpdir(),'rise-flight-'))});let a,b;
  try{
    a=player(srv.port,'Letec');assert.ok(await a.waitFor(m=>m[0]==='welcome'));
    b=player(srv.port,'Soused');assert.ok(await b.waitFor(m=>m[0]==='welcome'));
    a.send(['chat','  PoTiOn  ']);const give=await a.waitFor(m=>m[0]==='give'&&m[1]==='flight_potion');assert.deepEqual(give,['give','flight_potion',1]);
    a.send(['chat','mám potion']);assert.ok(await b.waitFor(m=>m[0]==='chat'&&m[2]==='mám potion'));
    await sleep(200);assert.equal(a.msgs.filter(m=>m[0]==='give'&&m[1]==='flight_potion').length,1);
    assert.equal(b.msgs.some(m=>m[0]==='give'&&m[1]==='flight_potion'),false);
  }finally{if(a)await a.close();if(b)await b.close();await stop(srv);}
});
