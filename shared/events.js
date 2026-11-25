// Události z herních pravidel pro prohlížeč (zvuky, jiskry, překreslení). Pravidla v shared/ nic nekreslí,
// jen ohlásí, co se stalo: emit('mobHit', m). Prohlížeč poslouchá: on('mobHit', (m) => …). Server poslouchá jen mobKilled (vězení, server/world-worker.js).
const handlers = new Map();

/** Přihlásí se k odběru události. */
export function on(type, fn) {
  if (!handlers.has(type)) handlers.set(type, []);
  handlers.get(type).push(fn);
}

/** Ohlásí událost všem odběratelům. */
export function emit(type, ...args) {
  const list = handlers.get(type);
  if (list) for (const fn of list) fn(...args);
}
