# millan.ai

Personal site, written by hand. No framework, no build step.

- The static behind every page is visual snow. It is roughly how I see the world, so it is how the site sees too. It is drawn from a handful of pre-generated noise tiles, so it costs almost nothing to run.
- Reflections are rows in a Google Sheet, fetched when the page loads. Publishing one is adding a row.
- The typeface is whatever your system calls Helvetica. The photograph is a film scan.
- The bio's two stanzas answer each other line for line. Hover a line and its partner comes forward, with the photographs behind both. They live in `img/pictures/<word>/`, one folder per word, named as the word appears. Adding photographs is dropping them in and running `python3 tools/pictures.py`, which strips their location data and lists them for the page.

Served from this repository by GitHub Pages.
