#!/usr/bin/env python3
"""Stamp every stylesheet and script the pages load with a short fingerprint of its contents.

    <link rel="stylesheet" href="css/styles.css?v=1a2b3c4d">

GitHub Pages lets browsers keep each file for ten minutes. Without a stamp, a visit just after
publishing can pair the new page with last version's stylesheet: wrong font, pictures out of place.
With one, a changed file has a new address, so the new page always fetches it.

Run it before committing whenever CSS or JS has changed (tools/pictures.py runs it for you):

    python3 tools/stamp.py
"""
import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LINK = re.compile(r'((?:href|src)=")((?:css|js)/[^"?#]+\.(?:css|js))(?:\?v=[0-9a-f]*)?(")')


def main():
    for page in sorted(ROOT.glob('*.html')):
        text = page.read_text()

        def stamp(m):
            asset = ROOT / m.group(2)
            if not asset.is_file():
                return m.group(0)
            digest = hashlib.sha256(asset.read_bytes()).hexdigest()[:8]
            return f'{m.group(1)}{m.group(2)}?v={digest}{m.group(3)}'

        stamped = LINK.sub(stamp, text)
        if stamped != text:
            page.write_text(stamped)
            print(f'stamped {page.name}')


if __name__ == '__main__':
    main()
