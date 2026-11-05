// Položené bloky: materiály, modely zvláštních bloků, světla.
import '../world/shrine.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as THREE from 'three';
import { FX, GLOW, LK } from './look.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BLOCKS, CROPS, ITEMS, SHAPES } from '../../../shared/data/index.js';
import { on } from '../../../shared/events.js';
import { isPowered, markPowerDirty } from '../../../shared/sim/power.js';
import { solidAt } from '../../../shared/world/collision.js';
import { blockMeta, blocks, chairRot, crops, furnaces, tableItems } from '../../../shared/world/state.js';
import { torchFlame, torchMeta } from '../../../shared/world/torch.js';
import { groundHeight, solidVox } from '../../../shared/world/voxels.js';
import { DINE_STYLE } from '../dining/dine-view.js';
import { buildFoodInto } from '../dining/food-models.js';
import { GFX } from '../game/prefs.js';
import { buildCropModel } from '../machines/kitchen.js';
import { buildGarageModel } from '../machines/garage-model.js';
import { buildElecModel, rebuildCables } from '../machines/power.js';
import { heldStack } from '../player/inventory.js';
import { player } from '../player/player.js';
import { dummy, lumpy } from './forest.js';
import { U, camera, scene } from './renderer.js';
import { renderIcons } from './icon-render.js';
import { readyBlockMat, setupBlockMat } from './materials.js';
import { buildTorchModel } from './torch-model.js';
import { glowTex } from './sky.js';
import { acaciaPlanksTex, barkTex, basaltTex, bricksTex, cherryPlanksTex, cobbleTex, concreteTex, copperBlockTex, cutCopperTex, dirtTex, farmlandTex, glassTex, goldBlockTex, graniteTex, ironBlockTex, junglePlanksTex, marblePillarTex, marbleTex, markBarkTex, markPlanksTex, markRingsTex, markdirtTex, mushroomCapTex, mushroomStemTex, obsidianTex, planksTex, polishedBasaltTex, polishedGraniteTex, polishedMarbleTex, polishedStoneTex, quartzPillarTex, quartzTex, ringsTex, rockTex, roofTilesTex, sandTex, sandstoneTex, smoothSandstoneTex, snowTex, steelBlockTex, stoneTilesTex, techPanelTex, whitePanelTex, neonTex, neonMaskTex } from './textures.js';

