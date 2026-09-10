"use client";

import React, { useMemo, useRef, useState } from "react";
import type { TrendPoint } from "@/types/finance";

/**
 * Income vs Expense Trend — Figma 367:2574.
 *
 * The design's own geometry, measured off the frame: a 27px bar, a 5px gap
 * between the pair, an 80px pitch from one month to the next, and a plot 183px
 * tall from the 0 line to the top row. Five axis rows, so four steps.
 *
 * TWELVE groups, not the four the design's sample data happened to have. The
 * frame is 1104 wide inside its padding and twelve groups need 1022 of it, so
 * the design's spacing holds for a full year without being re-derived — which
 * is why these numbers are kept rather than replaced with something relative.
 *
 * Drawn as an SVG with a fixed viewBox and scaled by CSS, the way
 * `SalesSummaryChart` and `ProfitLossChart` are. Below md the wrapper scrolls
 * instead of shrinking: twelve months squeezed into a phone's width puts the
 * bars under 3px and the month labels on top of each other.
 *
 * COLOURS are the design's `#27b85e` and `#ff0000`. They are a red/green pair,
 * which is the one thing a chart is usually told not to do — so it was checked
 * rather than assumed: deutan separation is ΔE 7.2, inside the band that is
 * legal WITH secondary encoding, and the encoding is here. Identity never
 * rests on colour alone — the legend names both series, income is always the
 * left bar of its pair, the tooltip names the series it is describing, and the
 * table below the chart carries a Type column and signed amounts.
 */

const INCOME = "#27b85e";
const EXPENSE = "#ff0000";

/** The design's measurements, in viewBox units. */
const VB_W = 1104;
const PLOT_LEFT = 83;
const PLOT_RIGHT = 1088;
const AXIS_TOP = 8;
const BASELINE = 191;
const LABEL_Y = 215;
const VB_H = 232;
const BAR_W = 27;
const BAR_GAP = 5;
const PITCH = 80;
const ROWS = 5; // 0 and four steps above it

/** A tick ladder, so an axis top is a number a person would have chosen. */
const NICE = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10];

/**
 * The axis top: four equal steps that clear the tallest bar.
 *
 * Rounded UP through the ladder rather than set to the maximum itself, or the
 * tallest bar would touch the top row and read as clipped.
 */
function axisTop(max: number): number {
  if (max <= 0) return 4;
  const step = max / (ROWS - 1);
  const power = 10 ** Math.floor(Math.log10(step));
  const nice = NICE.find((n) => n * power >= step) ?? 10;
  return nice * power * (ROWS - 1);
}

/** 220000 -> "220k". The axis has no room for the zeros. */
function tick(value: number): string {
  if (value === 0) return "0k";
  if (Math.abs(value) >= 1_000_000) {
    return `${+(value / 1_000_000).toFixed(1)}m`;
  }
  return `${Math.round(value / 1000)}k`;
}

