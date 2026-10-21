// Předměty, nástroje, brnění, jídlo, recepty, kuchařka sporáku, plodiny a pečení v táboráku.
// Data se doplňují v blocks.js a tech.js; ostatní kód je bere ze shared/data/index.js.
// ============================================================ předměty a recepty
// Úrovně materiálu: 1 dřevo, 2 kámen, 3 železo, 4 krystal, 5 markorit (nejlepší).
const TIER_COLOR = { 1: '#a0784a', 2: '#a8a8a8', 3: '#eef0f6', 4: '#7ff3ff', 5: '#e070ff' };
export const TOOL_SPEED = { 1: 2, 2: 4, 3: 6, 4: 8, 5: 10 };
// Odolnost (kolik použití vydrží) podle materiálu: dřevo, kámen, železo, krystal, markorit (shared/tools.js).
export const TOOL_DUR = { 1: 59, 2: 131, 3: 250, 4: 900, 5: 2000 };
// Brnění: odolnost = násobek materiálu × základ kusu (helma 11, brnění 16, kalhoty 15, boty 13), jako v Minecraftu.
const ARMOR_DUR_BASE = [11, 16, 15, 13];
const ARMOR_DUR_MUL = { 3: 15, 4: 25, 5: 37, shadow: 20, sky: 33 };
export const ITEMS = {
  log: { name: 'Kmen', icon: '🪵' },
  planks: { name: 'Prkna', icon: '🟫', block: 'planks' },
  stick: { name: 'Klacek', icon: '🥢' },
  fiber: { name: 'Vlákno', icon: '🌾' },
  stone: { name: 'Kámen', icon: '🪨', block: 'cobble' },
  dirt: { name: 'Hlína', icon: '🟫', block: 'dirt' },
  coal: { name: 'Uhlí', icon: '⚫' },
  bricks: { name: 'Kamenné cihly', icon: '🧱', block: 'bricks' },
  iron_ore: { name: 'Železná ruda', icon: '🟠' },
  iron: { name: 'Železný ingot', icon: '🔩' },
  shard: { name: 'Úlomek světla', icon: '💎' },
  essence: { name: 'Stínová esence', icon: '🟣' },
  wool: { name: 'Vlna', icon: '🧶' },
  berries: { name: 'Lesní plody', icon: '🫐', food: 8 },
  raw_meat: { name: 'Syrové maso', icon: '🥩', food: 6 },
  meat: { name: 'Pečené maso', icon: '🍖', food: 35, heal: 10 },
  torch: { name: 'Pochodeň', icon: '🕯️', block: 'torch' },
  campfire: { name: 'Táborák', icon: '🔥', block: 'campfire', stack: 8 },
  workbench: { name: 'Pracovní stůl', icon: '🛠️', block: 'workbench', stack: 8 },
  chest: { name: 'Truhla', icon: '📦', block: 'chest', stack: 8 },
  safe: { name: 'Trezor', icon: '🔒', block: 'safe', stack: 8 }, // truhla na kód (client/src/machines/safe.js)
  // Markova dimenze
  markwood: { name: 'Markwood', icon: '🪵' },
  mark_planks: { name: 'Markwood prkna', icon: '🟦', block: 'mark_planks' },
  markdirt: { name: 'Markdirt', icon: '🟦', block: 'markdirt' },
  markorite_raw: { name: 'Surový markorit', icon: '🟪' },
  markorite: { name: 'Markoritový ingot', icon: '🟪' },
  markapple: { name: 'Markové jablko', icon: '🍎', food: 20, heal: 8, fly: 10 },
  spikes: { name: 'Hroty', icon: '⚔', block: 'spikes' },
};
const TIERS = [
  [1, 'wood', 'Dřevěn'], [2, 'stone', 'Kamenn'], [3, 'iron', 'Železn'], [4, 'crystal', 'Krystalov'], [5, 'markorite', 'Markoritov'],
];
for (const [t, key, mat] of TIERS) {
  ITEMS[`${key}_axe`] = { name: `${mat}á sekera`, tool: 'axe', tier: t, dmg: 1 + t, stack: 1, dur: TOOL_DUR[t] };
  ITEMS[`${key}_pick`] = { name: `${mat}ý krumpáč`, tool: 'pick', tier: t, dmg: 1 + t * 0.5, stack: 1, dur: TOOL_DUR[t] };
  ITEMS[`${key}_sword`] = { name: `${mat}ý meč`, tool: 'sword', tier: t, dmg: [0, 3, 4, 6, 9, 13][t], stack: 1, dur: TOOL_DUR[t] };
  ITEMS[`${key}_shovel`] = { name: `${mat}á lopata`, tool: 'shovel', tier: t, dmg: 1 + t * 0.5, stack: 1, dur: TOOL_DUR[t] };
}
// Brnění: helma, brnění, kalhoty, boty. Každý bod ochrany ubere 3,5 % zranění (max. 80 %).
export const ARMOR_SLOTS = ['helmet', 'chestplate', 'leggings', 'boots'];
export const ARMOR_SLOT_NAMES = ['Helma', 'Brnění', 'Kalhoty', 'Boty'];
const ARMOR_PTS = { 3: [2, 6, 5, 2], 4: [3, 7, 6, 3], 5: [4, 8, 7, 4] };
for (const [t, key, mat] of TIERS.slice(2)) {
  const names = [`${mat}á helma`, `${mat}é brnění`, `${mat}é kalhoty`, `${mat}é boty`];
  ARMOR_SLOTS.forEach((s, i) => { ITEMS[`${key}_${s}`] = { name: names[i], armor: { slot: i, pts: ARMOR_PTS[t][i] }, tier: t, stack: 1, dur: ARMOR_DUR_MUL[t] * ARMOR_DUR_BASE[i] }; });
}
// Speciální sady brnění s bonusem za celou sadu (všechny 4 kusy).
export const ARMOR_SETS = {
  shadow: { name: 'Stínov', pts: [2, 5, 4, 2], bonus: 'rychlejší běh, stínožrouti tě nechají být' },
  sky: { name: 'Nebesk', pts: [3, 7, 6, 3], bonus: 'dvojitý skok, pomalý pád, léčení' },
};
for (const [set, def] of Object.entries(ARMOR_SETS)) {
  const names = [`${def.name}á helma`, `${def.name}é brnění`, `${def.name}é kalhoty`, `${def.name}é boty`];
  ARMOR_SLOTS.forEach((sl, i) => { ITEMS[`${set}_${sl}`] = { name: names[i], armor: { slot: i, pts: def.pts[i], set }, tier: set, stack: 1, dur: ARMOR_DUR_MUL[set] * ARMOR_DUR_BASE[i] }; });
}
for (const it of Object.values(ITEMS)) it.stack ??= 64;

