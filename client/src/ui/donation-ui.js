// Pokladnička darů u sochy (jen server kroužku): okno inventáře v režimu 'dar' a žebříček dárců.
// Položený předmět se hned pošle serveru (['donate', id, n, w?]) a z batohu zmizí; zpátky si ho vzít nejde.
// Obsah pokladničky vidí a bere jen vlastník serveru – o tom rozhoduje server (server/donation-box.js),
// tady se jen kreslí, co server poslal (['dary', …]). Modul nic nespouští při načtení (jen funkce a stav).
import { ITEMS } from '../../../shared/data/index.js';
import { ownerItem } from '../../../shared/data/magic.js';
import { NET } from '../../../shared/net/net.js';
import { addItem } from '../player/inventory.js';
import { toast } from './hud.js';
import { slotHTML, slotInner } from './slots.js';

/** Stav od serveru: žebříček, jestli jsem vlastník, obsah pokladničky (jen vlastník) a políčko na dar. */
export const DON = { got: false, top: [], owner: false, ownerName: '', box: null, slot: [null] };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Zpráva ['dary', stav] od serveru. */
export function applyDary(d) {
  if (!d || typeof d !== 'object') return;
  DON.got = true;
  DON.top = Array.isArray(d.top) ? d.top.filter((r) => Array.isArray(r)).slice(0, 10).map(([n, k]) => [String(n).slice(0, 16), Number(k) || 0]) : [];
  DON.owner = !!d.owner;
  DON.ownerName = String(d.ownerName || '').slice(0, 30);
  DON.box = DON.owner && Array.isArray(d.box) ? d.box.filter((s) => Array.isArray(s) && ITEMS[s[0]]) : null;
}

/** Krátký žebříček do nápovědy u sochy: „Nejštědřejší: Ája 120 · Bára 40“. */
export function donorsLine(k = 3) {
  if (NET.jail) return jailLine();
  if (!DON.got) return 'socha darů';
  return DON.top.length ? 'Nejštědřejší: ' + DON.top.slice(0, k).map(([n, c]) => `${n} ${c}`).join(' · ') : 'zatím nikdo nedaroval';
}

/** Vězeň: kolik ok ještě chybí (vězení serveru kroužku, player/prison.js). */
export const jailLine = () => `ve vězení: ještě ${Math.max(0, NET.jail.need - NET.jail.given)}× ${ITEMS[NET.jail.item]?.name || ''} a jsi volný`;

/** Předmět v políčku na dar: poslat serveru (nebo vrátit, když tady dary nefungují). */
export function flushDonation() {
  const s = DON.slot[0];
  if (!s) return;
  DON.slot[0] = null;
  if (ownerItem(s.id)) { addItem(s.id, s.n, true); toast('Hůl vlastníka se darovat nedá'); return; }
  if (!NET.client || !DON.got || !ITEMS[s.id]) { addItem(s.id, s.n, true, s.w || 0); toast('Darovat jde jen na serveru kroužku'); return; }
  NET.req(s.w ? ['donate', s.id, s.n, s.w] : ['donate', s.id, s.n]);
}

/** Vlastník klikl na hromádku v pokladničce: server ji pošle do batohu (jiným to server odmítne). */
export function takeDonation(i) {
  const s = DON.box?.[i];
  if (!s || !DON.owner) return;
  NET.req(['take', i, s[0]]);
}

/** Obsah okna pokladničky (místo mřížky výroby). */
export function renderDonationUI(area) {
  flushDonation(); // předmět položený klikem, Shiftem nebo klávesou se pošle tady, po každé změně okna
  const who = DON.ownerName ? esc(DON.ownerName) : 'vlastník serveru';
  const top = DON.top.length ? `<ol class="dar-top">${DON.top.slice(0, 5).map(([n, c]) => `<li><b>${esc(n)}</b> ${c} ks</li>`).join('')}</ol>` : '<p class="mc-note">Zatím nikdo nedaroval. Buď první!</p>';
  const box = !DON.owner ? '' : `<div class="mc-title">V pokladničce (klik = vzít, bereš jen ty)</div>
    <div class="grid dar-box">${(DON.box || []).map(([id, n, w], i) => `<div class="slot" data-take="${i}" data-item="${id}">${slotInner({ id, n, ...(w ? { w } : {}) })}</div>`).join('') || '<p class="mc-note">Prázdná.</p>'}</div>`;
  const note = NET.jail ? `Jsi ve vězení. Polož sem ${esc(ITEMS[NET.jail.item]?.name || '')} (${NET.jail.given}/${NET.jail.need}).<br>Oka dostane ${who}, ty dostaneš svobodu.` : `Polož sem, co chceš darovat.<br>Dar dostane ${who} a vzít zpátky už nejde.`;
  area.innerHTML = `<div class="mc-title">Pokladnička darů</div>
    <div class="dar-ui">${slotHTML(DON.slot[0], 0, '', 'dar')}<div class="mc-note">${note}</div></div>
    <div class="mc-title">Nejštědřejší dárci</div>${top}${box}`;
}