// ============================================================ položené bloky a stavby
const blockMats = {
  planks: new THREE.MeshStandardMaterial({ map: planksTex, roughness: 0.85 }),
  cobble: new THREE.MeshStandardMaterial({ map: cobbleTex, roughness: 0.95 }),
  bricks: new THREE.MeshStandardMaterial({ map: bricksTex, roughness: 0.9 }),
  dirt: new THREE.MeshStandardMaterial({ map: dirtTex, roughness: 1 }),
  mark_planks: new THREE.MeshStandardMaterial({ map: markPlanksTex, roughness: 0.8 }),
  markdirt: new THREE.MeshStandardMaterial({ map: markdirtTex, roughness: 1 }),
  farmland: new THREE.MeshStandardMaterial({ map: farmlandTex, roughness: 1 }),
};
// Materiály nových stavebních bloků (trámy mají kůru po stranách a letokruhy nahoře a dole)
{
  const M = (map, roughness = 0.9, extra = {}) => new THREE.MeshStandardMaterial({ map, roughness, ...extra });
  const bark = M(barkTex, 0.95), rings = M(ringsTex, 0.85), mBark = M(markBarkTex, 0.9), mRings = M(markRingsTex, 0.8);
  Object.assign(blockMats, {
    granite: M(graniteTex, 0.8), marble: M(marbleTex, 0.45), basalt: M(basaltTex, 0.95),
    polished_stone: M(polishedStoneTex, 0.6), stone_tiles: M(stoneTilesTex, 0.7), polished_granite: M(polishedGraniteTex, 0.3),
    polished_marble: M(polishedMarbleTex, 0.22), marble_pillar: M(marblePillarTex, 0.35), polished_basalt: M(polishedBasaltTex, 0.4),
    iron_block: M(ironBlockTex, 0.35, { metalness: 0.75 }),
    copper_block: M(copperBlockTex, 0.35, { metalness: 0.7 }), cut_copper: M(cutCopperTex, 0.35, { metalness: 0.7 }), gold_block: M(goldBlockTex, 0.25, { metalness: 0.85 }),
    steel_block: M(steelBlockTex, 0.3, { metalness: 0.8 }), quartz_block: M(quartzTex, 0.4), quartz_pillar: M(quartzPillarTex, 0.4),
    log_block: [bark, bark, rings, rings, bark, bark], markwood_block: [mBark, mBark, mRings, mRings, mBark, mBark],
    cherry_planks: M(cherryPlanksTex, 0.8), jungle_planks: M(junglePlanksTex, 0.85), acacia_planks: M(acaciaPlanksTex, 0.8),
    sand: M(sandTex, 1), sandstone: M(sandstoneTex, 0.95), smooth_sandstone: M(smoothSandstoneTex, 0.85),
    glass: M(glassTex, 0.05, { transparent: true, depthWrite: false, metalness: 0.1 }),
    snow_block: M(snowTex, 0.9), obsidian: M(obsidianTex, 0.15, { metalness: 0.3 }), mushroom_block: M(mushroomCapTex, 0.7), mushroom_stem: M(mushroomStemTex, 0.85),
    roof_tiles: M(roofTilesTex, 0.75), concrete: M(concreteTex, 0.85),
    tech_panel: M(techPanelTex, 0.4, { metalness: 0.8 }), white_panel: M(whitePanelTex, 0.3),
  });
  // Neony: svítí jen sklo uprostřed (emissiveMap), barva podle významu (tyrkys / jantar / fialová)
  for (const id of ['neon_cyan', 'neon_amber', 'neon_magenta']) {
    const c = new THREE.Color(BLOCKS[id].lightColor);
    blockMats[id] = M(neonTex, 0.22, { color: c.clone().multiplyScalar(0.7), emissive: c, emissiveMap: neonMaskTex, emissiveIntensity: 1.15 }); // nepřepálit do bílé
  }
  for (const [id, b] of Object.entries(BLOCKS)) if (b.tint) blockMats[id] = M(concreteTex, 0.85, { color: b.tint }); // barevný beton
}
// Fyzikální vlastnosti podle rodiny bloku (render/materials.js): drsnost, kov, tmavší hrany, odlesky skla.
for (const [k, v] of Object.entries(blockMats)) for (const m of [v].flat()) setupBlockMat(m, BLOCKS[k]?.tint ? 'concrete' : k);
// Mapy reliéfu se dělají až pro bloky, které se opravdu kreslí (šetří start hry).
const readyMat = (v) => { for (const m of [v].flat()) readyBlockMat(m); return v; };
for (const k of ['planks', 'cobble', 'bricks']) readyMat(blockMats[k]); // používají je i modely (stůl, pec, studna)
export const blockMat = (type) => { const v = blockMats[BLOCKS[type]?.mat || type]; return v && readyMat(v); };
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
// Kvádr části bloku: UV podle polohy v buňce, takže textura na schodech a půlblocích navazuje jako na celých kostkách
function cellBoxGeo([x0, y0, z0, x1, y1, z1]) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2 - 0.5, (y0 + y1) / 2 - 0.5, (z0 + z1) / 2 - 0.5);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + 0.5, y = p.getY(i) + 0.5, z = p.getZ(i) + 0.5;
    if (Math.abs(n.getY(i)) > 0.5) uv.setXY(i, x, 1 - z); else if (Math.abs(n.getX(i)) > 0.5) uv.setXY(i, z, y); else uv.setXY(i, x, y);
  }
  g.clearGroups();
  return g;
}
const shapeGeoCache = {};
const shapeGeo = (shape) => (shapeGeoCache[shape] ||= mergeGeometries((SHAPES[shape].render || SHAPES[shape].box).map(cellBoxGeo)));
const instPool = new Map(); // "tvar|materiál" -> InstancedMesh (zvětší se, když bloků přibude)
export const specials = new Map(); // klíč -> { type, x, y, z, obj, flames }

