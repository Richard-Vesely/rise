// Stav světa: všechno, co hráči ve světě změnili (bloky, truhly, stroje, auta, papíry…).
// Je stejný ve hře pro jednoho, u hostitele v prohlížeči i na serveru. Ukládá ho shared/world/save.js.
import { BLOCKS } from '../data/index.js';
import { NET } from '../net/net.js';

// Mapa / množina, která každou změnu ohlásí síťové vrstvě (bloky, pokácené stromy…).
export class SyncMap extends Map {
  constructor(name, entries) { super(entries); this.syncName = name; }
  set(k, v) { super.set(k, v); if (this.syncName) NET.op(['m', this.syncName, k, v]); return this; }
  delete(k) { const had = super.delete(k); if (had && this.syncName) NET.op(['m', this.syncName, k, null]); return had; }
}
export class SyncSet extends Set {
  constructor(name, items) { super(items); this.syncName = name; }
  add(k) { if (this.syncName && !this.has(k)) { super.add(k); NET.op(['s', this.syncName, k]); } else super.add(k); return this; }
}

export const bkey = (x, y, z) => `${x},${y},${z}`;

// Bloky, které svítí (pochodně, táboráky, lampy…; spawner ne): podle nich se drží stínožrouti dál. klíč -> { type, x, y, z }
export const lights = new Map();
class BlockMap extends SyncMap {
  set(k, v) {
    super.set(k, v);
    if (BLOCKS[v]?.light && v !== 'spawner') { const [x, y, z] = k.split(',').map(Number); lights.set(k, { type: v, x, y, z }); } else lights.delete(k);
    return this;
  }
  delete(k) { lights.delete(k); return super.delete(k); }
}

export const removed = new SyncSet('removed'); // pokácené stromy, vytěžené balvany, sebrané úlomky
export const blocks = new BlockMap('blocks'); // "x,y,z" -> typ bloku
export const blockMeta = new SyncMap('blockMeta'); // "x,y,z" -> otočení (bit 0–1) a horní půlblok (bit 2); pochodeň: 1 stojí, 2–5 na zdi (world/torch.js)
export const chests = new Map(); // klíč bloku -> 27 políček
export const fires = new Map(); // klíč bloku -> { slots: [vstup, výstup], t }
export const stoves = new Map(); // klíč bloku -> { slots: [výstup], recipe, t }
export const crops = new Map(); // klíč bloku -> { stage, t, next }
export const furnaces = new Map(); // klíč bloku -> { slots, t, burn, burnMax }
export const power = new Map(); // klíč bloku -> stav zařízení (palivo, energie baterie, vypínač, napájení…)
export const vehicles = new Map(); // id -> { type, x, y, z, yaw, pitch, roll, spd, steer, fuel, bat, slots[19], lights, driver }
export const papers = new Map(); // id papíru -> { title, text, by, day }
export const pcDisks = new Map(); // klíč počítače -> { docs: [{ id, name, text, day }] }
export const paperSpots = new Map(); // id -> { d: id papíru | null, x, y, z, ry, w: na zdi, fr: rámeček }
export const tableItems = new Map(); // klíč stolu -> { food, cutlery }
export const chairRot = new Map(); // klíč židle -> natočení
export const spawners = new Map(); // klíč bloku spawneru -> druh tvora
export const ruinsBuilt = new Set(); // už postavené stavby (všechny druhy)
export const ruinsOpened = new SyncSet('ruinsOpened'); // prozkoumané stavby (otevřená truhla)
export let portalActive = false; // probuzená svatyně (portál do Markovy dimenze)
export function setPortalActive(on) { portalActive = on; }

export const chestOf = (k) => { if (!chests.has(k)) chests.set(k, Array(27).fill(null)); return chests.get(k); };
export const fireOf = (k) => { if (!fires.has(k)) fires.set(k, { slots: [null, null], t: 0 }); return fires.get(k); };
export const stoveOf = (k) => { if (!stoves.has(k)) stoves.set(k, { slots: [null], recipe: null, t: 0 }); return stoves.get(k); };
export const furnaceOf = (k) => { if (!furnaces.has(k)) furnaces.set(k, { slots: [null, null, null], t: 0, burn: 0, burnMax: 0 }); return furnaces.get(k); };

// Malé mapy, které se v multiplayeru posílají celé (porovnává se JSON; vyhrává poslední změna).
export const KV_MAPS = { fires, stoves, crops, tableItems, chairRot, chests, spawners, furnaces, power, vehicles, papers, pcDisks, paperSpots };
