"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import TableSkeleton from "@/components/shared/TableSkeleton";
import { SkeletonBlock, StatCardsSkeleton } from "@/components/shared/Skeleton";
import { EmptyState, QueryBoundary, RefreshBar } from "@/components/shared/QueryBoundary";
import StatCard, { StatCardProps } from "./StatCard";

/**
 * The console's one table.
 *
 * Every console screen is the same list: search on the left, a card holding a
 * 40px head over 54px rows, a pager underneath. Same measurements and colours
 * as the shop tables, so the two halves of the product look like one product.
 *
 * Below md a row becomes a card, because these tables are six columns wide.
 */

export type Stat = StatCardProps;

export interface Column<T> {
  key: string;
  label: string;
  /** A grid track: "80px", "1fr", "140px". */
  width: string;
  align?: "start" | "center";
  cell: (row: T) => React.ReactNode;
  /** Shown on the phone card. Leave out to hide it there. */
  mobile?: boolean;
}

function SearchIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <circle cx="11" cy="11" r="7.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="m20 20-3.2-3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const HEAD = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e] whitespace-nowrap";
const CELL = "flex items-center px-[12px]";

/**
 * Two columns keyed the same render as one, and the other silently disappears.
 *
 * `/platform/invoices` had "Still owed" (an amount) and "Due" (a date) both
 * keyed `due`: React kept one header cell, dropped the other, and logged a
 * duplicate-key error that read like a framework complaint rather than a
 * missing column. Nothing in a build or a type check can see it — the keys are
 * plain strings in a literal — so the one component every console table passes
 * through checks it, once, in development.
 *
 * A throw, not a warn: a table that quietly loses a column is worse than one
 * that refuses to draw while somebody is writing it, and this cannot reach a
 * production bundle.
 */
function assertUniqueKeys(columns: { key: string }[]): void {
  if (process.env.NODE_ENV === "production") return;
  const seen = new Set<string>();
  for (const column of columns) {
    if (seen.has(column.key)) {
      throw new Error(
        `ConsoleList: two columns share the key "${column.key}". ` +
          "React renders one and drops the other — give each column its own key."
      );
    }
    seen.add(column.key);
  }
}

