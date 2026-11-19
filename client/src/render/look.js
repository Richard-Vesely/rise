// Vzhled grafiky „Jasná budoucnost“ a co z něj zapne která kvalita (Grafika: nízká / střední / vysoká).
// Jen čísla a přepínače, žádné vedlejší účinky: čtou je renderer, obloha, den a noc, stíny, voda, les, počasí a post-processing.
// Parametry jdou ladit za běhu (game.LK v konzoli prohlížeče).
import { GPU, QUALITY } from '../game/prefs.js';

/**
 * Pravidla vzhledu: příroda skoro realistická (světlo, materiály), tvary jemně stylizované; syté barevné světlo má jen technika.
 * Pevné barvy světel: azurová = elektřina a technika, jantarová = oheň (teplá bílá na povrchu), purpurová = Markova dimenze
 * a vzácné věci, zelená = jen kontrolky „v pořádku“. Čitelnost má přednost: nic v hratelném prostoru není úplně černé.
 *
 * exposure: celkový jas; sun / amb: síla slunce a okolního světla (amb ≈ 30–35 % slunce), ambTint: barva okolního světla
 * skyAmb / groundAmb: světlo shora a odraz od země; moon: síla měsíce (díl slunce), nightAmb: okolní světlo v noci, caveAmb: v jeskyni
 * fog: hustota (× nastavení grafiky), falloff: řídnutí s výškou (1/m), scatter: záře slunce v mlze, skyHaze: opar na obloze u obzoru
 * bloom: záře světel; ao: zastínění koutů a spár (jen vysoká se samostatnou kartou); shafts: sluneční paprsky (vysoká)
 * grade: barevné ladění (power / agxSat = kontrast a sytost uvnitř AgX, hue = ochrana odstínu (zelená tráva zůstane zelená),
 *   sat / contrast = po tónování, cool / warm = studené stíny a teplá světla, vignette = ztmavení rohů, nightTint = barva měsíčního světla,
 *   lift = zvednutí nejtmavších míst ve dne / v noci a v jeskyni, aby nic nebylo úplně černé)
 * adapt: přizpůsobení oka (EV navíc v noci a v jeskyni, rychlost v s)
 * shadow: soft = měkkost okrajů (texely), strength = jak tmavý je stín
 * water: mělká / hluboká barva, pěna, drsnost; clouds: pokrytí, měkkost, jas; sky: zákal, modř, jas oblohy
 * normals: hloubka reliéfu textur zblízka, wind: vítr v korunách, glow: síla svítících věcí, sss: prosvítání listí a trávy proti slunci
 * neon: svítící pulzy v kabelech pod proudem, foliage: sytost trávy a listí, leaves: jas korun, torch: barva světla ohně
 */
export const LK = {
  name: 'Jasná budoucnost', tone: 'agx', exposure: 0.85,
  sun: 1.1, amb: 1.12, ambTint: [0.92, 0.95, 1.1], skyAmb: [1.0, 1.0, 1.06], groundAmb: [0.6, 0.55, 0.45],
  moon: 0.11, nightAmb: [0.07, 0.09, 0.15], caveAmb: [0.55, 0.66, 0.88],
  fog: { density: 0.6, falloff: 0.026, scatter: 0.7, skyHaze: 0.32, tint: [0.92, 0.96, 1.04] },
  bloom: { intensity: 0.7, threshold: 1.45, smoothing: 0.3, radius: 0.78 },
  ao: { intensity: 1.5, radius: 0.6 }, shafts: 0.5,
  grade: { power: 1.25, agxSat: 1.3, hue: 0.55, sat: 1.1, contrast: 1.05, cool: [0.94, 0.98, 1.06], warm: [1.03, 1.0, 0.95], vignette: 0.14, nightTint: [0.43, 0.55, 0.77], lift: [0.003, 0.0125] },
  adapt: { night: 0.8, cave: 1.2, speed: 1.5 },
  shadow: { soft: 2.2, strength: 0.8 },
  water: { shallow: [0.12, 0.55, 0.6], deep: [0.055, 0.227, 0.267], foam: 0.7, rough: 0.05 },
  clouds: { cover: 0.6, soft: 0.18, bright: 1.05 }, sky: { turbidity: 3.0, rayleigh: 1.8, gain: 0.42 },
  normals: 1.2, wind: 1.1, glow: 1.3, sss: 0.65, neon: 1.0, foliage: 1.05, leaves: 0.82, grain: 0,
  torch: [1.0, 0.77, 0.54], // #FFC58A – teplá bílá (asi 3000 K), ne červená
};

// Co která kvalita zapne. Nízká zůstává levná (CI kreslí softwarovým WebGL): žádný post-processing ani stíny.
// Na integrované grafice (Intel, AMD v procesoru) má vysoká menší stíny a bez zastínění koutů, aby držela 60 fps.
const HIGH = QUALITY === 'high', MID = QUALITY === 'medium', DISCRETE = GPU === 'discrete';
export const FX = {
  quality: QUALITY, gpu: GPU,
  post: HIGH || MID,                          // EffectComposer: záře, mlha s výškou, tónování, barevné ladění
  shadows: HIGH || MID,                       // stíny od slunce a měsíce
  shadowSize: HIGH && DISCRETE ? 2048 : 1024, // rozlišení mapy stínů
  shadowRange: HIGH ? 56 : 38,                // poloměr oblasti se stíny kolem hráče (m)
  shadowHz: HIGH ? 30 : 20,                   // jak často se stíny překreslí
  ao: HIGH && DISCRETE,                       // N8AO (polovina rozlišení)
  shafts: HIGH,                               // paprsky v mlze (ze stínové mapy, 16 kroků, jen při pohledu ke slunci)
  clouds: HIGH || MID,                        // vrstva mraků na obloze
  msaa: HIGH ? 2 : 0,                         // vyhlazování hran v composeru (střední: FXAA)
  fxaa: MID,
  minScale: HIGH ? 0.6 : 0.7,                 // dynamické rozlišení: nejmenší zmenšení
  leafCards: HIGH ? 70 : MID ? 45 : 0,        // do jaké vzdálenosti mají koruny lístky (m)
  rain: HIGH ? 9000 : MID ? 6000 : 2500,      // kapek deště kolem hráče
  ridge: HIGH || MID,                         // vzdálené pásmo hor na obzoru
};

// Násobek svítivosti (emissive, záře plamenů a krystalů), aby světla s post-processingem zářila (bloom). Bez něj 1.
export const GLOW = FX.post ? 3.2 * LK.glow : 1;
