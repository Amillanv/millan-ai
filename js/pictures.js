/* The strip, and the pictures behind the bio.

   The strip is the hero photograph. It sits at the foot of the landing, then pins under the name while
   the bio is read, and takes whatever height the bio leaves on screen.

   The bio's two stanzas answer each other: the nth line of the first is a fear, the nth sentence of the
   second is what is done about it. (A line that starts in lowercase carries on the line before it.)
   Hover either line of a pair, or tap it, and its partner comes forward, the rest of the bio steps back,
   and the strip shows every picture behind the pair's words at once.

   Each folder in img/pictures is named after a word in the bio, and tools/pictures.py lists what is in
   them (js/pictures-index.js). The first time a folder's word appears, it is linked to its pictures.

   The pictures are shown whole, all at one height, in one row or two, whichever lets them be largest,
   set on the text's left edge when they fit there. The stage's clip-path closes in from the full-bleed
   hero to the block of pictures, which rise in one by one, and reshapes from pair to pair. When there are
   too many to show at a decent size, the row runs on and slides as the pointer moves along the line.
   Resting on one word leaves only its pictures lit. Keys: tab onto a word. */
(() => {
  const SETS = window.PICTURES || {};

  const MORPH = 850;      // ms the frame takes to reshape; matches --morph in the CSS
  const INTENT = 110;     // ms the pointer rests on a line before it counts, so passing over lines does nothing
  const LINGER = 380;     // ms off the pair's lines before the hero comes back, so crossing the gap between stanzas is free
  const STAGGER = 45;     // ms between one picture rising and the next
  const GAP = 8;          // px between pictures, and between rows
  const APART = 24;       // px between one word's pictures and the next word's

  const frame = document.getElementById('photo');
  const stage = frame && frame.querySelector('.photo-stage');
  const hero = stage && stage.querySelector('.photo-hero');
  const bio = document.querySelector('.bio');
  if (!hero || !bio) return;

  const root = document.documentElement;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --- the strip's height and state ---------------------------------------------------------- */

  // the CSS sizes the strip from the bio's height, which only the page knows once the text has wrapped
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => root.style.setProperty('--bio-h', Math.ceil(bio.getBoundingClientRect().height) + 'px')).observe(bio);
  }

  // .pinned once the strip is stuck under the name: the fade below it only matters then
  let pinWatch;
  const watchPin = () => {
    if (!('IntersectionObserver' in window)) return;
    if (pinWatch) pinWatch.disconnect();
    const top = parseFloat(getComputedStyle(frame).top) || 0;
    pinWatch = new IntersectionObserver(([e]) => {
      frame.classList.toggle('pinned', e.intersectionRatio < 1 && e.boundingClientRect.top < top + 2);
    }, { rootMargin: `${-(top + 1)}px 0px 0px 0px`, threshold: 1 });
    pinWatch.observe(frame);
  };
  watchPin();
  addEventListener('resize', watchPin);

  /* --- pairs: line n of the first stanza with sentence n of the last ------------------------------ */

  const sentences = stanza => {
    const out = [];
    for (const p of stanza ? stanza.querySelectorAll(':scope > p') : []) {
      const first = p.textContent.trim().charAt(0);
      const carriesOn = first && first === first.toLowerCase() && first !== first.toUpperCase();
      if (carriesOn && out.length) out[out.length - 1].push(p);
      else out.push([p]);
    }
    return out;
  };
  const stanzas = bio.querySelectorAll(':scope > div.stanza');
  const fears = stanzas.length > 1 ? sentences(stanzas[0]) : [];
  const answers = stanzas.length > 1 ? sentences(stanzas[stanzas.length - 1]) : [];
  const pairs = fears.map((lines, i) => ({ lines: [...lines, ...(answers[i] || [])], words: [], items: [] }));
  const pairOf = new Map();
  for (const pair of pairs) for (const p of pair.lines) pairOf.set(p, pair);

  /* --- words: the first whole-word use of each folder's name, never inside a link ------------------ */

  const letter = /[\p{L}\p{N}]/u;
  const mark = folder => {
    const phrase = folder.replace(/[_-]+/g, ' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const find = new RegExp(phrase, 'giu');
    const walker = document.createTreeWalker(bio, NodeFilter.SHOW_TEXT, {
      acceptNode: n => n.parentElement.closest('a, button') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    for (let node; (node = walker.nextNode());) {
      const text = node.data;
      for (let m; (m = find.exec(text));) {
        const i = m.index, end = i + m[0].length;
        if (letter.test(text[i - 1] || '') || letter.test(text[end] || '')) continue;
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, end);
        const word = document.createElement('button');
        word.type = 'button';
        word.className = 'pic';
        word.dataset.pictures = folder;
        word.setAttribute('aria-pressed', 'false');
        word.setAttribute('aria-controls', 'photo');
        range.surroundContents(word);
        return word;
      }
    }
    return null;
  };

  for (const folder of Object.keys(SETS)) {
    if (!SETS[folder].length) continue;
    const word = mark(folder);
    const line = word && word.closest('p');
    if (!line) continue;
    if (!pairOf.has(line)) {                              // a word outside the stanzas is a pair of one line
      const pair = { lines: [line], words: [], items: [] };
      pairs.push(pair);
      pairOf.set(line, pair);
    }
    pairOf.get(line).words.push(word);
  }
  // a pair's pictures run in reading order: the fear's words first, then the answer's
  const before = (a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
  for (const pair of pairs) {
    pair.words.sort(before);
    pair.words.forEach((word, group) => {
      const folder = word.dataset.pictures;
      for (const [file, w, h] of SETS[folder]) {
        pair.items.push({ folder, group, w, h, a: w / h, src: `img/pictures/${folder}/${encodeURIComponent(file)}` });
      }
    });
  }

  /* --- layout: the largest single height at which all of a pair's pictures fit ------------------ */

  const gutter = () => parseFloat(getComputedStyle(root).getPropertyValue('--gutter')) || 20;

  // lay the pictures out left to right at height h, starting a new row when the next would not fit
  const pack = (items, h, avail) => {
    const rows = [];
    let row = null, x = 0;
    items.forEach((it, i) => {
      const w = Math.round(it.a * h);
      const gap = i === 0 ? 0 : it.group !== items[i - 1].group ? APART : GAP;
      if (row && x + gap + w <= avail) { row.push({ it, x: x + gap, w }); x += gap + w; }
      else { row = [{ it, x: 0, w }]; rows.push(row); x = w; }
      row.width = x;
    });
    return rows;
  };

  const layout = pair => {
    const W = stage.clientWidth, H = stage.clientHeight, g = gutter(), avail = W - 2 * g;
    const column = Math.round(bio.getBoundingClientRect().left - stage.getBoundingClientRect().left);
    const items = pair.items;
    const span = items.reduce((s, it) => s + it.a, 0);
    const gaps = items.reduce((s, it, i) => s + (i === 0 ? 0 : it.group !== items[i - 1].group ? APART : GAP), 0);
    const smallest = Math.max(90, H * 0.4);

    let best = null;
    for (let r = 1; r <= 4; r++) {
      let h = Math.floor((H - (r - 1) * GAP) / r);
      if (r === 1) h = Math.min(h, Math.floor((avail - gaps - items.length) / span));   // a px each for rounding
      if (h < smallest || (best && h <= best.h)) continue;
      const rows = pack(items, h, avail);
      if (rows.length <= r && rows.every(row => row.width <= avail)) best = { rows, h };
    }

    if (best) {                                          // everything in view, on the text's edge if there is room
      const { rows, h } = best;
      const wide = Math.max(...rows.map(row => row.width));
      const tall = rows.length * h + (rows.length - 1) * GAP;
      const l = Math.max(g, Math.min(column, W - g - wide)), t = Math.round((H - tall) / 2);
      const boxes = rows.flatMap((row, r) => row.map(({ it, x, w }) => ({ it, l: l + x, t: t + r * (h + GAP), w, h })));
      return { pan: false, boxes, track: W, clip: { l, t, w: wide, h: tall }, W, H };
    }
    const [row] = pack(items, H, Infinity);              // too many: one row at full height that slides
    const boxes = row.map(({ it, x, w }) => ({ it, l: column + x, t: 0, w, h: H }));
    return { pan: true, boxes, track: column + row.width + g, clip: { l: g, t: 0, w: W - 2 * g, h: H }, W, H };
  };

  /* --- the stage ------------------------------------------------------------------------------ */

  const clipTo = c => {
    const { W, H } = c;
    stage.style.clipPath = c.full ? 'inset(0px 0px 0px 0px)'
      : `inset(${c.t}px ${W - c.l - c.w}px ${H - c.t - c.h}px ${c.l}px)`;
  };
  const fullFrame = () => ({ full: true, W: stage.clientWidth, H: stage.clientHeight });

  const build = pair => {
    const reel = document.createElement('div');
    reel.className = 'photo-reel';
    const track = document.createElement('div');
    track.className = 'photo-track';
    reel.append(track);
    reel.imgs = pair.items.map((it, i) => {
      const img = new Image(it.w, it.h);                  // the index knows its shape before it arrives
      img.alt = '';
      img.decoding = 'async';
      img.draggable = false;
      img.dataset.folder = it.folder;
      img.style.transitionDelay = calm ? '0ms' : `${120 + i * STAGGER}ms`;
      img.src = it.src;
      img.decode().then(() => img.classList.add('in'), () => img.remove());   // never paints in halves
      track.append(img);
      return img;
    });
    // once they have all risen, let later changes (a word's focus) happen without the stagger
    setTimeout(() => reel.imgs.forEach(img => { img.style.transitionDelay = ''; }), 900 + pair.items.length * STAGGER);
    stage.append(reel);
    return reel;
  };

  const place = (reel, pair) => {
    const L = layout(pair);
    reel.classList.toggle('pan', L.pan);
    reel.firstChild.style.width = L.track + 'px';
    L.boxes.forEach((b, i) => Object.assign(reel.imgs[i].style, { left: b.l + 'px', top: b.t + 'px', width: b.w + 'px', height: b.h + 'px' }));
    clipTo({ ...L.clip, W: L.W, H: L.H });
    reel.pan = L.pan;
  };

  const retire = reel => {
    reel.classList.add('out');
    setTimeout(() => reel.remove(), 300);
  };

  // the window, the strip or the column moved: put everything straight where it belongs, no animation
  let reel = null, active = null;
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => {
      stage.style.transition = 'none';
      if (reel) place(reel, active); else clipTo(fullFrame());
      stage.getBoundingClientRect();
      stage.style.transition = '';
    }).observe(stage);
  }

  /* --- sliding a row that runs on: follows the pointer along the line, eased --------------------- */

  let aim = 0, at = 0, gliding = 0, pointerX = null;
  const aimAt = x => {
    if (!reel || !reel.pan) return;
    const b = bio.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (x - b.left) / b.width));
    aim = p * (reel.scrollWidth - reel.clientWidth);
    if (!gliding) { at = reel.scrollLeft; gliding = requestAnimationFrame(glide); }
  };
  const glide = () => {
    if (!reel) { gliding = 0; return; }
    at += (aim - at) * (calm ? 1 : 0.14);
    if (Math.abs(aim - at) < 0.5) at = aim;
    reel.scrollLeft = at;
    gliding = at === aim ? 0 : requestAnimationFrame(glide);
  };

  /* --- a pair comes forward ------------------------------------------------------------------- */

  let turn = 0, lingering = 0;

  const light = pair => {
    if (active) {
      active.lines.forEach(p => p.classList.remove('paired'));
      active.words.forEach(w => w.setAttribute('aria-pressed', 'false'));
    }
    active = pair;
    bio.classList.toggle('pairing', !!pair);
    if (pair) {
      pair.lines.forEach(p => p.classList.add('paired'));
      pair.words.forEach(w => w.setAttribute('aria-pressed', 'true'));
    }
  };

  const toHero = () => {
    const run = turn;
    clipTo(fullFrame());
    hero.classList.add('on');
    setTimeout(() => { if (run === turn) frame.classList.remove('playing'); }, MORPH);   // the static runs until the hero is back
  };

  const enter = pair => {
    clearTimeout(lingering);
    if (active === pair) return;
    turn++;
    light(pair);
    if (reel) retire(reel);
    reel = null;
    if (!pair.items.length) { toHero(); return; }
    frame.classList.add('playing');
    hero.classList.remove('on');
    reel = build(pair);
    place(reel, pair);
    reel.getBoundingClientRect();                         // commit the pictures' starting state, so they rise
    if (reel.pan && pointerX != null) { aimAt(pointerX); reel.scrollLeft = at = aim; }
  };

  const stop = () => {
    clearTimeout(lingering);
    if (!active) return;
    turn++;
    light(null);
    if (reel) retire(reel);
    reel = null;
    toHero();
  };
  const leave = () => { clearTimeout(lingering); lingering = setTimeout(stop, LINGER); };

  // resting on one word leaves only its pictures lit
  const spotlight = word => {
    if (!reel) return;
    reel.classList.toggle('focus', !!word);
    for (const img of reel.imgs) img.classList.toggle('match', !!word && img.dataset.folder === word.dataset.pictures);
  };

  // reaching a line starts its downloads, so the pictures are usually there by the time they are wanted
  const fetched = new Set();
  const warm = pair => pair.items.forEach(it => { if (!fetched.has(it.src)) { fetched.add(it.src); new Image().src = it.src; } });

  /* --- input --------------------------------------------------------------------------------- */

  let intent = 0, pointer = '';
  addEventListener('pointerdown', e => { pointer = e.pointerType; }, { capture: true, passive: true });

  for (const pair of pairs) {
    for (const line of pair.lines) {
      line.addEventListener('pointerenter', e => {
        if (e.pointerType !== 'mouse') return;
        clearTimeout(lingering);
        clearTimeout(intent);
        warm(pair);
        intent = setTimeout(() => enter(pair), INTENT);
      });
      line.addEventListener('pointerleave', e => {
        if (e.pointerType !== 'mouse') return;
        clearTimeout(intent);
        leave();
      });
      // touch, and Enter on a word: a tap brings the pair forward, a second tap lets it go
      line.addEventListener('click', e => {
        if (e.detail && pointer === 'mouse') return;     // the mouse already brought it forward by resting on it
        if (active === pair) stop(); else { warm(pair); enter(pair); }
      });
    }
    for (const word of pair.words) {
      word.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') spotlight(word); });
      word.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') spotlight(null); });
      word.addEventListener('focus', () => { if (word.matches(':focus-visible')) { enter(pair); spotlight(word); } });
      word.addEventListener('blur', () => { spotlight(null); if (active === pair) leave(); });
    }
  }

  bio.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { pointerX = e.clientX; aimAt(pointerX); } }, { passive: true });

  // a tap anywhere but the bio's lines or the strip, or the bio leaving the screen, brings the hero back
  document.addEventListener('click', e => {
    if (active && !(e.target.closest('p') && pairOf.has(e.target.closest('p'))) && !e.target.closest('.photo')) stop();
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { if (!e.isIntersecting) stop(); }).observe(bio);

    // the first time the bio is read, its linked words light up once, top to bottom: there is something here
    const words = pairs.flatMap(p => p.words).sort(before);
    if (!calm && words.length) {
      const cue = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        cue.disconnect();
        words.forEach((w, i) => setTimeout(() => {
          if (active) return;
          w.classList.add('hint');
          setTimeout(() => w.classList.remove('hint'), 700);
        }, 500 + i * 170));
      }, { threshold: 0.6 });
      cue.observe(bio);
    }
  }
})();
