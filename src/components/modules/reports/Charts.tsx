"use client";

import React, { useId, useMemo } from "react";

/**
 * The chart shapes the report cards are drawn with.
 *
 * Inline SVG and no charting library: every one of these is a proportion or a
 * ranking, which is arithmetic and a handful of paths. A dependency for it
 * would be more code to keep working than the charts themselves, and it would
 * arrive with its own colours and fonts to fight the app's.
 *
 * ONE palette, shared. Each series keeps its colour wherever it appears, so
 * the slice for Cash on the tender donut and the bar for Cash anywhere else
 * are recognisably the same thing.
 */
export const SERIES = [
  "#3300bc",
  "#f5b800",
  "#00b837",
  "#e5484d",
  "#0ea5e9",
  "#a855f7",
  "#f97316",
  "#14b8a6",
] as const;

export const colourAt = (i: number) => SERIES[i % SERIES.length];

export interface Slice {
  label: string;
  value: number;
}

/**
 * A donut — for a whole split into parts, where the PROPORTION is the point.
 *
 * Donut rather than pie: the hole carries the total, which is the number
 * somebody reads next after "how much of it is cash". A pie would need that
 * figure somewhere else on the card.
 *
 * Drawn with `stroke-dasharray` on one circle per slice rather than with arc
 * paths — no trigonometry to get subtly wrong, and a slice of 0 renders as
 * nothing rather than as a hairline.
 */
