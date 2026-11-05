// Sporák a pole v prohlížeči: kuchařka, modely plodin, pára (vaření a růst: shared/sim/machines.js).
import '../ui/inventory-ui.js'; // pořadí spouštění: nejdřív předchozí modul (viz client/src/main.js)
import * as THREE from 'three';
import { CROPS, ITEMS, KITCHEN } from '../../../shared/data/index.js';
import { on } from '../../../shared/events.js';
import { hash2, randInt } from '../../../shared/util.js';
import { blocks, crops, stoveOf, stoves } from '../../../shared/world/state.js';
import { Sound } from '../audio/sound.js';
import { addItem, countItem, removeItem } from '../player/inventory.js';
import { specials } from '../render/blocks.js';
import { lumpy } from '../render/forest.js';
import { debris, sparks } from '../render/particles.js';
import { scene } from '../render/renderer.js';
import { toast } from '../ui/hud.js';
import { iconImg, invOpen, refreshUI, renderCraftArea, slotHTML, ui } from '../ui/inventory-ui.js';

// ============================================================ kuchyně (sporák), pole a studna
// Sporák: vybereš recept v kuchařce, suroviny se spotřebují, nádobí musíš mít v batohu. Jídlo se vaří i se zavřeným oknem.
ui.kSel = 0;
export const kitchenMissing = (r) => {
  const miss = [];
  for (const [id, n] of Object.entries(r.in)) if (countItem(id) < n) miss.push(`${n - countItem(id)}× ${ITEMS[id].name}`);
  for (const t of r.tools) if (!countItem(t)) miss.push(ITEMS[t].name);
  return miss;
};
export function startCooking() {
  const st = stoveOf(ui.fireKey), r = KITCHEN[ui.kSel];
  if (st.recipe !== null) { toast('Na sporáku se už něco vaří'); return; }
  const out = st.slots[0];
  if (out && (out.id !== r.out || out.n + r.n > ITEMS[r.out].stack)) { toast('Nejdřív si vezmi hotové jídlo'); return; }
  const miss = kitchenMissing(r);
  if (miss.length) { toast('Chybí: ' + miss.join(', ')); return; }
  for (const [id, n] of Object.entries(r.in)) removeItem(id, n);
  for (const [id, n] of Object.entries(r.returns || {})) addItem(id, n, true);
  st.recipe = ui.kSel;
  st.t = 0;
  Sound.place();
  refreshUI();
}
let stoveRenderT = 0;
// Sporák ve světě: hrnec, žhnoucí plotna a pára (vaření samo je v shared/sim/machines.js); obnovení okna kuchařky.
export function stoveVisuals(dt) {
  for (const [k, st] of stoves) {
    if (blocks.get(k) !== 'stove') continue;
    const so = specials.get(k)?.obj.userData.stove;
    if (so) {
      const on = st.recipe !== null && KITCHEN[st.recipe].heat;
      so.pot.visible = on;
      so.burners[0].material.emissiveIntensity = on ? 0.9 + Math.sin(performance.now() / 120) * 0.15 : 0;
      so.glass.material.emissiveIntensity = on ? 0.8 : 0.05;
      if (on) so.lid.position.y = 0.165 + Math.abs(Math.sin(performance.now() / 90)) * 0.012; // poklička nadskakuje
    }
    if (st.recipe === null) continue;
    const r = KITCHEN[st.recipe], s = specials.get(k);
    if (s && r.heat && Math.random() < dt * 6) debris.emit(s.x + 0.5, s.ry + 1.05, s.z + 0.5, [0.85, 0.85, 0.85], 1, 0.4, 1.2); // pára
  }
  if (invOpen && ui.mode === 'kitchen' && (stoveRenderT -= dt) <= 0) { stoveRenderT = 0.15; renderCraftArea(); }
}
on('stoveDone', (k, r) => {
  const s = specials.get(k);
  Sound.pickup();
  if (s) sparks.emit(s.x + 0.5, s.ry + 1.1, s.z + 0.5, [1, 0.85, 0.5], 15, 1.5, 1.5);
  if (invOpen && ui.mode === 'kitchen' && ui.fireKey === k) toast(`Hotovo: ${ITEMS[r.out].name}`);
});
export function renderKitchen(area) {
  const st = stoveOf(ui.fireKey), r = KITCHEN[ui.kSel];
  const cooking = st.recipe !== null ? KITCHEN[st.recipe] : null;
  const p = cooking ? Math.min(100, (st.t / cooking.time) * 100) : 0;
  const ing = Object.entries(r.in).map(([id, n]) => `<div class="slot ${countItem(id) >= n ? '' : 'miss'}" data-item="${id}">${iconImg(id)}<b>${n}</b></div>`).join('');
  const tools = r.tools.map((t) => `<div class="slot ${countItem(t) ? 'have' : 'miss'}" data-item="${t}">${iconImg(t)}</div>`).join('') || '<span class="k-none">žádné</span>';
  const miss = kitchenMissing(r);
  area.innerHTML = `<div class="mc-title">Sporák · kuchyně</div>
    <div class="kitchen">
      <div class="k-head">${iconImg(r.out)}<div><div class="k-name">${ITEMS[r.out].name}${r.n > 1 ? ` ×${r.n}` : ''}</div>
        <div class="k-meta">${r.heat ? '🔥 na plotně / v troubě' : '🔪 příprava bez ohně'} · ⏱ ${r.time} s${ITEMS[r.out].food ? ` · sytost +${ITEMS[r.out].food}` : ''}</div></div></div>
      <div class="k-steps">${r.steps}</div>
      <div class="k-label">Suroviny</div><div class="k-row">${ing}</div>
      <div class="k-label">Nádobí (nespotřebuje se)</div><div class="k-row">${tools}</div>
      <div class="k-cook">
        <button class="mc-btn" data-cook-start ${miss.length || cooking ? 'disabled' : ''}>${cooking ? 'Vaří se…' : 'Vařit'}</button>
        <div class="parrow"><i style="width:${p}%"></i></div>
        ${slotHTML(st.slots[0], 0, 'out', 'kitchen')}
      </div>
      <div class="mc-note">${cooking ? `Vaří se: ${ITEMS[cooking.out].name}` : miss.length ? `Chybí: ${miss.join(', ')}` : 'Vše připraveno – klikni na Vařit.'}</div>
    </div>`;
}

