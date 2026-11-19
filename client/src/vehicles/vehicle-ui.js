// Okno vozidla (palivo, baterie, kufr) a řádek s ukazateli při jízdě. Jen funkce (nic se nespouští při načtení).
import { clamp } from '../../../shared/util.js';
import { vehicles } from '../../../shared/world/state.js';
import { terrainH } from '../../../shared/world/terrain.js';
import { slotHTML, ui } from '../ui/inventory-ui.js';
import { POINTS_OF_SAIL, windRel } from './boat.js';
import { myDriverId, nitro } from './car.js';
import { isBoat, isPlane, kindOf } from './kinds.js';
import { PLANE } from './plane.js';

const DIRS = ['V', 'JV', 'J', 'JZ', 'Z', 'SZ', 'S', 'SV']; // světové strany: +x = východ, +z = jih
/** Odkud vítr fouká (světová strana). */
const windFrom = (w) => DIRS[Math.round(((Math.atan2(-w.z, -w.x) / (Math.PI * 2)) * 8 + 8)) % 8];
/** Řádek ukazatelů nad hotbarem (riding = jedu jako spolujezdec). */
export function vehicleHud(v, riding) {
  const K = kindOf(v.type), fuel = K.fuelMax ? ` · ⛽ ${v.fuel.toFixed(1)} / ${K.fuelMax} l` : '';
  const nb = v.mods?.nitro ? ` · 🔥 nitro ${v.mods.nitro}${nitro.t > 0 ? ' <b class="warn">BOOST</b>' : ''}` : nitro.t > 0 ? ' · <b class="warn">BOOST</b>' : '';
  const kmh = (s) => Math.round(Math.abs(s) * 3.6);
  let html;
  if (isPlane(v.type)) {
    const sp = Math.hypot(v.vx || 0, v.vy || 0, v.vz || 0), alt = Math.max(0, v.y - terrainH(v.x, v.z));
    const stall = !v.ground && sp < PLANE.stall + 2;
    html = `✈ ${kmh(sp)} km/h · ⇡ ${Math.round(alt)} m · plyn ${Math.round((v.thr || 0) * 100)} %${fuel}${nb}${v.ground ? (v.onWater ? ' · na vodě' : ' · na zemi') : ''}${stall ? ' <b class="warn">PÁD RYCHLOSTI</b>' : ''}`;
  } else if (v.type === 'bike') html = `🚲 ${kmh(v.spd)} km/h · převod ${v.gear || 2}/3${v.pd ? ' · šlapeš' : ''}`;
  else if (v.type === 'sailboat') {
    // šipka: kam vítr fouká vůči přídi (nahoru = dopředu)
    const r = windRel(v), c = Math.cos(v.yaw), s = Math.sin(v.yaw), lx = r.w.x * c - r.w.z * s, lz = r.w.x * s + r.w.z * c;
    const arrow = `<span class="wind-arrow" style="display:inline-block;transform:rotate(${Math.atan2(lx, -lz).toFixed(2)}rad)">⬆</span>`;
    html = `⛵ ${kmh(v.spd)} km/h · vítr ${arrow} od ${windFrom(r.w)} ${r.speed.toFixed(1)} m/s · ${POINTS_OF_SAIL(r.a)} · plachta ${Math.round((v.thr || 0) * 100)} %`;
  } else if (v.type === 'motorboat') html = `🚤 ${kmh(v.spd)} km/h${v.spd < -0.3 ? ' (zpátečka)' : ''}${fuel}${nb}${v.engine ? '' : ' · motor stojí'}`;
  else html = `🚗 ${kmh(v.spd)} km/h${v.spd < -0.3 ? ' (zpátečka)' : ''}${fuel} · 🔋 ${v.slots[0]?.id === 'car_battery' ? Math.round(v.bat) + ' %' : 'chybí'}${nb}${v.engine ? '' : ' · motor stojí'}`;
  return riding ? `🧍 spolujezdec · ${K.name} · F = vystoupit` : html;
}
// Okno vozidla: palivo, baterie, kufr
export function renderCarUI(area) {
  const v = vehicles.get(ui.fireKey);
  if (!v) { area.innerHTML = '<div class="mc-note">Vozidlo tu už není.</div>'; return; }
  const bar = (p, color) => `<div class="parrow" style="width:160px"><i style="width:${clamp(p, 0, 100)}%;background:${color}"></i></div>`;
  const K = kindOf(v.type), car = v.type === 'car';
  const mods = [v.mods?.engine && 'turbo', v.mods?.offroad && 'terénní pneumatiky', v.mods?.nitro && `nitro ×${v.mods.nitro}`].filter(Boolean);
  const note = isPlane(v.type) ? `Natankuješ kanystrem s palivem (pravé tl. s kanystrem). Startuje se plynem (mezerník), vzlétne se při rychlosti kolem 76 km/h.${v.type === 'seaplane' ? ' Hydroplán startuje a přistává jen na vodě.' : ''}`
    : v.type === 'bike' ? 'Kolo jezdí bez paliva – šlapeš ty (trochu vyhladovíš). Převody 1–3: jednička do kopce, trojka na rovinu.'
    : v.type === 'sailboat' ? 'Plachetnici pohání vítr (vlaječka na stěžni ukazuje, kam fouká). Proti větru pluj šikmo, nejrychleji to jede s větrem z boku.'
    : v.type === 'motorboat' ? 'Natankuješ kanystrem s palivem (pravé tl. s kanystrem na člun).'
    : 'Natankuješ kanystrem s palivem (pravé tl. s kanystrem na auto). Vybitou autobaterii nabiješ v nabíječce.';
  area.innerHTML = `<div class="mc-title">${K.name}</div>
    <div class="car-ui">
      <div>${K.fuelMax ? `<div class="k-label">Palivo ${v.fuel.toFixed(1)} / ${K.fuelMax} l</div>${bar((v.fuel / K.fuelMax) * 100, '#e0a03b')}` : ''}
        ${car ? `<div class="k-label">Autobaterie ${v.slots[0]?.id === 'car_battery' ? Math.round(v.bat) + ' %' : v.slots[0] ? 'vybitá' : 'chybí'}</div>
        <div style="display:flex;gap:8px;align-items:center">${slotHTML(v.slots[0], 0, '', 'car')}${bar(v.slots[0]?.id === 'car_battery' ? v.bat : 0, '#3aff5a')}</div>` : ''}
        ${mods.length ? `<div class="k-label">Vylepšení: ${mods.join(', ')}</div>` : ''}</div>
      <button class="mc-btn" data-car-enter>${v.driver && v.driver !== myDriverId() ? (K.seats.length > 1 ? 'Přisednout (F)' : 'Obsazeno') : 'Nastoupit (F)'}</button>
    </div>
    <div class="k-label">${K.trunk}</div><div class="grid">${v.slots.slice(1).map((s, i) => slotHTML(s, i + 1, '', 'car')).join('')}</div>
    <div class="mc-note">${note}${isBoat(v.type) || K.mods.length ? ' Lak a vylepšení: garáž (blok Garáž do 8 m).' : ''}</div>`;
}
