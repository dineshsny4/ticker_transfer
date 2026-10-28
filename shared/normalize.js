// Symbol name conversion between TradingView and the brokers.
//
// The canonical form is the NSE/BSE trading symbol that brokers use: M&M, BAJAJ-AUTO.
// TradingView writes "-" as "_" (BAJAJ_AUTO). Some lists also write "&" as "_" (M_M).
// Kite adds a series suffix to some NSE symbols: XYZ-BE, XYZ-BZ. TradingView has only XYZ.
//
// To compare two names from different sites, use matchKey(): it removes the -BE/-BZ suffix
// and writes "-", "&" and "_" all as "_". So BAJAJ-AUTO, BAJAJ_AUTO, M&M, M_M and XYZ-BE
// match their TradingView or Kite forms.
(function () {
  const WT = (globalThis.WT = globalThis.WT || {});

  // Symbols where "_" stands for "&", not for "-". Used only to pick the first search text.
  const AMPERSAND = {
    M_M: 'M&M',
    M_MFIN: 'M&MFIN',
    J_KBANK: 'J&KBANK',
    GMRP_UI: 'GMRP&UI',
    ARE_M: 'ARE&M',
    S_SPOWER: 'S&SPOWER',
  };

  const SERIES = /-(BE|BZ)$/;

  function toCanonical(symbol) {
    const s = String(symbol).trim().toUpperCase();
    if (AMPERSAND[s]) return AMPERSAND[s];
    return s.replace(/_/g, '-');
  }

  // Remove the Kite series suffix: XYZ-BE -> XYZ.
  function stripSeries(symbol) {
    return String(symbol).trim().toUpperCase().replace(SERIES, '');
  }

  // One form for comparing names across sites.
  function matchKey(symbol) {
    return stripSeries(symbol).replace(/[-&_]/g, '_');
  }

  // A TradingView symbol: no series suffix, and "_" for "-". "&" stays: TradingView's own
  // symbol is NSE:M&M (its symbol search returns that), and NSE:M_M does not exist there.
  function toTradingView(symbol) {
    return stripSeries(symbol).replace(/-/g, '_');
  }

  // The texts to type in a broker search, most likely first. Each special character can be
  // "-", "&" or a space at the broker, so try each form once.
  function searchTexts(symbol) {
    const canon = toCanonical(symbol);
    const k = matchKey(symbol);
    const out = [canon, k.replace(/_/g, '-'), k.replace(/_/g, '&'), k.replace(/_/g, ' ')];
    return [...new Set(out)];
  }

  function key(exchange, symbol) {
    return `${String(exchange).toUpperCase()}:${matchKey(symbol)}`;
  }

  WT.normalize = { toCanonical, stripSeries, matchKey, toTradingView, searchTexts, key };
  if (typeof module !== 'undefined') module.exports = WT.normalize;
})();
