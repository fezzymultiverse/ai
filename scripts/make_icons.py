#!/usr/bin/env python3
"""
Horizon icon generator.

Renders the Horizon mark (cyan chip with a horizon + sun inside) and writes:
  resources/icon.png                      1024 master (store / README)
  resources/icon-foreground.png           1024 adaptive foreground
  resources/android/res/mipmap-*/         ic_launcher, ic_launcher_round, ic_launcher_foreground
  resources/android/res/mipmap-anydpi-v26 adaptive icon XML
  resources/android/res/values            launcher background colour
  resources/android/res/drawable          splash.xml
  www/icon.png                            192 favicon

Requires Pillow:  pip install pillow
Run from the project root:  python3 scripts/make_icons.py
"""
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CYAN = (0, 229, 255, 255)
BLACK = (0, 0, 0, 255)
SS = 4            # supersampling factor
MASTER = 1024


def mark(size):
    """Transparent RGBA layer with the Horizon mark centred, glow included."""
    s = size * SS
    layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    c = s / 2

    def px(v):
        return v * s

    half = px(0.19)
    stroke = max(2, round(px(0.022)))
    # chip body
    d.rounded_rectangle(
        [c - half, c - half, c + half, c + half],
        radius=px(0.045), outline=CYAN, width=stroke,
    )
    # pins, three per side
    pin_len = px(0.06)
    pin_w = max(2, round(px(0.02)))
    for off in (-0.09, 0.0, 0.09):
        o = px(off)
        d.rounded_rectangle([c + o - pin_w / 2, c - half - pin_len, c + o + pin_w / 2, c - half + stroke / 2], radius=pin_w / 2, fill=CYAN)
        d.rounded_rectangle([c + o - pin_w / 2, c + half - stroke / 2, c + o + pin_w / 2, c + half + pin_len], radius=pin_w / 2, fill=CYAN)
        d.rounded_rectangle([c - half - pin_len, c + o - pin_w / 2, c - half + stroke / 2, c + o + pin_w / 2], radius=pin_w / 2, fill=CYAN)
        d.rounded_rectangle([c + half - stroke / 2, c + o - pin_w / 2, c + half + pin_len, c + o + pin_w / 2], radius=pin_w / 2, fill=CYAN)

    # horizon: half sun + line + two reflection strokes
    hy = c + px(0.02)
    r = px(0.075)
    d.pieslice([c - r, hy - r, c + r, hy + r], 180, 360, fill=CYAN)
    lw = max(2, round(px(0.016)))
    d.rounded_rectangle([c - px(0.125), hy - lw / 2, c + px(0.125), hy + lw / 2], radius=lw / 2, fill=CYAN)
    rw = max(2, round(px(0.013)))
    d.rounded_rectangle([c - px(0.08), hy + px(0.05) - rw / 2, c + px(0.08), hy + px(0.05) + rw / 2], radius=rw / 2, fill=CYAN)
    d.rounded_rectangle([c - px(0.045), hy + px(0.088) - rw / 2, c + px(0.045), hy + px(0.088) + rw / 2], radius=rw / 2, fill=CYAN)

    # glow underneath
    glow = layer.filter(ImageFilter.GaussianBlur(px(0.028)))
    r_, g_, b_, a_ = glow.split()
    a_ = a_.point(lambda v: int(v * 0.65))
    glow = Image.merge("RGBA", (r_, g_, b_, a_))
    out = Image.alpha_composite(glow, layer)
    return out


def foreground(size):
    return mark(size).resize((size, size), Image.LANCZOS)


def legacy(size, round_shape):
    s = size * SS
    base = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(base)
    if round_shape:
        d.ellipse([0, 0, s - 1, s - 1], fill=BLACK)
    else:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=s * 0.22, fill=BLACK)
    fg = mark(size)
    base = Image.alpha_composite(base, fg)
    return base.resize((size, size), Image.LANCZOS)


def save(img, *parts):
    path = os.path.join(ROOT, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "PNG", optimize=True)
    print("wrote", os.path.relpath(path, ROOT))


def write(text, *parts):
    path = os.path.join(ROOT, *parts)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
    print("wrote", os.path.relpath(path, ROOT))


def main():
    densities = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
    for name, mult in densities.items():
        legacy_px = round(48 * mult)
        fg_px = round(108 * mult)
        res = ("resources", "android", "res", f"mipmap-{name}")
        save(legacy(legacy_px, False), *res, "ic_launcher.png")
        save(legacy(legacy_px, True), *res, "ic_launcher_round.png")
        save(foreground(fg_px), *res, "ic_launcher_foreground.png")

    adaptive = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@color/ic_launcher_background"/>\n'
        '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
        '</adaptive-icon>\n'
    )
    write(adaptive, "resources", "android", "res", "mipmap-anydpi-v26", "ic_launcher.xml")
    write(adaptive, "resources", "android", "res", "mipmap-anydpi-v26", "ic_launcher_round.xml")
    write(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<resources>\n'
        '    <color name="ic_launcher_background">#000000</color>\n'
        '</resources>\n',
        "resources", "android", "res", "values", "ic_launcher_background.xml",
    )
    write(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<layer-list xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <item>\n'
        '        <shape android:shape="rectangle">\n'
        '            <solid android:color="#000000"/>\n'
        '        </shape>\n'
        '    </item>\n'
        '    <item android:width="200dp" android:height="200dp" android:gravity="center">\n'
        '        <bitmap android:src="@mipmap/ic_launcher_foreground" android:gravity="fill"/>\n'
        '    </item>\n'
        '</layer-list>\n',
        "resources", "android", "res", "drawable", "splash.xml",
    )

    save(legacy(MASTER, False), "resources", "icon.png")
    save(foreground(MASTER), "resources", "icon-foreground.png")
    save(legacy(192, False), "www", "icon.png")


if __name__ == "__main__":
    main()
