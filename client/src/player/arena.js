// Aréna na straně hráče (svět se souboji, NET.pvp): po vstupu a po každé smrti nová výbava a místo v aréně,
// hlášení o vyřazení a tabulka bodů (body počítá hostitel: arenaDeath v shared/net/room.js). Bez vedlejších účinků při načtení.
import { NET } from '../../../shared/net/net.js';
import { ARENA, arenaSpawn } from '../../../shared/world/arena.js';
import { $ } from '../ui/dom.js';
import { toast } from '../ui/hud.js';
import { armor, refreshUI } from '../ui/inventory-ui.js';
import { inv } from './inventory.js';
import { player } from './player.js';

// Výbava do arény: železný meč, luk, šípy, prkna na stavění krytů, jídlo a celé železné brnění.
export const KIT = [['iron_sword', 1], ['bow', 1], ['arrow', 32], ['planks', 32], ['meat', 8]];
export const KIT_ARMOR = ['iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots'];

/** Vymění batoh a brnění za výbavu arény a postaví hráče na volné místo v ní. */
export function arenaReset() {
  inv.slots.fill(null);
  inv.cursor = null;
  KIT.forEach(([id, n], i) => { inv.slots[i] = { id, n }; });
  inv.sel = 0;
  KIT_ARMOR.forEach((id, i) => { armor[i] = { id, n: 1 }; });
  const [x, y, z] = arenaSpawn();
  player.pos.set(x, y, z);
  player.vel.set(0, 0, 0);
  player.yaw = Math.atan2(x - ARENA.x, z - ARENA.z); // čelem do středu arény
  player.hp = 100;
  player.hunger = 100;
  refreshUI();
}

/** Vstup do světa s arénou. */
export function startArena() {
  arenaReset();
  toast('Aréna! Levé tl. = meč, pravé tl. = luk. Vyřaď soupeře a sbírej body.');
  renderScore();
}

// ---------- tabulka a hlášení
let board = null, last = [];
/** Tabulka bodů vlevo nahoře: [[jméno, body, pády]…] seřazené od hostitele (bez argumentu = poslední známá). */
export function renderScore(list = last) {
  if (!NET.pvp) return;
  last = list;
  if (!board) { board = document.createElement('div'); board.id = 'arenaScore'; document.body.append(board); }
  const row = ([name, k, d], i) => `<tr class="${name === NET.name ? 'me' : ''}"><td>${i + 1}.</td><td>${esc(name)}</td><td>${k}</td><td>${d}</td></tr>`;
  board.innerHTML = `<div class="t">⚔ Aréna</div>${list.length ? `<table><tr><th></th><th>hráč</th><th>body</th><th>pády</th></tr>${list.slice(0, 8).map(row).join('')}</table>` : '<small>Zatím nikdo nemá body.</small>'}`;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Někdo vypadl ze hry. Vrací řádek do kanálu zpráv.
 * @param {string|null} killer kdo ho vyřadil (null = spadl, tvor…)
 * @param {string} victim
 */
export function arenaKill(killer, victim) {
  if (killer === NET.name) toast(`+1 bod · vyřadil(a) jsi hráče ${victim}`);
  else if (victim === NET.name && killer) toast(`Vyřadil(a) tě ${killer}`);
  const feed = $('feed');
  if (!feed) return;
  const el = document.createElement('div');
  el.className = 'chat sys';
  el.textContent = killer ? `⚔ ${killer} vyřadil(a) hráče ${victim}` : `⚔ ${victim} vypadl(a) ze hry`;
  feed.prepend(el);
  setTimeout(() => el.remove(), 9000);
}
