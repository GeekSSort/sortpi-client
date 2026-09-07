"use client";

import React, { useState } from "react";
import { ProfitLossData } from "@/types/dashboard";
import { formatPercent } from "@/lib/format";
import { RANGE_OPTIONS, type RangeOption } from "@/lib/range";

/**
 * Figma: SortPi — Profit & Loss 30:16864.
 *
 * 383x332 card, 20px padding, a 42px header row and a 210px donut beside a
 * 121px legend column. The ring is drawn from the data: revenue and expenses
 * take their share of the circle, each split into three sub-arcs with gaps to
 * keep the design's segmented look.
 */

const GREEN = "#22c55e";
const RED = "#ef4444";
const GOLD = "#f5b800";

const SIZE = 210;
const R_OUTER = 101;
const R_INNER = 56;
// The wedge is drawn inset by half the round stroke, then stroked back out —
// that is what gives the segments the design's rounded ends.
const ROUND = 8;
const R_O = R_OUTER - ROUND / 2;
const R_I = R_INNER + ROUND / 2;
// The round stroke grows each wedge ~3deg at the mid radius, so the gap has to
// budget for that on both sides to still read as a gap.
const GAP_DEG = 11;
const SUBS = 3; // sub-arcs per series

/** Donut wedge with the given sweep, drawn clockwise from 12 o'clock. */
function wedge(from: number, to: number): string {
  const p = (deg: number, r: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [SIZE / 2 + r * Math.cos(rad), SIZE / 2 + r * Math.sin(rad)];
  };
  const large = to - from > 180 ? 1 : 0;
  const [x1, y1] = p(from, R_O);
  const [x2, y2] = p(to, R_O);
  const [x3, y3] = p(to, R_I);
  const [x4, y4] = p(from, R_I);
  return `M ${x1} ${y1} A ${R_O} ${R_O} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${R_I} ${R_I} 0 ${large} 0 ${x4} ${y4} Z`;
}

/** One series' share, chopped into SUBS arcs separated by GAP_DEG. */
function segments(start: number, sweep: number): string[] {
  const each = (sweep - GAP_DEG * SUBS) / SUBS;
  if (each <= 0) return [wedge(start, start + Math.max(sweep - GAP_DEG, 0.1))];
  return Array.from({ length: SUBS }, (_, i) => {
    const a = start + i * (each + GAP_DEG);
    return wedge(a, a + each);
  });
}