// Recepty jako v Minecraftu: tvar v mřížce výroby. Písmena odkazují na předměty v `key`, mezera = prázdné políčko.
// Recepty do 2×2 jdou vyrobit přímo v inventáři, větší potřebují pracovní stůl (mřížka 3×3).
export const RECIPES = [];
for (const P of ['planks', 'mark_planks']) {
  RECIPES.push(
    { out: 'stick', n: 4, shape: ['P', 'P'], key: { P } },
    { out: 'workbench', n: 1, shape: ['PP', 'PP'], key: { P } },
    { out: 'chest', n: 1, shape: ['PPP', 'P P', 'PPP'], key: { P } },
  );
}
RECIPES.unshift(
  { out: 'planks', n: 4, shape: ['L'], key: { L: 'log' } },
  { out: 'mark_planks', n: 4, shape: ['L'], key: { L: 'markwood' } },
);
RECIPES.push(
  { out: 'torch', n: 4, shape: ['F', 'S'], key: { F: 'fiber', S: 'stick' } },
  { out: 'torch', n: 8, shape: ['C', 'S'], key: { C: 'coal', S: 'stick' } },
  { out: 'bricks', n: 4, shape: ['CC', 'CC'], key: { C: 'stone' } },
  { out: 'campfire', n: 1, shape: [' S ', 'SLS', 'CCC'], key: { S: 'stick', L: 'log', C: 'stone' } },
);
const TOOL_MAT = { wood: 'planks', stone: 'stone', iron: 'iron', crystal: 'shard', markorite: 'markorite' };
for (const [, key] of TIERS) {
  const k = { M: TOOL_MAT[key], S: 'stick' };
  RECIPES.push(
    { out: `${key}_pick`, n: 1, shape: ['MMM', ' S ', ' S '], key: k },
    { out: `${key}_axe`, n: 1, shape: ['MM', 'MS', ' S'], key: k },
    { out: `${key}_sword`, n: 1, shape: ['M', 'M', 'S'], key: k },
    { out: `${key}_shovel`, n: 1, shape: ['M', 'S', 'S'], key: k },
  );
}
for (const [, key] of TIERS.slice(2)) {
  const k = { M: TOOL_MAT[key] };
  RECIPES.push(
    { out: `${key}_helmet`, n: 1, shape: ['MMM', 'M M'], key: k },
    { out: `${key}_chestplate`, n: 1, shape: ['M M', 'MMM', 'MMM'], key: k },
    { out: `${key}_leggings`, n: 1, shape: ['MMM', 'M M', 'M M'], key: k },
    { out: `${key}_boots`, n: 1, shape: ['M M', 'M M'], key: k },
  );
}
// ============================================================ jídlo, suroviny a nádobí (vaření podle skutečnosti)
Object.assign(ITEMS, {
  // suroviny
  egg: { name: 'Vejce', stack: 16 },
  raw_chicken: { name: 'Syrové kuře', food: 3, stack: 16 },
  raw_beef: { name: 'Syrové hovězí', food: 4, stack: 16 },
  bucket: { name: 'Kbelík', stack: 16 },
  water_bucket: { name: 'Kbelík vody', stack: 1 },
  milk_bucket: { name: 'Kbelík mléka', stack: 1 },
  wheat: { name: 'Pšenice', stack: 64 },
  wheat_seeds: { name: 'Semínka pšenice', stack: 64, plant: 'wheat_crop' },
  tomato: { name: 'Rajče', food: 4, stack: 64 },
  tomato_seeds: { name: 'Semínka rajčat', stack: 64, plant: 'tomato_crop' },
  potato: { name: 'Brambora', food: 2, stack: 64, plant: 'potato_crop' },
  mushroom: { name: 'Houba', food: 3, stack: 64 },
  apple: { name: 'Jablko', food: 6, stack: 64 },
  salt: { name: 'Sůl', stack: 64 },
  flour: { name: 'Mouka', stack: 64 },
  dough: { name: 'Těsto', stack: 16 },
  pasta: { name: 'Syrové špagety', stack: 16 },
  butter: { name: 'Máslo', stack: 16 },
  tomato_sauce: { name: 'Rajčatová omáčka', stack: 16 },
  // hotová jídla (food = sytost, heal = zdraví)
  fried_egg: { name: 'Volské oko', food: 18, heal: 4, stack: 16 },
  scrambled_eggs: { name: 'Míchaná vejce', food: 30, heal: 8, stack: 16 },
  spaghetti: { name: 'Špagety s rajčatovou omáčkou', food: 60, heal: 25, stack: 16 },
  pancakes: { name: 'Palačinky', food: 25, heal: 6, stack: 16 },
  berry_pancakes: { name: 'Palačinky s borůvkami', food: 40, heal: 12, stack: 16 },
  bread: { name: 'Chléb', food: 30, heal: 6, stack: 16 },
  steak: { name: 'Hovězí steak', food: 45, heal: 15, stack: 16 },
  roast_chicken: { name: 'Pečené kuře', food: 40, heal: 12, stack: 16 },
  baked_potato: { name: 'Pečená brambora', food: 15, heal: 3, stack: 16 },
  chicken_soup: { name: 'Kuřecí polévka', food: 45, heal: 30, stack: 16 },
  mashed_potatoes: { name: 'Bramborová kaše', food: 40, heal: 10, stack: 16 },
  fries: { name: 'Hranolky', food: 30, heal: 5, stack: 16 },
  mushroom_fry: { name: 'Houbová smaženice', food: 38, heal: 12, stack: 16 },
  fruit_salad: { name: 'Ovocný salát', food: 28, heal: 10, stack: 16 },
  // nádobí a náčiní (při vaření se nespotřebuje)
  knife: { name: 'Kuchyňský nůž', utensil: true, stack: 1 },
  pan: { name: 'Pánev', utensil: true, stack: 1 },
  pot: { name: 'Hrnec', utensil: true, stack: 1 },
  rolling_pin: { name: 'Váleček', utensil: true, stack: 1 },
  mill: { name: 'Ruční mlýnek', utensil: true, stack: 1 },
  bowl: { name: 'Mísa', utensil: true, stack: 1 },
  whisk: { name: 'Metla', utensil: true, stack: 1 },
  hoe: { name: 'Motyka', utensil: true, stack: 1, dur: 131 },
  // bloky
  stove: { name: 'Sporák', block: 'stove', stack: 8 },
  well: { name: 'Studna', block: 'well', stack: 8 },
});
RECIPES.push(
  { out: 'knife', n: 1, shape: ['I', 'S'], key: { I: 'iron', S: 'stick' } },
  { out: 'pan', n: 1, shape: ['II', 'IS'], key: { I: 'iron', S: 'stick' } },
  { out: 'pot', n: 1, shape: ['I I', 'I I', 'III'], key: { I: 'iron' } },
  { out: 'bucket', n: 1, shape: ['I I', ' I '], key: { I: 'iron' } },
  { out: 'whisk', n: 1, shape: ['I I', ' S '], key: { I: 'iron', S: 'stick' } },
  { out: 'rolling_pin', n: 1, shape: ['SPS'], key: { S: 'stick', P: 'planks' } },
  { out: 'mill', n: 1, shape: ['S', 'C', 'C'], key: { S: 'stick', C: 'stone' } },
  { out: 'bowl', n: 1, shape: ['P P', ' P '], key: { P: 'planks' } },
  { out: 'hoe', n: 1, shape: ['CC', ' S', ' S'], key: { C: 'stone', S: 'stick' } },
  { out: 'hoe', n: 1, shape: ['PP', ' S', ' S'], key: { P: 'planks', S: 'stick' } },
  { out: 'stove', n: 1, shape: ['III', 'CFC', 'CCC'], key: { I: 'iron', C: 'stone', F: 'campfire' } },
  { out: 'well', n: 1, shape: ['CCC', 'CBC', 'CCC'], key: { C: 'stone', B: 'bucket' } },
);
// Kuchařka sporáku: suroviny se spotřebují, nádobí ne. heat = vaří se na plotně/v troubě. returns = co se vrátí (prázdný kbelík).
export const KITCHEN = [
  { out: 'flour', n: 1, in: { wheat: 2 }, tools: ['mill'], time: 3, steps: 'Zrní pšenice semel v ručním mlýnku na jemnou mouku.' },
  { out: 'butter', n: 2, in: { milk_bucket: 1 }, tools: ['bowl', 'whisk'], time: 6, returns: { bucket: 1 }, steps: 'Mléko slij do mísy a šlehej metlou, dokud se z něj neoddělí máslo.' },
  { out: 'dough', n: 1, in: { flour: 2, egg: 1, water_bucket: 1, salt: 1 }, tools: ['bowl'], time: 4, returns: { bucket: 1 }, steps: 'V míse smíchej mouku, vejce, trochu vody a špetku soli. Hněť, až je těsto hladké.' },
  { out: 'pasta', n: 2, in: { dough: 1 }, tools: ['rolling_pin', 'knife'], time: 4, steps: 'Těsto vyválej válečkem na tenký plát a nožem nakrájej na dlouhé tenké špagety.' },
  { out: 'tomato_sauce', n: 1, in: { tomato: 3, salt: 1 }, tools: ['knife', 'pot'], heat: true, time: 8, steps: 'Rajčata nakrájej, dej do hrnce, osol a na plotně duste, až zhoustnou v omáčku.' },
  { out: 'spaghetti', n: 2, in: { pasta: 1, water_bucket: 1, salt: 1, tomato_sauce: 1 }, tools: ['pot'], heat: true, time: 10, returns: { bucket: 1 }, steps: 'V hrnci přiveď vodu k varu a osol ji. Vař špagety do měkka (al dente), sceď je a přelij rajčatovou omáčkou.' },
  { out: 'fried_egg', n: 1, in: { egg: 1, salt: 1 }, tools: ['pan'], heat: true, time: 5, steps: 'Na rozpálenou pánev rozklepni vejce. Nech ztuhnout bílek, žloutek ať zůstane tekutý. Osol.' },
  { out: 'scrambled_eggs', n: 1, in: { egg: 3, butter: 1, salt: 1 }, tools: ['bowl', 'whisk', 'pan'], heat: true, time: 6, steps: 'Vejce rozšlehej v míse. Na pánvi rozpusť máslo, vlij vejce a za stálého míchání nech zatáhnout. Osol.' },
  { out: 'pancakes', n: 3, in: { flour: 1, egg: 1, milk_bucket: 1 }, tools: ['bowl', 'whisk', 'pan'], heat: true, time: 8, returns: { bucket: 1 }, steps: 'Z mouky, vejce a mléka umíchej metlou řídké těsto. Na pánvi smaž tenké palačinky z obou stran.' },
  { out: 'berry_pancakes', n: 1, in: { pancakes: 1, berries: 2 }, tools: [], time: 2, steps: 'Palačinku naplň borůvkami a zaroluj.' },
  { out: 'bread', n: 1, in: { dough: 1, salt: 1 }, tools: [], heat: true, time: 12, steps: 'Těsto osol, vytvaruj bochník a upeč ho v troubě sporáku dozlatova.' },
  { out: 'chicken_soup', n: 2, in: { raw_chicken: 1, potato: 1, water_bucket: 1, salt: 1 }, tools: ['pot', 'knife', 'bowl'], heat: true, time: 12, returns: { bucket: 1 }, steps: 'Kuře a brambory nakrájej, zalij vodou v hrnci, osol a vař, dokud maso nezměkne. Podávej v míse.' },
  { out: 'mashed_potatoes', n: 2, in: { potato: 3, milk_bucket: 1, butter: 1, salt: 1 }, tools: ['pot', 'bowl'], heat: true, time: 10, returns: { bucket: 1 }, steps: 'Brambory uvař v hrnci doměkka, v míse je rozmačkej s máslem a teplým mlékem a osol.' },
  { out: 'fries', n: 1, in: { potato: 2, butter: 1, salt: 1 }, tools: ['knife', 'pan'], heat: true, time: 8, steps: 'Brambory nakrájej nožem na hranolky a na pánvi s máslem je osmaž dozlatova. Osol.' },
  { out: 'mushroom_fry', n: 1, in: { mushroom: 3, egg: 1, butter: 1 }, tools: ['knife', 'pan'], heat: true, time: 7, steps: 'Houby nakrájej a podus na másle. Nakonec přimíchej vejce a nech ztuhnout.' },
  { out: 'steak', n: 1, in: { raw_beef: 1, salt: 1, butter: 1 }, tools: ['pan'], heat: true, time: 7, steps: 'Maso osol a na rozpálené pánvi s máslem opeč z obou stran. Nech chvíli odpočinout.' },
  { out: 'fruit_salad', n: 1, in: { apple: 2, berries: 3 }, tools: ['knife', 'bowl'], time: 3, steps: 'Jablka nakrájej nožem na kostičky a v míse smíchej s borůvkami.' },
];
// Plodiny na poli: semínko -> 4 fáze růstu -> úroda.
export const CROPS = {
  wheat_crop: { name: 'Pšenice', seed: 'wheat_seeds', ripe: [['wheat', 1, 3], ['wheat_seeds', 1, 2]] },
  tomato_crop: { name: 'Rajčata', seed: 'tomato_seeds', ripe: [['tomato', 2, 4], ['tomato_seeds', 0, 1]] },
  potato_crop: { name: 'Brambory', seed: 'potato', ripe: [['potato', 2, 4]] },
  rice_crop: { name: 'Rýže', seed: 'rice', ripe: [['rice', 2, 4]] },
};

