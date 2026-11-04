// HUD: kompas, hodiny, lišty, oznámení, rady.
import '../render/daylight.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { ARMOR_SETS } from '../../../shared/data/index.js';
import { dayCount, dayTime } from '../../../shared/sim/day.js';
import { wrapAngle } from '../../../shared/util.js';
import { portalActive, ruinsOpened } from '../../../shared/world/state.js';
import { STRUCTS, structuresNear } from '../../../shared/world/structures.js';
import { BIOME_NAMES, biomeAt, isMark, shrineOf } from '../../../shared/world/terrain.js';
import { isDragon } from '../../../shared/world/dragon-land.js';
import { mobs } from '../../../shared/sim/mobs.js';
import { Sound } from '../audio/sound.js';
import { countItem } from '../player/inventory.js';
import { creative, player } from '../player/player.js';
import { ICONS } from '../render/icons.js';
import { shardObjs } from '../render/shards.js';
import { crafted, placedAny } from '../world/world-state.js';
import { $ } from './dom.js';
import { armorPoints, fullSet, invOpen, renderInventory } from './inventory-ui.js';

// ============================================================ HUD
const compass = $('compass');
const compassItems = [];
const addCompass = (html, cls, yaw) => {
  const el = document.createElement('div');
  el.className = 'm ' + cls;
  el.innerHTML = html;
  compass.append(el);
  const item = { el, yaw };
  compassItems.push(item);
  return item;
};
for (let i = 0; i < 24; i++) addCompass('<div class="tick"></div>', '', (i / 24) * Math.PI * 2);
[['S', 0], ['V', -Math.PI / 2], ['J', Math.PI], ['Z', Math.PI / 2]].forEach(([t, a]) => addCompass(t, '', a));
const shrineMark = addCompass('◆<small></small>', 'shrine', 0);
const shardMark = addCompass('✦<small></small>', 'shard', 0);
const ruinMark = addCompass('▣<small></small>', 'ruin', 0);
function placeCompass(item) {
  const diff = wrapAngle(item.yaw - player.yaw);
  item.el.style.display = Math.abs(diff) < 1.75 ? '' : 'none';
  item.el.style.left = `${50 - (diff / (Math.PI / 2)) * 50}%`;
}
function setMarker(item, x, z) {
  if (x === null) { item.el.style.display = 'none'; return; }
  const dx = x - player.pos.x, dz = z - player.pos.z;
  item.yaw = Math.atan2(-dx, -dz);
  placeCompass(item);
  item.el.querySelector('small').textContent = `${Math.round(Math.hypot(dx, dz))} m`;
}
export function feed(id, text) {
  const el = document.createElement('div');
  el.innerHTML = `<img src="${ICONS[id].url}"${ICONS[id].smooth ? ' class="sm"' : ''} alt="">`;
  el.append(text);
  $('feed').prepend(el);
  setTimeout(() => el.remove(), 3000);
}
let toastTimer = 0;
export function toast(text) {
  $('toast').textContent = text;
  $('toast').classList.add('show');
  toastTimer = 3.2;
}

// Rady: tvůj postup světem – od dřeva přes kámen a železo až ke krystalu.
const TIPS = [
  { text: 'Pokácej strom – namiř na kmen a drž levé tlačítko myši. Klády vypadnou na zem: dojdi k nim a samy ti skočí do batohu.', done: () => countItem('log') > 0 || crafted.planks },
  { text: 'Otevři inventář (E), polož kmen do mřížky výroby a vezmi si prkna. Pak 4 prkna do čtverce = pracovní stůl. (Recepty vlevo rozloží suroviny za tebe.)', done: () => crafted.workbench },
  { text: 'Polož pracovní stůl (pravé tlačítko), klikni na něj pravým a vyrob dřevěný krumpáč.', done: () => crafted.wood_pick },
  { text: 'Vytěž kámen z balvanů a vyrob kamenné nástroje. Vytrhej trávu (míř pod sebe) na vlákno.', done: () => crafted.stone_pick || crafted.stone_axe || crafted.stone_sword },
  { text: 'Vyrob a polož táborák (u stolu). Světlo odhání stínožrouty.', done: () => placedAny.campfire },
  { text: 'Ulov ovci nebo kance, klikni pravým na táborák a vlož do něj maso.', done: () => crafted.meat },
  { text: 'Kopej do země (lopatou rychleji). Pod hlínou je kámen a uhlí – z uhlí a klacku vyrobíš 8 pochodní. V jeskyních je tma!', done: () => countItem('coal') > 0 || crafted.iron },
  { text: 'Hlouběji v podzemí (nebo v rezavých balvanech) je železná ruda. Vytěž ji kamenným krumpáčem a přetav v táboráku.', done: () => crafted.iron },
  { text: 'Kuchyně: postav sporák a vyrob pánev. Vejce sebereš slepici (pravé tl.), sůl najdeš v kameni. Uvař si volské oko!', done: () => crafted.fried_egg || crafted.spaghetti },
  { text: 'Vyrob si železné brnění (E → políčka vlevo). Úlomky světla najdeš jako zářící paprsky (✦ na kompasu) nebo hluboko pod zemí.', done: () => countItem('shard') >= 3 || portalActive },
  { text: 'Jdi do svatyně, namiř na portál a pravým tlačítkem vlož 3 úlomky světla. Otevře se portál do Markovy dimenze!', done: () => portalActive },
  { text: 'Projdi portálem. V Markově dimenzi hledej ruiny s truhlami (▣ na kompasu). Pozor na Markomany!', done: () => ruinsOpened.size > 0 || crafted.markorite },
  { text: 'Krystalovým krumpáčem vytěž markoritovou rudu pod markdirtem a přetav ji v táboráku.', done: () => crafted.markorite },
  { text: 'Vyrob markoritové brnění a meč – nejlepší výbava v Říši.', done: () => crafted.markorite_sword || crafted.markorite_chestplate },
];
let tipIndex = -1;
export function updateTips() {
  const i = TIPS.findIndex((t) => !t.done());
  if (i === tipIndex) return;
  if (tipIndex >= 0 && (i > tipIndex || i < 0)) { toast('✔ Splněno'); Sound.craft(); }
  tipIndex = i;
  $('tipText').textContent = i < 0 ? 'Svět je tvůj. Stav, objevuj a přežij.' : TIPS[i].text;
}

