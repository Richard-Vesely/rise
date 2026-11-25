// Konečné číslo kompatibilní s existujícím flyT i kontrolou ukládání serveru.
// Tato vyhrazená hodnota se neodpočítává a lze ji bezpečně uložit jako JSON.
export const INFINITE_FLIGHT = 100000;
export const FLIGHT_POTION = 'flight_potion';
export const flightPotionCommand = text => typeof text==='string'&&text.trim().toLowerCase()==='potion';
export const flightTime = (remaining,dt) => remaining===INFINITE_FLIGHT?INFINITE_FLIGHT:Math.max(0,remaining-dt);
