/* The static.
   Visual snow, drawn cheaply: a few small noise tiles are generated once, and every frame
   one of them is tiled across the screen from a random origin. The eye reads it as fresh
   noise each frame; the CPU does almost nothing. */
(() => {
  const canvas = document.getElementById('static');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: false });
  const band = document.getElementById('static-top');            // the strip under the header, optional
  const bctx = band ? band.getContext('2d', { alpha: false }) : null;
  const strip = document.getElementById('static-photo');         // inside the photo strip, optional
  const sctx = strip ? strip.getContext('2d', { alpha: false }) : null;
  const TILE = 256, FRAMES = 6, LEVEL = 24;        // LEVEL: brightest grain, out of 255

  const patterns = [];
  for (let f = 0; f < FRAMES; f++) {
    const tile = document.createElement('canvas');
    tile.width = tile.height = TILE;
    const tc = tile.getContext('2d');
    const img = tc.createImageData(TILE, TILE), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() * LEVEL;
      d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    }
    tc.putImageData(img, 0, 0);
    patterns.push(ctx.createPattern(tile, 'repeat'));
  }

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const height = (c, fallback) => Math.round(c.getBoundingClientRect().height) || fallback;

  let w = 0, h = 0, bh = 0, sh = 0;
  const resize = () => {
    w = canvas.width = innerWidth; h = canvas.height = innerHeight;
    if (band) { band.width = innerWidth; bh = band.height = height(band, 128); }
    if (strip) { strip.width = innerWidth; sh = strip.height = height(strip, 260); }
  };

  const draw = () => {
    const ox = (Math.random() * TILE) | 0, oy = (Math.random() * TILE) | 0;
    const pattern = patterns[(Math.random() * FRAMES) | 0];
    // moving the origin is what makes the frame new. dy is how far down the screen a canvas sits:
    // offsetting by it lines the canvas up with the backdrop, so the two read as one surface
    const paint = (c, cw, ch, dy = 0) => {
      c.setTransform(1, 0, 0, 1, -ox, -oy - dy);
      c.fillStyle = pattern;
      c.fillRect(ox, oy + dy, cw, ch);
    };
    paint(ctx, w, h);
    if (bctx) paint(bctx, w, bh);
    // the strip's static only shows around a picture or below the pinned strip, so it is only drawn then
    if (sctx && (still || strip.parentElement.matches('.pinned, .playing'))) {
      paint(sctx, w, sh, Math.round(strip.getBoundingClientRect().top));
    }
  };

  const loop = () => { draw(); if (!still) requestAnimationFrame(loop); };
  const refit = () => { resize(); if (still) draw(); };
  addEventListener('resize', refit);
  if (strip && 'ResizeObserver' in window) new ResizeObserver(refit).observe(strip);   // the strip's height follows the bio
  resize();
  loop();
})();

console.log(
  '%cUNDERSTAND WHAT EXISTS. BUILD WHAT DOESN’T.%c\n\nThe static is visual snow. It is how I see the world.\nSource: https://github.com/Amillanv/millan-ai',
  'font-weight:600', 'font-weight:300'
);
