"""KHR Production ke saare icons owner ke asli logos se banata hai.
Source: resources/brand/khr-logo-main.png (square), khr-logo-circle.png (gol), khr-logo-white.png (white).
Run: python3 scripts/make_icons.py"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
B = os.path.join(ROOT, 'resources', 'brand')
MAIN = Image.open(os.path.join(B, 'khr-logo-main.png')).convert('RGBA')
CIRCLE = Image.open(os.path.join(B, 'khr-logo-circle.png')).convert('RGBA')
WHITE = Image.open(os.path.join(B, 'khr-logo-white.png')).convert('RGBA')
NAVY = (18, 20, 78, 255)       # logo ke gradient ka beech wala rang
DARK = (9, 12, 36, 255)        # splash background


def fit(img, size):
    return img.resize((size, size), Image.LANCZOS)


def on_bg(img, size, scale, bg):
    canvas = Image.new('RGBA', (size, size), bg)
    s = int(size * scale)
    canvas.alpha_composite(fit(img, s), ((size - s) // 2, (size - s) // 2))
    return canvas


def save(im, *path):
    p = os.path.join(ROOT, *path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    im.save(p, optimize=True)


# ---- app ke andar (header, login, server) ----
save(fit(MAIN, 512), 'public', 'brand', 'khr-main.png')
save(fit(CIRCLE, 244), 'public', 'brand', 'khr-circle.png')
save(fit(WHITE, 244), 'public', 'brand', 'khr-white.png')

# ---- web / PC (PWA) ----
save(fit(CIRCLE, 64), 'public', 'icons', 'favicon.png')
save(on_bg(MAIN, 180, 0.9, NAVY).convert('RGB'), 'public', 'icons', 'apple-touch-icon.png')
save(fit(MAIN, 192), 'public', 'icons', 'icon-192.png')
save(fit(MAIN, 512), 'public', 'icons', 'icon-512.png')
save(on_bg(CIRCLE, 512, 0.78, NAVY), 'public', 'icons', 'icon-maskable-512.png')

# ---- Windows installer ----
save(fit(MAIN, 512), 'build-resources', 'icon.png')

# ---- Android ----
res = os.path.join('resources', 'android', 'res')
dens = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
for k, s in dens.items():
    save(fit(MAIN, s), res, f'mipmap-{k}', 'ic_launcher.png')
    save(fit(CIRCLE, s), res, f'mipmap-{k}', 'ic_launcher_round.png')
    fg = int(s * 108 / 48)
    # adaptive icon: gol logo dikhne wale 72dp hisse ko bhar de
    canvas = Image.new('RGBA', (fg, fg), (0, 0, 0, 0))
    c = int(fg * 74 / 108)
    canvas.alpha_composite(fit(CIRCLE, c), ((fg - c) // 2, (fg - c) // 2))
    save(canvas, res, f'mipmap-{k}', 'ic_launcher_foreground.png')
with open(os.path.join(ROOT, res, 'values', 'ic_launcher_background.xml'), 'w') as fh:
    fh.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#12144E</color>\n</resources>\n')

# splash screens (Capacitor template ke sizes)
SPLASH = {'drawable': (480, 320), 'drawable-land-mdpi': (480, 320), 'drawable-land-hdpi': (800, 480), 'drawable-land-xhdpi': (1280, 720),
          'drawable-land-xxhdpi': (1600, 960), 'drawable-land-xxxhdpi': (1920, 1280), 'drawable-port-mdpi': (320, 480), 'drawable-port-hdpi': (480, 800),
          'drawable-port-xhdpi': (720, 1280), 'drawable-port-xxhdpi': (960, 1600), 'drawable-port-xxxhdpi': (1280, 1920)}
for folder, (w, h) in SPLASH.items():
    im = Image.new('RGBA', (w, h), DARK)
    s = int(min(w, h) * 0.36)
    im.alpha_composite(fit(MAIN, s), ((w - s) // 2, (h - s) // 2))
    save(im.convert('RGB'), res, folder, 'splash.png')
print('KHR icons ready')

# notification ka chhota icon (Android sirf safed shakal dikhata hai): logo ka laal "K" safed kar ke
px = WHITE.load()
mono = Image.new('RGBA', WHITE.size, (0, 0, 0, 0))
mp = mono.load()
for y in range(WHITE.size[1]):
    for x in range(WHITE.size[0]):
        r, g, b, a = px[x, y]
        if a > 100 and r > 150 and g < 120:
            mp[x, y] = (255, 255, 255, 255)
for k, s in {'mdpi': 24, 'hdpi': 36, 'xhdpi': 48, 'xxhdpi': 72, 'xxxhdpi': 96}.items():
    save(mono.resize((s, s), Image.LANCZOS), res, f'drawable-{k}', 'ic_stat_khr.png')
print('notification icon ready')
