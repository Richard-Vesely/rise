// XP, úrovně, mana a kouzla čarovné hole (shared/data/magic.js) a jejich uložení na serveru (server/me.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { SPELLS, SPELL_IDS, XP_MOB, cleanMagic, levelOf, manaMax, offerSpells, spellChoices, xpToNext } from '../../shared/data/magic.js';
import { cleanMe } from '../../server/me.js';

test('magic: levels from XP, more mana with each level', () => {
  assert.deepEqual(levelOf(0), { level: 1, into: 0, need: 20 });
  assert.deepEqual(levelOf(19), { level: 1, into: 19, need: 20 });
  assert.deepEqual(levelOf(20), { level: 2, into: 0, need: 35 });
  assert.equal(levelOf(20 + 35 + 50).level, 4);
  assert.ok(xpToNext(5) > xpToNext(2), 'each level needs more XP');
  assert.ok(manaMax(5) > manaMax(1));
  assert.ok(XP_MOB.dragon > XP_MOB.golem && XP_MOB.golem > XP_MOB.chicken, 'stronger mobs give more XP');
});

test('magic: every spell is complete; stronger spells need a level and the spell before them', () => {
  for (const id of SPELL_IDS) {
    const s = SPELLS[id];
    assert.ok(s.name && s.desc && s.mana > 0 && s.cd > 0 && s.level >= 1, id);
    assert.ok(['útok', 'léčení', 'pohyb', 'užitek'].includes(s.kind), id);
    if (s.needs) assert.ok(SPELLS[s.needs] && SPELLS[s.needs].level < s.level, `${id} needs an easier spell`);
  }
  assert.deepEqual(spellChoices(1, []).sort(), ['bolt', 'leap', 'light'], 'level 1: the three starter spells');
  assert.ok(!spellChoices(10, []).includes('lightning'), 'lightning needs the fireball first');
  assert.ok(spellChoices(8, ['bolt', 'fireball']).includes('lightning'));
});

test('magic: the level-up offer is up to 3 spells, mixed kinds, never one you have', () => {
  const offer = offerSpells(10, ['bolt', 'heal', 'leap', 'light']);
  assert.equal(offer.length, 3);
  assert.equal(new Set(offer.map((id) => SPELLS[id].kind)).size, 3, 'three different kinds when possible');
  assert.ok(offer.every((id) => !['bolt', 'heal', 'leap', 'light'].includes(id)));
  assert.deepEqual(offerSpells(20, SPELL_IDS), [], 'nothing left to learn = no offer');
});

test('magic: the saved state is cleaned (unknown spells and nonsense dropped), the server keeps it', () => {
  assert.deepEqual(cleanMagic({ xp: 55.7, learned: ['bolt', 'nope', 'bolt', 'heal'], sel: 'heal', picks: 1 }), { xp: 55, learned: ['bolt', 'heal'], sel: 'heal', picks: 1 });
  assert.deepEqual(cleanMagic({ xp: -5, learned: 'x', sel: 'nope' }), { xp: 0, learned: [], sel: null, picks: 0 });
  assert.deepEqual(cleanMagic(null), { xp: 0, learned: [], sel: null, picks: 0 }, 'old saves without magic');
  const base = { inv: Array(36).fill(null), armor: [null, null, null, null], pos: [1, 2, 3], yaw: 0, hp: 100, hunger: 100, crafted: {}, placedAny: {}, creative: false, flying: false, flyT: 0 };
  assert.deepEqual(cleanMe({ ...base, magic: { xp: 100, learned: ['bolt'], sel: 'bolt', picks: 0 } }).magic, { xp: 100, learned: ['bolt'], sel: 'bolt', picks: 0 });
  assert.deepEqual(cleanMe(base).magic, { xp: 0, learned: [], sel: null, picks: 0 }, 'old clients still save');
});
