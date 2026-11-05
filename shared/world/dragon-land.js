// Země draka je daleko na západě, podobně jako Markova dimenze na východě.
import { smoothstep } from '../util.js';

export const DRAGON_X = -20000, DRAGON_CX = -40000;
export const isDragon = (x) => x < DRAGON_X;
export const DRAGON_HOME = { x: 16, z: 0, dragon: true, returnHome: false };
export const DRAGON_SHRINE = { x: DRAGON_CX, z: 0, dragon: true, returnHome: true };
export const DRAGON_DEN = { type: 'dragon_den', key: 'dragon-den-v1', x: DRAGON_CX, z: -72 };
// Rovné údolí pro portál a jeskyni, za ním skalnaté hory. Dvojče je v render/glsl.js.
export function dragonHeight(x, z) {
  const dx = x - DRAGON_CX, r = Math.hypot(dx, z);
  return smoothstep(110, 200, r) * (12 + 8 * Math.sin(dx * 0.035) ** 2 + 9 * Math.cos(z * 0.028) ** 2);
}
