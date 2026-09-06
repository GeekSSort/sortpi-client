"use client";

import React from "react";

/**
 * Placeholder rows while a table's first page is in flight.
 *
 * These screens are client components: the server sends an empty shell, the
 * browser loads and hydrates the bundle, and only then does the request go
 * out. Redis makes the answer fast once it is asked for, but it cannot shorten
 * the part before the asking — so the honest fix for the blank stretch is to
 * show the shape of what is coming rather than nothing.
 *
 * Rows are sized to the 54px the tables use, so nothing jumps when the real
 * ones arrive.
 */
export default function TableSkeleton({ rows = 8, columns }: { rows?: number; columns: string }) {
  return (
    <div aria-hidden>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className={`grid ${columns} h-[54px] items-center ${
            r === rows - 1 ? "" : "border-b border-solid border-[#eaeaea]"
          }`}
        >
          {Array.from({ length: columns.split("_").length }).map((__, c) => (
            <div key={c} className="p-[12px]">
              <div
                className="h-[12px] animate-pulse rounded-[4px] bg-[#f0f0f0]"
                // Uneven widths read as text; a row of identical bars reads as
                // a loading graphic and draws more attention than it deserves.
                style={{ width: `${[70, 85, 60, 75, 55, 80, 65][c % 7]}%` }}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