export function DonutChart({
  slices,
  total,
  totalLabel = "Total",
}: {
  slices: Slice[];
  total: string;
  totalLabel?: string;
}) {
  const sum = slices.reduce((t, s) => t + s.value, 0);
  if (sum <= 0) {
    return <p className="py-[18px] text-center text-[13px] text-[#8f8d87]">Nothing in this window.</p>;
  }

  // A circle of circumference 100 makes every dash length a percentage.
  const R = 100 / (2 * Math.PI);
  // Each slice starts where the ones before it end — a running total, written
  // as a sum over the earlier slices rather than as a variable mutated inside
  // the map. Mutating while rendering is a reassignment after render in
  // React's model, and the compiler refuses to optimise a component that does
  // it.
  const shares = slices.map((slice) => (slice.value / sum) * 100);
  const arcs = slices.map((slice, i) => ({
    label: slice.label,
    share: shares[i],
    offset: shares.slice(0, i).reduce((t, n) => t + n, 0),
    colour: colourAt(i),
  }));

  return (
    <div className="flex flex-wrap items-center gap-[18px]">
      <div className="relative size-[132px] shrink-0">
        <svg viewBox="0 0 40 40" className="size-full -rotate-90" role="img" aria-label={totalLabel}>
          {arcs.map((arc) => (
            <circle
              key={arc.label}
              cx="20"
              cy="20"
              r={R}
              fill="none"
              stroke={arc.colour}
              // Thickens under the pointer. The <title> is what a browser
              // shows on hover and what a screen reader announces, so the
              // figure behind a slice is reachable both ways.
              strokeWidth="5"
              className="cursor-default transition-[stroke-width] duration-150 hover:[stroke-width:6.5]"
              strokeDasharray={`${arc.share} ${100 - arc.share}`}
              strokeDashoffset={-arc.offset}
            >
              <title>{`${arc.label} — ${arc.share.toFixed(1)}%`}</title>
            </circle>
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] tracking-[-0.22px] text-[#8f8d87]">{totalLabel}</span>
          <span className="max-w-[92px] truncate text-[14px] font-semibold tabular-nums text-[#1e1e1e]">
            {total}
          </span>
        </div>
      </div>

      <ul className="flex min-w-0 flex-1 flex-col gap-[7px]">
        {slices.slice(0, 6).map((slice, i) => (
          <li key={slice.label} className="flex min-w-0 items-center gap-[8px]">
            <span
              aria-hidden
              className="size-[8px] shrink-0 rounded-full"
              style={{ background: colourAt(i) }}
            />
            <span className="min-w-0 flex-1 truncate text-[13px] tracking-[-0.26px] text-[#525252]">
              {slice.label}
            </span>
            <span className="shrink-0 text-[13px] font-medium tabular-nums text-[#1e1e1e]">
              {((slice.value / sum) * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A ranking, as horizontal bars.
 *
 * Horizontal and not vertical: the labels are product and customer names, and
 * a vertical bar chart has nowhere to put them but on a slant. Each bar is
 * measured against the BIGGEST row rather than against the total, because the
 * question is "how does the second compare with the first", not "what share of
 * everything is it" — that is the donut's question.
 */
export function BarList({
  rows,
  limit = 5,
  formatValue,
}: {
  rows: Slice[];
  limit?: number;
  formatValue: (n: number) => string;
}) {
  const shown = rows.slice(0, limit);
  const peak = Math.max(...shown.map((r) => r.value), 1);

  if (shown.length === 0) {
    return <p className="py-[18px] text-center text-[13px] text-[#8f8d87]">Nothing in this window.</p>;
  }

  return (
    <ul className="flex flex-col gap-[10px]">
      {shown.map((row, i) => (
        <li
          key={row.label}
          // The whole row lifts, not just the bar: the label is half of what
          // is being pointed at, and a long product name truncates — the
          // title is where the rest of it lives.
          title={`${row.label} — ${formatValue(row.value)}`}
          className="group flex min-w-0 cursor-default flex-col gap-[4px] rounded-[6px] px-[6px] py-[4px] transition-colors hover:bg-[#fafafa]"
        >
          <div className="flex min-w-0 items-baseline justify-between gap-[10px]">
            <span className="min-w-0 truncate text-[13px] tracking-[-0.26px] text-[#525252] transition-colors group-hover:text-[#1e1e1e]">
              {row.label}
            </span>
            <span className="shrink-0 text-[13px] font-medium tabular-nums text-[#1e1e1e]">
              {formatValue(row.value)}
            </span>
          </div>
          <span aria-hidden className="h-[6px] w-full overflow-hidden rounded-full bg-[#f2f2f0]">
            <span
              className="block h-full rounded-full transition-opacity group-hover:opacity-80"
              style={{
                width: `${Math.max(2, (row.value / peak) * 100)}%`,
                background: colourAt(i),
              }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Two series over time, filled.
 *
 * Revenue against the cost underneath it, so the GAP between the lines is the
 * margin — which is the thing somebody opens a report to look at. Both share
 * one scale; scaling them separately would draw a cost line above a revenue
 * line on a profitable day.
 */
export function AreaChart({
  points,
  labels,
}: {
  points: { at: string; a: number; b: number }[];
  labels: { a: string; b: string };
}) {
  const gradientId = useId();

  const shape = useMemo(() => {
    if (points.length === 0) return null;
    const w = 1000;
    const h = 220;
    const pad = { top: 14, bottom: 22 };
    const peak = Math.max(...points.flatMap((p) => [p.a, p.b]), 1);
    const stepX = points.length === 1 ? 0 : w / (points.length - 1);
    const y = (v: number) => h - pad.bottom - (v / peak) * (h - pad.top - pad.bottom);
    const x = (i: number) => i * stepX;
    const line = (read: (p: { a: number; b: number }) => number) =>
      points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(read(p))}`).join(" ");
    return {
      w,
      h,
      a: line((p) => p.a),
      b: line((p) => p.b),
      fill: `${line((p) => p.a)} L${x(points.length - 1)},${h - pad.bottom} L0,${h - pad.bottom} Z`,
    };
  }, [points]);

  if (!shape) {
    return <p className="py-[28px] text-center text-[13px] text-[#8f8d87]">No trading in this window.</p>;
  }

  return (
    <div className="flex flex-col gap-[8px]">
      <div className="flex flex-wrap items-center gap-[16px]">
        <Legend colour={SERIES[0]} label={labels.a} />
        <Legend colour={SERIES[1]} label={labels.b} />
      </div>
      <svg
        viewBox={`0 0 ${shape.w} ${shape.h}`}
        className="h-[200px] w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${labels.a} and ${labels.b} from ${points[0].at} to ${points[points.length - 1].at}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES[0]} stopOpacity="0.16" />
            <stop offset="100%" stopColor={SERIES[0]} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={shape.fill} fill={`url(#${gradientId})`} />
        <path d={shape.b} fill="none" stroke={SERIES[1]} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        <path d={shape.a} fill="none" stroke={SERIES[0]} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div className="flex justify-between text-[11px] tracking-[-0.22px] text-[#a3a3a3]">
        <span>{points[0].at}</span>
        <span>{points[points.length - 1].at}</span>
      </div>
    </div>
  );
}

/**
 * Columns, for a small set of things compared side by side.
 *
 * Branches and cashiers: few enough to fit across, and the label under each
 * column reads without turning your head. Anything with long names or many
 * rows goes to `BarList` instead.
 */
export function ColumnChart({
  rows,
  formatValue,
}: {
  rows: Slice[];
  formatValue: (n: number) => string;
}) {
  const shown = rows.slice(0, 6);
  const peak = Math.max(...shown.map((r) => r.value), 1);

  if (shown.length === 0) {
    return <p className="py-[18px] text-center text-[13px] text-[#8f8d87]">Nothing in this window.</p>;
  }

  return (
    <div className="flex items-end gap-[12px]" style={{ height: 150 }}>
      {shown.map((row, i) => (
        <div
          key={row.label}
          title={`${row.label} — ${formatValue(row.value)}`}
          className="group flex min-w-0 flex-1 cursor-default flex-col items-center gap-[6px]"
        >
          <span className="text-[11px] font-medium tabular-nums text-[#1e1e1e]">
            {formatValue(row.value)}
          </span>
          <span
            aria-hidden
            className="w-full rounded-t-[6px] transition-opacity group-hover:opacity-80"
            style={{
              // A floor of 4px: a branch that took almost nothing still needs
              // a column to stand under its own label.
              height: Math.max(4, (row.value / peak) * 100),
              background: colourAt(i),
            }}
          />
          <span className="w-full truncate text-center text-[11px] tracking-[-0.22px] text-[#8f8d87]">
            {row.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="flex items-center gap-[6px] text-[12px] tracking-[-0.24px] text-[#525252]">
      <span aria-hidden className="h-[3px] w-[16px] rounded-full" style={{ background: colour }} />
      {label}
    </span>
  );
}
