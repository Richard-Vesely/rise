// Unit tests for the weather rules (shared/sim/weather.js) and the GPU → Grafika auto choice (client/src/game/gpu.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { weatherAt, WEATHER_SLOTS } from '../../shared/sim/weather.js';
import { autoQuality, gpuClass } from '../../client/src/game/gpu.js';

test('weather is deterministic and in range (every player sees the same sky)', () => {
  for (let day = 1; day < 60; day++) for (let t = 0; t < 1; t += 0.013) {
    const a = weatherAt(day, t), b = weatherAt(day, t);
    assert.deepEqual(a, b);
    for (const k of ['rain', 'storm', 'fog']) assert.ok(a[k] >= 0 && a[k] <= 1, `${k} ${a[k]} on day ${day} at ${t}`);
    assert.ok(a.fog === 0 || a.rain < 1, 'no fog bank while it pours');
  }
});

test('the first day is always clear; later days sometimes rain, storm and have dawn fog', () => {
  for (let t = 0; t < 1; t += 0.01) assert.deepEqual(weatherAt(1, t), { rain: 0, storm: 0, fog: 0 });
  let rain = 0, storm = 0, fog = 0, slots = 0;
  for (let day = 2; day < 400; day++) {
    for (let s = 0; s < WEATHER_SLOTS; s++) { const w = weatherAt(day, (s + 0.5) / WEATHER_SLOTS); slots++; if (w.rain > 0.5) rain++; if (w.storm > 0.5) storm++; }
    if (weatherAt(day, 0.27).fog > 0.5) fog++;
  }
  assert.ok(rain / slots > 0.12 && rain / slots < 0.32, `rain share ${rain / slots}`);
  assert.ok(storm > 0 && storm < rain, `storms ${storm} of ${rain} rainy slots`);
  assert.ok(fog > 60 && fog < 200, `foggy mornings ${fog}`);
});

test('weather changes smoothly between slots (no sudden jumps)', () => {
  for (let day = 2; day < 50; day++) {
    let prev = weatherAt(day, 0);
    for (let t = 0.002; t < 1; t += 0.002) {
      const w = weatherAt(day, t);
      assert.ok(Math.abs(w.rain - prev.rain) < 0.12, `rain jump on day ${day} at ${t}`);
      prev = w;
    }
  }
});

test('Grafika Automaticky: software → nízká, integrated → střední, discrete → vysoká, touch → nízká', () => {
  const cases = [
    ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', 'software'],
    ['llvmpipe (LLVM 15.0.7, 256 bits)', 'software'],
    ['ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'integrated'],
    ['ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'integrated'],
    ['ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 'integrated'],
    ['ANGLE (AMD, AMD Radeon 680M Direct3D11 vs_5_0 ps_5_0, D3D11)', 'integrated'],
    ['Apple M1', 'integrated'],
    ['ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 (0x00002488) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'discrete'],
    ['ANGLE (AMD, AMD Radeon RX 6600 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'discrete'],
    ['', 'software'],
  ];
  for (const [name, cls] of cases) assert.equal(gpuClass(name), cls, name);
  assert.equal(autoQuality(true), 'low');
});

test('dusk and dawn run at day speed, the whole night still lasts a quarter of DAY_LENGTH', async () => {
  const D = await import('../../shared/sim/day.js');
  const { DAY_LENGTH } = await import('../../shared/world/constants.js');
  const t0 = D.dayTime, c0 = D.dayCount;
  const realBetween = (from, to) => { D.setDay(from); let s = 0; while (D.dayTime < to && D.dayTime >= from) { D.advanceDay(0.02); s += 0.02; } return s; };
  // 18:00–19:00 (slunce do ~15° pod obzorem): stejně rychle jako den (dřív dvakrát rychleji)
  assert.ok(Math.abs(realBetween(0.75, 0.7917) - DAY_LENGTH / 24) < 0.5, 'dusk at day speed');
  // celá noc (slunce pod obzorem) trvá pořád DAY_LENGTH / 4
  D.setDay(0.75); let s = 0;
  while (!(D.sunElevation() >= 0 && D.dayTime < 0.5)) { D.advanceDay(0.02); s += 0.02; }
  assert.ok(Math.abs(s - DAY_LENGTH / 4) < DAY_LENGTH * 0.01, `night lasts ${s} s`);
  assert.ok(D.NIGHT_FAST > 2 && D.NIGHT_FAST < 4, `deep night ${D.NIGHT_FAST}×`);
  D.setDay(t0, c0);
});
