"""Generate synthetic alcohol-label test images for the verifier.

Usage:
    python3 samples/generate.py

Each label exercises a different scenario:
    old-tom.jpg          -- clean label that should pass against the matching app
    altered-warning.jpg  -- warning in Title Case instead of all caps (must FAIL)
    chateau-margaux.jpg  -- wine label, imports country of origin
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).parent
CANONICAL_WARNING = (
    "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not\n"
    "drink alcoholic beverages during pregnancy because of the risk of birth\n"
    "defects. (2) Consumption of alcoholic beverages impairs your ability to\n"
    "drive a car or operate machinery, and may cause health problems."
)
ALTERED_WARNING = CANONICAL_WARNING.replace("GOVERNMENT WARNING:", "Government Warning:")


def load(size: int):
    for path in (
        "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf",
        "/Library/Fonts/Times New Roman Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            pass
    return ImageFont.load_default()


def centered(draw, text, y, font, width, fill):
    bbox = draw.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    draw.text(((width - w) / 2, y), text, font=font, fill=fill)


def multiline(draw, text, y, font, width, fill):
    for line in text.split("\n"):
        bbox = draw.textbbox((0, 0), line, font=font)
        w = bbox[2] - bbox[0]
        draw.text(((width - w) / 2, y), line, font=font, fill=fill)
        y += font.size + 8
    return y


def label(filename, bg, ink, title, subtitle, class_type, abv, net, producer, country, warning):
    W, H = 900, 1200
    img = Image.new("RGB", (W, H), bg)
    draw = ImageDraw.Draw(img)
    draw.rectangle([(30, 30), (W - 30, H - 30)], outline=ink, width=6)
    draw.rectangle([(50, 50), (W - 50, H - 50)], outline=ink, width=2)

    centered(draw, title, 110, load(70), W, ink)
    if subtitle:
        centered(draw, subtitle, 210, load(34), W, ink)

    centered(draw, class_type, 340, load(48), W, ink)

    centered(draw, abv, 540, load(40), W, ink)
    centered(draw, net, 605, load(40), W, ink)

    centered(draw, producer, 720, load(28), W, ink)
    if country:
        centered(draw, country, 770, load(26), W, ink)

    multiline(draw, warning, 880, load(20), W, ink)
    img.save(OUT / filename, "JPEG", quality=88)
    print("wrote", OUT / filename)


label(
    "old-tom.jpg",
    bg="#f5e9c8", ink="#3a1d08",
    title="OLD TOM DISTILLERY", subtitle="EST. 1897",
    class_type="Kentucky Straight Bourbon Whiskey",
    abv="45% Alc./Vol. (90 Proof)",
    net="750 mL",
    producer="Old Tom Distillery, Bardstown, KY",
    country=None,
    warning=CANONICAL_WARNING,
)

label(
    "altered-warning.jpg",
    bg="#f5e9c8", ink="#3a1d08",
    title="OLD TOM DISTILLERY", subtitle="EST. 1897",
    class_type="Kentucky Straight Bourbon Whiskey",
    abv="45% Alc./Vol. (90 Proof)",
    net="750 mL",
    producer="Old Tom Distillery, Bardstown, KY",
    country=None,
    warning=ALTERED_WARNING,
)

label(
    "chateau-margaux.jpg",
    bg="#f3ecdc", ink="#3d0a0a",
    title="Chateau Margaux", subtitle=None,
    class_type="Red Wine",
    abv="13% Alc./Vol.",
    net="750 mL",
    producer="Chateau Margaux, Margaux, France",
    country="France",
    warning=CANONICAL_WARNING,
)