// Pole: motykou zoráš zem, zasadíš semínka, plodina projde 4 fázemi růstu.
// Plodina povyrostla (shared/sim/machines.js): nový model.
on('cropGrew', (k) => { const s = specials.get(k); if (s) { scene.remove(s.obj); specials.delete(k); } });
// give(id, n) = kam úroda padá (při těžbě vyskočí jako předměty, client/src/world/ground-items.js dropper)
export function harvestCrop(type, k, give = addItem) {
  const c = crops.get(k), def = CROPS[type];
  crops.delete(k);
  if (c && c.stage >= 3) {
    for (const [id, a, b] of def.ripe) { const n = randInt(a, b); if (n) give(id, n); }
    Sound.pickup();
  } else give(def.seed, 1); // nezralá: vrátí se semínko
}
// Model plodiny podle druhu a fáze růstu (0–3)
export function buildCropModel(g, type, stage) {
  const k = (stage + 1) / 4;
  const green = new THREE.MeshStandardMaterial({ color: stage >= 3 && type === 'wheat_crop' ? 0xd8b040 : 0x4a9a2a, roughness: 0.9, side: THREE.DoubleSide });
  if (type === 'wheat_crop' || type === 'rice_crop') {
    for (let i = 0; i < 9; i++) {
      const h = 0.25 + k * 0.7, st = new THREE.Mesh(new THREE.BoxGeometry(0.04, h, 0.04), green);
      st.position.set(((i % 3) - 1) * 0.28, h / 2, (Math.floor(i / 3) - 1) * 0.28);
      st.rotation.z = (hash2(i, 3) - 0.5) * 0.3;
      g.add(st);
      if (stage >= 2) {
        const ear = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.07), new THREE.MeshStandardMaterial({ color: stage >= 3 ? (type === 'rice_crop' ? 0xf2ecd0 : 0xe8c450) : 0x9ac04a }));
        ear.position.set(st.position.x, h + 0.06, st.position.z);
        g.add(ear);
      }
    }
  } else {
    const leaf = new THREE.Mesh(lumpy(new THREE.IcosahedronGeometry(1, 1), 0.2, 4), new THREE.MeshStandardMaterial({ color: 0x3a8a2a, flatShading: true }));
    leaf.scale.set(0.3 * k + 0.1, 0.25 * k + 0.1, 0.3 * k + 0.1);
    leaf.position.y = leaf.scale.y;
    g.add(leaf);
    if (type === 'tomato_crop' && stage >= 2) {
      const red = new THREE.MeshStandardMaterial({ color: stage >= 3 ? 0xe03020 : 0x9ac04a, roughness: 0.4 });
      for (let i = 0; i < 5; i++) {
        const t = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), red);
        const a = i * 1.26;
        t.position.set(Math.cos(a) * 0.22, 0.2 + (i % 2) * 0.15, Math.sin(a) * 0.22);
        g.add(t);
      }
    }
  }
}
