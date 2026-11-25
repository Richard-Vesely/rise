// Kovové raketové zařízení, radar, kontrolní centrum a letové efekty.
import * as THREE from 'three';
import { BLOCKS } from '../../../shared/data/index.js';
import { CLAY_RADAR, defenseReady, isClayDevice, rocketPosition } from '../../../shared/sim/clay-defense.js';
import { netOf, netStats, powerOf } from '../../../shared/sim/power.js';
import { blocks, power } from '../../../shared/world/state.js';
import { Sound } from '../audio/sound.js';
import { inv, countItem } from '../player/inventory.js';
import { specials } from '../render/blocks.js';
import { camera, scene } from '../render/renderer.js';

import { toast } from '../ui/hud.js';
import { renderInventory, renderHotbar } from '../ui/inventory-ui.js';
import { builder } from './machine-models.js';
import { MISSILE_SIZE } from '../../../shared/world/missile-structures.js';
import { renderMissileMap } from './missile-map.js';

let materials;
function clay() {
  return materials ||= {
    earth: new THREE.MeshStandardMaterial({ color: 0x65754b, roughness: .48, metalness: .65 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x29343e, roughness: .35, metalness: .8 }),
    light: new THREE.MeshStandardMaterial({ color: 0xc9d1d7, roughness: .25, metalness: .85 }),
    dust: new THREE.MeshStandardMaterial({ color: 0xff8a26, emissive: 0xff5500, emissiveIntensity: 2, transparent: true, opacity: 0.45, roughness: 1, depthWrite: false }),
  };
}
export function buildClayRocket(withExhaust=true) {
  const g = new THREE.Group(), { cyl, box } = builder(g), M = clay();
  cyl(0.095, 0.095, 0.48, M.light, 0, 0, 0, 10);
  cyl(0, 0.095, 0.23, M.light, 0, 0.355, 0, 10);
  cyl(0.065, 0.105, 0.1, M.dark, 0, -0.28, 0, 10);
  for (const a of [0, Math.PI/2]) { const fin = box(0.32,0.15,0.035,M.dark,0,-0.16,0); fin.rotation.y=a; }
  if(!withExhaust)return g;
  const exhaust=new THREE.Group();exhaust.visible=false;g.add(exhaust);g.userData.exhaust=exhaust;
  const fire=new THREE.Mesh(new THREE.ConeGeometry(.075,.55,8),new THREE.MeshBasicMaterial({color:0xffa52c}));
  fire.rotation.z=Math.PI;fire.position.y=-.6;exhaust.add(fire);
  const smoke=new THREE.MeshBasicMaterial({color:0xe2e6e8,transparent:true,opacity:.45,depthWrite:false});
  for(let i=0;i<5;i++){const puff=new THREE.Mesh(new THREE.SphereGeometry(.08+i*.025,6,4),smoke);puff.position.y=-.95-i*.23;exhaust.add(puff);}
  return g;
}
export function buildClayModel(type, g) {
  const { box, cyl } = builder(g), M = clay(), U = g.userData;
  const glass=new THREE.MeshStandardMaterial({color:0x34516a,metalness:.35,roughness:.18});
  const blue=new THREE.MeshBasicMaterial({color:0x3bcaff});
  const yellow=new THREE.MeshStandardMaterial({color:0xe2b23c,roughness:.6});
  const concrete=new THREE.MeshStandardMaterial({color:0x93968e,roughness:.95});
  function truck(){
    box(2.35,.4,6.4,M.dark,0,.85,0);
    box(2.5,.28,4.1,M.earth,0,1.3,-.9);
    box(2.3,1.65,1.7,M.earth,0,1.72,2.15);
    box(1.95,.65,.06,glass,0,2.08,3.03);
    box(.07,.7,1.2,glass,-1.17,2.08,2.2);box(.07,.7,1.2,glass,1.17,2.08,2.2);
    box(2.45,.22,.2,M.dark,0,.88,3.2);
    for(const x of [-.8,.8])box(.32,.22,.08,M.light,x,1.35,3.05);
    for(const x of [-1.2,1.2])for(const z of [-2.2,-.5,2.15]){
      const tire=cyl(.53,.53,.3,M.dark,x,.55,z,16);tire.rotation.z=Math.PI/2;
      const hub=cyl(.28,.28,.32,M.earth,x,.55,z,12);hub.rotation.z=Math.PI/2;
    }
    for(const x of [-1.35,1.35])for(const z of [-2.4,.8]){box(.16,.6,.16,M.light,x,.4,z);box(.3,.12,.35,M.dark,x,.08,z);}
  }
  if(type==='dirt_silo'){
    box(4.9,.22,4.9,concrete,0,.11,0);
    for(const x of [-2.2,2.2])box(.45,4.6,4.8,concrete,x,2.4,0);
    box(4.8,4.6,.4,concrete,0,2.4,-2.2);
    for(const x of [-1.65,1.65]){
      box(.3,4.4,.3,M.dark,x,2.4,2.1);
      for(let y=.4;y<4.5;y+=.45)box(.31,.17,.32,yellow,x,y,2.12);
    }
    box(2.8,.16,2.8,M.dark,0,.32,0);
    U.clayRocket=buildClayRocket(false);U.clayRocket.scale.setScalar(4);U.clayRocket.position.y=2.2;g.add(U.clayRocket);
    const lid=new THREE.Group();lid.position.set(-2.35,4.65,0);g.add(lid);
    box(4.7,.22,4.7,M.earth,2.35,0,0,0,lid);U.clayLid=lid;
    for(const x of [-2.1,2.1])box(.15,.15,.15,blue,x,4.8,2.1);
    for(const x of [-.85,.85])box(.13,3.4,.13,M.light,x,2,-1.55);
  }else if(type==='missile_control'){
    box(6.9,.25,2.9,M.dark,0,.125,0);
    box(6.8,.22,2.8,M.earth,0,2.8,0);
    for(const x of [-3.25,3.25])box(.35,2.5,2.8,M.earth,x,1.5,0);
    box(6.5,2.5,.2,M.earth,0,1.5,-1.25);
    for(const x of [-2.05,0,2.05]){
      box(1.9,1.22,.12,M.dark,x,1.82,-1.06);
      box(1.65,.95,.04,blue,x,1.83,-.98);
      for(let j=0;j<4;j++)box(1.4,.025,.02,M.light,x,1.5+j*.19,-.95);
      box(1.8,.18,.9,M.dark,x,.94,-.65);
      box(.9,.04,.3,M.light,x,1.05,-.35);
    }
    for(const x of [-1.4,1.4]){
      cyl(.07,.07,.6,M.dark,x,.45,.55,8);box(.7,.16,.65,M.dark,x,.75,.55);box(.7,.8,.13,M.dark,x,1.1,.85);
    }
    for(const x of [-2.8,2.8])box(.08,.12,1.5,M.light,x,2.64,0);
    cyl(.035,.035,1.1,M.dark,2.8,3.12,-.9,8);
  }else if(type==='missile_radar'){
    truck();cyl(.5,.65,1.15,M.dark,0,2,-1);
    U.clayRadar=new THREE.Group();U.clayRadar.position.set(0,3.05,-1);g.add(U.clayRadar);
    const panel=new THREE.Group();panel.rotation.x=-.3;U.clayRadar.add(panel);
    box(2.55,2.35,.18,M.earth,0,.5,0,0,panel);
    for(let x=-.95;x<=1;x+=.48)for(let y=-.35;y<1.5;y+=.45)box(.35,.32,.035,M.light,x,y,.115,0,panel);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(1.3,.018,6,48),blue);ring.position.z=.18;U.clayRadar.add(ring);
  }else if(type==='dirt_defense'){
    truck();cyl(.7,.8,.5,M.dark,0,1.65,-1,16);
    U.clayRadar=new THREE.Group();U.clayRadar.position.set(0,1.85,-1);g.add(U.clayRadar);U.fixedLauncher=true;
    const rack=new THREE.Group();rack.rotation.x=-.55;U.clayRadar.add(rack);
    for(const x of [-.8,0,.8])for(const z of [-.45,.45]){
      box(.74,3.1,.8,M.earth,x,1.5,z,0,rack);
      box(.62,.05,.66,M.dark,x,3.06,z,0,rack);
      box(.66,.12,.82,M.light,x,.55,z,0,rack);
      box(.66,.12,.82,M.light,x,2.5,z,0,rack);
    }
  }else{
    box(.94,.12,.94,M.dark,0,.06,0);box(.72,.55,.72,M.earth,0,.4,0);
    U.clayRotor=new THREE.Group();U.clayRotor.position.y=.84;g.add(U.clayRotor);
    const wheel=new THREE.Mesh(new THREE.TorusGeometry(.28,.055,6,16),M.light);wheel.rotation.x=Math.PI/2;U.clayRotor.add(wheel);
    box(.6,.06,.07,M.dark,0,0,0,0,U.clayRotor);box(.07,.06,.6,M.dark,0,0,0,0,U.clayRotor);
    cyl(.06,.06,.25,M.dark,0,.7,0,8);
  }
  g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
}

