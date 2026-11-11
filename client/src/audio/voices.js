// Hlasy tvorů: zvířata a příšery (mobVoice), ptáci, cvrčci, sovy, žáby, kapky v jeskyni, láva, Markova dimenze.
// Metody se přimíchají do Sound (this = Sound). Pozici zvuku určuje Sound.at(x, y, z, () => Sound.bird('pěnice')).
const R = (a, b) => a + Math.random() * (b - a);
const P0 = { prio: 0 }; // zvuky okolí ustoupí důležitějším

export const BIRDS = ['warbler', 'tit', 'cuckoo', 'dove', 'woodpecker', 'jungle', 'parrot'];

export const VOICES = {
  // ---------- tvorové (stejné zvuky u hostitele i u připojených hráčů)
  mobVoice(type) {
    switch (type) {
      case 'sheep': { const f = R(380, 450); this.tone(f, 0.5, 0.05, 'sawtooth', 0, f * 0.86, { vib: [7, 14], filter: ['bandpass', 1300, 1.2] }); this.tone(f * 1.01, 0.5, 0.035, 'sawtooth', 0.02, f * 0.87, { vib: [6, 10], filter: ['bandpass', 2400, 2] }); break; }
      case 'cow': this.tone(R(120, 140), 1.1, 0.12, 'sawtooth', 0, R(90, 100), { attack: 0.15, filter: ['bandpass', 420, 1.6] }); this.tone(R(240, 260), 1, 0.035, 'sawtooth', 0.05, 190, { attack: 0.2, filter: ['bandpass', 900, 2] }); break;
      case 'chicken': for (let i = 0; i < 3 + (Math.random() < 0.4); i++) this.tone(R(650, 900), R(0.05, 0.08), 0.05, 'square', i * R(0.08, 0.12), 520, { filter: ['bandpass', 1400, 2] }); break;
      case 'wolf': this.tone(R(360, 400), 1.6, 0.06, 'sine', 0, R(520, 560), { attack: 0.3, vib: [5, 8] }); this.tone(R(370, 395), 1.6, 0.035, 'triangle', 0.05, 530, { attack: 0.3 }); break;
      case 'deer': this.burst({ dur: 0.25, f0: 1200, f1: 500, q: 1.5, vol: 0.06, attack: 0.03 }); break; // odfrknutí
      case 'boar': for (let i = 0; i < 2; i++) { this.tone(R(100, 120), 0.18, 0.1, 'sawtooth', i * 0.2, 70, { filter: ['lowpass', 600, 2] }); this.burst({ dur: 0.15, f0: 800, f1: 300, q: 2, vol: 0.05, delay: i * 0.2 }); } break;
      case 'crawler': this.tone(R(70, 100), 0.6, 0.11, 'sawtooth', 0, 45, { filter: ['lowpass', 500, 4], vib: [11, 6] }); this.burst({ dur: 0.5, f0: 600, f1: 200, q: 3, vol: 0.04, attack: 0.1 }); break;
      case 'markoman': this.tone(R(150, 190), 0.5, 0.07, 'square', 0, 90, { filter: ['bandpass', 800, 4], am: [34, 0.8] }); this.tone(R(600, 700), 0.3, 0.02, 'sine', 0.1, 1200, { vib: [12, 40] }); break;
      case 'golem': this.tone(55, 0.9, 0.16, 'sawtooth', 0, 40, { filter: ['lowpass', 220, 2], attack: 0.1 }); [1760, 2637, 3520].forEach((f, i) => this.tone(f, 0.6, 0.02, 'sine', 0.15 + i * 0.07)); break;
      case 'dragon': this.tone(85, 1.1, 0.18, 'sawtooth', 0, 38, { attack: 0.08, vib: [16, 12], filter: ['lowpass', 650, 2] }); this.burst({ dur: 0.9, f0: 1100, f1: 170, q: 1.2, vol: 0.16, attack: 0.08 }); break;
      default: this.tone(110, 0.25, 0.1, 'sawtooth', 0, 70, { filter: ['lowpass', 700, 1] });
    }
  },
  // Těžký krok krystalového golema
  stomp() { this.tone(R(50, 60), 0.25, 0.25, 'sine', 0, 32, { attack: 0.004 }); this.burst({ dur: 0.18, f0: 500, f1: 90, q: 0.8, vol: 0.12, type: 'lowpass' }); },

  // ---------- ptáci (den): FM cvrlikání 3–6 kHz s rychlými záchvěvy
  bird(kind) {
    switch (kind) {
      case 'warbler': { // pěnice: rychlý trylek
        let t = 0;
        for (let i = 0, n = 4 + Math.floor(Math.random() * 6); i < n; i++) { const f = R(3000, 5800); this.tone(f, R(0.04, 0.09), 0.022, 'sine', t, f * R(0.75, 1.35), { vib: [R(30, 60), R(100, 300)], attack: 0.005, ...P0 }); t += R(0.06, 0.11); }
        break;
      }
      case 'tit': { const f = R(4600, 5400); for (let i = 0; i < 3; i++) { this.tone(f, 0.09, 0.02, 'sine', i * 0.32, f * 0.97, { attack: 0.006, ...P0 }); this.tone(f * 0.72, 0.08, 0.018, 'sine', i * 0.32 + 0.13, 0, { attack: 0.006, ...P0 }); } break; } // sýkorka: tý-ťa
      case 'cuckoo': { const f = R(640, 690); this.tone(f, 0.22, 0.035, 'sine', 0, f * 0.98, { attack: 0.03, ...P0 }); this.tone(f * 0.82, 0.32, 0.035, 'sine', 0.3, 0, { attack: 0.03, ...P0 }); break; } // kukačka: ku-kú
      case 'dove': for (const [d, f, l] of [[0, 520, 0.25], [0.3, 560, 0.4], [0.8, 500, 0.3]]) this.tone(f, l, 0.02, 'sine', d, f * 0.94, { attack: 0.06, vib: [6, 6], ...P0 }); break; // hrdlička
      case 'woodpecker': { const n = 10 + Math.floor(Math.random() * 8); for (let i = 0; i < n; i++) this.burst({ dur: 0.02, f0: 1100, f1: 800, q: 5, vol: 0.05 * (1 - i / n / 2), delay: i / 17, vary: 0, ...P0 }); break; } // datel
      case 'jungle': for (let i = 0; i < 2; i++) this.tone(R(800, 1000), 0.25, 0.03, 'sine', i * 0.35, R(1700, 2100), { attack: 0.02, vib: [9, 30], ...P0 }); break; // houkání
      case 'parrot': this.tone(R(1100, 1400), 0.18, 0.025, 'sawtooth', 0, R(800, 900), { filter: ['bandpass', 2200, 3], vib: [40, 120], ...P0 }); break; // papoušek
      case 'hawk': this.tone(R(2300, 2600), 0.7, 0.025, 'sawtooth', 0, 1500, { filter: ['bandpass', 2600, 4], attack: 0.05, vib: [25, 60], ...P0 }); break; // jestřáb nad pouští
    }
  },
  // ---------- noc
  // Cvrček: 4,5 kHz přerušovaný 30× za sekundu, ve skupinách po třech.
  cricket() {
    const f = R(4300, 4800), reps = 1 + Math.floor(Math.random() * 3);
    for (let r = 0; r < reps; r++) for (let i = 0; i < 3; i++) this.tone(f, 0.028, 0.012, 'sine', r * R(0.25, 0.35) + i * 0.033, 0, { attack: 0.004, ...P0 });
  },
  owl() { const f = R(330, 370); for (const [d, l] of [[0, 0.4], [0.55, 0.18], [0.78, 0.5]]) this.tone(f, l, 0.04, 'sine', d, f * 0.94, { attack: 0.07, ...P0 }); }, // výr: hů… hu-hů
  frog() { this.tone(R(120, 160), R(0.18, 0.3), 0.14, 'sawtooth', 0, 110, { filter: ['bandpass', R(600, 900), 3], am: [R(18, 26), 0.9], ...P0 }); },
  // ---------- jeskyně, sopka, Markova dimenze, pod vodou
  drip() { const f = R(700, 1100); this.tone(f, 0.05, 0.05, 'sine', 0, f * 2, { attack: 0.002, ...P0 }); },
  rumble() { this.burst({ dur: 1.4, f0: 300, f1: 60, q: 0.7, vol: 0.06, type: 'lowpass', attack: 0.2, vary: 1, ...P0 }); this.burst({ buf: this.grains?.[0], dur: 0.25, f0: 900, f1: 400, q: 1, vol: 0.05, delay: R(0.2, 0.6), ...P0 }); },
  lavaPop() { this.tone(R(70, 120), 0.12, 0.08, 'sine', 0, 40, { attack: 0.004, ...P0 }); this.burst({ dur: 0.1, f0: 600, f1: 200, q: 1, vol: 0.05, type: 'lowpass', ...P0 }); },
  alien() { this.tone(R(250, 400), R(1, 1.6), 0.025, 'sine', 0, R(1600, 2600), { vib: [R(5, 9), 60], attack: 0.3, ...P0 }); this.tone(R(800, 1200), 1.2, 0.012, 'triangle', 0.3, 300, { attack: 0.4, ...P0 }); },
  bubble() { this.tone(R(400, 700), 0.05, 0.03, 'sine', 0, R(1000, 1500), { attack: 0.004, ...P0 }); },
  // Hrom: nejdřív praskot, pak dlouhé dunění (zpoždění podle vzdálenosti blesku, zvuk letí 343 m/s).
  thunder(dist = 300) {
    const d = Math.min(3, dist / 343), k = Math.max(0.3, 1 - dist / 2500);
    if (dist < 600) this.burst({ dur: 0.4, f0: 5000, f1: 800, q: 0.5, vol: 0.25 * k, type: 'lowpass', delay: d });
    this.burst({ buf: this.brown, dur: R(3, 7), f0: 400 * k + 150, f1: 50, q: 0.6, vol: 0.55 * k, type: 'lowpass', attack: 0.15, delay: d + 0.05, vary: 0 });
    this.burst({ buf: this.brown, dur: R(2, 4), f0: 250, f1: 40, q: 0.6, vol: 0.4 * k, type: 'lowpass', attack: 0.4, delay: d + R(0.6, 1.5), vary: 0 });
  },
};
