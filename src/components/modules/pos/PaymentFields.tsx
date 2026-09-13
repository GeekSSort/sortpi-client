"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * The money half of a payment dialog, shared by Pay Cash and Pay Online.
 *
 * One component because the two dialogs ask the SAME four questions — what is
 * owed, what was handed over, anything extra, what is left — and the only
 * difference between them is the tender. Two copies would have drifted the
 * first time one of the four changed.
 *
 * Arithmetic, and the order matters:
 *
 *     due = (total payable + additional) - received
 *
 * `received` may be less than what is owed: that is a part-paid sale and the
 * remainder goes on the customer's account, which the server already supports.
 * It may not be MORE — the server refuses a tender over the total — so the
 * field is capped and "Full" is the one-press way to pay it exactly.
 *
 * The dialog carries no explanatory sentences. A required field is marked with
 * an asterisk and nothing else: a till is read at a glance with a customer
 * waiting, and a paragraph under a box is text nobody reads twice. What the
 * prose used to say now lives on `title`, where it is there for the one cashier
 * who goes looking.
 */

export interface PaymentEntry {
  /** What the customer handed over. Never above payable + additional. */
  received: number;
  /** A surcharge added to the bill — a late-hour fee, a delivery run. */
  additional: number;
  /** Why the surcharge was added. Required once there is one. */
  reason: string;
}

export const EMPTY_ENTRY: PaymentEntry = { received: 0, additional: 0, reason: "" };

/** What the customer owes once the surcharge is on. */
export function payableWith(total: number, entry: PaymentEntry): number {
  return total + Math.max(0, entry.additional || 0);
}

/** What is still outstanding after the tender. Never negative. */
export function dueFor(total: number, entry: PaymentEntry): number {
  return Math.max(0, payableWith(total, entry) - Math.max(0, entry.received || 0));
}

const FIELD =
  "h-[40px] w-full rounded-[8px] border border-[#eaeaea] bg-white px-[12px] text-[14px] " +
  "text-[#1e1e1e] outline-none placeholder:text-[#a3a3a3] focus:border-[#3300bc]";

const LABEL = "text-[14px] font-medium text-[#1e1e1e]";

/** The one mark this dialog uses to say a field is not optional. */
function Required() {
  return (
    <span aria-hidden className="text-[#c80000]">
      {" "}
      *
    </span>
  );
}


/**
 * A money box that will not let you type a third decimal place.
 *
 * `type="number"` cannot do this: `step="0.01"` only marks a value invalid on
 * submit, and the browser still accepts 458.6789 while the cashier types it.
 * Worse, a controlled NUMBER round-trips through `Number()` on every keystroke,
 * so the "." in "10." is parsed away the instant it is typed and the field
 * fights anyone entering a decimal at all.
 *
 * So the text is held here as text, filtered to digits and at most one dot with
 * at most two places after it, and only then handed up as a number. The parent
 * still caps the value — a tender over the bill is refused by the server — and
 * when it does, the effect below writes the capped figure back into the box.
 */
function MoneyInput({
  id,
  value,
  onChange,
  disabled,
  readOnly,
  title,
  placeholder,
  className,
  required,
}: {
  id: string;
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  readOnly?: boolean;
  title?: string;
  placeholder?: string;
  className?: string;
  required?: boolean;
}) {
  // Two decimals, always, for a figure this box is DISPLAYING rather than one
  // being typed into it. `String(466.2)` gives "466.2" and a float total can
  // arrive as 466.18000000000004; neither is a figure to hand a customer.
  //
  // Only for the read-only and re-synced cases: forcing it while someone is
  // typing would rewrite "10." to "10.00" under the cursor.
  const show = (n: number) => (n === 0 ? "" : n.toFixed(2));
  const [text, setText] = useState(() => show(value));
  // What this box last sent up. A `value` that differs from it came from
  // somewhere else — the Full button, the lock, a cap — and the box has to
  // follow it. Comparing against the prop directly would instead overwrite
  // the half-typed "10." on the very next render.
  const mine = useRef(value);

  useEffect(() => {
    if (value !== mine.current) {
      mine.current = value;
      setText(show(value));
    }
  }, [value]);

  const handle = (raw: string) => {
    let next = raw.replace(/[^\d.]/g, "");
    const dot = next.indexOf(".");
    if (dot !== -1) {
      // One dot, and two digits after it. Everything past that is dropped as
      // it is typed rather than rounded on save, so what the drawer is told
      // is what the cashier can see.
      next = next.slice(0, dot + 1) + next.slice(dot + 1).replace(/\./g, "");
      next = next.slice(0, dot + 3);
    }
    setText(next);
    const n = Number(next);
    const clean = Number.isFinite(n) ? n : 0;
    mine.current = clean;
    onChange(clean);
  };

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      required={required}
      disabled={disabled}
      readOnly={readOnly}
      title={title}
      value={readOnly ? show(value) : text}
      onChange={(e) => handle(e.target.value)}
      placeholder={placeholder}
      className={className}
    />
  );
}

