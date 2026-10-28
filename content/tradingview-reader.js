// TradingView watchlist reader.
//
// Reads the active watchlist from the watchlist panel on the page. It does not use any API,
// and it does not click anything. It only scrolls the list, because TradingView draws only
// the rows that you can see.
//
// Markers (from TradingView's own watchlist code):
//   symbol row:      div[data-symbol-full="NSE:KROSS"]
//   section header:  div[data-collapsed="true|false"], text = section name without "###"
//   list name:       [data-name="watchlists-button"]
//
// The popup loads this file, and injects the two functions below into the tab with
// scripting.executeScript({ func }). Each function must not use anything outside itself.
//
// tvStartRead() starts the read and returns at once with a diagnosis of the page.
// The read can take some seconds. It writes its result as JSON to an attribute on <html>.
// tvPollRead() returns that result when it is ready, and removes the attribute.

/* exported tvStartRead, tvPollRead, tvListName */

function tvStartRead() {
  const SYMBOL_ROW = '[data-symbol-full]';
  const SECTION_ROW = '[data-collapsed]';
  const LIST_BUTTON = '[data-name="watchlists-button"]';
  const ROWS = `${SYMBOL_ROW}, ${SECTION_ROW}`;
  const ATTR = 'data-wt-read';
  const html = document.documentElement;

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function visible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function diagnose() {
    const all = (sel) => [...document.querySelectorAll(sel)];
    const buttons = all(LIST_BUTTON);
    const symbols = all(SYMBOL_ROW);
    const sections = all(SECTION_ROW);
    return {
      url: location.href,
      top: window === window.top,
      listButtons: buttons.length,
      listButtonsVisible: buttons.filter(visible).length,
      symbolRows: symbols.length,
      symbolRowsVisible: symbols.filter(visible).length,
      sectionRows: sections.length,
      sample: symbols.slice(0, 3).map((e) => e.getAttribute('data-symbol-full')),
      dataNames: [...new Set(all('[data-name]').map((e) => e.getAttribute('data-name')))].filter((n) => /watch|list|widget/i.test(n)).slice(0, 15),
    };
  }

  // Return true if setting scrollTop on el really moves it. The old position is put back.
  function canScroll(el) {
    if (el.scrollHeight <= el.clientHeight + 1) return false;
    const before = el.scrollTop;
    el.scrollTop = before + 1;
    const moved = el.scrollTop !== before;
    el.scrollTop = before;
    return moved;
  }

  // Find the element that scrolls the list. First try a parent with overflow auto/scroll.
  // If there is none (a custom scroller), take the first parent that really scrolls.
  function findScroller(row, root) {
    const parents = [];
    for (let el = row.parentElement; el && el !== root.parentElement; el = el.parentElement) parents.push(el);
    const styled = parents.find((el) => /^(auto|scroll|overlay)$/.test(getComputedStyle(el).overflowY) && canScroll(el));
    return styled || parents.find(canScroll) || null;
  }

  // Find the watchlist area: the smallest parent of the list button that holds list rows.
  function findWidget(listButton) {
    for (let el = listButton.parentElement; el && el !== document.body; el = el.parentElement) {
      if (el.querySelector(ROWS)) return el;
    }
    return null;
  }

  // Read the rows that are drawn now. Each row gets its position from the top of the list,
  // so that rows read in different scroll steps go into one order.
  function collect(root, scroller, found) {
    const base = scroller ? scroller.getBoundingClientRect().top - scroller.scrollTop : 0;
    for (const el of root.querySelectorAll(ROWS)) {
      if (!visible(el)) continue;
      const top = Math.round(el.getBoundingClientRect().top - base);
      const id = el.getAttribute('data-symbol-full');

      if (id && !id.startsWith('###')) {
        found.set(`s:${id}`, { top, row: { type: 'symbol', id } });
        continue;
      }

      // A section header. The name comes from "###NAME" if the row has it, else from the text.
      // Section names are unique in a TradingView list, so the name is the key.
      let name;
      let flag;
      if (id) {
        name = id.slice(3).trim();
        flag = el.matches(SECTION_ROW) ? el : el.querySelector(SECTION_ROW);
      } else {
        // Skip a [data-collapsed] element that is part of a "###" row. That row is read above.
        if (el.closest('[data-symbol-full^="###"]') || el.querySelector('[data-symbol-full^="###"]')) continue;
        name = el.textContent.replace(/\s+/g, ' ').trim().toUpperCase();
        flag = el;
      }
      if (!name) continue;
      const collapsed = !!flag && flag.getAttribute('data-collapsed') === 'true';
      const key = `h:${name}`;
      if (!found.has(key)) found.set(key, { top, row: { type: 'section', name, collapsed } });
    }
  }

  // Wait until the drawn rows cover the visible part of the list. After a scroll, the page
  // can take some time to draw the new rows. Old rows are then above the visible part.
  async function waitForRows(root, scroller, maxMs) {
    const until = Date.now() + maxMs;
    while (Date.now() < until) {
      const box = scroller.getBoundingClientRect();
      const atEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
      let coversTop = false;
      let coversBottom = false;
      for (const el of root.querySelectorAll(ROWS)) {
        if (!visible(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.top <= box.top + 2 && r.bottom > box.top) coversTop = true;
        if (r.bottom >= box.bottom - 2 && r.top < box.bottom) coversBottom = true;
      }
      if (coversTop && (coversBottom || atEnd)) {
        await wait(60);
        return true;
      }
      await wait(50);
    }
    return false;
  }

  async function read() {
    // The watchlist panel is open only if its list button shows. Other widgets (for example
    // hotlists) can use the same rows, so the rows are read only inside the watchlist area.
    const listButton = [...document.querySelectorAll(LIST_BUTTON)].find(visible) || null;
    if (!listButton) return { ok: false, error: 'panel-closed' };
    const listName = listButton.textContent.replace(/\s+/g, ' ').trim();

    const root = findWidget(listButton);
    const firstRow = root && [...root.querySelectorAll(ROWS)].find(visible);
    if (!firstRow) return { ok: false, error: 'list-empty', listName };

    const scroller = findScroller(firstRow, root);
    const found = new Map();
    const notes = [];

    if (!scroller) {
      collect(root, null, found);
      notes.push('The list did not scroll. If the list is longer than the panel, some symbols can be missing. Make the panel taller and read again.');
    } else {
      const start = scroller.scrollTop;
      let slow = false;
      scroller.scrollTop = 0;
      if (!(await waitForRows(root, scroller, 3000))) slow = true;
      // Scroll down one part of a screen at a time, until the end of the list.
      // Stop if the list does not move, so that the loop cannot run without end.
      for (let step = 0; step < 2000; step++) {
        collect(root, scroller, found);
        const atEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
        if (atEnd) break;
        const before = scroller.scrollTop;
        scroller.scrollTop = before + Math.max(30, Math.floor(scroller.clientHeight * 0.6));
        if (!(await waitForRows(root, scroller, 3000))) slow = true;
        if (scroller.scrollTop === before) {
          collect(root, scroller, found);
          break;
        }
      }
      scroller.scrollTop = start;
      if (slow) notes.push('The page was slow to draw the list. Some symbols can be missing. Click Read again to check.');
    }

    const rows = [...found.values()].sort((a, b) => a.top - b.top).map((x) => x.row);
    return { ok: true, listName, rows, notes };
  }

  const diag = diagnose();
  // Start only in the frame that has the watchlist. Do not start a second read.
  if (!diag.listButtons && !diag.symbolRows) return { started: false, diag };
  if (html.getAttribute(ATTR) === 'running') return { started: true, diag };

  html.setAttribute(ATTR, 'running');
  read()
    .then((result) => html.setAttribute(ATTR, JSON.stringify({ ...result, diag })))
    .catch((e) => html.setAttribute(ATTR, JSON.stringify({ ok: false, error: 'exception', message: String((e && e.stack) || e), diag })));
  return { started: true, diag };
}

// Return the name of the open watchlist, or null if the watchlist panel is not open.
// This is fast: it does not scroll or read the rows.
function tvListName() {
  const btn = [...document.querySelectorAll('[data-name="watchlists-button"]')].find((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  return btn ? btn.textContent.replace(/\s+/g, ' ').trim() : null;
}

function tvPollRead() {
  const ATTR = 'data-wt-read';
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
