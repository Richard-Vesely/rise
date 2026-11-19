// Počasí: déšť, bouřka a ranní mlha. Neposílá se ani neukládá – určuje ho číslo dne a čas dne (shared/sim/day.js),
// které všichni hráči sdílejí, takže všichni vidí stejné počasí (hra pro jednoho, hostitel v prohlížeči i server).
import { hash2, smoothstep } from '../util.js';

export const WEATHER_SLOTS = 4;   // den se dělí na 4 úseky po 6 hodinách, každý má svoje počasí
export const RAIN_CHANCE = 0.22;  // šance na déšť v úseku
export const STORM_CHANCE = 0.3;  // z deštivých úseků je tolik bouřek
export const FOG_CHANCE = 0.35;   // šance na mlhu při svítání

// Počasí jednoho úseku (bez přechodů): rain 0–1, storm 0/1.
function slot(day, s) {
  if (day <= 1) return { rain: 0, storm: 0 }; // první den nového světa je vždycky hezky
  const h = hash2(day * 7 + s, 9173);
  if (h >= RAIN_CHANCE) return { rain: 0, storm: 0 };
  const storm = h < RAIN_CHANCE * STORM_CHANCE ? 1 : 0;
  return { rain: storm ? 1 : 0.55 + 0.45 * hash2(day, s * 31 + 5), storm };
}

/**
 * Počasí v daný den a čas: { rain, storm, fog } (všechno 0–1). Na hranici úseků se plynule prolne.
 * @param {number} day číslo dne (dayCount)
 * @param {number} t čas dne 0–1 (0 = půlnoc, 0,25 = východ slunce)
 */
export function weatherAt(day, t) {
  const x = ((t % 1) + 1) % 1 * WEATHER_SLOTS, s = Math.floor(x), f = x - s;
  const cur = slot(day, s);
  // posledních 20 % úseku se prolíná do dalšího (přes půlnoc do dalšího dne)
  const nx = s + 1 < WEATHER_SLOTS ? slot(day, s + 1) : slot(day + 1, 0);
  const k = smoothstep(0.8, 1, f);
  const rain = cur.rain + (nx.rain - cur.rain) * k;
  const storm = cur.storm + (nx.storm - cur.storm) * k;
  // mlha: některá rána se údolí zahalí do mlhy (kolem 6 h, mezi 4:30 a 8:30), za deště ne
  const dawn = smoothstep(0.19, 0.25, t) * (1 - smoothstep(0.29, 0.355, t));
  const fog = day > 1 && hash2(day, 4441) < FOG_CHANCE ? dawn * (1 - rain) : 0;
  return { rain, storm, fog };
}

/**
 * Vítr pro plachetnice (a směr, kam se ohýbá tráva a letí kouř): stejný pro všechny hráče, protože ho určuje jen den a čas.
 * Každý úsek dne má svůj směr a sílu, mezi úseky se plynule stočí; v dešti a v bouřce fouká víc, poryvy jsou z času dne.
 * @returns {{ x: number, z: number, angle: number, speed: number }} směr, KAM vítr fouká (jednotkový vektor v rovině x–z), rychlost v m/s
 */
export function windAt(day, t) {
  const x = ((t % 1) + 1) % 1 * WEATHER_SLOTS, s = Math.floor(x), f = x - s;
  const dir = (d, k) => hash2(d * 13 + k, 5113) * Math.PI * 2, spd = (d, k) => 3.5 + 5 * hash2(d * 17 + k, 2287);
  const nd = s + 1 < WEATHER_SLOTS ? day : day + 1, ns = (s + 1) % WEATHER_SLOTS;
  const k = smoothstep(0.55, 1, f);
  const a0 = dir(day, s), a1 = dir(nd, ns);
  const da = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)); // kratší cestou kolem dokola
  const angle = a0 + da * k + Math.sin(t * Math.PI * 2 * 9 + day) * 0.12; // pomalé kolísání směru
  const w = weatherAt(day, t);
  const gust = 1 + 0.18 * Math.sin(t * Math.PI * 2 * 140) * Math.sin(t * Math.PI * 2 * 37 + 1.3);
  const speed = (spd(day, s) + (spd(nd, ns) - spd(day, s)) * k + w.rain * 2.5 + w.storm * 5) * gust;
  return { x: Math.cos(angle), z: Math.sin(angle), angle, speed };
}
