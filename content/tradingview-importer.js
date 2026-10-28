// TradingView importer.
//
// Adds a whole list to the open TradingView watchlist in one step, the way a user can do it:
//   1. Click the watchlist's "Add symbol" button ([data-name="add-symbol-button"]).
//   2. Put the list in the dialog's search box: "###WEEKLY,NSE:DCMSRIND,NSE:PCJEWELLER,...".
//   3. Press Enter.
// TradingView's own dialog code (chunk 26873, function wt) splits text with a comma into items
// and adds them all to the list. "###NAME" items become sections. TradingView does not add a
// symbol that is already in the list.
//
// The popup loads this file and injects the functions with scripting.executeScript({ func }).
// Each function must not use anything outside itself.
//
// tvStartImport(text) starts the import and returns at once. The result goes as JSON into an
// attribute on <html>. tvPollImport() returns it when it is ready.

/* exported tvStartImport, tvPollImport */

function tvStartImport(text) {
  const ATTR = 'data-wt-import';
  const html = document.documentElement;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  async function waitFor(fn, maxMs) {
    const until = Date.now() + maxMs;
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() > until) return null;
      await wait(80);
    }
  }
  const DIALOG = '[data-name="watchlist-symbol-search-dialog"]';
  const INPUT = `${DIALOG} input[data-qa-id="symbol-search-input"]`;

  // Click guard: this importer clicks one control only, the watchlist's Add symbol button.
  function clickAddSymbol(btn) {
    const ok = btn && btn.matches('button[data-name="add-symbol-button"]') && /add symbol/i.test(btn.getAttribute('aria-label') || '');
    if (!ok) throw new Error('Click guard: refused a click that is not the Add symbol button.');
    btn.click();
  }

  async function run() {
    const listButton = [...document.querySelectorAll('[data-name="watchlists-button"]')].find(visible);
    if (!listButton) return { ok: false, error: 'panel-closed' };
    const listName = listButton.textContent.replace(/\s+/g, ' ').trim();

    let input = [...document.querySelectorAll(INPUT)].find(visible);
    if (!input) {
      const btn = [...document.querySelectorAll('button[data-name="add-symbol-button"]')].find(visible);
      if (!btn) return { ok: false, error: 'no-add-button', listName };
      clickAddSymbol(btn);
      input = await waitFor(() => [...document.querySelectorAll(INPUT)].find(visible), 4000);
      if (!input) return { ok: false, error: 'no-dialog', listName };
    }

    // Set the text with the input's own value setter, so that the page sees a real change.
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(400);
    if (input.value !== text) return { ok: false, error: 'text-not-set', listName };

    // Enter. TradingView reads keyCode (13) on the search input.
    const key = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    input.dispatchEvent(new KeyboardEvent('keydown', key));
    input.dispatchEvent(new KeyboardEvent('keyup', key));

    // The dialog closes when TradingView has taken the list.
    const closed = await waitFor(() => ![...document.querySelectorAll(DIALOG)].some(visible), 6000);
    if (!closed) return { ok: false, error: 'not-accepted', listName };
    return { ok: true, listName };
  }

  if (html.getAttribute(ATTR) === 'running') return { started: false, error: 'running' };
  html.setAttribute(ATTR, 'running');
  run()
    .then((r) => html.setAttribute(ATTR, JSON.stringify(r)))
    .catch((e) => html.setAttribute(ATTR, JSON.stringify({ ok: false, error: 'exception', message: String((e && e.message) || e) })));
  return { started: true };
}

function tvPollImport() {
  const ATTR = 'data-wt-import';
  const html = document.documentElement;
  const v = html.getAttribute(ATTR);
  if (!v) return { state: 'none' };
  if (v === 'running') return { state: 'running' };
  html.removeAttribute(ATTR);
  try {
    return { state: 'done', result: JSON.parse(v) };
  } catch (e) {
    return { state: 'done', result: { ok: false, error: 'exception', message: 'bad result' } };
  }
}
