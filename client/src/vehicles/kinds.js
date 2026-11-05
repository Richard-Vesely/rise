// Druhy vozidel: jméno, předmět, rozměry, místa k sezení (řidič + spolujezdci) a co jde vylepšit v garáži.
// Jen data a malé funkce (nic se nespouští při načtení). Místní souřadnice: x vpravo, y nahoru, z dozadu (dopředu je -z);
// počátek je bod vozidla (v.x, v.y, v.z): u auta a kola na zemi mezi koly, u lodi na hladině, u letadla na zemi pod trupem.
// seats[0] = řidič (pilot, kormidelník), další jsou pro spolujezdce. Bod místa = poloha hráče (nohy na sedadle), eye = výška očí nad ním.
// open: hráč je ve vozidle vidět (kolo, lodě, otevřený kokpit); v autě sedí uvnitř a vidět není.
export const KINDS = {
  car: {
    name: 'Auto', item: 'car', wid: 1.9, len: 4.2, h: 1.62, push: 1.9, fuelMax: 40, eye: 0.82, open: false, exit: 1.6,
    seats: [[-0.42, 0.6, 0.35], [0.42, 0.6, 0.35], [-0.42, 0.6, 1.3], [0.42, 0.6, 1.3]], mods: ['nitro', 'offroad', 'engine'], trunk: 'Kufr',
  },
  plane: {
    name: 'Dvouplošník', item: 'biplane', wid: 9.2, len: 7, h: 2.6, push: 1.1, fuelMax: 60, eye: 0.72, open: true, exit: 5.2,
    seats: [[0, 1.4, 0.6], [0, 1.3, -0.55]], mods: ['nitro', 'engine'], trunk: 'Zavazadlový prostor',
  },
  seaplane: {
    name: 'Hydroplán', item: 'seaplane', wid: 9.2, len: 7, h: 2.6, push: 1.1, fuelMax: 60, eye: 0.72, open: true, exit: 5.2,
    seats: [[0, 1.4, 0.6], [0, 1.3, -0.55]], mods: ['nitro', 'engine'], trunk: 'Zavazadlový prostor',
  },
  bike: {
    name: 'Jízdní kolo', item: 'bike', wid: 0.6, len: 1.8, h: 1.15, push: 0.6, fuelMax: 0, eye: 0.98, open: true, exit: 0.9,
    seats: [[0, 0.62, 0.2]], mods: ['offroad'], trunk: 'Košík', slots: 4,
  },
  motorboat: {
    name: 'Motorový člun', item: 'motorboat', wid: 2.0, len: 5.2, h: 1.2, push: 2.0, fuelMax: 30, eye: 0.95, open: true, exit: 2,
    seats: [[-0.42, 0.2, 0.9], [0.45, 0.2, 0.9], [-0.42, 0.2, -0.35], [0.45, 0.2, -0.35]], mods: ['nitro', 'engine'], trunk: 'Úložný prostor', slots: 9,
  },
  sailboat: {
    name: 'Plachetnice', item: 'sailboat', wid: 2.1, len: 5.6, h: 1.2, push: 2.1, fuelMax: 0, eye: 0.95, open: true, exit: 2,
    seats: [[0, 0.25, 2.0], [-0.55, 0.25, 0.7], [0.55, 0.25, 0.7]], mods: [], trunk: 'Úložný prostor', slots: 9,
  },
};
export const kindOf = (t) => KINDS[t] || KINDS.car;
export const isPlane = (t) => t === 'plane' || t === 'seaplane';
export const isBoat = (t) => t === 'motorboat' || t === 'sailboat';
/** Kolik políček kufru (bez místa na autobaterii) má vozidlo. */
export const trunkSize = (t) => kindOf(t).slots ?? 18;

// Barvy, na které jde vozidlo v garáži přelakovat
export const PAINTS = [0xc82a2a, 0xe07a20, 0xe8c030, 0x7ac83a, 0x2a8a3a, 0x2ab0a0, 0x38c8f0, 0x2a5ab0, 0x5a3ab0, 0xc83a9a, 0xe8e8e8, 0x8a8f96, 0x2a2a30, 0x8a2a22, 0x3a5a3a, 0xb8a060];
// Vylepšení z garáže (v.mods): nitro = počet náplní, offroad = terénní pneumatiky, engine = turbo (vyšší výkon)
export const MOD_INFO = {
  nitro: { name: 'Nitro', item: 'nitro', max: 5, text: 'N (dotyk: 🔥) = 3 s zrychlení. Jedna láhev = jedna náplň.' },
  offroad: { name: 'Terénní pneumatiky', item: 'offroad_tires', text: 'Míň zpomaluje do kopce, v mělké vodě a v písku, vyjede vyšší schod.' },
  engine: { name: 'Turbo', item: 'turbocharger', text: 'Vyšší nejvyšší rychlost a rychlejší zrychlení.' },
};
export const NITRO_TIME = 3;
/** Násobitel výkonu motoru: turbo +30 %, s nitrem navíc +80 %. */
export const powerMul = (v, nitroOn) => (v.mods?.engine ? 1.3 : 1) * (nitroOn ? 1.8 : 1);
