// Uložení a načtení světa. Tvar je stejný ve hře pro jednoho (localStorage), u hostitele v prohlížeči i na serveru
// (data/world.json) a hostitel ho posílá novým hráčům ve zprávě 'welcome'.
import { ITEMS } from '../data/index.js';
import { NET } from '../net/net.js';
import { dayCount, dayTime, setDay } from '../sim/day.js';
import { groundItems, spawnGroundItem } from '../sim/ground-items.js';
import { Vec3 } from '../vec3.js';
import { ensureDoc } from './papers.js';
import { blockMeta, blocks, chairRot, chests, crops, fires, furnaces, paperSpots, papers, pcDisks, portalActive, power, removed, ruinsBuilt, ruinsOpened, setPortalActive, spawners, stoves, tableItems, vehicles } from './state.js';
import { setVox, voxEdits } from './voxels.js';
import { WORLD_GEN } from './terrain.js';

const fill = (map, obj) => { for (const [k, v] of Object.entries(obj || {})) map.set(k, v); };

/** Načte uložený svět (nebo svět od hostitele). save = výsledek worldState() (může obsahovat i data hráče). */
export function loadWorld(save) {
  WORLD_GEN.oceans = save ? !!save.oceans : true; // nový svět má oceány, uložený svět tak, jak vznikl
  NET.quiet(() => {
    fill(papers, save?.papers);
    for (const pid of papers.keys()) ensureDoc('doc_' + pid);
    for (const [k, id] of save?.vox || []) { const [x, y, z] = k.split(',').map(Number); setVox(x, y, z, id); }
    for (const k of save?.removed || []) removed.add(k);
    for (const [k, v] of save?.blocks || []) blocks.set(k, v);
    for (const [k, v] of save?.blockMeta || []) blockMeta.set(k, v);
    setPortalActive(!!save?.portal);
    fill(chests, save?.chests);
    fill(fires, save?.fires);
    fill(stoves, save?.stoves);
    fill(crops, save?.crops);
    fill(furnaces, save?.furnaces);
    fill(power, save?.power);
    fill(pcDisks, save?.pcDisks);
    fill(paperSpots, save?.paperSpots);
    for (const k of save?.ruins || []) ruinsBuilt.add(k);
    for (const k of save?.ruinsOpened || []) ruinsOpened.add(k);
    fill(spawners, save?.spawners);
    for (const d of save?.ground || []) if (ITEMS[d.id]) spawnGroundItem(d.id, d.n, new Vec3(d.x, d.y, d.z), new Vec3(), 0, d.gid || NET.uid());
    fill(vehicles, save?.vehicles);
    // Po načtení nikdo nesedí za volantem (u klienta to určuje hostitel)
    if (!NET.client) for (const v of vehicles.values()) { v.driver = null; v.engine = false; v.spd = 0; }
    fill(tableItems, save?.tableItems);
    for (const [k, v] of Object.entries(save?.chairRot || {})) chairRot.set(k, Number(v));
    setDay(save?.dayTime ?? 0.3, save?.day ?? 1);
  });
}

/** Stav světa (ukládá se a hostitel ho posílá novým hráčům). */
export function worldState() {
  return {
    dayTime, day: dayCount, blocks: [...blocks], blockMeta: [...blockMeta], removed: [...removed], fires: Object.fromEntries(fires),
    vox: [...voxEdits.values()].flatMap((m) => [...m]),
    ground: groundItems.filter((g) => g.n > 0).map((g) => ({ gid: g.gid, id: g.id, n: g.n, x: g.pos.x, y: g.pos.y, z: g.pos.z })),
    stoves: Object.fromEntries(stoves), tableItems: Object.fromEntries(tableItems), chairRot: Object.fromEntries(chairRot), crops: Object.fromEntries(crops),
    spawners: Object.fromEntries(spawners), furnaces: Object.fromEntries(furnaces), power: Object.fromEntries(power), vehicles: Object.fromEntries(vehicles), papers: Object.fromEntries(papers), pcDisks: Object.fromEntries(pcDisks), paperSpots: Object.fromEntries(paperSpots), chests: Object.fromEntries(chests), ruins: [...ruinsBuilt], ruinsOpened: [...ruinsOpened], portal: portalActive, oceans: WORLD_GEN.oceans,
  };
}
