// Ovládání tělem přes webkameru (Nastavení → Ovládání tělem). Kamera i rozpoznávání běží jen v tomhle počítači:
// video se nikam neposílá ani neukládá. Rozpoznání těla dělá MediaPipe Pose (Google) – knihovna a model se stáhnou
// z internetu až po zapnutí. Gesta → ovládání: body-gestures.js. Vlevo dole je okénko s kamerou a kostrou.
// Načítá se dynamicky (import()) až po zapnutí, takže nemá řádek v pořadí spouštění.
import { toast } from '../ui/hud.js';
import { calibrate, newState, readPose } from './body-gestures.js';
import { lookSens } from '../game/prefs.js';
import { input, keys, player } from './player.js';

const LIB = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const TURN = 1.6, LOOK = 0.8; // rad/s při upažení / kývnutí (hrubé ovládání: stálá klidná rychlost)

let mode = null, video = null, stream = null, landmarker = null, box = null, canvas = null, status = null, raf = 0;
let base = null, calib = [], calibUntil = 0, st = newState(), last = 0, joy = null, held = new Set();
const sm = { forward: 0, strafe: 0, turn: 0, look: 0 }; // vyhlazené ovládání (body z kamery se třesou)
const ease = (k, v, dt, rate) => { sm[k] += (v - sm[k]) * (1 - Math.exp(-dt * rate)); if (Math.abs(sm[k]) < 0.02 && !v) sm[k] = 0; return sm[k]; };

/** Zapne / vypne ovládání tělem ('knees' = chůze na místě, 'lean' = náklon, 'hands' = jen rukama vsedě, null = vypnuto). */
export async function setBodyMode(m) {
  if (!m) return stop();
  mode = m;
  if (stream) return;
  try {
    ui('Spouštím kameru…');
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
    video.srcObject = stream;
    await video.play();
    ui('Načítám rozpoznávání těla…');
    const { FilesetResolver, PoseLandmarker } = await import(/* @vite-ignore */ `${LIB}/vision_bundle.mjs`);
    const files = await FilesetResolver.forVisionTasks(`${LIB}/wasm`);
    landmarker = await PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' }, runningMode: 'VIDEO', numPoses: 1 });
    recalibrate();
    raf = requestAnimationFrame(loop);
  } catch (e) {
    console.warn('ovládání tělem:', e);
    toast(e?.name === 'NotAllowedError' ? 'Kamera nepovolena – ovládání tělem je vypnuté' : 'Ovládání tělem se nepodařilo spustit (kamera nebo internet)');
    stop();
  }
}
/** Nová kalibrace: 3 s stát v klidu, rukama dolů. */
export function recalibrate() { base = null; calib = []; calibUntil = performance.now() + 3000; st = newState(); for (const k in sm) sm[k] = 0; }

function stop() {
  cancelAnimationFrame(raf);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null; landmarker?.close?.(); landmarker = null; mode = null;
  release();
  box?.remove(); box = null;
}
// tlačítka, která drží tělo (pustí se, když gesto skončí)
function hold(code, on) { if (on && !held.has(code)) { keys.add(code); held.add(code); } else if (!on && held.has(code)) { keys.delete(code); held.delete(code); } }
function release() { for (const c of held) keys.delete(c); held.clear(); if (input.joy === joy) input.joy = null; joy = null; input.lmb = input.rmb = false; }

function ui(text) {
  if (!box) {
    box = document.createElement('div');
    box.id = 'bodyCam';
    box.innerHTML = '<canvas width="200" height="150"></canvas><div class="bc-status"></div><button class="mc-btn mini" title="Postav se rovně, ruce dolů, 3 s v klidu">Kalibrovat</button>';
    document.body.append(box);
    canvas = box.querySelector('canvas'); status = box.querySelector('.bc-status');
    box.querySelector('button').addEventListener('click', recalibrate);
    video = document.createElement('video');
    video.playsInline = true; video.muted = true;
  }
  status.textContent = text;
}

