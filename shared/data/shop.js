// Obchod za zlato: /sell (nebo /prodat) prodá zlato z batohu za zlaťáky, /shop (nebo /obchod) otevře obchod
// (client/src/ui/shop.js). Zlaťák je obyčejný předmět v batohu, takže se ukládá všude jako ostatní věci.
// Vychytávky z obchodu se nedají vyrobit, jen koupit. Jen data (nic se nespouští při načtení).
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
add('jet', 'Stíhačka', { vehicle: 'jet', art: ['jet', '#5a6470', '#ff5a2a'], cat: 'aircraft' });

/** Co je v obchodě a za kolik zlaťáků (pořadí = pořadí v okně). */
export const SHOP = [
  ['medkit', 15], ['wings', 60], ['trident', 80], ['flamethrower', 100],
  ['saber_blue', 150], ['saber_green', 150], ['saber_purple', 150], ['saber_red', 180], ['jet', 400],
];
/** Za kolik zlaťáků se vykupuje zlato. */
export const SELL = { gold_ingot: 10, gold_ore: 6, gold_block: 90, gold_wire: 1, gold_contact: 3 };
