"use client";

import React, { useEffect } from "react";

/**
 * Dialog shell shared by the row-action flows: backdrop, Escape, click-outside
 * and a consistent 12px card in the app's own language.
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 520,
  fillBody = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
  /**
   * Hand the body's height to the content instead of scrolling it here.
   *
   * The default is right for a dialog that is a run of fields: it grows to fit
   * and scrolls once it hits 90vh. It is wrong for one with a LIST in the
   * middle — the invoice, whose totals belong under the items and kept being
   * pushed below the fold by a long sale. With this set the body no longer
   * scrolls, and the child is expected to be a flex column that gives its list
   * `min-h-0 flex-1 overflow-y-auto`, so the list absorbs the leftover height
   * and everything after it stays on screen.
   */
  fillBody?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="sp-fade fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-[16px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="sp-rise flex max-h-[90vh] w-full flex-col overflow-hidden rounded-[12px] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
        style={{ maxWidth: width }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-solid border-[#eaeaea] px-[20px] py-[16px]">
          <p className="text-[18px] leading-[1.5] font-medium tracking-[-0.36px] text-[#1e1e1e]">{title}</p>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex size-[32px] cursor-pointer items-center justify-center rounded-[8px] text-[#525252] transition-colors hover:bg-[#fafafa]"
          >
            <svg className="block size-[16px]" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div
          className={`min-h-0 flex-1 px-[20px] py-[16px] ${
            fillBody ? "flex flex-col overflow-hidden" : "overflow-y-auto"
          }`}
        >
          {children}
        </div>

        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-[12px] border-t border-solid border-[#eaeaea] px-[20px] py-[16px]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export const MODAL_GHOST =
  "flex h-[44px] cursor-pointer items-center justify-center rounded-[12px] border border-solid border-[#eaeaea] bg-white px-[20px] text-[14px] font-medium text-[#525252] transition-colors hover:bg-[#fafafa]";
export const MODAL_PRIMARY =
  "flex h-[44px] cursor-pointer items-center justify-center rounded-[12px] px-[20px] text-[14px] font-semibold text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)] disabled:cursor-not-allowed disabled:opacity-60";
export const GOLD_GRADIENT =
  "linear-gradient(180deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 100%), linear-gradient(90deg, rgb(245,184,0) 0%, rgb(245,184,0) 100%)";
export const RED_GRADIENT =
  "linear-gradient(180deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 100%), linear-gradient(90deg, rgb(239,68,68) 0%, rgb(239,68,68) 100%)";
