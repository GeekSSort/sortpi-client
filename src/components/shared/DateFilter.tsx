"use client";

import React, { useState } from "react";
import { Caret, TRIGGER, useDismiss } from "./FilterDropdown";

/**
 * The date button: quick ranges, a single day, a month, or a span.
 *
 * Four ways of asking the same question, because the screens are read four
 * ways — "what came in today", "what happened on the 3rd", "how did September
 * go", "the fortnight either side of the delivery". One button rather than a
 * date box plus a preset list, which is two controls that can disagree about
 * which one is in charge.
 *
 * The value is always resolved to `from` and `to` — the two days the API takes
 * — so the screens never learn about modes at all.
 */

export type DateMode = "all" | "quick" | "day" | "month" | "range";

export interface DateValue {
  mode: DateMode;
  /** "today" | "7d" | "30d" for the quick picks. */
  quick?: string;
  /** yyyy-mm-dd */
  day?: string;
  /** yyyy-mm */
  month?: string;
  from?: string;
  to?: string;
}

export const ALL_DATES: DateValue = { mode: "all" };

const QUICK = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

/** Local days, not UTC: a shop's "today" is the one outside its window. */
function iso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pretty(value: string): string {
  const [y, m, d] = value.split("-");
  return `${Number(d)} ${MONTH_NAMES[Number(m) - 1]?.slice(0, 3)} ${y}`;
}

/** The two days this selection means. Empty object is "everything". */
export function resolveDates(v: DateValue): { from?: string; to?: string } {
  const now = new Date();
  if (v.mode === "day" && v.day) return { from: v.day, to: v.day };
  if (v.mode === "month" && v.month) {
    const [y, m] = v.month.split("-").map(Number);
    // Day 0 of the NEXT month is the last day of this one, which is how
    // February and the 31-day months stay correct without a table.
    return { from: `${v.month}-01`, to: iso(new Date(y, m, 0)) };
  }
  if (v.mode === "range") {
    // A half-filled range still narrows: "from the 3rd" with no end is a
    // reasonable thing to ask, and refusing it until both boxes are filled
    // makes the control feel broken.
    return { from: v.from || undefined, to: v.to || undefined };
  }
  if (v.mode === "quick" && v.quick) {
    const to = iso(now);
    if (v.quick === "today") return { from: to, to };
    if (v.quick === "yesterday") {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { from: iso(y), to: iso(y) };
    }
    const back = new Date(now);
    back.setDate(back.getDate() - (v.quick === "7d" ? 6 : 29));
    return { from: iso(back), to };
  }
  return {};
}

/** What the button says. */
export function dateLabel(v: DateValue): string {
  if (v.mode === "quick") return QUICK.find((q) => q.value === v.quick)?.label ?? "All time";
  if (v.mode === "day" && v.day) return pretty(v.day);
  if (v.mode === "month" && v.month) {
    const [y, m] = v.month.split("-");
    return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
  }
  if (v.mode === "range" && (v.from || v.to)) {
    if (v.from && v.to) return `${pretty(v.from)} – ${pretty(v.to)}`;
    return v.from ? `From ${pretty(v.from)}` : `Until ${pretty(v.to!)}`;
  }
  return "All time";
}

const BOX =
  "h-[34px] w-full rounded-[8px] border border-solid border-[#eaeaea] bg-white px-[8px] " +
  "text-[13px] text-[#1e1e1e] outline-none focus:border-[#f5b800]";

const TAB = "flex-1 cursor-pointer rounded-[6px] px-[6px] py-[5px] text-[12px] font-medium transition-colors";

export default function DateFilter({
  value,
  onChange,
}: {
  value: DateValue;
  onChange: (next: DateValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  // Which pane is showing. Seeded from the current selection so reopening the
  // button lands on the way it was last set, not back at the top.
  const [tab, setTab] = useState<Exclude<DateMode, "all">>(
    value.mode === "all" ? "quick" : value.mode
  );
  const active = value.mode !== "all";

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className={`${TRIGGER} ${
          active
            ? "text-[#1e1e1e] shadow-[inset_0_0_0_1.5px_#f5b800]"
            : "text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] hover:text-[#1e1e1e]"
        }`}
      >
        <span className="max-w-[190px] truncate">{dateLabel(value)}</span>
        <Caret open={open} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Filter by date"
          className="absolute top-[50px] right-0 z-30 w-[260px] rounded-[10px] bg-white p-[10px] shadow-[0_8px_30px_rgba(0,0,0,0.10)] ring-1 ring-[#eaeaea]"
        >
          <div className="mb-[10px] flex gap-[2px] rounded-[8px] bg-[#f4f4f2] p-[3px]">
            {(
              [
                ["quick", "Quick"],
                ["day", "Day"],
                ["month", "Month"],
                ["range", "Range"],
              ] as const
            ).map(([id, text]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`${TAB} ${
                  tab === id ? "bg-white text-[#1e1e1e] shadow-xs" : "text-[#8f8d87] hover:text-[#1e1e1e]"
                }`}
              >
                {text}
              </button>
            ))}
          </div>

          {tab === "quick" && (
            <div className="flex flex-col">
              {QUICK.map((q) => (
                <button
                  key={q.value}
                  type="button"
                  onClick={() => {
                    onChange({ mode: "quick", quick: q.value });
                    setOpen(false);
                  }}
                  className={`cursor-pointer rounded-[6px] px-[8px] py-[7px] text-left text-[13px] transition-colors hover:bg-[#fafafa] ${
                    value.mode === "quick" && value.quick === q.value
                      ? "font-semibold text-[#f5b800]"
                      : "text-[#1e1e1e]"
                  }`}
                >
                  {q.label}
                </button>
              ))}
            </div>
          )}

          {tab === "day" && (
            <label className="flex flex-col gap-[6px] text-[12px] font-semibold text-[#1e1e1e]">
              Pick a day
              <input
                type="date"
                value={value.day ?? ""}
                onChange={(e) => onChange({ mode: "day", day: e.target.value })}
                className={BOX}
              />
            </label>
          )}

          {tab === "month" && (
            <label className="flex flex-col gap-[6px] text-[12px] font-semibold text-[#1e1e1e]">
              Pick a month
              <input
                type="month"
                value={value.month ?? ""}
                onChange={(e) => onChange({ mode: "month", month: e.target.value })}
                className={BOX}
              />
            </label>
          )}

          {tab === "range" && (
            <div className="flex flex-col gap-[8px]">
              <label className="flex flex-col gap-[6px] text-[12px] font-semibold text-[#1e1e1e]">
                From
                <input
                  type="date"
                  value={value.from ?? ""}
                  max={value.to || undefined}
                  onChange={(e) =>
                    onChange({ mode: "range", from: e.target.value, to: value.to })
                  }
                  className={BOX}
                />
              </label>
              <label className="flex flex-col gap-[6px] text-[12px] font-semibold text-[#1e1e1e]">
                To
                <input
                  type="date"
                  value={value.to ?? ""}
                  min={value.from || undefined}
                  onChange={(e) =>
                    onChange({ mode: "range", from: value.from, to: e.target.value })
                  }
                  className={BOX}
                />
              </label>
            </div>
          )}

          <button
            type="button"
            disabled={!active}
            onClick={() => {
              onChange(ALL_DATES);
              setOpen(false);
            }}
            className="mt-[10px] h-[32px] w-full cursor-pointer rounded-[8px] border border-solid border-[#eaeaea] text-[13px] font-medium text-[#525252] transition-colors hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
