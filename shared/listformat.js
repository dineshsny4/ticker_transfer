// List format: parse pasted text or files, and write the TradingView .txt format.
//
// A list is: { sections: [{ name: string|null, symbols: [{ exchange, symbol }] }] }
// The first section can have no name (the stocks before the first ### header).
// Symbols are kept in the canonical (broker) form, for example NSE:M&M and NSE:BAJAJ-AUTO.
(function () {
  const WT = (globalThis.WT = globalThis.WT || {});

  const SYMBOL_RE = /^[A-Z0-9][A-Z0-9&\-.]*$/;
  const KNOWN_EXCHANGES = new Set(['NSE', 'BSE']);

  function splitTokens(text) {
    return text
      .split(/[\r\n,;\t]+/)
      .map((t) => t.trim().replace(/^["']+|["']+$/g, '').trim())
      .filter(Boolean);
  }

  // Find the "Symbol" column in a CSV. Return null if the text is not a CSV with a header row.
  function csvSymbolColumn(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return null;
    const header = lines[0].split(/[,;\t]/).map((h) => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
    const col = header.findIndex((h) => h === 'symbol' || h === 'ticker' || h === 'tradingsymbol' || h === 'nse code' || h === 'nse symbol');
    if (col < 0) return null;
    const exCol = header.findIndex((h) => h === 'exchange');
    return { lines: lines.slice(1), col, exCol };
  }

  // Parse one token like "NSE:KROSS", "KROSS" or "BAJAJ_AUTO".
  // Return { exchange, symbol } or { error }.
  function parseToken(token, defaultExchange) {
    let exchange = defaultExchange || 'NSE';
    let symbol = token.toUpperCase();
    const colon = symbol.indexOf(':');
    if (colon > 0) {
      exchange = symbol.slice(0, colon).trim();
      symbol = symbol.slice(colon + 1).trim();
    }
    symbol = WT.normalize.toCanonical(symbol);
    if (/^\d+$/.test(symbol)) return { error: 'BSE code with no symbol' };
    if (!SYMBOL_RE.test(symbol)) return { error: 'not a stock symbol' };
    if (!KNOWN_EXCHANGES.has(exchange)) return { exchange, symbol, error: `${exchange} is not NSE or BSE` };
    return { exchange, symbol };
  }

  // Parse pasted text or file text.
  // Return { list, removed: { headers, duplicates }, skipped: [{ raw, reason }] }.
  function parse(text) {
    const sections = [{ name: null, symbols: [] }];
    const seen = new Set();
    const skipped = [];
    let headers = 0;
    let duplicates = 0;

    const add = (raw, defaultExchange) => {
      const p = parseToken(raw, defaultExchange);
      if (p.error) {
        skipped.push({ raw, reason: p.error });
        return;
      }
      const key = `${p.exchange}:${p.symbol}`;
      if (seen.has(key)) {
        duplicates++;
        return;
      }
      seen.add(key);
      sections[sections.length - 1].symbols.push({ exchange: p.exchange, symbol: p.symbol });
    };

    const csv = csvSymbolColumn(text || '');
    if (csv) {
      headers++;
      for (const line of csv.lines) {
        const cells = line.split(/[,;\t]/).map((c) => c.trim().replace(/^["']|["']$/g, ''));
        const raw = cells[csv.col];
        if (!raw) continue;
        const ex = csv.exCol >= 0 ? (cells[csv.exCol] || '').toUpperCase() : '';
        add(raw, KNOWN_EXCHANGES.has(ex) ? ex : 'NSE');
      }
    } else {
      for (const token of splitTokens(text || '')) {
        if (token.startsWith('###')) {
          const name = token.slice(3).trim();
          headers++;
          if (name) sections.push({ name, symbols: [] });
          continue;
        }
        if (/^(symbol|symbols|ticker|stock|name)$/i.test(token)) {
          headers++;
          continue;
        }
        add(token, 'NSE');
      }
    }

    return {
      list: { sections: sections.filter((s) => s.symbols.length > 0) },
      removed: { headers, duplicates },
      skipped,
    };
  }

  // Build a list from an array of TradingView tokens, for example ["###A", "NSE:X"].
  function fromTokens(tokens) {
    return parse(tokens.join(','));
  }

  function count(list) {
    return list.sections.reduce((n, s) => n + s.symbols.length, 0);
  }

  // Write the TradingView watchlist .txt format.
  function toTradingViewText(list) {
    const out = [];
    for (const s of list.sections) {
      if (s.name) out.push(`###${s.name}`);
      for (const it of s.symbols) out.push(`${it.exchange}:${WT.normalize.toTradingView(it.symbol)}`);
    }
    return out.join(',');
  }

  // Write plain symbols only (for Chartink and similar).
  function toPlainSymbols(list) {
    return list.sections.flatMap((s) => s.symbols.map((it) => it.symbol)).join(', ');
  }

  WT.listformat = { parse, fromTokens, count, toTradingViewText, toPlainSymbols, parseToken };
})();
