import test from 'node:test';
import assert from 'node:assert/strict';
import { planName, planNumber, normalizeName, readUpsideDown, danishGroup, applyCase } from '../src/crypt.js';
import { KNOWN_FONTS } from '../src/known.js';
import { cleanRoom, newRoomCode } from '../src/link.js';

const cx = KNOWN_FONTS[0];
const withFont = (name, extra = {}) =>
  planName(name, { font: true, map: cx.map, scores: cx.scores, letterRot: 'rotated', preferDigits: false, ...extra });

test('uden font: LISE bliver 3517 (vendt læses LISE)', () => {
  const p = planName('Lise', { font: false, caseMode: 'upper' });
  assert.equal(p.digits, '3517');
  assert.equal(readUpsideDown(p.digits), 'LISE');
  assert.ok(p.complete);
  assert.ok(p.glyphs.every((g) => g.src === 'digit' && g.rot === 0));
});

test('uden font: bogstaver uden tal giver advarsel', () => {
  const p = planName('Mads', { font: false });
  assert.equal(p.complete, false);
  assert.ok(p.warnings.some((w) => w.includes('Uden Cryptext-fonten')));
});

test('med Cryptext: tal-visningen er navnet baglæns, bogstaverne drejet', () => {
  const p = withFont('Rose');
  // e s o R → 2 5 0 21
  assert.equal(p.digits, '25021');
  assert.deepEqual(p.glyphs.map((g) => g.ch), ['e', 's', 'o', 'R']);
  assert.ok(p.glyphs.every((g) => g.rot === 180 && g.src === 'font'));
});

test('med Cryptext: alle danske drenge- og pigenavne giver et tal', () => {
  const names = ['Oskar', 'William', 'Mette', 'Søren', 'Freja', 'Ida', 'Noah', 'Emma', 'Mads', 'Anne', 'Lærke', 'Åse', 'Christian', 'Mathilde', 'Victor', 'Xenia', 'Jakob', 'Kasper'];
  for (const n of names) {
    const p = withFont(n, { caseMode: 'best' });
    assert.ok(p.complete, n);
    assert.match(p.digits, /^\d+$/, n);
  }
});

test('Bedste: vælger det store eller lille bogstav, der ligner et tal bedst', () => {
  // M er svag (41), m er tydelig (41); D er tydelig (0), d er svag
  const p = withFont('Mads', { caseMode: 'best' });
  assert.equal(p.name, 'maDs');
  assert.equal(p.digits, '50041');
  assert.equal(p.warnings.filter((w) => w.startsWith('Svage')).length, 0);
});

test('tal-tegn for klassiske bogstaver, når det ønskes', () => {
  const p = withFont('LISE', { preferDigits: true });
  assert.equal(p.digits, '3517');
  assert.ok(p.glyphs.every((g) => g.src === 'digit'));
});

test('æøå og accenter skrives om', () => {
  assert.equal(normalizeName('  Søren  Ærø-Åse! '), 'Soeren Aeroe Aase');
  assert.equal(normalizeName('Zoë'), 'Zoe');
  assert.equal(applyCase('anna hansen', 'title'), 'Anna Hansen');
});

test('mellemrum vises i tegningen men ikke i tallet', () => {
  const p = withFont('Bo Ib');
  assert.equal(p.glyphs.filter((g) => g.ch === ' ').length, 1);
  assert.match(p.digits, /^\d+$/);
});

test('advarsel når tallet starter med 0', () => {
  const p = planName('OLE', { font: false });
  assert.equal(p.digits, '370');
  const q = planName('LEO', { font: false });
  assert.equal(q.digits, '037');
  assert.ok(q.warnings.some((w) => w.includes('starter med 0')));
});

test('rene tal og lommeregner-resultater', () => {
  assert.equal(planNumber('1.628.345.669').digits, '1628345669');
  assert.equal(planNumber('-12,5').glyphs.filter((g) => g.src === 'punct').length, 2);
  assert.equal(danishGroup('1628345669'), '1.628.345.669');
  assert.equal(readUpsideDown('0773'), 'ELLO');
});

test('rum-koder', () => {
  assert.equal(cleanRoom(' Lise-42! '), 'lise-42');
  for (let i = 0; i < 50; i++) assert.match(newRoomCode(), /^[a-z2-9]{6}$/);
});

test('Cryptext-tabellen dækker hele alfabetet i begge størrelser', () => {
  for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz') {
    assert.match(cx.map[c], /^\d{1,2}$/, c);
  }
});

test('Bedste: undgår 0 som første ciffer, når det kan lade sig gøre', () => {
  const p = withFont('Freja', { caseMode: 'best' });
  assert.equal(p.name, 'FrEjA');
  assert.equal(p.digits, '81311');
  assert.ok(!p.warnings.some((w) => w.includes('starter med 0')));
});
