"use client";

import React from "react";

/**
 * "Max" — fill a money box with the whole balance.
 *
 * Every record-a-payment dialog in this app has a ceiling: what the customer
 * owes, what is owed to the supplier, what a purchase invoice still has
 * against it. Settling the lot in full is the commonest payment there is, and
 * saying so meant typing the figure out — which invites the typo that
 * `clampToMax` then silently corrects, so the person sees a number they did
 * not type and cannot tell whether it was capped or mistyped.
 *
 * Shared rather than written four times so the four dialogs cannot disagree
 * about where it sits or what it is called. Disabled when there is nothing to
 * settle: a Max that fills in zero is a button that does nothing.
 */
export default function MaxButton({
  onClick,
  disabled,
  label = "Max",
}: {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Fill in the whole balance"
      className="cursor-pointer rounded-[6px] bg-[#fdf7e6] px-[8px] py-[2px] text-[11px] font-semibold text-[#b58600] transition-colors hover:bg-[#fbefcd] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  );
}

/**
 * The label row a money box sits under: its name on the left, Max on the right.
 *
 * `htmlFor` is REQUIRED, and the input must carry the matching `id`. The first
 * version made it optional and left the callers wrapping their input in a
 * `<label>`, which put this button INSIDE the element that names the input —
 * and an interactive element inside a label corrupts the name it computes, so
 * the amount box stopped being reachable as "Amount received" at all. A screen
 * reader would have read it the same way: a field called "Amount receivedMax".
 */
export function AmountLabel({
  children,
  htmlFor,
  onMax,
  maxDisabled,
  className = "text-[14px] font-medium tracking-[-0.28px] text-[#525252]",
}: {
  children: React.ReactNode;
  htmlFor: string;
  onMax: () => void;
  maxDisabled?: boolean;
  className?: string;
}) {
  return (
    <span className="flex items-center justify-between gap-[8px]">
      <label htmlFor={htmlFor} className={className}>
        {children}
      </label>
      <MaxButton onClick={onMax} disabled={maxDisabled} />
    </span>
  );
}
