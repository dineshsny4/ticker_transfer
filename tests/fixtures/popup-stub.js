// Fake browser API for a visual check of the popup.
(function () {
  const q = new URLSearchParams(location.search);
  const site = q.get('site') || 'kite';
  const urls = { kite: 'https://kite.zerodha.com/dashboard', tv: 'https://www.tradingview.com/chart/', dhan: 'https://tv.dhan.co/', none: 'https://example.com/' };
  const text = '###VR1 first move,NSE:KROSS,NSE:PNB,NSE:PLATIND,NSE:M_M,NSE:BAJAJ_AUTO,NSE:LUMAXTECH,NSE:TATAPOWER,NSE:IRFC,###VR2 pullback,NSE:IXIGO,NSE:DEEPAKFERT,NSE:HAL,NSE:BEL,NSE:CDSL,BSE:533282';
  const store = {
    lastExport: { site: 'TradingView', listName: 'Swing setups', text, symbols: 13, sections: 2, at: Date.now() - 600000,
      out: { text, symbols: 13, sections: 2, skipped: ['BSE:533282'], collapsed: q.get('collapsed') ? ['VR2 pullback'] : [] }, notes: [] },
  };
  const kiteInfo = { ok: true, watchName: 'Swing', count: 40, limit: 250, existing: ['NSE:PNB', 'NSE:TATAPOWER'], groups: ['VR2 pullback'], defaultVisible: true };
  window.browser = {
    tabs: {
      query: async () => [{ id: 1, index: 0, url: urls[site] }],
      sendMessage: async (id, m) => {
        if (m.type === 'kite-info') return kiteInfo;
        if (m.type === 'dhan-info') return { ok: true, listName: 'Weekly' };
        // &run=running|paused|done: an import on the page (Kite or Dhan). Pause and resume change it.
        if (/-pause$/.test(m.type)) window.__paused = true;
        if (/-resume$/.test(m.type)) window.__paused = false;
        if ((m.type === 'kite-status' || m.type === 'dhan-status') && q.get('run')) {
          if (window.__paused === undefined) window.__paused = q.get('run') === 'paused';
          if (q.get('run') !== 'done') q.set('run', 'running');
          const base = { kind: 'import', target: site === 'kite' ? 'Zerodha Kite · list Swing (46 / 250)' : 'Dhan · list Weekly', total: 13,
            tip: 'Keep this tab in front until it finishes.' };
          if (q.get('run') === 'running') return { ...base, running: true, paused: window.__paused, done: 6, status: '6 / 13 · 6 added', now: 'VR1 first move → adding PLATIND…' };
          return { ...base, running: false, done: 13, status: '13 / 13 · 11 added · 2 failed', now: '',
            result: { ok: true, kind: 'good', message: 'All done. New groups: VR1 first move.',
              failed: [{ symbol: 'PLATIND', reason: 'only listed on BSE', section: 'VR1 first move' }, { symbol: 'DEEPAKFERT', reason: "search did not find it on NSE", section: 'VR2 pullback' }] } };
        }
        if (m.type === 'kite-status') return { running: false, kind: null };
        if (m.type === 'dhan-status') return { running: true, done: 7, total: 18, now: 'Looking up LUMAX AUTO TECHNOLOGIES…' };
        if (m.type === 'dhan-export') return { ok: true };
        return { ok: true };
      },
      create: async () => ({}), reload: async () => {},
    },
    storage: { local: { get: async (k) => { const o = {}; for (const x of [].concat(k)) if (x in store) o[x] = store[x]; return o; }, set: async (o) => Object.assign(store, o), remove: async (k) => delete store[k] } },
    scripting: { executeScript: async () => [{ frameId: 0, result: site === 'tv' ? 'Swing setups' : null }] },
    runtime: { getURL: (p) => p },
  };
})();
