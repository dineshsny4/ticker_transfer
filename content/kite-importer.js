// Zerodha Kite: import into the open watchlist, and read it for Export.
//
// Adds a list to the open Kite watchlist the way a user does it, through the page:
//   - "###NAME" section: click "+ New group", type the name, click Create (or select the group
//     if it already exists). Kite then adds new stocks to that selected group.
//   - Symbol: put the symbol in the watchlist search box, then click the search result that has
//     the same name and the NSE tag. Kite adds it to the selected group.
//   - Symbols before the first "###" go to the default part of the list.
//
// Safety:
//   - No key presses are sent. Kite has shortcuts (B = Buy, S = Sell). Text goes into the
//     search box with the value property and an "input" event only.
//   - Every click goes through safeClick(), which allows only a short list of controls.
//     Kite draws the B/S/+ buttons of a search result only on mouse hover. No hover event is
//     sent, so those buttons are not on the page when a result is clicked.
//
// The popup injects this file and talks to it with runtime messages.
(function () {
  if (window.__wtKiteImporter) return;
  window.__wtKiteImporter = true;
  // shared/normalize.js is injected before this file.
  const N = globalThis.WT.normalize;

  const SEL = {
    marketwatch: '.marketwatch',
    search: '.marketwatch .omnisearch input[type="text"]',
    results: '.marketwatch .omnisearch ul.omnisearch-results li.results-item',
    watchName: '.marketwatch .watch-info .watch-name',
    count: '.marketwatch .watch-info .count',
    newGroup: '.marketwatch .watch-info-wrapper-top button',
    groupForm: '.marketwatch .group-form',
    groupInput: '.marketwatch .group-form input[type="text"]',
    groupSubmit: '.marketwatch .group-form button[type="submit"]',
    groups: '.marketwatch .group-wrapper',
    groupName: '.group-name .name',
    groupHeader: '.group.flex-block',
    items: '.marketwatch .item-wrapper[data-id]',
  };
  const DEFAULT_GROUP_CLASS = 'id-GROUP:default';
  const LIMIT_FALLBACK = 250;

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function visible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  async function waitFor(fn, maxMs = 4000, step = 80) {
    const until = Date.now() + maxMs;
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() > until) return null;
      await wait(step);
    }
  }

  // ---- Click guard ---------------------------------------------------------------------------

  const DENY_TEXT = /^(b|s)$|\b(buy|sell|exit|order|orders|gtt|basket|holdings?|positions?|funds?)\b/i;

  // Each kind of click has one rule. Anything else is refused.
  const CLICK_RULES = {
    result: (el) => el.matches('li.results-item') && !!el.closest('.marketwatch .omnisearch') && !$('.action-buttons', el),
    newGroup: (el) => el.matches('button') && !!el.closest('.marketwatch .watch-info-wrapper-top') && text(el) === 'New group',
    groupCreate: (el) => el.matches('button[type="submit"]') && !!el.closest('.marketwatch .group-form') && text(el) === 'Create',
    groupClose: (el) => el.matches('button[type="button"]') && !!el.closest('.marketwatch .group-form') && text(el) === 'Close',
    groupHeader: (el) => el.matches('.group.flex-block') && !!el.closest('.marketwatch .group-wrapper'),
  };

  function safeClick(el, kind) {
    const rule = CLICK_RULES[kind];
    if (!el || !rule || !rule(el)) throw new Error(`Click guard: refused a "${kind}" click.`);
    // A result row holds the stock name, so only check the text of buttons, not of rows.
    if (kind !== 'result' && kind !== 'groupHeader' && DENY_TEXT.test(text(el))) throw new Error('Click guard: refused a button with an order word.');
    el.click();
  }

  // ---- Reading the page ----------------------------------------------------------------------

  function readCount() {
    const m = text($(SEL.count)).match(/(\d+)\s*\/\s*(\d+)/);
    return m ? { count: Number(m[1]), limit: Number(m[2]) } : null;
  }

  function groupsOnPage() {
    return $$(SEL.groups).map((g) => ({
      el: g,
      name: text($(SEL.groupName, g)),
      selected: g.classList.contains('selected'),
      isDefault: g.classList.contains(DEFAULT_GROUP_CLASS),
    }));
  }

  function findGroup(name) {
    const want = name.trim().toLowerCase();
    return groupsOnPage().find((g) => !g.isDefault && g.name.toLowerCase() === want) || null;
  }

  // Stocks in the list now, as matchKey forms ("NSE:BAJAJ_AUTO"). Kite also refuses
  // duplicates by itself.
  function existingKeys() {
    return $$(SEL.items).map((it) => {
      const ex = (it.getAttribute('data-id') || '').split(':')[0];
      return N.key(ex, text($('.symbol .name', it)));
    });
  }

  // Read the open list for Export: Kite's default part first (no header), then each group as
  // a section, in page order. Symbols are written in TradingView form (no -BE/-BZ, "_" for
  // "-" and "&"). A group whose header count is larger than the stocks on the page is
  // collapsed: its stocks are not all there.
  function exportList() {
    const mw = $(SEL.marketwatch);
    if (!mw || !visible(mw)) return { ok: false, error: 'no-watchlist' };
    const rows = [];
    let total = 0;
    for (const g of groupsOnPage()) {
      const items = $$('.item-wrapper[data-id]', g.el);
      const shown = Number((text($('.group-name .count', g.el)).match(/\d+/) || [items.length])[0]);
      if (!g.isDefault) rows.push({ type: 'section', name: g.name, collapsed: items.length < shown });
      for (const it of items) {
        const ex = (it.getAttribute('data-id') || '').split(':')[0];
        const name = text($('.symbol .name', it));
        if (!name) continue;
        rows.push({ type: 'symbol', id: ex === 'NSE' ? `NSE:${N.toTradingView(name)}` : `${ex}:${name}` });
        total++;
      }
    }
    if (!total) return { ok: false, error: 'list-empty', listName: text($(SEL.watchName)) };
    return { ok: true, listName: text($(SEL.watchName)), rows, notes: [] };
  }

  function info() {
    const mw = $(SEL.marketwatch);
    if (!mw || !visible(mw)) return { ok: false, error: 'no-watchlist' };
    const c = readCount();
    const groups = groupsOnPage();
    return {
      ok: true,
      watchName: text($(SEL.watchName)),
      count: c ? c.count : null,
      limit: c ? c.limit : LIMIT_FALLBACK,
      groups: groups.filter((g) => !g.isDefault).map((g) => g.name),
      selectedGroup: (groups.find((g) => g.selected) || {}).name || null,
      selectedIsDefault: groups.some((g) => g.selected && g.isDefault),
      defaultVisible: groups.some((g) => g.isDefault),
      existing: existingKeys(),
      running: !!state.running,
    };
  }

  // ---- Actions -------------------------------------------------------------------------------

  function setSearch(value) {
    const input = $(SEL.search);
    if (!input) throw new Error('The watchlist search box was not found.');
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function clearSearch() {
    const input = $(SEL.search);
    if (!input || !input.value) return;
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.blur();
  }

  // Click a group header to select it. Kite can draw the group again after the click,
  // so find the group again by its name (or as the default group) to check the result.
  async function selectGroup(g) {
    if (g.selected) return;
    safeClick($(SEL.groupHeader, g.el), 'groupHeader');
    const same = (x) => (g.isDefault ? x.isDefault : !x.isDefault && x.name.toLowerCase() === g.name.toLowerCase());
    const ok = await waitFor(() => groupsOnPage().some((x) => same(x) && x.selected), 3000);
    if (!ok) throw new Error(`Kite did not select the group "${g.name}".`);
  }

  // Use the group with this name, or make it. Return { created }.
  async function ensureGroup(name) {
    const found = findGroup(name);
    if (found) {
      await selectGroup(found);
      return { created: false };
    }
    let input = $(SEL.groupInput);
    if (!input) {
      const btn = $$(SEL.newGroup).find((b) => text(b) === 'New group');
      if (!btn) throw new Error('The "New group" button was not found.');
      safeClick(btn, 'newGroup');
      input = await waitFor(() => $(SEL.groupInput), 3000);
      if (!input) throw new Error('The new group form did not open.');
    }
    input.focus();
    input.value = name.slice(0, 100);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const submit = await waitFor(() => {
      const b = $(SEL.groupSubmit);
      return b && !b.disabled ? b : null;
    }, 3000);
    if (!submit) throw new Error('The Create button did not become active.');
    safeClick(submit, 'groupCreate');
    // Kite makes the group, reloads the list, and selects the new group.
    const made = await waitFor(() => {
      const g = findGroup(name);
      return g && g.selected ? g : null;
    }, 6000);
    if (!made) throw new Error(`Kite did not make the group "${name}".`);
    return { created: true };
  }

  // Make sure that new stocks go to the default part of the list.
  // Return null if that is so, else a reason.
  // The default part is Kite's own default group (shown only when it has stocks), else a
  // group named "Default".
  async function useDefaultGroup() {
    const groups = groupsOnPage();
    const def = groups.find((g) => g.isDefault) || groups.find((g) => g.name.toLowerCase() === 'default');
    if (def) {
      await selectGroup(def);
      return null;
    }
    const sel = groups.find((g) => g.selected);
    if (!sel) return null;
    return `Kite has the group "${sel.name}" selected, and the default part of the list is empty, so Kite would put the stocks into "${sel.name}".`;
  }

  // Add one NSE symbol. Return { status: 'added' | 'skipped' | 'failed', reason }.
  async function addSymbol(symbol) {
    const before = readCount();
    if (before && before.count >= before.limit) return { status: 'failed', reason: `the list is full (${before.limit})` };

    // Kite names can differ from the list: "-" or "&" for "_", and a -BE/-BZ suffix.
    // So compare with matchKey(), and try each search text until one finds the stock.
    const want = N.matchKey(symbol);
    const nameOf = (li) => text($('.item .name > span', li));
    const matching = () => $$(SEL.results).filter((li) => !li.classList.contains('no-results') && N.matchKey(nameOf(li)) === want);
    let pick = null;
    let onlyBse = false;
    for (const q of N.searchTexts(symbol)) {
      setSearch(q);
      pick = await waitFor(() => {
        const nse = matching().filter((li) => li.classList.contains('NSE'));
        if (!nse.length) return null;
        // Prefer the same name, then the name with no series suffix.
        const exact = nse.find((li) => nameOf(li) === q) || nse.find((li) => !/-(BE|BZ)$/.test(nameOf(li))) || nse[0];
        return { li: exact, name: nameOf(exact) };
      }, 2500);
      if (pick) break;
      if (matching().some((li) => li.classList.contains('BSE'))) onlyBse = true;
    }

    if (!pick) {
      clearSearch();
      if (onlyBse) return { status: 'failed', reason: 'only listed on BSE in Kite' };
      return { status: 'failed', reason: "Kite's search did not find it on NSE" };
    }
    if ($('.ins-added-label', pick.li)) {
      clearSearch();
      return { status: 'skipped', reason: 'already in this list' };
    }

    // If the mouse is over the result, Kite shows its B/S/+ buttons on that row. The click
    // guard refuses such a row. Wait for the buttons to go away, else fail only this symbol.
    const clean = await waitFor(() => pick.li.isConnected && !$('.action-buttons', pick.li), 2000);
    if (!clean) {
      clearSearch();
      return { status: 'failed', reason: 'the mouse is over the Kite search list' };
    }

    safeClick(pick.li, 'result');
    const added = await waitFor(() => {
      const now = readCount();
      return now && before && now.count > before.count;
    }, 4000);
    clearSearch();
    if (!added) return { status: 'failed', reason: 'Kite did not add it' };
    return { status: 'added' };
  }

  // ---- Run state and panel -------------------------------------------------------------------

  const state = { running: false, stop: false };

  const panel = (() => {
    let host;
    let root;
    function ensure() {
      if (host && host.isConnected) return;
      host = document.createElement('div');
      host.id = 'wt-import-panel';
      host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;';
      root = host.attachShadow({ mode: 'open' });
      root.innerHTML = `
        <style>
          .p { width: 300px; font: 13px/1.4 system-ui, sans-serif; color: #1d1d1f; background: #fff; border: 1px solid #d9d9de;
               border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.18); padding: 10px 12px; }
          .h { display: flex; justify-content: space-between; font-weight: 600; margin-bottom: 4px; }
          .x { cursor: pointer; color: #6b6b70; border: 0; background: none; font-size: 16px; line-height: 1; }
          .t { color: #6b6b70; font-size: 12px; margin-bottom: 6px; }
          .bar { height: 6px; background: #eee; border-radius: 3px; overflow: hidden; }
          .bar i { display: block; height: 100%; width: 0; background: #1f6feb; transition: width .2s; }
          .st { margin-top: 6px; }
          .now { color: #6b6b70; font-size: 12px; min-height: 16px; }
          .msg { margin-top: 6px; }
          ul { margin: 4px 0 0; padding-left: 16px; max-height: 140px; overflow: auto; font-size: 12px; }
          li span { color: #6b6b70; }
          .acts { display: flex; gap: 6px; margin-top: 8px; }
          button.b { font: inherit; padding: 4px 10px; border-radius: 6px; border: 1px solid #d9d9de; background: #fff; cursor: pointer; }
          button.b.p1 { background: #1f6feb; color: #fff; border-color: #1f6feb; }
          button.b:disabled { opacity: .6; cursor: default; }
        </style>
        <div class="p">
          <div class="h"><span>Ticker Transfer</span><button class="x" id="close" title="Close">×</button></div>
          <div class="t" id="target"></div>
          <div class="bar"><i id="fill"></i></div>
          <div class="st" id="st"></div>
          <div class="now" id="now"></div>
          <div class="t" id="tip">Keep this tab in front. Do not use the mouse or keyboard on Kite until it finishes.</div>
          <div id="res"></div>
          <div class="acts" id="acts"></div>
        </div>`;
      root.getElementById('close').onclick = () => {
        if (state.running) state.stop = true;
        host.remove();
      };
      document.documentElement.append(host);
    }
    const el = (id) => root.getElementById(id);
    return {
      update({ target, done, total, status, now }) {
        ensure();
        if (target != null) el('target').textContent = target;
        if (total != null) el('fill').style.width = `${total ? Math.round((done / total) * 100) : 100}%`;
        if (status != null) el('st').textContent = status;
        if (now != null) el('now').textContent = now;
      },
      running() {
        ensure();
        el('tip').hidden = false;
        el('res').innerHTML = '';
        el('acts').innerHTML = '';
        const stop = document.createElement('button');
        stop.className = 'b';
        stop.textContent = 'Stop';
        stop.onclick = () => {
          state.stop = true;
          stop.disabled = true;
          stop.textContent = 'Stopping…';
        };
        el('acts').append(stop);
      },
      finish(message, failed) {
        ensure();
        el('now').textContent = '';
        el('tip').hidden = true;
        el('res').innerHTML = '';
        el('acts').innerHTML = '';
        const m = document.createElement('div');
        m.className = 'msg';
        m.textContent = message;
        el('res').append(m);
        if (failed.length) {
          const h = document.createElement('div');
          h.className = 'msg';
          h.textContent = 'Not added:';
          const ul = document.createElement('ul');
          for (const f of failed) {
            const li = document.createElement('li');
            const b = document.createElement('b');
            b.textContent = f.symbol;
            const s = document.createElement('span');
            s.textContent = ` ${f.reason}`;
            li.append(b, s);
            ul.append(li);
          }
          el('res').append(h, ul);
          const copy = document.createElement('button');
          copy.className = 'b';
          copy.textContent = 'Copy list';
          copy.onclick = async () => {
            const t = failed.map((f) => `NSE:${f.symbol}`).join(',');
            try {
              await navigator.clipboard.writeText(t);
              copy.textContent = 'Copied';
            } catch (e) {
              copy.textContent = 'Copy failed';
            }
          };
          el('acts').append(copy);
        }
        const done = document.createElement('button');
        done.className = 'b p1';
        done.textContent = 'Done';
        done.onclick = () => host.remove();
        el('acts').append(done);
      },
    };
  })();

  // sections: [{ name: string|null, symbols: ['KROSS', ...] }] (NSE symbols, broker form)
  async function runImport(sections) {
    if (state.running) return;
    state.running = true;
    state.stop = false;

    const total = sections.reduce((n, s) => n + s.symbols.length, 0);
    const failed = [];
    let added = 0;
    let skipped = 0;
    let done = 0;
    const createdGroups = [];
    const target = () => {
      const c = readCount();
      return `Zerodha Kite · list ${text($(SEL.watchName))}${c ? ` (${c.count} / ${c.limit})` : ''}`;
    };
    const status = () => `${done} / ${total} · ${added} added${skipped ? ` · ${skipped} skipped` : ''}${failed.length ? ` · ${failed.length} failed` : ''}`;

    panel.running();
    panel.update({ target: target(), done: 0, total, status: status(), now: 'Starting…' });

    let stopReason = null;
    const warnings = [];
    try {
      for (const sec of sections) {
        if (state.stop) break;
        if (!sec.symbols.length) continue;
        // Do not make a group when the list has no room left.
        const c = readCount();
        if (c && c.count >= c.limit) {
          for (const s of sec.symbols) failed.push({ symbol: s, reason: `the list is full (${c.limit})` });
          done += sec.symbols.length;
          continue;
        }
        if (sec.name) {
          panel.update({ now: `Group "${sec.name}"…` });
          const g = await ensureGroup(sec.name);
          if (g.created) createdGroups.push(sec.name);
        } else {
          const problem = await useDefaultGroup();
          if (problem) {
            for (const s of sec.symbols) failed.push({ symbol: s, reason: 'not added: a group is selected in Kite' });
            done += sec.symbols.length;
            warnings.push(problem);
            continue;
          }
        }
        for (const symbol of sec.symbols) {
          if (state.stop) break;
          panel.update({ now: `${sec.name ? `${sec.name} → ` : ''}adding ${symbol}…` });
          const r = await addSymbol(symbol);
          done++;
          if (r.status === 'added') added++;
          else if (r.status === 'skipped') skipped++;
          else failed.push({ symbol, reason: r.reason });
          panel.update({ target: target(), done, total, status: status() });
          await wait(150);
        }
      }
    } catch (e) {
      stopReason = e.message;
    } finally {
      clearSearch();
      state.running = false;
    }

    let msg = state.stop ? 'Stopped. Everything added so far stays.' : stopReason ? `Stopped: ${stopReason}` : 'All done.';
    if (createdGroups.length) msg += ` New groups: ${createdGroups.join(', ')}.`;
    if (skipped) msg += ` ${skipped} already in the list.`;
    for (const w of warnings) msg += ` ${w}`;
    panel.update({ target: target(), done, total, status: status() });
    panel.finish(msg, failed);
  }

  browser.runtime.onMessage.addListener((msg) => {
    if (!msg || typeof msg.type !== 'string') return undefined;
    if (msg.type === 'kite-info') return Promise.resolve(info());
    if (msg.type === 'kite-export') return Promise.resolve(exportList());
    if (msg.type === 'kite-import') {
      if (state.running) return Promise.resolve({ ok: false, error: 'running' });
      const i = info();
      if (!i.ok) return Promise.resolve(i);
      runImport(msg.sections);
      return Promise.resolve({ ok: true });
    }
    return undefined;
  });
})();
