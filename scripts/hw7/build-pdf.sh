#!/usr/bin/env bash
# Rebuild the HW7 report PDF from its markdown.
#
# The converter needs Python's `markdown` package, which macOS will not let you
# install into the system interpreter, so this keeps a throwaway virtualenv in
# .venv-hw7 and builds the PDF with headless Chrome.
set -euo pipefail

cd "$(dirname "$0")/../.."

SRC="docs/hw7/HW7_report.md"
OUT="docs/hw7/HW7_report.pdf"
HTML="$(mktemp -t hw7report).html"
VENV=".venv-hw7"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [ ! -x "$VENV/bin/python" ]; then
  echo "setting up $VENV ..."
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install --quiet markdown
fi

"$VENV/bin/python" scripts/hw7/md2html.py "$SRC" "$HTML"

if [ ! -x "$CHROME" ]; then
  echo "Google Chrome not found at: $CHROME" >&2
  echo "Open $HTML in a browser and print to PDF (Letter, no headers or footers)." >&2
  exit 1
fi

"$CHROME" --headless=new --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$OUT" "file://$HTML" 2>/dev/null

PAGES=$(python3 -c "
import re,sys
d=open('$OUT','rb').read()
m=re.search(rb'/Count (\d+)', d)
print(m.group(1).decode() if m else '?')
")
echo "built $OUT, $PAGES pages"