const flights=new Map(), bursts=new Map(), heard=new Map();
const up=new THREE.Vector3(0,1,0), direction=new THREE.Vector3();
function closeEnough(p) { return Math.hypot(p[0]-camera.position.x,p[1]-camera.position.y,p[2]-camera.position.z)<100; }
function cue(k, id, point, launch) {
  if(heard.get(k)===id)return;
  const known=heard.has(k);heard.set(k,id);
  if(!known||!id)return;
  Sound.at(...point,()=>{
    if(launch)Sound.burst({dur:.45,f0:350,f1:1800,vol:.13,type:'lowpass',attack:.05});
    else Sound.burst({dur:.5,f0:700,f1:60,vol:.22,type:'lowpass'});
  });
}
export function updateClayVisuals(dt, time) {
  const live=new Set(), dust=new Set();
  for(const [k,s] of specials) {
    if(!isClayDevice(s.type))continue;
    const st=power.get(k)||{}, U=s.obj.userData;
    if(U.clayRotor&&st.pw)U.clayRotor.rotation.y+=dt*1.4;
    if(U.clayRadar&&st.pw&&!U.fixedLauncher)U.clayRadar.rotation.y=time*.8;
    if(U.clayRocket)U.clayRocket.visible=(st.ammo||0)>0&&!st.shots?.length;
    if(U.clayLid)U.clayLid.rotation.z=st.shots?.length?1.5:0;
    cue(k+':launch',st.serial||0,[s.x+.5,s.y+1,s.z+.5],true);
    cue(k+':burst',st.burst?.id,[s.x+.5,s.y+1,s.z+.5],false);
    for(const shot of st.shots||[]) {
      if(!closeEnough(shot.from))continue;
      live.add(shot.id);
      let f=flights.get(shot.id);
      if(!f){const obj=buildClayRocket();obj.scale.setScalar(3);obj.userData.exhaust.visible=true;obj.name='clay-rocket';scene.add(obj);f={obj,age:-1};flights.set(shot.id,f);}
      if(f.age!==shot.age){f.age=shot.age;f.received=time;}
      const extra=Math.min(.28,Math.max(0,time-f.received)), p=rocketPosition(shot,extra), next=rocketPosition(shot,extra+.03);
      f.obj.position.set(...p);direction.set(next[0]-p[0],next[1]-p[1],next[2]-p[2]);
      if(direction.lengthSq()>0)f.obj.quaternion.setFromUnitVectors(up,direction.normalize());
    }
    const b=st.burst;
    if(b&&closeEnough(b.at)) {
      dust.add(b.id);
      let d=bursts.get(b.id);
      if(!d) {
        const obj=new THREE.Group();obj.name='clay-interception';obj.position.set(...b.at);
        for(let i=0;i<10;i++){const m=new THREE.Mesh(new THREE.IcosahedronGeometry(.13,0),clay().dust);obj.add(m);}
        const interceptor=s.type==='dirt_defense'?buildClayRocket():null;
        if(interceptor){interceptor.userData.exhaust.visible=true;interceptor.scale.setScalar(2);obj.add(interceptor);}
        scene.add(obj);d={obj,interceptor,started:time,from:[s.x+.5-b.at[0],s.y+4-b.at[1],s.z+.5-b.at[2]]};bursts.set(b.id,d);
      }
      const age=Math.max(b.age,time-d.started), phase=Math.min(1,Math.max(0,age-.2)/.7);
      d.obj.children.slice(0,10).forEach((m,i)=>{const a=i*2.4;m.visible=age>=.2;m.position.set(Math.cos(a)*phase*1.4,Math.sin(i*3)*phase+.2,Math.sin(a)*phase*1.4);m.scale.setScalar(1+phase*2);});
      if(d.interceptor){d.interceptor.visible=age<.25;d.interceptor.position.set(...d.from.map(p=>p*(1-Math.min(1,age/.25))));direction.set(...d.from.map(p=>-p));if(direction.lengthSq())d.interceptor.quaternion.setFromUnitVectors(up,direction.normalize());}
    }
  }
  for(const [id,f] of flights)if(!live.has(id)){scene.remove(f.obj);f.obj.traverse(o=>{if(o.isMesh)o.geometry.dispose();});flights.delete(id);}
  for(const [id,d] of bursts)if(!dust.has(id)){scene.remove(d.obj);d.obj.traverse(o=>{if(o.isMesh)o.geometry.dispose();});bursts.delete(id);}
  // Klíče zbouraných zařízení se nemají držet v paměti navždy.
  for(const k of heard.keys())if(!specials.has(k.slice(0,k.lastIndexOf(':'))))heard.delete(k);
}

