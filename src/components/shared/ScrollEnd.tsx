"use client";

import React from "react";

/**
 * What sits under the last row of a scrolling table, in place of the pager.
 *
 * It is the trigger as well as the message: `sentinelRef` goes on this element
 * and reaching it is what asks for the next batch. So it must render even when
 * there is nothing left to say — an element that disappears once loaded cannot
 * be the thing that triggers the next load.
 */
export default function ScrollEnd({
  sentinelRef,
  hasMore,
  loadingMore,
  shown,
  total,
  noun = "rows",
}: {
  sentinelRef: (node: HTMLElement | null) => void;
  hasMore: boolean;
  loadingMore: boolean;
  shown: number;
  total: number;
  /** "sales", "products", "employees" — what is being counted. */
  noun?: string;
}) {
  return (
    <div
      ref={sentinelRef}
      className="flex h-[52px] w-full shrink-0 items-center justify-center text-[13px] text-[#8f8d87]"
      aria-live="polite"
    >
      {loadingMore
        ? "Loading more…"
        : hasMore
          ? `${shown} of ${total} ${noun}`
          : total > 0
            ? `All ${total} ${noun}`
            : ""}
    </div>
  );
}
