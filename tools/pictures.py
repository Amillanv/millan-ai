#!/usr/bin/env python3
"""Get the pictures behind words ready to publish, and list them for the page.

Each folder in img/pictures is named after a word in the bio ("natural_world" is "natural world").
Drop pictures into a folder, named however you like, then run:

    python3 tools/pictures.py

For every picture it:
  - removes location, camera and other metadata (phone exports carry GPS coordinates), keeping the
    colour profile, after turning the pixels upright so dropping the orientation tag can't rotate it;
  - shrinks anything taller than 1080px (or wider than 2160px) to fit, so the page loads quickly.
    The strip never shows a picture taller than 420px, so 1080 stays sharp on a retina screen;
    your originals stay in Photos;
  - warns when a picture is too small to stay sharp in the strip.
Then it writes js/pictures-index.js, each folder's pictures in name order with their sizes, and
re-stamps the pages' links to it (tools/stamp.py) so browsers fetch the new list.
Empty folders are left out, so their words stay plain text until they have pictures.

Needs Pillow:  python3 -m pip install Pillow
"""
import json
import os
import sys
import tempfile
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit('Needs Pillow:  python3 -m pip install Pillow')

ROOT = Path(__file__).resolve().parent.parent
PICTURES = ROOT / 'img' / 'pictures'
INDEX = ROOT / 'js' / 'pictures-index.js'
TYPES = {'.jpg', '.jpeg', '.png', '.webp'}
TALLEST = 1080     # px; the strip is at most 420px tall, so this is sharp at 2x with room to spare
WIDEST = 2160      # px; for panoramas
QUALITY = 85       # when a picture has to be re-encoded
SHARP = 720        # px tall; below this a picture goes soft in a tall strip on a retina screen


def tidy(path):
    """Strip metadata from one picture in place, if it has any. Returns (width, height, changed)."""
    with Image.open(path) as im:
        has_meta = bool(im.getexif()) or any(k in im.info for k in ('exif', 'xmp', 'XML:com.adobe.xmp', 'comment'))
        too_big = im.height > TALLEST or im.width > WIDEST
        if not has_meta and not too_big:
            return (*im.size, False)

        fmt, icc = im.format, im.info.get('icc_profile')
        sideways = im.getexif().get(0x0112, 1) not in (None, 1)   # the orientation tag asks for a turn

        options = {'icc_profile': icc} if icc else {}
        if fmt == 'JPEG' and not sideways and not too_big:
            out, options['quality'] = im, 'keep'               # same pixels, same compression: nothing lost
        else:
            out = ImageOps.exif_transpose(im)
            if too_big:
                out.thumbnail((WIDEST, TALLEST), Image.LANCZOS)
            if fmt == 'JPEG':
                out = out.convert('RGB')
                options.update(quality=QUALITY, optimize=True, progressive=True)

        fd, tmp = tempfile.mkstemp(suffix=path.suffix, dir=path.parent)
        os.close(fd)
        try:
            out.save(tmp, fmt, **options)
            os.replace(tmp, path)
        finally:
            if os.path.exists(tmp):
                os.remove(tmp)
        return (*out.size, True)


def main():
    if not PICTURES.is_dir():
        sys.exit(f'No folder at {PICTURES}')
    sets, notes = {}, []
    for folder in sorted(p for p in PICTURES.iterdir() if p.is_dir()):
        entries = []
        for f in sorted(folder.iterdir(), key=lambda f: f.name.lower()):
            if f.name.startswith('.'):
                continue
            if f.suffix.lower() not in TYPES:
                notes.append(f'skipped {f.relative_to(ROOT)}: export it as JPEG')
                continue
            w, h, changed = tidy(f)
            if changed:
                notes.append(f'cleaned {f.relative_to(ROOT)}')
            if h < SHARP:
                notes.append(f'small   {f.relative_to(ROOT)} is {w}x{h}; it will look soft. Export it at full size.')
            entries.append([f.name, w, h])
        if entries:
            sets[folder.name] = entries

    lines = ['/* Written by tools/pictures.py. Run it again after adding or removing pictures.',
             '   Each word\'s pictures, in order: [file, width, height]. */',
             'window.PICTURES = {']
    for word, entries in sets.items():
        lines.append(f'  {json.dumps(word)}: [')
        lines += [f'    {json.dumps(e)},' for e in entries]
        lines.append('  ],')
    lines.append('};')
    INDEX.write_text('\n'.join(lines) + '\n')

    for note in notes:
        print(note)
    total = sum(len(e) for e in sets.values())
    weight = sum((PICTURES / w / e[0]).stat().st_size for w, es in sets.items() for e in es) / 1e6
    print(f'{total} pictures behind {len(sets)} words, {weight:.1f} MB: {", ".join(f"{w} {len(e)}" for w, e in sets.items())}')

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    sys.dont_write_bytecode = True
    import stamp
    stamp.main()


if __name__ == '__main__':
    main()