// Každé zvíře dává jiné maso; nová jídla z nich.
Object.assign(ITEMS, {
  raw_mutton: { name: 'Syrové skopové', food: 3, stack: 16 },
  raw_pork: { name: 'Syrové kančí', food: 3, stack: 16 },
  raw_venison: { name: 'Syrová zvěřina', food: 3, stack: 16 },
  cooked_mutton: { name: 'Pečené skopové', food: 32, heal: 8, stack: 16 },
  cooked_pork: { name: 'Pečené kančí', food: 34, heal: 8, stack: 16 },
  cooked_venison: { name: 'Pečená zvěřina', food: 36, heal: 10, stack: 16 },
  bone: { name: 'Kost', stack: 64 },
  cheese: { name: 'Sýr', food: 8, stack: 16 },
  bacon: { name: 'Slanina', food: 10, heal: 2, stack: 16 },
  dumplings: { name: 'Knedlíky', food: 12, stack: 16 },
  goulash: { name: 'Hovězí guláš', food: 60, heal: 25, stack: 16 },
  venison_goulash: { name: 'Zvěřinový guláš s houbami', food: 62, heal: 28, stack: 16 },
  pork_dumplings: { name: 'Kančí pečeně s knedlíkem', food: 70, heal: 30, stack: 16 },
  mutton_potatoes: { name: 'Skopové s bramborami', food: 55, heal: 20, stack: 16 },
  schnitzel: { name: 'Kuřecí řízek', food: 48, heal: 15, stack: 16 },
  bone_broth: { name: 'Kostní vývar', food: 30, heal: 35, stack: 16 },
  hamburger: { name: 'Hamburger', food: 65, heal: 20, stack: 16 },
  eggs_bacon: { name: 'Vejce se slaninou', food: 42, heal: 12, stack: 16 },
  pizza: { name: 'Pizza', food: 55, heal: 15, stack: 16 },
  strudel: { name: 'Jablečný štrúdl', food: 40, heal: 12, stack: 16 },
});
KITCHEN.push(
  { out: 'cheese', n: 2, in: { milk_bucket: 1, salt: 1 }, tools: ['bowl', 'knife'], time: 8, returns: { bucket: 1 }, steps: 'Mléko v míse osol a nech srazit. Sraženinu nakrájej nožem, sceď syrovátku a vylisuj z ní sýr.' },
  { out: 'bacon', n: 3, in: { raw_pork: 1, salt: 1 }, tools: ['knife', 'pan'], heat: true, time: 6, steps: 'Kančí maso nakrájej na tenké plátky, osol a na pánvi opeč dokřupava.' },
  { out: 'dumplings', n: 4, in: { dough: 1, water_bucket: 1, salt: 1 }, tools: ['pot', 'knife'], heat: true, time: 10, returns: { bucket: 1 }, steps: 'Z těsta vytvaruj šišky a vař je v osolené vodě asi 20 minut. Uvařené nakrájej na plátky.' },
  { out: 'pork_dumplings', n: 1, in: { raw_pork: 1, dumplings: 2, salt: 1 }, tools: ['knife'], heat: true, time: 14, steps: 'Kančí maso osol a upeč v troubě do křupava. Nakrájej na plátky a podávej s knedlíky.' },
  { out: 'goulash', n: 2, in: { raw_beef: 1, potato: 1, tomato: 2, salt: 1, water_bucket: 1 }, tools: ['knife', 'pot'], heat: true, time: 14, returns: { bucket: 1 }, steps: 'Hovězí nakrájej na kostky a opeč. Přidej rajčata a brambory, zalij vodou, osol a pomalu duste do měkka.' },
  { out: 'venison_goulash', n: 2, in: { raw_venison: 1, mushroom: 2, tomato: 1, salt: 1, water_bucket: 1 }, tools: ['knife', 'pot'], heat: true, time: 14, returns: { bucket: 1 }, steps: 'Zvěřinu a houby nakrájej, opeč v hrnci, přidej rajče, zalij vodou, osol a duste, až je maso měkké.' },
  { out: 'mutton_potatoes', n: 1, in: { raw_mutton: 1, potato: 2, salt: 1 }, tools: ['knife'], heat: true, time: 12, steps: 'Skopové maso a brambory nakrájej, osol a peč spolu v troubě, dokud nezezlátnou.' },
  { out: 'schnitzel', n: 1, in: { raw_chicken: 1, egg: 1, flour: 1, butter: 1 }, tools: ['knife', 'bowl', 'pan'], heat: true, time: 8, steps: 'Kuřecí maso naklepej, obal v mouce a rozšlehaném vejci a na pánvi s máslem smaž dozlatova.' },
  { out: 'bone_broth', n: 2, in: { bone: 2, potato: 1, water_bucket: 1, salt: 1 }, tools: ['pot', 'bowl'], heat: true, time: 16, returns: { bucket: 1 }, steps: 'Kosti dlouho vař v osolené vodě s bramborou. Vývar sceď do mísy – výborně léčí.' },
  { out: 'eggs_bacon', n: 1, in: { egg: 2, bacon: 2 }, tools: ['pan'], heat: true, time: 6, steps: 'Na pánvi rozpusť tuk ze slaniny, rozklepni na ni vejce a nech je ztuhnout.' },
  { out: 'hamburger', n: 1, in: { bread: 1, steak: 1, tomato: 1, cheese: 1 }, tools: ['knife'], time: 3, steps: 'Chléb rozkroj, na spodní půlku dej steak, plátek sýra a rajčete a přiklop.' },
  { out: 'pizza', n: 2, in: { dough: 1, tomato_sauce: 1, cheese: 1, mushroom: 1 }, tools: ['rolling_pin', 'knife'], heat: true, time: 12, steps: 'Těsto vyválej na placku, potři rajčatovou omáčkou, posyp sýrem a houbami a upeč v troubě.' },
  { out: 'strudel', n: 2, in: { dough: 1, apple: 3, butter: 1 }, tools: ['rolling_pin', 'knife'], heat: true, time: 12, steps: 'Těsto vyválej natenko, potři máslem, poklaď nakrájenými jablky, zaroluj a upeč dozlatova.' },
);