export function buildSpecial(type, key) {
  const g = new THREE.Group();
  const flames = [];
  const flame = (scale, y) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(0xff8a2a).multiplyScalar(GLOW), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.scale.setScalar(scale);
    s.position.y = y;
    s.userData.base = scale;
    g.add(s);
    flames.push(s);
  };
  if (type === 'workbench') {
    const top = new THREE.Mesh(new THREE.BoxGeometry(1, 0.16, 1), blockMats.planks);
    top.position.y = 0.84;
    g.add(top);
    for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.78, 0.14), blockMats.planks);
      leg.position.set(x, 0.39, z);
      g.add(leg);
    }
    const tool = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.08), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.8, roughness: 0.4 }));
    tool.position.set(0.1, 0.95, 0.15);
    tool.rotation.y = 0.5;
    g.add(tool);
  } else if (type === 'campfire') {
    const logMat = new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 1 });
    for (let i = 0; i < 4; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.8, 7), logMat);
      log.rotation.set(Math.PI / 2 - 0.45, (i / 4) * Math.PI * 2, 0, 'YXZ');
      log.position.y = 0.18;
      g.add(log);
    }
    const stoneGeo = lumpy(new THREE.IcosahedronGeometry(0.12, 1), 0.25, 3);
    for (let i = 0; i < 9; i++) {
      const st = new THREE.Mesh(stoneGeo, new THREE.MeshStandardMaterial({ map: rockTex, roughness: 1 }));
      const a = (i / 9) * Math.PI * 2;
      st.position.set(Math.cos(a) * 0.45, 0.06, Math.sin(a) * 0.45);
      g.add(st);
    }
    flame(0.9, 0.35);
    flame(0.6, 0.55);
  } else if (CROPS[type]) {
    buildCropModel(g, type, crops.get(key)?.stage ?? 0);
  } else if (type === 'stove') {
    // Retro sporák: krémový smalt, chromové lišty, 4 plotny s mřížkami, knoflíky, prosklená trouba
    const enamel = new THREE.MeshStandardMaterial({ color: 0xf2e8d2, roughness: 0.28, metalness: 0.05 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xe6eaf0, roughness: 0.15, metalness: 1 });
    const black = new THREE.MeshStandardMaterial({ color: 0x18181c, roughness: 0.5, metalness: 0.3 });
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
    add(new RoundedBoxGeometry(0.94, 0.82, 0.86, 3, 0.05), enamel, 0, 0.47, -0.02);
    for (const [x, z] of [[-0.38, -0.36], [0.38, -0.36], [-0.38, 0.32], [0.38, 0.32]]) add(new THREE.CylinderGeometry(0.035, 0.03, 0.06, 8), black, x, 0.03, z);
    add(new THREE.BoxGeometry(0.96, 0.04, 0.88), black, 0, 0.9, -0.02); // varná deska
    add(new THREE.BoxGeometry(0.97, 0.03, 0.03), chrome, 0, 0.88, 0.42); // chromová lišta
    add(new RoundedBoxGeometry(0.94, 0.3, 0.06, 2, 0.02), enamel, 0, 1.05, -0.44); // zadní panel
    const clock = add(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 20), new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.3 }), 0, 1.06, -0.405);
    clock.rotation.x = Math.PI / 2;
    const burners = [];
    for (const [x, z, r] of [[-0.24, 0.16, 0.13], [0.24, 0.16, 0.11], [-0.24, -0.24, 0.11], [0.24, -0.24, 0.13]]) {
      const ring = add(new THREE.CylinderGeometry(r, r, 0.02, 24), new THREE.MeshStandardMaterial({ color: 0x222226, emissive: 0xff3a10, emissiveIntensity: 0, roughness: 0.6 }), x, 0.925, z);
      burners.push(ring);
      for (const rot of [0, Math.PI / 2]) { const bar = add(new THREE.BoxGeometry(r * 2.3, 0.02, 0.02), black, x, 0.945, z); bar.rotation.y = rot; }
    }
    add(new THREE.BoxGeometry(0.86, 0.1, 0.02), black, 0, 0.78, 0.415); // panel s knoflíky
    for (let i = 0; i < 4; i++) {
      const knob = add(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 14), chrome, -0.3 + i * 0.2, 0.78, 0.44);
      knob.rotation.x = Math.PI / 2;
    }
    add(new RoundedBoxGeometry(0.76, 0.48, 0.03, 2, 0.015), enamel, 0, 0.42, 0.42); // dvířka trouby
    const glass = add(new THREE.BoxGeometry(0.5, 0.24, 0.01), new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.1, metalness: 0.2, emissive: 0xff6a20, emissiveIntensity: 0.05 }), 0, 0.42, 0.44);
    const handle = add(new THREE.CylinderGeometry(0.018, 0.018, 0.6, 10), chrome, 0, 0.62, 0.47);
    handle.rotation.z = Math.PI / 2;
    // Hrnec na plotně (ukáže se při vaření)
    const pot = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0xc8ccd4, roughness: 0.25, metalness: 0.9 });
    const potBody = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.12, 0.16, 20, 1, true), steel);
    potBody.material.side = THREE.DoubleSide;
    potBody.position.y = 0.08;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.015, 20), steel);
    lid.position.y = 0.165;
    const knobL = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), black);
    knobL.position.y = 0.185;
    pot.add(potBody, lid, knobL);
    for (const sx of [-1, 1]) { const h = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.015, 0.03), black); h.position.set(sx * 0.155, 0.13, 0); pot.add(h); }
    pot.position.set(-0.24, 0.94, 0.16);
    pot.visible = false;
    g.add(pot);
    g.userData.stove = { burners, glass, pot, lid };
  } else if (type === 'table') {
    // Stůl: deska se zaoblenými hranami, nohy; na něm talíř s jídlem a příbor
    const wood = new THREE.MeshStandardMaterial({ map: planksTex, color: 0xd8b088, roughness: 0.55 });
    const top = new THREE.Mesh(new RoundedBoxGeometry(1, 0.08, 1, 2, 0.03), wood);
    top.position.y = 0.86;
    g.add(top);
    for (const [x, z] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.82, 0.08), wood);
      leg.position.set(x, 0.41, z);
      g.add(leg);
    }
    const t = tableItems.get(key);
    if (t?.food || t?.cutlery) {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.03, 24), new THREE.MeshStandardMaterial({ color: 0xf6f6f8, roughness: 0.25 }));
      plate.position.y = 0.915;
      g.add(plate);
      if (t.food) {
        const food = new THREE.Group();
        const style = DINE_STYLE[t.food] === 'chop' || DINE_STYLE[t.food] === 'stab' ? 'chop' : DINE_STYLE[t.food] || 'icon';
        buildFoodInto(food, t.food, style === 'chop' && !/maki|nigiri|sushi/.test(t.food) ? 'stab' : style);
        food.scale.setScalar(1.3);
        food.position.y = 0.93;
        g.add(food);
      }
      if (t.cutlery) {
        const steel = new THREE.MeshStandardMaterial({ color: 0xe6eaf0, metalness: 1, roughness: 0.2 });
        const fork = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.01, 0.3), steel);
        fork.position.set(-0.3, 0.905, 0);
        const knife = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.01, 0.32), steel);
        knife.position.set(0.3, 0.905, 0);
        g.add(fork, knife);
      }
    }
  } else if (type === 'chair') {
    // Židle natočená podle toho, jak ji hráč postavil
    const wood = new THREE.MeshStandardMaterial({ map: planksTex, color: 0xc89868, roughness: 0.6 });
    const seat = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.07, 0.5, 2, 0.02), wood);
    seat.position.y = 0.46;
    const back = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.5, 0.06, 2, 0.02), wood);
    back.position.set(0, 0.76, 0.22);
    g.add(seat, back);
    for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.44, 0.06), wood);
      leg.position.set(x, 0.22, z);
      g.add(leg);
    }
    g.rotation.y = chairRot.get(key) || 0;
  } else if (type === 'well') {
    // Studna: kamenná obruba s vodou, dřevěná stříška
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.7, 16, 1, true), new THREE.MeshStandardMaterial({ map: rockTex, roughness: 1, side: THREE.DoubleSide }));
    ring.position.y = 0.35;
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.46, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a6ad0, roughness: 0.1, metalness: 0.2 }));
    water.position.y = 0.55;
    g.add(ring, water);
    for (const x of [-0.42, 0.42]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.08), blockMats.planks);
      post.position.set(x, 0.9, 0);
      g.add(post);
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.45, 4), blockMats.planks);
    roof.position.y = 1.7;
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
  } else if (type === 'spikes') {
    const metal = new THREE.MeshStandardMaterial({ color: 0xc0c6d0, metalness: 0.9, roughness: 0.3 });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.06, 0.96), metal);
    plate.position.y = 0.03;
    g.add(plate);
    const spike = new THREE.ConeGeometry(0.07, 0.42, 6);
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Mesh(spike, metal);
      c.position.set(((i % 3) - 1) * 0.3, 0.27, (Math.floor(i / 3) - 1) * 0.3);
      g.add(c);
    }
  } else if (type === 'spawner') {
    // Klec s fialovým jádrem – z ní se rodí tvorové.
    const bars = new THREE.MeshStandardMaterial({ color: 0x2a2a34, metalness: 0.9, roughness: 0.4 });
    const bar = new THREE.BoxGeometry(0.06, 0.96, 0.06), barH = new THREE.BoxGeometry(0.96, 0.06, 0.06);
    for (const [x, z] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45], [0, -0.45], [0, 0.45], [-0.45, 0], [0.45, 0]]) {
      const b = new THREE.Mesh(bar, bars);
      b.position.set(x, 0.48, z);
      g.add(b);
    }
    for (const y of [0.03, 0.93]) for (const [rz, x, z] of [[0, 0, -0.45], [0, 0, 0.45], [Math.PI / 2, -0.45, 0], [Math.PI / 2, 0.45, 0]]) {
      const b = new THREE.Mesh(barH, bars);
      b.position.set(x, y, z);
      b.rotation.y = rz;
      g.add(b);
    }
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), new THREE.MeshStandardMaterial({ color: 0x3a0a4a, emissive: 0xc040ff, emissiveIntensity: 2 }));
    core.position.y = 0.48;
    g.add(core);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(0xb040ff).multiplyScalar(GLOW), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.scale.setScalar(1.2);
    s.position.y = 0.48;
    s.userData.base = 1.2;
    g.add(s);
    flames.push(s);
  } else if (type === 'chest') {
    const wood = blockMats.planks, dark = new THREE.MeshStandardMaterial({ color: 0x3a2814, roughness: 0.9 });
    const metal = new THREE.MeshStandardMaterial({ color: 0xc8c8d0, metalness: 0.9, roughness: 0.35 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.56, 0.86), wood);
    body.position.y = 0.28;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.26, 0.88), wood);
    lid.position.y = 0.69;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.9), dark);
    band.position.y = 0.57;
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.05), metal);
    lock.position.set(0, 0.58, 0.45);
    g.add(body, lid, band, lock);
  } else if (type === 'torch') { // stojí, nebo visí na zdi (render/torch-model.js, pravidla shared/world/torch.js)
    const [x, y, z] = key.split(',').map(Number);
    buildTorchModel(g, flames, torchMeta(key, x, y, z));
  }
  if (type === 'furnace') { // kamenná pec, otvor vpředu (+z) žhne, když hoří
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), blockMats.cobble);
    body.position.y = 0.5;
    const hole = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.02), new THREE.MeshStandardMaterial({ color: 0x1a0e08 }));
    hole.position.set(0, 0.36, 0.505);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.16, 0.02), new THREE.MeshStandardMaterial({ color: 0x2a1408, emissive: 0xff6a1a, emissiveIntensity: 0 }));
    glow.position.set(0, 0.28, 0.512);
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.26), blockMats.bricks);
    chimney.position.set(0.25, 1.1, -0.2);
    g.add(body, hole, glow, chimney);
    g.userData.glow = glow;
  }
  if (type === 'adv_bench') { // dílna: pracovní stůl s ocelovou deskou, svěrákem a nářadím
    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa0aa, metalness: 0.8, roughness: 0.35 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(1, 0.14, 1), steel);
    top.position.y = 0.86;
    g.add(top);
    for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.8, 0.14), blockMats.planks);
      leg.position.set(x, 0.4, z);
      g.add(leg);
    }
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.9), blockMats.planks);
    shelf.position.y = 0.3;
    const vise = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.18), new THREE.MeshStandardMaterial({ color: 0x3a5ab0, metalness: 0.4, roughness: 0.5 }));
    vise.position.set(-0.3, 1.01, 0.3);
    const tool = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.06), steel);
    tool.position.set(0.15, 0.95, -0.1);
    tool.rotation.y = 0.6;
    const coilM = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.03, 6, 12), new THREE.MeshStandardMaterial({ color: 0xd8783a, metalness: 0.7, roughness: 0.4 }));
    coilM.rotation.x = Math.PI / 2;
    coilM.position.set(0.25, 0.97, 0.25);
    g.add(shelf, vise, tool, coilM);
  }
  if (type === 'glowshroom') { // malá houba, která svítí do tmy
    const glow = new THREE.MeshStandardMaterial({ color: 0x3af0ff, emissive: 0x2ad8ff, emissiveIntensity: 1.8, roughness: 0.4 });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.22, 8), new THREE.MeshStandardMaterial({ color: 0xe8e2d0 }));
    stem.position.y = 0.11;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), glow);
    cap.position.y = 0.2;
    cap.scale.y = 0.7;
    g.add(stem, cap);
  }
  if (type === 'lantern') { // železná lucerna se svíčkou za sklem
    const iron = new THREE.MeshStandardMaterial({ color: 0x3a3e46, metalness: 0.7, roughness: 0.4 });
    const glass = new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffa040, emissiveIntensity: 1.6, transparent: true, opacity: 0.8 });
    const box = (w, h, d, m, x, y, z) => { const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.position.set(x, y, z); g.add(me); };
    box(0.34, 0.05, 0.34, iron, 0, 0.025, 0);
    box(0.36, 0.06, 0.36, iron, 0, 0.45, 0);
    for (const [x, z] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) box(0.04, 0.4, 0.04, iron, x, 0.24, z);
    box(0.26, 0.36, 0.26, glass, 0, 0.24, 0);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 6, 14), iron);
    ring.position.y = 0.53;
    g.add(ring);
    flame(0.55, 0.24);
  }
  if (BLOCKS[type].elec) buildElecModel(type, g); // elektrická zařízení (14c)
  else if (type === 'garage') buildGarageModel(g); // garáž: přelakování a vylepšení vozidel
  return { obj: g, flames };
}

