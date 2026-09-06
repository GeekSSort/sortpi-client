/**
 * Whether a click on a table row is a click on the ROW.
 *
 * A row that opens a detail view usually carries its own controls too — a
 * Dispatch button, a count stepper, an action menu — and every one of those is
 * a click somebody meant for that control, not for the row.
 *
 * It also answers no at the end of a drag across the row's text: selecting a
 * SKU to copy it finishes with a click, and without this the dialog opened on
 * top of the selection every time.
 *
 * Use it with `<div role="button" tabIndex={0}>`, never `<button>`. A row
 * element that IS a button cannot legally contain one — the browser refuses to
 * nest them and React reports a hydration error — which is what this replaced
 * on the transfers table.
 */
export function isRowClick(target: EventTarget | null): boolean {
  if (target instanceof Element && target.closest("button, input, a, select, textarea")) {
    return false;
  }
  const selection = typeof window === "undefined" ? null : window.getSelection();
  return !selection || selection.isCollapsed;
}

/** Enter or Space on the row itself — not on something focusable inside it. */
export function isRowKey(e: React.KeyboardEvent): boolean {
  if (e.target !== e.currentTarget) return false;
  return e.key === "Enter" || e.key === " ";
}
