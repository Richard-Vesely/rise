// Chat, menu Esc se seznamem hráčů, informační okénko.
import './avatars.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { NET } from '../../../shared/net/net.js';
import { broadcast, kick, others, setPerm, armyChat } from '../../../shared/net/room.js';
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
  if (NET.host && text.startsWith('/') && armyChat('host', NET.name, text)) return; // příkaz armády (jen hostitel jménem Marek)
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

// Server kroužku se restartuje (automatická aktualizace na novou verzi hry): přišlo ['restart'].
// Batoh se hned pošle na server; až se spojení zavře, hra počká, až nový server běží, načte se znovu
// (už v nové verzi) a menu se samo připojí zpátky do stejného světa (sessionStorage rise-znovu).
let restartAt = 0;
export function serverRestarting() {
  if (restartAt) return;
  restartAt = Date.now();
  saveGame();
  sysLine('Server se aktualizuje na novou verzi hry. Za chvíli tě připojím zpátky.');
}
export const restarting = () => !!restartAt;
export async function rejoinAfterRestart() {
  if (NET.leaving) return;
  NET.leaving = true;
  unlockPointer();
  const note = document.createElement('div');
  note.textContent = 'Nová verze hry · server se restartuje, za chvíli tě připojím zpátky…';
  note.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;text-align:center;background:#000b;color:#fff;font:600 20px system-ui,sans-serif';
  document.body.append(note);
  // nový server poznáme podle toho, že běží kratší dobu, než uplynulo od zprávy ['restart'] (starý ještě chvíli ukládá)
  const health = new URL(NET.code.replace(/^ws/i, 'http'));
  health.pathname = health.pathname.replace(/\/?ws$/, '') + '/health';
  for (let i = 0; i < 60; i++) { // nejvýš asi 2 minuty
    await new Promise((ok) => setTimeout(ok, 2000));
    try {
      const h = await (await fetch(health.href, { cache: 'no-store' })).json();
      if (h?.ok && h.uptime <= (Date.now() - restartAt) / 1000) {
        try { sessionStorage.setItem('rise-znovu', JSON.stringify({ url: NET.code, world: BOOT.welcome?.worldInfo?.id || '' })); } catch {}
        location.reload();
        return;
      }
    } catch {}
  }
  try { sessionStorage.setItem('rise-menu-msg', 'Server se po aktualizaci zatím nevrátil. Zkus to za chvíli znovu.'); } catch {}
  location.reload();
}

export function leaveGame(msg) {
  if (NET.leaving) return;
  saveGame();
  NET.leaving = true;
  try { if (msg) sessionStorage.setItem('rise-menu-msg', msg); } catch {}
  try { for (const P of others.values()) P.conn?.close(); BOOT.conn?.close(); BOOT.peer?.destroy(); } catch {}
  location.reload();
}
