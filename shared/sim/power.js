// Elektrická síť: kabely, zdroje, baterie, spotřebiče a tiskárna.
// Síť = souvislá skupina elektrických bloků (kabely a zařízení, která se dotýkají stěnou). Vypnutý vypínač síť rozpojí.
// Tvar sítí se přepočítá jen při změně bloků (powerDirty), energie se počítá 4× za sekundu:
// výroba (generátory + slunce, omezená kapacitou kabelů) -> spotřebiče podle pořadí; přebytek nabíjí baterie, nedostatek z nich čerpá.
// Když energie nestačí, zařízení, na která nezbude, se vypnou. Energii počítá jen ten, kdo drží svět.
import { BLOCKS, FUEL, ITEMS, smeltResult } from '../data/index.js';
import { emit } from '../events.js';
import { NET, isBusy } from '../net/net.js';
import { clamp } from '../util.js';
import { bkey, blocks, power } from '../world/state.js';
import { topY } from '../world/voxels.js';
import { rebuildMissileStructures,structurePorts } from '../world/missile-structures.js';
import { blockMeta } from '../world/state.js';
import { updateClayDefense } from './clay-defense.js';

export const elecOf = (type) => BLOCKS[type]?.elec;
export const BAT_CAP = 20000, BAT_RATE = 120, GEN_FUEL_MUL = 3, EFURNACE_TIME = 2, CHARGE_TIME = 10;
export function powerOf(k) {
  if (!power.has(k)) {
    const t = blocks.get(k), e = elecOf(t) || {};
    power.set(k, e.claySource ? { pw: 0, fuel: 0, burn: 0, burnMax: 60 } : e.gen ? { slots: [null], burn: 0, burnMax: 0, pw: 0 } : e.store ? { e: 0, pw: 0 } : e.switch ? { on: true }
      : t === 'electric_furnace' || t === 'charger' ? { slots: [null, null], t: 0, pw: 0 } : t === 'printer' ? { slots: [null, null, null, null], q: [], t: 0, pw: 0 } : { pw: 0 });
  }
  return power.get(k);
}
export const isPowered = (k) => !!power.get(k)?.pw;
export const DIRS6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
export let powerDirty = true, nets = [];
export function markPowerDirty() { powerDirty = true; }
export const netOf = new Map(); // klíč bloku -> síť
export function rebuildNets() {
  powerDirty = false;
  rebuildMissileStructures();
  nets = [];
  netOf.clear();
  const nodes = new Map();
  for (const [k, t] of blocks) {
    const e = elecOf(t);
    if (e && !(e.switch && power.get(k)?.on === false)) nodes.set(k, e);
  }
  const links=new Map([...nodes.keys()].map(k=>[k,new Set()]));
  const join=(a,b)=>{if(a!==b&&nodes.has(b)&&!!nodes.get(a).clay===!!nodes.get(b).clay){links.get(a).add(b);links.get(b).add(a);}};
  for(const k of nodes.keys()){
    const [x,y,z]=k.split(',').map(Number);
    for(const [dx,dy,dz] of DIRS6)join(k,bkey(x+dx,y+dy,z+dz));
    for(const p of structurePorts(blocks.get(k),x,y,z,blockMeta.get(k)||0)){const port=bkey(...p);if(nodes.get(port)?.cable)join(k,port);}
  }
  for (const k0 of nodes.keys()) {
    if (netOf.has(k0)) continue;
    const net = { keys: [], cables: 0, cap: Infinity, gens: [], solars: [], bats: [], users: [], stats: null };
    netOf.set(k0, net);
    const stack = [k0];
    while (stack.length) {
      const k = stack.pop(), e = nodes.get(k);
      net.keys.push(k);
      if (e.cable) { net.cables++; net.cap = Math.min(net.cap, e.cap); }
      if (e.gen) net.gens.push(k);
      if (e.solar) net.solars.push(k);
      if (e.store) net.bats.push(k);
      if (e.use) net.users.push(k);
      for(const n of links.get(k))if(!netOf.has(n)){netOf.set(n,net);stack.push(n);}
    }
    if (!isFinite(net.cap)) net.cap = 1000; // zařízení spojená přímo, bez kabelu
    net.users.sort(); // pevné pořadí: při nedostatku se vypínají vždy stejná zařízení
    nets.push(net);
  }
}
// Kolik zařízení teď chce (pec a nabíječka jen když mají co dělat, lampy a motor pořád)
export function demandOf(k, t) {
  const st = powerOf(k), use = elecOf(t).use;
  if (t === 'electric_furnace') { const [i, o] = st.slots, r = i && smeltResult(i.id); return r && (!o || (o.id === r && o.n < ITEMS[r].stack)) ? use : 0; }
  if (t === 'computer') return st.pc ? use : 0;
  if (t === 'printer') return printerReady(st) ? use : 0; // jen při tisku // počítač bere proud jen zapnutý
  if (t === 'charger') { const [i, o] = st.slots; return i?.id === 'car_battery_empty' && (!o || (o.id === 'car_battery' && o.n < ITEMS.car_battery.stack)) ? use : 0; }
  return use;
}
let powerT = 0;
export let sunLevel = 1;
export function updatePower(dt, sun) {
  sunLevel = sun;
  if (powerDirty) rebuildNets();
  if ((powerT += dt) < 0.25) return false;
  const step = powerT;
  powerT = 0;
  if (!NET.client) for (const net of nets) simulateNet(net, step, sun); // energii počítá hostitel (ve hře pro jednoho hra sama)
  if (!NET.client) updateClayDefense(nets, step);
  return true; // proběhl krok sítě (prohlížeč obnoví okno zařízení)
}
function simulateNet(net, step, sun) {
  let solar = 0;
  for (const k of net.solars) { const [x, y, z] = k.split(',').map(Number); if (y >= topY(x, z)) solar += elecOf('solar_panel').solar * sun; } // pod zemí panel nevyrábí
  const demands = net.users.map((k) => [k, demandOf(k, blocks.get(k))]);
  const demand = demands.reduce((s, [, d]) => s + d, 0);
  let stored = 0, room = 0;
  for (const b of net.bats) { const st = powerOf(b); stored += st.e; room += BAT_CAP - st.e; }
  // generátor spaluje palivo jen když je energie potřeba (spotřeba nebo nenabité baterie)
  const wantGen = demand > solar || room > 1;
  let gen = 0;
  for (const g of net.gens) {
    const st = powerOf(g);
    const device = elecOf(blocks.get(g));
    if (device.claySource) {
      st.fuel ??= 0; st.burn = Math.max(0, (st.burn || 0) - step); st.burnMax = 60;
      if (!st.burn && wantGen && st.fuel > 0) { st.fuel--; st.burn = st.burnMax; }
      st.pw = st.burn > 0 ? 1 : 0;
      if (st.pw) gen += device.gen;
      continue;
    }
    if (st.burn > 0) st.burn = Math.max(0, st.burn - step);
    if (st.burn <= 0 && wantGen && !isBusy(g)) { const f = st.slots[0]; if (f && FUEL[f.id]) { st.burn = st.burnMax = FUEL[f.id] * GEN_FUEL_MUL; if (!--f.n) st.slots[0] = null; } }
    st.pw = st.burn > 0 ? 1 : 0;
    if (st.pw) gen += device.gen;
  }
  const supply = Math.min(gen + solar, net.cap);
  const batOut = Math.min(BAT_RATE * net.bats.length, stored / step, net.cap);
  let rem = supply + batOut, used = 0;
  for (const [k, d] of demands) {
    const st = powerOf(k), on = d > 0 && d <= rem + 1e-6;
    st.pw = on ? 1 : 0;
    if (on) { rem -= d; used += d; }
  }
  // baterie: rozdíl výroby a spotřeby (nabíjení i vybíjení rozdělí rovnoměrně)
  const flow = used > supply ? -(used - supply) : Math.min(supply - used, BAT_RATE * net.bats.length);
  if (net.bats.length) {
    let delta = (flow * step) / net.bats.length;
    for (const b of net.bats) { const st = powerOf(b); st.e = Math.round(clamp(st.e + delta, 0, BAT_CAP)); st.pw = st.e > 0 ? 1 : 0; }
  }
  // práce spotřebičů
  for (const [k] of demands) {
    const t = blocks.get(k), st = powerOf(k);
    if (t === 'computer' && st.pc) { st.lost = st.pw ? 0 : (st.lost || 0) + step; if (st.lost > 1.5) { st.pc = false; st.lost = 0; st.cut = 1; } } // bez proudu se vypne
    if (!st.pw || !st.slots || isBusy(k)) continue; // okno zařízení má otevřené hráč
    if (t === 'printer') { printStep(st, step); continue; }
    const [i, o] = st.slots;
    st.t = (st.t || 0) + step;
    if (t === 'electric_furnace' && st.t >= EFURNACE_TIME) {
      st.t = 0;
      const r = smeltResult(i.id);
      if (!--i.n) st.slots[0] = null;
      if (o) o.n++; else st.slots[1] = { id: r, n: 1 };
      emit('crafted', r);
    } else if (t === 'charger' && st.t >= CHARGE_TIME) {
      st.t = 0;
      if (!--i.n) st.slots[0] = null;
      if (o) o.n++; else st.slots[1] = { id: 'car_battery', n: 1 };
    }
  }
  stored = net.bats.reduce((s, b) => s + powerOf(b).e, 0);
  // přehled sítě se uloží do stavu každého zařízení (klient ho pak ukazuje stejně jako hostitel)
  const stats = [Math.round(gen + solar), Math.round(used), Math.round(demand), Math.round(stored), net.cap, BAT_CAP * net.bats.length];
  net.stats = stats;
  for (const k of net.keys) if (!elecOf(blocks.get(k)).cable && !elecOf(blocks.get(k)).switch) powerOf(k).net = stats;
}
// Přehled sítě, do které patří blok (u klienta z kteréhokoli zařízení sítě)
export function netStats(k) {
  const net = netOf.get(k);
  if (!net) return null;
  if (net.stats) return net.stats;
  for (const n of net.keys) { const s = power.get(n)?.net; if (s) return s; }
  return null;
}

