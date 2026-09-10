"use client";

import React from "react";
import type { MatrixRow } from "@/types/finance";

/**
 * The Yearly Summary — Figma 369:5873.
 *
 * Three tables of the same shape stacked down the page: income by category,
 * expense by category, and the net of the two. Each is a banner, a heading,
 * then a category-per-row grid with twelve month columns and a total, closed
 * by a tinted totals row in the section's own colour.
 *
 * FOURTEEN columns do not fit a phone, or a tablet, or a laptop at anything
 * under about 1200px — so the grid scrolls sideways inside its own container
 * with the page body kept still, which is what every wide table in this app
 * does. It is not collapsed into cards: the whole point of this view is
 * reading ACROSS a row to see a category's shape over the year, and a stack of
 * twelve labelled values per category is not that.
 */

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "June",
  "July", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** The design's three sections, each with its own colour. */
const TONES = {
  income: { ink: "#27b85e", wash: "#e5f6eb" },
  expense: { ink: "#ff0000", wash: "#fce9e9" },
  net: { ink: "#f5b800", wash: "#fcf6e0" },
} as const;

export type MatrixTone = keyof typeof TONES;

/**
 * `Tk.158,000`, or the design's en dash for a month with nothing in it.
 *
 * Thousands grouping, NOT the lakh grouping the cards above use. That looks
 * like an inconsistency and is the design's: 369:5873 writes `Tk.718,100`
 * where 367:2596 writes `৳ 12,84,500`. The matrix is read by scanning a row
 * of fourteen figures for shape, and en-IN's `7,18,100` puts the comma in a
 * different place per magnitude, which breaks the scan.
 */
function cell(value: number): string {
  if (!value) return "–";
  const sign = value < 0 ? "-" : "";
  return `${sign}Tk.${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/** 14 columns: the label, twelve months, the total. */
const GRID = "grid-cols-[minmax(150px,1.4fr)_repeat(12,minmax(86px,1fr))_minmax(110px,1.1fr)]";

export interface YearlyMatrixProps {
  tone: MatrixTone;
  /** The banner's wording — "INCOME SUMMARY (MONTH BY MONTH)". */
  banner: string;
  heading: string;
  /** What the first column is called. "Month" in the design. */
  rowLabel: string;
  rows: MatrixRow[];
  /** The tinted closing row: its label and its twelve figures. */
  totalLabel: string;
  totalMonths: number[];
  totalValue: number;
  emptyMessage: string;
}

export default function YearlyMatrix({
  tone,
  banner,
  heading,
  rowLabel,
  rows,
  totalLabel,
  totalMonths,
  totalValue,
  emptyMessage,
}: YearlyMatrixProps) {
  const { ink, wash } = TONES[tone];

  return (
    <section className="flex flex-col gap-[16px]">
      {/* Banner — an outlined bar in the section's colour. */}
      <div
        className="flex h-[44px] items-center justify-center rounded-[8px] border border-solid bg-white px-[12px]"
        style={{ borderColor: ink }}
      >
        <span
          className="truncate text-[12px] leading-[1.4] font-semibold tracking-[0.2px] uppercase sm:text-[14px]"
          style={{ color: ink }}
        >
          {banner}
        </span>
      </div>

      <h3
        className="text-[18px] leading-[1.4] font-semibold tracking-[-0.4px] sm:text-[22px]"
        style={{ color: ink }}
      >
        {heading}
      </h3>

      {/* The grid scrolls; the page does not. */}
      <div className="-mx-[4px] overflow-x-auto px-[4px]">
        <div className="min-w-[1180px]">
          <div
            className={`grid ${GRID} border-b border-solid`}
            style={{ borderColor: ink }}
          >
            <div className="flex min-w-0 items-center px-[12px] py-[10px]">
              <span className="truncate text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e]">
                {rowLabel}
              </span>
            </div>
            {MONTHS.map((month) => (
              <div key={month} className="flex min-w-0 items-center px-[12px] py-[10px]">
                <span className="truncate text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e]">
                  {month}
                </span>
              </div>
            ))}
            <div className="flex min-w-0 items-center px-[12px] py-[10px]">
              <span className="truncate text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e]">
                Total
              </span>
            </div>
          </div>

          {rows.length === 0 && (
            <p className="px-[12px] py-[18px] text-[14px] text-[#8f8d87]">{emptyMessage}</p>
          )}

          {rows.map((row) => (
            <div
              key={row.categoryId || row.categoryName}
              className={`grid ${GRID} border-b border-solid border-[#f2f2f2]`}
            >
              <div className="flex min-w-0 items-center px-[12px] py-[10px]">
                <span
                  className="truncate text-[14px] leading-[1.5] font-normal tracking-[-0.28px] text-[#525252]"
                  title={row.categoryName}
                >
                  {row.categoryName}
                </span>
              </div>
              {row.months.map((value, i) => (
                <div key={MONTHS[i]} className="flex min-w-0 items-center px-[12px] py-[10px]">
                  <span className="truncate text-[14px] leading-[1.5] font-normal tracking-[-0.28px] text-[#525252]">
                    {cell(value)}
                  </span>
                </div>
              ))}
              <div className="flex min-w-0 items-center px-[12px] py-[10px]">
                <span className="truncate text-[14px] leading-[1.5] font-normal tracking-[-0.28px] text-[#525252]">
                  {cell(row.total)}
                </span>
              </div>
            </div>
          ))}

          {/* The closing row, tinted and in the section's colour. */}
          <div
            className={`grid ${GRID} border-b border-solid`}
            style={{ backgroundColor: wash, borderColor: ink }}
          >
            <div className="flex min-w-0 items-center px-[12px] py-[10px]">
              <span className="truncate text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e]">
                {totalLabel}
              </span>
            </div>
            {totalMonths.map((value, i) => (
              <div key={MONTHS[i]} className="flex min-w-0 items-center px-[12px] py-[10px]">
                <span
                  className="truncate text-[14px] leading-[1.5] font-medium tracking-[-0.28px]"
                  // The NET row is the one place a figure can go either way, so
                  // it is coloured by its own sign rather than by the section:
                  // a red -14,200 under a gold heading is the point of the row.
                  style={{ color: tone === "net" && value < 0 ? TONES.expense.ink : ink }}
                >
                  {cell(value)}
                </span>
              </div>
            ))}
            <div className="flex min-w-0 items-center px-[12px] py-[10px]">
              <span
                className="truncate text-[14px] leading-[1.5] font-medium tracking-[-0.28px]"
                style={{
                  color: tone === "net" && totalValue < 0 ? TONES.expense.ink : ink,
                }}
              >
                {cell(totalValue)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
