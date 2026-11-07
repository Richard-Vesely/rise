// Ovládání tělem: rozpoznání gest z bodů těla (client/src/player/body-gestures.js) na vymyšlené kostře.
import test from 'node:test';
import assert from 'node:assert/strict';
import { P, calibrate, newState, readPose } from '../../client/src/player/body-gestures.js';

// Stojící hráč čelem ke kameře (obraz není zrcadlený: levá strana těla je v obraze vpravo). Šířka ramen 0,16.
function stand(ch = {}) {
  const L = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }));
  const set = (i, x, y) => { L[i] = { x, y, visibility: 1 }; };
  set(P.NOSE, 0.5, 0.2); set(P.LSH, 0.58, 0.32); set(P.RSH, 0.42, 0.32);
  set(P.LWR, 0.6, 0.6); set(P.RWR, 0.4, 0.6);
  set(P.LHIP, 0.55, 0.6); set(P.RHIP, 0.45, 0.6); set(P.LKNEE, 0.55, 0.78); set(P.RKNEE, 0.45, 0.78);
  for (const [i, [x, y]] of Object.entries(ch)) set(+i, x, y);
  return L;
}
const base = calibrate(Array.from({ length: 10 }, () => stand()));

test('body control: standing still does nothing', () => {
  const r = readPose(stand(), base, newState(), 10);
  assert.ok(r.ok);
  assert.deepEqual([r.forward, r.strafe, r.turn, r.look, r.attack, r.use, r.jump], [0, 0, 0, 0, false, false, false]);
});

test('body control: arm out to the side turns, hands above the head attack / use', () => {
  assert.ok(readPose(stand({ [P.LWR]: [0.9, 0.33] }), base, newState(), 1).turn > 0.5, 'left arm out = turn left');
  assert.ok(readPose(stand({ [P.RWR]: [0.1, 0.33] }), base, newState(), 1).turn < -0.5, 'right arm out = turn right');
  assert.equal(readPose(stand({ [P.LWR]: [0.62, 0.45] }), base, newState(), 1).turn, 0, 'a hand slightly away from the body does not turn');
  assert.ok(readPose(stand({ [P.RWR]: [0.42, 0.05] }), base, newState(), 1).attack, 'right hand above the head = attack');
  assert.ok(readPose(stand({ [P.LWR]: [0.58, 0.05] }), base, newState(), 1).use, 'left hand above the head = right button');
});

test('body control: walking in place (alternating knees) walks, stopping stops', () => {
  const st = newState();
  let t = 0, r;
  for (let i = 0; i < 6; i++) { // šest kroků, dva za sekundu
    t += 0.25; r = readPose(stand(i % 2 ? { [P.RKNEE]: [0.45, 0.66] } : { [P.LKNEE]: [0.55, 0.66] }), base, st, t, 'knees');
    t += 0.25; r = readPose(stand(), base, st, t, 'knees');
  }
  assert.ok(r.forward > 0.5, `walks (${r.forward})`);
  r = readPose(stand(), base, st, t + 1.2, 'knees');
  assert.equal(r.forward, 0, 'standing still again stops');
  const one = newState();
  readPose(stand({ [P.LKNEE]: [0.55, 0.66] }), base, one, 1, 'knees');
  readPose(stand({ [P.LKNEE]: [0.55, 0.66] }), base, one, 1.3, 'knees');
  assert.equal(one.steps.length, 1, 'holding one knee up is one step, not walking');
});

test('body control: leaning walks in lean mode, sideways lean steps aside, a jump jumps', () => {
  const fwd = stand({ [P.LSH]: [0.6, 0.34], [P.RSH]: [0.4, 0.34] }); // ramena blíž ke kameře = širší
  assert.ok(readPose(fwd, base, newState(), 1, 'lean').forward > 0.5, 'lean forward = walk');
  assert.equal(readPose(fwd, base, newState(), 1, 'knees').forward, 0, 'but not in the knees mode');
  const right = stand({ [P.LSH]: [0.53, 0.32], [P.RSH]: [0.37, 0.32], [P.NOSE]: [0.45, 0.2] }); // náklon k pravé straně těla (v obraze doleva)
  assert.ok(readPose(right, base, newState(), 1).strafe > 0.3, 'lean to the right = step right');
  const up = stand({ [P.LHIP]: [0.55, 0.53], [P.RHIP]: [0.45, 0.53] });
  const st = newState();
  assert.ok(readPose(up, base, st, 1).jump, 'hips jump up = jump');
  assert.ok(!readPose(up, base, st, 1.2).jump, 'only once per jump');
});

test('body control: says what it cannot see', () => {
  const r = readPose(stand({ [P.NOSE]: [0.5, 0.2] }).map((l, i) => (i === P.LSH ? { ...l, visibility: 0 } : l)), base, newState(), 1);
  assert.equal(r.ok, false);
  assert.match(r.why, /Nevidím/);
  const noKnees = stand(); noKnees[P.LKNEE].visibility = 0;
  assert.match(readPose(noKnees, base, newState(), 1, 'knees').why, /kolena/);
});