export function renderClayUI(area,k) {
  const type=blocks.get(k);
  if(!isClayDevice(type))return false;
  const st=powerOf(k), stats=netStats(k), powered=!!st.pw;
  const connected=netOf.get(k), ready=!!connected&&defenseReady(connected);
  let device=`<p>Výkon: <b>120 W</b> · Hlína: <b>${st.fuel||0}/64</b><br>Hoření: ${Math.ceil(st.burn||0)} s · 1 hlína vydrží 60 sekund.</p>
    <button class="mc-btn" id="missile-fuel" ${(st.fuel||0)>=64||!countItem('dirt')?'disabled':''}>Doplnit hlínu (${countItem('dirt')} v batohu)</button>
    <p>Generátor spaluje hlínu a napájí datovou síť. Další hlínu zapálí jen při odběru.</p>`;
  if(type==='dirt_silo')device=`<p>Raket: <b>${st.ammo||0}/16</b> · Odpáleno: ${st.launched||0} · Sestřeleno: ${st.stopped||0}</p>
    <button class="mc-btn" id="clay-load" ${(st.ammo||0)>=16||!countItem('dirt_rocket')?'disabled':''}>Nabít raketu (${countItem('dirt_rocket')} v batohu)</button>
    <button class="mc-btn" id="clay-launch" ${!powered||!st.ammo||st.cooldown>0||st.shots?.length||st.fire?'disabled':''}>${st.cooldown>0?'Silo se připravuje…':'Odpálit raketu'}</button>
    <p>Raketa letí obloukem 24 bloků před silo. Směr určuje otočení při položení. Dopad vytvoří světelný výbuch bez poškození krajiny.</p>`;
  if(type==='dirt_defense')device=`<p>Sestřelené rakety: <b>${st.intercepted||0}</b></p><p>${ready?'Radar a kontrolní centrum připojeny · obrana připravena':'Připoj napájený radar a kontrolní centrum do stejné datové sítě'}</p><p>Dosah: ${CLAY_RADAR} bloků. Protirakety se připravují automaticky.</p>`;
  if(type==='missile_radar')device='Sleduje přilétající rakety v okruhu 28 bloků a předává jejich polohu kontrolnímu centru.';
  if(type==='missile_control')device=`Vyhodnocení hrozby: ${powered&&ready?'sledování aktivní · automatický odpal povolen':'čekám na napájený radar a propojení'}. Propoj centrum datovým kabelem s radarem a odpalovací jednotkou.`;
  area.innerHTML=`<div class="mc-title">${BLOCKS[type].name}</div><div class="mc-note">Rozměry: ${MISSILE_SIZE[type][0]} × ${MISSILE_SIZE[type][2]} × ${MISSILE_SIZE[type][1]} bloků (šířka × délka × výška)</div><div class="mc-note">${powered?'Napájeno':'Bez napájení · připoj napájecí jednotku a datové kabely'}</div><div class="mc-note">${device}</div>
    <div class="mc-title">Datová síť</div><div class="mc-note">${stats?`Výroba ${stats[0]} W · odběr ${stats[1]} W · kabely ${stats[4]} W`:'Čekám na propojení…'}<br>Použij Datový kabel. Síť je oddělená od běžné elektřiny.</div>`;
  if(type==='missile_control'){
    const mount=document.createElement('div');area.append(mount);
    renderMissileMap(mount,k,connected,ready,()=>renderClayUI(area,k));
  }
  const fuel=area.querySelector('#missile-fuel');
  if(fuel)fuel.onclick=()=>{
    const current=powerOf(k);let left=64-(current.fuel||0),added=0;
    for(let i=0;i<inv.slots.length&&left>0;i++){
      const slot=inv.slots[i];if(slot?.id!=='dirt')continue;
      const n=Math.min(left,slot.n);slot.n-=n;left-=n;added+=n;if(!slot.n)inv.slots[i]=null;
    }
    if(!added)return;
    power.set(k,{...current,fuel:(current.fuel||0)+added});Sound.mat('dirt','place',.6);renderHotbar();renderInventory();
  };
  const load=area.querySelector('#clay-load'),launch=area.querySelector('#clay-launch');
  if(load)load.onclick=()=>{
    const current=powerOf(k),index=inv.slots.findIndex(s=>s?.id==='dirt_rocket');
    if(index<0||(current.ammo||0)>=16)return;
    if(!--inv.slots[index].n)inv.slots[index]=null;
    power.set(k,{...current,ammo:(current.ammo||0)+1});Sound.mat('metal','place',.6);renderHotbar();renderInventory();
  };
  if(launch)launch.onclick=()=>{
    const current=powerOf(k);
    if(!current.pw||!current.ammo||current.cooldown>0||current.shots?.length||current.fire)return;
    power.set(k,{...current,fire:true});toast('Raketa připravena k odpalu');renderClayUI(area,k);
  };
  return true;
}
