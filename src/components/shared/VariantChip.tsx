import React from "react";

/**
 * Which variant of a product this is — "500ml", "Red / Large".
 *
 * One component so the till, the invoice column and anything else naming a
 * variant draw it the same way. They did not: a tile used purple 12px text and
 * the Selected Items column used purple text run together with the SKU by a
 * middot, so the same fact looked like two different kinds of thing on two
 * halves of one screen.
 *
 * Built like `StatusPill` and coloured from the same gold, because that is
 * what this app already uses for "the notable thing about this row" — and with
 * a label dark enough to read at 11px, which is the mistake the pills had.
 *
 * Renders NOTHING for an empty label. A product sold one way has a variant the
 * API calls "Default", and the mapper returns "" for it: printing a chip on
 * every tile in a shop that has no variants is noise on every tile.
 */
export default function VariantChip({
  label,
  size = "sm",
}: {
  label: string;
  /** `sm` for a tile or a list row; `xs` where it sits inside another line. */
  size?: "sm" | "xs";
}) {
  if (!label) return null;
  const metrics =
    size === "xs"
      ? "h-[18px] px-[6px] text-[11px]"
      : "h-[20px] px-[8px] text-[12px]";
  return (
    <span
      className={`inline-flex ${metrics} max-w-full shrink-0 items-center overflow-hidden rounded-[6px] bg-[#fff8e1] font-semibold tracking-[-0.12px] whitespace-nowrap text-[#8a6200] ring-1 ring-[#f2e0a8] ring-inset`}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}