export default function PaymentFields({
  subtotal,
  tax,
  vatRate,
  total,
  entry,
  onChange,
  money,
  pointsOff = 0,
  couponOff = 0,
  couponCode = "",
  roundingOff = 0,
  lockReceived = false,
  lockReason,
  disabled,
}: {
  subtotal: number;
  tax: number;
  /** A fraction — 0.15 is 15% — shown as a percent beside the tax line. */
  vatRate: number;
  /** The bill BEFORE any surcharge, and AFTER any points discount. */
  total: number;
  entry: PaymentEntry;
  onChange: (next: PaymentEntry) => void;
  money: (n: number) => string;
  /**
   * What the customer's points took off, if any.
   *
   * Shown as one line and nothing more. The points are CHOSEN in the customer
   * summary, where the cashier and the customer are already talking about
   * them; by the time this dialog is open the only question left is what is
   * owed, and a wallet statement here answers a question nobody asked while
   * the money is being counted.
   *
   * `total` already has it subtracted — this is the explanation, not the
   * arithmetic, so a figure passed here can never move what is charged.
   */
  pointsOff?: number;
  /** What a coupon took off, and which code did it. One line, like the points. */
  couponOff?: number;
  couponCode?: string;
  /**
   * What rounding to a whole taka added (+) or took off (−). One line, like
   * the coupon. `total` already includes it — this is the explanation.
   */
  roundingOff?: number;
  /**
   * Hold the tender at the full amount — what the till did before part payment
   * was a thing, and what it does again when `pos.allow_partial_payment` is
   * off. The field still SHOWS the figure, because a cashier counting notes
   * into a drawer wants to see what to count.
   */
  lockReceived?: boolean;
  /** Why the tender is fixed, when it is. Carried on the field's tooltip. */
  lockReason?: string;
  disabled?: boolean;
}) {
  const payable = payableWith(total, entry);
  const due = lockReceived ? 0 : dueFor(total, entry);
  const set = (patch: Partial<PaymentEntry>) => onChange({ ...entry, ...patch });

  // A tender over the bill is refused by the server, so it is refused here —
  // with the customer at the counter, a 400 is a worse way to learn it.
  const capReceived = (n: number) => Math.min(Math.max(0, n), payable);

  // One field per row in BOTH dialogs. Paired, a half-width "Amount received"
  // sat beside a box of totals twice its height, and the online dialog — which
  // carries a tender and a reference as well — read as a form with something
  // missing from the right of every row.
  const row = "grid grid-cols-1 gap-[16px]";

  return (
    <div className="flex flex-col gap-[16px] py-[4px]">
      <div className={row}>
        {/* Total payable — the bill, broken out so a cashier can answer "what
            is this number?" without leaving the dialog. */}
        <div className="flex flex-col gap-[8px]">
          <p className={LABEL}>Total payable</p>
          <div className="rounded-[8px] border border-[#eaeaea] bg-white p-[12px]">
            <div className="flex items-center justify-between text-[13px] text-[#8f8d87]">
              <span>Sub Total</span>
              <span>{money(subtotal)}</span>
            </div>
            <div className="mt-[4px] flex items-center justify-between text-[13px] text-[#8f8d87]">
              <span>incl. VAT ({Math.round(vatRate * 100)}%)</span>
              {/* Rounded, as the receipt rounds it. Summed per line the raw
                  figure carries a tail — 59.828 — and a dialog a customer can
                  see over the counter should not show three decimals of VAT. */}
              <span>{money(Math.round(tax))}</span>
            </div>
            {entry.additional > 0 && (
              <div className="mt-[4px] flex items-center justify-between text-[13px] text-[#8f8d87]">
                <span>Additional</span>
                <span>{money(entry.additional)}</span>
              </div>
            )}
            {couponOff > 0 && (
              <div className="mt-[4px] flex items-center justify-between text-[13px] font-medium text-[#1f9d55]">
                <span>Coupon{couponCode ? ` (${couponCode})` : ""}</span>
                <span>− {money(couponOff)}</span>
              </div>
            )}
            {pointsOff > 0 && (
              <div className="mt-[4px] flex items-center justify-between text-[13px] font-medium text-[#1f9d55]">
                <span>Points discount</span>
                <span>− {money(pointsOff)}</span>
              </div>
            )}
            {roundingOff !== 0 && (
              <div className="mt-[4px] flex items-center justify-between text-[13px] text-[#8f8d87]">
                <span>Rounding</span>
                <span>
                  {roundingOff > 0 ? "+ " : "− "}
                  {money(Math.abs(roundingOff))}
                </span>
              </div>
            )}
            <div className="mt-[8px] flex items-center justify-between border-t border-[#eaeaea] pt-[8px] text-[14px] font-semibold text-[#1e1e1e]">
              <span>Total Payable</span>
              <span>{money(payable)}</span>
            </div>
          </div>
        </div>

        {/* Amount received, with Full beside it. */}
        <div className="flex flex-col gap-[8px]">
          <label htmlFor="pay-received" className={LABEL}>
            Amount received
            <Required />
          </label>
          <div className="flex items-center gap-[8px]">
            <MoneyInput
              id="pay-received"
              required
              disabled={disabled || lockReceived}
              readOnly={lockReceived}
              title={lockReceived ? lockReason : undefined}
              value={lockReceived ? payable : entry.received}
              onChange={(next) => set({ received: capReceived(next) })}
              placeholder="0.00"
              className={`${FIELD} ${lockReceived ? "bg-[#fafafa] text-[#8f8d87]" : ""}`}
            />
            <button
              type="button"
              disabled={disabled || lockReceived}
              onClick={() => set({ received: payable })}
              className="h-[40px] shrink-0 cursor-pointer rounded-[8px] border border-[#eaeaea] bg-white px-[14px] text-[14px] font-medium text-[#1e1e1e] transition-colors hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Full
            </button>
          </div>
        </div>
      </div>

      {/* The surcharge and why it was applied. The reason is optional until
          there IS a charge, at which point the asterisk appears and the
          Confirm button waits for it. */}
      <div className={row}>
        <div className="flex flex-col gap-[8px]">
          <label htmlFor="pay-extra" className={LABEL}>
            Additional payment
          </label>
          <MoneyInput
            id="pay-extra"
            disabled={disabled}
            value={entry.additional}
            onChange={(next) => {
              const additional = Math.max(0, next);
              // Locked, the tender IS the bill, so it moves with it. Unlocked,
              // it must simply not be left sitting above it.
              const received = lockReceived
                ? total + additional
                : Math.min(entry.received, total + additional);
              onChange({ ...entry, additional, received });
            }}
            placeholder="0.00"
            className={FIELD}
          />
        </div>
        <div className="flex flex-col gap-[8px]">
          <label htmlFor="pay-reason" className={LABEL}>
            Reason
            {entry.additional > 0 && <Required />}
          </label>
          <input
            id="pay-reason"
            type="text"
            required={entry.additional > 0}
            aria-invalid={entry.additional > 0 && !entry.reason.trim()}
            disabled={disabled}
            value={entry.reason}
            onChange={(e) => set({ reason: e.target.value })}
            placeholder="e.g. Home delivery charge"
            className={`${FIELD} ${
              entry.additional > 0 && !entry.reason.trim() ? "border-[#c80000]" : ""
            }`}
          />
        </div>
      </div>

      <div className="flex flex-col gap-[8px]">
        <p className={LABEL}>Amount Due</p>
        <div className="flex h-[44px] items-center rounded-[8px] border border-[#3300bc] bg-[#f8f7ff] px-[12px] text-[16px] font-semibold text-[#3300bc]">
          {money(due)}
        </div>
      </div>
    </div>
  );
}
