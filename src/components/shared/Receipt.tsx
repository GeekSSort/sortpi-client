import React from "react";

/**
 * An 80mm till receipt: monospace, dashed rules, centred except the details
 * block and the money column.
 *
 * One component for all of them — a sale, a reprinted invoice, a refund slip,
 * a purchase order. Only the props change.
 *
 * Monospace matters: a thermal printer prints in fixed cells, so the money
 * column only lines up if every digit is the same width.
 */

const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, "Courier New", monospace';

export interface ReceiptLine {
  /** Free-text description. */
  name: string;
  price: string;
  qty: string | number;
  total: string;
}

export interface ReceiptTotal {
  label: string;
  value: string;
  /** Prints bold. Use it for Total Amount and Net Payable. */
  strong?: boolean;
  /** Draws a dashed line above this row. */
  ruleAbove?: boolean;
}

export interface ReceiptProps {
  business: {
    name: string;
    tagline?: string;
    address?: string;
    bin?: string;
  };
  /** SALES INVOICE, RETURN SLIP, PURCHASE ORDER… */
  title: string;
  /** Customer, Phone, Cashier, Terminal ID, Invoice No, Date. */
  meta: { label: string; value: string }[];
  /** A centred message above the items, if the branch has one. */
  note?: string;
  /** Heading for the description column, e.g. "Item". */
  itemsHeading?: string;
  items: ReceiptLine[];
  totals: ReceiptTotal[];
  /** Small centred lines under the totals. */
  footerNotes?: string[];
  system?: { name: string; url?: string };
}

function Rule() {
  return (
    <div
      aria-hidden
      className="my-[6px] w-full border-t border-dashed border-[#9a9a9a]"
    />
  );
}

export default function Receipt({
  business,
  title,
  meta,
  note,
  itemsHeading = "Item Description",
  items,
  totals,
  footerNotes = [],
  system,
}: ReceiptProps) {
  return (
    <div
      className="mx-auto w-full max-w-[300px] bg-white text-[11px] leading-[1.6] text-[#1e1e1e] box-border"
      style={{ fontFamily: MONO, fontVariantNumeric: "tabular-nums" }}
    >
      {/* Masthead */}
      <p className="text-center text-[19px] leading-[1.25] font-bold tracking-[-0.5px]">
        {business.name}
      </p>
      {business.tagline && (
        <p className="mt-[2px] text-center text-[11px] text-[#525252]">{business.tagline}</p>
      )}

      <Rule />

      {business.address && <p className="break-words">Address: {business.address}</p>}
      {business.bin && <p className="mt-[6px]">BIN No: {business.bin}</p>}

      <Rule />

      <p className="text-center font-bold tracking-[0.08em]">{title}</p>

      <div className="mt-[6px] flex flex-col">
        {meta.map((m) => (
          <p key={m.label} className="break-words">
            {m.label}: {m.value}
          </p>
        ))}
      </div>

      {note && (
        <>
          <Rule />
          <p className="px-[8px] text-center text-[#525252]">{note}</p>
        </>
      )}

      <Rule />

      {/* Items. Grid rather than a table so the four columns keep their widths
          whatever the description does. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-[8px] items-center">
        <span className="min-w-0 font-bold">SL {itemsHeading}</span>
        <span className="text-right font-bold whitespace-nowrap">Price</span>
        <span className="text-center font-bold whitespace-nowrap px-1">Qty</span>
        <span className="text-right font-bold whitespace-nowrap">Total</span>
      </div>

      <Rule />

      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-[8px] gap-y-[3px] items-start">
        {items.map((it, i) => (
          <React.Fragment key={`${it.name}-${i}`}>
            <span className="min-w-0 break-words">
              {i + 1}. {it.name}
            </span>
            <span className="text-right tabular-nums whitespace-nowrap">{it.price}</span>
            <span className="text-center tabular-nums whitespace-nowrap px-1">{it.qty}</span>
            <span className="text-right tabular-nums whitespace-nowrap font-medium">{it.total}</span>
          </React.Fragment>
        ))}
        {items.length === 0 && (
          <span className="col-span-4 py-[6px] text-center text-[#525252]">No items</span>
        )}
      </div>

      <Rule />

      <div className="flex flex-col gap-[2px]">
        {totals.map((t, i) => (
          <React.Fragment key={`${t.label}-${i}`}>
            {t.ruleAbove && <Rule />}
            <div className={`flex items-center justify-between gap-[8px] ${t.strong ? "font-bold text-[12px]" : ""}`}>
              <span className="min-w-0 break-words">{t.label}</span>
              <span className="shrink-0 text-right tabular-nums whitespace-nowrap">{t.value}</span>
            </div>
          </React.Fragment>
        ))}
      </div>

      {footerNotes.length > 0 && (
        <>
          <Rule />
          <div className="flex flex-col gap-[6px]">
            {footerNotes.map((n, i) => (
              <p key={i} className="px-[4px] text-center text-[10.5px] text-[#525252]">
                {n}
              </p>
            ))}
          </div>
        </>
      )}

      {system && (
        <div className="mt-[10px] text-center">
          <p className="font-bold">System by {system.name}</p>
          {system.url && <p className="text-[10.5px] text-[#525252]">{system.url}</p>}
        </div>
      )}
    </div>
  );
}
