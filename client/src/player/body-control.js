// Ovládání tělem přes webkameru (Nastavení → Ovládání tělem). Kamera i rozpoznávání běží jen v tomhle počítači:
// video se nikam neposílá ani neukládá. Rozpoznání těla dělá MediaPipe Pose (Google) – knihovna a model se stáhnou
// z internetu až po zapnutí. Gesta → ovládání: body-gestures.js. Vlevo dole je okénko s kamerou a kostrou.
// Načítá se dynamicky (import()) až po zapnutí, takže nemá řádek v pořadí spouštění.
import { toast } from '../ui/hud.js';
import { calibrate, newState, readPose } from './body-gestures.js';
import { input, keys, player } from './player.js';

const LIB = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const TURN = 2.2, LOOK = 1.2; // rad/s při plném upažení / kývnutí

let mode = null, video = null, stream = null, landmarker = null, box = null, canvas = null, status = null, raf = 0;
let base = null, calib = [], calibUntil = 0, st = newState(), last = 0, joy = null, held = new Set();

/** Zapne / vypne ovládání tělem ('knees' = chůze na místě, 'lean' = náklon, null = vypnuto). */
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
export function recalibrate() { base = null; calib = []; calibUntil = performance.now() + 3000; st = newState(); }

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
function draw(L) {
  const g = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  g.save(); g.scale(-1, 1); g.drawImage(video, -w, 0, w, h); g.restore(); // zrcadlově, jako v zrcadle
  if (!L) return;
  g.strokeStyle = '#38e8ff'; g.lineWidth = 3;
  for (const [a, b] of BONES) { if ((L[a].visibility ?? 1) < 0.5 || (L[b].visibility ?? 1) < 0.5) continue; g.beginPath(); g.moveTo((1 - L[a].x) * w, L[a].y * h); g.lineTo((1 - L[b].x) * w, L[b].y * h); g.stroke(); }
}

function loop(t) {
  raf = requestAnimationFrame(loop);
  if (!landmarker || video.readyState < 2) return;
  const now = performance.now(), dt = Math.min(0.1, (now - (last || now)) / 1000);
  last = now;
  const res = landmarker.detectForVideo(video, now);
  const L = res.landmarks?.[0] || null;
  draw(L);
  if (!L) { release(); ui('Nevidím tě – postav se před kameru'); return; }
  if (!base) { // kalibrace
    calib.push(L);
    ui(`Stůj rovně, ruce dolů… ${Math.max(0, Math.ceil((calibUntil - now) / 1000))}`);
    if (now >= calibUntil) { base = calibrate(calib); if (base) toast('Kalibrace hotová: šlapej na místě, upaž = otočit, ruka nahoru = útok'); else recalibrate(); }
    return;
  }
  const r = readPose(L, base, st, now / 1000, mode);
  if (!r.ok) { release(); ui(r.why); return; }
  // pohyb přes analogový joystick hry (stejně jako dotykové ovládání: input.joy)
  joy = input.joy = r.forward || r.strafe ? { x: r.strafe, y: -r.forward } : null;
  hold('ShiftLeft', r.sprint);
  if (r.jump) { hold('Space', true); setTimeout(() => hold('Space', false), 180); }
  player.yaw += r.turn * TURN * dt;
  player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch + r.look * LOOK * dt));
  input.lmb = r.attack;
  input.rmb = r.use;
  ui(r.why || [r.forward ? (r.sprint ? 'běžíš' : 'jdeš') : '', r.turn > 0 ? '↺ doleva' : r.turn < 0 ? '↻ doprava' : '', r.attack ? 'útok' : '', r.use ? 'použít' : ''].filter(Boolean).join(' · ') || 'stojíš');
}
