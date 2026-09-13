"use client";

import React, { useId, useMemo } from "react";

import { formatMoney } from "@/lib/format";
import type { TrendPoint } from "@/services/reportService";

/**
 * Revenue against cost, a day at a time.
 *
 * Its own component rather than the dashboard's `SalesSummaryChart`, because
 * it answers a different question. That one plots one series to say how
 * trading is going; this plots revenue AND the cost underneath it, so the gap
 * between the two lines is the margin — which is the thing somebody opens a
 * report to look at.
 *
 * Inline SVG and no library: two paths over a shared scale is arithmetic, and
 * a charting dependency for it would be more code to keep working than the
 * chart itself.
 */

const REVENUE = "#3300bc";
const COST = "#f5b800";

export default function TrendChart({ points }: { points: TrendPoint[] }) {
  const gradientId = useId();

  const shape = useMemo(() => {
    if (points.length === 0) return null;
    const w = 1000;
    const h = 260;
    const pad = { top: 16, right: 8, bottom: 26, left: 8 };
    // Both series share ONE scale. Scaling them separately would draw a cost
    // line above a revenue line on a profitable day, which is the opposite of
    // what happened.
    const peak = Math.max(...points.flatMap((p) => [p.revenue, p.cost]), 1);
    const stepX =
      points.length === 1 ? 0 : (w - pad.left - pad.right) / (points.length - 1);
    const y = (v: number) =>
      h - pad.bottom - (v / peak) * (h - pad.top - pad.bottom);
    const x = (i: number) => pad.left + i * stepX;

    const line = (read: (p: TrendPoint) => number) =>
      points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(read(p))}`).join(" ");

    return {
      w,
      h,
      peak,
      revenue: line((p) => p.revenue),
      cost: line((p) => p.cost),
      // The revenue line closed to the baseline, for the wash beneath it.
      fill:
        `${line((p) => p.revenue)} L${x(points.length - 1)},${h - pad.bottom} ` +
        `L${x(0)},${h - pad.bottom} Z`,
    };
  }, [points]);

  if (!shape) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-[8px] border border-dashed border-[#e4e4de] text-[13px] text-[#8f8d87]">
        No trading in this window.
      </div>
    );
  }

  const first = points[0];
  const last = points[points.length - 1];

  return (
    <div className="flex flex-col gap-[10px]">
      <div className="flex flex-wrap items-center gap-[16px]">
        <Legend colour={REVENUE} label="Revenue" />
        <Legend colour={COST} label="Cost of goods" />
        <span className="ml-auto text-[12px] text-[#8f8d87]">
          Peak {formatMoney(shape.peak, { decimals: 0 })}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${shape.w} ${shape.h}`}
        className="h-[220px] w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Revenue and cost of goods from ${first.at} to ${last.at}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={REVENUE} stopOpacity="0.16" />
            <stop offset="100%" stopColor={REVENUE} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={shape.fill} fill={`url(#${gradientId})`} />
        <path
          d={shape.cost}
          fill="none"
          stroke={COST}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
        <path
          d={shape.revenue}
          fill="none"
          stroke={REVENUE}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
      </svg>
      <div className="flex justify-between text-[11px] text-[#a3a3a3]">
        <span>{first.at}</span>
        <span>{last.at}</span>
      </div>
    </div>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="flex items-center gap-[6px] text-[12px] text-[#525252]">
      <span aria-hidden className="h-[3px] w-[16px] rounded-full" style={{ background: colour }} />
      {label}
    </span>
  );
}
