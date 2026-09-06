"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

/** A left/right chevron for the chip rail. */
function RailArrow({ dir }: { dir: "left" | "right" }) {
  return (
    <svg
      className={`block size-[16px] ${dir === "left" ? "" : "rotate-180"}`}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="M10 3.5 5.5 8l4.5 4.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * A horizontal rail of chips with arrows instead of a scrollbar.
 *
 * The strip still scrolls — a trackpad and a touch drag both work — but a till
 * is a mouse and a finger on a fixed screen, and neither has a comfortable way
 * to reach a 4px horizontal scrollbar. Each arrow moves the rail by most of its
 * own width and disappears at the end it cannot go past, so the control says
 * whether there is anything more to see.
 */
export default function ChipScroller({
  children,
  className = "",
  gap = "gap-[8px]",
}: {
  children: React.ReactNode;
  /** Extra classes for the rail itself — a height, a flex share. */
  className?: string;
  /** The gap between chips, so each caller keeps its own design's spacing. */
  gap?: string;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = rail.current;
    if (!el) return;
    // 1px of slack: a fractional scrollWidth otherwise leaves the right arrow
    // enabled at the end of the rail, where pressing it does nothing.
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ start: el.scrollLeft > 1, end: el.scrollLeft < max - 1 });
  }, []);

  // Re-measured on resize as well as on scroll: the same chips overflow at one
  // window width and not at another, and the arrows have to follow.
  useEffect(() => {
    measure();
    const el = rail.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, children]);

  const nudge = (by: number) => {
    const el = rail.current;
    if (!el) return;
    el.scrollBy({ left: by * Math.max(160, el.clientWidth * 0.8), behavior: "smooth" });
  };

  const ARROW =
    "flex size-[34px] shrink-0 cursor-pointer items-center justify-center rounded-[9px] bg-white text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] transition-colors hover:text-[#1e1e1e]";

  return (
    <div className={`flex items-center gap-[8px] ${className || "w-full"}`}>
      {edges.start ? (
        <button type="button" aria-label="Scroll categories left" onClick={() => nudge(-1)} className={ARROW}>
          <RailArrow dir="left" />
        </button>
      ) : (
        // Held open so the chips do not jump sideways as the arrows appear.
        <span className="size-[34px] shrink-0" aria-hidden />
      )}

      <div
        ref={rail}
        onScroll={measure}
        className={`no-scrollbar flex h-full min-w-0 flex-1 items-center overflow-x-auto scroll-smooth ${gap}`}
      >
        {children}
      </div>

      {edges.end ? (
        <button type="button" aria-label="Scroll categories right" onClick={() => nudge(1)} className={ARROW}>
          <RailArrow dir="right" />
        </button>
      ) : (
        <span className="size-[34px] shrink-0" aria-hidden />
      )}
    </div>
  );
}
