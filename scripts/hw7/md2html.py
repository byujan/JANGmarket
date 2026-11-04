"""Convert docs/hw7/HW7_report.md to a print-ready HTML page (then print it to PDF).

Usage:
  pip install markdown
  python3 scripts/hw7/md2html.py docs/hw7/HW7_report.md /tmp/HW7_report.html
  # macOS, headless Chrome:
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
    --no-pdf-header-footer --print-to-pdf=docs/hw7/HW7_report.pdf file:///tmp/HW7_report.html
Or open the HTML in a browser and print to PDF (Letter, headers and footers off).
"""
import sys

import markdown

CSS = """
@page { size: Letter; margin: 0.55in 0.6in; }
body { font-family: Georgia, 'Times New Roman', serif; font-size: 9.4pt; line-height: 1.3; color: #111; }
h1 { font-size: 15pt; margin: 0 0 4px; }
h2 { font-size: 11.5pt; margin: 12px 0 3px; border-bottom: 1px solid #999; padding-bottom: 1px; }
h3 { font-size: 10pt; margin: 8px 0 2px; }
p { margin: 3px 0 5px; } ul { margin: 2px 0 5px; padding-left: 18px; } li { margin: 1px 0; }
table { border-collapse: collapse; width: 100%; margin: 4px 0 7px; font-size: 8.2pt; page-break-inside: avoid; }
th, td { border: 1px solid #888; padding: 2px 4px; text-align: left; vertical-align: top; }
th { background: #eee; }
h2, h3, p:has(+ table) { break-after: avoid; page-break-after: avoid; }
code { font-family: Menlo, monospace; font-size: 8pt; background: #f2f2f2; padding: 0 2px; }
"""

src_path, out_path = sys.argv[1], sys.argv[2]
with open(src_path, encoding="utf-8") as f:
    body = markdown.markdown(f.read(), extensions=["tables", "sane_lists"])
with open(out_path, "w", encoding="utf-8") as f:
    f.write(
        "<!doctype html><html><head><meta charset='utf-8'><title>HW7 report</title>"
        f"<style>{CSS}</style></head><body>{body}</body></html>"
    )
