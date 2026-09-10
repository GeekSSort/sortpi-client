"use client";

import React from "react";
import Modal from "@/components/shared/Modal";

/**
 * A dialog that says what a slow job is doing and how far through it is.
 *
 * The spinner it replaces was a word — "Working…" on a disabled button — for
 * an operation that reads a spreadsheet, resolves a category per row and
 * writes hundreds of products. There was nothing to tell a shopkeeper whether
 * it had thirty seconds left or had died, so the honest reaction was to close
 * the tab, which is exactly the thing that must not happen mid-import.
 *
 * NOT DISMISSABLE, and that is the point rather than an oversight: `onClose`
 * is a no-op, so Escape and a click on the backdrop do nothing while the work
 * is in flight. The caller unmounts it by passing `open={false}` when the job
 * finishes.
 *
 * `value` is 0..1. Pass `null` for work whose size is genuinely unknown — a
 * single request with no row count coming back — and the bar animates instead
 * of claiming a percentage nobody measured. A made-up percentage is worse
 * than none: it is the one that sits at 90% forever.
 */
export default function ProgressModal({
  open,
  title,
  label,
  value,
  detail,
}: {
  open: boolean;
  title: string;
  /** What is happening right now, in the shop's words. */
  label: string;
  /** 0..1, or null when the total is unknown. */
  value: number | null;
  /** A second line — "412 of 604 rows" — when there is a real count. */
  detail?: string;
}) {
  const pct = value === null ? null : Math.max(0, Math.min(1, value));

  return (
    <Modal open={open} onClose={() => {}} title={title} width={420}>
      <div className="flex flex-col gap-[14px] py-[4px]">
        <div className="flex items-baseline justify-between gap-[12px]">
          <span className="text-[14px] font-medium text-[#1e1e1e]">{label}</span>
          {pct !== null && (
            <span className="text-[13px] font-semibold tabular-nums text-[#525252]">
              {Math.round(pct * 100)}%
            </span>
          )}
        </div>

        <div
          role="progressbar"
          aria-label={label}
          // Omitted entirely when the total is unknown, which is what tells a
          // screen reader "indeterminate" — a `valuenow` of 0 would announce
          // a job that never starts.
          aria-valuemin={pct === null ? undefined : 0}
          aria-valuemax={pct === null ? undefined : 100}
          aria-valuenow={pct === null ? undefined : Math.round(pct * 100)}
          className="relative h-[8px] w-full overflow-hidden rounded-full bg-[#f0efec]"
        >
          {pct === null ? (
            <span className="absolute inset-y-0 left-0 w-1/3 animate-[progress-slide_1.1s_ease-in-out_infinite] rounded-full bg-[#f5b800]" />
          ) : (
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-[#f5b800] transition-[width] duration-300 ease-out"
              style={{ width: `${pct * 100}%` }}
            />
          )}
        </div>

        {detail && <span className="text-[13px] text-[#8f8d87]">{detail}</span>}

        {/* The reason the dialog cannot be dismissed, said out loud. */}
        <span className="text-[12px] leading-[1.5] text-[#a3a3a3]">
          Please keep this window open until it finishes.
        </span>
      </div>

      {/* Scoped to this component rather than the global sheet: it is the only
          thing that uses it, and a keyframe in globals.css that one dialog
          reads is a keyframe nobody dares delete. */}
      <style>{`
        @keyframes progress-slide {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </Modal>
  );
}
