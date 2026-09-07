"use client";

import React from "react";

import DateField from "@/components/shared/DateField";

/**
 * Figma: SortPi — Headline 30:15372.
 *
 * The dashboard's own 54px headline row: greeting on the left, gold date pill
 * (48 tall, centred in the row) on the right. The pill reuses the Sign In
 * button's two-layer gradient and inset highlight, and opens a month picker.
 *
 * Below sm the row stacks and the pill truncates — my own responsive handling.
 */


export interface HeadlineProps {
  name: string;
  /**
   * The picked day, owned by the PAGE.
   *
   * It used to live in this component, and picking a date started a fetch for
   * that day — which left the page with no data for the new key, so it swapped
   * the headline for a skeleton, unmounted this component and threw the state
   * away. The figures changed and the pill snapped back to "All time",
   * claiming to show everything while showing one day.
   */
  date: Date | null;
  /** Fires when a day is picked; null clears the filter. */
  onDateChange?: (date: Date | null) => void;
}

export default function Headline({ name, date, onDateChange }: HeadlineProps) {
  const pick = (d: Date | null) => {
    onDateChange?.(d);
  };

  return (
    <div className="flex w-full flex-col items-start gap-[16px] select-none sm:h-[54px] sm:flex-row sm:items-center sm:justify-between sm:gap-0">
      {/* Text — 30:15373 */}
      <div className="flex min-w-0 flex-col justify-center gap-[4px] sm:whitespace-nowrap">
        <p className="text-[24px] leading-[1.2] font-medium tracking-[-0.72px] text-[#1e1e1e]">
          Welcome, {name}👋{" "}
        </p>
        <p className="text-[14px] leading-[1.5] font-normal tracking-[-0.28px] text-[#525252]">
          Here’s what’s happening with your business today.
        </p>
      </div>

      {/* The date pill only. The branch switcher used to sit beside it and
          now lives in the top bar: it is not a dashboard filter, it is
          server-side state that every page answers to, so one control on
          every screen beats a second copy on this one. */}
      <div className="flex w-full items-center gap-[12px] sm:w-auto">
        <DateField value={date} onChange={pick} variant="gold" />
      </div>
    </div>
  );
}
