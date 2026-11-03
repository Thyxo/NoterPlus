import test from 'node:test';
import assert from 'node:assert/strict';
import { wordToDigits, digitsToWord } from '../src/cryptext.js';
import { planName } from '../src/crypt.js';
import { KNOWN_FONTS } from '../src/known.js';

const cx = KNOWN_FONTS[0];
const noter = (w) => planName(w, { font: true, map: cx.map, scores: cx.scores, letterRot: 'rotated', preferDigits: false, caseMode: 'asTyped' });

test('mads → 59841', () => {
  assert.deepEqual(wordToDigits('mads'), { digits: '59841', name: 'mAds', unsupported: [] });
  assert.equal(wordToDigits('Mads').digits, '59841');
});

test('samme tal som Noter+ forudsigelse', () => {
  for (const w of ['fortnite', 'Lise', 'Freja', 'Rose', 'Anna Bo', 'pizza', 'Kim', 'WIFI']) {
    const r = wordToDigits(w);
    assert.equal(r.digits, noter(r.name).digits, w);
    if (!/o$/i.test(w)) assert.ok(!r.digits.startsWith('0'), w);
  }
});

test('æøå, tal og tegn springes over', () => {
  const r = wordToDigits('Søren 2!');
  assert.deepEqual(r.unsupported, ['ø', '2', '!']);
  assert.equal(r.digits, noter(r.name).digits);
  assert.equal(r.name.toLowerCase(), 'sren');
  assert.deepEqual(wordToDigits(''), { digits: '', name: '', unsupported: [] });
});

test('digitsToWord læser tilbage', () => {
  assert.equal(wordToDigits(digitsToWord('59841')).digits, '59841');
});
