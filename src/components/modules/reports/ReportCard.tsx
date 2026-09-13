"use client";

import React from "react";

import { QueryBoundary } from "@/components/shared/QueryBoundary";
import TableSkeleton from "@/components/shared/TableSkeleton";

/**
 * One report, in its own card.
 *
 * The Reports page is a wall of these rather than one card with a report
 * picker on it: a picker hides fifteen reports behind a closed menu, and a
 * shopkeeper opening this page wants to SEE what the shop did — payment mix
 * beside top sellers beside what is running out — not to go looking for each
 * one in turn.
 *
 * So each card is deliberately SHORT. It shows the head of its report, not all
 * of it: the point of the wall is the comparison across cards, and a hundred
 * rows in one of them buries the others. Its own Export writes the whole
 * report under the page's filters, which is where the long version lives.
 */
export default function ReportCard({
  title,
  query,
  onExport,
  children,
  wide = false,
}: {
  title: string;
  /** The query this card is drawn from — supplies loading, error and retry. */
  query: { loading: boolean; error?: unknown; refetch: () => void };
  /** Writes this card's full report as a CSV. */
  onExport?: () => void;
  children: React.ReactNode;
  /** Spans both columns. For the trend, which is a shape rather than a list. */
  wide?: boolean;
}) {
  return (
    <section
      // A settled height and a gold ring on hover, the same two things the
      // dashboard's KPI cards do. Without the height the grid was ragged —
      // a donut card beside a five-row table left a hole under the shorter
      // one, and the wall stopped reading as a wall.
      className={`flex min-w-0 flex-col gap-[12px] rounded-[12px] bg-white p-[16px] shadow-[inset_0_0_0_1px_#eaeaea] transition-shadow duration-200 ease-out hover:shadow-[inset_0_0_0_1px_#f5b800] ${
        wide ? "xl:col-span-2" : "xl:min-h-[300px]"
      }`}
    >
      <div className="flex items-center justify-between gap-[12px]">
        <h2 className="truncate text-[15px] leading-[1.5] font-medium tracking-[-0.3px] text-[#1e1e1e]">
          {title}
        </h2>
        {onExport && (
          <button
            type="button"
            onClick={onExport}
            className="shrink-0 cursor-pointer rounded-[8px] px-[8px] py-[4px] text-[13px] font-medium text-[#8f8d87] transition-colors hover:bg-[#fafafa] hover:text-[#1e1e1e]"
          >
            Export
          </button>
        )}
      </div>

      <QueryBoundary
        loading={query.loading}
        error={query.error}
        hasData={!query.loading && !query.error}
        skeleton={<TableSkeleton columns="grid-cols-3" rows={4} />}
        errorMessage="This report could not be loaded."
        onRetry={query.refetch}
      >
        {children}
      </QueryBoundary>
    </section>
  );
}

/**
 * The compact table inside a card.
 *
 * Not `ReportTable`: that one sorts, pages and searches, which is right for a
 * report somebody is working through and wrong for five rows meant to be taken
 * in at a glance. Sorting controls on fourteen cards at once would be fourteen
 * invitations to fiddle with something that is already in the order that
 * matters — biggest first.
 */
export function MiniTable<T>({
  rows,
  columns,
  rowKey,
  empty = "Nothing in this window.",
  limit = 5,
}: {
  rows: T[];
  columns: { key: string; label: string; align?: "left" | "right"; render: (row: T) => React.ReactNode }[];
  rowKey: (row: T) => string;
  empty?: string;
  limit?: number;
}) {
  if (rows.length === 0) {
    return <p className="py-[18px] text-center text-[13px] text-[#8f8d87]">{empty}</p>;
  }
  const shown = rows.slice(0, limit);
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-[12px] border-b border-solid border-[#eaeaea] pb-[8px]">
        {columns.map((c) => (
          <span
            key={c.key}
            className={`min-w-0 text-[12px] font-medium tracking-[-0.24px] text-[#8f8d87] ${
              c.align === "right" ? "shrink-0 text-right tabular-nums" : "flex-1 truncate"
            }`}
          >
            {c.label}
          </span>
        ))}
      </div>
      {shown.map((row, i) => (
        <div
          key={rowKey(row)}
          className={`flex items-center gap-[12px] py-[9px] ${
            i === shown.length - 1 ? "" : "border-b border-solid border-[#f2f2f0]"
          }`}
        >
          {columns.map((c) => (
            <span
              key={c.key}
              className={`min-w-0 text-[13px] tracking-[-0.26px] text-[#525252] ${
                c.align === "right" ? "shrink-0 text-right tabular-nums" : "flex-1 truncate"
              }`}
            >
              {c.render(row)}
            </span>
          ))}
        </div>
      ))}
      {/* Says the card is a head, not the whole report — otherwise five rows
          read as "these are all our customers". */}
      {rows.length > limit && (
        <p className="pt-[8px] text-[12px] tracking-[-0.24px] text-[#a3a3a3]">
          Top {limit} of {rows.length} · Export for all
        </p>
      )}
    </div>
  );
}
