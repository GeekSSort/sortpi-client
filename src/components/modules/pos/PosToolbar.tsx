"use client";

import React from "react";
import Image from "next/image";
import { SearchIcon, ScanIcon } from "./toolbarIcons";
import PosNotificationBell from "./PosNotificationBell";

/**
 * The product column's toolbar — Figma 6:890.
 *
 * Search, Scan, Category, Brand, notifications. Every control is 40px tall on
 * a 1px #E7E7E7 border at a 4px radius, with the frame's soft 60px shadow, and
 * they sit on a 12px gap.
 *
 * TYPEFACE: the frame specifies Urbanist. This renders in the app's own Geist
 * instead — the till around it is Geist throughout, and loading a second
 * family for one strip would make this row the odd one out rather than the
 * design's. Everything else is the frame's measurement.
 */

/** What the product column is showing. */
export type BrowseMode = "products" | "categories" | "brands";

/** The frame's control: 40px, hairline, 4px radius, the wide soft shadow. */
const CONTROL =
  "h-[40px] shrink-0 rounded-[4px] border border-solid border-[#e7e7e7] " +
  "shadow-[0px_4px_60px_0px_rgba(231,231,231,0.48)] bg-white";

/** A pressed Category/Brand keeps the frame's geometry and takes the till's gold. */
const ACTIVE = "border-[#f5b800] text-[#f5b800]";
const RESTING = "text-[#666] hover:bg-[#fafafa] hover:text-[#1e1e1e]";

export default function PosToolbar({
  query,
  onQueryChange,
  onSubmit,
  searchRef,
  scanning,
  browse,
  onBrowseChange,
  scannerConnected,
  onOpenScanner,
}: {
  query: string;
  onQueryChange: (next: string) => void;
  onSubmit: () => void;
  searchRef?: React.RefObject<HTMLInputElement | null>;
  scanning?: boolean;
  browse: BrowseMode;
  onBrowseChange: (next: BrowseMode) => void;
  scannerConnected: boolean;
  onOpenScanner: () => void;
}) {
  /** Category and Brand are the same button twice; the second press goes back. */
  const toggle = (mode: Exclude<BrowseMode, "products">) =>
    onBrowseChange(browse === mode ? "products" : mode);

  /**
   * The field names what it will search, which is whatever the column is
   * showing. Products is the only one of the three that also takes a barcode,
   * so it is the only one that says so.
   */
  const placeholder =
    browse === "categories"
      ? "Search Category"
      : browse === "brands"
        ? "Search Brand"
        : "Search Product";

  return (
    // @container: the row lives in the product column, which is about 555px on
    // a 1440 laptop while the frame's five controls want 657. What gives is the
    // two labels, not the search field — a search box squeezed to "Search Pro…"
    // with the ⌘K chip sitting on top of it was the first thing this row did.
    <div className="@container flex w-full shrink-0 items-center gap-[12px]">
      {/* Search — 6:891. 275 wide in the frame, allowed to grow to it and no
          further: a barcode is a couple of dozen characters, and the row's
          remaining width belongs to the four controls beside it. */}
      <div
        className={`${CONTROL} relative flex min-w-[180px] max-w-[275px] flex-1 items-center overflow-clip pr-[46px] pl-[10px]`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-[5px] text-[#666]">
          <SearchIcon />
          <input
            ref={searchRef}
            autoFocus
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              // Enter on something TYPED. A scan never reaches here — the
              // detector ends the burst and clears the box first — so this is
              // the cashier keying a code in by hand, which has to work when a
              // scanner dies mid-queue.
              if (e.key === "Enter") {
                e.preventDefault();
                onSubmit();
              }
            }}
            disabled={scanning}
            placeholder={placeholder}
            aria-label={
              browse === "products" ? "Scan a barcode or search products" : placeholder
            }
            className="min-w-0 flex-1 bg-transparent text-[14px] leading-[18px] font-medium text-[#666] outline-none placeholder:text-[#666] disabled:opacity-60"
          />
        </div>

        {/* ⌘K — 6:897. Decoration in the frame; here it says what it does, and
            the shortcut is bound in ProductGrid. */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-[9px] flex size-[28px] -translate-y-1/2 items-center justify-center rounded-[2px] bg-[#e7e7e7] text-[16px] leading-[18px] font-medium text-[#666]"
        >
          ⌘K
        </span>
      </div>

      {/* Scan — 6:899. Opens the scanner panel, which is where a device is
          connected and its state explained. The frame draws no connection
          indicator; the dot is ours, because this button REPLACED the pill
          that used to say Connected or Offline and dropping it would have
          left a cashier no way to see a dead scanner. */}
      <button
        type="button"
        onClick={onOpenScanner}
        title={scannerConnected ? "Scanner connected" : "Scanner offline"}
        className={`${CONTROL} ${RESTING} relative flex w-[84px] cursor-pointer items-center justify-center gap-[4px] transition-colors`}
      >
        <ScanIcon />
        <span className="text-[14px] leading-[18px] font-medium whitespace-nowrap">Scan</span>
        <span
          aria-hidden
          className={`absolute top-[6px] right-[6px] size-[6px] rounded-full ${
            scannerConnected ? "bg-[#12b76a]" : "bg-[#d0d5dd]"
          }`}
        />
        <span className="sr-only">
          {scannerConnected ? "Scanner connected" : "Scanner offline"}
        </span>
      </button>

      {/* Category — 6:912, its 16px glyph. */}
      <button
        type="button"
        onClick={() => toggle("categories")}
        aria-pressed={browse === "categories"}
        className={`${CONTROL} ${
          browse === "categories" ? ACTIVE : RESTING
        } flex w-[40px] @[620px]:w-[105px] cursor-pointer items-center justify-center gap-[4px] transition-colors`}
        title="Category"
      >
        <Image
          src="/pos/icons/category.png"
          alt=""
          width={16}
          height={16}
          className="size-[16px] shrink-0 object-cover"
        />
        <span className="hidden @[620px]:inline text-[14px] leading-[18px] font-medium whitespace-nowrap">
          Category
        </span>
      </button>

      {/* Brand — 6:916. A 24px glyph against Category's 16, as drawn. */}
      <button
        type="button"
        onClick={() => toggle("brands")}
        aria-pressed={browse === "brands"}
        className={`${CONTROL} ${
          browse === "brands" ? ACTIVE : RESTING
        } flex w-[40px] @[620px]:w-[105px] cursor-pointer items-center justify-center gap-[4px] transition-colors`}
        title="Brand"
      >
        <Image
          src="/pos/icons/brand.png"
          alt=""
          width={24}
          height={24}
          className="size-[24px] shrink-0 object-cover"
        />
        <span className="hidden @[620px]:inline text-[14px] leading-[18px] font-medium whitespace-nowrap">
          Brand
        </span>
      </button>

      {/* Notifications — 6:920. Its own component: it owns a panel and the
          read/unread cache, and the frame's dot has to tell the truth. */}
      <PosNotificationBell
        className={`${CONTROL} ${RESTING} relative flex size-[40px] cursor-pointer items-center justify-center transition-colors`}
      />

    </div>
  );
}