on('blocksChanged', () => rebuildBlocks()); // pravidla změnila bloky (stavba, růst plodin)
const litBlocks = []; // obyčejné bloky, které svítí (neony): { type, x, y, z, ry }
export function rebuildBlocks() {
  litBlocks.length = 0;
  for (const [k, type] of blocks) if (BLOCKS[type].light && !BLOCKS[type].special) { const [x, y, z] = k.split(',').map(Number); litBlocks.push({ type, x, y, z, ry: y + 0.5, flames: [] }); }
  // Obyčejné bloky se kreslí po skupinách (stejný tvar + materiál = jeden InstancedMesh); schody a další tvary jsou natočené.
  const groups = new Map();
  for (const [k, type] of blocks) {
    const B = BLOCKS[type];
    if (B.special || B.cable) continue; // kabely kreslí rebuildCables
    const [x, y, z] = k.split(',').map(Number);
    const meta = B.shape ? blockMeta.get(k) || 0 : 0;
    dummy.position.set(x + 0.5, y + 0.5 + (meta & 4 ? 0.5 : 0), z + 0.5);
    dummy.rotation.set(0, (meta & 3) * Math.PI / 2, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    const gk = (B.shape || 'cube') + '|' + (B.mat || type);
    if (!groups.has(gk)) groups.set(gk, []);
    groups.get(gk).push(dummy.matrix.clone());
  }
  for (const [gk, list] of groups) {
    let m = instPool.get(gk);
    if (!m || m.instanceMatrix.count < list.length) {
      if (m) { scene.remove(m); m.dispose(); }
      const [shape, mk] = gk.split('|');
      m = new THREE.InstancedMesh(shape === 'cube' ? boxGeo : shapeGeo(shape), readyMat(blockMats[mk]), Math.max(64, Math.ceil(list.length * 1.5)));
      m.frustumCulled = false;
      scene.add(m);
      instPool.set(gk, m);
    }
    list.forEach((mt, i) => m.setMatrixAt(i, mt));
    m.count = list.length;
    m.instanceMatrix.needsUpdate = true;
  }
  for (const [gk, m] of instPool) if (!groups.has(gk)) m.count = 0;
  rebuildCables();
  markPowerDirty(); // změna bloků = přepočítat elektrické sítě

  for (const [k, type] of blocks) {
    if (!BLOCKS[type].special) continue;
    const old = specials.get(k);
    if (old && (type !== 'torch' || old.tm === torchMeta(k, old.x, old.y, old.z))) continue;
    if (old) { scene.remove(old.obj); specials.delete(k); } // pochodeň se přichytila jinak (stará pochodeň, jiný hráč)
    const [x, y, z] = k.split(',').map(Number);
    const { obj, flames } = buildSpecial(type, k);
    const tm = type === 'torch' ? torchMeta(k, x, y, z) : 0, gh = groundHeight(x + 0.5, z + 0.5);
    // pochodeň na zdi visí v buňce, stojící stojí na povrchu terénu, když je v její buňce
    const ry = tm > 1 ? y : tm ? (gh > y - 0.3 && gh < y + 0.9 ? Math.max(y, gh) : y) : solidAt(x, y - 1, z) || solidVox(x, y - 1, z) ? y : Math.max(y, gh);
    obj.position.set(x + 0.5, ry, z + 0.5);
    if (BLOCKS[type].facing) obj.rotation.y = ((blockMeta.get(k) || 0) & 3) * Math.PI / 2; // pec a dílna čelem k hráči
    scene.add(obj);
    const f = tm && torchFlame(tm); // kde hoří plamen (světlo, jiskry, kouř)
    specials.set(k, { type, x, y, z, ry, obj, flames, ...(tm ? { tm, lp: [x + 0.5 + f[0], ry + f[1], z + 0.5 + f[2]] } : {}) });
  }
  for (const [k, s] of specials) if (!blocks.has(k)) { scene.remove(s.obj); specials.delete(k); }
}

// Světla pochodní a táboráků: pevný počet světel se přiděluje těm nejbližším.
// Oheň svítí teplou bílou (asi 3000 K, LK.torch), ne červeně – zelená tráva pod ním zůstane zelená; elektřina chladně bílou.
const FIRE_COL = new THREE.Color(...LK.torch), ELEC_COL = new THREE.Color(0.78, 0.9, 1.08), GLOWSHROOM_COL = new THREE.Color(0.35, 0.9, 1.0), SPAWNER_COL = new THREE.Color(0.8, 0.35, 1.0), tmpLC = new THREE.Color();
const lightPool = Array.from({ length: GFX.lights }, () => { const l = new THREE.PointLight(FIRE_COL, 0, 16, 1.7); scene.add(l); return l; });
export function updateLights(time) {
  // elektrická světla svítí jen napájená
  // hořící pec svítí jako v Minecraftu (o něco slaběji než pochodeň)
  const list = [...specials.entries()].filter(([k, s]) => (s.type === 'furnace' ? furnaces.get(k)?.burn > 0 : BLOCKS[s.type].light && (!BLOCKS[s.type].elec || isPowered(k)))).map(([, s]) => s).concat(litBlocks);
  const p = player.pos;
  const d2 = (s) => (s.x + 0.5 - p.x) ** 2 + (s.ry - p.y) ** 2 + (s.z + 0.5 - p.z) ** 2;
  list.sort((a, b) => d2(a) - d2(b));
  // Pochodeň v ruce svítí kolem hráče (v jeskyních k nezaplacení).
  const heldTorch = heldStack()?.id === 'torch';
  lightPool.forEach((l, i) => {
    // plamen mihotá 2–3× za sekundu o ±15 %
    const flick = 0.92 + 0.09 * Math.sin(time * 14.5 + i * 1.7) + 0.045 * Math.sin(time * 33 + i * 3) + 0.025 * Math.sin(time * 71 + i);
    if (heldTorch && i === 0) { l.position.set(camera.position.x + 0.3, camera.position.y + 0.2, camera.position.z); l.intensity = 4.5 * flick; l.color.copy(FIRE_COL); return; }
    const s = list[heldTorch ? i - 1 : i];
    if (!s) { l.intensity = 0; return; }
    const elec = BLOCKS[s.type].elec;
    const fur = s.type === 'furnace', fy = fur ? s.obj.rotation.y : 0; // pec: světlo kousek před otvorem
    if (s.lp) l.position.set(...s.lp); else l.position.set(s.x + 0.5 + (fur ? Math.sin(fy) * 0.8 : 0), s.ry + (s.type === 'campfire' ? 0.6 : s.type === 'electric_lamp' ? 1.2 : s.type === 'bulb_lamp' ? 0.45 : fur ? 0.4 : 0.85), s.z + 0.5 + (fur ? Math.cos(fy) * 0.8 : 0));
    l.color.copy(BLOCKS[s.type].lightColor ? tmpLC.setHex(BLOCKS[s.type].lightColor) : elec ? ELEC_COL : s.type === 'glowshroom' ? GLOWSHROOM_COL : s.type === 'spawner' ? SPAWNER_COL : FIRE_COL);
    l.intensity = (fur ? 6 : BLOCKS[s.type].light) * (elec || BLOCKS[s.type].lightColor ? 1 : flick); // žárovka a neon neblikají
  });
  // stejná světla dostane i terén a tráva (mají vlastní shader, viz POINT_GLSL v light-glsl.js)
  for (let i = 0; i < U.pl.value.length; i++) {
    const l = lightPool[i];
    if (!l || l.intensity <= 0) { U.pl.value[i].w = 0; continue; }
    U.pl.value[i].set(l.position.x, l.position.y, l.position.z, l.intensity);
    U.plColor.value[i].set(l.color.r, l.color.g, l.color.b);
  }
  const cp = camera.position;
  for (const s of list) {
    const hk = s.lp ? Math.min(1, Math.max(0, (Math.hypot(s.lp[0] - cp.x, s.lp[1] - cp.y, s.lp[2] - cp.z) - 2.5) / 3.5)) : 1; // záře pochodně: zblízka ne
    for (const f of s.flames) { const sc = f.userData.base * (f.userData.halo ? hk : 1) * (0.85 + 0.2 * Math.sin(time * 17 + s.x + s.z * 0.7 + f.position.y * 9)); f.scale.set(sc, sc * (f.userData.tall || 1), 1); }
  }
}

// 3D ikony bloků a strojů (render/icon-render.js) – až po načtení všech modulů (modely strojů jsou v pozdějších souborech).
const ICON_3D = ['workbench', 'chest', 'stove', 'furnace', 'adv_bench', 'table', 'chair', 'well', 'spikes', 'spawner', 'coal_generator', 'solar_panel',
  'battery_block', 'power_switch', 'electric_lamp', 'bulb_lamp', 'motor_block', 'electric_furnace', 'charger', 'computer', 'printer', 'garage'];
export function blockIconList() {
  const items = [];
  for (const [id, b] of Object.entries(BLOCKS)) {
    if (!ITEMS[id] || b.cable || b.special) continue;
    const mat = blockMats[b.mat || id]; // bez map reliéfu (ty se dělají až pro bloky ve světě)
    if (!mat) continue;
    items.push([id, (g) => { const m = new THREE.Mesh((b.shape ? shapeGeo(b.shape) : boxGeo).clone(), mat); m.position.y = 0.5; if (b.shape) m.rotation.y = Math.PI; g.add(m); }, 0.5, 0.82]);
  }
  for (const id of ICON_3D) {
    if (!BLOCKS[id] || !ITEMS[id]) continue;
    items.push([id, (g) => {
      const { obj } = buildSpecial(id, '');
      g.add(obj);
      const U = obj.userData; // stroj na ikoně je zapnutý: svítí proužky a zelená kontrolka (hologram ne)
      if (U.holo) obj.remove(U.holo.mesh);
      for (const m of U.strips || []) m.emissiveIntensity = 1.4;
      if (U.status) { U.status.emissive.setHex(0x5cff8a); U.status.emissiveIntensity = 2; }
      if (U.cells) U.cells.emissiveIntensity = 0.6;
      if (U.glow) U.glow.emissiveIntensity = 1.4;
    }]);
  }
  return items;
}
// Ikony se kreslí na pozadí chvíli po startu (shadery se překládají bez zastavení hry).
setTimeout(() => renderIcons(blockIconList()), 300);
