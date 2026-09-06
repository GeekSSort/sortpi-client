"use client";

import React, { useMemo, useRef, useState } from "react";
import { SalesDataPoint } from "@/types/dashboard";

/**
 * Sales Summary — Figma 30:15467.
 *
 * A 757x332 card with a 690x244 plot. The measurements are the design's:
 * seven axis rows 32.5px apart, the bottom line at y=213 and the top at y=8.
 *
 * The dotted bands are clipped to the area under the curve, so the shading
 * can never rise above the line.
 */

const W = 690;
const H = 244;
const AXIS_TOP = 8; // centre of the top (7k) row
const AXIS_BOTTOM = 213; // centre of the baseline (1k) row
const ROW_GAP = (AXIS_BOTTOM - AXIS_TOP) / 6;
const GRID_X = 44;
const PLOT_X = 40.372337;
const FOOTER_Y = 227;
const ROWS = 7;

const GOLD = "#f5b800";

/** A smooth curve through the points, drawn as bezier segments. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    d += ` C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6}, ${
      p2.x - (p3.x - p1.x) / 6
    } ${p2.y - (p3.y - p1.y) / 6}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function ExportIcon() {
  const s = {
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg className="block size-[18px] shrink-0" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M12.33 6.675C15.03 6.9075 16.1325 8.295 16.1325 11.3325V11.43C16.1325 14.7825 14.79 16.125 11.4375 16.125H6.555C3.2025 16.125 1.86 14.7825 1.86 11.43V11.3325C1.86 8.3175 2.9475 6.93 5.6025 6.6825"
        {...s}
      />
      <path d="M9 11.25V2.715" {...s} />
      <path d="M11.5125 4.3875L9 1.875L6.4875 4.3875" {...s} />
    </svg>
  );
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

const RANGES = ["Today", "This Week", "This Month", "This Year"] as const;

interface SalesSummaryChartProps {
  data?: SalesDataPoint[];
  /** Which stretches of the line get the dotted shading, as in the design. */
  highlights?: [number, number][];
}

