// Přehrávač filmové hudby (blok 'jukebox' z obchodu za zlato, data shared/data/shop.js) a hudební disky.
// Skladby jsou vlastní, složené pro Říši ve stylu filmové hudby (pochod, vesmír, tajemno, bitva, finále);
// hraje je syntezátor ve WebAudio: smyčcový podklad, žesťová melodie, basa, tympány a bubny.
// Disk ve přehrávači je uložený v blockMeta (klíč přehrávače -> id disku), takže ho slyší všichni hráči poblíž
// a zvuk jde z místa přehrávače (čím dál, tím tišší). Bez vedlejších účinků při načtení.
import { DISCS, ITEMS } from '../../../shared/data/index.js';
import { blockMeta, blocks } from '../../../shared/world/state.js';
import { heldStack, removeItem, addItem } from '../player/inventory.js';
import { player } from '../player/player.js';
import { sparks } from '../render/particles.js';
import { toast } from '../ui/hud.js';
import { refreshUI } from '../ui/inventory-ui.js';
import { Sound } from './sound.js';

// Skladba: tempo, základní tón (MIDI), stupnice, akordy (stupeň stupnice na takt), melodie (8 osmin na takt:
// číslice = stupeň stupnice od základního tónu, '.' = pauza, '-' = drží), styl bicích a podkladu.
const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10];
export const TRACKS = {
  disc_hero: { bpm: 112, root: 60, scale: MAJOR, style: 'march', chords: [0, 4, 5, 3, 0, 4, 3, 4],
    mel: ['0-.4----', '3210-.-.', '5--4--3-', '2-1-0---', '0-.4--6-', '7---6-5-', '4-3-2-1-', '4-------'] },
  disc_space: { bpm: 70, root: 57, scale: MAJOR, style: 'space', chords: [0, 5, 3, 4, 0, 5, 3, 4],
    mel: ['4-------', '3---2---', '4---7---', '6-------', '4-------', '5---6---', '7---9---', '7-------'] },
  disc_mystery: { bpm: 84, root: 50, scale: MINOR, style: 'mystery', chords: [0, 0, 5, 4, 0, 3, 5, 4],
    mel: ['0-2-3---', '2-1-0---', '5-4-3-2-', '1-------', '.-0-2-3-', '4---3-2-', '3-2-1-6-', '0-------'] },
  disc_battle: { bpm: 140, root: 52, scale: MINOR, style: 'battle', chords: [0, 5, 3, 4, 0, 5, 3, 4],
    mel: ['0-0-3-0-', '5-4-3-4-', '0-0-3-5-', '7-6-4---', '7-7-9-7-', '6-5-4-5-', '3-4-5-6-', '7-------'] },
  disc_finale: { bpm: 96, root: 55, scale: MAJOR, style: 'finale', chords: [0, 3, 4, 0, 5, 3, 4, 0],
    mel: ['4-----5-', '6-5-4-3-', '2-----3-', '4-------', '4---7---', '6-5-6-7-', '8-7-6-5-', '7-------'] },
};
const HEAR = 48; // m: dál přehrávač není slyšet
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const note = (T, deg) => T.root + T.scale[((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7);

// ---------- nástroje (čas t v sekundách AudioContextu, out = vstup přehrávače)
function osc(c, out, type, f, t, dur, vol, { attack = 0.02, release = 0.15, cutoff = 0, detune = 0 } = {}) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = f; o.detune.value = detune;
  let head = o;
  if (cutoff) { const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff; o.connect(lp); head = lp; }
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
const strings = (c, out, f, t, dur, v) => { for (const d of [-7, 7]) osc(c, out, 'sawtooth', f, t, dur, v, { attack: 0.35, release: 0.5, cutoff: 1400, detune: d }); };
const brass = (c, out, f, t, dur, v) => { osc(c, out, 'sawtooth', f, t, dur, v, { attack: 0.05, release: 0.12, cutoff: 2400 }); osc(c, out, 'square', f / 2, t, dur, v * 0.3, { attack: 0.05, cutoff: 900 }); };
const flute = (c, out, f, t, dur, v) => osc(c, out, 'sine', f, t, dur, v, { attack: 0.08, release: 0.3 });
const bass = (c, out, f, t, dur, v) => osc(c, out, 'triangle', f, t, dur, v, { attack: 0.01, release: 0.1 });
function timpani(c, out, f, t, v) { const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(f * 1.4, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.08); o.connect(g).connect(out); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9); o.start(t); o.stop(t + 1); noise(c, out, t, 0.12, v * 0.3, 200, 'lowpass'); }
const snare = (c, out, t, v) => noise(c, out, t, 0.14, v, 1800);
const bell = (c, out, f, t, v) => { osc(c, out, 'sine', f, t, 0.05, v, { attack: 0.002, release: 1.2 }); osc(c, out, 'sine', f * 2.76, t, 0.03, v * 0.3, { attack: 0.002, release: 0.6 }); };

/** Jedna osmina skladby (krok s v rámci smyčky) v čase t. */
function playStep(c, out, T, s, t) {
  const bars = T.mel.length, bar = Math.floor(s / 8) % bars, i = s % 8, e = 60 / T.bpm / 2; // délka osminy
  const ch = T.chords[bar % T.chords.length], st = T.style;
  if (i === 0) { // podklad: akord na celý takt, basa
    const pad = st === 'space' ? flute : strings;
    for (const d of [ch, ch + 2, ch + 4]) pad(c, out, hz(note(T, d) - 12), t, e * 8, st === 'battle' ? 0.035 : 0.045);
    if (st === 'space' || st === 'mystery') bass(c, out, hz(note(T, ch) - 24), t, e * 8, 0.12);
  }
  if (st === 'march' || st === 'finale') { if (i % 2 === 0) bass(c, out, hz(note(T, ch) - 24), t, e * 1.6, 0.11); }
  if (st === 'battle') bass(c, out, hz(note(T, ch) - 24 + (i % 4 === 3 ? 7 : 0)), t, e * 0.8, 0.12); // ostinato
  // bicí
  if (st === 'march') { if (i === 0 || i === 4) timpani(c, out, hz(note(T, ch) - 24), t, 0.3); if (i % 2 === 1 || i === 6) snare(c, out, t, 0.08); }
  if (st === 'battle') { if (i % 2 === 0) timpani(c, out, hz(T.root - 24), t, i === 0 ? 0.4 : 0.22); if (i === 2 || i === 6) snare(c, out, t, 0.14); }
  if (st === 'finale' && (i === 0 || (bar % 4 === 3 && i >= 4))) timpani(c, out, hz(note(T, ch) - 24), t, 0.32);
  if (st === 'mystery' && i % 4 === 0) noise(c, out, t, 0.3, 0.03, 600);
  if (st === 'space') bell(c, out, hz(note(T, ch + [0, 2, 4, 7][i % 4]) + 12), t, 0.035); // třpytivé arpeggio
  // melodie: délka = počet '-' za tónem
  const ch2 = T.mel[bar][i];
  if (ch2 >= '0' && ch2 <= '9') {
    let len = 1;
    while (i + len < 8 && T.mel[bar][i + len] === '-') len++;
    const f = hz(note(T, +ch2)), lead = st === 'space' || st === 'mystery' ? flute : brass;
    lead(c, out, f, t, e * len * 0.95, st === 'space' || st === 'mystery' ? 0.12 : 0.07);
  }
}

// ---------- přehrávače ve světě
const playing = new Map(); // klíč přehrávače -> { id, gain, pan, step, next }
function startBox(k, id) {
  const c = Sound.ctx;
  if (!c || !Sound.musicBus) return null;
  const [x, y, z] = k.split(',').map(Number), pan = c.createPanner(), gain = c.createGain();
  pan.panningModel = 'equalpower'; pan.distanceModel = 'inverse'; pan.refDistance = 4; pan.rolloffFactor = 1.2;
  if (pan.positionX) { pan.positionX.value = x + 0.5; pan.positionY.value = y + 0.8; pan.positionZ.value = z + 0.5; } else pan.setPosition(x + 0.5, y + 0.8, z + 0.5);
  gain.gain.value = 0.9;
  gain.connect(pan).connect(Sound.musicBus);
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
  const name = DISCS.find((d) => d[0] === held.id)?.[1] || '';
  toast(`♪ Hraje: ${name}`);
}
