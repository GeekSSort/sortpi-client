"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * The funnel button and the panel behind it, shared by every list screen.
 *
 * It replaced a button that every one of those screens already had and that
 * none of them had wired: pressing it said "Filter panel not designed yet",
 * which is a control a shopkeeper learns to ignore and then does not notice
 * when it starts working.
 *
 * Each screen declares WHAT it filters on; this owns how that looks and
 * behaves. The narrowing itself is done by the server — these screens load
 * their rows a batch at a time as you scroll, so a filter applied in the
 * browser would hide rows from the batches already fetched and quietly let
 * the rest through.
 */

export interface FilterOption {
  /** What goes to the API. "" is "no filter". */
  value: string;
  label: string;
}

export interface FilterSpec {
  /** Stable id, used as the React key. */
  key: string;
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (next: string) => void;
}

function FunnelIcon() {
  return (
    <svg className="block size-[20px]" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M3.333 5h13.334M6.667 10h6.666M8.333 15h3.334"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function FilterMenu({ filters }: { filters: FilterSpec[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // How many are actually narrowing anything — shown on the button, so a list
  // that looks short has a visible reason why.
  const active = filters.filter((f) => f.value !== "").length;

  // Closes on an outside click or Escape, like every other popover here.
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

  if (filters.length === 0) return null;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label={active > 0 ? `Filters, ${active} applied` : "Filters"}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
        className={`relative flex cursor-pointer items-center transition-colors ${
          active > 0 ? "text-[#f5b800]" : "text-[#525252] hover:text-[#1e1e1e]"
        }`}
      >
        <FunnelIcon />
        {active > 0 && (
          <span className="absolute -top-[2px] -right-[4px] flex size-[14px] items-center justify-center rounded-full bg-[#f5b800] text-[9px] font-bold text-white">
            {active}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Filters"
          className="absolute top-[30px] right-0 z-30 w-[230px] rounded-[10px] bg-white p-[12px] shadow-[0_8px_30px_rgba(0,0,0,0.10)] ring-1 ring-[#eaeaea]"
        >
          <div className="flex flex-col gap-[12px]">
            {filters.map((f) => (
              <div key={f.key} className="flex flex-col gap-[6px]">
                <label
                  htmlFor={`filter-${f.key}`}
                  className="text-[12px] font-semibold text-[#1e1e1e]"
                >
                  {f.label}
                </label>
                <select
                  id={`filter-${f.key}`}
                  value={f.value}
                  onChange={(e) => f.onChange(e.target.value)}
                  className="h-[34px] w-full cursor-pointer rounded-[8px] border border-solid border-[#eaeaea] bg-white px-[8px] text-[13px] text-[#1e1e1e] outline-none focus:border-[#f5b800]"
                >
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <button
            type="button"
            disabled={active === 0}
            onClick={() => filters.forEach((f) => f.onChange(""))}
            className="mt-[12px] h-[32px] w-full cursor-pointer rounded-[8px] border border-solid border-[#eaeaea] text-[13px] font-medium text-[#525252] transition-colors hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
