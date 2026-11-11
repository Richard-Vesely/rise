// Zkušenosti (XP), úroveň, mana a naučená kouzla hráče (data a pravidla: shared/data/magic.js, sesílání: magic.js).
// XP: poražený tvor (kterého jsi zasáhl), vytěžená ruda, výroba a vaření. Nová úroveň = nabídka 3 kouzel, jedno si
// vybereš (okno). K = kniha kouzel (naučená kouzla, výběr aktivního), R = další kouzlo. Ukládá se jako `magic`
// (v prohlížeči i na serveru). Bez vedlejších účinků při načtení (okna a pruhy se vytvoří až při prvním použití).
import { SPELLS, XP_MOB, cleanMagic, levelOf, manaMax, MANA_REGEN, offerSpells } from '../../../shared/data/magic.js';
import { uiSound } from '../audio/ui-sound.js';
import { save } from '../game/save-load.js';
import { toast } from '../ui/hud.js';
import { heldStack } from './inventory.js';
import { lockPointer, unlockPointer } from './player.js';

const M = cleanMagic(save?.magic);
export const magic = Object.assign(M, { mana: manaMax(levelOf(M.xp).level), cd: {}, regenT: 0, wardT: 0 });
/** Co se ukládá (game/save.js). */
export const magicState = () => ({ xp: M.xp, learned: M.learned, sel: M.sel, picks: M.picks });
export const level = () => levelOf(M.xp).level;
export const holdingWand = () => !!heldStack() && heldStack().id === 'wand';

/** Přidá XP; při nové úrovni nabídne kouzla. */
export function addXp(n) {
  if (!(n > 0)) return;
  const before = level();
  M.xp += n;
  floater(`+${n} XP`);
  const after = level();
  if (after > before) {
    M.picks += after - before;
    M.mana = manaMax(after);
    toast(`✦ Úroveň ${after}! Vyber si nové kouzlo.`);
    uiSound.craft?.();
    setTimeout(offerPick, 600);
  }
  renderBars();
}

// ---------- XP za tvory: kdo tvora zasáhl (šíp, meč, kouzlo) a ten do 4 s padne, dostane XP
const hits = new Map(); // tvor -> kdy jsem ho naposledy zasáhl
export function noteHit(m) { hits.set(m, performance.now()); }
function checkKills() {
  const now = performance.now();
  for (const [m, t] of hits) {
    if (m.dead) { hits.delete(m); if (now - t < 4000) addXp(XP_MOB[m.type] || 1); }
    else if (now - t > 6000) hits.delete(m);
  }
}

/** Každý snímek: mana se dobíjí, regenerace, odpočty, XP za poražené tvory. */
export function updateXp(dt, player) {
  checkKills();
  const max = manaMax(level());
  if (M.mana < max) M.mana = Math.min(max, M.mana + MANA_REGEN * dt);
  if (M.regenT > 0) { M.regenT -= dt; if (player.alive) player.hp = Math.min(100, player.hp + 3 * dt); }
  if (M.wardT > 0) M.wardT -= dt;
  for (const k in M.cd) M.cd[k] -= dt;
  renderBars();
}

// ---------- pruhy XP a many nad lištou, aktivní kouzlo
let bars = null, lastKey = '';
function renderBars() {
  if (!bars) { bars = document.createElement('div'); bars.id = 'xpBars'; document.body.append(bars); }
  const L = levelOf(M.xp), max = manaMax(L.level), wand = holdingWand();
  const key = `${L.level}|${L.into}|${Math.round(M.mana)}|${wand}|${M.sel}|${M.wardT > 0}|${M.regenT > 0}`;
  if (key === lastKey) return;
  lastKey = key;
  const sp = M.sel && SPELLS[M.sel];
  bars.innerHTML = `<div class="xp-row"><b class="lvl">${L.level}</b><div class="bar xp"><i style="width:${(L.into / L.need) * 100}%"></i></div></div>
    <div class="xp-row"><span class="mana-ico">✦</span><div class="bar mana"><i style="width:${(M.mana / max) * 100}%"></i><small>${Math.floor(M.mana)}/${max}</small></div></div>
    ${wand ? `<div class="spell">${sp ? `✦ ${sp.name} <small>(${sp.mana} many · R další · K kniha)</small>` : 'Hůl neumí žádné kouzlo – získej úroveň (XP)'}</div>` : ''}
    ${M.wardT > 0 || M.regenT > 0 ? `<div class="buffs">${M.wardT > 0 ? '🛡 štít ' : ''}${M.regenT > 0 ? '💚 regenerace' : ''}</div>` : ''}`;
}
function floater(text) {
  const el = document.createElement('div');
  el.className = 'xp-float';
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), 1400);
}

