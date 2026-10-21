// Míření: co je před hráčem.
import '../render/held-item.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { BLOCKS, shapeBoxes } from '../../../shared/data/index.js';
import { mobs } from '../../../shared/sim/mobs.js';
import { REACH } from '../../../shared/world/constants.js';
import { TREE_NAMES } from '../../../shared/world/nature.js';
import { bkey, blockMeta, blocks, vehicles } from '../../../shared/world/state.js';
import { biomeAt, isMark, shrineDist, shrineOf } from '../../../shared/world/terrain.js';
import { NO_DIG_R, V, VOX, getVox, groundHeight, topY } from '../../../shared/world/voxels.js';
import { forestRocks, forestTrees } from '../render/forest.js';
import { isCut } from '../render/grass.js';
import { camera } from '../render/renderer.js';
import { rayVehicle, vehDim } from '../vehicles/car.js';
import { shrineActive } from '../world/shrine.js';
import { countItem } from './inventory.js';

// ============================================================ míření (co je před hráčem)
export const rayO = new THREE.Vector3(), rayD = new THREE.Vector3();
// Průsečík paprsku s kvádry tvaru v buňce; vrací vzdálenost a stěnu, kterou paprsek vstoupil.
function rayBoxes(o, d, cx, cy, cz, boxes) {
  let best = null;
  const O = [o.x, o.y, o.z], Dv = [d.x, d.y, d.z], C = [cx, cy, cz];
  for (const b of boxes) {
    let tmin = -Infinity, tmax = Infinity, n = [0, 1, 0];
    for (let a = 0; a < 3 && tmin <= tmax; a++) {
      const lo = C[a] + b[a], hi = C[a] + b[a + 3];
      if (Math.abs(Dv[a]) < 1e-9) { if (O[a] < lo || O[a] > hi) tmin = Infinity; continue; }
      let t1 = (lo - O[a]) / Dv[a], t2 = (hi - O[a]) / Dv[a], s = -1;
      if (t1 > t2) { [t1, t2] = [t2, t1]; s = 1; }
      if (t1 > tmin) { tmin = t1; n = [0, 0, 0]; n[a] = s; }
      tmax = Math.min(tmax, t2);
    }
    if (tmin <= tmax && tmax >= 0 && (!best || tmin < best.t)) best = { t: Math.max(0, tmin), normal: n };
  }
  return best;
}
function raycastBlocks(o, d, max) {
  let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
  const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
  const tdx = Math.abs(1 / d.x), tdy = Math.abs(1 / d.y), tdz = Math.abs(1 / d.z);
  let tx = d.x === 0 ? Infinity : (sx > 0 ? x + 1 - o.x : o.x - x) * tdx;
  let ty = d.y === 0 ? Infinity : (sy > 0 ? y + 1 - o.y : o.y - y) * tdy;
  let tz = d.z === 0 ? Infinity : (sz > 0 ? z + 1 - o.z : o.z - z) * tdz;
  let t = 0, normal = [0, 0, 0];
  while (t <= max) {
    const type = blocks.get(bkey(x, y, z));
    if (type && !(t === 0 && !BLOCKS[type].solid)) { // židli, na které sedíš, nezaměříš
      const sh = BLOCKS[type].shape;
      if (!sh) return { t, x, y, z, type, normal };
      // Schody, půlblok…: paprsek musí trefit skutečný tvar (nad půlblokem se dá mířit dál)
      const hit = rayBoxes(o, d, x, y, z, shapeBoxes(sh, blockMeta.get(bkey(x, y, z)) || 0));
      if (hit && hit.t <= max) return { t: hit.t, x, y, z, type, normal: hit.normal };
    }
    // Podzemní bloky (horní vrstvu sloupce řeší povrch terénu níže v pickTarget).
    if (y < topY(x, z) && shrineDist(x + 0.5, z + 0.5) > NO_DIG_R) {
      const v = getVox(x, y, z);
      if (v !== V.AIR) return { t, x, y, z, vox: v, normal };
    }
    if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; normal = [-sx, 0, 0]; }
    else if (ty < tz) { y += sy; t = ty; ty += tdy; normal = [0, -sy, 0]; }
    else { z += sz; t = tz; tz += tdz; normal = [0, 0, -sz]; }
  }
  return null;
}
export function pickTarget() {
  camera.getWorldPosition(rayO);
  camera.getWorldDirection(rayD);
  const o = rayO, d = rayD;
  let best = null, bt = REACH;
  const bh = raycastBlocks(o, d, REACH);
  if (bh?.vox) {
    bt = bh.t;
    best = voxTarget(bh.vox, [bh.x, bh.y, bh.z], bh.normal, [o.x + d.x * bh.t, o.y + d.y * bh.t, o.z + d.z * bh.t], false);
  } else if (bh) {
    const b = BLOCKS[bh.type];
    bt = bh.t;
    best = { kind: 'block', key: 'b' + bkey(bh.x, bh.y, bh.z), cell: [bh.x, bh.y, bh.z], normal: bh.normal, type: bh.type, name: b.name, point: [o.x + d.x * bh.t, o.y + d.y * bh.t, o.z + d.z * bh.t],
      hint: { workbench: 'pravé tlačítko = výroba 3×3', campfire: 'pravé tlačítko = pečení a tavení', chest: 'pravé tlačítko = otevřít', safe: 'pravé tlačítko = otevřít kódem · nedá se vytěžit', computer: 'pravé tlačítko = sednout k počítači' }[bh.type] || '', breakable: !b.locked, hard: b.hard, tool: b.tool, req: b.req ? { tool: 'pick', tier: b.req } : null, at: [bh.x + 0.5, bh.y + 0.5, bh.z + 0.5] };
  }
  const a = d.x * d.x + d.z * d.z;
  for (const t of forestTrees) {
    const ox = o.x - t.x, oz = o.z - t.z;
    if (ox * ox + oz * oz > 64 || a < 1e-6) continue;
    const r = 0.3 * t.s + 0.2, b = 2 * (ox * d.x + oz * d.z), c = ox * ox + oz * oz - r * r, disc = b * b - 4 * a * c;
    if (disc < 0) continue;
    const tt = (-b - Math.sqrt(disc)) / (2 * a);
    if (tt < 0 || tt >= bt) continue;
    const hy = o.y + d.y * tt;
    if (hy < t.y - 0.5 || hy > t.y + t.trunkH + 1.5 * t.s) continue;
    bt = tt;
    best = { kind: 'tree', key: t.key, tree: t, name: t.mark ? 'Markwood strom' : TREE_NAMES[t.kind] || 'Dub', hint: 'drž levé tlačítko · se sekerou rychleji', hard: 2.4 * t.s, tool: 'axe', at: [o.x + d.x * tt, hy, o.z + d.z * tt] };
  }
  const sphere = (cx, cy, cz, rad) => {
    const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
    const b = ox * d.x + oy * d.y + oz * d.z, c = ox * ox + oy * oy + oz * oz - rad * rad, disc = b * b - c;
    if (disc < 0) return Infinity;
    return Math.max(0, -b - Math.sqrt(disc));
  };
  for (const r of forestRocks) {
    if ((o.x - r.x) ** 2 + (o.z - r.z) ** 2 > 64) continue;
    const tt = sphere(r.x, r.y + 0.1 * r.s, r.z, r.s * 0.95);
    if (tt >= bt) continue;
    bt = tt;
    best = { kind: 'rock', key: r.key, rock: r, name: r.iron ? 'Železná ruda' : 'Balvan', hint: r.iron ? 'těžíš kamenným nebo železným krumpáčem' : 'těžíš krumpáčem', hard: r.iron ? 4.5 : 3, tool: 'pick', req: { tool: 'pick', tier: r.iron ? 2 : 1 }, at: [o.x + d.x * tt, o.y + d.y * tt, o.z + d.z * tt] };
  }
  for (const m of mobs) {
    if (m.dead) continue;
    const tt = sphere(m.pos.x, m.pos.y + m.def.cy, m.pos.z, m.def.radius);
    if (tt >= bt) continue;
    bt = tt;
    const hint = m.type === 'chicken' ? `vejce: ${m.eggs || 0} · pravé tl. = sebrat` : m.type === 'cow' ? (m.milkT > 0 ? 'podojená' : 'pravé tl. s kbelíkem = podojit')
      : ['crawler', 'markoman', 'golem', 'wolf'].includes(m.type) ? 'nepřítel' : 'lovná zvěř';
    best = { kind: 'mob', mob: m, name: m.def.name, hint };
  }
  // Auto
  const vh = rayVehicle(o, d, bt);
  if (vh) {
    bt = vh.t;
    const v = vehicles.get(vh.id);
    best = { kind: 'vehicle', id: vh.id, key: 'veh' + vh.id, name: vehDim(v.type).name, hint: `F = nastoupit · pravé tl. = kufr a palivo (${v.fuel.toFixed(0)} l) · drž levé = rozebrat`, hard: 4, at: [o.x + d.x * vh.t, o.y + d.y * vh.t, o.z + d.z * vh.t] };
  }
  // Portál ve svatyni (kruh o poloměru 2,4 m, stojí v rovině x–y)
  const sh = shrineOf(o.x);
  if (Math.abs(d.z) > 0.05) {
    const tt = (sh.z - o.z) / d.z, hx = o.x + d.x * tt - sh.x, hy = o.y + d.y * tt - 3.05;
    if (tt > 0 && tt < bt && hx * hx + hy * hy < 2.6 * 2.6) {
      bt = tt;
      const act = shrineActive(sh);
      best = {
        kind: 'portal', shrine: sh, name: sh.mark ? 'Portál domů' : act ? 'Portál do Markovy dimenze' : 'Spící portál svatyně',
        hint: act ? 'projdi jím' : `pravé tlačítko: vlož 3 úlomky světla (máš ${countItem('shard')})`,
      };
    }
  }
  // Povrch terénu se trefí jen paprskem, který na něj dopadá shora (z jeskyně se přes strop nemíří).
  let above = o.y >= groundHeight(o.x, o.z);
  for (let t = 0.2; t < bt; t += 0.1) {
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    if (y >= groundHeight(x, z)) { above = true; continue; }
    if (!above) continue;
    let lo = t - 0.1, hi = t;
    for (let k = 0; k < 6; k++) { const mid = (lo + hi) / 2; if (o.y + d.y * mid < groundHeight(o.x + d.x * mid, o.z + d.z * mid)) hi = mid; else lo = mid; }
    const px = o.x + d.x * hi, py = o.y + d.y * hi, pz = o.z + d.z * hi;
    if (shrineDist(px, pz) < NO_DIG_R) {
      best = { kind: 'ground', key: 'floor', point: [px, py, pz], at: [px, py, pz], breakable: false, name: 'Podlaha svatyně', hint: 'tady se kopat nedá' };
    } else {
      // Povrch terénu = horní blok sloupce (tráva, pod ní hlína).
      const cx = Math.floor(px), cz = Math.floor(pz);
      best = voxTarget(getVox(cx, topY(cx, cz), cz) || V.DIRT, [cx, topY(cx, cz), cz], [0, 1, 0], [px, py, pz], true);
    }
    break;
  }
  return best;
}
// Cíl v podzemním bloku. Na povrchu se nejdřív vytrhá tráva, pak se kope hlína.
function voxTarget(v, cell, normal, point, surfaceHit) {
  const [x, y, z] = cell;
  const bio = surfaceHit ? biomeAt(point[0], point[2]) : 'meadow';
  if (surfaceHit && !isCut(point[0], point[2]) && !['desert', 'tundra', 'volcanic'].includes(bio)) { // v poušti, tundře a sopce tráva neroste
    const name = isMark(x) ? 'Modrá tráva' : { cherry: 'Tráva s okvětními lístky', jungle: 'Hustá tráva', savanna: 'Suchá tráva', mushroom: 'Podhoubí' }[bio] || 'Tráva';
    return { kind: 'grass', key: `g${x},${z}`, cell, normal, point, at: point, hard: 0.45, name, hint: 'drž levé tlačítko · vlákno, pak se kope hlína' };
  }
  const def = VOX[v];
  const reqName = { 1: 'krumpáč', 2: 'kamenný krumpáč', 3: 'železný krumpáč', 4: 'krystalový krumpáč' }[def.req];
  return {
    kind: 'vox', key: `v${x},${y},${z}`, vox: v, cell, normal, point, at: point, surface: surfaceHit,
    name: def.name, hard: def.hard, tool: def.tool, req: def.req ? { tool: 'pick', tier: def.req } : null, reqName,
    breakable: !def.unbreakable,
    hint: def.unbreakable ? 'nezničitelné' : def.req ? `těžíš: ${reqName}` : 'lopatou rychleji',
  };
}
