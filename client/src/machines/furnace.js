// Pec a táborák v prohlížeči: obnovení oken, žhnoucí otvor a jiskry (tavení a pečení: shared/sim/machines.js).
import './kitchen.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import { FUEL, ITEMS, SMELT_TIME, smeltResult } from '../../../shared/data/index.js';
import { on } from '../../../shared/events.js';
import { furnaceOf, furnaces } from '../../../shared/world/state.js';
import { countItem, removeItem } from '../player/inventory.js';
import { specials } from '../render/blocks.js';
import { sparks } from '../render/particles.js';
import { toast } from '../ui/hud.js';
import { giveOrDrop, iconImg, invOpen, refreshUI, renderCraftArea, slotHTML, ui } from '../ui/inventory-ui.js';

// ============================================================ pec: tavení rud, písku a dalších surovin s palivem
// Políčka: [surovina, palivo, výsledek]. Palivo hoří i se zavřeným oknem; když nemá co tavit, nové palivo se nezapálí.
on('fireDone', (k) => { const s = specials.get(k); if (s) sparks.emit(s.x + 0.5, s.ry + 0.6, s.z + 0.5, [1, 0.6, 0.2], 12, 1.5, 2); });
on('furnaceDone', (k) => { const s = specials.get(k); if (s) sparks.emit(s.x + 0.5, s.ry + 0.5, s.z + 0.5, [1, 0.6, 0.2], 8, 1.2, 1.5); });
let furnaceRenderT = 0;
// Okno pece se během tavení obnovuje (tavení samo je v shared/sim/machines.js).
export function refreshFurnaceUI(dt) {
  if (invOpen && ui.mode === 'furnace' && (furnaceRenderT -= dt) <= 0) { furnaceRenderT = 0.15; renderCraftArea(); }
}
// Žhnoucí otvor pece (u klienta podle stavu, který posílá hostitel)
export function updateFurnaceGlow(time) {
  for (const [k, s] of specials) {
    if (s.type !== 'furnace') continue;
    const f = furnaces.get(k), on = f && f.burn > 0;
    s.obj.userData.glow.material.emissiveIntensity = on ? 1.3 + Math.sin(time * 9 + s.x) * 0.3 : 0;
  }
}
export function renderFurnace(area) {
  const f = furnaceOf(ui.fireKey), [inp, fuel, out] = f.slots, res = inp && smeltResult(inp.id);
  const p = res ? Math.min(100, (f.t / SMELT_TIME) * 100) : 0, b = f.burnMax ? (f.burn / f.burnMax) * 100 : 0;
  // Kolik kusů ještě palivo utaví (to, co hoří, plus palivo v políčku), jako ukazatel plamene v Minecraftu
  const left = Math.floor((f.burn + (fuel && FUEL[fuel.id] ? FUEL[fuel.id] * fuel.n : 0)) / SMELT_TIME);
  const full = res && out && (out.id !== res || out.n >= ITEMS[res].stack);
  const note = !inp ? 'Nahoru vlož surovinu (ruda, písek, křemen, železo…), dolů palivo (uhlí, dřevo).'
    : !res ? 'Tohle se v peci tavit nedá.'
      : full ? (out.id !== res ? 'Ve výstupu leží něco jiného: vyber to a pec se znovu rozjede.' : 'Výstup je plný: vyber hotové věci.')
        : f.burn > 0 ? `Taví se: ${ITEMS[res].name}${left ? ` · palivo vystačí ještě na ${left} ks` : ''}`
          : fuel ? 'Zapaluje se…' : f.t > 0 ? 'Došlo palivo! Tavení se vrací zpátky.' : 'Přidej palivo (uhlí, dřevěné uhlí, dřevo).';
  area.innerHTML = `<div class="mc-title">Pec</div>
    <div class="fire-ui">
      <div class="fire-col">${slotHTML(inp, 0, '', 'furnace')}
        <div class="flame ${f.burn > 0 ? 'on' : ''}">${iconImg('campfire')}</div>
        <div class="parrow fuelbar"><i style="width:${b}%"></i></div>
        ${slotHTML(fuel, 1, '', 'furnace')}</div>
      <div class="parrow"><i style="width:${p}%"></i></div>
      ${slotHTML(out, 2, 'out', 'furnace')}
    </div>
    <div class="mc-note">${note}</div>`;
}
// Palivo, které kniha pece bere z batohu: nejdřív uhlí, pak dřevo; líh a kaktus nikdy (líh je na jiné věci)
const AUTO_FUEL = () => Object.keys(FUEL).filter((x) => x !== 'ethanol' && x !== 'cactus')
  .sort((a, b) => (b.includes('coal') - a.includes('coal')) || FUEL[b] - FUEL[a]);
// Klik v knize pece: surovina se přesune do pece, a když chybí palivo, přidá se ho z batohu tolik, kolik je potřeba
export function fillFurnace(id) {
  const f = furnaceOf(ui.fireKey);
  if (f.slots[0] && f.slots[0].id !== id) { const old = f.slots[0]; f.slots[0] = null; giveOrDrop(old.id, old.n, old.w); }
  const k = Math.min(countItem(id), ITEMS[id].stack - (f.slots[0]?.n || 0));
  if (k <= 0) { toast(`Nemáš: ${ITEMS[id].name}`); return refreshUI(); }
  removeItem(id, k);
  if (f.slots[0]) f.slots[0].n += k; else f.slots[0] = { id, n: k };
  if (!f.slots[1]) {
    const fuelId = AUTO_FUEL().find((x) => x !== id && countItem(x) > 0);
    if (fuelId) {
      const need = Math.ceil((f.slots[0].n * SMELT_TIME - f.burn) / FUEL[fuelId]);
      const n = Math.min(countItem(fuelId), ITEMS[fuelId].stack, Math.max(1, need));
      removeItem(fuelId, n);
      f.slots[1] = { id: fuelId, n };
    }
  }
  refreshUI();
}
