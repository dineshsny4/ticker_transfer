// Popup: Import tab for Zerodha Kite and TradingView.
(function () {
  const $ = (id) => document.getElementById(id);
  const LF = globalThis.WT.listformat;
  const N = globalThis.WT.normalize;

  const SITES = {
    kite: { name: 'Zerodha Kite', short: 'Kite', url: /^https:\/\/kite\.zerodha\.com\//i, group: 'group' },
    tradingview: { name: 'TradingView', short: 'TradingView', url: /^https:\/\/([a-z0-9-]+\.)*tradingview\.com\//i, group: 'section' },
  };

  let tab = null;
  let site = null; // 'kite' | 'tradingview' | null
  let page = null; // what the page reports: kite-info, or { ok, listName, frameId } on TradingView
  let plan = null; // sections to send: [{ name, symbols: ['KROSS'] }]

  function setPage(textValue, bad) {
    $('imPage').textContent = textValue;
    $('imPage').classList.toggle('bad', !!bad);
  }

  function note(textValue) {
    const li = document.createElement('li');
    li.textContent = textValue;
    $('imNotes').append(li);
  }

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

  // Show what the import will do, before anything is added.
  function render() {
    $('imNotes').innerHTML = '';
    $('imGroups').innerHTML = '';
    $('imSum').textContent = '';
    const p = buildPlan($('imText').value);
    plan = p.sections;
    const total = plan.reduce((n, s) => n + s.symbols.length, 0);
    const isKite = site === 'kite';
    const word = site ? SITES[site].group : 'group';
    const existing = new Set(isKite && page && page.ok ? page.existing : []);
    const groupNames = new Set(isKite && page && page.ok ? page.groups.map((g) => g.toLowerCase()) : []);
    let already = 0;

    for (const s of plan) {
      const here = s.symbols.filter((sym) => existing.has(N.key('NSE', sym))).length;
      already += here;
      const row = document.createElement('div');
      row.className = 'grp';
      const b = document.createElement('b');
      b.textContent = s.name || (isKite ? 'Default part of the list' : 'No section');
      const tag = document.createElement('span');
      if (s.name) tag.textContent = isKite ? (groupNames.has(s.name.toLowerCase()) ? ' → existing group' : ' → new group') : ' → section';
      const cnt = document.createElement('span');
      cnt.className = 'muted';
      cnt.textContent = ` ${s.symbols.length}${here ? ` (${here} already there)` : ''}`;
      const syms = document.createElement('div');
      syms.className = 'mono';
      const shown = isKite ? s.symbols : s.symbols.map((x) => N.toTradingView(x));
      syms.textContent = shown.slice(0, 8).join(' ') + (shown.length > 8 ? ' …' : '');
      row.append(b, cnt, tag, syms);
      $('imGroups').append(row);
    }

    const groups = plan.filter((s) => s.name).length;
    $('imSum').textContent = total ? `${total} NSE symbols · ${groups} ${word}${groups === 1 ? '' : 's'}` : '';

    if (p.notNse.length) note(`Not NSE, left out (${p.notNse.length}): ${p.notNse.slice(0, 8).join(', ')}${p.notNse.length > 8 ? ' …' : ''}.`);
    if (p.skipped.length) note(`Not a stock symbol, left out (${p.skipped.length}): ${p.skipped.slice(0, 8).map((s) => s.raw).join(', ')}.`);

    let canGo = !!total && !!page && page.ok;
    if (canGo && isKite) {
      if (already) note(`${already} already in this list. They are skipped.`);
      const room = page.count != null ? page.limit - page.count : null;
      const toAdd = total - already;
      if (room != null && toAdd > room) note(`The list has room for ${room} more (${page.limit} maximum). The first ${room} are added. The rest are listed as not added.`);
      const hasDefault = plan.some((s) => !s.name);
      const defaultOk = page.defaultVisible || page.groups.some((g) => g.toLowerCase() === 'default') || !page.selectedGroup;
      if (hasDefault && !defaultOk) {
        note(`Kite has the group "${page.selectedGroup}" selected. The symbols with no section would go into that group, so they will not be added.`);
      }
      if (page.running) {
        note('An import is running on this page now. Wait for it to finish.');
        canGo = false;
      }
    }
    if (canGo && site === 'tradingview') {
      note('TradingView adds the whole list in one step. It does not add a symbol that is already in the list.');
      note('If a section name is already in the list, TradingView does not make it again. Its new symbols can go to the end of the list.');
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

  async function connectKite() {
    try {
      await ensureKite(tab);
      page = await browser.tabs.sendMessage(tab.id, { type: 'kite-info' });
    } catch (e) {
      setPage(`Could not run on this page: ${e.message}`, true);
      return;
    }
    if (!page || !page.ok) {
      setPage('The Kite watchlist is not on the screen. Show it on the left (make the window wider if it is hidden), then click the icon again.', true);
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
        setPage('Open the Watchlist panel on the right side of the TradingView chart, then click the icon again.', true);
        return;
      }
      page = { ok: true, listName: hit.result, frameId: hit.frameId };
      setPage(`TradingView · list ${hit.result}`);
    } catch (e) {
      setPage(`Could not run on this page: ${e.message}`, true);
    }
  }

  async function connect() {
    page = null;
    if (!site) {
      setPage('Open Zerodha Kite or a TradingView chart in this tab, with the watchlist open. Then click the icon again.', true);
      return;
    }
    if (site === 'kite') await connectKite();
    else await connectTradingView();
  }

  function showMsg(textValue, bad) {
    $('imMsg').hidden = false;
    $('imMsg').classList.toggle('bad', !!bad);
    $('imMsg').textContent = textValue;
  }

  async function goKite() {
    let r;
    try {
      r = await browser.tabs.sendMessage(tab.id, { type: 'kite-import', sections: plan });
    } catch (e) {
      r = { ok: false, error: e.message };
    }
    if (r && r.ok) return showMsg('Started. The panel at the lower right of the Kite page shows the progress. You can close this popup.');
    showMsg(r && r.error === 'running' ? 'An import is running on this page now.' : `Could not start: ${(r && r.error) || 'no answer from the page'}`, true);
    $('imGo').disabled = false;
  }

  const TV_ERRORS = {
    'panel-closed': 'Open the Watchlist panel on the right side of the chart, then try again.',
    'no-add-button': 'The "Add symbol" button of the watchlist was not found.',
    'no-dialog': 'The "Add symbol" dialog did not open.',
    'text-not-set': 'The list could not be put into the "Add symbol" box.',
    'not-accepted': 'TradingView did not take the list. The "Add symbol" dialog is still open. Press Enter in it, or close it.',
    running: 'An import is running on this page now.',
  };

  async function goTradingView() {
    const text = tradingViewText(plan);
    const target = { tabId: tab.id, frameIds: [page.frameId] };
    showMsg('Adding the list to TradingView…');
    try {
      const [s] = await browser.scripting.executeScript({ target, func: tvStartImport, args: [text] });
      if (!s || !s.result || !s.result.started) {
        showMsg(TV_ERRORS[(s && s.result && s.result.error) || ''] || 'Could not start on this page.', true);
        $('imGo').disabled = false;
        return;
      }
      const until = Date.now() + 20000;
      while (Date.now() < until) {
        await new Promise((r) => setTimeout(r, 300));
        const [p] = await browser.scripting.executeScript({ target, func: tvPollImport });
        const poll = p && p.result;
        if (poll && poll.state === 'done') {
          const res = poll.result;
          if (res.ok) {
            showMsg(`Done. TradingView took the list into "${res.listName}". Check the list in the Watchlist panel.`);
          } else {
            showMsg(TV_ERRORS[res.error] || `Could not add the list (${res.error}${res.message ? `: ${res.message}` : ''}).`, true);
            $('imGo').disabled = false;
          }
          return;
        }
        if (!poll || poll.state === 'none') break;
      }
      showMsg('The import did not finish. Check the TradingView tab.', true);
    } catch (e) {
      showMsg(`Could not run on this page: ${e.message}`, true);
    }
    $('imGo').disabled = false;
  }

  async function go() {
    if (!plan || !plan.length || !page || !page.ok) return;
    $('imGo').disabled = true;
    if (site === 'kite') await goKite();
    else await goTradingView();
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

  globalThis.WTImport = {
    ensureKite,
    async init(activeTab) {
      tab = activeTab;
      site = Object.keys(SITES).find((k) => tab && SITES[k].url.test(tab.url || '')) || null;
      $('imHint').textContent = site === 'tradingview' ? 'Adds a list to the open TradingView watchlist, with its sections.' : 'Adds a list to the open Zerodha Kite watchlist.';
      await loadText();
      await connect();
      render();
    },
  };
})();
