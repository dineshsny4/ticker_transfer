const test = require('node:test');
const assert = require('node:assert');
const { buildExport } = require('../shared/tvexport.js');

const sec = (name, collapsed = false) => ({ type: 'section', name, collapsed });
const sym = (id) => ({ type: 'symbol', id });

test('writes sections and NSE symbols in page order', () => {
  const rows = [sec('WEEKLY'), sym('NSE:DCMSRIND'), sym('NSE:PCJEWELLER'), sec('MONTHLY'), sym('NSE:SHANTIGOLD'), sec('SEMI ANNUALLY'), sym('NSE:FCL')];
  const out = buildExport(rows);
  assert.strictEqual(out.text, '###WEEKLY,NSE:DCMSRIND,NSE:PCJEWELLER,###MONTHLY,NSE:SHANTIGOLD,###SEMI ANNUALLY,NSE:FCL');
  assert.strictEqual(out.symbols, 4);
  assert.strictEqual(out.sections, 3);
});

test('a list with no sections gives symbols only', () => {
  const out = buildExport([sym('NSE:KROSS'), sym('NSE:PNB')]);
  assert.strictEqual(out.text, 'NSE:KROSS,NSE:PNB');
  assert.strictEqual(out.sections, 0);
});

test('symbols before the first section come first, with no header', () => {
  const out = buildExport([sym('NSE:KROSS'), sec('SWING'), sym('NSE:PNB')]);
  assert.strictEqual(out.text, 'NSE:KROSS,###SWING,NSE:PNB');
});

test('keeps NSE only and lists the others', () => {
  const out = buildExport([sym('NSE:KROSS'), sym('BSE:500325'), sym('NASDAQ:AAPL'), sym('NSE:M&M')]);
  assert.strictEqual(out.text, 'NSE:KROSS,NSE:M&M');
  assert.deepStrictEqual(out.skipped, ['BSE:500325', 'NASDAQ:AAPL']);
});

test('removes duplicate symbols', () => {
  const out = buildExport([sym('NSE:KROSS'), sym('NSE:KROSS')]);
  assert.strictEqual(out.text, 'NSE:KROSS');
});

test('a collapsed section keeps its header and is reported', () => {
  const out = buildExport([sec('WEEKLY', true), sec('MONTHLY'), sym('NSE:SKYGOLD')]);
  assert.strictEqual(out.text, '###WEEKLY,###MONTHLY,NSE:SKYGOLD');
  assert.deepStrictEqual(out.collapsed, ['WEEKLY']);
});

test('the example list from the user comes out the same', () => {
  const example = '###WEEKLY,NSE:DCMSRIND,NSE:PCJEWELLER,###MONTHLY,NSE:SHANTIGOLD,NSE:SKYGOLD,NSE:SSWL,NSE:ORIENTCABL,###QUATERLY,NSE:RATNAVEER,NSE:TFCILTD,NSE:RAYMOND,NSE:TECHNOCRAF,NSE:MARINE,NSE:INDOMIM,NSE:DHOOTTRANS,NSE:MOLBIO,NSE:SHUKRAPHAR,NSE:MVELECTRO,NSE:KROSS,NSE:WELCORP,NSE:CYIENT,NSE:CUPID,NSE:SHILPAMED,NSE:MANINDS,NSE:STEAMHOUSE,NSE:PVRINOX,NSE:REDINGTON,NSE:RBA,NSE:SAMBHV,###SEMI ANNUALLY,NSE:FCL,NSE:CYIENTDLM,NSE:IBULLSLTD,NSE:IOLCP,NSE:SHADOWFAX,NSE:AEGISLOG,NSE:ANTELOPUS,NSE:LAURUSLABS,NSE:CEMPRO,NSE:AVALON,NSE:PAISALO,NSE:GRWRHITECH,NSE:CARTRADE,NSE:OPTIEMUS,NSE:CPPLUS,NSE:KISSHT,NSE:GLAND,NSE:COFORGE,NSE:SANSERA,NSE:WELSPUNLIV,NSE:OMNI,NSE:RUBICON,NSE:ATHERENERG,NSE:AEROFLEX,NSE:RRKABEL';
  const rows = example.split(',').map((t) => (t.startsWith('###') ? sec(t.slice(3)) : sym(t)));
  const out = buildExport(rows);
  assert.strictEqual(out.text, example);
  assert.strictEqual(out.sections, 4);
  assert.strictEqual(out.symbols, 52);
});