// Sushi (ryby z rybníků, rýže, řasa) a stolování (stůl, židle, příbor).
Object.assign(ITEMS, {
  fishing_rod: { name: 'Rybářský prut', utensil: true, stack: 1, dur: 64 },
  raw_salmon: { name: 'Syrový losos', food: 4, stack: 16 },
  raw_trout: { name: 'Syrový pstruh', food: 3, stack: 16 },
  seaweed: { name: 'Vodní řasa', stack: 64 },
  nori: { name: 'Nori (sušená řasa)', stack: 64 },
  rice: { name: 'Rýže', stack: 64, plant: 'rice_crop' },
  cooked_rice: { name: 'Sushi rýže', food: 8, stack: 16 },
  maki: { name: 'Maki sushi', food: 16, heal: 6, stack: 32 },
  nigiri: { name: 'Nigiri sushi', food: 14, heal: 6, stack: 32 },
  sushi_platter: { name: 'Sushi talíř', food: 75, heal: 35, stack: 8 },
  fried_trout: { name: 'Pečený pstruh', food: 38, heal: 12, stack: 16 },
  makisu: { name: 'Bambusová podložka', utensil: true, stack: 1 },
  cutlery: { name: 'Příbor (vidlička, nůž, lžíce)', stack: 16 },
  chopsticks: { name: 'Hůlky', stack: 16 },
  table: { name: 'Stůl', block: 'table', stack: 8 },
  chair: { name: 'Židle', block: 'chair', stack: 8 },
});
RECIPES.push(
  { out: 'fishing_rod', n: 1, shape: ['  S', ' SF', 'S F'], key: { S: 'stick', F: 'fiber' } },
  { out: 'makisu', n: 1, shape: ['SSS', 'FFF'], key: { S: 'stick', F: 'fiber' } },
  { out: 'cutlery', n: 2, shape: ['I I', 'S S'], key: { I: 'iron', S: 'stick' } },
  { out: 'chopsticks', n: 1, shape: ['S', 'S'], key: { S: 'stick' } },
  { out: 'table', n: 1, shape: ['PPP', 'P P'], key: { P: 'planks' } },
  { out: 'chair', n: 2, shape: ['P  ', 'PPP', 'P P'], key: { P: 'planks' } },
);
KITCHEN.push(
  { out: 'cooked_rice', n: 2, in: { rice: 2, water_bucket: 1, salt: 1 }, tools: ['pot', 'bowl'], heat: true, time: 8, returns: { bucket: 1 }, steps: 'Rýži propláchni, vař v hrnci se studenou vodou, pak nech dojít pod pokličkou a v míse ochuť solí – vznikne lepivá sushi rýže.' },
  { out: 'nori', n: 2, in: { seaweed: 2 }, tools: ['knife'], heat: true, time: 4, steps: 'Řasu nakrájej na pláty a krátce opraž nad plotnou, až je suchá a křupavá – to je nori.' },
  { out: 'maki', n: 6, in: { cooked_rice: 1, nori: 1, raw_salmon: 1 }, tools: ['makisu', 'knife'], time: 5, steps: 'Na bambusovou podložku polož nori, rozetři rýži, doprostřed proužek lososa. Pevně zaroluj a ostrým nožem nakrájej na 6 kousků.' },
  { out: 'nigiri', n: 2, in: { cooked_rice: 1, raw_salmon: 1 }, tools: ['knife'], time: 4, steps: 'Z rýže vytvaruj v dlaních malé válečky a na každý polož tenký plátek lososa.' },
  { out: 'sushi_platter', n: 1, in: { maki: 3, nigiri: 2 }, tools: [], time: 2, steps: 'Maki a nigiri pěkně naaranžuj na talíř.' },
  { out: 'fried_trout', n: 1, in: { raw_trout: 1, salt: 1, butter: 1 }, tools: ['knife', 'pan'], heat: true, time: 8, steps: 'Pstruha vykuchej, osol a na pánvi s máslem opeč z obou stran do zlatova.' },
);

