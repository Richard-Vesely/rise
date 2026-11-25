// Recepty zvuků: materiály (kroky, dopad, těžba, rozbití, položení), boj, předměty, jídlo, okna a drobnosti.
// Metody se přimíchají do Sound (this = Sound, viz sound.js). Žádné nahrávky: šum přes filtry + tóny.
const R = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a?.[Math.floor(Math.random() * a.length)]; // před spuštěním zvuku (bez kontextu) zrnka nejsou

// Jak hlasitý, vysoký a dlouhý je zvuk podle akce (jako v Minecraftu: těžba = 1/4 hlasitosti a nižší než rozbití).
export const KIND = {
  step: { v: 0.1, p: 1, len: 1 },
  land: { v: 0.2, p: 0.8, len: 1.4 },
  hit: { v: 0.13, p: 0.72, len: 0.8 },
  break: { v: 0.36, p: 0.85, len: 2 },
  place: { v: 0.3, p: 0.95, len: 1.15 },
};

// Jednotlivé materiály: v = hlasitost, p = výška (1 = základ), L = délka, k = druh akce.
const MAT = {
  stone(v, p, L, k) {
    this.burst({ dur: 0.055 * L, f0: 2600 * p, f1: 1500 * p, q: 1.5, vol: v, vary: 0 });
    this.tone(125 * p, 0.06 * L, v * 0.9, 'sine', 0, 70 * p, { attack: 0.003 });
    if (k === 'step') this.burst({ dur: 0.035, f0: 3000 * p, f1: 2000 * p, q: 1.6, vol: v * 0.55, delay: R(0.03, 0.055), vary: 0 });
    if (k === 'break') {
      this.burst({ buf: pick(this.grains), dur: 0.3, f0: 2200 * p, f1: 900 * p, q: 0.9, vol: v * 1.3, delay: 0.03, vary: 0 });
      this.burst({ dur: 0.3, f0: 900 * p, f1: 120, q: 0.7, vol: v * 0.6, type: 'lowpass', vary: 0 });
    }
  },
  grass(v, p, L, k) {
    const n = k === 'break' ? 3 : 2 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) this.burst({ dur: R(0.08, 0.12) * L, f0: R(3500, 6000) * p, f1: R(2000, 3000) * p, q: 0.6, vol: v * 0.7, type: 'highpass', attack: 0.015, delay: i * R(0.02, 0.05), vary: 0 });
    if (k !== 'step') this.burst({ dur: 0.07, f0: 600 * p, f1: 300, q: 0.7, vol: v * 0.4, type: 'lowpass', vary: 0 });
  },
  leaves(v, p, L) {
    for (let i = 0; i < 3; i++) this.burst({ dur: R(0.1, 0.18) * L, f0: R(2500, 4500) * p, f1: 1800 * p, q: 0.5, vol: v * 0.6, attack: 0.02, delay: i * R(0.03, 0.06), vary: 0 });
  },
  dirt(v, p, L, k) {
    this.burst({ dur: 0.09 * L, f0: R(700, 950) * p, f1: 420 * p, q: 0.8, vol: v * 1.3, type: 'lowpass', attack: 0.004, vary: 0 });
    this.tone(95 * p, 0.07, v * 0.5, 'sine', 0, 55, { attack: 0.004 });
    if (k === 'break' || k === 'place') this.burst({ buf: pick(this.grains), dur: 0.2, f0: 1400 * p, f1: 500, q: 0.8, vol: v * 1.1, type: 'lowpass', delay: 0.02, vary: 0 });
  },
  sand(v, p, L) {
    this.burst({ buf: pick(this.grains), dur: 0.14 * L, f0: 4200 * p, f1: 3000 * p, q: 0.7, vol: v * 2.2, type: 'highpass', vary: 0, rate: R(0.8, 1.25) });
    this.burst({ dur: 0.08 * L, f0: 1200 * p, f1: 500, q: 0.6, vol: v * 0.45, type: 'lowpass', vary: 0 });
  },
  snow(v, p, L, k) {
    this.burst({ buf: pick(this.grains), dur: 0.16 * L, f0: R(1800, 2800) * p, f1: 1200 * p, q: 0.8, vol: v * 2.4, type: 'lowpass', vary: 0, rate: R(0.6, 0.9) });
    if (k === 'step' && Math.random() < 0.6) this.tone(R(950, 1250) * p, 0.05, v * 0.1, 'triangle', R(0.03, 0.08), 1500 * p, { attack: 0.01 }); // vrznutí
  },
  wood(v, p, L, k) {
    this.burst({ dur: 0.07 * L, f0: R(380, 480) * p, f1: 300 * p, q: 6, vol: v * 2.2, vary: 0 });
    this.tone(180 * p, 0.08 * L, v * 0.75, 'triangle', 0, 140 * p, { attack: 0.002 });
    if (k === 'step') this.burst({ dur: 0.05, f0: 520 * p, f1: 380 * p, q: 5, vol: v * 1.1, delay: R(0.03, 0.055), vary: 0 });
    if (k === 'break') { this.burst({ dur: 0.25, f0: 3200 * p, f1: 300, q: 0.8, vol: v * 0.7, type: 'lowpass', delay: 0.02, vary: 0 }); this.tone(110 * p, 0.25, v * 0.5, 'triangle', 0.04, 70); }
  },
  metal(v, p, L, k) {
    const f = (k === 'step' ? R(280, 340) : R(480, 620)) * p;
    this.ring(f, (k === 'step' ? 0.28 : 0.6) * L, v * 0.55);
    this.burst({ dur: 0.012, f0: 5000 * p, f1: 3500 * p, q: 1.2, vol: v * 0.8, type: 'highpass', vary: 0 });
    if (k === 'break') this.ring(f * 1.37, 0.5, v * 0.35, 0.07);
  },
  glass(v, p, L, k) {
    this.tone(R(2600, 4600) * p, 0.12 * L, v * 0.32, 'sine', 0, 0, { attack: 0.002 });
    this.burst({ dur: 0.012, f0: 7000 * p, f1: 5000, q: 1, vol: v * 0.7, type: 'highpass', vary: 0 });
    if (k === 'break') { // tříštění: střepy dopadají
      for (let i = 0; i < 6; i++) this.tone(R(2500, 6000) * p, R(0.05, 0.12), v * 0.16, 'sine', R(0.02, 0.22), 0, { attack: 0.002 });
      this.burst({ dur: 0.3, f0: 6000, f1: 2500, q: 0.6, vol: v * 0.5, type: 'highpass', vary: 0 });
    }
  },
  crystal(v, p, L, k) {
    MAT.glass.call(this, v * 0.8, p, L, k === 'break' ? 'break' : k);
    [1, 1.5, 2.25].forEach((r, i) => this.tone(1320 * p * r, 0.5 * L, v * 0.1, 'sine', i * 0.03, 0, { attack: 0.004 })); // zvonivý třpyt
    if (k === 'break') [0, 1, 2, 3].forEach((i) => this.tone(880 * p * 1.5 ** i, 0.35, v * 0.08, 'triangle', 0.08 + i * 0.06));
  },
  water(v, p, L, k) {
    this.burst({ dur: 0.18 * L, f0: 2200 * p, f1: 380 * p, q: 0.8, vol: v * 1.4, type: 'lowpass', attack: 0.01, vary: 0 });
    const n = k === 'step' ? 1 + (Math.random() < 0.5) : 3;
    for (let i = 0; i < n; i++) this.tone(R(280, 420) * p, 0.04, v * 0.22, 'sine', R(0.02, 0.12), R(800, 1000) * p, { attack: 0.004 }); // bublinky
  },
};
export const MATERIAL_NAMES = Object.keys(MAT);
// Vyvážení: tlumené materiály (hlína, sníh, dřevo) potřebují víc, aby zněly stejně hlasitě jako tráva (měřeno RMS).
const MAT_GAIN = { stone: 1.5, grass: 0.75, leaves: 0.9, dirt: 1.9, sand: 1.8, snow: 2.2, wood: 1.6, metal: 0.8, glass: 1.4, crystal: 1, water: 1.1 };

