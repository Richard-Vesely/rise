// Technologie: rudy, pec, dílna, součástky, motory, vozidla, letadla, počítače a elektrická zařízení.
import { BLOCKS } from './blocks.js';
import { COOKING, ITEMS, RECIPES } from './items.js';

// ============================================================ technologie: rudy, pec, dílna a výrobní postup součástek
// Každý předmět má "art" = tvar a barvy ikony (kreslí je 04d). Recept s adv: true jde vyrobit jen v dílně (pokročilý pracovní stůl).
// Kategorie receptů: build (stavební), decor (dekorace), electric (elektrické součástky), electronics (elektronika), machines (stroje),
// engines (motory), vehicles (vozidla), aircraft (letadla), computers (počítače), office (kancelář), tools, basic.
export const RECIPE_CATS = {
  all: 'Vše', basic: 'Základní', tools: 'Nástroje a zbroj', build: 'Stavební materiály', decor: 'Dekorace', electric: 'Elektrické součástky',
  electronics: 'Elektronika', machines: 'Stroje', engines: 'Motory', vehicles: 'Vozidla', aircraft: 'Letadla', computers: 'Počítače', office: 'Kancelář',
};
// Pec: co se v ní taví (navíc ke všemu, co umí táborák) a jak dlouho hoří palivo (sekundy)
export const FURNACE_ONLY = {
  copper_ore: 'copper_ingot', gold_ore: 'gold_ingot', quartz: 'silicon', iron: 'steel_ingot', resin: 'rubber', glass: 'lens',
  log: 'charcoal', cherry_log: 'charcoal', jungle_log: 'charcoal', acacia_log: 'charcoal', markwood: 'charcoal',
  cherries: 'ethanol', banana: 'ethanol', apple: 'ethanol',
};
export const smeltResult = (id) => FURNACE_ONLY[id] || COOKING[id] || null;
export const FUEL = { coal: 32, charcoal: 32, log: 12, cherry_log: 12, jungle_log: 12, acacia_log: 12, markwood: 12, log_block: 12, stick: 2, ethanol: 24, cactus: 3 };
for (const id of ['planks', 'mark_planks', 'cherry_planks', 'jungle_planks', 'acacia_planks']) FUEL[id] = 6;
export const SMELT_TIME = 3;