// Pravé tlačítko na vypínač: zapnout / vypnout (síť se hned přepočítá). Vrací nový stav.
export function flipSwitch(k) {
  const st = powerOf(k);
  st.on = st.on === false;
  markPowerDirty();
  return st.on;
}

// ---------- tiskárna: slots[0] papír, slots[1..3] vytištěné listy, q = fronta úloh { p: id papíru, n: kopií, done }
export const PRINT_TIME = 3, PRINT_QUEUE = 5;
export function queuePrint(k, p, n) { // provádí hostitel (ve hře pro jednoho hra sama)
  if (blocks.get(k) !== 'printer' || typeof p !== 'string') return false;
  const st = powerOf(k);
  if (st.q.length >= PRINT_QUEUE) return false;
  st.q.push({ p: p.slice(0, 80), n: clamp(Math.floor(n) || 1, 1, 5), done: 0 });
  return true;
}

export const printerReady = (st) => !!(st.q?.length && st.slots[0]?.id === 'paper' && st.slots.slice(1).some((s) => !s));
export function printStep(st, step) {
  if ((st.t = (st.t || 0) + step) < PRINT_TIME) return;
  st.t = 0;
  const job = st.q[0];
  if (!--st.slots[0].n) st.slots[0] = null;
  st.slots[st.slots.findIndex((s, i) => i > 0 && !s)] = { id: 'doc_' + job.p, n: 1 };
  if (++job.done >= job.n) st.q.shift();
}
