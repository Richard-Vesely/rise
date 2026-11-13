// Peklo (shared/world/hell.js): bloky, předměty, ohnivé brnění a recepty. Jen data (nic se nespouští při načtení).
//   Pekelná skála (nezničitelná: zdi, podlaha a střecha), láva (svítí, pálí), ohnivý drahokam a jeho ruda (vzácné),
//   kbelík lávy, ohnivá koule (hází se), ohnivý meč, ohnivá sada brnění, hororový disk (padá z ďáblů),
//   socha Marka boha všemohoucího a oltář (cesta domů), portál do pekla.
import { BLOCKS } from './blocks.js';
import { ARMOR_SETS, ARMOR_SLOTS, ITEMS, RECIPES } from './items.js';

// bloky pekla (fixed = nedají se vytěžit ani změnit, jako socha a vězení)
BLOCKS.hell_rock = { name: 'Pekelná skála', solid: true, hard: 99, drop: null, fixed: true, tint: 0x5a1a14 };
BLOCKS.hell_lava = { name: 'Láva', solid: false, hard: 99, drop: null, fixed: true, tint: 0xff6a10, light: 12, lightColor: 0xff6a20 };
BLOCKS.hell_statue = { name: 'Socha Marka boha všemohoucího', solid: true, hard: 99, drop: null, fixed: true, tint: 0xe2b33c, light: 6, lightColor: 0xffc060 };
BLOCKS.hell_altar = { name: 'Oltář Marka boha všemohoucího', solid: true, hard: 99, drop: null, fixed: true, tint: 0x2a1a24 };
BLOCKS.fire_gem_ore = { name: 'Ohnivá ruda', solid: true, hard: 4, tool: 'pick', req: 3, drop: 'fire_gem', tint: 0xb83a1a, light: 4, lightColor: 0xff5a20 };
BLOCKS.hell_portal = { name: 'Portál do pekla', solid: true, hard: 6, tool: 'pick', req: 3, drop: 'hell_portal', tint: 0x3a0a2a, light: 8, lightColor: 0xff3a6a };

ITEMS.hell_portal = { name: 'Portál do pekla', block: 'hell_portal', stack: 8 };
ITEMS.fire_gem = { name: 'Ohnivý drahokam', art: ['crystal', '#ff5a1a', '#ffd040'], stack: 64 };
ITEMS.lava_bucket = { name: 'Kbelík lávy', stack: 1 };
ITEMS.fire_charge = { name: 'Ohnivá koule', fireball: { dmg: 10 }, stack: 16 };
ITEMS.fire_sword = { name: 'Ohnivý meč', tool: 'sword', tier: 5, dmg: 15, dur: 2500, stack: 1, saber: 0xff6a1a };
ITEMS.disc_horror = { name: 'Hudební disk: Pekelný horor', disc: true, stack: 16 };

// ohnivá sada brnění: celá sada = láva tě nepálí (client/src/world/hell.js)
ARMOR_SETS.fire = { name: 'Ohniv', pts: [4, 8, 7, 4], bonus: 'láva tě nepálí' };
const FIRE_NAMES = ['Ohnivá helma', 'Ohnivé brnění', 'Ohnivé kalhoty', 'Ohnivé boty'], FIRE_DUR = [550, 800, 750, 650];
ARMOR_SLOTS.forEach((sl, i) => { ITEMS[`fire_${sl}`] = { name: FIRE_NAMES[i], armor: { slot: i, pts: ARMOR_SETS.fire.pts[i], set: 'fire' }, tier: 'fire', stack: 1, dur: FIRE_DUR[i] }; });

RECIPES.push(
  { out: 'hell_portal', n: 1, shape: ['OOO', 'OCO', 'OOO'], key: { O: 'obsidian', C: 'coal' }, cat: 'build' },
  { out: 'fire_helmet', n: 1, shape: ['MMM', 'M M'], key: { M: 'fire_gem' }, cat: 'tools' },
  { out: 'fire_chestplate', n: 1, shape: ['M M', 'MMM', 'MMM'], key: { M: 'fire_gem' }, cat: 'tools' },
  { out: 'fire_leggings', n: 1, shape: ['MMM', 'M M', 'M M'], key: { M: 'fire_gem' }, cat: 'tools' },
  { out: 'fire_boots', n: 1, shape: ['M M', 'M M'], key: { M: 'fire_gem' }, cat: 'tools' },
  { out: 'fire_sword', n: 1, shape: ['M', 'M', 'S'], key: { M: 'fire_gem', S: 'stick' }, cat: 'tools' },
);

/** Výkupné z pekla u oltáře: co se odevzdá (věci zmizí, nikdo je nedostane) a pak jdeš domů. */
export const HELL_PRICE = { discs: 3, fire_gem: 24, lava_bucket: 1 };
