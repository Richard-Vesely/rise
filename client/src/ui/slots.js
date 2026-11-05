// Políčka s předměty jako HTML a hotbar s animacemi (vyskočení ikony, posuvný rámeček, jméno předmětu).
// Modul nic nespouští při načtení (jen funkce), takže nepotřebuje řádek v pořadí spouštění.
import { ITEMS } from '../../../shared/data/index.js';
import { rarityOf } from '../../../shared/inventory.js';
import { ICONS } from '../render/icons.js';
import { $ } from './dom.js';
import { styledIconUrl } from './icon-style.js';
import { durColor, durOf } from './item-tooltip.js';

export const iconImg = (id) => `<img src="${styledIconUrl(id)}"${ICONS[id].smooth ? ' class="sm"' : ''} alt="">`; // 3D ikony bloků jsou hladké (render/icon-render.js)
/** Vnitřek políčka: ikona, počet a proužek odolnosti. */
export function slotInner(s) {
  if (!s) return '';
  const du = durOf(s);
  const bar = du ? `<i class="dur" style="--f:${du.left / du.max};--c:${durColor(du.left / du.max)}"></i>` : '';
  return `${iconImg(s.id)}${s.n > 1 ? `<b>${s.n}</b>` : ''}${bar}`;
}
export function slotHTML(s, i, cls = '', c = 'inv') {
  if (!s) return `<div class="slot ${cls}" data-c="${c}" data-i="${i}"></div>`;
  const r = rarityOf(s.id);
  return `<div class="slot ${cls}${r ? ' rar' + r : ''}" data-c="${c}" data-i="${i}" data-item="${s.id}">${slotInner(s)}</div>`;
}

// ------------------------------------------------------------ hotbar
let built = false, prevSel = -1, prevSelId = null, nameEl = null, nameTimer = 0;
const prev = [];
/** Krátké „vyskočení" ikony (políčko dostalo předměty). */
export function popSlot(el) {
  el.classList.remove('pop');
  void el.offsetWidth; // restart animace
  el.classList.add('pop');
}
function showName(s) {
  if (!nameEl) { nameEl = document.createElement('div'); nameEl.id = 'hotName'; document.body.append(nameEl); }
  clearTimeout(nameTimer);
  if (!s) { nameEl.classList.remove('show'); return; }
  nameEl.className = `rar${rarityOf(s.id)}`;
  nameEl.textContent = ITEMS[s.id].name;
  void nameEl.offsetWidth;
  nameEl.classList.add('show');
  nameTimer = setTimeout(() => nameEl.classList.remove('show'), 2000);
}
/** Překreslí hotbar jen tam, kde se něco změnilo (ať animace běží plynule). */
export function paintHotbar(slots, sel) {
  const bar = $('hotbar');
  if (!built || bar.children.length !== 10) {
    bar.innerHTML = Array.from({ length: 9 }, (_, i) => `<div class="slot" data-h="${i}"><u>${i + 1}</u></div>`).join('') + '<div class="hot-ring"></div>';
    built = true;
    prev.length = 0;
  }
  for (let i = 0; i < 9; i++) {
    const el = bar.children[i], s = slots[i];
    const key = s ? `${s.id}:${s.n}:${s.w ?? ''}` : '';
    if (prev[i] !== key) {
      const old = prev[i] ? prev[i].split(':') : null;
      el.innerHTML = slotInner(s) + `<u>${i + 1}</u>`;
      if (s) el.dataset.item = s.id; else delete el.dataset.item;
      el.className = `slot${s && rarityOf(s.id) ? ' rar' + rarityOf(s.id) : ''}`;
      if (prev[i] !== undefined && s && (!old || old[0] !== s.id || s.n > +old[1])) popSlot(el);
      prev[i] = key;
    }
    el.classList.toggle('active', i === sel);
    const du = durOf(s);
    el.classList.toggle('worn', !!du && du.left / du.max <= 0.1);
  }
  bar.style.setProperty('--sel', sel);
  const id = slots[sel]?.id || null;
  if (sel !== prevSel || id !== prevSelId) {
    if (prevSel >= 0) showName(slots[sel]);
    prevSel = sel;
    prevSelId = id;
  }
}
