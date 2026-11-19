// Úkoly vězňů v bludišti (server/prison-tasks.js): příklady a hádanky se vymyslí pokaždé znovu a odpověď sedí.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TASK_KINDS, TASK_NEED, logicQuestion, mathQuestion, newTask, rightAnswer, taskQuestion, taskText } from '../../server/prison-tasks.js';

test('prison tasks: four kinds, short (about 5 minutes), Czech texts', () => {
  assert.deepEqual(TASK_KINDS, ['monsters', 'runes', 'math', 'logic']);
  for (const k of TASK_KINDS) { assert.ok(TASK_NEED[k] >= 2 && TASK_NEED[k] <= 4); assert.match(taskText(k, TASK_NEED[k]), /\d/); }
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(newTask().kind);
  assert.equal(seen.size, 4, 'every kind comes up');
  assert.deepEqual(newTask(() => 0.99), { kind: 'logic', need: TASK_NEED.logic });
});

test('math questions: the answer is right (checked by computing the question again)', () => {
  const qs = new Set();
  for (let i = 0; i < 600; i++) {
    const { q, a } = mathQuestion();
    qs.add(q);
    let want;
    const word = q.match(/^V truhle je (\d+) řad po (\d+) diamantech\. (\d+) jich prodáš/);
    const legs = q.match(/^Kolik nohou má (\d+) obřích pavouků a (\d+) slepic/);
    if (word) want = word[1] * word[2] - word[3];
    else if (legs) want = 8 * legs[1] + 2 * legs[2];
    else want = Function(`return ${q.replace(' = ?', '').replace(/×/g, '*').replace(/−/g, '-').replace(/:/g, '/')}`)();
    assert.equal(Number(a), want, q);
    assert.ok(Number.isInteger(want) && want >= 0, `a whole non-negative answer: ${q}`);
  }
  assert.ok(qs.size > 300, 'new questions every time');
});

test('logic questions: sequences, who is tallest, days; the answer fits', () => {
  const DAYS = ['pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota', 'neděle'];
  for (let i = 0; i < 600; i++) {
    const { q, a } = logicQuestion();
    const seq = q.match(/^Jaké číslo je další\? ([\d, ]+), \?$/);
    if (seq) {
      const s = seq[1].split(', ').map(Number), n = Number(a), d = s.slice(1).map((v, j) => v - s[j]);
      const fits = d.every((x) => x === d[0]) ? n - s.at(-1) === d[0]
        : s.slice(1).every((v, j) => v === s[j] * 2) ? n === s.at(-1) * 2
          : d.slice(1).every((x, j) => x === d[j] + 1) ? n - s.at(-1) === d.at(-1) + 1
            : n === s.at(-1) + s.at(-2);
      assert.ok(fits, `${q} → ${a}`);
      continue;
    }
    const day = q.match(/^Dnes je (\S+)\. Jaký den bude za (\d+) dní\?$/);
    if (day) { assert.equal(a, DAYS[(DAYS.indexOf(day[1]) + Number(day[2])) % 7], q); continue; }
    const who = q.match(/^(.+) Kdo je (nejvyšší|nejnižší)\?$/);
    assert.ok(who, `known form: ${q}`);
    const taller = []; // [vyšší, nižší]
    for (const f of who[1].split('. ')) {
      const m = f.replace(/\.$/, '').match(/^(\S+) je (vyšší|nižší) než (\S+)$/);
      taller.push(m[2] === 'vyšší' ? [m[1], m[3]] : [m[3], m[1]]);
    }
    const names = [...new Set(taller.flat())];
    const top = names.find((n) => !taller.some(([, lo]) => lo === n)), bottom = names.find((n) => !taller.some(([hi]) => hi === n));
    assert.equal(a, who[2] === 'nejvyšší' ? top : bottom, q);
  }
  assert.equal(taskQuestion('math', () => 0).q, mathQuestion(() => 0).q);
  assert.equal(taskQuestion('logic', () => 0).q, logicQuestion(() => 0).q);
});

test('answers: numbers with spaces, names and days without capitals or diacritics', () => {
  assert.ok(rightAnswer('42', ' 42 '));
  assert.ok(rightAnswer('42', '42.'));
  assert.ok(!rightAnswer('42', '24'));
  assert.ok(!rightAnswer('42', ''));
  assert.ok(rightAnswer('Gábina', 'gabina'));
  assert.ok(rightAnswer('čtvrtek', 'Ctvrtek'));
  assert.ok(!rightAnswer('čtvrtek', 'pátek'));
});