function CaretIcon() {
  return (
    <svg className="block h-[4px] w-[8px] shrink-0 overflow-visible" viewBox="0 0 8 4" fill="none" aria-hidden>
      <path
        d="M0.5 0.5L4 3.5L7.5 0.5"
        stroke="currentColor"
        strokeWidth="1.33"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface ProfitLossChartProps {
  data: ProfitLossData;
  /**
   * Controlled by the page. This card is handed a single pre-aggregated
   * figure with no time dimension in it, so it cannot narrow anything locally
   * — picking a range has to re-ask the server. Owning the state here is what
   * made the control decorative.
   */
  range: RangeOption;
  onRangeChange: (r: RangeOption) => void;
  busy?: boolean;
}

export default function ProfitLossChart({
  data,
  range,
  onRangeChange,
  busy = false,
}: ProfitLossChartProps) {
  const [open, setOpen] = useState(false);

  const total = Math.max(1, data.totalRevenue + data.totalExpenses);
  const revenueSweep = (data.totalRevenue / total) * 360;
  // No money either way. `Math.max(1, 0)` made the ring a full red circle at
  // 0.0% margin — a picture of a shop that spent and earned nothing, which is
  // not what an empty window means.
  const empty = data.totalRevenue === 0 && data.totalExpenses === 0;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-[16px] rounded-[12px] bg-white p-[20px] shadow-[inset_0_0_0_1px_#eaeaea]">
      {/* Header — 30:16865 */}
      <div className="flex h-[42px] w-full shrink-0 items-center justify-between">
        <p className="text-[20px] leading-[1.5] font-medium tracking-[-0.4px] whitespace-nowrap text-[#1e1e1e]">
          Profit &amp; Loss
        </p>

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            onBlur={() => window.setTimeout(() => setOpen(false), 120)}
            aria-expanded={open}
            className="flex h-[40px] cursor-pointer items-center justify-center gap-[8px] rounded-[11px] border border-solid border-[#eaeaea] bg-white px-[18px] text-[14px] font-medium tracking-[-0.28px] text-[#525252] transition-colors hover:bg-[#fafafa]"
          >
            <span className="whitespace-nowrap">{busy ? "Loading…" : range}</span>
            <CaretIcon />
          </button>
          {open && (
            <div className="absolute top-[46px] right-0 z-30 w-[140px] overflow-hidden rounded-[10px] bg-white py-[4px] shadow-[0_8px_30px_rgba(0,0,0,0.10)] ring-1 ring-[#eaeaea]">
              {RANGE_OPTIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    onRangeChange(r);
                    setOpen(false);
                  }}
                  className={`block w-full cursor-pointer px-[14px] py-[8px] text-left text-[13px] transition-colors hover:bg-[#fafafa] ${
                    r === range ? "font-medium text-[#f5b800]" : "text-[#525252]"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Body — 30:16874. Stacks below sm, side by side from sm up. */}
      {empty ? (
        <div className="flex w-full flex-1 flex-col items-center justify-center gap-[6px] text-center">
          <p className="text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]">
            Nothing recorded in this range.
          </p>
          <p className="text-[13px] leading-[1.5] tracking-[-0.26px] text-[#9e9e9e]">
            Pick a wider range to see earlier trading.
          </p>
        </div>
      ) : (
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-[12px] sm:flex-row">
        <div className="relative size-[210px] max-w-full shrink-0">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="block size-full" role="img" aria-label="Revenue versus expenses">
            {segments(0, revenueSweep).map((d, i) => (
              <path key={`rev-${i}`} d={d} fill={GREEN} stroke={GREEN} strokeWidth={ROUND} strokeLinejoin="round" />
            ))}
            {segments(revenueSweep, 360 - revenueSweep).map((d, i) => (
              <path key={`exp-${i}`} d={d} fill={RED} stroke={RED} strokeWidth={ROUND} strokeLinejoin="round" />
            ))}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center text-[#f5b800]">
            <span className="text-[18px] leading-[1.2] font-medium tracking-[-0.32px]">
              {formatPercent(data.profitMargin)}
            </span>
            <span className="text-[14px] leading-[1.2] font-normal tracking-[-0.32px]">Profit Margin</span>
          </div>
        </div>

        <div className="flex w-[121px] shrink-0 flex-col justify-center gap-[27px]">
          <div className="flex w-full flex-col gap-[12px]">
            <div className="flex w-full items-center gap-[6px]">
              <span className="size-[6px] shrink-0 rounded-full" style={{ backgroundColor: GREEN }} />
              <span className="flex flex-col text-[16px] leading-[1.5] font-medium tracking-[-0.32px] whitespace-nowrap text-[#525252]">
                <span>Total Revenue</span>
                <span>{data.revenueFormatted}</span>
              </span>
            </div>
            <div className="flex w-full items-center gap-[6px]">
              <span className="size-[6px] shrink-0 rounded-full" style={{ backgroundColor: RED }} />
              <span className="flex flex-col text-[16px] leading-[1.5] font-medium tracking-[-0.32px] whitespace-nowrap text-[#525252]">
                <span>Total Expenses</span>
                <span>{data.expensesFormatted}</span>
              </span>
            </div>
          </div>

          <div
            className="flex w-[121px] items-center justify-center rounded-[15px] px-[12px] py-[8px] text-center"
            style={{ backgroundColor: "rgba(245,184,0,0.1)" }}
          >
            <span
              className="flex flex-col text-[16px] leading-[1.5] font-medium tracking-[-0.32px] whitespace-nowrap"
              style={{ color: GOLD }}
            >
              <span>Net Profit</span>
              <span>{data.netProfitFormatted}</span>
            </span>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
