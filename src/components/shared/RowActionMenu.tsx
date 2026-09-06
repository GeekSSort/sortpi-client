"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * The 40x40 row action button and its menu (Figma 30:17006 / 45:3210).
 *
 * The menu is drawn in a portal, not inside the row: tables clip what
 * overflows them, which hid the menu on the last row and made those actions
 * unclickable. It opens above the button when there is no room below, follows
 * the button on scroll, and closes on Escape, a click elsewhere, or the button
 * scrolling out of view.
 */

const MENU_WIDTH = 160;
const GAP = 6;

export default function RowActionMenu({
  label,
  actions,
}: {
  label: string;
  actions: { label: string; onSelect?: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  const [spot, setSpot] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const height = menuRef.current?.offsetHeight ?? actions.length * 33 + 8;
    const below = rect.bottom + GAP;
    const flip = below + height > window.innerHeight - 8;
    setSpot({
      top: flip ? Math.max(8, rect.top - GAP - height) : below,
      left: Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
    });
  }, [actions.length]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    // Move it rather than close it. Clicking a focusable row scrolls the row
    // into view, and closing on that scroll shut the menu as it opened.
    const follow = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) {
        setOpen(false);
        return;
      }
      place();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    // Capture, so a scroll inside the table body counts too.
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [open, place]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex size-[40px] cursor-pointer items-center justify-center overflow-clip rounded-[10px] border border-solid border-[#eaeaea] bg-white text-[#1e1e1e] shadow-[0px_1px_2px_0px_rgba(82,88,102,0.06)] transition-colors hover:bg-[#fafafa]"
      >
        <svg className="block size-[16px] -rotate-90" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path d="M3.33333 6.66667C2.6 6.66667 2 7.26667 2 8C2 8.73333 2.6 9.33333 3.33333 9.33333C4.06667 9.33333 4.66667 8.73333 4.66667 8C4.66667 7.26667 4.06667 6.66667 3.33333 6.66667Z" fill="currentColor" />
          <path d="M12.6667 6.66667C11.9333 6.66667 11.3333 7.26667 11.3333 8C11.3333 8.73333 11.9333 9.33333 12.6667 9.33333C13.4 9.33333 14 8.73333 14 8C14 7.26667 13.4 6.66667 12.6667 6.66667Z" fill="currentColor" />
          <path d="M8 6.66667C7.26667 6.66667 6.66667 7.26667 6.66667 8C6.66667 8.73333 7.26667 9.33333 8 9.33333C8.73333 9.33333 9.33333 8.73333 9.33333 8C9.33333 7.26667 8.73333 6.66667 8 6.66667Z" fill="currentColor" />
        </svg>
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: spot?.top ?? -9999, left: spot?.left ?? -9999, width: MENU_WIDTH }}
            className="fixed z-50 overflow-hidden rounded-[10px] bg-white py-[4px] text-left shadow-[0_8px_30px_rgba(0,0,0,0.10)] ring-1 ring-[#eaeaea]"
          >
            {actions.map((a) => (
              <button
                key={a.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  a.onSelect?.();
                  setOpen(false);
                }}
                className="block w-full cursor-pointer px-[14px] py-[8px] text-left text-[13px] text-[#525252] transition-colors hover:bg-[#fafafa]"
              >
                {a.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