// ---------- výběr kouzla při nové úrovni a kniha kouzel
let win = null;
const card = (id, act) => { const s = SPELLS[id]; return `<button class="mc-btn spell-card k-${s.kind}" data-${act}="${id}"><b>${s.name}</b><small>${s.kind} · ${s.mana} many</small><span>${s.desc}</span></button>`; };
const onEsc = (e) => { if (win && (e.code === 'Escape' || e.code === 'KeyK')) { e.stopImmediatePropagation(); e.preventDefault(); closeWin(); } };
function openWin(html) { unlockPointer(); win = document.createElement('div'); win.id = 'spellWin'; win.innerHTML = html; document.body.append(win); addEventListener('keydown', onEsc, true); }
function closeWin(relock = true) { win?.remove(); win = null; removeEventListener('keydown', onEsc, true); if (relock) lockPointer(); }
/** Nabídne 3 kouzla (pokud čeká výběr). */
export function offerPick() {
  if (win || M.picks <= 0) return;
  const offer = offerSpells(level(), M.learned);
  if (!offer.length) { M.picks = 0; return; }
  openWin(`<div class="mc-panel spell-panel"><div class="mc-title">✦ Úroveň ${level()} – vyber si kouzlo</div><div class="spell-cards">${offer.map((id) => card(id, 'pick')).join('')}</div><p class="mc-note">Kouzla sesíláš čarovnou holí (pravé tlačítko). R přepne kouzlo, K otevře knihu kouzel.</p></div>`);
  win.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    M.learned.push(b.dataset.pick);
    M.sel = b.dataset.pick;
    M.picks--;
    toast(`Naučil(a) ses: ${SPELLS[b.dataset.pick].name}`);
    closeWin();
    renderBars();
    if (M.picks > 0) setTimeout(offerPick, 400);
  });
}
/** Kniha kouzel (K): naučená kouzla, klik = aktivní kouzlo; čekající výběr. */
export function toggleBook() {
  if (win) { closeWin(); return; }
  if (M.picks > 0) { offerPick(); return; }
  const L = levelOf(M.xp);
  openWin(`<div class="mc-panel spell-panel"><div class="mc-title">✦ Kniha kouzel · úroveň ${L.level} (${L.into}/${L.need} XP do další)</div>
    ${M.learned.length ? `<div class="spell-cards">${M.learned.map((id) => card(id, 'sel').replace('spell-card', `spell-card${id === M.sel ? ' on' : ''}`)).join('')}</div>` : '<p>Zatím neumíš žádné kouzlo. XP dostaneš za poražené tvory, rudy, výrobu a vaření.</p>'}
    <p class="mc-note">Klikni na kouzlo, které má hůl sesílat. Zavřít: K nebo Esc.</p></div>`);
  win.addEventListener('click', (e) => { const b = e.target.closest('[data-sel]'); if (b) { M.sel = b.dataset.sel; closeWin(); renderBars(); } });
}
/** R: další naučené kouzlo. */
export function nextSpell() {
  if (!M.learned.length) return;
  M.sel = M.learned[(M.learned.indexOf(M.sel) + 1) % M.learned.length];
  toast(`✦ ${SPELLS[M.sel].name}`);
  renderBars();
}
export const bookOpen = () => !!win;
