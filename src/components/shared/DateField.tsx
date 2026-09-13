"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * The date control used across the app. Two skins from the designs:
 *  - "gold"    dashboard headline (30:15376) — gradient pill, white text
 *  - "outline" Sales / Return / Customer (45:3622, 45:4123, 51:9105)
 *
 * Both open the same month popover. Future days are disabled — nothing has
 * happened in the business tomorrow.
 */

const LABEL = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });
const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const endOfToday = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
};

/** Days of `month`, padded so the grid starts on a Monday. */
function monthGrid(month: Date): (Date | null)[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  return [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: total }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
  ];
}

function CalendarIcon() {
  const s = { stroke: "currentColor", strokeWidth: 1.5, strokeMiterlimit: 10, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const d = { stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg className="block size-[20px] shrink-0" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M6.66667 1.66667V4.16667" {...s} />
      <path d="M13.3333 1.66667V4.16667" {...s} />
      <path d="M2.91667 7.575H17.0833" {...s} />
      <path d="M17.5 7.08333V14.1667C17.5 16.6667 16.25 18.3333 13.3333 18.3333H6.66667C3.75 18.3333 2.5 16.6667 2.5 14.1667V7.08333C2.5 4.58333 3.75 2.91667 6.66667 2.91667H13.3333C16.25 2.91667 17.5 4.58333 17.5 7.08333Z" {...s} />
      <path d="M13.0789 11.4167H13.0864" {...d} />
      <path d="M9.99624 11.4167H10.0037" {...d} />
      <path d="M6.91193 11.4167H6.91941" {...d} />
      <path d="M13.0789 13.9167H13.0864" {...d} />
      <path d="M9.99624 13.9167H10.0037" {...d} />
      <path d="M6.91193 13.9167H6.91941" {...d} />
    </svg>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg className="block size-[16px]" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d={dir === "left" ? "M10 3L5 8l5 5" : "M6 3l5 5-5 5"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface DateFieldProps {
  /**
   * null = no date filter applied.
   *
   * The label used to print TODAY in this state, which said the list was
   * filtered to today while it was showing every row ever recorded. The two
   * states now read differently: a picked day, or `emptyLabel`.
   */
  value: Date | null;
  onChange: (d: Date | null) => void;
  /**
   * What the control says when nothing is picked. "All time" for a filter,
   * because that is what an unfiltered list is showing. A `fullWidth` field is
   * an INPUT rather than a filter — there is no "all time" date to stamp on a
   * stock count — so it keeps "Select date".
   */
  emptyLabel?: string;
  variant?: "gold" | "outline";
  /** Overrides the default "Change date" label. */
  ariaLabel?: string;
  /** Fills the row as a 56px form field instead of a 48px pill. */
  fullWidth?: boolean;
}

export default function DateField({ value, onChange, variant = "outline", ariaLabel = "Change date", fullWidth = false, emptyLabel = "All time" }: DateFieldProps) {
  const shown = value ?? new Date();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date(shown.getFullYear(), shown.getMonth(), 1));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const today = new Date();
  const limit = endOfToday();
  const nextDisabled = new Date(month.getFullYear(), month.getMonth() + 1, 1).getTime() > limit.getTime();

  const pick = (d: Date) => {
    onChange(d);
    setOpen(false);
  };

  const gold = variant === "gold";

  return (
    <div ref={ref} className={`relative max-w-full ${fullWidth ? "w-full" : "shrink-0"}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => {
          setMonth(new Date(shown.getFullYear(), shown.getMonth(), 1));
          setOpen((v) => !v);
        }}
        style={
          gold
            ? {
                backgroundImage:
                  "linear-gradient(180deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 100%), linear-gradient(90deg, rgb(245,184,0) 0%, rgb(245,184,0) 100%)",
              }
            : undefined
        }
        className={`relative flex max-w-full cursor-pointer items-center ${
          fullWidth
            ? "h-[56px] w-full justify-between gap-[12px] rounded-[12px] px-[16px] py-[8px]"
            : gold
              ? "h-[48px] justify-center gap-[12px] rounded-[12px] px-[16px] py-[12px]"
              : // In a TOOLBAR: the 44px, 10px-radius shape of `FilterDropdown`
                // and the search box beside it. It was 48px with 16px text and a
                // `border`, a size bigger than every filter in the same row.
                "h-[44px] justify-center gap-[8px] rounded-[10px] px-[12px]"
        } ${
          gold
            ? "text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)]"
            : fullWidth
              ? `border border-solid bg-white transition-colors hover:bg-[#fafafa] ${
                  value ? "border-[#f5b800] text-[#f5b800]" : "border-[#eaeaea] text-[#525252]"
                }`
              : `bg-white transition-colors ${
                  value
                    ? "text-[#1e1e1e] shadow-[inset_0_0_0_1.5px_#f5b800]"
                    : "text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] hover:text-[#1e1e1e]"
                }`
        }`}
      >
        <span
          className={`truncate whitespace-nowrap ${
            fullWidth
              ? "text-[16px] leading-[24px] font-normal"
              : gold
                ? "text-[16px] leading-[24px] font-medium"
                : "text-[14px] leading-[1.5] tracking-[-0.28px]"
          }`}
          suppressHydrationWarning
        >
          {value ? LABEL.format(value) : fullWidth ? "Select date" : emptyLabel}
        </span>
        <CalendarIcon />
      </button>

      {open && (
        <div
          className={`absolute right-0 z-50 w-[280px] rounded-[12px] bg-white p-[12px] shadow-[0_8px_30px_rgba(0,0,0,0.10)] ring-1 ring-[#eaeaea] ${
            fullWidth ? "top-[64px]" : "top-[56px]"
          }`}
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              className="flex size-[32px] cursor-pointer items-center justify-center rounded-[8px] text-[#525252] transition-colors hover:bg-[#f5f5f5] hover:text-[#262626]"
            >
              <Chevron dir="left" />
            </button>
            <span className="text-[14px] font-medium text-[#262626]">{MONTH.format(month)}</span>
            <button
              type="button"
              aria-label="Next month"
              disabled={nextDisabled}
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              className="flex size-[32px] items-center justify-center rounded-[8px] text-[#525252] transition-colors not-disabled:cursor-pointer hover:not-disabled:bg-[#f5f5f5] disabled:cursor-not-allowed disabled:text-[#d4d4d4]"
            >
              <Chevron dir="right" />
            </button>
          </div>

          <div className="mt-[8px] grid grid-cols-7 gap-[2px]">
            {WEEKDAYS.map((d) => (
              <span key={d} className="py-[4px] text-center text-[11px] text-[#8a8a8a]">
                {d}
              </span>
            ))}
            {monthGrid(month).map((d, i) =>
              d === null ? (
                <span key={`pad-${i}`} />
              ) : (
                <button
                  key={d.toISOString()}
                  type="button"
                  disabled={d.getTime() > limit.getTime()}
                  onClick={() => pick(d)}
                  className={`flex h-[32px] items-center justify-center rounded-[8px] text-[13px] transition-colors not-disabled:cursor-pointer disabled:cursor-not-allowed disabled:text-[#d4d4d4] ${
                    value !== null && sameDay(d, value)
                      ? "bg-[#f5b800] font-medium text-white"
                      : sameDay(d, today)
                        ? "font-medium text-[#f5b800] hover:not-disabled:bg-[#fffaeb]"
                        : "text-[#525252] hover:not-disabled:bg-[#fafafa]"
                  }`}
                >
                  {d.getDate()}
                </button>
              )
            )}
          </div>

          <div className="mt-[8px] flex items-center gap-[8px]">
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="flex-1 cursor-pointer rounded-[8px] py-[6px] text-[12px] font-medium text-[#525252] transition-colors hover:bg-[#fafafa]"
            >
              {/* Same words the pill shows when nothing is picked. Two
                  labels for one state — "All dates" here, "All time" there —
                  read as two different things. */}
              {emptyLabel}
            </button>
            <button
              type="button"
              onClick={() => pick(new Date())}
              className="flex-1 cursor-pointer rounded-[8px] py-[6px] text-[12px] font-medium text-[#f5b800] transition-colors hover:bg-[#fffaeb]"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