(() => {
  const item = (id, name, cat, art, extra = {}) => { ITEMS[id] = { name, stack: 64, art, cat, ...extra }; };
  const block = (id, name, cat, b, extra = {}) => { ITEMS[id] = { name, stack: 64, cat, ...extra, block: id }; BLOCKS[id] = { name, solid: true, drop: id, ...b }; };
  const R = (out, n, shape, key, opt = {}) => RECIPES.push({ out, n, shape, key, cat: ITEMS[out].cat, ...opt });
  const ADV = { adv: true };

  // ---------- suroviny a kovy (rudy se taví v peci)
  item('copper_ore', 'Měděná ruda', 'basic', ['ore', '#d8783a', '#4ea06a']);
  item('gold_ore', 'Zlatá ruda', 'basic', ['ore', '#f6c83a', '#a8801a']);
  item('quartz', 'Křemen', 'basic', ['crystal', '#f4f0ff']);
  item('resin', 'Pryskyřice', 'basic', ['blob', '#d89020']);
  item('copper_ingot', 'Měděný ingot', 'basic', ['ingot', '#d8783a']);
  item('gold_ingot', 'Zlatý ingot', 'basic', ['ingot', '#f6c83a']);
  item('steel_ingot', 'Ocelový ingot', 'basic', ['ingot', '#8a96a4']);
  item('silicon', 'Křemík', 'electronics', ['ingot', '#5a6478']);
  item('rubber', 'Kaučuk', 'basic', ['blob', '#2e2e30']);
  item('charcoal', 'Dřevěné uhlí', 'basic', ['lump', '#3a3230']);
  item('ethanol', 'Líh (biopalivo)', 'vehicles', ['bottle', '#cfe6ff']);
  item('lens', 'Čočka', 'electronics', ['lens', '#d8f0ff']);
  item('plastic', 'Plast', 'basic', ['sheet', '#e8e4dc']);
  R('plastic', 2, ['RCR'], { R: 'resin', C: 'coal' });
  item('wood_pulp', 'Dřevovina', 'office', ['pile', '#d8c49a']);
  R('wood_pulp', 2, ['SS', 'SS'], { S: 'stick' });
  item('paper', 'Papír', 'office', ['paper', '#f6f2e6']);
  R('paper', 3, ['PPP'], { P: 'wood_pulp' });
  R('torch', 8, ['C', 'S'], { C: 'charcoal', S: 'stick' });

  // ---------- kovové díly (stroje)
  item('iron_plate', 'Železný plech', 'machines', ['plate', '#b8bec8']);
  R('iron_plate', 1, ['II'], { I: 'iron' });
  item('steel_plate', 'Ocelový plech', 'machines', ['plate', '#8a96a4']);
  R('steel_plate', 1, ['SS'], { S: 'steel_ingot' });
  item('copper_plate', 'Měděný plech', 'machines', ['plate', '#d8783a']);
  R('copper_plate', 1, ['CC'], { C: 'copper_ingot' });
  item('iron_rod', 'Železná tyč', 'machines', ['rod', '#b8bec8']);
  R('iron_rod', 4, ['I', 'I'], { I: 'iron' });
  item('steel_rod', 'Ocelová tyč', 'machines', ['rod', '#8a96a4']);
  R('steel_rod', 4, ['S', 'S'], { S: 'steel_ingot' });
  item('screw', 'Šroub', 'machines', ['screw', '#c8ccd4']);
  R('screw', 6, ['R'], { R: 'iron_rod' });
  item('gear', 'Ozubené kolo', 'machines', ['gear', '#b8bec8']);
  R('gear', 2, [' P ', 'PRP', ' P '], { P: 'iron_plate', R: 'iron_rod' });
  item('bearing', 'Ložisko', 'machines', ['ring', '#c8ccd4']);
  R('bearing', 2, ['RSR'], { R: 'steel_rod', S: 'steel_ingot' });
  item('spring', 'Pružina', 'machines', ['spring', '#c8ccd4']);
  R('spring', 3, ['R', 'R', 'R'], { R: 'iron_rod' });
  item('drive_belt', 'Řemen', 'machines', ['ring', '#2e2e30']);
  R('drive_belt', 2, ['KKK'], { K: 'rubber' });
  item('pipe', 'Trubka', 'machines', ['pipe', '#a0a8b4']);
  R('pipe', 3, ['P', 'P', 'P'], { P: 'iron_plate' });
  item('heat_sink', 'Chladič', 'machines', ['grid', '#d8783a']);
  R('heat_sink', 1, ['CCC', 'C C'], { C: 'copper_plate' });

  // ---------- elektrické součástky (měď)
  item('copper_wire', 'Měděný drát', 'electric', ['wire', '#d8783a']);
  R('copper_wire', 8, ['CCC'], { C: 'copper_ingot' });
  item('gold_wire', 'Zlatý vodič', 'electric', ['wire', '#f6c83a']);
  R('gold_wire', 8, ['GGG'], { G: 'gold_ingot' });
  item('insulated_wire', 'Izolovaný kabel', 'electric', ['wire', '#2e2e30']);
  R('insulated_wire', 6, ['KKK', 'WWW', 'KKK'], { K: 'rubber', W: 'copper_wire' });
  item('copper_coil', 'Cívka', 'electric', ['coil', '#d8783a']);
  R('copper_coil', 1, ['WWW', 'WRW', 'WWW'], { W: 'copper_wire', R: 'iron_rod' });
  item('magnet', 'Magnet', 'electric', ['magnet', '#c82a2a']);
  R('magnet', 1, ['C', 'R'], { C: 'copper_coil', R: 'steel_rod' });
  item('electric_contact', 'Elektrický kontakt', 'electric', ['contact', '#d8783a']);
  R('electric_contact', 4, ['C', 'W'], { C: 'copper_plate', W: 'copper_wire' });
  item('gold_contact', 'Zlatý kontakt', 'electric', ['contact', '#f6c83a']);
  R('gold_contact', 4, ['G', 'W'], { G: 'gold_ingot', W: 'gold_wire' });
  item('switch_part', 'Spínač', 'electric', ['switch', '#e8e4dc']);
  R('switch_part', 2, ['P', 'E'], { P: 'plastic', E: 'electric_contact' });
  item('fuse', 'Pojistka', 'electric', ['fuse', '#e8f0ff']);
  R('fuse', 4, ['G', 'W', 'G'], { G: 'glass', W: 'copper_wire' });
  item('heating_coil', 'Topná spirála', 'electric', ['spring', '#d84a2a']);
  R('heating_coil', 1, ['W W', 'WWW'], { W: 'copper_wire' });
  item('light_bulb', 'Žárovka', 'electric', ['bulb', '#fff6c0']);
  R('light_bulb', 2, [' G ', 'GWG', ' E '], { G: 'glass', W: 'copper_wire', E: 'electric_contact' });
  item('battery_cell', 'Článek baterie', 'electric', ['battery', '#3a8a3a']);
  R('battery_cell', 2, ['P', 'S', 'C'], { P: 'plastic', S: 'salt', C: 'copper_plate' });

  // ---------- elektronika (zlato, křemík)
  item('silicon_wafer', 'Křemíková destička', 'electronics', ['wafer', '#5a6478']);
  R('silicon_wafer', 4, ['SS', 'SS'], { S: 'silicon' });
  item('led', 'LED dioda', 'electronics', ['led', '#ff4a4a']);
  R('led', 4, ['S', 'W'], { S: 'silicon', W: 'gold_wire' });
  item('transistor', 'Tranzistor', 'electronics', ['transistor', '#2e2e30']);
  R('transistor', 4, ['P', 'S', 'G'], { P: 'plastic', S: 'silicon_wafer', G: 'gold_wire' });
  item('resistor', 'Rezistor', 'electronics', ['resistor', '#d8c49a']);
  R('resistor', 4, ['WCW'], { W: 'copper_wire', C: 'coal' });
  item('capacitor', 'Kondenzátor', 'electronics', ['capacitor', '#3a5ab0']);
  R('capacitor', 4, ['P', 'C', 'P'], { P: 'plastic', C: 'copper_plate' });
  item('circuit_board', 'Deska plošných spojů', 'electronics', ['board', '#2a8a3a']);
  R('circuit_board', 2, ['WWW', 'PPP'], { W: 'copper_wire', P: 'plastic' });
  item('electronic_circuit', 'Elektronický obvod', 'electronics', ['chip', '#2a8a3a']);
  R('electronic_circuit', 1, ['TRT', 'CBC'], { T: 'transistor', R: 'resistor', C: 'capacitor', B: 'circuit_board' }, ADV);
  item('advanced_circuit', 'Pokročilý obvod', 'electronics', ['chip', '#3a5ab0']);
  R('advanced_circuit', 1, ['GEG', 'TWT', 'GEG'], { G: 'gold_contact', E: 'electronic_circuit', T: 'transistor', W: 'silicon_wafer' }, ADV);
  item('memory_chip', 'Paměťový čip', 'electronics', ['chip', '#1a1a1e']);
  R('memory_chip', 2, ['WWW', 'TBT'], { W: 'silicon_wafer', T: 'transistor', B: 'circuit_board' }, ADV);
  item('processor', 'Procesor', 'electronics', ['cpu', '#c8ccd4']);
  R('processor', 1, ['GWG', 'WAW', 'GWG'], { G: 'gold_contact', W: 'silicon_wafer', A: 'advanced_circuit' }, ADV);
  item('speaker', 'Reproduktor', 'electronics', ['speaker', '#2e2e30']);
  R('speaker', 1, ['PMP', 'PWP'], { P: 'plastic', M: 'magnet', W: 'copper_wire' });
  item('antenna', 'Anténa', 'electronics', ['antenna', '#c8ccd4']);
  R('antenna', 1, ['R', 'R', 'W'], { R: 'steel_rod', W: 'copper_wire' });

  // ---------- motory
  item('electric_motor', 'Elektromotor', 'engines', ['motor', '#5a6a7a']);
  R('electric_motor', 1, ['PCP', 'MRM', 'PCP'], { P: 'iron_plate', C: 'copper_coil', M: 'magnet', R: 'iron_rod' }, ADV);
  item('piston', 'Píst', 'engines', ['piston', '#a0a8b4']);
  R('piston', 2, ['P', 'R', 'B'], { P: 'steel_plate', R: 'steel_rod', B: 'bearing' }, ADV);
  item('cylinder_block', 'Blok válců', 'engines', ['engineblock', '#7a828e']);
  R('cylinder_block', 1, ['SSS', 'S S', 'SSS'], { S: 'steel_ingot' }, ADV);
  item('crankshaft', 'Klikový hřídel', 'engines', ['crank', '#8a96a4']);
  R('crankshaft', 1, ['RB ', ' BR'], { R: 'steel_rod', B: 'bearing' }, ADV);
  item('spark_plug', 'Zapalovací svíčka', 'engines', ['plug', '#e8e4dc']);
  R('spark_plug', 4, ['E', 'T', 'R'], { E: 'electric_contact', T: 'clay_tile', R: 'iron_rod' });
  item('radiator', 'Chladič motoru', 'engines', ['grid', '#c8ccd4']);
  R('radiator', 1, ['CPC', 'CPC'], { C: 'copper_plate', P: 'pipe' }, ADV);
  item('exhaust', 'Výfuk', 'engines', ['pipe', '#5a5a62']);
  R('exhaust', 1, ['P  ', 'PPP'], { P: 'pipe' });
  item('fuel_pump', 'Palivové čerpadlo', 'engines', ['box', '#3a5ab0']);
  R('fuel_pump', 1, ['PMP', 'P P'], { P: 'steel_plate', M: 'electric_motor' }, ADV);
  item('combustion_engine', 'Spalovací motor', 'engines', ['engine', '#5a5a62']);
  R('combustion_engine', 1, ['PSP', 'KBK', 'RXF'], { P: 'piston', S: 'spark_plug', K: 'crankshaft', B: 'cylinder_block', R: 'radiator', X: 'exhaust', F: 'fuel_pump' }, ADV);
  item('gearbox', 'Převodovka', 'engines', ['gearbox', '#7a828e']);
  R('gearbox', 1, ['GBG', 'GRG', 'PPP'], { G: 'gear', B: 'bearing', R: 'steel_rod', P: 'steel_plate' }, ADV);
  item('aircraft_engine', 'Letecký motor', 'aircraft', ['engine', '#8a6a3a']);
  R('aircraft_engine', 1, ['RER', 'PKP'], { R: 'radiator', E: 'combustion_engine', P: 'steel_plate', K: 'crankshaft' }, ADV);

  // ---------- díly vozidel
  item('tire', 'Pneumatika', 'vehicles', ['tire', '#1a1a1e']);
  R('tire', 1, ['KKK', 'K K', 'KKK'], { K: 'rubber' });
  item('rim', 'Ráfek', 'vehicles', ['rim', '#c8ccd4']);
  R('rim', 1, ['P P', ' R ', 'P P'], { P: 'steel_plate', R: 'steel_rod' });
  item('wheel', 'Kolo', 'vehicles', ['wheel', '#1a1a1e']);
  R('wheel', 1, ['TR'], { T: 'tire', R: 'rim' });
  item('steering_wheel', 'Volant', 'vehicles', ['steering', '#2e2e30']);
  R('steering_wheel', 1, ['KKK', 'K K', ' R '], { K: 'rubber', R: 'steel_rod' }, ADV);
  item('seat', 'Sedadlo', 'vehicles', ['seat', '#5a3a2a']);
  R('seat', 1, ['W  ', 'WWW', 'P P'], { W: 'wool', P: 'steel_plate' });
  item('chassis', 'Podvozek auta', 'vehicles', ['chassis', '#5a5a62']);
  R('chassis', 1, ['RTR', 'PSP', 'RRR'], { R: 'steel_rod', T: 'fuel_tank', P: 'steel_plate', S: 'spring' }, ADV); // podvozek nese palivovou nádrž
  item('car_body', 'Karoserie', 'vehicles', ['body', '#c82a2a']);
  R('car_body', 1, ['PGP', 'PSP'], { P: 'steel_plate', G: 'glass', S: 'seat' }, ADV); // karoserie s kabinou a sedadly
  item('fuel_tank', 'Palivová nádrž', 'vehicles', ['tank', '#5a5a62']);
  R('fuel_tank', 1, ['PPP', 'P P', 'PPP'], { P: 'iron_plate' }, ADV);
  item('headlight', 'Světlomet', 'vehicles', ['headlight', '#fff6c0']);
  R('headlight', 2, ['PBL'], { P: 'steel_plate', B: 'light_bulb', L: 'lens' });
  item('car_horn', 'Klakson', 'vehicles', ['horn', '#c8ccd4']);
  R('car_horn', 1, ['P', 'K'], { P: 'steel_plate', K: 'speaker' });
  item('axle', 'Náprava', 'vehicles', ['axle', '#5a5a62']);
  R('axle', 1, ['WRW'], { W: 'wheel', R: 'steel_rod' });
  item('car_battery', 'Autobaterie', 'vehicles', ['battery', '#2e2e30']);
  R('car_battery', 1, ['CCC', 'PEP'], { C: 'battery_cell', P: 'plastic', E: 'electric_contact' }, ADV);
  item('fuel_canister', 'Kanystr s palivem', 'vehicles', ['canister', '#c82a2a']);
  R('fuel_canister', 1, ['PEP', 'PEP'], { P: 'iron_plate', E: 'ethanol' });
  // Auto: karoserie (se sedadly), podvozek (s nádrží), motor, převodovka, volant, 2 nápravy (4 kola), světlomety a klakson
  item('car', 'Auto', 'vehicles', ['car', '#c82a2a'], { stack: 1, vehicle: 'car' });
  R('car', 1, ['HBK', 'SEG', 'ACA'], { H: 'headlight', B: 'car_body', K: 'car_horn', S: 'steering_wheel', E: 'combustion_engine', G: 'gearbox', A: 'axle', C: 'chassis' }, ADV);

  // ---------- díly letadel
  item('canvas', 'Plátno', 'aircraft', ['cloth', '#e8dcc0']);
  R('canvas', 2, ['WWW'], { W: 'wool' });
  item('wing', 'Křídlo', 'aircraft', ['wing', '#e8dcc0']);
  R('wing', 1, ['CCC', 'PPP'], { C: 'canvas', P: 'planks' }, ADV);
  item('tail_unit', 'Ocasní plochy', 'aircraft', ['tail', '#e8dcc0']);
  R('tail_unit', 1, ['C C', 'CRC', ' R '], { C: 'canvas', R: 'iron_rod' }, ADV);
  item('fuselage', 'Trup letadla', 'aircraft', ['fuselage', '#c8b080']);
  R('fuselage', 1, ['PTP', 'CRC', 'PPP'], { P: 'planks', T: 'fuel_tank', C: 'canvas', R: 'steel_rod' }, ADV); // v trupu je nádrž
  item('instrument_panel', 'Přístrojová deska', 'aircraft', ['panel', '#2e2e30']);
  R('instrument_panel', 1, ['LLL', 'EBE'], { L: 'led', E: 'electronic_circuit', B: 'circuit_board' }, ADV);
  item('control_stick', 'Řídicí páka', 'aircraft', ['stick2', '#2e2e30']);
  R('control_stick', 1, ['K', 'R'], { K: 'rubber', R: 'steel_rod' });
  item('cockpit', 'Kokpit', 'aircraft', ['cockpit', '#5a3a2a']);
  R('cockpit', 1, ['GGG', 'SIC'], { G: 'glass', S: 'seat', I: 'instrument_panel', C: 'control_stick' }, ADV);
  item('propeller', 'Vrtule', 'aircraft', ['propeller', '#8a5a2a']);
  R('propeller', 1, ['P P', ' R ', 'P P'], { P: 'planks', R: 'steel_rod' });
  item('landing_gear', 'Podvozek letadla', 'aircraft', ['landing', '#5a5a62']);
  R('landing_gear', 1, ['R R', 'W W'], { R: 'steel_rod', W: 'wheel' }, ADV);
  // Dvouplošník: 2 křídla, kokpit, vrtule, letecký motor, trup (s nádrží), 2 podvozky, ocasní plochy
  item('biplane', 'Dvouplošník', 'aircraft', ['plane', '#8a2a22'], { stack: 1, vehicle: 'plane' });
  R('biplane', 1, ['WCW', 'PEF', 'LTL'], { W: 'wing', C: 'cockpit', P: 'propeller', E: 'aircraft_engine', F: 'fuselage', L: 'landing_gear', T: 'tail_unit' }, ADV);

  // ---------- počítače (sestaví se ve fázi s počítačem)
  item('screen', 'Displej', 'computers', ['screen', '#2a3a5a']);
  R('screen', 1, ['GGG', 'LEL', 'PPP'], { G: 'glass', L: 'led', E: 'electronic_circuit', P: 'plastic' }, ADV);
  item('monitor', 'Monitor', 'computers', ['monitor', '#2e2e30']);
  R('monitor', 1, ['PSP', 'PEP', ' R '], { P: 'plastic', S: 'screen', E: 'electronic_circuit', R: 'steel_rod' }, ADV);
  item('keyboard', 'Klávesnice', 'computers', ['keyboard', '#e8e4dc']);
  R('keyboard', 1, ['SSS', 'PBP'], { S: 'switch_part', P: 'plastic', B: 'circuit_board' }, ADV);
  item('computer_mouse', 'Počítačová myš', 'computers', ['mouse', '#e8e4dc']);
  R('computer_mouse', 1, ['PSP', ' B '], { P: 'plastic', S: 'switch_part', B: 'circuit_board' }, ADV);
  item('motherboard', 'Základní deska', 'computers', ['board', '#1a5a2a']);
  R('motherboard', 1, ['MCM', 'EBE'], { M: 'memory_chip', C: 'capacitor', E: 'electronic_circuit', B: 'circuit_board' }, ADV);
  item('power_supply', 'Napájecí zdroj', 'computers', ['box', '#5a5a62']);
  R('power_supply', 1, ['PFP', 'KCK', 'PWP'], { P: 'steel_plate', F: 'fuse', K: 'copper_coil', C: 'capacitor', W: 'insulated_wire' }, ADV);
  item('hard_drive', 'Pevný disk', 'computers', ['box', '#8a96a4']);
  R('hard_drive', 1, ['PMP', 'PEP'], { P: 'steel_plate', M: 'magnet', E: 'electronic_circuit' }, ADV);
  item('cooling_fan', 'Ventilátor', 'computers', ['fan', '#5a5a62']);
  R('cooling_fan', 2, ['P P', ' M ', 'P P'], { P: 'plastic', M: 'electric_motor' }, ADV);
  item('computer_case', 'Počítačová skříň', 'computers', ['case', '#3a3a42']);
  R('computer_case', 1, ['SSS', 'S S', 'SSS'], { S: 'steel_plate' }, ADV);

  // ---------- kancelář
  item('ink', 'Inkoust', 'office', ['bottle', '#1a1a2a']);
  R('ink', 2, ['D', 'G'], { D: 'black_dye', G: 'glass' });
  item('ink_cartridge', 'Inkoustová kazeta', 'office', ['cartridge', '#2e2e30']);
  R('ink_cartridge', 1, ['PIP'], { P: 'plastic', I: 'ink' });
  item('printer_head', 'Tisková hlava', 'office', ['chip', '#3a3a42']);
  R('printer_head', 1, ['G', 'E', 'C'], { G: 'gold_contact', E: 'electronic_circuit', C: 'ink_cartridge' }, ADV);
  item('pencil', 'Tužka', 'office', ['pencil', '#f0c030']);
  R('pencil', 2, ['H', 'S', 'S'], { H: 'charcoal', S: 'stick' });
  item('book', 'Kniha', 'office', ['book', '#8a3a2a']);
  R('book', 1, ['PPP', 'PWP'], { P: 'paper', W: 'wool' });

  // ---------- dekorativní kovové a křemenné bloky
  const STONEPICK = { tool: 'pick', req: 2 };
  block('copper_block', 'Měděný blok', 'decor', { hard: 3, ...STONEPICK });
  R('copper_block', 1, ['CCC', 'CCC', 'CCC'], { C: 'copper_ingot' });
  R('copper_ingot', 9, ['B'], { B: 'copper_block' });
  block('cut_copper', 'Řezaná měď', 'decor', { hard: 3, ...STONEPICK });
  R('cut_copper', 4, ['BB', 'BB'], { B: 'copper_block' });
  block('gold_block', 'Zlatý blok', 'decor', { hard: 3, tool: 'pick', req: 3 });
  R('gold_block', 1, ['GGG', 'GGG', 'GGG'], { G: 'gold_ingot' });
  R('gold_ingot', 9, ['B'], { B: 'gold_block' });
  block('steel_block', 'Ocelový blok', 'decor', { hard: 4, tool: 'pick', req: 2 });
  R('steel_block', 1, ['SSS', 'SSS', 'SSS'], { S: 'steel_ingot' });
  R('steel_ingot', 9, ['B'], { B: 'steel_block' });
  block('quartz_block', 'Křemenný blok', 'decor', { hard: 2.5, ...STONEPICK });
  R('quartz_block', 1, ['QQ', 'QQ'], { Q: 'quartz' });
  block('quartz_pillar', 'Křemenný sloup', 'decor', { hard: 2.5, ...STONEPICK });
  R('quartz_pillar', 2, ['Q', 'Q'], { Q: 'quartz_block' });
  for (const [base, mat, st, sl] of [['cut_copper', 'cut_copper', 'Měděné schody', 'Měděný půlblok'], ['quartz_block', 'quartz_block', 'Křemenné schody', 'Křemenný půlblok']]) {
    const b = BLOCKS[base], common = { hard: b.hard, tool: b.tool, req: b.req, mat: base };
    block(`${base}_stairs`, st, 'build', { shape: 'stair', ...common });
    block(`${base}_slab`, sl, 'build', { shape: 'slab', full: base, ...common });
    R(`${base}_stairs`, 4, ['M  ', 'MM ', 'MMM'], { M: mat });
    R(`${base}_slab`, 6, ['MMM'], { M: mat });
  }
  block('copper_bars', 'Měděné mříže', 'decor', { shape: 'bars', mat: 'copper_block', hard: 2.5, ...STONEPICK });
  R('copper_bars', 16, ['CCC', 'CCC'], { C: 'copper_ingot' });

  // ---------- pec a dílna (stroje)
  block('furnace', 'Pec', 'machines', { hard: 3, tool: 'pick', req: 1, special: true, facing: true });
  R('furnace', 1, ['SSS', 'S S', 'SSS'], { S: 'stone' });
  block('adv_bench', 'Dílna (pokročilý pracovní stůl)', 'machines', { hard: 2.5, tool: 'axe', special: true, facing: true });
  R('adv_bench', 1, ['III', 'PBP', 'PPP'], { I: 'iron_plate', P: 'planks', B: 'workbench' });
})();

