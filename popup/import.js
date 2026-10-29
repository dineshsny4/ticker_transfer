// Popup: Import tab for Zerodha Kite, TradingView and Dhan.
(function () {
  const $ = (id) => document.getElementById(id);
  const LF = globalThis.WT.listformat;
  const N = globalThis.WT.normalize;
  const UI = globalThis.WTUI;

  const SITES = {
    kite: { name: 'Zerodha Kite', short: 'Kite', url: /^https:\/\/kite\.zerodha\.com\//i, group: 'group' },
    tradingview: { name: 'TradingView', short: 'TradingView', url: /^https:\/\/([a-z0-9-]+\.)*tradingview\.com\//i, group: 'section' },
    dhan: { name: 'Dhan', short: 'Dhan', url: /^https:\/\/tv\.dhan\.co\//i, group: 'section' },
  };

  let tab = null;
  let site = null; // 'kite' | 'tradingview' | 'dhan' | null
  let page = null; // what the page reports: kite-info, or { ok, listName, frameId } on TradingView
  let plan = null; // sections to send: [{ name, symbols: ['KROSS'] }]

  // state: 'ok' | 'bad' | 'busy'
  function setPage(textValue, state = 'ok') {
    if (state === 'ok') UI.card($('imPage'), { title: textValue });
    else UI.card($('imPage'), { text: textValue, state });
  }

  const note = (textValue, kind) => UI.note($('imNotes'), textValue, kind);

  // Turn the text into sections. Keep NSE only.
  function buildPlan(value) {
    const parsed = LF.parse(value || '');
    const sections = [];
    const notNse = [];
    for (const s of parsed.list.sections) {
      const symbols = [];
      for (const it of s.symbols) {
        if (it.exchange === 'NSE') symbols.push(it.symbol);
        else notNse.push(`${it.exchange}:${it.symbol}`);
      }
      if (symbols.length) sections.push({ name: s.name, symbols });
    }
    return { sections, notNse, skipped: parsed.skipped };
  }

  // The text for TradingView's Add symbol box: ###NAME,NSE:SYMBOL,...
  function tradingViewText(sections) {
    const out = [];
    for (const s of sections) {
      if (s.name) out.push(`###${s.name}`);
      for (const sym of s.symbols) out.push(`NSE:${N.toTradingView(sym)}`);
    }
    return out.join(',');
  }

  // One group row: name, count, where it goes, and its symbols (struck out when already there).
  function groupRow(s, isKite, existing, groupNames) {
    const row = UI.make('div', 'grp');
    const top = UI.make('div', 'top');
    const name = UI.make('span', null, `${s.name || (isKite ? 'Default part of the list' : 'No section')} `);
    name.append(UI.make('span', 'muted', String(s.symbols.length)));
    let dest = isKite ? '→ default' : '→ no section';
    let cls = 'reuse';
    if (s.name && isKite) [dest, cls] = groupNames.has(s.name.toLowerCase()) ? ['→ existing group', 'reuse'] : ['→ new group', 'new'];
    else if (s.name) [dest, cls] = ['→ section', 'new'];
    top.append(name, UI.make('span', cls, dest));
    const syms = UI.make('div', 'syms');
    const shown = s.symbols.slice(0, 24);
    shown.forEach((sym, i) => {
      const label = isKite ? sym : N.toTradingView(sym);
      syms.append(existing.has(N.key('NSE', sym)) ? UI.make('s', null, label) : document.createTextNode(label));
      if (i < shown.length - 1) syms.append(', ');
    });
    if (s.symbols.length > shown.length) syms.append(` … and ${s.symbols.length - shown.length} more`);
    row.append(top, syms);
    return row;
  }

  // Show what the import will do, before anything is added.
  function render() {
    $('imNotes').textContent = '';
    $('imGroups').textContent = '';
    const p = buildPlan($('imText').value);
    plan = p.sections;
    const total = plan.reduce((n, s) => n + s.symbols.length, 0);
    const isKite = site === 'kite';
    const word = site ? SITES[site].group : 'group';
    const existing = new Set(isKite && page && page.ok ? page.existing : []);
    const groupNames = new Set(isKite && page && page.ok ? page.groups.map((g) => g.toLowerCase()) : []);
    let already = 0;

    for (const s of plan) {
      already += s.symbols.filter((sym) => existing.has(N.key('NSE', sym))).length;
      $('imGroups').append(groupRow(s, isKite, existing, groupNames));
    }

    const groups = plan.filter((s) => s.name).length;
    const leftOut = p.notNse.length + p.skipped.length;
    const room = isKite && page && page.ok && page.count != null ? page.limit - page.count : null;
    const toAdd = total - already;
    if (!total) UI.stats($('imSum'), []);
    else if (isKite && page && page.ok) {
      const adds = room != null ? Math.min(toAdd, room) : toAdd;
      UI.stats($('imSum'), [
        [adds, room != null && toAdd > room ? 'can add' : 'to add', room != null && toAdd > room],
        [already, 'already in'],
        page.count != null ? [page.count + adds, `after, of ${page.limit}`] : [leftOut, 'left out', leftOut > 0],
      ]);
    } else {
      UI.stats($('imSum'), [
        [total, 'NSE symbols'],
        [groups, `${word}s`],
        [leftOut, 'left out', leftOut > 0],
      ]);
    }

    if (p.notNse.length) note(`Not NSE, left out (${p.notNse.length}): ${p.notNse.slice(0, 8).join(', ')}${p.notNse.length > 8 ? ' …' : ''}.`);
    if (p.skipped.length) note(`Not a stock symbol, left out (${p.skipped.length}): ${p.skipped.slice(0, 8).map((s) => s.raw).join(', ')}.`);

    let canGo = !!total && !!page && page.ok;
    if (canGo && isKite) {
      if (already) note(`${already} already in this list. Kite will skip them.`, 'info');
      if (room != null && toAdd > room) note(`The list has room for ${room} more (${page.limit} maximum). The first ${room} are added. The rest are listed as not added.`);
      const hasDefault = plan.some((s) => !s.name);
      const defaultOk = page.defaultVisible || page.groups.some((g) => g.toLowerCase() === 'default') || !page.selectedGroup;
      if (hasDefault && !defaultOk) {
        note(`Kite has the group "${page.selectedGroup}" selected. The symbols with no section would go into that group, so they will not be added.`);
      }
      if (page.running) {
        note('An import is running on this page now. Wait for it to finish.', 'bad');
        canGo = false;
      }
    }
    if (canGo && site === 'dhan') {
      note(`The extension looks up each symbol in Dhan's search (about one second each) and picks the NSE listing (SYMBOL-EQ). Then it adds the whole list in one step.`, 'info');
      if (page.running) {
        note('A job is running on this page now. Wait for it to finish.', 'bad');
        canGo = false;
      }
    }
    if (canGo && site === 'tradingview') {
      note('TradingView adds the whole list in one step. It does not add a symbol that is already in the list.', 'info');
      note('If a section name is already in the list, TradingView does not make it again. Its new symbols can go to the end of the list.', 'info');
    }
    $('imGo').disabled = !canGo;
    const target = site ? SITES[site].short : 'Kite';
    $('imGo').textContent = `Add to ${target}`;
  }

  async function loadText() {
    const { lastExport, importDraft } = await browser.storage.local.get(['lastExport', 'importDraft']);
    // Use the last export, unless the user edited the text after that export.
    const useDraft = importDraft && (!lastExport || importDraft.at > lastExport.at);
    $('imText').value = useDraft ? importDraft.text : lastExport ? lastExport.text : '';
    $('imUseLast').hidden = !(useDraft && lastExport);
    if (lastExport) $('imUseLast').textContent = `Use the last export (${lastExport.site}, ${lastExport.symbols})`;
    if (lastExport && !useDraft) {
      const t = new Date(lastExport.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
      $('imFrom').textContent = `From the ${lastExport.site} list ${lastExport.listName || ''}, read on ${t}.`;
      $('imFrom').hidden = false;
    } else {
      $('imFrom').hidden = true;
    }
  }

  // Load the Kite page script (and the name rules it uses) into the tab.
  // Paths start at the extension root: Firefox can read a relative path from the popup folder.
  async function ensureKite(t) {
    const injected = await browser.scripting.executeScript({ target: { tabId: t.id }, files: ['/shared/normalize.js', '/content/kite-importer.js'] });
    const err = injected.find((r) => r.error);
    if (err) throw new Error(`the page script failed: ${err.error.message || err.error}`);
  }

  // Load the Dhan page script (and the name rules it uses) into the top page of the tab.
  async function ensureDhan(t) {
    const injected = await browser.scripting.executeScript({ target: { tabId: t.id }, files: ['/shared/normalize.js', '/content/dhan.js'] });
    const err = injected.find((r) => r.error);
    if (err) throw new Error(`the page script failed: ${err.error.message || err.error}`);
  }

  async function connectDhan() {
    try {
      await ensureDhan(tab);
      page = await browser.tabs.sendMessage(tab.id, { type: 'dhan-info' });
    } catch (e) {
      setPage(`Could not run on this page: ${e.message}`, 'bad');
      return;
    }
    if (!page || !page.ok) {
      setPage(
        page && page.error === 'no-chart'
          ? 'The Dhan chart is not loaded yet. Wait for the chart, then click the icon again.'
          : 'Open the Watchlist panel on the right side of the Dhan chart, then click the icon again.',
        'bad',
      );
      return;
    }
    setPage(`Dhan · list ${page.listName}`);
  }

  async function connectKite() {
    try {
      await ensureKite(tab);
      page = await browser.tabs.sendMessage(tab.id, { type: 'kite-info' });
    } catch (e) {
      setPage(`Could not run on this page: ${e.message}`, 'bad');
      return;
    }
    if (!page || !page.ok) {
      setPage('The Kite watchlist is not on the screen. Show it on the left (make the window wider if it is hidden), then click the icon again.', 'bad');
      return;
    }
    setPage(`Zerodha Kite · list ${page.watchName}${page.count != null ? ` (${page.count} / ${page.limit})` : ''}`);
  }

  // Find the frame with the open TradingView watchlist (top frame first).
  async function connectTradingView() {
    try {
      let r = await browser.scripting.executeScript({ target: { tabId: tab.id }, func: tvListName });
      let hit = r.find((x) => x.result);
      if (!hit) {
        r = await browser.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: tvListName });
        hit = r.find((x) => x.result);
      }
      if (!hit) {
        setPage('Open the Watchlist panel on the right side of the TradingView chart, then click the icon again.', 'bad');
        return;
      }
      page = { ok: true, listName: hit.result, frameId: hit.frameId };
      setPage(`TradingView · list ${hit.result}`);
    } catch (e) {
      setPage(`Could not run on this page: ${e.message}`, 'bad');
    }
  }

  async function connect() {
    page = null;
    if (!site) {
      setPage('Open Zerodha Kite, a TradingView chart or Dhan (tv.dhan.co) in this tab, with the watchlist open. Then click the icon again.', 'bad');
      return;
    }
    if (site === 'kite') await connectKite();
    else if (site === 'dhan') await connectDhan();
    else await connectTradingView();
  }

  // kind: 'info' | 'good' | 'bad'
  function showMsg(textValue, kind = 'info') {
    UI.setNote($('imMsg'), textValue, kind);
  }

  // ---- Run ----------------------------------------------------------------------------------------
  // Every site runs the import in the page. The popup shows the progress and the result here, in
  // the Import tab, the same way for every site. The run goes on when the popup closes; when it
  // opens again, it shows the run again.

  let runPlan = null; // the sections of the last run, for "Retry" of the whole list
  let lastResult = null;
  let polling = false;

  async function startOnPage(sections) {
    if (site === 'kite') return browser.tabs.sendMessage(tab.id, { type: 'kite-import', sections });
    if (site === 'dhan') return browser.tabs.sendMessage(tab.id, { type: 'dhan-import', sections });
    const target = { tabId: tab.id, frameIds: [page.frameId] };
    const [s] = await browser.scripting.executeScript({ target, func: tvStartImport, args: [tradingViewText(sections)] });
    const r = s && s.result;
    return r && r.started ? { ok: true } : { ok: false, error: (r && r.error) || 'no answer from the page' };
  }

  // The run state of the page: { running, target, done, total, status, now, tip, result }, or null.
  async function pageStatus() {
    if (site === 'kite' || site === 'dhan') {
      const s = await browser.tabs.sendMessage(tab.id, { type: `${site}-status` });
      return s && s.kind === 'import' && (s.running || s.result) ? s : null;
    }
    const [p] = await browser.scripting.executeScript({ target: { tabId: tab.id, frameIds: [page.frameId] }, func: tvPollImport });
    const poll = p && p.result;
    if (!poll || poll.state === 'none') return null;
    const total = runPlan ? runPlan.reduce((n, s) => n + s.symbols.length, 0) : 0;
    const base = { target: `TradingView · list ${page.listName || ''}`, total, tip: 'TradingView adds the whole list in one step.' };
    if (poll.state === 'running') return { ...base, running: true, done: 0, now: `Adding ${total} symbols…` };
    return { ...base, running: false, done: total, result: poll.result };
  }

  // Show the run controls in place of the Add row. show: the buttons to show.
  function runButtons(show, inRun = show.length > 0) {
    for (const id of ['imStop', 'imContinue', 'imExit', 'imRetry', 'imCopyFail', 'imDone']) $(id).hidden = !show.includes(id);
    $('imRunRow').hidden = !show.length;
    $('imStartRow').hidden = inRun;
  }

  function showRun(s) {
    $('imRun').hidden = false;
    $('imRunTarget').textContent = s.target || SITES[site].name;
    $('imRunBar').style.width = `${s.total ? Math.round(((s.done || 0) / s.total) * 100) : s.running ? 5 : 100}%`;
    $('imRunCount').textContent = s.status || (s.total ? `${s.done || 0} / ${s.total}` : '');
    $('imRunNow').textContent = s.now || '';
    $('imRunTip').textContent = s.running ? s.tip || '' : '';
    if (s.running && s.paused) {
      showPaused();
      return;
    }
    if (s.running) {
      UI.setNote($('imMsg'), 'You can close this popup. The import goes on. Open the popup again to see the progress.', 'info');
      $('imFail').hidden = true;
      // TradingView adds the list in one step, so it has no Stop.
      runButtons(site === 'tradingview' ? [] : ['imStop'], true);
      return;
    }
    const res = s.result || { ok: false, kind: 'bad', message: 'The import did not finish.' };
    lastResult = res;
    UI.setNote($('imMsg'), res.message || (res.ok ? 'Done.' : 'The import did not finish.'), res.kind || (res.ok ? 'good' : 'bad'));
    const failed = res.failed || [];
    UI.failList($('imFail'), failed);
    const show = [];
    if (failed.length) {
      $('imRetry').textContent = `Retry these (${failed.length})`;
      show.push('imRetry', 'imCopyFail');
    } else if (res.retryAll && runPlan) {
      $('imRetry').textContent = 'Retry';
      show.push('imRetry');
    }
    show.push('imDone');
    runButtons(show);
  }

  // Stop pauses the run. The user picks: continue the import, or exit it.
  function showPaused() {
    $('imRunNow').textContent = 'Paused';
    const kept = site === 'dhan'
      ? 'Dhan adds the list in one step at the end, so nothing is added if you exit.'
      : 'The symbols added so far stay in the list.';
    UI.setNote($('imMsg'), `Paused. Continue the import, or exit it? ${kept}`, '');
    $('imFail').hidden = true;
    runButtons(['imContinue', 'imExit'], true);
  }

  // Read the page state until the run ends.
  async function follow() {
    if (polling) return;
    polling = true;
    try {
      for (;;) {
        const s = await pageStatus();
        if (!s) break;
        showRun(s);
        if (!s.running) break;
        await new Promise((r) => setTimeout(r, 400));
      }
    } catch (e) {
      showMsg(`Lost the page: ${e.message}`, 'bad');
      runButtons(['imDone']);
    } finally {
      polling = false;
    }
  }

  async function run(sections) {
    if (!sections || !sections.length || !page || !page.ok) return;
    $('imGo').disabled = true;
    $('imRetry').disabled = true;
    for (const id of ['imStop', 'imContinue', 'imExit']) $(id).disabled = false;
    $('imExit').textContent = 'Exit import';
    $('imCopyFail').textContent = 'Copy list';
    let r;
    try {
      r = await startOnPage(sections);
    } catch (e) {
      r = { ok: false, error: e.message };
    }
    $('imRetry').disabled = false;
    if (r && r.ok) {
      runPlan = sections;
      await follow();
      return;
    }
    showMsg(r && r.error === 'running' ? 'An import is running on this page now. Wait for it to finish.' : `Could not start: ${(r && r.error) || 'no answer from the page'}`, 'bad');
    $('imGo').disabled = false;
  }

  const go = () => run(plan);

  // Retry: only the failed symbols, in their sections. When the site did not take the list, the same list.
  function retry() {
    const failed = (lastResult && lastResult.failed) || [];
    run(failed.length ? UI.regroup(failed) : runPlan);
  }

  // Done: close the result, and read the page again (the counts changed).
  async function done() {
    if (site === 'kite' || site === 'dhan') await browser.tabs.sendMessage(tab.id, { type: `${site}-clear` }).catch(() => {});
    $('imRun').hidden = true;
    $('imMsg').hidden = true;
    $('imFail').hidden = true;
    runButtons([]);
    lastResult = null;
    await connect();
    render();
  }

  // When the popup opens: show a run that is still going, or a result that the user did not close.
  async function resume() {
    if (site !== 'kite' && site !== 'dhan') return;
    if (!page || !page.ok) return;
    try {
      const s = await pageStatus();
      if (s) follow();
    } catch (e) {
      // No run on this page.
    }
  }

  let draftTimer = null;
  $('imText').addEventListener('input', () => {
    render();
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => browser.storage.local.set({ importDraft: { text: $('imText').value, at: Date.now() } }), 300);
    $('imFrom').hidden = true;
  });
  $('imUseLast').addEventListener('click', async () => {
    await browser.storage.local.remove('importDraft');
    await loadText();
    render();
  });
  $('imGo').addEventListener('click', go);
  $('imRetry').addEventListener('click', retry);
  $('imDone').addEventListener('click', done);
  // Send a run control to the page: pause, resume or stop. The progress loop shows any error.
  async function control(type) {
    try {
      await browser.tabs.sendMessage(tab.id, { type: `${site}-${type}` });
    } catch (e) {
      // The progress loop shows the error.
    }
  }
  // Stop: pause the run after the current symbol, and ask the user what to do.
  $('imStop').addEventListener('click', async () => {
    await control('pause');
    showPaused();
  });
  $('imContinue').addEventListener('click', async () => {
    await control('resume');
    runButtons(['imStop'], true);
    UI.setNote($('imMsg'), 'You can close this popup. The import goes on. Open the popup again to see the progress.', 'info');
  });
  $('imExit').addEventListener('click', async () => {
    $('imExit').disabled = true;
    $('imContinue').disabled = true;
    $('imExit').textContent = 'Exiting…';
    await control('stop');
  });
  $('imCopyFail').addEventListener('click', async () => {
    const failed = (lastResult && lastResult.failed) || [];
    try {
      await navigator.clipboard.writeText(failed.map((f) => `NSE:${N.toTradingView(f.symbol)}`).join(','));
      $('imCopyFail').textContent = 'Copied ✓';
    } catch (e) {
      $('imCopyFail').textContent = 'Copy failed';
    }
  });

  globalThis.WTImport = {
    ensureKite,
    ensureDhan,
    async init(activeTab) {
      tab = activeTab;
      site = Object.keys(SITES).find((k) => tab && SITES[k].url.test(tab.url || '')) || null;
      const hints = {
        tradingview: 'Adds a list to the open TradingView watchlist, with its sections.',
        dhan: 'Adds a list to the open Dhan watchlist, with its sections.',
      };
      $('imHint').textContent = hints[site] || 'Adds a list to the open Zerodha Kite watchlist.';
      await loadText();
      await connect();
      render();
      await resume();
    },
  };
})();
