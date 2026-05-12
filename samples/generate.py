"""Generate synthetic alcohol-label test images for the verifier.

Usage:
    python3 samples/generate.py

Each label exercises a different compliance scenario:

  PASS scenarios:
    old-tom.jpg             -- clean spirits label, bold all-caps warning
    chateau-margaux.jpg     -- wine + country of origin
    wine-low-abv.jpg        -- wine <14% with ABV present
    wine-low-abv-missing.jpg-- wine <14% with ABV omitted (TTB exemption)
    beer-ipa.jpg            -- IPA (ABV optional for beer at federal level)

  FAIL scenarios:
    altered-warning.jpg     -- title-case warning header
    regular-warning.jpg     -- all-caps warning but regular weight (no bold)
    wrong-abv.jpg           -- ABV on label differs significantly from app

The Government Warning header is rendered BOLD (Arial Black) by default; the
body is rendered REGULAR. This matches the TTB requirement and gives the
vision model the weight contrast it needs to report warning_header_is_bold.
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).parent
CANONICAL_WARNING_HEADER = "GOVERNMENT WARNING:"
CANONICAL_WARNING_BODY = (
    "(1) According to the Surgeon General, women should not\n"
    "drink alcoholic beverages during pregnancy because of the risk of birth\n"
    "defects. (2) Consumption of alcoholic beverages impairs your ability to\n"
    "drive a car or operate machinery, and may cause health problems."
)


def load(size: int, *, bold: bool, heavy: bool = False):
    candidates_heavy = [
        "/System/Library/Fonts/Supplemental/Arial Black.ttf",
        "/Library/Fonts/Arial Black.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    ]
    candidates_bold = [
        "/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf",
        "/Library/Fonts/Times New Roman Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    ]
    candidates_regular = [
        "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
        "/Library/Fonts/Times New Roman.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    if heavy:
        paths = candidates_heavy
    elif bold:
        paths = candidates_bold
    else:
        paths = candidates_regular
    for path in paths:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            pass
    return ImageFont.load_default()


def centered(draw, text, y, font, width, fill):
    bbox = draw.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    draw.text(((width - w) / 2, y), text, font=font, fill=fill)


def label(
    filename,
    bg,
    ink,
    title,
    subtitle,
    class_type,
    abv,
    net,
    producer,
    country,
    warning_header_text=CANONICAL_WARNING_HEADER,
    warning_header_bold=True,
):
    W, H = 900, 1300
    img = Image.new("RGB", (W, H), bg)
    draw = ImageDraw.Draw(img)
    draw.rectangle([(30, 30), (W - 30, H - 30)], outline=ink, width=6)
    draw.rectangle([(50, 50), (W - 50, H - 50)], outline=ink, width=2)

    centered(draw, title, 110, load(70, bold=True), W, ink)
    if subtitle:
        centered(draw, subtitle, 210, load(34, bold=False), W, ink)

    centered(draw, class_type, 340, load(48, bold=True), W, ink)
    if abv:
        centered(draw, abv, 540, load(40, bold=True), W, ink)
    centered(draw, net, 605, load(40, bold=True), W, ink)
    centered(draw, producer, 720, load(28, bold=False), W, ink)
    if country:
        centered(draw, country, 770, load(26, bold=False), W, ink)

    header_font = load(
        24,
        bold=warning_header_bold,
        heavy=warning_header_bold,
    )
    body_font = load(20, bold=False)

    header_y = 920
    centered(draw, warning_header_text, header_y, header_font, W, ink)

    body_y = header_y + header_font.size + 12
    for line in CANONICAL_WARNING_BODY.split("\n"):
        centered(draw, line, body_y, body_font, W, ink)
        body_y += body_font.size + 8

    img.save(OUT / filename, "JPEG", quality=88)
    print("wrote", OUT / filename)


# --- PASS scenarios -----------------------------------------------------------

label(
    "old-tom.jpg",
    bg="#f5e9c8", ink="#3a1d08",
    title="OLD TOM DISTILLERY", subtitle="EST. 1897",
    class_type="Kentucky Straight Bourbon Whiskey",
    abv="45% Alc./Vol. (90 Proof)",
    net="750 mL",
    producer="Old Tom Distillery, Bardstown, KY",
    country=None,
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
)

label(
    "wine-low-abv.jpg",
    bg="#f8efe2", ink="#2e1820",
    title="MEADOWBROOK CELLARS", subtitle="Sonoma Valley",
    class_type="Chardonnay",
    abv="12.5% Alc./Vol.",
    net="750 mL",
    producer="Meadowbrook Cellars, Sonoma, CA",
    country=None,
)

label(
    "wine-low-abv-missing.jpg",
    bg="#f8efe2", ink="#2e1820",
    title="MEADOWBROOK CELLARS", subtitle="Sonoma Valley",
    class_type="Chardonnay",
    abv=None,  # ABV omitted -- legal for wine under 14% when class designation suffices
    net="750 mL",
    producer="Meadowbrook Cellars, Sonoma, CA",
    country=None,
)

label(
    "beer-ipa.jpg",
    bg="#ead8b6", ink="#3a280b",
    title="HOPYARD BREWING CO.", subtitle="EST. 2014",
    class_type="West Coast India Pale Ale",
    abv="6.8% Alc./Vol.",
    net="355 mL",
    producer="Hopyard Brewing Co., Portland, OR",
    country=None,
)

# --- FAIL scenarios -----------------------------------------------------------

label(
    "altered-warning.jpg",
    bg="#f5e9c8", ink="#3a1d08",
    title="OLD TOM DISTILLERY", subtitle="EST. 1897",
    class_type="Kentucky Straight Bourbon Whiskey",
    abv="45% Alc./Vol. (90 Proof)",
    net="750 mL",
    producer="Old Tom Distillery, Bardstown, KY",
    country=None,
    warning_header_text="Government Warning:",
)

label(
    "regular-warning.jpg",
    bg="#f5e9c8", ink="#3a1d08",
    title="OLD TOM DISTILLERY", subtitle="EST. 1897",
    class_type="Kentucky Straight Bourbon Whiskey",
    abv="45% Alc./Vol. (90 Proof)",
    net="750 mL",
    producer="Old Tom Distillery, Bardstown, KY",
    country=None,
    warning_header_bold=False,  # all caps, but not bold -- should fail TTB bold rule
)

label(
    "wrong-abv.jpg",
    bg="#f5e9c8", ink="#3a1d08",
    title="OLD TOM DISTILLERY", subtitle="EST. 1897",
    class_type="Kentucky Straight Bourbon Whiskey",
    abv="50% Alc./Vol. (100 Proof)",  # label says 50%, app will say 45%
    net="750 mL",
    producer="Old Tom Distillery, Bardstown, KY",
    country=None,
)

# Kitchen-sink fixture: every regulated field is wrong in a different way.
# Paired with the OLD TOM application (brand mismatch, class mismatch, ABV
# mismatch, producer mismatch, net contents mismatch + Standards of Fill,
# title-case warning header, regular-weight warning). Demonstrates ~all
# verification rules firing on a single label.
label(
    "multi-violation.jpg",
    bg="#efe7d6", ink="#1f1b16",
    title="SCRUFFY MOON", subtitle="Imported from Nowhere",
    class_type="Vodka",
    abv="50% Alc./Vol. (100 Proof)",
    net="750 mL",
    producer="Scruffy Moon Spirits, Lost City, NV",
    country=None,
    warning_header_text="Government Warning:",
    warning_header_bold=False,
)
