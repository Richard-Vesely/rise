// Herní radar: polohy již připojených hráčů, výběr cíle a příkaz pro držitele světa.
import { NET } from '../../../shared/net/net.js';
import { others } from '../../../shared/net/room.js';
import { MISSILE_RANGE, MISSILE_ANIMALS, isAnimalTarget } from '../../../shared/sim/missile-targeting.js';
import { mobs, MOBS } from '../../../shared/sim/mobs.js';
import { blocks, power } from '../../../shared/world/state.js';
import { player, creative } from '../player/player.js';

const selected=new Map();
export function renderMissileMap(mount,k,net,ready,refresh){
  const st=power.get(k)||{}, [x,,z]=k.split(',').map(Number), me=NET.pid||'host';
  const players=[{pid:me,name:NET.name+' (ty)',x:player.pos.x,y:player.pos.y,z:player.pos.z,alive:player.alive,cr:creative}];
  for(const [pid,p] of others){if(p.pose&&pid!==me)players.push({pid,name:p.name,...p.pose});}
  for(const m of mobs)if(!m.dead&&m.hp>0&&MISSILE_ANIMALS.includes(m.type))players.push({pid:`animal:${m.nid}`,name:MOBS[m.type].name+' #'+m.nid,x:m.pos.x,y:m.pos.y,z:m.pos.z,alive:true,animal:true});
  const targets=players.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)&&Math.hypot(p.x-x,p.z-z)<=MISSILE_RANGE);
  if(!targets.some(p=>p.pid===selected.get(k)&&p.alive&&!p.cr))selected.delete(k);
  const note=document.createElement('p');note.textContent=`Mapa hráčů a zvířat · dosah ${MISSILE_RANGE} bloků · sever nahoře. Klikni na cíl.`;mount.append(note);
  const map=document.createElement('div');map.id='missile-map';map.setAttribute('aria-label','Mapa hráčů a zvířat v okolí centra');
  map.style.cssText='position:relative;width:min(100%,300px);height:240px;overflow:hidden;background:repeating-linear-gradient(0deg,transparent 0 29px,#174356 30px),repeating-linear-gradient(90deg,#071b27 0 29px,#174356 30px);border:1px solid #35b9e8;border-radius:6px;margin:8px 0';
  const center=document.createElement('span');center.textContent='＋';center.title='Kontrolní centrum';center.style.cssText='position:absolute;left:50%;top:50%;color:#fff;transform:translate(-50%,-50%)';map.append(center);mount.append(map);
  const choose=pid=>{selected.set(k,pid);refresh();};
  const list=document.createElement('div');list.style.cssText='display:flex;gap:5px;flex-wrap:wrap';mount.append(list);
  for(const p of targets){
    const own=p.pid===me, active=selected.get(k)===p.pid;
    const marker=document.createElement('button');marker.type='button';marker.textContent=own?'◆':active?'◎':'●';marker.title=p.name;marker.setAttribute('aria-label',`Zaměřit ${p.name}`);marker.dataset.target=p.pid;
    marker.style.cssText=`position:absolute;left:${50+(p.x-x)/MISSILE_RANGE*47}%;top:${50+(p.z-z)/MISSILE_RANGE*47}%;transform:translate(-50%,-50%);background:#092c41;color:${own?'#43ddff':active?'#ffb63c':p.animal?'#82e682':'#ff6868'};border:1px solid currentColor;border-radius:50%;padding:3px 6px;cursor:pointer`;
    marker.disabled=own||!p.alive||p.cr;marker.onclick=()=>choose(p.pid);map.append(marker);
    const row=document.createElement('button');row.className='mc-btn';row.type='button';row.textContent=`${active?'◎ ':''}${p.name} · ${Math.round(Math.hypot(p.x-x,p.z-z))} m${p.cr?' · kreativní režim':''}`;
    row.disabled=marker.disabled;row.onclick=()=>choose(p.pid);list.append(row);
  }
  const target=targets.find(p=>p.pid===selected.get(k));
  const loaded=net?.keys.some(key=>blocks.get(key)==='dirt_silo'&&power.get(key)?.pw&&power.get(key)?.ammo>0&&!power.get(key)?.cooldown&&!power.get(key)?.shots?.length);
  const launch=document.createElement('button');launch.type='button';launch.className='mc-btn';launch.id='missile-target-launch';launch.textContent=target?`Odpálit na ${target.name}`:'Vyber cíl na mapě';
  launch.disabled=!target||target.pid===me||!st.pw||!ready||!loaded||(!isAnimalTarget(target?.pid)&&!(NET.pvp||NET.pvpMark))||!!st.launch;
  launch.onclick=()=>{power.set(k,{...power.get(k),launch:{pid:target.pid,by:me}});refresh();};mount.append(launch);
  const status=document.createElement('p');status.textContent=!(NET.pvp||NET.pvpMark)&&!isAnimalTarget(target?.pid)?'Zelené značky jsou zvířata – lze je zaměřit i ve hře pro jednoho. Hráči potřebují PvP.':st.result||'Potřebuješ napájený radar a nabité silo ve stejné datové síti. Raketa míří na polohu při odpalu; cíl může utéct.';mount.append(status);
}
