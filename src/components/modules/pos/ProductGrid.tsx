"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ProductItem } from "@/types/pos";
import ProductPeek, { PeekAnchor } from "./ProductPeek";
import { PosService } from "@/services";
import TablePagination from "@/components/shared/TablePagination";
import { useQuery, queryKey } from "@/lib/query/useQuery";
import { CardGridSkeleton } from "@/components/shared/Skeleton";
import { QueryBoundary, RefreshBar, EmptyState } from "@/components/shared/QueryBoundary";
import ProductImage from "@/components/shared/ProductImage";
import ChipScroller from "@/components/shared/ChipScroller";
import { useProductDiscounts } from "@/lib/usePosDiscounts";
import { priceAfter } from "@/lib/posDiscounts";
import { formatMoney } from "@/lib/format";

/**
 * The till's product list — Figma 45:2171.
 *
 * A 565 column: 44px search, the category row, then three 180x248 cards
 * across over a 48px pager.
 *
 * On a narrower screen the cards keep their size and the grid drops a column.
 * There is no Figma frame for that; it is our choice.
 */

/** Magnifier, node 45:2174. */
function SearchIcon() {
  return (
    <svg className="block size-[24px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="10.5" cy="10.5" r="7.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 16L21 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M8.5 3.75a6.75 6.75 0 0 1 6.75 6.75"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.45"
      />
    </svg>
  );
}

