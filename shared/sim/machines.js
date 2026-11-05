// Stroje, které pracují i se zavřeným oknem: táborák (pečení), pec (tavení s palivem), sporák (vaření) a pole (růst).
// Simuluje je ten, kdo drží svět; připojený hráč jen ukazuje stav od hostitele. Stroj s otevřeným oknem
// (isBusy) se mezitím nesimuluje, aby se předměty nezdvojily.
// Události pro prohlížeč: 'crafted' (id), 'fireDone', 'furnaceDone', 'stoveDone' (jiskry, zvuk), 'cropGrew', 'blocksChanged'.
import { COOKING, COOK_TIME, CROPS, FUEL, ITEMS, KITCHEN, SMELT_TIME, smeltResult } from '../data/index.js';
import { emit } from '../events.js';
import { NET, isBusy } from '../net/net.js';
import { bkey, blocks, crops, fires, furnaces, stoves } from '../world/state.js';

// Táboráky pečou i se zavřeným oknem.
// Táboráky pečou i se zavřeným oknem.
export function updateFires(dt) {
  for (const [k, f] of fires) {
    if (!blocks.has(k) || isBusy(k)) continue;
    const [inp, out] = f.slots;
    const res = inp && COOKING[inp.id];
    if (!res || (out && (out.id !== res || out.n >= ITEMS[res].stack))) { f.t = 0; continue; }
    f.t += dt;
    if (f.t < COOK_TIME) continue;
    f.t = 0;
    if (!--inp.n) f.slots[0] = null;
    if (out) out.n++; else f.slots[1] = { id: res, n: 1 };
    emit('crafted', res);
    emit('fireDone', k);
  }
}

// ============================================================ pec: tavení rud, písku a dalších surovin s palivem
// Políčka: [surovina, palivo, výsledek]. Palivo hoří i se zavřeným oknem; když nemá co tavit, nové palivo se nezapálí.
export function updateFurnaces(dt) {
  for (const [k, f] of furnaces) {
    if (blocks.get(k) !== 'furnace') { furnaces.delete(k); continue; }
    if (isBusy(k)) continue; // pec má otevřenou hráč
    const [inp, fuel, out] = f.slots;
    if ((inp?.id || null) !== (f.src ?? null)) { f.src = inp?.id || null; f.t = 0; } // jiná surovina = tavení začíná znovu
    const res = inp && smeltResult(inp.id);
    const can = res && (!out || (out.id === res && out.n < ITEMS[res].stack));
    if (f.burn > 0) f.burn = Math.max(0, f.burn - dt);
    if (can && f.burn <= 0 && fuel && FUEL[fuel.id]) { // zapálí další palivo
      f.burn = f.burnMax = FUEL[fuel.id];
      if (!--fuel.n) f.slots[1] = null;
    }
    if (can && f.burn > 0) {
      if ((f.t += dt) < SMELT_TIME) continue;
      f.t = 0;
      if (!--inp.n) f.slots[0] = null;
      if (out) out.n++; else f.slots[2] = { id: res, n: 1 };
      emit('crafted', res);
      emit('furnaceDone', k);
    } else f.t = Math.max(0, f.t - dt * 2);
  }
}

// Sporák: vybereš recept v kuchařce, suroviny se spotřebují, nádobí musíš mít v batohu. Jídlo se vaří i se zavřeným oknem.
export function updateStoves(dt) {
  for (const [k, st] of stoves) {
    if (blocks.get(k) !== 'stove') { if (!blocks.has(k)) stoves.delete(k); continue; }
    if (st.recipe === null) continue;
    const r = KITCHEN[st.recipe];
    if (!NET.client && !isBusy(k)) st.t += dt;
    if (NET.client || st.t < r.time) continue;
    if (st.slots[0]) st.slots[0].n += r.n; else st.slots[0] = { id: r.out, n: r.n };
    st.recipe = null;
    emit('crafted', r.out);
    emit('stoveDone', k, r);
  }
}

// Pole: plodina projde 4 fázemi růstu (jen na orné půdě).
let cropT = 0;
export function updateCrops(dt) {
  if ((cropT += dt) < 1) return;
  const step = cropT;
  cropT = 0;
  let changed = false;
  for (const [k, c] of crops) {
    const type = blocks.get(k);
    if (!type || !CROPS[type]) { crops.delete(k); continue; }
    if (c.stage >= 3) continue;
    const [x, y, z] = k.split(',').map(Number);
    if (blocks.get(bkey(x, y - 1, z)) !== 'farmland') continue; // roste jen na orné půdě
    if ((c.t += step) < c.next) continue;
    c.stage++;
    c.t = 0;
    c.next = 25 + Math.random() * 30;
    emit('cropGrew', k);
    changed = true;
  }
  if (changed) emit('blocksChanged');
}