export let vignette = 0, tipT = 0;
let dragonHealth;
function updateDragonHealth() {
  const m = mobs.find((m) => m.type === 'dragon' && !m.dead && Math.hypot(m.pos.x - player.pos.x, m.pos.z - player.pos.z) < 48);
  if (!dragonHealth && !m) return;
  if (!dragonHealth) {
    dragonHealth = document.createElement('div'); dragonHealth.id = 'dragonHealth';
    dragonHealth.innerHTML = '<b></b><progress max="300"></progress><small></small>';
    document.body.append(dragonHealth);
  }
  dragonHealth.hidden = !m;
  if (!m) return;
  dragonHealth.querySelector('b').textContent = `Drak Země draka · ${Math.ceil(m.hp)} / ${m.def.hp}`;
  dragonHealth.querySelector('progress').value = m.hp;
  dragonHealth.querySelector('small').textContent = m.windup > 0 ? 'Chystá útok — uskoč!' : 'Strážce dračí jeskyně';
}
export function setVignette(v) { vignette = v; }
export function updateHUD(dt) {
  updateDragonHealth();
  for (const item of compassItems) if (item !== shrineMark && item !== shardMark && item !== ruinMark) placeCompass(item);
  // Nejbližší neprozkoumaná stavba (ruiny, pevnost, věž, tábor, kobka)
  const near = structuresNear(player.pos.x, player.pos.z, 320).filter((r) => !ruinsOpened.has(r.key));
  near.sort((a, b) => Math.hypot(a.x - player.pos.x, a.z - player.pos.z) - Math.hypot(b.x - player.pos.x, b.z - player.pos.z));
  const st = near[0];
  if (st) ruinMark.el.firstChild.textContent = STRUCTS[st.type].icon;
  setMarker(ruinMark, st ? st.x : null, st ? st.z : null);
  ruinMark.el.title = st ? STRUCTS[st.type].name : '';
  let best = null, bd = Infinity;
  for (const s of shardObjs.values()) {
    const d = Math.hypot(s.x - player.pos.x, s.z - player.pos.z);
    if (d < bd) { bd = d; best = s; }
  }
  setMarker(shrineMark, shrineOf(player.pos.x).x, 0);
  setMarker(shardMark, best ? best.x : null, best ? best.z : null);
  const h = Math.floor(dayTime * 24), mi = Math.floor((dayTime * 24 * 60) % 60);
  $('clock').textContent = `Den ${dayCount} · ${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}${isDragon(player.pos.x) ? ' · Země draka' : isMark(player.pos.x) ? ' · Markova dimenze' : ' · ' + BIOME_NAMES[biomeAt(player.pos.x, player.pos.z)]}${creative ? (player.flying ? ' · Kreativní ✈' : ' · Kreativní') : ''}`;
  $('hpfill').style.width = `${Math.max(0, player.hp)}%`;
  $('foodfill').style.width = `${player.hunger}%`;
  $('armorfill').style.width = `${(armorPoints() / 23) * 100}%`;
  const set = fullSet(), fx = [];
  if (player.flyT > 0) fx.push(`🍎 Létání ${Math.ceil(player.flyT)} s`);
  if (set) fx.push(`🛡 ${ARMOR_SETS[set].name}á sada: ${ARMOR_SETS[set].bonus}`);
  const fxHtml = fx.map((t) => `<div>${t}</div>`).join('');
  if ($('effects').innerHTML !== fxHtml) $('effects').innerHTML = fxHtml;
  vignette = Math.max(0, vignette - dt * 1.5);
  $('vignette').style.opacity = Math.max(vignette, player.alive ? (1 - player.hp / 100) * 0.5 : 0);
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) $('toast').classList.remove('show');
  if ((tipT -= dt) <= 0) { tipT = 0.5; updateTips(); if (invOpen) renderInventory(); }
}