// Stínové brnění z esence stínožroutů; hroty na farmy.
RECIPES.push(
  { out: 'shadow_helmet', n: 1, shape: ['MMM', 'M M'], key: { M: 'essence' } },
  { out: 'shadow_chestplate', n: 1, shape: ['M M', 'MMM', 'MMM'], key: { M: 'essence' } },
  { out: 'shadow_leggings', n: 1, shape: ['MMM', 'M M', 'M M'], key: { M: 'essence' } },
  { out: 'shadow_boots', n: 1, shape: ['M M', 'M M'], key: { M: 'essence' } },
  { out: 'spikes', n: 4, shape: ['I I', 'III'], key: { I: 'iron' } },
);
// (vzory receptů v mřížce – r.pat, r.w, r.h – se dopočítají jednou na konci, v shared/data/index.js)
// Táborák: pečení a tavení (vlož surovinu, chvíli počkej).
export const COOKING = { raw_meat: 'meat', iron_ore: 'iron', markorite_raw: 'markorite', raw_chicken: 'roast_chicken', potato: 'baked_potato', raw_beef: 'steak',
  raw_mutton: 'cooked_mutton', raw_pork: 'cooked_pork', raw_venison: 'cooked_venison', raw_trout: 'fried_trout' };
export const COOK_TIME = 4;
