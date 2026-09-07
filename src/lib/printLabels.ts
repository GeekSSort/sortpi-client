/**
 * Print shelf labels.
 *
 * A separate window rather than a print stylesheet over the page. The products
 * table is a 9-column grid inside a scrolling shell inside a dashboard layout,
 * and persuading all of that to lay out as a sheet of 40mm labels means print
 * rules that fight the screen rules forever. A window that contains only labels
 * has nothing to fight.
 *
 * The bars are handed over as finished SVG markup — the caller has already
 * drawn them through the same component the screen uses, so what prints is what
 * was on screen, and there is one encoder in the product rather than two.
 */

export interface LabelSpec {
  /** The product name, printed above the bars. */
  name: string;
  /** What it sells for, printed under the bars. Optional. */
  price?: string;
  /**
   * The finished <svg> for this code, digits included.
   *
   * The human-readable number is part of the symbol — `Barcode` draws it under
   * the bars, at the bar spacing, which is what the standard asks for and what
   * lets somebody key the code in when a label is scuffed. This template used
   * to print it AGAIN underneath, so every label carried the number twice.
   */
  svg: string;
}

/**
 * `copies` is per label. A shop labelling a case of 24 wants 24 identical
 * stickers, and printing them one at a time is the reason people give up on
 * label printing and write prices on with a marker.
 */
export function printBarcodeLabels(labels: LabelSpec[], copies = 1): void {
  const sheet = labels.flatMap((label) => Array.from({ length: Math.max(1, copies) }, () => label));
  if (sheet.length === 0) return;

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Barcode labels</title>
<style>
  /* 40 x 30mm is the common thermal label, and the size a sheet of A4
     stickers is usually cut to. @page keeps the browser from adding its own
     margin on top of the label's. */
  @page { margin: 8mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #000;
    background: #fff;
  }
  .sheet {
    display: flex;
    flex-wrap: wrap;
    gap: 4mm;
    align-content: flex-start;
  }
  .label {
    width: 44mm;
    padding: 2mm;
    border: 0.2mm dashed #bbb;   /* the cut line, and it prints faintly */
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1mm;
    /* Never split a label across two pages: half a barcode scans as nothing. */
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .name {
    font-size: 8pt;
    line-height: 1.2;
    font-weight: 600;
    text-align: center;
    width: 100%;
    /* Two lines at most, so every label on the sheet is the same height. */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .price { font-size: 9pt; font-weight: 700; }
  svg { max-width: 100%; height: auto; }
  @media screen {
    body { padding: 16px; background: #f4f4f4; }
    .sheet { background: #fff; padding: 8mm; }
  }
</style>
</head>
<body>
  <div class="sheet">
    ${sheet
      .map(
        (label) => `<div class="label">
      <span class="name">${escapeHtml(label.name)}</span>
      ${label.svg}
      ${label.price ? `<span class="price">${escapeHtml(label.price)}</span>` : ""}
    </div>`
      )
      .join("\n    ")}
  </div>
  <script>
    // Print once the SVG has laid out. Firing on load rather than immediately
    // is what stops a blank first page.
    window.addEventListener("load", function () {
      window.focus();
      window.print();
    });
  </script>
</body>
</html>`;

  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) {
    // A blocked pop-up is the one failure worth naming: everything looks
    // exactly as if the button did nothing.
    window.alert("Allow pop-ups for this site to print labels.");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