const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];
function draw(L, r) {
  const g = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  g.save(); g.scale(-1, 1); g.drawImage(video, -w, 0, w, h); g.restore(); // zrcadlově, jako v zrcadle
  if (!L) return;
  g.strokeStyle = '#38e8ff'; g.lineWidth = 3;
  for (const [a, b] of BONES) { if ((L[a].visibility ?? 1) < 0.5 || (L[b].visibility ?? 1) < 0.5) continue; g.beginPath(); g.moveTo((1 - L[a].x) * w, L[a].y * h); g.lineTo((1 - L[b].x) * w, L[b].y * h); g.stroke(); }
  if (!r) return;
  // ukazatele: šipky otáčení (síla = délka), pruh chůze vpravo, ruce nahoře zlatě
  g.fillStyle = '#ffd36a';
  if (sm.turn) { const len = 20 + 50 * Math.abs(sm.turn), x0 = sm.turn > 0 ? 10 : w - 10, d = sm.turn > 0 ? 1 : -1; g.beginPath(); g.moveTo(x0, h / 2); g.lineTo(x0 + d * 14, h / 2 - 10); g.lineTo(x0 + d * 14, h / 2 + 10); g.fill(); g.fillRect(Math.min(x0 + d * 14, x0 + d * len), h / 2 - 3, len - 14, 6); }
  g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(w - 10, 10, 6, h - 20);
  g.fillStyle = r.sprint ? '#ff8a3a' : '#5cff8a'; const fh = (h - 20) * Math.abs(sm.forward); g.fillRect(w - 10, h - 10 - fh, 6, fh);
  for (const [i, on] of [[16, r.attack], [15, r.use]]) if (on && L[i]) { g.fillStyle = '#ffd36a'; g.beginPath(); g.arc((1 - L[i].x) * w, L[i].y * h, 8, 0, 7); g.fill(); }
}

function loop(t) {
  raf = requestAnimationFrame(loop);
  if (!landmarker || video.readyState < 2) return;
  const now = performance.now(), dt = Math.min(0.1, (now - (last || now)) / 1000);
  last = now;
  const res = landmarker.detectForVideo(video, now);
  const L = res.landmarks?.[0] || null;
  if (!L) { draw(null); release(); ui('Nevidím tě – postav se před kameru'); return; }
  if (!base) { // kalibrace
    draw(L);
    calib.push(L);
    ui(`${mode === 'hands' ? 'Seď rovně' : 'Stůj rovně'}, ruce dolů… ${Math.max(0, Math.ceil((calibUntil - now) / 1000))}`);
    if (now >= calibUntil) { base = calibrate(calib); if (base) toast(mode === 'hands' ? 'Kalibrace hotová: mávej rukama = chůze, upaž = otočit, ruka nahoru = útok, obě nahoru = skok' : 'Kalibrace hotová: šlapej na místě, upaž = otočit, ruka nahoru = útok'); else recalibrate(); }
    return;
  }
  const r = readPose(L, base, st, now / 1000, mode);
  draw(L, r);
  if (!r.ok) { release(); ui(r.why); return; }
  // pohyb přes analogový joystick hry (stejně jako dotykové ovládání: input.joy)
  const fw = ease('forward', r.forward, dt, 5), sf = ease('strafe', r.strafe, dt, 5);
  joy = input.joy = fw || sf ? { x: sf, y: -fw } : null;
  hold('ShiftLeft', r.sprint);
  if (r.jump) { hold('Space', true); setTimeout(() => hold('Space', false), 180); }
  player.yaw += ease('turn', r.turn, dt, 6) * TURN * lookSens * dt; // citlivost: Nastavení → Citlivost otáčení
  player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch + ease('look', r.look, dt, 6) * LOOK * lookSens * dt));
  input.lmb = r.attack;
  input.rmb = r.use;
  ui(r.why || [fw ? (r.sprint ? 'běžíš' : 'jdeš') + (r.byShoulders ? ' (podle ramen)' : '') : '', sm.turn > 0 ? '↺ doleva' : sm.turn < 0 ? '↻ doprava' : '', r.attack ? 'útok' : '', r.use ? 'použít' : ''].filter(Boolean).join(' · ') || ({ knees: 'stojíš – šlapej na místě', lean: 'stojíš – nakloň se dopředu', hands: 'stojíš – mávej rukama jako při běhu' }[mode]));
}
