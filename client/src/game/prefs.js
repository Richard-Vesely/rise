// Nastavení zařízení (grafika, ovládání) a klíč uložené hry.
import './boot.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { NET } from '../../../shared/net/net.js';
import { BOOT } from './boot.js';
import { autoQuality, gpuClass } from './gpu.js';

// ============================================================ nastavení zařízení: grafika a ovládání
// Ukládá je menu (Nastavení) do localStorage; kvalita a typ ovládání se použijí při spuštění hry.
const PREFS = (() => { try { return JSON.parse(localStorage.getItem('rise-nastaveni')) || {}; } catch { return {}; } })();
export const TOUCH = PREFS.controls === 'touch' || (PREFS.controls !== 'mouse' && matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0);
// Bez volby hráče (Automaticky) podle grafické karty: samostatná → vysoká, integrovaná (Intel, AMD v procesoru, Apple) → střední,
// softwarová (SwiftShader, CI) a dotykové zařízení → nízká (client/src/game/gpu.js).
export const QUALITY = ['low', 'medium', 'high'].includes(PREFS.quality) ? PREFS.quality : autoQuality(TOUCH);
export const GPU = gpuClass();
// Na integrované grafice (notebooky z kroužku) se kreslí nejvýš v hustotě 1 pixel na bod obrazovky: displej s měřítkem
// 125–150 % by jinak znamenal 1,5–2,25× víc pixelů. Ostrost dorovná vyhlazování, plynulost je důležitější.
const PR_CAP = GPU === 'discrete' ? Infinity : 1;
export const GFX = {
  // pr = max. hustota pixelů, grass = počet stébel ve dvou vrstvách, gs = velikost trávníku kolem hráče, trees/rocks = dohled lesa a balvanů
  low: { pr: 1, aa: false, grass: [28000, 15000], gs: 0.72, trees: 95, rocks: 80, lights: 3, particles: 0.45, fog: 0.0085 },
  medium: { pr: 1.25, aa: true, grass: [80000, 50000], gs: 0.9, trees: 150, rocks: 120, lights: 4, particles: 0.7, fog: 0.0068 },
  high: { pr: 1.5, aa: true, grass: [150000, 100000], gs: 1, trees: 190, rocks: 150, lights: 6, particles: 1, fog: 0.0058 },
}[QUALITY];
GFX.pr = Math.min(GFX.pr, PR_CAP);
export const prefNum = (k, d) => (Number.isFinite(+PREFS[k]) && +PREFS[k] > 0 ? +PREFS[k] : d);
export let lookSens = prefNum('sens', 1); // citlivost otáčení (myš i dotyk)
// Hra pro jednoho má svoje uložení; svět serveru i hráč na cizím serveru se ukládají zvlášť.
// Server s víc světy: batoh a pozice zvlášť pro každý svět (rise-klient-<adresa>#<id světa>).
const WORLD = BOOT.welcome?.worldInfo;
export const SAVE_KEY = NET.host ? 'rise-server-v1' : NET.client ? `rise-klient-${BOOT.code}${WORLD ? '#' + WORLD.id : ''}` : 'rise-svet-v2';
// Uložení z doby, kdy měl server jen jeden svět: platí pro první svět, dokud se neuloží pod novým klíčem.
export const OLD_SAVE_KEY = NET.client && WORLD?.first ? `rise-klient-${BOOT.code}` : null;
export const GRASS_LAYERS = [
  { area: 32 * GFX.gs, count: GFX.grass[0], seg: 4, width: [0.007, 0.016], height: [0.25, 0.6], fadeIn: [0, 0], fadeOut: [7 * GFX.gs, 15.5 * GFX.gs], flowers: 0.045 },
  { area: 96 * GFX.gs, count: GFX.grass[1], seg: 2, width: [0.022, 0.04], height: [0.25, 0.6], fadeIn: [5 * GFX.gs, 14 * GFX.gs], fadeOut: [26 * GFX.gs, 46 * GFX.gs], flowers: 0.03 },
];
addEventListener('rise-prefs', () => { try { Object.assign(PREFS, JSON.parse(localStorage.getItem('rise-nastaveni')) || {}); } catch {} lookSens = prefNum('sens', 1); });
