// Obchod za zlato: /sell (nebo /prodat) prodá zlato z batohu za zlaťáky, /shop (nebo /obchod) otevře obchod
// (client/src/ui/shop.js). Zlaťák je obyčejný předmět v batohu, takže se ukládá všude jako ostatní věci.
// Vychytávky z obchodu se nedají vyrobit, jen koupit. Jen data (nic se nespouští při načtení).
import { BLOCKS } from './blocks.js';
import { ITEMS } from './items.js';

// Předměty obchodu. Pole pro chování: saber = barva čepele (světelný meč), throw = trojzubec (pravé tl. hodí),
// wings = sekundy letu na pravé tlačítko, flame = plamenomet (drž pravé tl.), medkit = vyléčí, vehicle = vozidlo.
const add = (id, name, extra) => { ITEMS[id] = { name, stack: 1, shop: true, ...extra }; };
ITEMS.coin = { name: 'Zlaťák', stack: 999 };
add('saber_blue', 'Modrý světelný meč', { tool: 'sword', tier: 5, dmg: 16, dur: 6000, saber: 0x3aa8ff });
add('saber_green', 'Zelený světelný meč', { tool: 'sword', tier: 5, dmg: 16, dur: 6000, saber: 0x3aff5a });
add('saber_red', 'Rudý světelný meč', { tool: 'sword', tier: 5, dmg: 17, dur: 6000, saber: 0xff2a2a });
add('saber_purple', 'Fialový světelný meč', { tool: 'sword', tier: 5, dmg: 16, dur: 6000, saber: 0xb05aff });
add('trident', 'Trojzubec', { tool: 'sword', tier: 4, dmg: 11, dur: 1500, throw: { dmg: 14, cd: 0.8 } });
add('wings', 'Křídla', { wings: 30 });
add('flamethrower', 'Plamenomet', { flame: { dmg: 2, range: 9 }, dur: 900 });
add('medkit', 'Lékárnička', { medkit: true, stack: 8 });
// Přehrávač filmové hudby (blok) a hudební disky: vlastní skladby ve filmovém stylu (client/src/audio/film-music.js)
BLOCKS.jukebox = { name: 'Přehrávač filmové hudby', solid: true, hard: 1.5, tool: 'axe', drop: 'jukebox', special: true };
add('jukebox', 'Přehrávač filmové hudby', { block: 'jukebox', stack: 8 });
export const DISCS = [['disc_hero', 'Hrdinský pochod', '#e8c030'], ['disc_space', 'Hvězdná výprava (vesmírná opera)', '#3a6ae8'], ['disc_mystery', 'Tajemný les', '#2a8a4a'], ['disc_battle', 'Poslední bitva', '#c82a2a'], ['disc_finale', 'Velké finále', '#b05aff']];
for (const [id, name] of DISCS) add(id, `Hudební disk: ${name}`, { disc: true, stack: 16 });
// Další speciální vychytávky (client/src/player/gadgets.js). Pole: jetpack (drž pravé tl.), teleport = dosah (m),
// ray = paprsková zbraň { dmg, cd, color, slow }, hammer = blesk na pravé tl. (cd s), speed = s rychlého běhu,
// grenade = { dmg, r } výbuch, firework = ohňostroj, grapple = dosah háku (m).
add('saber_gold', 'Zlatý světelný meč', { tool: 'sword', tier: 5, dmg: 18, dur: 8000, saber: 0xffc830 });
add('jetpack', 'Raketový batoh', { jetpack: true, dur: 600 });
add('teleport_orb', 'Teleportační koule', { teleport: 40, stack: 16 });
add('freeze_ray', 'Mrazicí paprsek', { ray: { dmg: 5, cd: 0.6, color: 0x8ae8ff, slow: true }, dur: 500 });
add('blaster', 'Blaster', { ray: { dmg: 6, cd: 0.18, color: 0xff3a2a, auto: true }, dur: 1200 });
add('thunder_hammer', 'Hromové kladivo', { tool: 'sword', tier: 5, dmg: 13, dur: 2000, hammer: 3 });
add('speed_potion', 'Lektvar rychlosti', { speed: 30, stack: 8 });
add('grenade', 'Granát', { grenade: { dmg: 14, r: 4 }, stack: 16 });
add('firework', 'Ohňostroj', { firework: true, stack: 32 });
add('grapple', 'Hák na laně', { grapple: 35, dur: 400 });
add('jet', 'Stíhačka', { vehicle: 'jet', art: ['jet', '#5a6470', '#ff5a2a'], cat: 'aircraft' });