// ============================================================ elektrická zařízení: kabely, zdroje, baterie, vypínač, spotřebiče
// elec: cable (vodič, cap = max. výkon sítě ve W), gen (výkon generátoru), solar (špičkový výkon), store (kapacita baterie v J) + rate (W),
//       switch (vypínač), use (příkon spotřebiče ve W).
(() => {
  const block = (id, name, cat, b, extra = {}) => { ITEMS[id] = { name, stack: 64, cat, ...extra, block: id }; BLOCKS[id] = { name, solid: true, drop: id, ...b }; };
  const R = (out, n, shape, key, opt = {}) => RECIPES.push({ out, n, shape, key, cat: ITEMS[out].cat, ...opt });
  const ADV = { adv: true };
  const MACH = { hard: 2.5, tool: 'pick', req: 1, special: true };
  block('cable_copper', 'Měděný kabel', 'electric', { solid: false, hard: 0.3, cable: 'copper', elec: { cable: true, cap: 200 } });
  R('cable_copper', 4, ['W', 'W'], { W: 'insulated_wire' });
  block('cable_gold', 'Zlatý vodič', 'electric', { solid: false, hard: 0.3, cable: 'gold', elec: { cable: true, cap: 1000 } });
  R('cable_gold', 4, ['KGK'], { K: 'rubber', G: 'gold_wire' });
  block('coal_generator', 'Uhelný generátor', 'machines', { ...MACH, facing: true, elec: { gen: 60 } });
  R('coal_generator', 1, ['SSS', 'CMC', 'SFS'], { S: 'steel_plate', C: 'copper_coil', M: 'electric_motor', F: 'furnace' }, ADV);
  block('solar_panel', 'Solární panel', 'machines', { ...MACH, solid: false, facing: true, elec: { solar: 25 } });
  R('solar_panel', 1, ['GGG', 'WWW', 'PEP'], { G: 'glass', W: 'silicon_wafer', P: 'steel_plate', E: 'electronic_circuit' }, ADV);
  block('battery_block', 'Baterie', 'machines', { ...MACH, elec: { store: 20000, rate: 120 } });
  R('battery_block', 1, ['PCP', 'CEC', 'PCP'], { P: 'steel_plate', C: 'battery_cell', E: 'electric_contact' }, ADV);
  block('power_switch', 'Vypínač', 'electric', { ...MACH, solid: false, hard: 0.6, facing: true, elec: { switch: true } });
  R('power_switch', 1, ['S', 'I'], { S: 'switch_part', I: 'iron_plate' });
  block('electric_lamp', 'Elektrická lampa', 'decor', { ...MACH, solid: false, hard: 0.8, light: 14, elec: { use: 12 } });
  R('electric_lamp', 1, ['B', 'R', 'P'], { B: 'light_bulb', R: 'iron_rod', P: 'iron_plate' });
  block('bulb_lamp', 'Elektrická žárovka', 'decor', { ...MACH, solid: false, hard: 0.3, light: 9, elec: { use: 6 } });
  R('bulb_lamp', 1, ['W', 'B'], { W: 'copper_wire', B: 'light_bulb' });
  block('motor_block', 'Elektromotor (stroj)', 'machines', { ...MACH, facing: true, elec: { use: 40 } });
  R('motor_block', 1, ['P', 'M', 'P'], { P: 'steel_plate', M: 'electric_motor' });
  block('electric_furnace', 'Elektrická pec', 'machines', { ...MACH, facing: true, elec: { use: 80 } });
  R('electric_furnace', 1, ['PPP', 'HEH', 'PFP'], { P: 'steel_plate', H: 'heating_coil', E: 'electronic_circuit', F: 'furnace' }, ADV);
  block('charger', 'Nabíječka', 'machines', { ...MACH, facing: true, elec: { use: 30 } });
  R('charger', 1, ['PCP', 'EBE', 'PPP'], { P: 'plastic', C: 'copper_coil', E: 'electric_contact', B: 'circuit_board' }, ADV);
  // Počítač: monitor, klávesnice, myš, skříň, základní deska, procesor, zdroj, disk a ventilátor (OS a hry v 14d)
  block('computer', 'Počítač', 'computers', { ...MACH, facing: true, elec: { use: 60 } }, { art: ['pc', '#2e2e30', '#4a9ae8'] });
  R('computer', 1, ['FMH', 'PCB', 'SKO'], { F: 'cooling_fan', M: 'monitor', H: 'hard_drive', P: 'processor', C: 'computer_case', B: 'motherboard', S: 'power_supply', K: 'keyboard', O: 'computer_mouse' }, ADV);
  // Tiskárna: tiskne dokumenty z počítače ve stejné síti na papír (14e); rámeček na pověšení dokumentu na zeď
  block('printer', 'Tiskárna', 'office', { ...MACH, facing: true, elec: { use: 40 } }, { art: ['printer', '#e0dcd4', '#3a3a42'] });
  R('printer', 1, ['PHP', 'CMC', 'PPP'], { P: 'plastic', H: 'printer_head', C: 'circuit_board', M: 'electric_motor' }, ADV);
  ITEMS.picture_frame = { name: 'Rámeček', stack: 16, cat: 'office', art: ['frame', '#9a6a3a', '#3a3028'] };
  R('picture_frame', 2, ['SPS', 'S S', 'SPS'], { S: 'stick', P: 'planks' });
  // Autobaterie se vyrobí vybitá, nabije ji nabíječka (použije ji auto)
  ITEMS.car_battery.name = 'Autobaterie (nabitá)';
  ITEMS.car_battery_empty = { name: 'Autobaterie (vybitá)', stack: 16, cat: 'vehicles', art: ['battery', '#5a5a62'] };
  for (const r of RECIPES) if (r.out === 'car_battery') r.out = 'car_battery_empty';
})();

