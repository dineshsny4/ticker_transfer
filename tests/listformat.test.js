const test = require('node:test');
const assert = require('node:assert');
require('../shared/normalize.js');
require('../shared/listformat.js');
const LF = globalThis.WT.listformat;

const names = (list) => list.sections.map((s) => [s.name, s.symbols.map((x) => `${x.exchange}:${x.symbol}`)]);

test('parses the TradingView export format with sections', () => {
  const { list } = LF.parse('###WEEKLY,NSE:DCMSRIND,NSE:PCJEWELLER,###SEMI ANNUALLY,NSE:FCL');
  assert.deepStrictEqual(names(list), [
    ['WEEKLY', ['NSE:DCMSRIND', 'NSE:PCJEWELLER']],
    ['SEMI ANNUALLY', ['NSE:FCL']],
  ]);
});

test('symbols before the first header have no section name', () => {
  const { list } = LF.parse('NSE:KROSS,###SWING,NSE:PNB');
  assert.deepStrictEqual(names(list), [[null, ['NSE:KROSS']], ['SWING', ['NSE:PNB']]]);
});

test('converts TradingView names to broker names', () => {
  const { list } = LF.parse('NSE:BAJAJ_AUTO,NSE:M_M,NSE:M&M');
  assert.deepStrictEqual(names(list), [[null, ['NSE:BAJAJ-AUTO', 'NSE:M&M']]]);
});

test('plain symbols get NSE, and duplicates are removed', () => {
  const r = LF.parse('KROSS, pnb\nKROSS');
  assert.deepStrictEqual(names(r.list), [[null, ['NSE:KROSS', 'NSE:PNB']]]);
  assert.strictEqual(r.removed.duplicates, 1);
});

test('empty sections are dropped', () => {
  const { list } = LF.parse('###EMPTY,###FULL,NSE:KROSS');
  assert.deepStrictEqual(names(list), [['FULL', ['NSE:KROSS']]]);
});

test('BSE codes are skipped with a reason', () => {
  const r = LF.parse('NSE:KROSS,BSE:500325');
  assert.deepStrictEqual(names(r.list), [[null, ['NSE:KROSS']]]);
  assert.strictEqual(r.skipped[0].reason, 'BSE code with no symbol');
});
