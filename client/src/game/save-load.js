// Načtení uložené hry z prohlížeče (nebo světa od hostitele).
import './prefs.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { NET } from '../../../shared/net/net.js';
import { loadWorld } from '../../../shared/world/save.js';
import { BOOT } from './boot.js';
import { OLD_SAVE_KEY, SAVE_KEY } from './prefs.js';

// ============================================================ uložená hra
export let save = null;
try { save = JSON.parse(localStorage.getItem(SAVE_KEY) ?? (OLD_SAVE_KEY && localStorage.getItem(OLD_SAVE_KEY))); } catch {}
// Server kroužku s profily hráčů: batoh, pozice a zdraví drží server (welcome.me, u profilu a světa), ne prohlížeč.
// Když server pro tenhle profil a svět ještě nic nemá a prohlížeč má staré uložení, použije se jednou to (a pošle se na server).
export const PROFILE = NET.client && !!BOOT.welcome && 'me' in BOOT.welcome;
export const MIGRATED = PROFILE && !BOOT.welcome.me && !!save;
if (NET.client) { // svět dodá hostitel, z vlastního uložení se vezme jen batoh, pozice a stav hráče
  const me = (PROFILE && BOOT.welcome.me) || save || {}, w = BOOT.welcome;
  save = { ...w.world, inv: me.inv, pos: me.pos || w.spawn, yaw: me.yaw, hp: me.hp, hunger: me.hunger, crafted: me.crafted, placedAny: me.placedAny, armor: me.armor, off: me.off, flyT: me.flyT, creative: !!me.creative && !!w.perm, flying: !!me.flying && !!w.perm };
}
loadWorld(save); // svět (bloky, truhly, stroje…) do shared/world/state.js
