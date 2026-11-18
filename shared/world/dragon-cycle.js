// Čas návratu draka patří světu, ne hráči. Skutečný čas běží i při odpojení nebo restartu.
export const DRAGON_RESPAWN_MS = 2 * 60 * 1000;
export const dragonCycle = { respawnAt: 0 };
export const DRAGON_VICTORY = 'Drak poražen! Odměna je tvoje. Máš 2 minuty na návrat portálem domů, potom se drak vrátí.';

export function loadDragonCycle(value) {
  dragonCycle.respawnAt = Number.isFinite(value) && value > 0 ? value : 0;
}