/** Co je v obchodě a za kolik zlaťáků (pořadí = pořadí v okně). */
export const SHOP = [
  ['medkit', 15], ['wings', 60], ['trident', 80], ['flamethrower', 100],
  ['saber_blue', 150], ['saber_green', 150], ['saber_purple', 150], ['saber_red', 180], ['jet', 400],
  ['jukebox', 60], ...DISCS.map(([id]) => [id, 25]),
  ['saber_gold', 250], ['jetpack', 120], ['teleport_orb', 20], ['freeze_ray', 90], ['blaster', 110], ['thunder_hammer', 200],
  ['speed_potion', 15], ['grenade', 12], ['firework', 3], ['grapple', 70],
];
/** Další věci ze hry v obchodě (123 kusů): ceny v zlaťácích. Zlato tu není, aby nešlo dokola kupovat a prodávat. */
export const SHOP_MORE = [
  // základ
  ['log', 2], ['planks', 1], ['stick', 1], ['stone', 1], ['coal', 3], ['torch', 2], ['bricks', 2], ['glass', 3], ['sand', 1], ['obsidian', 15], ['iron', 12], ['copper_ingot', 8], ['steel_ingot', 18], ['markorite', 40], ['shard', 25],
  // nástroje
  ['stone_axe', 5], ['stone_pick', 5], ['stone_sword', 5], ['stone_shovel', 4], ['iron_axe', 30], ['iron_pick', 30], ['iron_sword', 30], ['iron_shovel', 25], ['crystal_axe', 60], ['crystal_pick', 60], ['crystal_sword', 60], ['crystal_shovel', 50], ['markorite_axe', 100], ['markorite_pick', 100], ['markorite_sword', 100], ['markorite_shovel', 90], ['bow', 20], ['arrow', 1], ['fishing_rod', 10], ['hoe', 8],
  // brnění
  ['iron_helmet', 35], ['iron_chestplate', 55], ['iron_leggings', 45], ['iron_boots', 30], ['crystal_helmet', 70], ['crystal_chestplate', 110], ['crystal_leggings', 90], ['crystal_boots', 60], ['markorite_helmet', 120], ['markorite_chestplate', 180], ['markorite_leggings', 150], ['markorite_boots', 100], ['shadow_helmet', 80], ['shadow_chestplate', 120], ['shadow_leggings', 100], ['shadow_boots', 70],
  // jídlo
  ['apple', 2], ['bread', 4], ['steak', 6], ['roast_chicken', 6], ['baked_potato', 4], ['pizza', 10], ['hamburger', 9], ['spaghetti', 8], ['pancakes', 6], ['sushi_platter', 12], ['strudel', 8], ['schnitzel', 9], ['goulash', 8], ['cheese', 4], ['fruit_salad', 5], ['chicken_soup', 7], ['fries', 4], ['banana', 2], ['markapple', 30],
  // farma a kuchyně
  ['wheat_seeds', 1], ['tomato_seeds', 1], ['potato', 2], ['egg', 2], ['milk_bucket', 5], ['bucket', 6], ['salt', 1], ['flour', 2], ['knife', 6], ['pot', 8],
  // stavba
  ['granite', 1], ['marble', 2], ['basalt', 2], ['polished_stone', 2], ['stone_tiles', 2], ['polished_marble', 3], ['marble_pillar', 4], ['cherry_planks', 2], ['jungle_planks', 2], ['acacia_planks', 2], ['sandstone', 2], ['smooth_sandstone', 3], ['glass_pane', 2], ['concrete_white', 3], ['concrete_black', 3], ['concrete_red', 3], ['concrete_blue', 3], ['concrete_green', 3], ['concrete_yellow', 3], ['quartz_block', 6], ['iron_bars', 4], ['lantern', 6],
  // technika
  ['rubber', 4], ['plastic', 4], ['gear', 5], ['spring', 3], ['copper_wire', 2], ['circuit_board', 15], ['electronic_circuit', 25], ['processor', 60], ['battery_cell', 10], ['led', 4], ['light_bulb', 5], ['electric_motor', 40], ['solar_panel', 50], ['electric_lamp', 15], ['neon_cyan', 8], ['neon_magenta', 8],
  // vozidla
  ['car', 300], ['bike', 40], ['motorboat', 250], ['sailboat', 150], ['biplane', 350],
];
SHOP.push(...SHOP_MORE);
/** Za kolik zlaťáků se vykupuje zlato. */
export const SELL = { gold_ingot: 10, gold_ore: 6, gold_block: 90, gold_wire: 1, gold_contact: 3 };