export const SFX = {
  // Zvuk materiálu: druh 'step' | 'land' | 'hit' | 'break' | 'place'; gain násobí hlasitost.
  mat(mat, kind = 'step', gain = 1) {
    const fn = MAT[mat] || MAT.stone, K = KIND[kind] || KIND.step;
    fn.call(this, K.v * gain * (MAT_GAIN[mat] || 1) * R(0.85, 1.15), K.p * R(0.9, 1.1), K.len, kind);
  },
  footstep(mat, run = false) { this.mat(mat, 'step', run ? 1.2 : 1); },
  // Dopad po pádu: čím rychleji padal, tím hlasitější (a dunivý úder pod tím).
  land(mat, speed) {
    const k = Math.min(1, Math.max(0.25, (speed - 5) / 10));
    this.mat(mat, mat === 'water' ? 'break' : 'land', 0.6 + k);
    this.tone(85, 0.12 + k * 0.1, 0.12 + k * 0.25, 'sine', 0, 42, { attack: 0.003 });
  },
  blockHit(mat, tool) {
    this.mat(mat, 'hit');
    if (tool === 'pick' && mat !== 'dirt' && mat !== 'sand' && mat !== 'grass' && mat !== 'snow' && mat !== 'leaves') this.tone(R(2300, 2700), 0.045, 0.045, 'triangle', 0, 0, { attack: 0.002 }); // cinknutí krumpáče
  },
  blockBreak(mat) { this.mat(mat, 'break'); },
  blockPlace(mat) { this.mat(mat, 'place'); },
  // Úder do něčeho, co jde vytěžit jen lepším nástrojem: tupé ťuknutí.
  denied() { this.tone(160, 0.08, 0.14, 'triangle', 0, 120, { attack: 0.002 }); this.burst({ dur: 0.04, f0: 900, f1: 500, q: 2, vol: 0.06 }); },

  // ---------- boj a pohyb
  // Odraz: krátké zašustění podrážky podle povrchu a tichý svist, žádné arkádové pípnutí.
  jump(mat = 'grass') {
    this.mat(mat, 'step', 0.45);
    this.burst({ dur: 0.13, f0: 600, f1: 1800, q: 0.7, vol: 0.035, attack: 0.02 });
  },
  swing() { this.burst({ dur: R(0.16, 0.22), f0: 450, f1: R(2000, 2800), q: 1.4, vol: 0.16, attack: 0.05 }); },
  hit() { this.burst({ dur: 0.16, f0: 1400, f1: 200, q: 1, vol: 0.45, type: 'lowpass' }); this.tone(140, 0.16, 0.22, 'square', 0, 60, { vary: 0.08 }); this.tone(90, 0.12, 0.3, 'sine', 0, 50, { attack: 0.002 }); },
  kill() { this.tone(260, 0.5, 0.14, 'sawtooth', 0, 50, { vary: 0.08 }); this.burst({ dur: 0.5, f0: 3000, f1: 300, q: 0.7, vol: 0.28 }); },
  hurt() { this.tone(95, 0.3, 0.32, 'sawtooth', 0, 55, { vary: 0.06 }); this.burst({ dur: 0.2, f0: 800, f1: 150, q: 1, vol: 0.32, type: 'lowpass' }); },
  step() { this.footstep('grass'); }, // starý název (kroky podle materiálu: footstep)
  chop() { this.mat('wood', 'hit', 1.4); },
  mine() { this.mat('stone', 'hit', 1.3); this.tone(R(2300, 2700), 0.045, 0.045, 'triangle', 0, 0, { attack: 0.002 }); },
  rustle() { this.mat('grass', 'hit', 1.2); },
  crack() { this.burst({ dur: 0.6, f0: 1500, f1: 120, q: 0.7, vol: 0.4, type: 'lowpass' }); this.tone(80, 0.4, 0.16, 'triangle', 0.05, 40, { vary: 0.1 }); },
  place() { this.mat('wood', 'place', 0.8); },
  // Skok do vody, plavání
  splash(big = 1) {
    this.burst({ dur: 0.45 * big, f0: 3000, f1: 300, q: 0.6, vol: 0.28 * big, type: 'lowpass', attack: 0.01 });
    this.burst({ dur: 0.3, f0: 6000, f1: 2500, q: 0.5, vol: 0.08 * big, type: 'highpass', delay: 0.03 });
    for (let i = 0; i < 6; i++) this.tone(R(250, 500), 0.05, 0.05, 'sine', R(0.05, 0.4), R(700, 1200), { attack: 0.004, prio: 0 });
  },
  swim() { this.burst({ dur: 0.35, f0: 1500, f1: 350, q: 0.7, vol: 0.09, type: 'lowpass', attack: 0.08 }); },
  // Výstup na břeh: odtečení vody a pár kapek z mokrých bot.
  waterExit() {
    this.burst({ dur: 0.2, f0: 1700, f1: 450, q: 0.7, vol: 0.065, type: 'lowpass', attack: 0.015 });
    for (let i = 0; i < 3; i++) this.tone(R(650, 900), 0.06, 0.025, 'sine', 0.06 + i * 0.07, R(250, 400), { attack: 0.003 });
  },

  // ---------- předměty
  // Sebrání: krátké vysoké "plip" s náhodnou výškou (Minecraft: 1,6–3,4×)
  plip() { const f = 520 * R(1.6, 3.4); this.tone(f, 0.07, 0.09, 'sine', 0, f * 1.3, { attack: 0.003 }); this.tone(f * 2, 0.04, 0.025, 'sine', 0.01, 0, { attack: 0.003 }); },
  pop() { this.plip(); },
  toss() { this.burst({ dur: 0.18, f0: 600, f1: 1800, q: 1.2, vol: 0.08, attack: 0.04 }); this.tone(R(500, 700), 0.06, 0.06, 'sine', 0.02, 380, { attack: 0.003 }); },
  pickup() { [880, 1109, 1319, 1760].forEach((f, i) => this.tone(f, 0.6, 0.1, 'sine', i * 0.07)); },
  craft() { this.tone(523, 0.12, 0.1, 'triangle'); this.tone(784, 0.2, 0.1, 'triangle', 0.08); this.tone(1568, 0.25, 0.025, 'sine', 0.1); },
  // Rozbitý nástroj: prasknutí, cinknutí a střípky
  toolBreak() {
    this.burst({ dur: 0.07, f0: 4000, f1: 1500, q: 0.8, vol: 0.5, type: 'highpass', vary: 1 });
    this.ring(R(700, 900), 0.4, 0.25);
    for (let i = 0; i < 4; i++) this.tone(R(2500, 5000), 0.06, 0.06, 'sine', 0.1 + i * R(0.05, 0.1), 0, { attack: 0.002 });
  },
  // Truhla: vrznutí víka a dřevěné ťuknutí
  chest() { this.tone(R(140, 170), 0.35, 0.06, 'sawtooth', 0, R(100, 120), { vib: [R(18, 26), 6], filter: ['bandpass', 700, 3], attack: 0.04 }); this.mat('wood', 'place', 0.6); },
  // Nalití / nabrání tekutiny (kbelík, mléko, palivo)
  pour() { this.burst({ dur: 0.4, f0: 600, f1: 1400, q: 1.5, vol: 0.12, type: 'bandpass', attack: 0.05 }); for (let i = 0; i < 4; i++) this.tone(R(300, 500), 0.05, 0.04, 'sine', 0.05 + i * R(0.06, 0.1), R(800, 1100), { attack: 0.004 }); },
  portal() { [220, 277, 330, 440, 554, 660].forEach((f, i) => this.tone(f, 2.2, 0.06, 'triangle', i * 0.1)); this.burst({ dur: 1.6, f0: 200, f1: 4000, q: 2, vol: 0.15 }); },
  // stroj poblíž se rozběhl (machines/power.js): stoupající elektrický „vzzum“ a třpyt hologramu
  powerUp() {
    const k = R(0.92, 1.08);
    this.tone(180 * k, 0.4, 0.04, 'sawtooth', 0, 520 * k, { attack: 0.02, filter: ['lowpass', 1800, 0.7] });
    this.tone(880 * k, 0.25, 0.02, 'sine', 0.12, 1320 * k, { attack: 0.01 });
    this.tone(1760 * k, 0.18, 0.01, 'triangle', 0.2, 2200 * k, { attack: 0.01 });
  },

  // ---------- jídlo
  // Kousnutí: křupavé jídlo chroupe, polévka a pití srká.
  bite(id = '') {
    if (/soup|milk|juice|tea|water|stew|goulash|broth|drink|cocoa|coffee/.test(id)) this.burst({ dur: 0.18, f0: 900, f1: 2200, q: 2.5, vol: 0.1, attack: 0.04 });
    else { this.burst({ buf: pick(this.grains), dur: 0.09, f0: R(1600, 2400), f1: 800, q: 1.2, vol: 0.32, rate: R(0.7, 1.1) }); this.burst({ dur: 0.06, f0: 700, f1: 300, q: 1, vol: 0.08, type: 'lowpass' }); }
  },
  // Dojedeno: polknutí
  eat() { this.tone(R(260, 320), 0.12, 0.12, 'sine', 0, 120, { attack: 0.01 }); this.burst({ dur: 0.08, f0: 500, f1: 250, q: 3, vol: 0.06, delay: 0.04 }); },

  // ---------- okna a ovládání (tiché, ať neruší)
  ui(kind) {
    switch (kind) {
      case 'click': this.tone(1800, 0.015, 0.045, 'sine', 0, 0, { attack: 0.001 }); break;
      case 'hover': this.tone(3200, 0.01, 0.008, 'sine', 0, 0, { attack: 0.001, prio: 0 }); break;
      case 'open': this.tone(660, 0.06, 0.05, 'triangle', 0, 0, { attack: 0.003 }); this.tone(990, 0.09, 0.05, 'triangle', 0.055, 0, { attack: 0.003 }); break;
      case 'close': this.tone(880, 0.06, 0.045, 'triangle', 0, 0, { attack: 0.003 }); this.tone(587, 0.09, 0.045, 'triangle', 0.05, 0, { attack: 0.003 }); break;
      case 'pick': this.burst({ dur: 0.03, f0: 2400, f1: 1800, q: 2, vol: 0.07 }); this.tone(R(700, 760), 0.03, 0.03, 'sine', 0, 900, { attack: 0.002 }); break;
      case 'put': this.burst({ dur: 0.035, f0: 1300, f1: 900, q: 2, vol: 0.08 }); this.tone(R(420, 470), 0.04, 0.04, 'sine', 0, 330, { attack: 0.002 }); break;
      case 'select': this.tone(R(1150, 1250), 0.018, 0.02, 'sine', 0, 0, { attack: 0.001, prio: 0 }); break;
      case 'error': this.tone(180, 0.12, 0.06, 'square', 0, 150, { filter: ['lowpass', 900, 1] }); break;
    }
  },
};
