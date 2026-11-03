"""
Outline a wordmark with PyMuPDF so it can be used as bare SVG paths.

Why: the logo should not depend on an installed font. PyMuPDF can embed a TTF,
draw the text, then export the page as SVG with the text converted to outlines.

Usage:
    python make-wordmark.py                # writes wordmark-choke.svg
    python make-wordmark.py "Choke" wordmark-choke.svg

Change FONT to any TTF/OTF you want. Fredoka One is SIL OFL, so it is safe for
commercial use; the source .ai originally used a FontSpring demo of Torus Pro,
which is why this was replaced.
"""
import os
import sys

import fitz

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", "FredokaOne-Regular.ttf")

text = sys.argv[1] if len(sys.argv) > 1 else "Choke"
out = sys.argv[2] if len(sys.argv) > 2 else "wordmark-choke.svg"
out = out if os.path.isabs(out) else os.path.join(HERE, out)

doc = fitz.open()
page = doc.new_page(width=1400, height=400)
page.insert_font(fontname="brand", fontfile=FONT)
page.insert_text((60, 300), text, fontname="brand", fontsize=200, color=(0, 0, 0))
svg = page.get_svg_image(text_as_path=True)
with open(out, "w", encoding="utf-8") as f:
    f.write(svg)
print(f"wrote {out} ({len(svg)} bytes) — {text!r} in {os.path.basename(FONT)}")