// ---------- futuristické stavební bloky: technické panely a neony. Neon svítí barvou, která má ve hře pevný význam:
// tyrkysová = elektřina, jantarová = teplo a oheň, fialová = Markova dimenze (light = svítí jako lampa a odhání stínožrouty).
(() => {
  const block = (id, name, cat, b) => { ITEMS[id] = { name, stack: 64, cat, block: id }; BLOCKS[id] = { name, solid: true, drop: id, ...b }; };
  const R = (out, n, shape, key) => RECIPES.push({ out, n, shape, key, cat: ITEMS[out].cat });
  block('tech_panel', 'Technický panel', 'build', { hard: 3, tool: 'pick', req: 2 });
  R('tech_panel', 4, ['PP', 'PP'], { P: 'steel_plate' });
  block('white_panel', 'Bílý panel', 'build', { hard: 2, tool: 'pick', req: 1 });
  R('white_panel', 4, ['QP', 'PQ'], { Q: 'quartz', P: 'plastic' });
  block('neon_cyan', 'Tyrkysový neon', 'decor', { hard: 0.8, light: 10, lightColor: 0x38e8ff });
  R('neon_cyan', 4, [' G ', 'GSG', ' G '], { G: 'glass', S: 'shard' });
  block('neon_amber', 'Jantarový neon', 'decor', { hard: 0.8, light: 10, lightColor: 0xffb066 });
  R('neon_amber', 4, [' G ', 'GTG', ' G '], { G: 'glass', T: 'torch' });
  block('neon_magenta', 'Fialový neon', 'decor', { hard: 0.8, light: 10, lightColor: 0xd04bff });
  R('neon_magenta', 4, [' G ', 'GMG', ' G '], { G: 'glass', M: 'markorite_raw' });
})();

// Trezor (truhla na kód): snadno vyrobitelný už v batohu – truhla a tři kameny.
RECIPES.push({ out: 'safe', n: 1, shape: ['SS', 'SC'], key: { S: 'stone', C: 'chest' } });
