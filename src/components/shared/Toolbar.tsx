"use client";

import React from "react";

/**
 * The controls that sit above a list: search, filters, actions.
 *
 * Every listing page was building these by hand, and they had drifted — not
 * wildly, but in the way that reads as sloppiness rather than as design. Search
 * boxes were 44px tall next to Export buttons that were 48. The same magnifier
 * glyph was declared twenty-one times, at 16px, 20px and 24px. Import and
 * Export — two buttons that sit side by side — disagreed on radius (10 vs 12),
 * font size (14 vs 15), weight and padding. The three finance pages drew their
 * search box with a `border` while every other page used an inset shadow, which
 * is a hairline of a different colour in the same nominal place.
 *
 * So this is not a new style. It is the style eleven of the fifteen listing
 * pages already had, written down once:
 *
 *   * every toolbar control is 44px tall, the height `FilterDropdown` and
 *     `DateFilter` were already using
 *   * `rounded-[10px]`, and the hairline is `shadow-[inset_0_0_0_1px_#eaeaea]`
 *   * 14px text at `tracking-[-0.28px]`
 *   * search on the left and flexible, everything else on the right and fixed
 *
 * WHAT IS NOT HERE, deliberately: filters. `FilterDropdown` and `DateFilter`
 * already exist, are already shared, and already agree with the sizes above.
 * Re-housing them here would be churn for its own sake.
 */

/** Every control in a toolbar is this tall. Nothing in one may disagree. */
export const CONTROL_HEIGHT = "h-[44px]";

/** The shape shared by every toolbar button, whatever it is for. */
const BUTTON_BASE =
  "flex h-[44px] shrink-0 cursor-pointer items-center justify-center gap-[8px] rounded-[10px] " +
  "px-[16px] text-[14px] leading-[1.5] font-semibold tracking-[-0.28px] whitespace-nowrap " +
  "transition-colors disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Primary, secondary, danger — the hierarchy, and the ONLY thing that varies.
 *
 * Height, radius, padding and type are identical across all three on purpose:
 * a destructive action should read as dangerous because of its colour, not
 * because it is a different size from the button beside it.
 */
const BUTTON_VARIANTS = {
  /** The one thing this page is for: Add, Create, New, Save. */
  primary: "bg-[#f5b800] text-white hover:bg-[#e5a612]",
  /** Import, Export, Categories — real actions, not the main one. */
  secondary:
    "bg-white text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] hover:bg-[#fafafa] hover:text-[#1e1e1e]",
  /** Delete, Void. Rare in a toolbar, common in a dialog. */
  danger: "bg-white text-[#e63946] shadow-[inset_0_0_0_1px_#ffd0d4] hover:bg-[#fff5f6]",
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;

export function ActionButton({
  variant = "secondary",
  className = "",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      {...props}
      className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * The same button, as a link.
 *
 * Add New is an `<a>` on most pages because it navigates, and it looked
 * different from the `<button>` beside it for no reason anybody chose.
 */
export function ActionLink({
  variant = "primary",
  className = "",
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: ButtonVariant }) {
  return (
    <a {...props} className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${className}`}>
      {children}
    </a>
  );
}

/* ── Icons ───────────────────────────────────────────────────────────── */
/*
 * 20px in the search field, 18px on the buttons — both scaled to the 14px text
 * they sit beside, and both a single value everywhere.
 *
 * The copies these replace ran 16/20/24px for the magnifier and 14/15/18/20px
 * for the action glyphs, so two buttons in ONE toolbar could disagree. 24px was
 * the commonest magnifier and is not what this uses: it is the one place the
 * majority is not being followed, because a 24px glyph against a 14px
 * placeholder is the inconsistency inside the control rather than between
 * pages, and every other size here is scaled off the text.
 */

export function SearchIcon() {
  return (
    <svg className="block size-[20px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="m20 20-3.2-3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function ExportIcon() {
  return (
    <svg className="block size-[18px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v12m0 0 4-4m-4 4-4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ImportIcon() {
  return (
    <svg className="block size-[18px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 15V3m0 0L8 7m4-4 4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg className="block size-[18px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ── Search ──────────────────────────────────────────────────────────── */

/**
 * The search box, at the width and height every list already used.
 *
 * `lg:flex-1` between a floor and a ceiling: it takes the slack in the toolbar
 * so the actions stay pinned right, but it stops at 370px — a search field the
 * width of a 4K monitor looks like a mistake, and the placeholder is the only
 * thing in it.
 *
 * The focus ring is new, and is the one thing here that was not already the
 * standard: every one of these fields was `outline-none` with nothing put back,
 * so tabbing through a page left no sign of where you were. It borrows the
 * brand hairline the form fields on `/sales-pos/return/new` already use rather
 * than introducing a colour.
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
  className = "",
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  value: string;
  onChange: (next: string) => void;
  /** For screen readers. The placeholder is not a label. */
  label: string;
}) {
  return (
    <label
      className={
        "flex h-[44px] w-full items-center gap-[6px] overflow-clip rounded-[10px] bg-white " +
        "px-[12px] text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] " +
        "focus-within:shadow-[inset_0_0_0_1.5px_#f5b800] " +
        `lg:min-w-[220px] lg:max-w-[370px] lg:flex-1 ${className}`
      }
    >
      <SearchIcon />
      <input
        {...props}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="min-w-0 flex-1 bg-transparent text-[14px] leading-[1.5] tracking-[-0.28px] text-[#525252] outline-none placeholder:text-[#525252]"
      />
    </label>
  );
}

/* ── Layout ──────────────────────────────────────────────────────────── */

/**
 * Search on the left, filters and actions on the right, table below.
 *
 * ABOVE the table, never inside it. The finance pages had these controls in
 * the same white card as the rows, which reads as a header belonging to the
 * table — so "Export" looked like it meant the page of rows on screen rather
 * than the filtered set, and the card grew a second, competing title.
 *
 * It stacks on a phone rather than shrinking: `flex-col` until `lg`, where the
 * search and the actions have room to sit on one line. The actions wrap among
 * themselves before the row does, so a page with five filters degrades into
 * two tidy lines instead of a horizontal scrollbar.
 */
export function PageToolbar({
  search,
  children,
}: {
  /** Usually a `<SearchInput>`. Omitted on lists with nothing to search. */
  search?: React.ReactNode;
  /** Filters, then actions. Rendered right-aligned on a wide screen. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex w-full flex-col items-stretch gap-[12px] lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:gap-[16px]">
      {search ?? <span className="hidden lg:block" />}
      {children != null && (
        <div className="flex flex-wrap items-center gap-[12px] lg:shrink-0">{children}</div>
      )}
    </div>
  );
}

/**
 * The white card a table sits in.
 *
 * Every list already drew this, and all but one drew it identically; the odd
 * one out is why it is written down. Nothing page-level goes inside it.
 */
export const TABLE_CARD =
  "relative w-full overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]";

/** The column every listing page's content sits in. */
export const PAGE_STACK = "flex w-full flex-col gap-[14px]";
