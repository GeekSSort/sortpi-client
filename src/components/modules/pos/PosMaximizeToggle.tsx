"use client";

import React from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { usePosMaximized, togglePosMaximized } from "./posMaximized";

/**
 * Put the till full-window, and bring the back office's frame back.
 *
 * The control has to outlive the thing it hides, so it has two homes and is
 * never in both at once:
 *
 *   normal      — in the header, just before the column switcher. The two are
 *                 the same kind of choice (how much screen the till gets), so
 *                 they sit together and share the switcher's palette.
 *   full screen — on the page, since the header it was sitting in is the thing
 *                 that just disappeared. A switch that removes its own housing
 *                 cannot be used to switch back.
 *
 * Labelled rather than an icon alone. The column switcher next to it can go
 * bare because two panes and three panes are legible AS pictures; a frame
 * around the screen is not, and an unlabelled expand arrow beside a pair of
 * layout icons reads as a third layout.
 */
export default function PosMaximizeToggle() {
  const maximized = usePosMaximized();
  const label = maximized ? "Exit full screen" : "Full screen";
  const Icon = maximized ? Minimize2 : Maximize2;

  return (
    <button
      type="button"
      onClick={togglePosMaximized}
      title={label}
      aria-label={label}
      aria-pressed={maximized}
      className="inline-flex h-[34px] shrink-0 cursor-pointer items-center gap-[6px] rounded-[10px] bg-[#f0ede6] px-[10px] text-[13px] font-medium whitespace-nowrap text-[#8f8d87] transition-colors duration-200 hover:text-[#1e1e1e]"
    >
      <Icon size={16} aria-hidden />
      {label}
    </button>
  );
}