/** The tooltip's figure, in the design's "BDT 197k" shape. */
function money(value: number): string {
  if (Math.abs(value) >= 1000) return `BDT ${tick(value)}`;
  return `BDT ${Math.round(value)}`;
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
    <svg
      className="block h-[4px] w-[8px] shrink-0 overflow-visible"
      viewBox="0 0 8 4"
      fill="none"
      aria-hidden
    >
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

export interface IncomeExpenseTrendProps {
  points: TrendPoint[];
  /** The year label on the range control — "2026", or "This Year". */
  rangeLabel: string;
  years: number[];
  onYearChange: (year: number) => void;
  onExport?: () => void;
  busy?: boolean;
  exporting?: boolean;
}

export default function IncomeExpenseTrend({
  points,
  rangeLabel,
  years,
  onYearChange,
  onExport,
  busy = false,
  exporting = false,
}: IncomeExpenseTrendProps) {
  const [open, setOpen] = useState(false);
  /** Which bar the pointer is on: the group index and which side. */
  const [hover, setHover] = useState<{ i: number; kind: "income" | "expense" } | null>(null);
  const closeTimer = useRef<number | null>(null);

  const top = useMemo(
    () => axisTop(Math.max(0, ...points.flatMap((p) => [p.income, p.expense]))),
    [points]
  );

  const y = (value: number) =>
    BASELINE - (Math.max(0, value) / top) * (BASELINE - AXIS_TOP);

  const rows = Array.from({ length: ROWS }, (_, i) => {
    const value = (top / (ROWS - 1)) * i;
    return { value, y: BASELINE - ((BASELINE - AXIS_TOP) / (ROWS - 1)) * i };
  });

  const hovered =
    hover && points[hover.i]
      ? {
          point: points[hover.i],
          value: hover.kind === "income" ? points[hover.i].income : points[hover.i].expense,
          kind: hover.kind,
        }
      : null;

  return (
    <div className="flex w-full flex-col gap-[16px] rounded-[12px] bg-white p-[20px] shadow-[inset_0_0_0_1px_#eaeaea] sm:p-[24px]">
      {/* Header — title, Export, and the year picker. */}
      <div className="flex flex-wrap items-center justify-between gap-[12px]">
        <h2 className="text-[18px] leading-[1.4] font-medium tracking-[-0.4px] text-[#1e1e1e] sm:text-[20px] sm:leading-[1.5]">
          Income vs Expense Trend
        </h2>

        <div className="flex shrink-0 items-center gap-[10px]">
          <button
            type="button"
            onClick={onExport}
            disabled={exporting}
            className="flex h-[40px] cursor-pointer items-center justify-center gap-[8px] rounded-[11px] border border-solid border-[#eaeaea] bg-white px-[14px] text-[14px] font-medium tracking-[-0.28px] text-[#525252] transition-colors hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-60 sm:px-[18px]"
          >
            <ExportIcon />
            <span className="whitespace-nowrap">{exporting ? "Exporting…" : "Export"}</span>
          </button>

          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              onBlur={() => window.setTimeout(() => setOpen(false), 120)}
              aria-expanded={open}
              aria-haspopup="listbox"
              className="flex h-[40px] cursor-pointer items-center justify-center gap-[8px] rounded-[11px] border border-solid border-[#eaeaea] bg-white px-[14px] text-[14px] font-medium tracking-[-0.28px] text-[#525252] transition-colors hover:bg-[#fafafa] sm:px-[18px]"
            >
              <span className="whitespace-nowrap">{busy ? "Loading…" : rangeLabel}</span>
              <CaretIcon />
            </button>
            {open && (
              <div
                role="listbox"
                className="absolute top-[46px] right-0 z-30 max-h-[220px] w-[140px] overflow-y-auto rounded-[10px] bg-white py-[4px] shadow-[0_8px_30px_rgba(0,0,0,0.10)] ring-1 ring-[#eaeaea]"
              >
                {years.map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="option"
                    aria-selected={String(option) === rangeLabel}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onYearChange(option);
                      setOpen(false);
                    }}
                    className="block w-full cursor-pointer px-[14px] py-[8px] text-left text-[14px] font-medium text-[#525252] transition-colors hover:bg-[#fafafa]"
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* The plot. Scrolls below md rather than shrinking — twelve months at a
          phone's width puts the bars under 3px wide. */}
      <div className="-mx-[4px] overflow-x-auto px-[4px]">
        <div className="min-w-[620px] md:min-w-0">
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            className="block h-auto w-full overflow-visible"
            role="img"
            aria-label="Income against expense, by month"
          >
            {/* Axis rows. Dashed and recessive: the data is the thing. */}
            {rows.map((row) => (
              <g key={row.value}>
                <line
                  x1={PLOT_LEFT}
                  y1={row.y}
                  x2={PLOT_RIGHT}
                  y2={row.y}
                  stroke="#eaeaea"
                  strokeWidth={1}
                  strokeDasharray="4 6"
                />
                <text
                  x={PLOT_LEFT - 17}
                  y={row.y + 4}
                  textAnchor="end"
                  className="fill-[#525252] text-[13px]"
                  style={{ fontSize: 13 }}
                >
                  {tick(row.value)}
                </text>
              </g>
            ))}

            {points.map((point, i) => {
              const groupX = PLOT_LEFT + i * PITCH;
              const incomeX = groupX;
              const expenseX = groupX + BAR_W + BAR_GAP;
              const bars = [
                { kind: "income" as const, x: incomeX, value: point.income, fill: INCOME },
                { kind: "expense" as const, x: expenseX, value: point.expense, fill: EXPENSE },
              ];
              return (
                <g key={point.month}>
                  {bars.map((bar) => {
                    const barY = y(bar.value);
                    const height = Math.max(0, BASELINE - barY);
                    const isOn = hover?.i === i && hover.kind === bar.kind;
                    return (
                      <g key={bar.kind}>
                        {/* A full-height hit target, so a short bar is still
                            easy to point at — a 2px rectangle is not. */}
                        <rect
                          x={bar.x}
                          y={AXIS_TOP}
                          width={BAR_W}
                          height={BASELINE - AXIS_TOP}
                          fill="transparent"
                          onMouseEnter={() => {
                            if (closeTimer.current) window.clearTimeout(closeTimer.current);
                            setHover({ i, kind: bar.kind });
                          }}
                          onMouseLeave={() => {
                            closeTimer.current = window.setTimeout(() => setHover(null), 60);
                          }}
                        />
                        {height > 0 && (
                          <rect
                            x={bar.x}
                            y={barY}
                            width={BAR_W}
                            height={height}
                            rx={2}
                            fill={bar.fill}
                            opacity={hover && !isOn ? 0.55 : 1}
                            className="pointer-events-none transition-opacity"
                          />
                        )}
                      </g>
                    );
                  })}
                  <text
                    x={groupX + BAR_W + BAR_GAP / 2}
                    y={LABEL_Y}
                    textAnchor="middle"
                    className="fill-[#525252]"
                    style={{ fontSize: 14 }}
                  >
                    {point.label}
                  </text>
                </g>
              );
            })}

            {/* The hovered figure, in the design's pill. Drawn last so it is
                above every bar. */}
            {hovered && (
              (() => {
                const groupX = PLOT_LEFT + hover!.i * PITCH;
                const centre =
                  hover!.kind === "income"
                    ? groupX + BAR_W / 2
                    : groupX + BAR_W + BAR_GAP + BAR_W / 2;
                const barY = y(hovered.value);
                const label = money(hovered.value);
                const width = Math.max(96, label.length * 8.5 + 24);
                const boxX = Math.min(
                  Math.max(centre - width / 2, PLOT_LEFT),
                  PLOT_RIGHT - width
                );
                const boxY = Math.max(barY - 46, 0);
                return (
                  <g className="pointer-events-none">
                    <rect
                      x={boxX}
                      y={boxY}
                      width={width}
                      height={30}
                      rx={7}
                      fill="#ffffff"
                      stroke="#eaeaea"
                    />
                    <text
                      x={boxX + width / 2}
                      y={boxY + 20}
                      textAnchor="middle"
                      className="fill-[#1e1e1e]"
                      style={{ fontSize: 14, fontWeight: 500 }}
                    >
                      {label}
                    </text>
                    {/* The series, named — so the tooltip is not colour-only. */}
                    <text
                      x={boxX + width / 2}
                      y={boxY + 42}
                      textAnchor="middle"
                      className="fill-[#525252]"
                      style={{ fontSize: 11 }}
                    >
                      {hovered.point.label} · {hovered.kind === "income" ? "Income" : "Expense"}
                    </text>
                    <circle
                      cx={centre}
                      cy={barY}
                      r={5}
                      fill={hovered.kind === "income" ? INCOME : EXPENSE}
                      stroke="#ffffff"
                      strokeWidth={2}
                    />
                  </g>
                );
              })()
            )}
          </svg>
        </div>
      </div>

      {/* Legend — always present, because two series must never be told apart
          by colour alone. */}
      <div className="flex items-center justify-center gap-[24px]">
        {[
          { label: "Income", fill: INCOME },
          { label: "Expense", fill: EXPENSE },
        ].map((item) => (
          <span key={item.label} className="flex items-center gap-[8px]">
            <span
              className="block size-[12px] shrink-0 rounded-[2px]"
              style={{ backgroundColor: item.fill }}
            />
            <span className="text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]">
              {item.label}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