export default function ConsoleList<T extends { id: string }>({
  rows,
  columns,
  loading,
  fetching,
  error,
  onRetry,
  hasData = true,
  skeletonGrid,
  note,
  searchPlaceholder,
  onSearch,
  minWidth = 1000,
  actions,
  stats,
  filters,
  onFilter,
  emptyLine = "Nothing here yet.",
}: {
  rows: T[];
  columns: Column<T>[];
  /** Nothing to show yet — draw the shape of the table instead of a blank card. */
  loading?: boolean;
  /** A refresh running under rows already on screen. Drives the hairline only. */
  fetching?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /**
   * Whether an answer has arrived, existence not length: an account with no
   * companies is a real answer, and treating `[]` as "still loading" would
   * leave the skeleton up forever.
   */
  hasData?: boolean;
  /**
   * The page's own grid-cols class string, e.g.
   * `grid-cols-[1.4fr_1fr_110px_150px_83px]`. It must be a literal in the page
   * source — Tailwind only generates classes it can see there — and must list
   * the same tracks as `columns`, so the placeholder rows line up with the head.
   */
  skeletonGrid?: string;
  note?: string | null;
  searchPlaceholder?: string;
  onSearch?: (value: string) => void;
  minWidth?: number;
  actions?: React.ReactNode;
  /** Counted from the rows by the page, shown above the table. */
  stats?: Stat[];
  /** The first one must mean "everything". */
  filters?: readonly string[];
  onFilter?: (value: string) => void;
  emptyLine?: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(filters?.[0] ?? "");
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFilterOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [filterOpen]);

  const grid = useMemo(() => columns.map((c) => c.width).join(" "), [columns]);
  // Development only, and beside the memo that already walks the same array.
  assertUniqueKeys(columns);
  // Every row, in a list that scrolls. They are all in memory already —
  // this component is handed the rows — so there was never a request
  // behind the pager, only a slice.
  const shown = rows;
  const primary = columns[1] ?? columns[0];
  const waiting = Boolean(loading) && !hasData;

  // The head is chrome, not content: it stays put while the rows load, so the
  // table does not appear to be built twice.
  const head = (
    <div className="grid items-center" style={{ gridTemplateColumns: grid }}>
      {columns.map((c) => (
        <div
          key={c.key}
          className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea] ${
            c.align === "center" ? "justify-center" : ""
          }`}
        >
          <span className={HEAD}>{c.label}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="sp-panel-up flex w-full flex-col gap-[14px]">
      {stats && stats.length > 0 &&
        // Every figure here is counted from the rows, so with no rows the strip
        // would read "0 companies" — a wrong answer, not a waiting one, and a
        // flatly false one when the reason for no rows is a failed request.
        (hasData ? (
          <div className="grid grid-cols-2 gap-[12px] sm:grid-cols-4">
            {stats.map((s) => (
              <StatCard key={s.label} {...s} />
            ))}
          </div>
        ) : waiting ? (
          <StatCardsSkeleton
            count={stats.length}
            // The console's own strip, not the dashboard's: a 2-up grid that
            // becomes 4-up at sm, 12px gaps, and a card with no fixed height —
            // ~104px from its padding and three lines. Guessing the dashboard's
            // 132px made the strip settle by nearly thirty pixels.
            gridClassName="grid grid-cols-2 sm:grid-cols-4"
            gap={12}
            height={104}
          />
        ) : null)}

      {(onSearch || actions || filters) && (
        <div className="flex w-full flex-col items-stretch gap-[16px] lg:h-[48px] lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:gap-[16px]">
          {onSearch ? (
            <div className="flex h-[44px] w-full items-center gap-[6px] overflow-clip rounded-[10px] bg-white px-[12px] py-[10px] text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] lg:min-w-[220px] lg:max-w-[370px] lg:flex-1">
              <SearchIcon />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  onSearch(e.target.value);
                }}
                placeholder={searchPlaceholder || "Search..."}
                aria-label={searchPlaceholder || "Search"}
                className="min-w-0 flex-1 bg-transparent text-[14px] leading-[1.5] tracking-[-0.28px] text-[#525252] outline-none placeholder:text-[#525252]"
              />
            </div>
          ) : (
            <span />
          )}
          <div className="flex flex-col items-stretch gap-[12px] sm:flex-row sm:items-center sm:gap-[16px]">
            {filters && filters.length > 1 && (
              <div ref={filterRef} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setFilterOpen((v) => !v)}
                  aria-haspopup="listbox"
                  aria-expanded={filterOpen}
                  className="flex h-[48px] w-full cursor-pointer items-center justify-between gap-[12px] rounded-[12px] border border-solid border-[#eaeaea] bg-white px-[16px] py-[12px] text-[16px] leading-[24px] font-medium whitespace-nowrap text-[#525252] transition-colors hover:bg-[#fafafa] sm:w-auto"
                >
                  {filter}
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden className={`shrink-0 transition-transform ${filterOpen ? "rotate-180" : ""}`}>
                    <path d="m5.5 7.75 4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {filterOpen && (
                  <ul role="listbox" className="sp-fade absolute right-0 z-30 mt-[6px] w-[190px] overflow-hidden rounded-[10px] border border-[#eaeaea] bg-white py-[4px] shadow-[0_8px_30px_rgba(0,0,0,0.10)]">
                    {filters.map((f) => (
                      <li key={f}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={f === filter}
                          onClick={() => {
                            setFilter(f);
                            setFilterOpen(false);
                            onFilter?.(f);
                          }}
                          className={`w-full cursor-pointer px-[14px] py-[9px] text-left text-[14px] transition-colors hover:bg-[#fdf7e6] ${
                            f === filter ? "bg-[#fdf7e6] font-medium text-[#1e1e1e]" : "text-[#525252]"
                          }`}
                        >
                          {f}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {actions}
          </div>
        </div>
      )}

      {/* `relative` because RefreshBar is absolutely positioned across the top. */}
      <div className="relative w-full overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
        <RefreshBar active={Boolean(fetching)} />
        {/* A failed refresh with rows behind it is reported BESIDE them; only a
            failure with nothing to show takes the card over, below. */}
        {error && hasData && (
          <p role="alert" className="mx-[16px] mt-[16px] rounded-[8px] bg-[#ffdfe2] px-[12px] py-[8px] text-[13px] text-[#e63946]">
            {error}
          </p>
        )}
        {note && !error && (
          <p role="status" className="mx-[16px] mt-[16px] rounded-[8px] bg-[#fdf7e6] px-[12px] py-[8px] text-[13px] text-[#6d5b46]">
            {note}
          </p>
        )}

        <QueryBoundary
          loading={Boolean(loading)}
          error={error}
          hasData={hasData}
          errorMessage={error || "Could not load this list."}
          onRetry={onRetry}
          skeleton={
            <>
              <div className="hidden px-[16px] pt-[16px] md:block">
                <div className="overflow-x-auto">
                  <div style={{ minWidth }}>
                    {head}
                    <TableSkeleton rows={8} columns={skeletonGrid ?? ""} />
                  </div>
                </div>
              </div>
              {/* The phone shows cards, so it waits with card-shaped blocks. */}
              <div className="flex flex-col gap-[10px] px-[16px] pt-[16px] md:hidden" aria-hidden>
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonBlock key={i} className="h-[92px] w-full" radius={10} />
                ))}
              </div>
            </>
          }
        >
          {/* Fixed height, rows scrolling inside. Every row renders now that
              the pager is gone, and an unbounded list would run the console
              off the bottom of the window. */}
          <div className="table-scroll">

          <div className="hidden px-[16px] pt-[16px] md:block">
            <div>
              <div style={{ minWidth }}>
                {head}

                {shown.length === 0 && <EmptyState message={emptyLine} compact />}

                {shown.map((row, i) => (
                  <div
                    key={row.id}
                    style={{ gridTemplateColumns: grid, animationDelay: `${Math.min(i, 7) * 35}ms` }}
                    className="sp-row grid items-center border-b border-solid border-[#eaeaea] transition-colors duration-150 hover:bg-[#fafafa]"
                  >
                    {columns.map((c) => (
                      <div
                        key={c.key}
                        className={`${CELL} h-[54px] ${c.align === "center" ? "justify-center" : ""}`}
                      >
                        {c.cell(row)}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Below md a row is a card: six columns have nowhere to go on a phone. */}
          <div className="flex flex-col gap-[10px] px-[16px] pt-[16px] md:hidden">
            {shown.length === 0 && <EmptyState message={emptyLine} compact />}
            {shown.map((row, i) => (
              <div
                key={row.id}
                style={{ animationDelay: `${Math.min(i, 7) * 35}ms` }}
                className="sp-row rounded-[10px] p-[12px] shadow-[inset_0_0_0_1px_#eaeaea] transition-colors duration-150 hover:bg-[#fafafa]"
              >
                <div className="flex items-start justify-between gap-[10px]">
                  <div className="min-w-0 text-[14px] font-medium text-[#1e1e1e]">{primary.cell(row)}</div>
                  <div className="shrink-0">{columns[columns.length - 1].cell(row)}</div>
                </div>
                <div className="mt-[8px] flex flex-col gap-[4px] text-[13px] text-[#525252]">
                  {columns
                    .filter((c) => c.mobile && c.key !== primary.key)
                    .map((c) => (
                      <div key={c.key} className="flex items-center justify-between gap-[12px]">
                        <span className="text-[#8f8d87]">{c.label}</span>
                        <span className="truncate text-right">{c.cell(row)}</span>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
          </div>
        </QueryBoundary>

      </div>
    </div>
  );
}
