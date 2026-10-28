// Popup: Export tab (TradingView or Zerodha Kite), and the tab switch.
(function () {
  const $ = (id) => document.getElementById(id);
  const { buildExport } = globalThis.WT.tvexport;

  const SITES = {
    tradingview: { name: 'TradingView', url: /^https:\/\/([a-z0-9-]+\.)*tradingview\.com\//i },
    kite: { name: 'Zerodha Kite', url: /^https:\/\/kite\.zerodha\.com\//i },
  };

  const MESSAGES = {
    'no-site': 'Open a TradingView chart or Zerodha Kite in this tab, then click the icon again.',
    'panel-closed': 'Open the Watchlist panel on the right side of the TradingView chart, then click Read again.',
    'no-watchlist': 'The Kite watchlist is not on the screen. Show it on the left (make the window wider if it is hidden), then click Read again.',
  };

  let current = null;

  function siteOf(tab) {
    return Object.keys(SITES).find((k) => tab && SITES[k].url.test(tab.url || '')) || null;
  }

  function showStatus(text, bad) {
    $('status').hidden = false;
    $('status').textContent = text;
    $('status').classList.toggle('bad', !!bad);
    $('result').hidden = true;
  }

  function addNote(text) {
    const li = document.createElement('li');
    li.textContent = text;
    $('notes').append(li);
  }

  // readAt: the time of an earlier read, when the result comes from storage. Else null.
  function showResult(siteName, listName, out, notes, readAt) {
    $('status').hidden = true;
    $('result').hidden = false;
    $('target').textContent = `${siteName} · list ${listName || '(no name)'}`;
    $('cached').hidden = !readAt;
    if (readAt) {
      const t = new Date(readAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
      $('cached').textContent = `Read before, on ${t}. If the list changed, click Read again.`;
    }
    $('sum').innerHTML = '';
    const b = document.createElement('b');
    b.textContent = out.symbols;
    $('sum').append(b, ` NSE symbols · ${out.sections} section${out.sections === 1 ? '' : 's'}`);
    $('text').value = out.text;
    $('notes').innerHTML = '';
    for (const n of notes || []) addNote(n);
    if (out.collapsed.length) {
      addNote(`Collapsed: ${out.collapsed.join(', ')}. The symbols in a collapsed section or group are not read. Expand it and click Read again to include them.`);
    }
    if (out.skipped.length) {
      const shown = out.skipped.slice(0, 8).join(', ');
      const more = out.skipped.length > 8 ? ` and ${out.skipped.length - 8} more` : '';
      addNote(`Not NSE, left out (${out.skipped.length}): ${shown}${more}.`);
    }
  }

  async function activeTab() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  // Show the page diagnosis under the message, so that the user can send it to us.
  function showDetails(info) {
    $('details').hidden = !info;
    $('detailsText').textContent = info ? JSON.stringify(info, null, 2) : '';
  }

  // Return { tab, site } for a supported page. Else show a message and return null.
  async function exportTarget() {
    const tab = await activeTab();
    const site = siteOf(tab);
    if (!site) {
      showStatus(MESSAGES['no-site'], true);
      return null;
    }
    return { tab, site };
  }

  // Get the name of the open watchlist, without a full read. Return null if it is not found.
  async function openListName(tab, site) {
    try {
      if (site === 'kite') {
        await globalThis.WTImport.ensureKite(tab);
        const info = await browser.tabs.sendMessage(tab.id, { type: 'kite-info' });
        return info && info.ok ? info.watchName : null;
      }
      let r = await browser.scripting.executeScript({ target: { tabId: tab.id }, func: tvListName });
      let name = r.map((x) => x.result).find(Boolean);
      if (!name) {
        r = await browser.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: tvListName });
        name = r.map((x) => x.result).find(Boolean);
      }
      return name || null;
    } catch (e) {
      return null;
    }
  }

  // When the popup opens: if this watchlist was read before, show that result and do not
  // read it again. The Read again button always reads the page.
  async function start() {
    const t = await exportTarget();
    if (!t) return;
    const name = await openListName(t.tab, t.site);
    const { lastExport } = await browser.storage.local.get('lastExport');
    if (name && lastExport && lastExport.site === SITES[t.site].name && lastExport.listName === name && lastExport.out) {
      current = { listName: name, ...lastExport.out };
      showResult(lastExport.site, name, lastExport.out, lastExport.notes, lastExport.at);
      return;
    }
    await read(t);
  }

  // Read the TradingView watchlist. Return the reader result, or null after a message.
  async function readTradingView(tab) {
    // Start the read in the top frame. If the watchlist is not there, try all frames.
    // Only the frame with the watchlist starts the read.
    let starts;
    const errors = [];
    try {
      starts = await browser.scripting.executeScript({ target: { tabId: tab.id }, func: tvStartRead });
    } catch (e) {
      showStatus(`Could not run on this page: ${e.message}`, true);
      return null;
    }
    if (!starts.some((s) => s.result && s.result.started)) {
      try {
        starts = await browser.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: tvStartRead });
      } catch (e) {
        errors.push(`all frames: ${e.message}`);
      }
    }
    for (const s of starts) if (s.error) errors.push(String(s.error.message || s.error));
    const frame = starts.find((s) => s.result && s.result.started);
    if (!frame) {
      showStatus(MESSAGES['panel-closed'], true);
      showDetails({ frames: starts.map((s) => ({ frameId: s.frameId, ...(s.result ? s.result.diag : {}) })), errors });
      return null;
    }

    // Wait for the result. A long list can take some seconds.
    const until = Date.now() + 120000;
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, 300));
      let polls;
      try {
        polls = await browser.scripting.executeScript({ target: { tabId: tab.id, frameIds: [frame.frameId] }, func: tvPollRead });
      } catch (e) {
        showStatus(`Could not read the result: ${e.message}`, true);
        return null;
      }
      const poll = polls[0] && polls[0].result;
      if (poll && poll.state === 'done') return poll.result;
      if (!poll || poll.state === 'none') break;
    }
    showStatus('The read did not finish. Reload the TradingView tab and try again.', true);
    showDetails({ diag: frame.result.diag, errors });
    return null;
  }

  // Read the open Kite watchlist. Return the result, or null after a message.
  async function readKite(tab) {
    try {
      await globalThis.WTImport.ensureKite(tab);
      return await browser.tabs.sendMessage(tab.id, { type: 'kite-export' });
    } catch (e) {
      showStatus(`Could not run on this page: ${e.message}`, true);
      return null;
    }
  }

  async function read(target) {
    showStatus('Reading the watchlist…');
    showDetails(null);
    const t = target || (await exportTarget());
    if (!t) return;
    const res = t.site === 'kite' ? await readKite(t.tab) : await readTradingView(t.tab);
    if (!res) return;
    if (!res.ok) {
      if (res.error === 'list-empty') showStatus(`The watchlist ${res.listName || ''} has no symbols.`.replace('  ', ' '), true);
      else showStatus(MESSAGES[res.error] || `Could not read the watchlist (${res.error}).`, true);
      showDetails({ error: res.error, message: res.message, diag: res.diag });
      return;
    }

    const out = buildExport(res.rows);
    if (!out.text) {
      showStatus('The watchlist has no NSE symbols to export.', true);
      return;
    }
    const siteName = SITES[t.site].name;
    current = { listName: res.listName, ...out };
    showResult(siteName, res.listName, out, res.notes, null);
    await browser.storage.local.set({
      lastExport: { site: siteName, listName: res.listName, text: out.text, symbols: out.symbols, sections: out.sections, out, notes: res.notes || [], at: Date.now() },
    });
  }

  async function copy() {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(current.text);
    } catch (e) {
      $('text').select();
      document.execCommand('copy');
    }
    $('copy').textContent = 'Copied';
    setTimeout(() => ($('copy').textContent = 'Copy'), 1500);
  }

  function download() {
    if (!current) return;
    const name = (current.listName || 'watchlist').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'watchlist';
    const url = URL.createObjectURL(new Blob([current.text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.txt`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  $('copy').addEventListener('click', copy);
  $('download').addEventListener('click', download);
  $('again').addEventListener('click', () => read());

  // ---- Tabs ----------------------------------------------------------------------------------
  // The popup opens on Import on a Kite page, and on Export on other pages.
  // Each tab starts its work the first time it shows.
  const started = { import: false, export: false };

  async function show(name) {
    for (const n of ['import', 'export']) {
      $(n).hidden = n !== name;
      const btn = $(n === 'import' ? 'tabImport' : 'tabExport');
      btn.classList.toggle('on', n === name);
      btn.setAttribute('aria-selected', String(n === name));
    }
    browser.storage.local.set({ lastTab: name });
    if (started[name]) return;
    started[name] = true;
    if (name === 'export') await start();
    else await globalThis.WTImport.init(await activeTab());
  }

  $('tabImport').addEventListener('click', () => show('import'));
  $('tabExport').addEventListener('click', () => show('export'));

  (async () => {
    const tab = await activeTab();
    show(siteOf(tab) === 'kite' ? 'import' : 'export');
  })();
})();
