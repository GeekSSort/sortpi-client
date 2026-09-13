"use client";

import React, { useMemo, useState } from "react";

import VariantChip from "@/components/shared/VariantChip";

/**
 * The table every report on this page is drawn with.
 *
 * The Reports screen is a reading screen: somebody arrives asking "which size
 * actually made money last month" and leaves with a number they can defend. So
 * the unit here is a SORTABLE TABLE rather than the dashboard's cards — a card
 * answers "how are we doing", and no arrangement of cards answers "why".
 *
 * Sorting is in the browser and deliberately so: every report on this page is
 * a whole answer for its window — the server has already grouped and totalled
 * it — so there is nothing to page through and nothing to fetch on a click.
 */

export type Align = "left" | "right";

export interface Column<T> {
  key: string;
  label: string;
  align?: Align;
  /** The cell. Strings and numbers are rendered; anything else is your node. */
  render: (row: T) => React.ReactNode;
  /** What to sort by. Omitted, the column does not sort. */
  sortBy?: (row: T) => number | string;
  /** Sum shown in the footer, when the column totals to anything meaningful. */
  total?: (rows: T[]) => React.ReactNode;
}

// The list pages' own head and cell, so a report table reads as the same
// furniture as the Sales and Purchases tables rather than as a third style.
const HEAD =
  "px-[12px] py-[11px] text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e]";
const CELL =
  "px-[12px] py-[12px] text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]";

export default function ReportTable<T>({
  rows,
  columns,
  rowKey,
  empty = "Nothing in this window.",
  initialSort,
  pageSize = 25,
  search,
  searchable,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  empty?: string;
  /** Column key to sort by on first paint — usually the money one. */
  initialSort?: string;
  pageSize?: number;
  /** What the headline search box is narrowing to. */
  search?: string;
  /** The text a row is searched by. Omitted, the search box does not apply. */
  searchable?: (row: T) => string;
}) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(
    initialSort ? { key: initialSort, dir: "desc" } : null
  );
  const [shown, setShown] = useState(pageSize);

  // Narrowed BEFORE sorting, so the footer totals what is on screen rather
  // than what was fetched — a total that ignores the search is a number the
  // reader cannot tie to the rows above it.
  const found = useMemo(() => {
    const q = (search ?? "").trim().toLowerCase();
    if (!q || !searchable) return rows;
    return rows.filter((r) => searchable(r).toLowerCase().includes(q));
  }, [rows, search, searchable]);

  const sorted = useMemo(() => {
    if (!sort) return found;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortBy) return found;
    const read = col.sortBy;
    // A copy: sorting `rows` in place mutates the query cache's array, and the
    // next reader gets it in this screen's order rather than the server's.
    return [...found].sort((a, b) => {
      const x = read(a);
      const y = read(b);
      const cmp = typeof x === "number" && typeof y === "number"
        ? x - y
        : String(x).localeCompare(String(y));
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [found, sort, columns]);

  const visible = sorted.slice(0, shown);
  const hasTotals = columns.some((c) => c.total);

  if (found.length === 0) {
    return (
      <div className="flex min-h-[140px] items-center justify-center rounded-[12px] px-[16px] text-[14px] text-[#8f8d87] shadow-[inset_0_0_0_1px_#eaeaea]">
        {(search ?? "").trim() ? "Nothing matches that search." : empty}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[10px]">
      <div className="table-scroll overflow-x-auto rounded-[12px] shadow-[inset_0_0_0_1px_#eaeaea]">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="border-b border-solid border-[#eaeaea] bg-white">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={`${HEAD} ${c.align === "right" ? "text-right" : "text-left"}`}
                >
                  {c.sortBy ? (
                    <button
                      type="button"
                      onClick={() =>
                        setSort((s) =>
                          s?.key === c.key
                            ? { key: c.key, dir: s.dir === "desc" ? "asc" : "desc" }
                            : { key: c.key, dir: "desc" }
                        )
                      }
                      className="cursor-pointer transition-colors hover:text-[#f5b800]"
                    >
                      {c.label}
                      {/* The arrow only on the column actually sorting, so the
                          head does not read as four competing controls. */}
                      {sort?.key === c.key && (
                        <span aria-hidden className="ml-[4px] text-[#f5b800]">
                          {sort.dir === "desc" ? "↓" : "↑"}
                        </span>
                      )}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr
                key={rowKey(row)}
                className={i === visible.length - 1 ? "" : "border-b border-solid border-[#f2f2f0]"}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`${CELL} ${c.align === "right" ? "text-right tabular-nums" : ""}`}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {hasTotals && (
            <tfoot>
              {/* Totals over EVERY row, not the page. A footer that summed the
                  first 25 would be a different number each time somebody
                  pressed "Show more", which is worse than no footer. */}
              <tr className="border-t border-solid border-[#eaeaea] bg-[#fafafa]">
                {columns.map((c, i) => (
                  <td
                    key={c.key}
                    className={`${CELL} !font-semibold !text-[#1e1e1e] ${
                      c.align === "right" ? "text-right tabular-nums" : ""
                    }`}
                  >
                    {c.total ? c.total(found) : i === 0 ? `${found.length} rows` : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {shown < sorted.length && (
        <button
          type="button"
          onClick={() => setShown((n) => n + pageSize)}
          className="w-fit cursor-pointer rounded-[10px] border border-solid border-[#eaeaea] bg-white px-[16px] py-[9px] text-[14px] font-medium text-[#525252] transition-colors hover:border-[#f5b800] hover:text-[#1e1e1e]"
        >
          Show {Math.min(pageSize, sorted.length - shown)} more of {sorted.length}
        </button>
      )}
    </div>
  );
}

/** A product cell: the name, and which size of it. Used by several reports. */
export function ProductCell({ name, variantLabel, sku }: { name: string; variantLabel: string; sku: string }) {
  return (
    <span className="flex min-w-0 flex-col gap-[3px]">
      <span className="flex min-w-0 items-center gap-[6px]">
        <span className="truncate text-[#1e1e1e]">{name}</span>
        <VariantChip label={variantLabel} size="xs" />
      </span>
      <span className="truncate text-[11px] text-[#a3a3a3]">{sku}</span>
    </span>
  );
}
