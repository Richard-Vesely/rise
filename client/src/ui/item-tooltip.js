// Bohatý tooltip předmětu: jméno v barvě vzácnosti, druh, popis, útok, ochrana, jídlo, odolnost, palivo, použití.
// Modul nic nespouští při načtení (jen funkce), takže nepotřebuje řádek v pořadí spouštění.
import { ARMOR_SETS, ARMOR_SLOT_NAMES, COOKING, FUEL, FURNACE_ONLY, ITEMS, KITCHEN, RECIPES, RECIPE_CATS, TOOL_SPEED } from '../../../shared/data/index.js';
import { RARITY_NAMES, itemKind, rarityOf } from '../../../shared/inventory.js';
import { attackSpeed, repairMatName } from '../../../shared/tools.js';

const PICK_REACH = { 1: 'kámen a uhlí', 2: 'kámen, uhlí, železo, měď a křemen', 3: '…a navíc krystal a zlato', 4: '…a navíc obsidián a markorit', 5: 'všechno' };

const TIER_N = { 1: 'Dřevo', 2: 'Kámen', 3: 'Železo', 4: 'Krystal', 5: 'Markorit' };
const KIND_N = { tool: 'Nástroj', weapon: 'Zbraň', armor: 'Brnění', food: 'Jídlo', block: 'Stavební blok', basic: 'Surovina' };
const TOOL_N = { pick: 'Krumpáč', axe: 'Sekera', shovel: 'Lopata', sword: 'Meč' };
const TOOL_DESC = {
  pick: 'Těží kámen, rudy a cihly. Lepší krumpáč vytěží vzácnější rudy.',
  axe: 'Rychle kácí stromy a rozebírá dřevo.',
  shovel: 'Rychle kope hlínu, písek a sníh.',
  sword: 'Zbraň proti zvířatům a příšerám.',
};
// Krátké popisy důležitých předmětů (ostatní dostanou popis podle druhu).
const DESC = {
  log: 'Z kmene uděláš prkna (4 kusy).', planks: 'Základ skoro všeho ze dřeva.', stick: 'Rukojeť nástrojů a pochodní.',
  fiber: 'Z trávy. Na pochodně, provázky a luky.', coal: 'Palivo a pochodně. Najdeš ho v kameni.', torch: 'Svítí ve tmě a odhání stínožrouty. Postav ji na blok nebo pověs na stěnu (na strop ne).',
  campfire: 'Peče maso a taví rudu. Světlo odhání stínožrouty.', workbench: 'Výroba v mřížce 3×3.', chest: 'Uschová 27 hromádek předmětů.',
  shard: 'Tři úlomky probudí portál ve svatyni.', essence: 'Z ní se vyrábí stínové brnění.', iron_ore: 'Přetav ji v táboráku nebo v peci.',
  iron: 'Na nástroje, brnění a stroje.', markorite: 'Nejlepší kov Říše.', markapple: 'Po snězení můžeš chvíli létat!',
  hoe: 'Pravé tl. na trávu nebo hlínu = zorat pole.', spikes: 'Zraňují příšery, které na ně šlápnou.',
  bow: 'Drž pravé tlačítko = natáhnout, pusť = vystřelit. Plně natažený šíp zraní víc než meč.', arrow: 'Střílí se z luku. Zabodnutý šíp můžeš zase sebrat.',
};
// V kolika receptech je předmět surovinou
const USED_IN = new Map();
for (const r of RECIPES) for (const id of new Set(r.pat.flat().filter(Boolean))) USED_IN.set(id, (USED_IN.get(id) || 0) + 1);
for (const k of KITCHEN) for (const id of Object.keys(k.in)) USED_IN.set(id, (USED_IN.get(id) || 0) + 1);

/** Odolnost nástroje (jen když ji předmět má a je opotřebovaný): { left, max } nebo null.
 * Opotřebení je v políčku jako w = kolik odolnosti už je spotřebované (ITEMS[id].dur = odolnost nového kusu). */
export function durOf(s) {
  const max = s && ITEMS[s.id]?.dur;
  if (!max || !s.w) return null;
  return { left: Math.max(0, max - s.w), max };
}
/** Barva proužku odolnosti: zelená → žlutá → oranžová → červená (jako v Minecraftu: odstín = zbytek / 3). */
export const durColor = (f) => `hsl(${Math.round(Math.max(0, Math.min(1, f)) * 120)}, 95%, 52%)`;

const fmt = (x) => String(Math.round(x * 10) / 10).replace('.', ',');
const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

/**
 * HTML tooltipu. stack = konkrétní hromádka (kvůli počtu a odolnosti) nebo null; el = políčko (recept, kuchařka…).
 * ctx = { mode, size } otevřeného okna; adv = rozšířený tooltip (F3 + H) s id předmětu.
 */