export default function SalesSummaryChart({
  data = [],
  highlights = [
    [1, 2],
    [4, 5],
  ],
}: SalesSummaryChartProps) {
  const [range, setRange] = useState<string>("This Week");
  const [rangeOpen, setRangeOpen] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const chart = useMemo(() => {
    const points = data.length ? data : [];
    const max = Math.max(1, ...points.map((p) => p.sales));
    // Six steps above the bottom line, rounded up, so the axis reads in whole
    // numbers.
    const step = Math.max(1000, Math.ceil(max / 6000) * 1000);
    const base = step;
    const valueToY = (v: number) => AXIS_BOTTOM - ((v - base) / step) * ROW_GAP;

    const span = W - PLOT_X;
    const xs = points.map((_, i) =>
      points.length > 1 ? PLOT_X + (i * span) / (points.length - 1) : PLOT_X + span / 2
    );
    const pts = points.map((p, i) => ({ x: xs[i], y: valueToY(p.sales) }));

    return {
      pts,
      xs,
      line: smoothPath(pts),
      // The curve closed down to the bottom line: this is what keeps the shading under it.
      area: pts.length ? `${smoothPath(pts)} L ${xs[xs.length - 1]} ${AXIS_BOTTOM} L ${xs[0]} ${AXIS_BOTTOM} Z` : "",
      ticks: Array.from({ length: ROWS }, (_, i) => ({
        y: AXIS_TOP + i * ROW_GAP,
        label: `${(base + (ROWS - 1 - i) * step) / 1000}k`,
      })),
    };
  }, [data]);

  const exportCsv = () => {
    const rows = [["Date", "Sales", "Orders"], ...data.map((d) => [d.date, d.sales, d.orders])];
    const url = URL.createObjectURL(
      new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" })
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "sales-summary.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || !chart.xs.length) return;
    const box = svg.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    chart.xs.forEach((cx, i) => {
      if (Math.abs(cx - x) < Math.abs(chart.xs[best] - x)) best = i;
    });
    setHover(best);
  };

  // Where the hover card sits, as a percentage of the plot, so it floats over
  // the chart instead of pushing it down.
  const tip = useMemo(() => {
    if (hover === null || !data[hover] || !chart.pts[hover]) return null;
    const xPct = (chart.pts[hover].x / W) * 100;
    const yPct = (chart.pts[hover].y / H) * 100;
    return {
      row: data[hover],
      xPct,
      yPct,
      // Below the point when there is no room above it.
      below: yPct < 26,
      // Hold it to the nearest corner so it does not run off the edge.
      anchorX: xPct < 16 ? "0%" : xPct > 84 ? "-100%" : "-50%",
    };
  }, [hover, data, chart]);

  const btn =
    "flex h-[40px] items-center justify-center gap-[8px] rounded-[11px] border border-solid border-[#eaeaea] bg-white px-[18px] text-[14px] font-medium tracking-[-0.28px] text-[#525252] transition-colors hover:bg-[#fafafa] cursor-pointer";

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[10px] bg-white px-[16px] py-[16px] shadow-[inset_0_0_0_1px_#eaeaea] sm:px-[33.5px]">
      {/* Headline — 30:15469 */}
      <div className="flex h-[40px] w-full shrink-0 items-center justify-between">
        <p className="text-[24px] leading-[1.2] font-medium tracking-[-0.72px] whitespace-nowrap text-[#1e1e1e]">
          Sales Summary
        </p>

        <div className="flex shrink-0 items-center gap-[12px]">
          <button type="button" onClick={exportCsv} className={btn}>
            <ExportIcon />
            <span className="hidden sm:inline">Export</span>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setRangeOpen((v) => !v)}
              onBlur={() => window.setTimeout(() => setRangeOpen(false), 120)}
              aria-expanded={rangeOpen}
              className={btn}
            >
              <span className="whitespace-nowrap">{range}</span>
              <CaretIcon />
            </button>
            {rangeOpen && (
              <div className="absolute top-[46px] right-0 z-30 w-[140px] overflow-hidden rounded-[10px] bg-white py-[4px] shadow-[0_8px_30px_rgba(0,0,0,0.10)] ring-1 ring-[#eaeaea]">
                {RANGES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setRange(r);
                      setRangeOpen(false);
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
      </div>

      {/* Layout — 30:15483, 16px under the headline */}
      <div className="relative mt-[16px] w-full flex-1">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
          role="img"
          aria-label="Sales summary over time"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <pattern id="salesDots" width="5" height="5" patternUnits="userSpaceOnUse">
              <circle cx="1.4" cy="1.4" r="0.9" fill={GOLD} opacity="0.55" />
            </pattern>
            {/* Everything below the curve. Bands reference this so the dotted
                fill stops exactly at the line. */}
            <clipPath id="salesUnderCurve">
              <path d={chart.area} />
            </clipPath>
          </defs>

          {/* Y-axis rows — 30:15485 */}
          {chart.ticks.map((t) => (
            <g key={t.label}>
              <text
                x={0}
                y={t.y}
                dominantBaseline="middle"
                className="fill-[#525252] text-[12px]"
                style={{ letterSpacing: "-0.12px" }}
              >
                {t.label}
              </text>
              <line x1={32} x2={36} y1={t.y} y2={t.y} stroke="#525252" />
              <line x1={GRID_X} x2={W} y1={t.y} y2={t.y} stroke="#eaeaea" opacity={0.3} />
            </g>
          ))}

          {/* Dotted emphasis bands, clipped under the curve */}
          {highlights.map(([a, b], i) => {
            const x1 = chart.xs[a];
            const x2 = chart.xs[b];
            if (x1 == null || x2 == null) return null;
            return (
              <g key={`band-${i}`}>
                <rect
                  x={x1}
                  y={AXIS_TOP}
                  width={x2 - x1}
                  height={AXIS_BOTTOM - AXIS_TOP}
                  fill="url(#salesDots)"
                  clipPath="url(#salesUnderCurve)"
                />
                <rect x={x1} y={AXIS_BOTTOM + 4} width={x2 - x1} height={2.17} rx={1.08} fill={GOLD} />
              </g>
            );
          })}

          {/* Chart line — 30:16856 */}
          <path
            d={chart.line}
            fill="none"
            stroke={GOLD}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Hover crosshair + marker */}
          {hover !== null && chart.pts[hover] && (
            <g pointerEvents="none">
              <line
                x1={chart.pts[hover].x}
                x2={chart.pts[hover].x}
                y1={AXIS_TOP}
                y2={AXIS_BOTTOM}
                stroke={GOLD}
                strokeOpacity={0.35}
              />
              <circle cx={chart.pts[hover].x} cy={chart.pts[hover].y} r={5} fill={GOLD} stroke="#fff" strokeWidth={2} />
            </g>
          )}

          {/* Footer — 30:16858 */}
          {data.length > 0 && (
            <g>
              <text x={40} y={FOOTER_Y + 10.5} dominantBaseline="middle" className="fill-[#525252] text-[12px]">
                {data[0].date}
              </text>
              <line x1={87} x2={336.5} y1={FOOTER_Y + 10.5} y2={FOOTER_Y + 10.5} stroke="#525252" opacity={0.4} />
              <text
                x={346.5}
                y={FOOTER_Y + 10.5}
                dominantBaseline="middle"
                className="fill-[#525252] text-[12px]"
              >
                {data[Math.floor((data.length - 1) / 2)].date}
              </text>
              <line x1={393.5} x2={643} y1={FOOTER_Y + 10.5} y2={FOOTER_Y + 10.5} stroke="#525252" opacity={0.4} />
              <text
                x={653}
                y={FOOTER_Y + 10.5}
                dominantBaseline="middle"
                className="fill-[#525252] text-[12px]"
              >
                {data[data.length - 1].date}
              </text>
            </g>
          )}
        </svg>

        {/* Tooltip — floats over the plot, anchored to the hovered point, so it
            never adds height to the card. Sits above the point, flipping below
            near the top edge and pinning its corner near the left/right edges. */}
        {tip && (
          <div
            aria-hidden
            className="pointer-events-none absolute z-20"
            style={{
              left: `${tip.xPct}%`,
              top: `${tip.yPct}%`,
              transform: `translate(${tip.anchorX}, ${tip.below ? "14px" : "calc(-100% - 14px)"})`,
            }}
          >
            <div className="flex items-center gap-[8px] rounded-[10px] bg-white px-[12px] py-[8px] whitespace-nowrap shadow-[0_8px_30px_rgba(0,0,0,0.10)] ring-1 ring-[#eaeaea]">
              <span className="size-[8px] shrink-0 rounded-full bg-[#f5b800]" />
              <span className="text-[12px] leading-[1.4] font-medium tracking-[-0.24px] text-[#1e1e1e]">
                ৳ {tip.row.sales.toLocaleString("en-IN")}
              </span>
              <span className="text-[12px] leading-[1.4] tracking-[-0.24px] text-[#525252]">
                {tip.row.orders} orders · {tip.row.date}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
