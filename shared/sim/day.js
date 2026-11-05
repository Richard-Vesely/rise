// Den a noc: čas dne (0 = půlnoc, 0,25 = východ, 0,5 = poledne) a počítadlo dní.
// Soumrak a svítání (slunce do ~22° pod obzorem, 18:00–19:30 a 4:30–6:00) ubíhají stejně rychle jako den, aby byly
// vidět červánky. Hluboká noc ubíhá rychleji (NIGHT_FAST×), takže noc jako celek trvá stejně dlouho jako dřív
// (dřív ubíhala celá noc dvakrát rychleji).
import { smoothstep } from '../util.js';
import { DAY_LENGTH } from '../world/constants.js';

export let dayTime = 0.3, dayCount = 1;
export function setDay(t, count = dayCount) { dayTime = t; dayCount = count; }
// Výška slunce nad obzorem (-1 až 1).
const elevAt = (t) => Math.sin((t - 0.25) * Math.PI * 2);
export const sunElevation = () => elevAt(dayTime);
// Jak rychle ubíhá čas při dané výšce slunce: ve dne a za soumraku 1×, v hluboké noci NIGHT_FAST×.
const deep = (elev) => 1 - smoothstep(-0.5, -0.3, elev);
export let NIGHT_FAST = 2;
export const timeSpeed = (elev) => (elev >= 0 ? 1 : 1 + (NIGHT_FAST - 1) * deep(elev));
// NIGHT_FAST se dopočítá tak, aby noc (slunce pod obzorem) trvala skutečně DAY_LENGTH / 4 jako dřív.
{
  const N = 2000, target = N / 2; // noc = půl dne; skutečný čas ∝ Σ 1 / rychlost, dřív (rychlost 2) to bylo N / 2
  let lo = 1, hi = 20;
  for (let it = 0; it < 50; it++) {
    const k = (lo + hi) / 2;
    let sum = 0;
    for (let i = 0; i < N; i++) sum += 1 / (1 + (k - 1) * deep(elevAt(0.75 + (i + 0.5) / N * 0.5)));
    if (sum > target) lo = k; else hi = k;
  }
  NIGHT_FAST = (lo + hi) / 2;
}
// Posune čas dne o dt sekund.
export function advanceDay(dt) {
  dayTime += (dt / DAY_LENGTH) * timeSpeed(sunElevation());
  if (dayTime >= 1) { dayTime -= 1; dayCount++; }
}
// Jak moc je den (0–1) a noc (1 – den).
export function daylight() {
  const day = smoothstep(-0.12, 0.12, sunElevation());
  return { day, night: 1 - day };
}
