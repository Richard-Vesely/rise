// Herní hliněné rakety: stav je součástí existující mapy power (uložení i multiplayer).
import { blockMeta, blocks, power } from '../world/state.js';
import { missileImpact, missileTarget } from './missile-targeting.js';

export const CLAY_FLIGHT = 4, CLAY_RANGE = 24, CLAY_RELOAD = 4, CLAY_RADAR = 28;
export const isClayDevice = type => ['dirt_source', 'dirt_silo', 'dirt_defense', 'missile_radar', 'missile_control'].includes(type);
export function defenseReady(net) {
  return ['missile_radar','missile_control'].every(type=>net.keys.some(k=>blocks.get(k)===type&&power.get(k)?.pw));
}

export function rocketPosition(shot, extra = 0) {
  const t = Math.min(1, Math.max(0, (shot.age + extra) / CLAY_FLIGHT));
  return shot.from.map((p, i) => p + (shot.to[i] - p) * t + (i === 1 ? Math.sin(t * Math.PI) * 12 : 0));
}

function state(k) { if (!power.has(k)) power.set(k, { pw: 0 }); return power.get(k); }
function fade(st, dt) {
  if (st.burst && (st.burst.age += dt) > 0.9) delete st.burst;
  st.cooldown = Math.max(0, (st.cooldown || 0) - dt);
}

// Volá jen držitel světa po výpočtu napájení, nikdy klient.
export function updateClayDefense(nets, dt) {
  const silos = [], defenders = [];
  for(const net of nets)for(const k of net.keys){
    if(blocks.get(k)!=='missile_control')continue;
    const control=state(k), order=control.launch;
    if(!order)continue;
    delete control.launch;
    const from=k.split(',').map(n=>Number(n)+.5);
    if(!control.pw||!defenseReady(net)||!missileTarget(order.by,order.pid,from)){
      control.result='Cíl není dostupný nebo není povolené PvP';continue;
    }
    const silo=net.keys.find(key=>blocks.get(key)==='dirt_silo'&&state(key).pw&&state(key).ammo>0&&!state(key).cooldown&&!state(key).shots?.length&&!state(key).fire);
    if(!silo){control.result='Připoj napájené, nabité a připravené silo';continue;}
    const origin=silo.split(',').map(n=>Number(n)+.5), to=missileTarget(order.by,order.pid,origin);
    if(!to){control.result='Cíl je mimo dosah sila';continue;}
    const st=state(silo);st.aim={to,by:order.by,target:order.pid};st.fire=true;
    control.result='Raketa odpálena na vybraný cíl';
  }
  for (const net of nets) for (const k of net.keys) {
    const type = blocks.get(k);
    if (type !== 'dirt_silo' && type !== 'dirt_defense') continue;
    const st = state(k); fade(st, dt);
    if (type === 'dirt_defense') { if (st.pw && defenseReady(net)) defenders.push({ k, st, net }); continue; }
    st.shots ||= [];
    if (st.fire) {
      st.fire = false;
      if (st.pw && st.ammo > 0 && !st.cooldown && !st.shots.length) {
        const [x,y,z] = k.split(',').map(Number), yaw = ((blockMeta.get(k) || 0) & 3) * Math.PI / 2;
        const from = [x + 0.5, y + 5.1, z + 0.5];
        st.serial = (st.serial || 0) + 1;
        const aim=st.aim;
        st.shots.push({ id: k + ':' + st.serial, age: 0, from, to: [from[0] + Math.sin(yaw) * CLAY_RANGE, from[1], from[2] + Math.cos(yaw) * CLAY_RANGE], ...aim });
        st.ammo--; st.cooldown = CLAY_RELOAD; st.launched = (st.launched || 0) + 1;
      }
    }
    delete st.aim;
    silos.push({ k, st, net });
  }
  for (const { st, net } of silos) {
    st.shots = st.shots.filter(shot => {
      shot.age += dt;
      const position = rocketPosition(shot);
      // Napájené věže hlídají okolí. Let musí být nejprve vidět, než ho zachytí.
      const guard = shot.age >= 0.8 && defenders.find(d => !d.st.cooldown && Math.hypot(...position.map((p,i) => p - Number(d.k.split(',')[i]) - 0.5)) <= CLAY_RADAR);
      if (guard) {
        guard.st.cooldown = 1;
        guard.st.intercepted = (guard.st.intercepted || 0) + 1;
        guard.st.burst = { id: shot.id, at: position, age: 0 };
        st.stopped = (st.stopped || 0) + 1;
        return false;
      }
      if (shot.age >= CLAY_FLIGHT) {
        if(missileImpact(shot))st.hits=(st.hits||0)+1;
        st.landed = (st.landed || 0) + 1;
        st.burst = { id: shot.id, at: position, age: 0 };
        return false;
      }
      return true;
    });
  }
}
