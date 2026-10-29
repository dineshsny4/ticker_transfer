// Dhan (tv.dhan.co): read the open watchlist for Export, and add a list for Import.
//
// The chart is TradingView's Trading Terminal library in <iframe title="Financial Chart">.
// The frame address is a blob: URL of the same origin, so this script runs in the top page
// and works inside iframe.contentDocument.
//
// Markers (from the user's DOM captures of the frame):
//   list name:      [data-name="watchlists-button"]
//   symbol row:     [data-symbol-full="NSEE14014:LUMAX AUTO TECHNOLOGIES"]  (Dhan ID + company name)
//   section row:    .separator-… > .label-…  (text = section name), inside [data-name="tree"]
//   add button:     button[data-name="add-symbol-button"]
//   dialog:         [data-name="watchlist-symbol-search-dialog"], input[data-qa-id="symbol-search-input"]
//   search result:  [data-name="symbol-search-dialog-content-item"][data-symbol-name="NSEE25252:KROSS"],
//                   title [data-name="list-item-title"] "KROSS-EQ", exchange .exchangeName-… "NSE"
//
// A watchlist row has no ticker, only the company name. So Export looks up each row in Dhan's
// own search (by company name) and takes the ticker from the result with the same Dhan ID.
// Import looks up each symbol, picks the NSE result whose title is SYMBOL-EQ, and then pastes
// all Dhan IDs (with ###sections) into the Add symbol box in one step and presses Enter.
//
// Safety: the only clicks are the Add symbol button and the dialog's close button
// (safeClick). The only key press is Enter in the dialog's search box. The Dhan page also has
// Buy/Sell and order controls: this script never touches them.
(function () {
  if (window.__wtDhan) return;
  window.__wtDhan = true;
  // shared/normalize.js is injected before this file.
  const N = globalThis.WT.normalize;

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

  function visible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  async function waitFor(fn, maxMs = 3000, step = 80) {
    const until = Date.now() + maxMs;
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() > until) return null;
      await wait(step);
    }
  }

  // The document of the chart frame, or null.
  function chartDoc() {
    const frames = [...document.querySelectorAll('iframe[title="Financial Chart"], #tv_chart_container iframe')];
    for (const f of frames) {
      try {
        const d = f.contentDocument;
        if (d && d.querySelector('[data-name="watchlists-button"]')) return d;
      } catch (e) {
        // Not reachable. Try the next frame.
      }
    }
    return null;
  }

  // Dhan writes NSE equity as "SYMBOL-EQ". Compare names without -EQ, with the usual rules.
  const dhanKey = (title) => N.matchKey(String(title).trim().toUpperCase().replace(/-EQ$/, ''));
  const dhanTicker = (title) => String(title).trim().toUpperCase().replace(/-EQ$/, '');

  // ---- Click guard ---------------------------------------------------------------------------

  function safeClick(el, kind) {
    const rules = {
      addSymbol: (e) => e.matches('button[data-name="add-symbol-button"]') && /add symbol/i.test(e.getAttribute('aria-label') || ''),
      closeDialog: (e) => e.matches('button[data-qa-id="close"]') && !!e.closest('[data-name="watchlist-symbol-search-dialog"]'),
    };
    if (!el || !rules[kind] || !rules[kind](el)) throw new Error(`Click guard: refused a "${kind}" click.`);
    el.click();
  }

  // ---- Page ----------------------------------------------------------------------------------

  function widget(doc) {
    const btn = [...doc.querySelectorAll('[data-name="watchlists-button"]')].find(visible);
    if (!btn) return null;
    const root = btn.closest('[data-test-id-widget-type="watchlist"]') || doc.querySelector('[data-test-id-widget-type="watchlist"]') || doc.body;
    return { btn, root, listName: text(btn) };
  }

  function info() {
    const doc = chartDoc();
    if (!doc) return { ok: false, error: 'no-chart' };
    const w = widget(doc);
    if (!w) return { ok: false, error: 'panel-closed' };
    return { ok: true, listName: w.listName, running: job.running };
  }

  // Find the element that scrolls the list.
  function findScroller(row, root) {
    for (let el = row.parentElement; el && el !== root.parentElement; el = el.parentElement) {
      if (el.scrollHeight > el.clientHeight + 1) {
        const before = el.scrollTop;
        el.scrollTop = before + 1;
        const moved = el.scrollTop !== before;
        el.scrollTop = before;
        if (moved) return el;
      }
    }
    return null;
  }

  // Read the rows that are drawn now, with their position from the top of the list.
  function collect(tree, scroller, found) {
    const base = scroller ? scroller.getBoundingClientRect().top - scroller.scrollTop : 0;
    for (const el of tree.querySelectorAll('[data-symbol-full], [class^="separator-"], [class*=" separator-"]')) {
      if (!visible(el)) continue;
      const top = Math.round(el.getBoundingClientRect().top - base);
      const id = el.getAttribute('data-symbol-full');
      if (id) {
        found.set(`s:${id}`, { top, row: { type: 'symbol', id, name: el.getAttribute('data-symbol-short') || '' } });
      } else {
        const label = el.querySelector('[class^="label-"], [class*=" label-"]');
        const name = text(label);
        if (name && !found.has(`h:${name}`)) found.set(`h:${name}`, { top, row: { type: 'section', name } });
      }
    }
  }

  // Read the whole list. The list draws only the rows in view, so scroll through it.
  async function readRows(doc, w) {
    const tree = w.root.querySelector('[data-name="tree"]') || w.root;
    const first = tree.querySelector('[data-symbol-full], [class^="separator-"], [class*=" separator-"]');
    if (!first) return [];
    const scroller = findScroller(first, tree);
    const found = new Map();
    if (!scroller) {
      collect(tree, null, found);
    } else {
      const start = scroller.scrollTop;
      scroller.scrollTop = 0;
      await wait(250);
      for (let step = 0; step < 2000; step++) {
        collect(tree, scroller, found);
        if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) break;
        const before = scroller.scrollTop;
        scroller.scrollTop = before + Math.max(30, Math.floor(scroller.clientHeight * 0.6));
        await wait(250);
        if (scroller.scrollTop === before) {
          collect(tree, scroller, found);
          break;
        }
      }
      scroller.scrollTop = start;
    }
    return [...found.values()].sort((a, b) => a.top - b.top).map((x) => x.row);
  }

  // ---- Add symbol dialog ---------------------------------------------------------------------

  const DIALOG = '[data-name="watchlist-symbol-search-dialog"]';

  async function openDialog(doc, w) {
    let input = [...doc.querySelectorAll(`${DIALOG} input[data-qa-id="symbol-search-input"]`)].find(visible);
    if (input) return input;
    const btn = [...w.root.querySelectorAll('button[data-name="add-symbol-button"]')].find(visible);
    if (!btn) throw new Error('The "Add symbol" button of the watchlist was not found.');
    safeClick(btn, 'addSymbol');
    input = await waitFor(() => [...doc.querySelectorAll(`${DIALOG} input[data-qa-id="symbol-search-input"]`)].find(visible), 4000);
    if (!input) throw new Error('The "Add symbol" dialog did not open.');
    return input;
  }

  function closeDialog(doc) {
    const btn = [...doc.querySelectorAll(`${DIALOG} button[data-qa-id="close"]`)].find(visible);
    if (btn) safeClick(btn, 'closeDialog');
  }

  // Put text in the search box with the input's own value setter, so that the page sees it.
  function setInput(input, value) {
    const W = input.ownerDocument.defaultView;
    input.focus();
    Object.getOwnPropertyDescriptor(W.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new W.Event('input', { bubbles: true }));
  }

  function results(doc) {
    return [...doc.querySelectorAll(`${DIALOG} [data-name="symbol-search-dialog-content-item"]`)].map((el) => ({
      el,
      id: el.getAttribute('data-symbol-name') || '',
      title: el.querySelector('[data-name="list-item-title"]')?.getAttribute('data-overflow-tooltip-text') || text(el.querySelector('[data-name="list-item-title"]')),
      exchange: text(el.querySelector('[class^="exchangeName-"], [class*=" exchangeName-"]')),
    }));
  }

  const isNse = (r) => r.exchange === 'NSE' && /^NSEE\d+:/.test(r.id);

  // Export: the ticker of a watchlist row. Search by company name, take the result with the
  // same Dhan ID. Return the ticker (no -EQ) or null.
  async function tickerOf(doc, input, row) {
    const dhanId = row.id.split(':')[0];
    setInput(input, row.name || row.id.split(':').slice(1).join(':'));
    const hit = await waitFor(() => results(doc).find((r) => r.id.split(':')[0] === dhanId), 3000);
    return hit ? dhanTicker(hit.title) : null;
  }

  // Import: the Dhan ID of an NSE symbol. Return { id } or { reason }.
  async function dhanIdOf(doc, input, symbol) {
    const want = N.matchKey(symbol);
    let bseOnly = false;
    for (const q of N.searchTexts(symbol)) {
      setInput(input, q);
      const hit = await waitFor(() => {
        const same = results(doc).filter((r) => dhanKey(r.title) === want);
        const nse = same.filter(isNse);
        // Prefer the -EQ listing (equity), then any NSE listing with the same name.
        return nse.find((r) => /-EQ$/i.test(r.title)) || nse[0] || null;
      }, 2500);
      if (hit) return { id: hit.id };
      if (results(doc).some((r) => dhanKey(r.title) === want && r.exchange === 'BSE')) bseOnly = true;
    }
    return { reason: bseOnly ? 'only listed on BSE in Dhan' : "Dhan's search did not find it on NSE" };
  }

  // ---- Jobs ----------------------------------------------------------------------------------

  const job = { running: false, kind: null, done: 0, total: 0, now: '', status: '', target: '', tip: '', result: null, stop: false, paused: false };

  // Wait while the user has paused the job (Stop in the popup asks: continue or exit).
  // Return true when the job must stop.
  async function stopNow() {
    while (job.paused && !job.stop) await wait(200);
    return job.stop;
  }

  function progress(done, total, now) {
    job.done = done;
    job.total = total;
    job.now = now;
    job.status = job.kind === 'import' && total ? `${done} / ${total} looked up` : '';
  }

  // ---- Import ----------------------------------------------------------------------------------
  // The import runs in the page. The popup reads the job with dhan-status and shows the progress
  // and the result in its Import tab, the same as for Kite. The run goes on when the popup closes.

  const IMPORT_ERRORS = {
    'no-chart': 'The Dhan chart is not loaded yet. Wait for the chart, then try again.',
    'panel-closed': 'Open the Watchlist panel on the right side of the Dhan chart, then try again.',
    'none-found': "Dhan's search did not find any of the symbols on NSE. Nothing was added.",
    'not-accepted': 'Dhan did not take the list. The "Add symbol" dialog is still open. Press Enter in it, or close it.',
    stopped: 'Stopped. Nothing was added.',
  };

  // Add the text that the popup shows: message, kind ('good' | 'bad' | 'info') and retryAll
  // (Retry sends the same list again, because Dhan did not take the list).
  function withMessage(res) {
    if (res.ok) {
      return { ...res, kind: 'good', message: `Done. Dhan took ${res.added} symbol${res.added === 1 ? '' : 's'} into "${res.listName}". Check the list in the Watchlist panel.` };
    }
    const message = res.error === 'exception' ? `Could not add the list: ${res.message}` : IMPORT_ERRORS[res.error] || `Could not add the list (${res.error}).`;
    const retryAll = !(res.failed && res.failed.length) && (res.error === 'not-accepted' || res.error === 'exception');
    return { ...res, kind: res.error === 'stopped' ? 'info' : 'bad', message, retryAll };
  }

  function startImport(sections) {
    const i = info();
    const r = start('import', async () => {
      try {
        return withMessage(await runImport(sections));
      } catch (e) {
        return withMessage({ ok: false, error: 'exception', message: String((e && e.message) || e) });
      }
    });
    if (r.ok) {
      job.target = `Dhan · list ${i.listName || ''}`;
      job.tip = 'Dhan looks up each symbol in its search (about one second each). Keep this tab in front until it finishes.';
    }
    return r;
  }

  async function runExport() {
    const doc = chartDoc();
    if (!doc) return { ok: false, error: 'no-chart' };
    const w = widget(doc);
    if (!w) return { ok: false, error: 'panel-closed' };
    progress(0, 0, 'Reading the watchlist…');
    const rows = await readRows(doc, w);
    const symbols = rows.filter((r) => r.type === 'symbol');
    if (!symbols.length) return { ok: false, error: 'list-empty', listName: w.listName };

    const out = [];
    const notFound = [];
    const input = await openDialog(doc, w);
    try {
      let n = 0;
      for (const r of rows) {
        if (await stopNow()) break;
        if (r.type === 'section') {
          out.push(r);
          continue;
        }
        n++;
        progress(n, symbols.length, `Looking up ${r.name}…`);
        if (!/^NSEE\d+:/.test(r.id)) {
          // Not NSE: the export leaves it out and names it. "BSEE590001:NAME" → "BSE:NAME".
          out.push({ type: 'symbol', id: r.id.replace(/^([A-Z]+?)E\d+:/, '$1:') });
          continue;
        }
        const t = await tickerOf(doc, input, r);
        if (t) out.push({ type: 'symbol', id: `NSE:${N.toTradingView(t)}` });
        else notFound.push(r.name || r.id);
      }
    } finally {
      setInput(input, '');
      closeDialog(doc);
    }
    const notes = [];
    if (notFound.length) notes.push(`Not found in Dhan's search, left out (${notFound.length}): ${notFound.slice(0, 8).join(', ')}${notFound.length > 8 ? ' …' : ''}.`);
    if (job.stop) notes.push('Stopped before the end of the list.');
    return { ok: true, listName: w.listName, rows: out, notes };
  }

  // sections: [{ name: string|null, symbols: ['KROSS', ...] }]
  async function runImport(sections) {
    const doc = chartDoc();
    if (!doc) return { ok: false, error: 'no-chart' };
    const w = widget(doc);
    if (!w) return { ok: false, error: 'panel-closed' };
    const total = sections.reduce((n, s) => n + s.symbols.length, 0);
    const tokens = [];
    const failed = [];
    let found = 0;
    const input = await openDialog(doc, w);
    let n = 0;
    for (const s of sections) {
      const ids = [];
      for (const sym of s.symbols) {
        if (await stopNow()) break;
        n++;
        progress(n, total, `Looking up ${sym}…`);
        const r = await dhanIdOf(doc, input, sym);
        if (r.id) ids.push(r.id);
        else failed.push({ symbol: sym, reason: r.reason, section: s.name || null });
      }
      if (ids.length) {
        if (s.name) tokens.push(`###${s.name}`);
        tokens.push(...ids);
        found += ids.length;
      }
      if (job.stop) break;
    }
    if (job.stop) {
      setInput(input, '');
      closeDialog(doc);
      return { ok: false, error: 'stopped', failed };
    }
    if (!tokens.length) {
      setInput(input, '');
      closeDialog(doc);
      return { ok: false, error: 'none-found', failed };
    }

    // One step: the whole list in the search box, then Enter (keyCode 13, as TradingView reads).
    progress(total, total, 'Adding the list…');
    const listText = tokens.join(',');
    setInput(input, listText);
    await wait(400);
    const W = input.ownerDocument.defaultView;
    const key = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    input.dispatchEvent(new W.KeyboardEvent('keydown', key));
    input.dispatchEvent(new W.KeyboardEvent('keyup', key));
    // TradingView closes the dialog, or clears the box, when it has taken the list.
    const taken = await waitFor(() => !input.isConnected || !visible(input) || input.value !== listText, 6000);
    if (!taken) return { ok: false, error: 'not-accepted', failed };
    closeDialog(doc);
    return { ok: true, listName: w.listName, added: found, failed };
  }

  function start(kind, fn) {
    if (job.running) return { ok: false, error: 'running' };
    Object.assign(job, { running: true, kind, done: 0, total: 0, now: '', status: '', target: '', tip: '', result: null, stop: false, paused: false });
    fn()
      .then((r) => (job.result = r))
      .catch((e) => (job.result = { ok: false, error: 'exception', message: String((e && e.message) || e) }))
      .finally(() => (job.running = false));
    return { ok: true };
  }

  browser.runtime.onMessage.addListener((msg) => {
    if (!msg || typeof msg.type !== 'string') return undefined;
    if (msg.type === 'dhan-info') return Promise.resolve(info());
    if (msg.type === 'dhan-export') return Promise.resolve(start('export', runExport));
    if (msg.type === 'dhan-import') return Promise.resolve(startImport(msg.sections));
    // Stop pauses the job after the current lookup. Then the user picks: continue (resume) or exit (stop).
    if (msg.type === 'dhan-pause') {
      if (job.running) job.paused = true;
      return Promise.resolve({ ok: true });
    }
    if (msg.type === 'dhan-resume') {
      job.paused = false;
      return Promise.resolve({ ok: true });
    }
    if (msg.type === 'dhan-stop') {
      job.stop = true;
      return Promise.resolve({ ok: true });
    }
    if (msg.type === 'dhan-status') {
      const { running, kind, done, total, now, status, target, tip } = job;
      return Promise.resolve({ running, paused: running && job.paused, kind, done, total, now, status, target, tip, result: running ? null : job.result });
    }
    // The user closed the import result in the popup.
    if (msg.type === 'dhan-clear') {
      if (!job.running) job.result = null;
      return Promise.resolve({ ok: true });
    }
    return undefined;
  });
})();
