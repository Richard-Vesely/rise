// Rozměry velkých strojů v blocích; kotva a uložení zůstávají jediným původním blokem.
import { blocks,blockMeta,bkey } from './state.js';
export const MISSILE_SIZE={dirt_source:[1,1,1],dirt_silo:[5,5,5],dirt_defense:[3,5,7],missile_radar:[3,5,7],missile_control:[7,4,3]};
const occupied=new Map();
export function structureBox(type,meta=0){
  const size=MISSILE_SIZE[type];if(!size)return null;
  let [w,h,d]=size;if(meta&1)[w,d]=[d,w];
  return [.5-w/2,0,.5-d/2,.5+w/2,h,.5+d/2];
}
export function structureCells(type,x,y,z,meta=0){
  const b=structureBox(type,meta);if(!b)return [];
  const cells=[];
  for(let cy=y;cy<y+b[4];cy++)for(let cz=Math.floor(z+b[2]);cz<Math.ceil(z+b[5]);cz++)for(let cx=Math.floor(x+b[0]);cx<Math.ceil(x+b[3]);cx++)cells.push([cx,cy,cz]);
  return cells;
}
export function rebuildMissileStructures(){
  occupied.clear();
  for(const [k,type] of blocks){
    if(!MISSILE_SIZE[type])continue;
    const [x,y,z]=k.split(',').map(Number),meta=blockMeta.get(k)||0,b=structureBox(type,meta);
    const entry={k,type,x,y,z,box:b.map((v,i)=>v+[x,y,z][i%3])};
    for(const c of structureCells(type,x,y,z,meta)){
      const key=bkey(...c);if(!occupied.has(key))occupied.set(key,[]);occupied.get(key).push(entry);
    }
  }
}
export const structuresAt=(x,y,z)=>(occupied.get(bkey(x,y,z))||[]).filter(e=>blocks.get(e.k)===e.type);
export function structurePorts(type,x,y,z,meta=0){
  const b=structureBox(type,meta);if(!b)return [];
  return [[Math.floor(x+b[0])-1,y,z],[Math.ceil(x+b[3]),y,z],[x,y,Math.floor(z+b[2])-1],[x,y,Math.ceil(z+b[5])]];
}
