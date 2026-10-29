// Popup: small DOM helpers for the cards, counts, notes and lists.
(function () {
  const make = (tag, cls, textValue) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (textValue != null) el.textContent = textValue;
    return el;
  };

  // A site card: a dot, then a title and a line under it (or one line of text).
  // state: 'ok' | 'bad' | 'busy' | 'idle'
  function card(el, { title, sub, text, state = 'ok' }) {
    el.className = `site${state === 'ok' ? '' : ` ${state}`}`;
    el.textContent = '';
    const box = make('div', 'txt');
    if (title) box.append(make('b', null, title));
    if (sub) box.append(make('small', null, sub));
    if (text) box.append(text);
    el.append(make('span', 'dot'), box);
  }

  // Three counts: [[number, label, warn], ...]
  function stats(el, items) {
    el.textContent = '';
    for (const [n, label, warn] of items) {
      const d = make('div', warn ? 'w' : null);
      d.append(make('b', null, String(n)), make('span', null, label));
      el.append(d);
    }
    el.hidden = !items.length;
  }

  // kind: '' (warning) | 'info' | 'bad' | 'good'
  function note(container, textValue, kind = '') {
    container.append(make('div', `note${kind ? ` ${kind}` : ''}`, textValue));
  }

  function setNote(el, textValue, kind = '') {
    el.className = `note${kind ? ` ${kind}` : ''}`;
    el.textContent = textValue;
    el.hidden = false;
  }

  // The "Not added" list: [{ symbol, reason }]
  function failList(el, failed) {
    el.textContent = '';
    el.hidden = !failed || !failed.length;
    if (el.hidden) return;
    const h = make('div', 'h');
    h.append(make('span', null, `Not added (${failed.length}):`));
    el.append(h);
    for (const f of failed) {
      const row = make('div');
      row.append(make('b', null, f.symbol), make('span', null, f.reason || ''));
      el.append(row);
    }
  }

  // Put failed symbols back into their sections, in the order of the run, for a retry.
  function regroup(failed) {
    const out = [];
    for (const f of failed) {
      const name = f.section || null;
      let s = out.find((x) => x.name === name);
      if (!s) out.push((s = { name, symbols: [] }));
      s.symbols.push(f.symbol);
    }
    return out;
  }

  // Progress: a bar, a line of text and a count.
  function progress(box, bar, label, count, { done, total, now }) {
    box.hidden = false;
    bar.style.width = `${total ? Math.round((done / total) * 100) : 0}%`;
    label.textContent = now || '';
    count.textContent = total ? `${done} / ${total}` : '';
  }

  globalThis.WTUI = { make, card, stats, note, setNote, failList, regroup, progress };
})();
