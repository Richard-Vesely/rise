// Ukládání na disk (server/persist.js): denní zálohy, nejvýš 7 posledních.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeJSON } from '../../server/persist.js';

test('daily backups: a new one each day, only the last 7 are kept, other files untouched', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'louka-backups-'));
  try {
    const backups = path.join(dir, 'backups');
    fs.mkdirSync(backups);
    for (let d = 1; d <= 9; d++) fs.writeFileSync(path.join(backups, `world-2020-01-0${d}.json`), '{}');
    fs.writeFileSync(path.join(backups, 'players-2020-01-01.json'), '{}'); // jiný soubor: nesmí zmizet
    writeJSON(path.join(dir, 'world.json'), { ok: 1 }, 'world');
    const left = fs.readdirSync(backups).sort();
    const today = `world-${new Date().toISOString().slice(0, 10)}.json`;
    assert.ok(left.includes(today), 'today has a backup');
    assert.equal(left.filter((f) => f.startsWith('world-')).length, 7, 'only the last 7 world backups stay');
    assert.ok(!left.includes('world-2020-01-01.json') && left.includes('world-2020-01-09.json'), 'the oldest go first');
    assert.ok(left.includes('players-2020-01-01.json'), 'backups of other files are untouched');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
