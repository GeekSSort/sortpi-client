"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * One filter, as a button that says what it is set to.
 *
 * Visible in the toolbar beside the search box rather than hidden behind a
 * funnel: a filter nobody can see is one nobody uses, and — worse — a list
 * that is quietly narrowed with nothing on screen saying so.
 */

export interface DropdownOption {
  /** What goes to the API. "" is "no filter". */
  value: string;
  label: string;
}

export function Caret({ open }: { open: boolean }) {
  return (
    <svg
      className={`block size-[16px] shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The toolbar button shape every filter here uses. */
export const TRIGGER =
  "flex h-[44px] shrink-0 cursor-pointer items-center gap-[8px] rounded-[10px] bg-white px-[12px] " +
  "text-[14px] leading-[1.5] tracking-[-0.28px] whitespace-nowrap transition-colors";

/** Closes on an outside click or Escape. */
export function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

export default function FilterDropdown({
  label,
  value,
  options,
  onChange,
}: {
  /** Shown when nothing is chosen — "Status", "Brand". */
  label: string;
  value: string;
  options: DropdownOption[];
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const chosen = options.find((o) => o.value === value && o.value !== "");

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
        className={`${TRIGGER} ${
          chosen
            ? "text-[#1e1e1e] shadow-[inset_0_0_0_1.5px_#f5b800]"
            : "text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] hover:text-[#1e1e1e]"
        }`}
      >
        <span className="max-w-[150px] truncate">{chosen ? chosen.label : label}</span>
        <Caret open={open} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          className="absolute top-[50px] left-0 z-30 max-h-[280px] w-[200px] overflow-y-auto rounded-[10px] bg-white py-[4px] shadow-[0_8px_30px_rgba(0,0,0,0.10)] ring-1 ring-[#eaeaea]"
        >
          {options.map((o) => (
            <button
              key={o.value || "any"}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={`flex w-full cursor-pointer items-center px-[12px] py-[8px] text-left text-[13px] transition-colors hover:bg-[#fafafa] ${
                o.value === value ? "font-semibold text-[#f5b800]" : "text-[#1e1e1e]"
              }`}
            >
              <span className="truncate">{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
