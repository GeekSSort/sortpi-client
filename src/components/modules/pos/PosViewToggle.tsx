"use client";

import React from "react";
import { setPosView, usePosView } from "./posView";

/**
 * Two columns or three, on the till.
 *
 * It lives in whichever top bar is above the till, and there are two of those
 * now: PosHead for a cashier and the back office's Header for everybody else.
 * One component, so the control cannot be in one and missing from the other.
 */

/** Two panes, side by side. */
function TwoColumnIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect
        x="1.5"
        y="2.5"
        width="6.5"
        height="13"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="10"
        y="2.5"
        width="6.5"
        height="13"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/** Three panes: products, basket, money. */
function ThreeColumnIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect
        x="1.5"
        y="2.5"
        width="4"
        height="13"
        rx="1.3"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="7"
        y="2.5"
        width="4"
        height="13"
        rx="1.3"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="12.5"
        y="2.5"
        width="4"
        height="13"
        rx="1.3"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export default function PosViewToggle() {
  const view = usePosView();

  return (
    <div className="flex items-center gap-[2px] rounded-[10px] bg-[#f0ede6] p-[3px]">
      {(
        [
          ["classic", "Two columns", TwoColumnIcon],
          ["columns", "Three columns", ThreeColumnIcon],
        ] as const
      ).map(([mode, label, Icon]) => (
        <button
          key={mode}
          type="button"
          onClick={() => setPosView(mode)}
          aria-label={label}
          aria-pressed={view === mode}
          title={label}
          className={`flex size-[34px] cursor-pointer items-center justify-center rounded-[8px] transition-colors duration-200 ${
            view === mode
              ? "bg-white text-[#f5b800] shadow-[0_1px_2px_rgba(82,88,102,0.10)]"
              : "text-[#8f8d87] hover:text-[#1e1e1e]"
          }`}
        >
          <Icon />
        </button>
      ))}
    </div>
  );
}