/** Barcode scanner, node 45:2179. */
function ScanIcon() {
  return (
    <svg className="block size-[24px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path d="M7 8.5v7M10 8.5v7M13.5 8.5v7M17 8.5v7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** The upright "more" dots, node 45:2196. */
function MoreIcon() {
  return (
    <svg className="block size-[16px] -rotate-90" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3.33333 6.66667C2.6 6.66667 2 7.26667 2 8C2 8.73333 2.6 9.33333 3.33333 9.33333C4.06667 9.33333 4.66667 8.73333 4.66667 8C4.66667 7.26667 4.06667 6.66667 3.33333 6.66667Z" fill="currentColor" />
      <path d="M12.6667 6.66667C11.9333 6.66667 11.3333 7.26667 11.3333 8C11.3333 8.73333 11.9333 9.33333 12.6667 9.33333C13.4 9.33333 14 8.73333 14 8C14 7.26667 13.4 6.66667 12.6667 6.66667Z" fill="currentColor" />
      <path d="M8 6.66667C7.26667 6.66667 6.66667 7.26667 6.66667 8C6.66667 8.73333 7.26667 9.33333 8 9.33333C8.73333 9.33333 9.33333 8.73333 9.33333 8C9.33333 7.26667 8.73333 6.66667 8 6.66667Z" fill="currentColor" />
    </svg>
  );
}

interface ProductGridProps {
  onSelectProduct?: (product: ProductItem) => void;
}

export default function ProductGrid({ onSelectProduct }: ProductGridProps) {
  const [peeked, setPeeked] = useState<PeekAnchor | null>(null);

  /** Remember which tile the pointer is on, and where it sits on screen. */
  const peek = (product: ProductItem, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setPeeked({ product, rect: { top: r.top, left: r.left, right: r.right, bottom: r.bottom } });
  };

  // The scanner is a keyboard: it types the digits it read and presses Enter.
  // So the search box IS the scan target, and Enter is the whole protocol —
  // there is no device to open and no permission to ask for.
  const searchRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);

  // What the Discounts screen set. Read here so the wall shows what the
  // customer will actually be charged — a rate that only appeared on the
  // screen that set it was an offer the shop could not see it was running.
  const rates = useProductDiscounts();

  /** "" is every category. Held as an ID, which is what the API filters on. */
  const [categoryId, setCategoryId] = useState("");
  const [query, setQuery] = useState("");
  /** The debounce settles the term before it reaches the cache key: one
      request for a word rather than one per letter, and a slow answer for "so"
      cannot land on top of the rows for "sony". */
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);
  // Nine a page: three across, three down, as in the design. On a wider
  // screen the grid adds columns instead of stretching the cards.
  const [pageSize, setPageSize] = useState(9);

  useEffect(() => {
    if (query === term) return;
    const id = window.setTimeout(() => {
      setTerm(query);
      setPage(1);
    }, 250);
    return () => window.clearTimeout(id);
  }, [query, term]);

  // The chips come from the catalogue, not from the products on this page —
  // with one page in hand, a category with nothing on it would simply vanish
  // from the row.
  const { data: categoryRows } = useQuery(queryKey("pos-categories"), () =>
    PosService.getCategories()
  );
  const categories = useMemo(
    () => [{ id: "", name: "All Categories" }, ...(categoryRows ?? [])],
    [categoryRows]
  );

  // SERVER-side, a page at a time. It used to ask for 60 products and search
  // them in the browser, so on a real catalogue the wall held the first 60 by
  // name and a cashier searching for anything after them was told there was no
  // such product — while the same product sat plainly on the stock screen.
  const {
    data,
    loading,
    fetching,
    error,
    refetch,
  } = useQuery(
    queryKey("pos-products", { page, limit: pageSize, search: term, category: categoryId }),
    () => PosService.getProducts({ page, limit: pageSize, search: term, categoryId }),
    { staleMs: 60_000 }
  );

  const products = data?.data;
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages);
  // The server already sliced. This is the page.
  const shown = products ?? [];

  /**
   * A scan, or Enter on a typed code: ring the product up.
   *
   * The wall holds 60 products and a shop has hundreds, so a code that is not
   * among them is asked for by name — `/products/lookup/` is the POS hot path
   * and answers on an exact barcode. Only if that finds nothing does the box
   * fall back to being a search box.
   */
  const submitScan = async () => {
    const code = query.trim();
    if (!code || scanning) return;

    const onTheWall = shown.find(
      (p) => p.barcode === code || p.sku.toLowerCase() === code.toLowerCase()
    );
    if (onTheWall) {
      onSelectProduct?.(onTheWall);
      setQuery("");
      setScanNote(`Added ${onTheWall.name}`);
      return;
    }

    setScanning(true);
    setScanNote(null);
    try {
      const found = await PosService.lookupBarcode(code);
      if (found) {
        onSelectProduct?.(found);
        setQuery("");
        setScanNote(`Added ${found.name}`);
      } else {
        // Not an error: the cashier may be typing a name, and the list below
        // is already filtered by what they typed.
        setScanNote(`No product carries the barcode ${code}.`);
      }
    } catch (err) {
      setScanNote(
        err instanceof Error && err.message ? err.message : "That barcode could not be looked up."
      );
    } finally {
      setScanning(false);
      // The next scan has to land somewhere, and a cashier never reaches for
      // the mouse between two items.
      searchRef.current?.focus();
    }
  };

  return (
    <div className="relative flex h-full w-full flex-col">
      <RefreshBar active={fetching} />
      {/* Search — 45:2172 */}
      <div className="flex h-[44px] w-full shrink-0 items-center justify-between overflow-clip rounded-[10px] bg-white px-[12px] py-[10px] shadow-[inset_0_0_0_1px_#eaeaea]">
        <div className="flex min-w-0 flex-1 items-center gap-[6px] text-[#525252]">
          <SearchIcon />
          <input
            ref={searchRef}
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setScanNote(null);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              void submitScan();
            }}
            disabled={scanning}
            placeholder="Scan a barcode, or search by name or SKU..."
            aria-label="Scan a barcode or search products"
            className="min-w-0 flex-1 bg-transparent text-[14px] leading-[1.5] font-normal tracking-[-0.28px] text-[#525252] outline-none placeholder:text-[#525252] disabled:opacity-60"
          />
        </div>
        <button
          type="button"
          // The scanner types wherever the cursor is, so "scan" means "put the
          // cursor back in the box". Pressed with something typed, it rings
          // that code up — the same thing Enter does.
          onClick={() => (query.trim() ? void submitScan() : searchRef.current?.focus())}
          disabled={scanning}
          aria-label={query.trim() ? "Look up this barcode" : "Scan barcode"}
          title={query.trim() ? "Look up this barcode" : "Ready to scan"}
          className="shrink-0 cursor-pointer text-[#525252] transition-colors hover:text-[#1e1e1e] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ScanIcon />
        </button>
      </div>

      {scanNote && (
        <p className="mt-[6px] shrink-0 text-[12px] leading-[1.4] tracking-[-0.24px] text-[#525252]">
          {scanNote}
        </p>
      )}

      {/* Categories — 45:2183, 16px below the search bar. The strip used to be
          a bare overflow-x scroller: on a till there is no comfortable way to
          drag a 4px horizontal scrollbar, and with a shop's real category list
          the tabs past the fold were invisible. */}
      <div className="mt-[16px] flex w-full shrink-0 items-center justify-between gap-[12px]">
        <ChipScroller className="h-[40px] min-w-0 flex-1" gap="gap-[2px]">
          {categories.map((c) => {
            const active = c.id === categoryId;
            return (
              <button
                key={c.id || "all"}
                type="button"
                onClick={() => {
                  setCategoryId(c.id);
                  setPage(1);
                }}
                className={`flex shrink-0 cursor-pointer items-center justify-center rounded-[10px] whitespace-nowrap transition-colors ${
                  active
                    ? "h-[40px] border-[0.8px] border-solid border-[#f5b800] px-[12px] py-[10px] text-[16px] leading-[1.2] tracking-[-0.48px] text-[#f5b800]"
                    : "p-[10px] text-[14px] leading-[1.2] tracking-[-0.42px] text-[#525252] hover:bg-[#fafafa]"
                }`}
              >
                {c.name}
              </button>
            );
          })}
        </ChipScroller>

        <button
          type="button"
          aria-label="More filters"
          className="flex size-[40px] shrink-0 cursor-pointer items-center justify-center overflow-clip rounded-[10px] border border-solid border-[#eaeaea] bg-white text-[#1e1e1e] shadow-[0px_1px_2px_0px_rgba(82,88,102,0.06)] transition-colors hover:bg-[#fafafa]"
        >
          <MoreIcon />
        </button>
      </div>

      {/* Grid — 45:2197, 24px below the category row */}
      <ProductPeek anchor={peeked} />

      <QueryBoundary
        loading={loading}
        error={error}
        hasData={products !== undefined}
        skeleton={
          <CardGridSkeleton
            count={pageSize}
            height={248}
            className="mt-[24px] grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-[12.5px] gap-y-[14px]"
          />
        }
        errorMessage="Could not load the product list."
        onRetry={refetch}
      >
      <div className="mt-[24px] grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-[12.5px] gap-y-[14px]">
        {shown.map((p) => {
          // The server refuses to sell what is not on the shelf, so the till
          // should not let a cashier add it and find out at payment.
          const soldOut = p.stock <= 0;
          const offer = rates[p.id];
          return (
          <button
            key={p.id}
            type="button"
            disabled={soldOut}
            // Hovering opens the details card beside the tile. Focus does the
            // same, so a keyboard reaches it too.
            onMouseEnter={(e) => peek(p, e.currentTarget)}
            onFocus={(e) => peek(p, e.currentTarget)}
            onMouseLeave={() => setPeeked(null)}
            onBlur={() => setPeeked(null)}
            onClick={() => onSelectProduct?.(p)}
            className={`flex items-center overflow-clip rounded-[10px] border-[0.6px] border-solid border-[#eaeaea] bg-white p-[10px] text-left transition-colors ${
              soldOut ? "cursor-not-allowed opacity-55" : "cursor-pointer hover:border-[#f5b800]"
            }`}
          >
            <div className="flex w-full flex-col items-center justify-center gap-[12px]">
              <div className="relative aspect-square w-full overflow-hidden rounded-[8px] border-[0.3px] border-solid border-[#eaeaea] bg-[#fafafa]">
                {p.image ? (
                  <ProductImage src={p.image} alt={p.name} sizes="180px" />
                ) : (
                  // Real products have no image yet, and an empty src makes the
                  // browser reload the page. Initials are enough to tell two
                  // products apart on a till.
                  <span
                    aria-hidden
                    className="flex h-full w-full items-center justify-center text-[22px] font-semibold text-[#c9c9c9]"
                  >
                    {initials(p.name)}
                  </span>
                )}
              </div>
              <div className="flex w-full flex-col items-start gap-[8px]">
                <p className="w-full truncate text-[14px] leading-[24px] font-normal text-[#525252]">
                  {p.name}
                </p>
                <div className="flex w-full flex-col items-start gap-[4px]">
                  <span className="flex min-w-0 max-w-full items-baseline gap-[6px]">
                    <span className="min-w-0 truncate text-[16px] leading-[24px] font-medium text-[#f5b800]">
                      {offer ? formatMoney(priceAfter(p.price, offer), { decimals: 2 }) : p.priceFormatted}
                    </span>
                    {offer && (
                      // The shelf price, struck through. A discounted figure
                      // with nothing beside it reads as the price going down
                      // rather than as an offer running.
                      <span className="shrink-0 text-[12px] leading-[16px] text-[#a3a3a3] line-through">
                        {p.priceFormatted}
                      </span>
                    )}
                  </span>
                  <span
                    className="flex h-[24px] shrink-0 items-center gap-[7px] rounded-[17px] px-[8px]"
                    style={{ backgroundColor: soldOut ? "#ffdfe2" : "#f5fff8" }}
                  >
                    <span
                      className="size-[6px] shrink-0 rounded-full"
                      style={{ backgroundColor: soldOut ? "#e63946" : "#00b837" }}
                    />
                    <span
                      className="text-[12px] leading-normal font-normal tracking-[-0.24px] whitespace-nowrap"
                      style={{ color: soldOut ? "#e63946" : "#00b837" }}
                    >
                      {soldOut ? "None left" : `Stock ${p.stock}`}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </button>
          );
        })}
      </div>

      {shown.length === 0 && (
        // A catalogue with nothing in it and a search that matched nothing are
        // different facts, and neither is the failure state above.
        <EmptyState
          message={
            term || categoryId
              ? "No products match that search."
              : "No products in the catalogue yet."
          }
          compact
        />
      )}
      </QueryBoundary>

      {/* Pagination — 45:2309. mt-auto pins it to the bottom of the column so it
          lines up with the pay buttons opposite. */}
      <div className="mt-auto pt-[14px]">
        <TablePagination
          dense
          sizes={[9, 18, 27, 54]}
          page={current}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
        />
      </div>
    </div>
  );
}

/** First letters of the first two words, standing in for a missing photo. */
function initials(name: string): string {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
