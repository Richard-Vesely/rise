// Cílený odpal i zásah ověřuje držitel světa. Používá existující PvP pravidla a zprávu dmg.
import { NET } from '../net/net.js';
import { hitPlayer } from '../net/room.js';
import { isMark } from '../world/terrain.js';
import { mobs, hurtMob } from './mobs.js';

export const MISSILE_RANGE = 80, MISSILE_RADIUS = 3.5;
const player = pid => NET.targets().find(t=>(t.pid ?? 'host')===pid);
export const MISSILE_ANIMALS = ['sheep','boar','chicken','cow','deer','wolf'];
export const isAnimalTarget = pid => typeof pid==='string'&&pid.startsWith('animal:');
const animal = pid => mobs.find(m=>`animal:${m.nid}`===pid&&!m.dead&&m.hp>0&&MISSILE_ANIMALS.includes(m.type));
export function missileTarget(by,pid,from) {
  if(isAnimalTarget(pid)){
    if(!player(by)?.alive)return null;
    const m=animal(pid);if(!m)return null;
    const to=[m.pos.x,m.pos.y+(m.def?.cy||.7),m.pos.z];
    return to.every(Number.isFinite)&&Math.hypot(...to.map((p,i)=>p-from[i]))<=MISSILE_RANGE?to:null;
  }
  if (!(NET.pvp || NET.pvpMark) || by===pid) return null;
  const a=player(by), t=player(pid);
  if(!a?.alive||!t?.alive||a.creative||t.creative)return null;
  if(NET.pvpMark&&(!isMark(a.pos.x)||!isMark(t.pos.x)||!isMark(from[0])))return null;
  const to=[t.pos.x,t.pos.y+1,t.pos.z];
  if(!to.every(Number.isFinite)||Math.hypot(...to.map((p,i)=>p-from[i]))>MISSILE_RANGE)return null;
  return to;
}
export function missileImpact(shot) {
  if(!shot.target||!shot.by)return false;
  const to=missileTarget(shot.by,shot.target,shot.from);
  if(!to||Math.hypot(...to.map((p,i)=>p-shot.to[i]))>MISSILE_RADIUS)return false;
  const yaw=Math.atan2(shot.from[0]-to[0],shot.from[2]-to[2]);
  if(isAnimalTarget(shot.target)){
    const m=animal(shot.target);if(!m)return false;
    const previous=NET.killer;NET.killer=shot.by==='host'?null:shot.by;
    try{return hurtMob(m,20,yaw,1.5);}finally{NET.killer=previous;}
  }
  return hitPlayer(shot.by,shot.target,12,yaw,1.5,true);
}
