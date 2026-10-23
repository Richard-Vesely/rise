// Zvuky nástrojů a boje (syntetizované): rozbitý nástroj, oprava, máchnutí, zásah, kritický zásah, obláček, vytažení nástroje.
// Zvuky materiálů při těžbě, rozbití a stavění jsou v audio/sfx.js (Sound.blockHit / blockBreak / blockPlace).
import { Sound, rnd } from './sound.js';

/** Zvuky nástrojů a boje (strength 0–1 = síla úderu podle nabití). */
export function toolSound(name, strength = 1) {
  const S = Sound;
  if (!S.ctx) return;
  const p = rnd(0.9, 1.1);
  switch (name) {
    case 'snap': // nástroj se rozbil: prasknutí + cinknutí úlomků
      S.burst({ dur: 0.09, f0: 3200 * p, f1: 700, q: 1.2, vol: 0.7 });
      S.tone(1900 * p, 0.18, 0.16, 'triangle', 0, 700);
      S.tone(140 * p, 0.2, 0.35, 'sine', 0, 60);
      for (let i = 0; i < 4; i++) S.tone(rnd(2400, 4200), 0.12, 0.05, 'sine', 0.12 + i * rnd(0.04, 0.08));
      break;
    case 'repair': // kovadlina: dvě cinknutí a jiskry, pak radostný tón
      [0, 0.16].forEach((d, i) => { S.tone(1150 * p * (i ? 1.12 : 1), 0.5, 0.14, 'sine', d); S.tone(3170 * p, 0.3, 0.045, 'sine', d); S.burst({ dur: 0.03, f0: 5000, f1: 4000, q: 1, vol: 0.25, delay: d }); });
      S.tone(523, 0.25, 0.05, 'triangle', 0.34); S.tone(784, 0.35, 0.05, 'triangle', 0.42);
      break;
    case 'whoosh': // máchnutí do vzduchu (síla podle nabití)
      S.burst({ dur: 0.16 + 0.08 * strength, f0: 450 * p, f1: (1600 + 1400 * strength) * p, q: 1.3, vol: 0.1 + 0.14 * strength, attack: 0.04 });
      break;
    case 'bowDraw': // natahování luku: vrzání tětivy
      S.burst({ dur: 0.45, f0: 300 * p, f1: 900 * p, q: 6, vol: 0.06, attack: 0.2 });
      S.tone(180 * p, 0.4, 0.03, 'sawtooth', 0, 240 * p, { attack: 0.2 });
      break;
    case 'bowShoot': // výstřel: brnknutí tětivy a svist šípu (síla podle natažení)
      S.tone(110 * p, 0.18, 0.2, 'triangle', 0, 70);
      S.burst({ dur: 0.05, f0: 2400 * p, f1: 900, q: 1, vol: 0.2 });
      S.burst({ dur: 0.25 + 0.15 * strength, f0: 1800 * p, f1: 600 * p, q: 1.5, vol: 0.06 + 0.1 * strength, delay: 0.03 });
      break;
    case 'shieldBlock': // úder do štítu: tupé ťuknutí do dřeva a cinknutí lemu
      S.burst({ dur: 0.09, f0: 700 * p, f1: 200, type: 'lowpass', q: 1, vol: 0.45 });
      S.tone(160 * p, 0.16, 0.22, 'triangle', 0, 90);
      S.tone(1900 * p, 0.12, 0.04, 'sine', 0.01);
      break;
    case 'arrowHit': // šíp se zabodl do země nebo do bloku
      S.burst({ dur: 0.06, f0: 900 * p, f1: 300, type: 'lowpass', q: 1, vol: 0.25 });
      S.tone(240 * p, 0.12, 0.08, 'triangle', 0, 180);
      break;
    case 'hit': // zásah tvora: tupý úder (silnější podle nabití)
      S.burst({ dur: 0.13, f0: 1600 * p, f1: 220, type: 'lowpass', q: 1, vol: 0.3 + 0.3 * strength });
      S.tone(150 * p, 0.15, 0.18 + 0.2 * strength, 'square', 0, 55);
      S.tone(90, 0.12, 0.25 * strength, 'sine', 0, 50);
      break;
    case 'weak': // nenabitý úder: slabé plácnutí
      S.burst({ dur: 0.07, f0: 1100 * p, f1: 400, type: 'lowpass', q: 0.8, vol: 0.2 });
      break;
    case 'crit': // kritický zásah: jasné "šing"
      S.tone(2400 * p, 0.22, 0.08, 'triangle', 0, 3600 * p);
      S.tone(3300 * p, 0.3, 0.045, 'sine', 0.03);
      S.burst({ dur: 0.18, f0: 7000, f1: 2500, q: 1.5, vol: 0.15 });
      break;
    case 'charged': // úder je zase nabitý (tiché cvaknutí)
      S.tone(1800 * p, 0.03, 0.02, 'sine');
      break;
    case 'low': // nástroj se brzy rozbije
      S.tone(880, 0.12, 0.06, 'triangle'); S.tone(622, 0.18, 0.06, 'triangle', 0.13);
      break;
    case 'poof': // tvor se rozplyne v kouři
      S.burst({ dur: 0.35, f0: 900 * p, f1: 200, type: 'lowpass', q: 0.6, vol: 0.16, attack: 0.04 });
      break;
    case 'equip': // vytažení nástroje
      S.burst({ dur: 0.06, f0: 2500 * p, f1: 2000, q: 2, vol: 0.05 });
      break;
  }
}
