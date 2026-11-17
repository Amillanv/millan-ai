/* Reflections are rows in a Google Sheet: category | text | date | image | link.
   Publishing one is adding a row. */
(() => {
  const SHEET_ID = '1IqFT5HtFARSTw8UPof4b0HU2EHPAKlMOXd3NZBqyL8M';
  const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&headers=0`;

  const $status = document.getElementById('status');
  const $filters = document.getElementById('filters');
  const $list = document.getElementById('thoughts');

  /* --- parsing --- */

  const parseDate = cell => {
    if (!cell) return null;
    const v = cell.v;
    if (typeof v === 'string') {
      const m = /^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)$/.exec(v);   // what gviz emits for date cells
      if (m) return new Date(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    }
    if (typeof v === 'number') return new Date(Math.round((v - 25569) * 864e5)); // spreadsheet serial day
    for (const s of [v, cell.f]) {
      if (typeof s !== 'string') continue;
      const d = new Date(s);
      if (!isNaN(d)) return d;
    }
    return null;
  };

  const toRows = table => (table.rows || []).map(r => {
    const c = r.c || [];
    const cell = i => c[i] || null;
    const text = i => (cell(i) && cell(i).v != null) ? String(cell(i).v).trim() : '';
    return { category: text(0) || 'Uncategorized', text: text(1), date: parseDate(cell(2)), image: text(3), link: text(4) };
  }).filter(r => r.text);

  /* --- rendering --- */

  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const longDate = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const host = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'Link'; } };

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  const render = rows => {
    rows.sort((a, b) => (b.date ? b.date.getTime() : -Infinity) - (a.date ? a.date.getTime() : -Infinity));
    $list.replaceChildren();
    const seen = new Map();

    rows.forEach((r, i) => {
      const base = r.date ? ymd(r.date) : 'undated';
      const n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      const id = n > 1 ? `${base}-${n}` : base;          // the date is the permalink

      const art = el('article', 'thought');
      art.id = id;
      art.dataset.category = r.category;
      art.style.setProperty('--i', i);

      art.append(el('div', 'dot'));

      const meta = el('div', 'meta label');
      meta.append(el('span', null, r.category));
      if (r.date) {
        const a = el('a');
        a.href = '#' + id;
        a.title = 'Link to this reflection';
        const t = el('time', null, longDate.format(r.date));
        t.dateTime = ymd(r.date);
        a.append(t);
        meta.append(a);
      }
      art.append(meta);

      art.append(el('p', 'text', r.text));

      if (r.image) {
        const fig = el('figure');
        const img = el('img');
        img.src = r.image; img.alt = ''; img.loading = 'lazy';
        if (r.link) {
          const a = el('a'); a.href = r.link; a.target = '_blank'; a.rel = 'noopener';
          a.append(img); fig.append(a);
        } else {
          fig.append(img);
        }
        art.append(fig);
      }
      if (r.link) {
        const a = el('a', 'source label', host(r.link));
        a.href = r.link; a.target = '_blank'; a.rel = 'noopener';
        art.append(a);
      }

      $list.append(art);
    });
  };

  /* --- filters --- */

  const apply = value => {
    $filters.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === value)));
    $list.querySelectorAll('.thought').forEach(t => { t.hidden = value !== 'all' && t.dataset.category !== value; });
  };

  const buildFilters = rows => {
    const cats = [...new Set(rows.map(r => r.category))].sort((a, b) => a.localeCompare(b));
    if (cats.length < 2) return;                          // one category is not a choice
    const button = (label, value) => {
      const b = el('button', null, label);
      b.type = 'button';
      b.dataset.value = value;
      b.setAttribute('aria-pressed', String(value === 'all'));
      b.addEventListener('click', () => apply(value));
      return b;
    };
    $filters.replaceChildren(button('All', 'all'), ...cats.map(c => button(c, c)));
    $filters.hidden = false;
  };

  /* --- load --- */

  const show = rows => {
    if (!rows.length) { $status.textContent = 'Nothing here yet.'; return; }
    $status.hidden = true;
    buildFilters(rows);
    render(rows);
    if (location.hash) {
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target) { target.style.animationDelay = '0ms'; target.scrollIntoView({ block: 'start' }); }
    }
  };

  const load = async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(SHEET_URL, { signal: ctrl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));  // strip the JSONP wrapper
      show(toRows(json.table || {}));
    } catch (err) {
      $status.textContent = 'Couldn’t load reflections right now. Try again in a moment.';
      console.error(err);
    } finally {
      clearTimeout(timer);
    }
  };

  load();
})();
