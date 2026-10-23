// Chat, menu Esc se seznamem hráčů, informační okénko.
import './avatars.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { NET } from '../../../shared/net/net.js';
import { broadcast, kick, others, setPerm } from '../../../shared/net/room.js';
import { BOOT } from '../game/boot.js';
import { saveGame } from '../game/save.js';
import { lockPointer, unlockPointer } from '../player/player.js';
import { $ } from '../ui/dom.js';
import { esc, toHost } from './multiplayer.js';

// ---------- chat, oznámení, Esc menu, informační okénko
export function chatLine(name, text) {
  const el = document.createElement('div');
  el.className = 'chat';
  el.innerHTML = `<span><b>${esc(name)}:</b> ${esc(text)}</span>`;
  $('feed').prepend(el);
  setTimeout(() => el.remove(), 9000);
}
export function sysLine(text) {
  const el = document.createElement('div');
  el.className = 'chat sys';
  el.textContent = text;
  $('feed').prepend(el);
  setTimeout(() => el.remove(), 9000);
}
const chatEl = document.createElement('input');
chatEl.id = 'chatInput';
chatEl.maxLength = 200;
chatEl.placeholder = 'Zpráva pro ostatní · Enter = odeslat · Esc = zrušit';
document.body.append(chatEl);
export let chatOpen = false;
export function openChat() {
  chatOpen = true;
  chatEl.style.display = 'block';
  unlockPointer();
  setTimeout(() => chatEl.focus(), 0);
}
function closeChat(relock = true) {
  chatOpen = false;
  chatEl.value = '';
  chatEl.style.display = 'none';
  chatEl.blur();
  if (relock) lockPointer();
}
function sendChat(text) {
  text = text.trim().slice(0, 200);
  if (!text) return;
  chatLine(NET.name, text);
  if (NET.host) broadcast(['chat', NET.name, text]); else toHost(['chat', text]);
}
chatEl.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') { sendChat(chatEl.value); closeChat(); }
  else if (e.key === 'Escape') closeChat();
});

const pauseEl = document.createElement('div');
pauseEl.id = 'pause';
document.body.append(pauseEl);
export let pauseOpen = false;
export function showPause() { pauseOpen = true; pauseEl.style.display = 'grid'; renderPause(); }
export function hidePause() { pauseOpen = false; pauseEl.style.display = 'none'; }
export function renderPause() {
  if (!pauseOpen) return;
  const count = others.size + 1;
  const row = (P) => {
    const tags = P.pid === 'host' ? ' <small>(hostitel)</small>' : '';
    const ctl = NET.host && P.conn ? `<button class="mc-btn ${P.perm ? 'on' : ''}" data-perm="${esc(P.pid)}">Kreativní: ${P.perm ? 'ano' : 'ne'}</button><button class="mc-btn" data-kick="${esc(P.pid)}">Vyhodit</button>` : '';
    return `<div class="prow"><span class="pname">${esc(P.name)}${tags}</span>${ctl}</div>`;
  };
  pauseEl.innerHTML = `<div class="mc-panel pause-panel">
    <div class="mc-title">Hra pro více hráčů</div>
    <div class="pause-code">${NET.host ? 'Kód serveru:' : 'Server:'} <b>${esc(NET.code)}</b>${NET.worldName ? ` · svět <b>${esc(NET.worldName)}</b>` : ''}${NET.host ? '<button class="mc-btn" data-copy>Zkopírovat</button>' : ''}</div>
    ${NET.host ? `<label class="mc-toggle"><input type="checkbox" id="pAllow" ${NET.allowAll ? 'checked' : ''}> Povolit hráčům kreativní režim (všem)</label>` : `<div class="mc-note">Kreativní režim: ${NET.perm ? 'povolen (klávesa C)' : 'zakázal hostitel'}</div>`}
    ${NET.pvp ? '<div class="mc-note">⚔ Aréna: tady se bojuje vždy.</div>' : `<label class="mc-toggle"><input type="checkbox" id="pPvp" ${NET.pvpOn ? 'checked' : ''}> ⚔ Souboje s ostatními (bojuješ jen s hráči, kteří je mají taky zapnuté)</label>`}
    <div class="mc-title">Hráči (${count}/${NET.maxPlayers})</div>
    <div class="plist"><div class="prow"><span class="pname">${esc(NET.name)} <small>(ty${NET.host ? ', hostitel' : ''})</small></span></div>${[...others.values()].map(row).join('')}</div>
    <div class="menu-row"><button class="mc-btn" data-resume>Pokračovat</button><button class="mc-btn" data-leave>Odejít</button></div>
  </div>`;
}
pauseEl.addEventListener('click', (e) => {
  const b = e.target.closest('button, input');
  if (!b) return;
  if (b.dataset.resume !== undefined) { hidePause(); lockPointer(); }
  else if (b.dataset.leave !== undefined) leaveGame();
  else if (b.dataset.copy !== undefined) copyCode(b);
  else if (b.dataset.perm) { const P = others.get(b.dataset.perm); if (P) setPerm(P, !P.perm); }
  else if (b.dataset.kick) kick(b.dataset.kick);
  else if (b.id === 'pPvp') { NET.pvpOn = b.checked; try { localStorage.setItem('rise-souboje', b.checked ? '1' : '0'); } catch {} renderPause(); }
  else if (b.id === 'pAllow') { NET.allowAll = b.checked; for (const P of others.values()) setPerm(P, b.checked); renderPause(); }
});
function copyCode(btn) {
  const done = () => { btn.textContent = 'Zkopírováno ✓'; setTimeout(() => (btn.textContent = 'Zkopírovat'), 1500); };
  navigator.clipboard?.writeText(NET.code).then(done, () => prompt('Kód serveru:', NET.code)) ?? prompt('Kód serveru:', NET.code);
}
export const netBox = document.createElement('div');
netBox.id = 'netbox';
document.body.append(netBox);
export function renderNetBox() {
  const html = `🌐 ${NET.host ? 'Server' : 'Připojeno'} <b>${esc(NET.code)}</b>${NET.worldName ? ` · ${esc(NET.worldName)}` : ''} · ${others.size + 1}/${NET.maxPlayers} hráčů${NET.host ? ' <button class="mc-btn" data-copy>Zkopírovat kód</button>' : ''}`;
  if (netBox.innerHTML !== html) netBox.innerHTML = html;
}
netBox.addEventListener('click', (e) => { const b = e.target.closest('[data-copy]'); if (b) copyCode(b); });

export function leaveGame(msg) {
  if (NET.leaving) return;
  saveGame();
  NET.leaving = true;
  try { if (msg) sessionStorage.setItem('rise-menu-msg', msg); } catch {}
  try { for (const P of others.values()) P.conn?.close(); BOOT.conn?.close(); BOOT.peer?.destroy(); } catch {}
  location.reload();
}
