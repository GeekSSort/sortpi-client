"use client";

import React from "react";

/**
 * The loading vocabulary. Every screen draws its waiting state from here, so
 * the pulse, the grey and the corner radius are the same everywhere.
 *
 * The rule these follow: a skeleton stands in for CONTENT, at the size the
 * content will be. It is not a spinner in a box. Anything that would move when
 * the real thing arrives — a row height, a card height, the number of columns
 * — is matched here, because a layout that jumps has only traded a blank
 * screen for a flinch.
 *
 * `TableSkeleton` is the fourth member of this set and lives in its own file
 * because the tables were already using it.
 */

const BASE = "animate-pulse rounded-[4px] bg-[#f0f0f0]";

/** One grey bar standing in for a line of text. */
export function SkeletonLine({
  width = "100%",
  height = 12,
  className = "",
}: {
  width?: number | string;
  height?: number;
  className?: string;
}) {
  return (
    <div
      className={`${BASE} ${className}`}
      style={{ width: typeof width === "number" ? `${width}px` : width, height: `${height}px` }}
    />
  );
}

/** A filled block — an avatar, a thumbnail, a chart body. */
export function SkeletonBlock({
  className = "",
  radius = 8,
  style,
}: {
  className?: string;
  radius?: number;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`animate-pulse bg-[#f0f0f0] ${className}`}
      style={{ borderRadius: `${radius}px`, ...style }}
    />
  );
}

/**
 * The metric cards along the top of a dashboard.
 *
 * Sized to the real StatCard so the row below does not jump when the figures
 * land — the single most visible reflow on the overview screens.
 */
export function StatCardsSkeleton({
  count = 4,
  /** The real card's height on THIS screen. The dashboard's is 132px, the
      console's ~120px, and a skeleton that guesses makes the strip settle by
      the difference when the figures land. */
  height = 132,
  gap = 16,
  gridClassName,
}: {
  count?: number;
  height?: number;
  gap?: number;
  /** The real strip's grid, when it is not the dashboard's. Pass a literal
      class string; a runtime-built one is never emitted by Tailwind. */
  gridClassName?: string;
}) {
  return (
    <div
      className={gridClassName ?? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4"}
      style={{ gap: `${gap}px` }}
      aria-hidden
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col justify-between rounded-[12px] border border-solid border-[#eaeaea] bg-white p-[20px]"
          style={{ height: `${height}px` }}
        >
          <div className="flex items-start justify-between">
            <SkeletonLine width={96} height={11} />
            <SkeletonBlock className="size-[36px]" radius={10} />
          </div>
          <SkeletonLine width={132} height={26} />
          <SkeletonLine width={78} height={11} />
        </div>
      ))}
    </div>
  );
}

/** A card grid — the POS product wall, and anything else tiled. */
export function CardGridSkeleton({
  count = 8,
  height = 214,
  className = "grid grid-cols-2 gap-[16px] md:grid-cols-3 xl:grid-cols-4",
}: {
  count?: number;
  height?: number;
  className?: string;
}) {
  return (
    <div className={className} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-[10px] rounded-[12px] border border-solid border-[#eaeaea] bg-white p-[12px]"
          style={{ height: `${height}px` }}
        >
          <SkeletonBlock className="w-full flex-1" radius={8} />
          <SkeletonLine width="80%" />
          <SkeletonLine width="45%" height={14} />
        </div>
      ))}
    </div>
  );
}

/** A chart panel: the plot area, then the legend under it. */
export function ChartSkeleton({ height = 260 }: { height?: number }) {
  return (
    <div className="flex flex-col gap-[16px]" aria-hidden>
      <div className="flex items-center justify-between">
        <SkeletonLine width={148} height={16} />
        <SkeletonLine width={92} height={12} />
      </div>
      <SkeletonBlock style={{ height: `${height}px` }} radius={10} className="w-full" />
      <div className="flex gap-[16px]">
        <SkeletonLine width={72} />
        <SkeletonLine width={72} />
        <SkeletonLine width={72} />
      </div>
    </div>
  );
}

/** Stacked label-and-input pairs, for a form waiting on the record it edits. */
export function FormSkeleton({ fields = 6, columns = 2 }: { fields?: number; columns?: number }) {
  return (
    <div
      className={`grid gap-[20px] ${columns === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}
      aria-hidden
    >
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="flex flex-col gap-[8px]">
          <SkeletonLine width={92} height={11} />
          <SkeletonBlock className="h-[44px] w-full" radius={8} />
        </div>
      ))}
    </div>
  );
}

/** A read-only detail panel: paired label and value. */
export function DetailSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-[16px]" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-[24px]">
          <SkeletonLine width={112} height={11} />
          <SkeletonLine width={[168, 132, 196, 148][i % 4]} />
        </div>
      ))}
    </div>
  );
}

/** A vertical list of rows — activity feeds, notification lists. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={`flex items-center gap-[12px] py-[14px] ${
            i === rows - 1 ? "" : "border-b border-solid border-[#eaeaea]"
          }`}
        >
          <SkeletonBlock className="size-[36px] shrink-0" radius={999} />
          <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
            <SkeletonLine width={`${[62, 78, 55, 70, 48][i % 5]}%`} />
            <SkeletonLine width={`${[38, 30, 44, 34, 26][i % 5]}%`} height={10} />
          </div>
          <SkeletonLine width={54} height={10} />
        </div>
      ))}
    </div>
  );
}
