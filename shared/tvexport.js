// Build the export text from the rows that were read from the TradingView watchlist.
//
// rows: [{ type: 'section', name, collapsed } | { type: 'symbol', id: 'NSE:KROSS' }], in page order.
// Only NSE symbols are kept for now. The other rows are returned in "skipped".
(function () {
  const WT = (globalThis.WT = globalThis.WT || {});

  const EXCHANGE = 'NSE';

  function buildExport(rows) {
    const tokens = [];
    const skipped = [];
    const collapsed = [];
    const seen = new Set();
    let sections = 0;
    let symbols = 0;

    for (const row of rows) {
      if (row.type === 'section') {
        const name = String(row.name || '').trim();
        if (!name) continue;
        tokens.push(`###${name}`);
        sections++;
        if (row.collapsed) collapsed.push(name);
        continue;
      }
      const id = String(row.id || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const colon = id.indexOf(':');
      const exchange = colon > 0 ? id.slice(0, colon) : '';
      if (exchange !== EXCHANGE) {
        skipped.push(id);
        continue;
      }
      tokens.push(id);
      symbols++;
    }

    return { text: tokens.join(','), sections, symbols, skipped, collapsed };
  }

  WT.tvexport = { buildExport };
  if (typeof module !== 'undefined') module.exports = WT.tvexport;
})();
