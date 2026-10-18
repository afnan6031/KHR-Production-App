"""Generates KHR Production icons (web + Android). Run once: python3 scripts/make_icons.py <path-to-display-font>"""
import os, sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = sys.argv[1]
BG = (14, 21, 27)        # ink
TEAL = (59, 195, 184)
SLATE = (229, 236, 241)
ORANGE = (255, 139, 78)


def mark(size, scale=1.0, bg=True, radius=0.22):
    """Draw the logo on a size x size canvas. scale = how much of the canvas the mark uses."""
    S = size * 4
    im = Image.new('RGBA', (S, S), BG + (255,) if bg else (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if bg and radius:
        im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * radius), fill=BG)
    u = S * scale / 64.0
    o = (S - 64 * u) / 2

    def P(x, y):
        return (o + x * u, o + y * u)

    # clapper stick (tilted)
    d.polygon([P(12, 22), P(50, 14), P(51.6, 21.4), P(13.6, 29.4)], fill=TEAL)
    for (x1, y1, x2, y2) in [(20, 19.6, 24, 26), (30.5, 17.4, 34.5, 23.8), (41, 15.2, 45, 21.6)]:
        d.line([P(x1, y1), P(x2, y2)], fill=BG, width=int(3 * u))
    # body
    d.rounded_rectangle([P(12, 31), P(52, 51)], radius=int(4 * u), fill=SLATE)
    f = ImageFont.truetype(FONT, int(13.5 * u))
    cx, cy = P(32, 41.3)
    d.text((cx, cy), 'KHR', font=f, fill=BG, anchor='mm')
    r = 2.4 * u
    ex, ey = P(48.6, 34.6)
    d.ellipse([ex - r, ey - r, ex + r, ey + r], fill=ORANGE)
    return im.resize((size, size), Image.LANCZOS)


def save(im, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, optimize=True)


web = os.path.join(ROOT, 'public', 'icons')
save(mark(64), os.path.join(web, 'favicon.png'))
save(mark(180, radius=0), os.path.join(web, 'apple-touch-icon.png'))
save(mark(192), os.path.join(web, 'icon-192.png'))
save(mark(512), os.path.join(web, 'icon-512.png'))
save(mark(512, scale=0.78, radius=0), os.path.join(web, 'icon-maskable-512.png'))
save(mark(512), os.path.join(ROOT, 'build-resources', 'icon.png'))  # Windows app icon

res = os.path.join(ROOT, 'resources', 'android', 'res')
dens = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
for k, s in dens.items():
    save(mark(s, scale=0.92), os.path.join(res, f'mipmap-{k}', 'ic_launcher.png'))
    rnd = mark(s, scale=0.80, radius=0)
    m = Image.new('L', (s * 4, s * 4), 0)
    ImageDraw.Draw(m).ellipse([0, 0, s * 4 - 1, s * 4 - 1], fill=255)
    rnd.putalpha(m.resize((s, s), Image.LANCZOS))
    save(rnd, os.path.join(res, f'mipmap-{k}', 'ic_launcher_round.png'))
    fg = int(s * 108 / 48)
    save(mark(fg, scale=0.60, bg=False), os.path.join(res, f'mipmap-{k}', 'ic_launcher_foreground.png'))

os.makedirs(os.path.join(res, 'values'), exist_ok=True)
with open(os.path.join(res, 'values', 'ic_launcher_background.xml'), 'w') as fh:
    fh.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0E151B</color>\n</resources>\n')


def splash(w, h):
    im = Image.new('RGBA', (w, h), BG + (255,))
    s = int(min(w, h) * 0.34)
    lg = mark(s, bg=False)
    im.alpha_composite(lg, ((w - s) // 2, (h - s) // 2))
    return im.convert('RGB')


# splash sizes taken from the Capacitor Android template
splash_dirs = sys.argv[2:]  # "folder:WxH"
for spec in splash_dirs:
    folder, dims = spec.split(':')
    w, h = map(int, dims.split('x'))
    save(splash(w, h), os.path.join(res, folder, 'splash.png'))
print('icons written')
