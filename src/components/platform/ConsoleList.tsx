"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import TablePagination from "@/components/shared/TablePagination";
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

export default function ConsoleList<T extends { id: string }>({
  rows,
  columns,
  loading,
  error,
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
  loading?: boolean;
  error?: string | null;
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
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
  const shown = rows.slice((page - 1) * pageSize, page * pageSize);
  const primary = columns[1] ?? columns[0];

  return (
    <div className="sp-panel-up flex w-full flex-col gap-[14px] select-none">
      {stats && stats.length > 0 && (
        <div className="grid grid-cols-2 gap-[12px] sm:grid-cols-4">
          {stats.map((s) => (
            <StatCard key={s.label} {...s} />
          ))}
        </div>
      )}

      {(onSearch || actions || filters) && (
        <div className="flex w-full flex-col items-stretch gap-[16px] lg:h-[48px] lg:flex-row lg:items-center lg:justify-between lg:gap-0">
          {onSearch ? (
            <div className="flex h-[44px] w-full items-center gap-[6px] overflow-clip rounded-[10px] bg-white px-[12px] py-[10px] text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] lg:w-[370px]">
              <SearchIcon />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
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
                            setPage(1);
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

      <div className="w-full overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
        {error && (
          <p role="alert" className="mx-[16px] mt-[16px] rounded-[8px] bg-[#ffdfe2] px-[12px] py-[8px] text-[13px] text-[#e63946]">
            {error}
          </p>
        )}
        {note && !error && (
          <p role="status" className="mx-[16px] mt-[16px] rounded-[8px] bg-[#fdf7e6] px-[12px] py-[8px] text-[13px] text-[#6d5b46]">
            {note}
          </p>
        )}

        <div className="hidden px-[16px] pt-[16px] md:block">
          <div className="overflow-x-auto">
            <div style={{ minWidth }}>
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

              {/* Bars where the text will be, so the table does not jump when
                  the rows arrive. */}
              {loading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={`skeleton-${i}`}
                    className="grid items-center border-b border-solid border-[#eaeaea]"
                    style={{ gridTemplateColumns: grid }}
                  >
                    {columns.map((c) => (
                      <div key={c.key} className={`${CELL} h-[54px]`}>
                        <span className="h-[10px] w-full max-w-[120px] animate-pulse rounded-full bg-[#f0ede6]" />
                      </div>
                    ))}
                  </div>
                ))}

              {!loading && shown.length === 0 && (
                <p className="px-[12px] py-[28px] text-center text-[14px] text-[#525252]">
                  {emptyLine}
                </p>
              )}

              {!loading &&
                shown.map((row, i) => (
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
          {!loading && shown.length === 0 && (
            <p className="py-[20px] text-center text-[14px] text-[#525252]">{emptyLine}</p>
          )}
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

        <TablePagination
          page={page}
          pageSize={pageSize}
          total={rows.length}
          onPageChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
        />
      </div>
    </div>
  );
}