export function tooltipHTML(id, stack, el, ctx, adv) {
  const d = ITEMS[id];
  if (!d) return '';
  const kind = itemKind(id), rar = rarityOf(id);
  const head = [];
  if (d.tool) head.push(TOOL_N[d.tool] || KIND_N.tool);
  else if (d.armor) head.push(`${KIND_N.armor} · ${ARMOR_SLOT_NAMES[d.armor.slot]}`);
  else head.push(KIND_N[kind] || RECIPE_CATS[kind] || KIND_N.basic);
  if (TIER_N[d.tier]) head.push(TIER_N[d.tier]);
  if (rar) head.push(RARITY_NAMES[rar]);
  const lines = [];
  const desc = DESC[id] || (d.tool && TOOL_DESC[d.tool]) || (d.plant && 'Zasaď na ornou půdu (pravé tl.).') || (d.utensil && 'Kuchyňské nádobí pro sporák. Nespotřebuje se.');
  if (desc) lines.push(`<div class="desc">${desc}</div>`);
  const stats = [];
  if (d.tool) {
    stats.push(`<span class="st atk">⚔ ${fmt(d.dmg)} útok</span>`);
    stats.push(`<span class="st spd">⏱ ${fmt(attackSpeed(id))} úderů/s</span>`);
    if (d.tool !== 'sword') stats.push(`<span class="st spd">⛏ ${fmt(TOOL_SPEED[d.tier] || 1)}× rychleji</span>`);
  }
  if (d.armor) stats.push(`<span class="st def">🛡 +${d.armor.pts} ochrana</span>`);
  if (d.food) stats.push(`<span class="st food">🍗 +${d.food} jídlo</span>`);
  if (d.heal) stats.push(`<span class="st heal">❤ +${d.heal} zdraví</span>`);
  if (d.fly) stats.push(`<span class="st fly">🕊 ${d.fly} s létání</span>`);
  if (stats.length) lines.push(`<div class="stats">${d.tool ? '<small>Při držení v ruce:</small>' : ''}${stats.join('')}</div>`);
  if (d.armor?.set) lines.push(`<div class="sub">Celá sada ${ARMOR_SETS[d.armor.set].name}á: ${ARMOR_SETS[d.armor.set].bonus}</div>`);
  if (d.tool === 'pick') lines.push(`<div class="sub">Vytěží: ${PICK_REACH[d.tier] || ''}</div>`);
  if (d.tool === 'sword') lines.push('<div class="sub">Nabij úder (proužek pod zaměřovačem). Ve skoku kritický zásah ×1,5.</div>');
  const du = durOf(stack);
  if (du) {
    const f = du.left / du.max;
    lines.push(`<div class="dur ${f < 0.1 ? 'low' : ''}">Odolnost ${du.left} / ${du.max}<i style="--f:${f};--c:${durColor(f)}"></i></div>`);
    if (!el?.dataset.out) lines.push(`<div class="sub">Oprava: 2 stejné kusy, nebo kus + ${repairMatName(id)} v mřížce výroby</div>`);
  } else if (d.dur && !stack?.w) lines.push(`<div class="sub">Odolnost ${d.dur} použití</div>`);
  const how = [];
  if (d.food) how.push('Pravé tl. = sníst');
  else if (d.block) how.push('Pravé tl. = položit');
  if (COOKING[id]) how.push(`V táboráku → ${ITEMS[COOKING[id]].name}`);
  else if (FURNACE_ONLY[id]) how.push(`V peci → ${ITEMS[FURNACE_ONLY[id]].name}`);
  if (FUEL[id]) how.push(`Palivo: hoří ${FUEL[id]} s`);
  if (USED_IN.get(id)) how.push(`Surovina do ${USED_IN.get(id)} ${USED_IN.get(id) === 1 ? 'receptu' : 'receptů'}`);
  if (how.length) lines.push(`<div class="sub">${how.join(' · ')}</div>`);
  // Kniha receptů, kuchařka, táborák, pec
  if (el?.dataset.k !== undefined) { const r = KITCHEN[+el.dataset.k]; lines.push(`<div class="need">${Object.entries(r.in).map(([k, n]) => `${n}× ${ITEMS[k].name}`).join(', ')}</div>`); }
  if (el?.dataset.r !== undefined) {
    const r = RECIPES[+el.dataset.r];
    const need = {};
    for (const row of r.pat) for (const x of row) if (x) need[x] = (need[x] || 0) + 1;
    lines.push(`<div class="need">${r.n > 1 ? `Vyrobíš ${r.n} ks z: ` : 'Z: '}${Object.entries(need).map(([k, n]) => `${n}× ${ITEMS[k].name}`).join(', ')}</div>`);
    if (r.adv && ctx.mode !== 'adv') lines.push('<div class="warn">Potřebuješ dílnu (pokročilý pracovní stůl)</div>');
    else if (r.w > ctx.size || r.h > ctx.size) lines.push('<div class="warn">Potřebuješ pracovní stůl</div>');
    lines.push(`<div class="sub">${RECIPE_CATS[r.cat] || ''} · klik = rozložit do mřížky, Shift = víc najednou</div>`);
  }
  if (el?.dataset.cook) lines.push(`<div class="need">z: ${ITEMS[el.dataset.cook].name}</div>`);
  if (el?.dataset.fur) lines.push(`<div class="need">z: ${ITEMS[el.dataset.fur].name}</div>`);
  if (stack && stack.n > 1) lines.push(`<div class="sub">${stack.n} ks${d.stack > 1 ? ` (nejvíc ${d.stack} na políčko)` : ''}</div>`);
  if (adv) lines.push(`<div class="adv">rise:${esc(id)}${d.block ? ` · blok ${esc(d.block)}` : ''}${d.cat ? ` · ${esc(d.cat)}` : ''}</div>`);
  return `<div class="name rar${rar}">${esc(d.name)}</div><div class="kind">${head.join(' · ')}</div>${lines.join('')}`;
}
