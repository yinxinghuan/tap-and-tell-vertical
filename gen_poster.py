#!/usr/bin/env python3
"""Generate 1024×1024 poster: bookstore cover + Tap & Tell · Vertical title."""
import os, urllib.request, ssl
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_GAME = os.path.join(HERE, 'public/poster.png')
OUT_LIST = '/Users/yin/code/games/games/posters/tap-and-tell-vertical.png'

COVER_URL = 'https://cdn.aiwaves.tech/prod/telegram/avatar/618336286/1779974022082719.webp'
COVER_LOCAL = '/tmp/bookstore_cover.webp'
ALTERU_SVG = os.path.join(HERE, 'public/logo-mark.svg')

# Fetch cover if not cached
if not os.path.exists(COVER_LOCAL):
    ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(COVER_URL, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=60, context=ctx) as r, open(COVER_LOCAL, 'wb') as f:
        f.write(r.read())

# Open + resize cover to 1024
cover = Image.open(COVER_LOCAL).convert('RGB')
cover = cover.resize((1024, 1024), Image.LANCZOS)

# Top gradient overlay so title is readable
overlay = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
ovd = ImageDraw.Draw(overlay)
for y in range(0, 600):
    # fade from 85% black at top to 0% at y=600
    a = int(218 * (1 - y / 600) ** 1.4)
    ovd.line([(0, y), (1024, y)], fill=(0, 0, 0, a))
cover = Image.alpha_composite(cover.convert('RGBA'), overlay)

draw = ImageDraw.Draw(cover)

# Fonts. Use system font fallbacks.
def font(name_candidates, size):
    for n in name_candidates:
        for d in ['/Library/Fonts', '/System/Library/Fonts/Supplemental', '/System/Library/Fonts']:
            for ext in ['.ttf', '.otf', '.ttc']:
                p = os.path.join(d, n + ext)
                if os.path.exists(p):
                    try: return ImageFont.truetype(p, size)
                    except Exception: pass
    return ImageFont.load_default()

# Cormorant italic for big title; fall back to Times Italic
cormorant = font(['Cormorant Garamond Medium Italic', 'CormorantGaramond-MediumItalic',
                  'Cormorant Italic', 'Times New Roman Italic'], 138)
inter_bold = font(['Inter-Bold', 'Inter Bold', 'Helvetica Neue', 'Arial Bold'], 17)
inter_med = font(['Inter-Medium', 'Inter', 'Helvetica Neue Medium', 'Arial'], 34)
cor_sm = font(['Cormorant Garamond Medium Italic', 'CormorantGaramond-MediumItalic',
               'Cormorant Italic', 'Times New Roman Italic'], 34)

# Top brand row
draw.text((72, 70), 'ON ALTERU', fill='#F4F1EA', font=inter_bold, anchor='lt')

# Title (2 lines)
TITLE_X, TITLE_Y = 72, 138
title_lines = ['Tap & Tell.', '· Vertical']
for i, line in enumerate(title_lines):
    color = '#F4F1EA' if i == 0 else '#F5B1C7'
    draw.text((TITLE_X, TITLE_Y + i * 152), line, fill=color, font=cormorant, anchor='lt')

# Pitch line below
draw.text((TITLE_X, TITLE_Y + 152 * 2 + 22), 'tell what happens next.', fill='#F5B1C7',
          font=cor_sm, anchor='lt')

cover.convert('RGB').save(OUT_GAME)
print('saved:', OUT_GAME)
import shutil; shutil.copy(OUT_GAME, OUT_LIST)
print('saved:', OUT_LIST)
