// Garáž: okno (pravé tlačítko na blok Garáž) pro vozidlo zaparkované do 8 m. Přelakování (zdarma), nitro (náplně z láhví),
// terénní pneumatiky a turbo (vloží se díl z batohu). Vylepšení se ukládají ve vozidle (v.mods), takže je vidí všichni hráči
// a vydrží uložení. Staré vozidlo bez v.mods funguje jako dřív. Jen funkce (nic se nespouští při načtení).
import { ITEMS } from '../../../shared/data/index.js';
import { vehicles } from '../../../shared/world/state.js';
import { Sound } from '../audio/sound.js';
import { countItem, removeItem } from '../player/inventory.js';
import { toast } from '../ui/hud.js';
import { MOD_INFO, PAINTS, kindOf } from './kinds.js';

const hex = (c) => '#' + c.toString(16).padStart(6, '0');
/** Vozidla do 8 m od garáže (nejbližší první). */
export function garageVehicles(key) {
  const [x, y, z] = key.split(',').map(Number);
  return [...vehicles.entries()].map(([id, v]) => ({ id, v, d: Math.hypot(v.x - x - 0.5, v.y - y, v.z - z - 0.5) })).filter((e) => e.d < 8).sort((a, b) => a.d - b.d);
}
let sel = null; // vybrané vozidlo v okně
export function renderGarageUI(area, key) {
  const list = garageVehicles(key);
  if (!list.length) {
    area.innerHTML = `<div class="mc-title">Garáž</div><div class="mc-note">Zaparkuj vozidlo (auto, kolo, loď, letadlo) do 8 m od garáže. Pak ho tu můžeš přelakovat a vylepšit: nitro, terénní pneumatiky a turbo.</div>`;
    return;
  }
  if (!list.some((e) => e.id === sel)) sel = list[0].id;
  const v = vehicles.get(sel), K = kindOf(v.type), mods = v.mods || {};
  const tabs = list.length > 1 ? `<div class="garage-tabs">${list.map((e) => `<button class="mc-btn${e.id === sel ? ' on' : ''}" data-gar="sel:${e.id}">${kindOf(e.v.type).name} (${e.d.toFixed(0)} m)</button>`).join('')}</div>` : '';
  const paint = PAINTS.map((c) => `<button class="garage-paint${c === v.color ? ' on' : ''}" style="background:${hex(c)}" data-gar="paint:${c}" title="Přelakovat"></button>`).join('');
  const row = (m) => {
    const I = MOD_INFO[m], have = countItem(I.item), name = ITEMS[I.item].name;
    const state = m === 'nitro' ? `${mods.nitro || 0} / ${I.max} náplní` : mods[m] ? '✔ namontováno' : 'není';
    const full = m === 'nitro' ? (mods.nitro || 0) >= I.max : !!mods[m];
    const btn = full ? '' : `<button class="mc-btn" data-gar="mod:${m}"${have ? '' : ' disabled'}>${m === 'nitro' ? 'Naplnit' : 'Namontovat'} (${name}: máš ${have})</button>`;
    return `<div class="garage-mod"><b>${I.name}</b> · ${state} ${btn}<div class="mc-note">${I.text}</div></div>`;
  };
  area.innerHTML = `<div class="mc-title">Garáž · ${K.name}</div>${tabs}
    <div class="k-label">Lak</div><div class="garage-paints">${paint}</div>
    ${K.mods.length ? `<div class="k-label">Vylepšení</div>${K.mods.map(row).join('')}` : `<div class="mc-note">${K.name} se dá jen přelakovat.</div>`}`;
}
/** Klik v okně garáže (data-gar="co:hodnota"). Vrátí true, když se má okno překreslit. */
export function garageClick(el) {
  const [what, val] = el.dataset.gar.split(':');
  if (what === 'sel') { sel = val; return true; }
  const v = vehicles.get(sel);
  if (!v) return true;
  if (what === 'paint') {
    if (v.color === Number(val)) return false;
    v.color = Number(val);
    Sound.burst({ dur: 0.6, f0: 3000, f1: 1500, q: 0.6, vol: 0.12 }); // sprej
    toast(`${kindOf(v.type).name} je přelakované`);
    return true;
  }
  if (what === 'mod') {
    const I = MOD_INFO[val];
    if (!I || !kindOf(v.type).mods.includes(val) || countItem(I.item) < 1) return false;
    const mods = { ...(v.mods || {}) };
    if (val === 'nitro') { if ((mods.nitro || 0) >= I.max) return false; mods.nitro = (mods.nitro || 0) + 1; }
    else { if (mods[val]) return false; mods[val] = 1; }
    removeItem(I.item, 1);
    v.mods = mods; // nový objekt: změna se pošle ostatním hráčům (malé mapy se porovnávají jako JSON)
    Sound.burst({ dur: 0.15, f0: 1800, f1: 600, q: 2, vol: 0.25 }); Sound.burst({ dur: 0.12, f0: 2600, f1: 900, q: 3, vol: 0.2, delay: 0.18 }); // cvak klíče
    toast(val === 'nitro' ? `Nitro: ${mods.nitro} náplní` : `${I.name}: namontováno`);
    return true;
  }
  return false;
}
