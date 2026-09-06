"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import TablePagination from "@/components/shared/TablePagination";

/**
 * The panel that opens when you click a dashboard card.
 *
 * One shell for all four, using the same look as the rest of the app: 12px
 * radius, #eaeaea border, 40px head over 54px rows, and the shared pager.
 *
 * It sits over the lower dashboard on a wide screen and goes full width below
 * lg.
 */

function SearchIcon() {
  return (
    <svg className="block size-[20px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="10.5" cy="10.5" r="7.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 16L21 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg className="block size-[18px] shrink-0" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M2.25 4.5h13.5M4.5 9h9M7.5 13.5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="block size-[16px]" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export const PANEL_CELL = "flex min-w-0 items-center p-[12px]";
export const PANEL_HEAD = "text-[13px] leading-[1.5] font-medium tracking-[-0.26px] text-[#1e1e1e]";
export const PANEL_TEXT = "text-[13px] leading-[1.5] font-medium tracking-[-0.26px] text-[#525252]";

export interface OverviewPanelProps<T> {
  open: boolean;
  onClose: () => void;
  title: string;
  /** A line under the title saying what this panel is for. */
  subtitle?: string;
  searchPlaceholder: string;
  rows: T[];
  /** The text a row is searched on. */
  searchable: (row: T) => string;
  /** Filter chips. The first one must mean "everything". */
  filters?: readonly string[];
  matchesFilter?: (row: T, filter: string) => boolean;
  /** Small totals shown above the table. */
  stats?: { label: string; value: string }[];
  /** The column widths, shared by the head and every row. */
  grid: string;
  head: React.ReactNode;
  renderRow: (row: T) => React.ReactNode;
  minWidth?: number;
  emptyText?: string;
}

/**
 * Only exists while the panel is open, so each opening starts with an empty
 * search box and page 1 without anything having to reset them.
 */
function PanelBody<T extends { id: string }>({
  onClose,
  title,
  subtitle,
  searchPlaceholder,
  rows,
  searchable,
  filters,
  matchesFilter,
  stats,
  grid,
  head,
  renderRow,
  minWidth = 780,
  emptyText = "Nothing matches that search.",
}: OverviewPanelProps<T>) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(filters?.[0] ?? "All");
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const filterRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes the panel, but the filter popover gets it first, so one
  // press does not close both.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (filterOpen) setFilterOpen(false);
      else onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, filterOpen]);

  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [filterOpen]);

  // preventScroll matters: without it the dashboard scrolls down to meet the
  // panel, and the page jumps on every click.
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!q || searchable(r).toLowerCase().includes(q)) &&
        (!filters || filter === filters[0] || !matchesFilter || matchesFilter(r, filter))
    );
  }, [rows, query, filter, filters, matchesFilter, searchable]);

  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const current = Math.min(page, totalPages);
  const paged = visible.slice((current - 1) * pageSize, current * pageSize);

  return (
    <div className="pointer-events-auto absolute inset-y-0 right-0 left-0 z-20 flex lg:left-auto lg:w-[68%] lg:min-w-[680px]">
      {/* The gold bloom the card grows out of. */}
      <span
        aria-hidden
        className="sp-panel-glow pointer-events-none absolute right-0 bottom-0 size-[300px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(245,184,0,0.55) 0%, rgba(245,184,0,0) 70%)",
        }}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="false"
        aria-label={title}
        className="sp-panel flex h-full w-full flex-col overflow-hidden rounded-[12px] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.12)] outline-none ring-1 ring-[#eaeaea]"
      >
        {/* Head */}
        <div
          className="sp-panel-up relative z-20 flex shrink-0 flex-col gap-[12px] border-b border-solid border-[#eaeaea] px-[16px] py-[14px] lg:flex-row lg:items-center lg:justify-between"
          style={{ animationDelay: "150ms" }}
        >
          <div className="min-w-0">
            <p className="truncate text-[18px] leading-[1.4] font-medium tracking-[-0.36px] text-[#1e1e1e]">
              {title}
            </p>
            {subtitle && (
              <p className="mt-[2px] truncate text-[13px] leading-[1.5] tracking-[-0.26px] text-[#525252]">
                {subtitle}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-[10px]">
            <div className="flex h-[40px] w-full min-w-0 items-center gap-[8px] rounded-[10px] bg-white px-[12px] shadow-[inset_0_0_0_1px_#eaeaea] transition-shadow focus-within:shadow-[inset_0_0_0_1px_#f5b800] lg:w-[300px]">
              <span className="text-[#525252]">
                <SearchIcon />
              </span>
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder={searchPlaceholder}
                aria-label={`Search ${title}`}
                className="min-w-0 flex-1 bg-transparent text-[13px] leading-[1.5] tracking-[-0.26px] text-[#525252] outline-none placeholder:text-[#a3a3a3]"
              />
            </div>

            {filters && (
              <div ref={filterRef} className="relative shrink-0">
                <button
                  type="button"
                  aria-label={`Filter ${title}`}
                  aria-expanded={filterOpen}
                  onClick={() => setFilterOpen((v) => !v)}
                  className={`flex size-[40px] cursor-pointer items-center justify-center rounded-[10px] bg-white shadow-[inset_0_0_0_1px_#eaeaea] transition-colors hover:bg-[#fafafa] ${
                    filter === filters[0] ? "text-[#525252]" : "text-[#f5b800]"
                  }`}
                >
                  <FilterIcon />
                </button>
                {filterOpen && (
                  <div className="sp-fade absolute top-[46px] right-0 z-30 w-[160px] overflow-hidden rounded-[10px] bg-white py-[4px] shadow-[0_8px_30px_rgba(0,0,0,0.10)] ring-1 ring-[#eaeaea]">
                    {filters.map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => {
                          setFilter(f);
                          setPage(1);
                          setFilterOpen(false);
                        }}
                        className={`block w-full cursor-pointer px-[12px] py-[9px] text-left text-[13px] transition-colors hover:bg-[#fafafa] ${
                          filter === f ? "font-medium text-[#f5b800]" : "text-[#525252]"
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              aria-label="Close panel"
              onClick={onClose}
              className="flex size-[40px] shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-white text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] transition-colors hover:bg-[#fafafa] hover:text-[#1e1e1e]"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Figures */}
        {stats && stats.length > 0 && (
          <div
            className="sp-panel-up relative z-0 grid shrink-0 grid-cols-2 gap-[10px] border-b border-solid border-[#eaeaea] px-[16px] py-[12px] sm:grid-cols-3"
            style={{ animationDelay: "190ms" }}
          >
            {stats.map((s) => (
              <div key={s.label} className="min-w-0 rounded-[10px] bg-[#fafafa] px-[12px] py-[10px]">
                <p className="truncate text-[11px] tracking-[-0.22px] text-[#525252] uppercase">{s.label}</p>
                <p className="mt-[2px] truncate text-[16px] leading-[1.4] font-medium tracking-[-0.32px] text-[#1e1e1e]">
                  {s.value}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Table */}
        <div className="min-h-0 flex-1 overflow-auto px-[16px] pt-[12px]">
          <div style={{ minWidth }}>
            <div className={`grid ${grid} items-start overflow-clip rounded-[6px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]`}>
              {head}
            </div>
            <div className="sp-stagger mt-[6px]">
              {paged.length === 0 && (
                <p className="py-[40px] text-center text-[13px] text-[#525252]">{emptyText}</p>
              )}
              {paged.map((r, i) => (
                <div
                  key={r.id}
                  className={`grid ${grid} h-[54px] items-center transition-colors hover:bg-[#fafafa] ${
                    i === paged.length - 1 ? "" : "border-b border-solid border-[#eaeaea]"
                  }`}
                >
                  {renderRow(r)}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-solid border-[#eaeaea]">
          <TablePagination
            page={current}
            pageSize={pageSize}
            total={visible.length}
            onPageChange={setPage}
            onPageSizeChange={(n) => {
              setPageSize(n);
              setPage(1);
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default function OverviewPanel<T extends { id: string }>(props: OverviewPanelProps<T>) {
  if (!props.open) return null;
  return <PanelBody {...props} />;
}
