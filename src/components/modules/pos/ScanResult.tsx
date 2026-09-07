"use client";

import React, { useEffect, useState } from "react";

/**
 * What happened to the last scan, on the wall where the cashier is looking.
 *
 * This was one grey line of 12px text that said the same thing in the same
 * colour whether an item had been added or a barcode had matched nothing —
 * across a counter, at a glance, over a queue, those two are indistinguishable,
 * and the one that matters is the failure. A cashier who misses it scans again,
 * gets the same nothing, and starts blaming the scanner.
 *
 * So the two states are built differently rather than tinted differently. A
 * success is a thin line that fades on its own, because nothing needs doing. A
 * miss is a card that stays until it is dealt with, shows the code in a face you
 * can read digits off, and offers the one thing a cashier actually needs next:
 * the number, copied, to hand to whoever keeps the catalogue.
 */

export type ScanOutcome =
  | { kind: "added"; text: string }
  | { kind: "missing"; code: string }
  | { kind: "error"; text: string };

function CheckIcon() {
  return (
    <svg
      className="block size-[16px] shrink-0"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <circle cx="8" cy="8" r="7" fill="currentColor" opacity="0.12" />
      <path
        d="M4.75 8.25l2.25 2.25 4.25-4.75"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BarcodeIcon() {
  return (
    <svg
      className="block size-[20px] shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M3 5.5v13M6.5 5.5v13M10 5.5v13M13.5 5.5v9M17 5.5v13M20.5 5.5v13"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      className="block size-[14px] shrink-0"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="M4 4l8 8M12 4l-8 8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      className="block size-[14px] shrink-0"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <rect
        x="5.25"
        y="5.25"
        width="8"
        height="8"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M10.75 2.75h-6a2 2 0 0 0-2 2v6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function ScanResult({
  outcome,
  onDismiss,
}: {
  outcome: ScanOutcome | null;
  onDismiss: () => void;
}) {
  /** Which code the Copy button has been pressed for — not a bare boolean, so
      the next scan resets the label without an effect writing state. */
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // A success needs no acknowledgement, so it takes itself away. A miss and an
  // error stay: both are things somebody has to do something about, and a
  // message that vanishes while a cashier is looking at the customer is a
  // message that was never delivered.
  useEffect(() => {
    if (outcome?.kind !== "added") return;
    const id = window.setTimeout(onDismiss, 2600);
    return () => window.clearTimeout(id);
  }, [outcome, onDismiss]);

  if (!outcome) return null;

  if (outcome.kind === "added") {
    return (
      <div
        role="status"
        className="mt-[8px] flex shrink-0 items-center gap-[6px] text-[13px] leading-[1.4] tracking-[-0.26px] text-[#16a34a]"
      >
        <CheckIcon />
        <span className="truncate">{outcome.text}</span>
      </div>
    );
  }

  const missing = outcome.kind === "missing";
  const code = missing ? outcome.code : "";

  return (
    <div
      role="alert"
      className={`mt-[8px] flex shrink-0 items-start gap-[12px] rounded-[12px] p-[14px] ${
        missing ? "bg-[#fef6f5]" : "bg-[#fdf7e6]"
      }`}
    >
      <span
        className={`mt-[1px] ${missing ? "text-[#ef4444]" : "text-[#f5b800]"}`}
      >
        <BarcodeIcon />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-[8px]">
        <div className="flex flex-col gap-[2px]">
          <p className="text-[14px] leading-[1.4] font-semibold tracking-[-0.28px] text-[#1e1e1e]">
            {missing
              ? "Not in the catalogue"
              : "That scan could not be looked up"}
          </p>
          <p className="text-[13px] leading-[1.5] text-[#525252]">
            {missing
              ? "The scanner read it cleanly — no product carries this barcode yet."
              : outcome.text}
          </p>
        </div>

        {missing && (
          <div className="flex flex-wrap items-center gap-[8px]">
            {/* The digits, in a face where 0 and O are different shapes. This is
                the thing somebody has to type into the product form, and a
                barcode read wrong is a second wasted trip to the back office. */}
            <code className="rounded-[8px] bg-white px-[10px] py-[6px] font-mono text-[14px] leading-[1.3] font-medium tracking-[0.02em] break-all text-[#1e1e1e] shadow-[inset_0_0_0_1px_rgba(239,68,68,0.25)]">
              {code}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(code)
                  .then(() => setCopiedCode(code))
                  .catch(() => setCopiedCode(null));
              }}
              className="flex h-[30px] cursor-pointer items-center gap-[5px] rounded-[8px] bg-white px-[10px] text-[12px] font-medium text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] transition-colors hover:bg-[#fafafa]"
            >
              <CopyIcon />
              {copiedCode === code ? "Copied" : "Copy"}
            </button>
            <span className="text-[12px] leading-[1.4] text-[#a3a3a3]">
              Add it to the product under Products → Barcode.
            </span>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-mr-[4px] -mt-[4px] shrink-0 cursor-pointer rounded-[6px] p-[6px] text-[#a3a3a3] transition-colors hover:bg-white hover:text-[#525252]"
      >
        <CloseIcon />
      </button>
    </div>
  );
}
