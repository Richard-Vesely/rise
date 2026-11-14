// Přehrávač filmové hudby (blok 'jukebox' z obchodu za zlato, data shared/data/shop.js) a hudební disky.
// Skladby jsou vlastní, složené pro Říši ve stylu filmové hudby (pochod, vesmír, tajemno, bitva, finále);
// hraje je syntezátor ve WebAudio: smyčcový podklad, žesťová melodie, basa, tympány a bubny.
// Disk ve přehrávači je uložený v blockMeta (klíč přehrávače -> id disku), takže ho slyší všichni hráči poblíž
// a zvuk jde z místa přehrávače (čím dál, tím tišší). Bez vedlejších účinků při načtení.
import { ITEMS } from '../../../shared/data/index.js';
import { blockMeta, blocks } from '../../../shared/world/state.js';
import { heldStack, removeItem, addItem } from '../player/inventory.js';
import { player } from '../player/player.js';
import { sparks } from '../render/particles.js';
import { toast } from '../ui/hud.js';
import { refreshUI } from '../ui/inventory-ui.js';
import { Sound } from './sound.js';

// Skladba: tempo, základní tón (MIDI), stupnice, akordy (stupeň stupnice na takt), melodie (8 osmin na takt:
// číslice = stupeň stupnice od základního tónu, '.' = pauza, '-' = drží), styl bicích a podkladu.
// Styl 'opera' = velká vesmírná opera (žesťová fanfára, pochodové bicí, činely, smyčce ve dvou oktávách).
// Melodie jsou naše vlastní: žádná skladba nekopíruje melodii z filmu.
const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10];
export const TRACKS = {
  disc_hero: { bpm: 112, root: 60, scale: MAJOR, style: 'march', chords: [0, 4, 5, 3, 0, 4, 3, 4],
    mel: ['0-.4----', '3210-.-.', '5--4--3-', '2-1-0---', '0-.4--6-', '7---6-5-', '4-3-2-1-', '4-------'] },
  disc_space: { bpm: 104, root: 58, scale: MAJOR, style: 'opera', chords: [0, 3, 4, 0, 5, 3, 1, 4],
    mel: ['0---4-5-', '7---6-4-', '5-4-2-4-', '0-------', '0---4-5-', '7---9-8-', '7-6-5-6-', '7-------'] },
  disc_mystery: { bpm: 84, root: 50, scale: MINOR, style: 'mystery', chords: [0, 0, 5, 4, 0, 3, 5, 4],
    mel: ['0-2-3---', '2-1-0---', '5-4-3-2-', '1-------', '.-0-2-3-', '4---3-2-', '3-2-1-6-', '0-------'] },
  disc_battle: { bpm: 140, root: 52, scale: MINOR, style: 'battle', chords: [0, 5, 3, 4, 0, 5, 3, 4],
    mel: ['0-0-3-0-', '5-4-3-4-', '0-0-3-5-', '7-6-4---', '7-7-9-7-', '6-5-4-5-', '3-4-5-6-', '7-------'] },
  disc_horror: { bpm: 60, root: 45, scale: [0, 1, 3, 5, 6, 8, 10], style: 'horror', chords: [0, 1, 0, 4, 0, 1, 5, 4], // z ďáblů v pekle
    mel: ['4---3---', '4---.---', '1-------', '.---0---', '4---5---', '4-3-1---', '6-------', '.-------'] },
  disc_finale: { bpm: 96, root: 55, scale: MAJOR, style: 'finale', chords: [0, 3, 4, 0, 5, 3, 4, 0],
    mel: ['4-----5-', '6-5-4-3-', '2-----3-', '4-------', '4---7---', '6-5-6-7-', '8-7-6-5-', '7-------'] },
};
const HEAR = 60; // m: dál přehrávač není slyšet
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const note = (T, deg) => T.root + T.scale[((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7);

// ---------- nástroje orchestru (čas t v sekundách AudioContextu, out = vstup přehrávače)
// sweep = filtr se během nástupu otevře (žestě zazní jako opravdové), vib = vibrato [Hz, centy]
function osc(c, out, type, f, t, dur, vol, { attack = 0.02, release = 0.15, cutoff = 0, detune = 0, sweep = 0, vib = null } = {}) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = f; o.detune.value = detune;
  let head = o;
  if (cutoff) {
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 0.7;
    if (sweep) { lp.frequency.setValueAtTime(cutoff * 0.25, t); lp.frequency.exponentialRampToValueAtTime(cutoff, t + sweep); } else lp.frequency.value = cutoff;
    o.connect(lp); head = lp;
  }
  if (vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = vib[0]; lg.gain.value = vib[1]; l.connect(lg).connect(o.detune); l.start(t); l.stop(t + dur + release + 0.05); }
  head.connect(g).connect(out);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.setValueAtTime(vol, t + Math.max(attack, dur - release));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
  o.start(t); o.stop(t + dur + release + 0.05);
}
function noise(c, out, t, dur, vol, f0, type = 'bandpass') {
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = Sound.white; f.type = type; f.frequency.value = f0;
  s.connect(f).connect(g).connect(out);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
// smyčce: tři struny trochu rozladěné (sbor), s vibratem
const strings = (c, out, f, t, dur, v) => { for (const d of [-9, 0, 9]) osc(c, out, 'sawtooth', f, t, dur, v * 0.75, { attack: 0.3, release: 0.6, cutoff: 2600, detune: d, vib: [5.2, 6] }); };
// žestě: trubka (ostrý nástup, filtr se otevře) a lesní roh o oktávu níž
const brass = (c, out, f, t, dur, v) => {
  osc(c, out, 'sawtooth', f, t, dur, v, { attack: 0.04, release: 0.15, cutoff: 3200, sweep: 0.08, vib: [5.5, 5] });
  osc(c, out, 'sawtooth', f / 2, t, dur, v * 0.7, { attack: 0.07, release: 0.2, cutoff: 1500, sweep: 0.12 });
};
const flute = (c, out, f, t, dur, v) => osc(c, out, 'sine', f, t, dur, v, { attack: 0.08, release: 0.3, vib: [5, 8] });
const bass = (c, out, f, t, dur, v) => { osc(c, out, 'triangle', f, t, dur, v, { attack: 0.01, release: 0.1 }); osc(c, out, 'sawtooth', f, t, dur, v * 0.3, { attack: 0.02, cutoff: 500 }); };
function timpani(c, out, f, t, v) { const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(f * 1.4, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.08); o.connect(g).connect(out); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1); o.start(t); o.stop(t + 1.2); noise(c, out, t, 0.15, v * 0.35, 220, 'lowpass'); }
const snare = (c, out, t, v) => { noise(c, out, t, 0.16, v, 1900); osc(c, out, 'triangle', 190, t, 0.03, v * 0.6, { attack: 0.002, release: 0.06 }); };
const cymbal = (c, out, t, v) => noise(c, out, t, 2.4, v, 6000, 'highpass'); // činel
const bell = (c, out, f, t, v) => { osc(c, out, 'sine', f, t, 0.05, v, { attack: 0.002, release: 1.2 }); osc(c, out, 'sine', f * 2.76, t, 0.03, v * 0.3, { attack: 0.002, release: 0.6 }); };

/** Jedna osmina skladby (krok s v rámci smyčky) v čase t. */
function playStep(c, out, T, s, t) {
  const bars = T.mel.length, bar = Math.floor(s / 8) % bars, i = s % 8, e = 60 / T.bpm / 2; // délka osminy
  const ch = T.chords[bar % T.chords.length], st = T.style, big = st === 'opera' || st === 'march' || st === 'finale';
  if (i === 0) { // podklad: akord na celý takt (velký orchestr: smyčce ve dvou oktávách), basa
    const pad = st === 'space' || st === 'horror' ? flute : strings, v = st === 'battle' ? 0.035 : big ? 0.04 : 0.045;
    for (const d of [ch, ch + 2, ch + 4]) pad(c, out, hz(note(T, d) - 12), t, e * 8, v);
    if (big) for (const d of [ch + 2, ch + 4]) strings(c, out, hz(note(T, d)), t, e * 8, v * 0.6);
    if (st === 'space' || st === 'mystery' || st === 'horror') bass(c, out, hz(note(T, ch) - 24), t, e * 8, 0.12);
    if (big && bar % 4 === 0) cymbal(c, out, t, st === 'opera' ? 0.09 : 0.06); // činel na začátku každé fráze
  }
  if (big && i % 2 === 0) bass(c, out, hz(note(T, ch) - 24), t, e * 1.6, 0.12);
  if (st === 'battle') bass(c, out, hz(note(T, ch) - 24 + (i % 4 === 3 ? 7 : 0)), t, e * 0.8, 0.12); // ostinato
  // bicí
  if (st === 'march' || st === 'opera') {
    if (i === 0 || i === 4) timpani(c, out, hz(note(T, ch) - 24), t, 0.34);
    if (i === 2 || i === 6) snare(c, out, t, 0.1);
    if (i === 7 || (st === 'opera' && i === 3)) snare(c, out, t, 0.06);
    if (bar % 4 === 3 && i >= 4) for (let k = 0; k < 3; k++) snare(c, out, t + (k * e) / 3, 0.05 + k * 0.02); // vířivé crescendo před další frází
  }
  if (st === 'opera' && i % 2 === 1) strings(c, out, hz(note(T, ch + [0, 2, 4, 7][(i >> 1) % 4]) + 12), t, e * 0.9, 0.012); // rychlé smyčcové figury nahoře
  if (st === 'battle') { if (i % 2 === 0) timpani(c, out, hz(T.root - 24), t, i === 0 ? 0.4 : 0.22); if (i === 2 || i === 6) snare(c, out, t, 0.14); }
  if (st === 'finale' && (i === 0 || (bar % 4 === 3 && i >= 4))) timpani(c, out, hz(note(T, ch) - 24), t, 0.34);
  if (st === 'mystery' && i % 4 === 0) noise(c, out, t, 0.3, 0.03, 600);
  if (st === 'horror') { // hororový disk: tlukot srdce, skřípavý smyčcový tón a zvonek
    if (i === 0 || i === 1) timpani(c, out, hz(T.root - 24), t, i ? 0.18 : 0.28);
    if (i === 4) osc(c, out, 'sawtooth', hz(note(T, ch) + 13), t, e * 4, 0.025, { attack: 0.6, release: 0.8, cutoff: 3000, detune: 30 });
    if (i === 6 && bar % 2) bell(c, out, hz(T.root + 18), t, 0.05);
  }
  if (st === 'space') bell(c, out, hz(note(T, ch + [0, 2, 4, 7][i % 4]) + 12), t, 0.035); // třpytivé arpeggio
  // melodie: délka = počet '-' za tónem
  const ch2 = T.mel[bar][i];
  if (ch2 >= '0' && ch2 <= '9') {
    let len = 1;
    while (i + len < 8 && T.mel[bar][i + len] === '-') len++;
    const soft = st === 'space' || st === 'mystery' || st === 'horror', f = hz(note(T, +ch2)), lead = soft ? flute : brass;
    lead(c, out, f, t, e * len * 0.95, soft ? 0.12 : big ? 0.09 : 0.07);
    if (big) strings(c, out, f * 2, t, e * len * 0.95, 0.025); // housle zdvojí melodii o oktávu výš
  }
}

// ---------- přehrávače ve světě
const playing = new Map(); // klíč přehrávače -> { id, gain, pan, step, next }
function startBox(k, id) {
  const c = Sound.ctx;
  if (!c || !Sound.musicBus) return null;
  const [x, y, z] = k.split(',').map(Number), pan = c.createPanner(), gain = c.createGain();
  pan.panningModel = 'equalpower'; pan.distanceModel = 'inverse'; pan.refDistance = 8; pan.rolloffFactor = 1; // nahlas: do 8 m plná síla
  if (pan.positionX) { pan.positionX.value = x + 0.5; pan.positionY.value = y + 0.8; pan.positionZ.value = z + 0.5; } else pan.setPosition(x + 0.5, y + 0.8, z + 0.5);
  gain.gain.value = 2.2; // nahlas (kompresor v Sound hlídá, aby to nechrčelo)
  gain.connect(pan).connect(Sound.musicBus);
  if (Sound.verbIn) { const send = c.createGain(); send.gain.value = 0.35; pan.connect(send).connect(Sound.verbIn); } // dozvuk jako v koncertním sále
  return { id, gain, pan, step: 0, next: c.currentTime + 0.1, x, y, z };
}
function stopBox(k) {
  const P = playing.get(k);
  if (!P) return;
  const c = Sound.ctx;
  P.gain.gain.setTargetAtTime(0.0001, c.currentTime, 0.15);
  setTimeout(() => { try { P.gain.disconnect(); P.pan.disconnect(); } catch {} }, 1500);
  playing.delete(k);
}
let scanT = 0;
/** Kolik přehrávačů právě hraje (pro play-testy, window.game). */
export const jukeboxesPlaying = () => [...playing.values()].map((P) => P.id);
/** Každý snímek: přehrávače s diskem poblíž hrají (plánuje se kousek dopředu), vzdálené a vypnuté ztichnou. */
export function updateJukeboxes(dt) {
  const c = Sound.ctx;
  if (!c) return;
  if ((scanT -= dt) <= 0) {
    scanT = 0.5;
    const want = new Map();
    for (const [k, v] of blockMeta) {
      if (typeof v !== 'string' || !TRACKS[v] || blocks.get(k) !== 'jukebox') continue;
      const [x, y, z] = k.split(',').map(Number);
      if (Math.hypot(x - player.pos.x, y - player.pos.y, z - player.pos.z) < HEAR) want.set(k, v);
    }
    for (const k of [...playing.keys()]) if (want.get(k) !== playing.get(k).id) stopBox(k);
    for (const [k, id] of want) if (!playing.has(k)) { const P = startBox(k, id); if (P) playing.set(k, P); }
  }
  for (const P of playing.values()) {
    const T = TRACKS[P.id], e = 60 / T.bpm / 2;
    if (P.next < c.currentTime) P.next = c.currentTime + 0.05; // karta byla na pozadí: nedohánět
    while (P.next < c.currentTime + 0.3) { playStep(c, P.gain, T, P.step++, P.next); P.next += e; }
    if (Math.random() < dt * 2) sparks.emit(P.x + 0.5, P.y + 1.1, P.z + 0.5, [0.7, 0.8, 1], 1, 0.6, 1); // noty nad přehrávačem
  }
}

/** Pravé tlačítko na přehrávač: s diskem v ruce ho vloží a pustí, jinak vysune disk, který hraje. */
export function useJukebox(k) {
  const cur = blockMeta.get(k), held = heldStack();
  if (typeof cur === 'string' && ITEMS[cur]?.disc) {
    blockMeta.delete(k);
    addItem(cur, 1);
    refreshUI();
    toast('Disk vysunut, hudba skončila');
    return;
  }
  if (!held || !ITEMS[held.id]?.disc) { toast('Vlož hudební disk (koupíš v obchodě: /shop)'); return; }
  blockMeta.set(k, held.id);
  removeItem(held.id, 1);
  refreshUI();
  Sound.init();
  toast(`♪ Hraje: ${ITEMS[held.id].name.replace('Hudební disk: ', '')}`);
}
