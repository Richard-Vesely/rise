// Obchod za zlato: /shop (nebo /obchod) otevře okno, /sell (nebo /prodat) prodá všechno zlato z batohu za zlaťáky.
// Ceny a předměty: shared/data/shop.js. Zlaťáky jsou předmět v batohu (ukládají se jako ostatní věci).
// Příkazy volá chat (client/src/net/mp-ui.js), ve hře pro jednoho i pro víc hráčů. Bez vedlejších účinků při načtení.
import { ITEMS, SELL, SHOP } from '../../../shared/data/index.js';
import { Sound } from '../audio/sound.js';
import { addItem, countItem, removeItem } from '../player/inventory.js';
import { lockPointer, unlockPointer } from '../player/player.js';
import { toast } from './hud.js';
import { iconImg, refreshUI } from './inventory-ui.js';

/** Prodá zlato z batohu. Vrací počet získaných zlaťáků. */
export function sellGold() {
  let coins = 0;
  const parts = [];
  for (const [id, price] of Object.entries(SELL)) {
    const n = countItem(id);
    if (!n) continue;
    removeItem(id, n);
    coins += n * price;
    parts.push(`${n}× ${ITEMS[id].name}`);
  }
  if (!coins) { toast('Nemáš žádné zlato na prodej (zlatý ingot, zlatá ruda, zlatý blok…)'); return 0; }
  addItem('coin', coins, true);
  refreshUI();
  Sound.pickup?.();
  toast(`Prodáno: ${parts.join(', ')} → +${coins} zlaťáků (máš ${countItem('coin')})`);
  return coins;
}

let win = null;
const onKey = (e) => { if (win && (e.code === 'Escape' || e.code === 'KeyE')) { e.stopImmediatePropagation(); e.preventDefault(); closeShop(); } };
export function closeShop(relock = true) { win?.remove(); win = null; removeEventListener('keydown', onKey, true); if (relock) lockPointer(); }
function render() {
  const have = countItem('coin');
  win.innerHTML = `<div class="mc-panel shop-panel"><div class="mc-title">🪙 Obchod · máš ${have} zlaťáků</div>
    <div class="shop-list">${SHOP.map(([id, price]) => `<button class="mc-btn shop-item${have < price ? ' poor' : ''}" data-buy="${id}">${iconImg(id)}<b>${ITEMS[id].name}</b><small>${price} 🪙</small></button>`).join('')}</div>
    <p class="mc-note">Zlaťáky získáš příkazem /sell v chatu (T): prodá všechno zlato z batohu (zlatý ingot = ${SELL.gold_ingot}, zlatý blok = ${SELL.gold_block}). Zavřít: Esc nebo E.</p></div>`;
}
/** Otevře okno obchodu. */
export function openShop() {
  if (win) return;
  unlockPointer();
  win = document.createElement('div');
  win.id = 'shopWin';
  document.body.append(win);
  render();
  addEventListener('keydown', onKey, true);
  win.addEventListener('click', (e) => {
    const b = e.target.closest('[data-buy]');
    if (!b) { if (e.target === win) closeShop(); return; }
    const id = b.dataset.buy, price = SHOP.find((x) => x[0] === id)[1];
    if (countItem('coin') < price) { toast(`Na ${ITEMS[id].name} potřebuješ ${price} zlaťáků (máš ${countItem('coin')}). /sell prodá zlato.`); return; }
    if (addItem(id, 1, true) > 0) { toast('Batoh je plný'); return; }
    removeItem('coin', price);
    refreshUI();
    Sound.pickup?.();
    toast(`Koupeno: ${ITEMS[id].name}`);
    render();
  });
}

/** Příkaz obchodu v chatu? Vrátí true, když ho vyřídil (pak se do chatu neposílá). */
export function shopCommand(text) {
  const cmd = text.trim().toLowerCase().split(/\s+/)[0];
  if (cmd === '/sell' || cmd === '/prodat') { sellGold(); return true; }
  if (cmd === '/shop' || cmd === '/obchod') { setTimeout(openShop, 0); return true; }
  return false;
}
