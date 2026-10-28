const test = require('node:test');
const assert = require('node:assert');
const N = require('../shared/normalize.js');

test('matchKey: -BE and -BZ are removed', () => {
  assert.strictEqual(N.matchKey('SKYGOLD-BE'), 'SKYGOLD');
  assert.strictEqual(N.matchKey('XYZ-BZ'), 'XYZ');
  assert.strictEqual(N.matchKey('SKYGOLD-BE'), N.matchKey('SKYGOLD'));
});

test('matchKey: "-", "&" and "_" are the same', () => {
  assert.strictEqual(N.matchKey('BAJAJ-AUTO'), N.matchKey('BAJAJ_AUTO'));
  assert.strictEqual(N.matchKey('M&M'), N.matchKey('M_M'));
  assert.notStrictEqual(N.matchKey('MM'), N.matchKey('M_M'));
});

test('matchKey: only a final -BE/-BZ is a suffix', () => {
  assert.strictEqual(N.matchKey('BEL'), 'BEL');
  assert.strictEqual(N.matchKey('BE-X'), 'BE_X');
});

test('toTradingView: Kite names to TradingView names', () => {
  assert.strictEqual(N.toTradingView('BAJAJ-AUTO'), 'BAJAJ_AUTO');
  assert.strictEqual(N.toTradingView('M&M'), 'M&M');
  assert.strictEqual(N.toTradingView('SKYGOLD-BE'), 'SKYGOLD');
  assert.strictEqual(N.toTradingView('KROSS'), 'KROSS');
});

test('searchTexts: tries each form of the special characters once', () => {
  assert.deepStrictEqual(N.searchTexts('KROSS'), ['KROSS']);
  assert.deepStrictEqual(N.searchTexts('BAJAJ_AUTO'), ['BAJAJ-AUTO', 'BAJAJ&AUTO', 'BAJAJ AUTO']);
  // M_M is in the table, so M&M comes first.
  assert.deepStrictEqual(N.searchTexts('M_M'), ['M&M', 'M-M', 'M M']);
  assert.deepStrictEqual(N.searchTexts('ABC_D'), ['ABC-D', 'ABC&D', 'ABC D']);
});
