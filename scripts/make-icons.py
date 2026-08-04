"""
Generate the app icons: a large Anton "75" in the app's near-black on bone.

Anton is the display face index.html already uses for figures, so the icon and
the day number on Today are the same letterforms.

The mark runs dark-on-light while the app itself is light-on-dark. That is
deliberate: a near-black icon sinks into a dark wallpaper, and a Home Screen is
mostly other people's colour. Bone is the brightest thing you can put there.

Two variants:
  any       — the numerals cropped confidently, near the edges (iOS masks
              corners itself, so a full-bleed square is what it wants)
  maskable  — the same mark pulled in to the inner 80% safe circle, because
              Android crops maskable icons to whatever shape the launcher uses
"""
import os
from PIL import Image, ImageDraw, ImageFont

INK = (10, 10, 11)        # --ink   #0A0A0B
BONE = (242, 241, 237)    # --bone  #F2F1ED
FIELD, MARK = BONE, INK   # swap these two to flip the icon back
# Anton, the same face index.html loads for figures. Fetch it once with:
#   curl -sL -o anton.ttf \
#     "$(curl -s 'https://fonts.googleapis.com/css2?family=Anton' \
#        -H 'User-Agent: Mozilla/5.0' | grep -o 'https[^)]*\.ttf')"
FONT = os.environ.get('ANTON_TTF', 'anton.ttf')
TEXT = '75'


def render(size, coverage):
    """coverage = fraction of the square the numerals should span."""
    # Oversample, then downsample — Anton's flat terminals alias badly otherwise.
    ss = 4
    W = size * ss
    img = Image.new('RGB', (W, W), FIELD)
    draw = ImageDraw.Draw(img)

    # Find the point size whose *ink* (not font metrics) hits the target width.
    target = W * coverage
    lo, hi = 10, W * 3
    while lo < hi:
        mid = (lo + hi + 1) // 2
        f = ImageFont.truetype(FONT, mid)
        l, t, r, b = draw.textbbox((0, 0), TEXT, font=f)
        if (r - l) <= target:
            lo = mid
        else:
            hi = mid - 1

    font = ImageFont.truetype(FONT, lo)
    l, t, r, b = draw.textbbox((0, 0), TEXT, font=font)
    # centre on the ink box, so ascender/descender padding doesn't push it off
    x = (W - (r - l)) / 2 - l
    y = (W - (b - t)) / 2 - t
    draw.text((x, y), TEXT, font=font, fill=MARK)

    return img.resize((size, size), Image.LANCZOS)


def main():
    out = os.path.join(os.path.dirname(__file__), '..', 'icons') + '/'
    # iOS ignores alpha and fills it black, so everything here is fully opaque
    for name, size, cov in [
        ('icon-512.png', 512, 0.74),
        ('icon-192.png', 192, 0.74),
        ('apple-touch-icon.png', 180, 0.74),
        # Android can crop up to 20% off each edge on a maskable icon
        ('icon-maskable-512.png', 512, 0.50),
    ]:
        img = render(size, cov)
        img.save(out + name, 'PNG', optimize=True)
        print(f'{name:26} {size}x{size}  ink covers {cov:.0%}')


if __name__ == '__main__':
    main()
