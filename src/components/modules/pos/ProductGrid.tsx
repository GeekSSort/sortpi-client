"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CartItem, ProductItem } from "@/types/pos";
import ProductPeek, { PeekAnchor } from "./ProductPeek";
import { PosService } from "@/services";
import ScrollEnd from "@/components/shared/ScrollEnd";
import { useQuery, queryKey } from "@/lib/query/useQuery";
import { useInfiniteRows } from "@/lib/query/useInfiniteRows";
import { CardGridSkeleton } from "@/components/shared/Skeleton";
import { QueryBoundary, RefreshBar, EmptyState } from "@/components/shared/QueryBoundary";
import ProductImage from "@/components/shared/ProductImage";
import VariantChip from "@/components/shared/VariantChip";
import ChipScroller from "@/components/shared/ChipScroller";
import { useProductDiscounts } from "@/lib/usePosDiscounts";
import ScannerPanel from "./ScannerStatus";
import PosToolbar, { BrowseMode } from "./PosToolbar";
import { readPosDraft } from "@/components/modules/pos/posCart";
import ScanResult, { ScanOutcome } from "./ScanResult";
import OutOfStockDialog from "./OutOfStockDialog";
import { beep, reportScanResult, useBarcodeScanner } from "./useBarcodeScanner";
import {
  connectSerialScanner,
  initSerialScanner,
  serialSupported,
  useSerialScanner,
} from "./useSerialScanner";
import { priceAfter } from "@/services/discountService";
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

/**
 * Codes this till has looked up, for the next half minute.
 *
 * A live deployment answers a barcode lookup over the internet, so the second
 * scan of the same product used to cost the same wait as the first. At a till
 * that is the ordinary case, not an edge one — six of the same item is six
 * scans.
 *
 * Thirty seconds, and the stock figure is what ages: a cached product carries
 * the count it had when it was fetched. That is deliberately STRICTER than the
 * product wall beside it, which holds its own figures for sixty
 * (`staleMs: 60_000`), and the server refuses to sell stock it does not have
 * whatever the till believes — so the worst a stale figure does is let a
 * cashier add a line the checkout then explains.
 *
 * Module scope, not state: it must survive the re-render a scan causes, and
 * nothing renders from it.
 */
const SCAN_CACHE_MS = 30_000;
const scanCache = new Map<string, { at: number; product: ProductItem }>();

function recentScan(code: string): ProductItem | undefined {
  const hit = scanCache.get(code);
  if (!hit) return undefined;
  if (Date.now() - hit.at > SCAN_CACHE_MS) {
    scanCache.delete(code);
    return undefined;
  }
  return hit.product;
}

function rememberScan(code: string, product: ProductItem): void {
  scanCache.set(code, { at: Date.now(), product });
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
  const queryRef = useRef("");
  const submitScanRef = useRef<(scannedCode?: string) => Promise<void>>(async () => {});
  const [scanning, setScanning] = useState(false);
  /** What became of the last scan. Rendered by ScanResult, which builds the
      "added" and "not in the catalogue" cases differently on purpose. */
  const [scanNote, setScanNote] = useState<ScanOutcome | null>(null);
  /** A scanned item the shelf does not have. Held out of the cart until the
      cashier has seen why. */
  const [outOfStock, setOutOfStock] = useState<ProductItem | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const serial = useSerialScanner();

  // What the Discounts screen set. Read here so the wall shows what the
  // customer will actually be charged — a rate that only appeared on the
  // screen that set it was an offer the shop could not see it was running.
  const rates = useProductDiscounts();

  /** "" is every category. Held as an ID, which is what the API filters on. */
  const [categoryId, setCategoryId] = useState("");
  /** "" is every brand. The API takes `brand` as an id, same as `category`. */
  const [brandId, setBrandId] = useState("");
  /**
   * What this column is showing: the wall, or the list behind Category/Brand.
   *
   * The toolbar's two buttons do not filter in place — they put a LIST where
   * the products were. A shop with sixty categories cannot pick one out of a
   * chip strip that scrolls past the fold, and picking one is the only reason
   * to open it, so choosing a row filters the wall and comes straight back.
   */
  const [browse, setBrowse] = useState<BrowseMode>("products");

  /**
   * Hide what the till cannot sell.
   *
   * The control beside the category strip was drawn from the Figma frame and
   * wired to nothing — a button on a till that does nothing when a cashier
   * taps it, with a customer waiting. It is now the filter it looks like.
   *
   * Applied to the page in hand rather than sent to the server: the wall is
   * already paginated server-side, and adding a stock predicate to the query
   * would make the page counts disagree with the pager beneath them. What a
   * cashier wants here is "stop showing me the greyed-out ones", and that is
   * exactly a view of this page.
   */
  const [inStockOnly, setInStockOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState("");
  /** The debounce settles the term before it reaches the cache key: one
      request for a word rather than one per letter, and a slow answer for "so"
      cannot land on top of the rows for "sony". */
  const [term, setTerm] = useState("");
  // Nine a page: three across, three down, as in the design. On a wider
  // screen the grid adds columns instead of stretching the cards.
  // Rows per request. Not a page size anyone picks — the wall scrolls.
  const pageSize = 24;

  /**
   * Changing what the column shows empties the search field.
   *
   * The field is labelled for whatever is on screen — "Search Brand" while the
   * brands are up — so text left in it from the previous list is a term the
   * new label does not describe, against rows it was never typed for.
   */
  const showBrowse = useCallback((next: BrowseMode) => {
    setBrowse(next);
    queryRef.current = "";
    setQuery("");
    setTerm("");
  }, []);

  useEffect(() => {
    // Only the wall searches the server. While a chooser is up the field is
    // labelled "Search Category" and filters the rows on screen, so letting it
    // through here would fire a product search per keystroke for a term that
    // was never about products — against a wall nobody is looking at.
    if (browse !== "products") return;
    if (query === term) return;
    const id = window.setTimeout(() => {
      setTerm(query);
    }, 250);
    return () => window.clearTimeout(id);
  }, [query, term, browse]);

  // The chips come from the catalogue, not from the products on this page —
  // with one page in hand, a category with nothing on it would simply vanish
  // from the row.
  const { data: categoryRows } = useQuery(queryKey("pos-categories"), () =>
    PosService.getCategories()
  );
  // The "everything" row is a PosGrouping like the rest so the chooser renders
  // one shape; its count is unused (see `isAll` where the card is drawn).
  const ALL_ROW = { productCount: 0, image: null, description: null };
  const categories = useMemo(
    () => [{ id: "", name: "All Categories", ...ALL_ROW }, ...(categoryRows ?? [])],
    // ALL_ROW is a literal rebuilt each render and is deliberately not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categoryRows]
  );

  // Only fetched once somebody opens the Brand list. A till that never uses
  // the button should not pay for the request on every screen.
  const { data: brandRows } = useQuery(
    queryKey("pos-brands"),
    () => PosService.getBrands(),
    { enabled: browse === "brands" }
  );
  const brands = useMemo(
    () => [{ id: "", name: "All Brands", ...ALL_ROW }, ...(brandRows ?? [])],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [brandRows]
  );

  /**
   * What the chooser shows: the list, narrowed by the search field.
   *
   * Filtered here rather than at the API, and against `query` rather than the
   * debounced `term`: both lists arrive whole (limit=200) and are a few dozen
   * rows, so this is a substring match over an array already in hand and the
   * results should keep up with the keystroke.
   *
   * The "everything" row survives the filter. It is how you clear the one you
   * picked, and a typo that hid it would strand a cashier on a filtered wall
   * with no visible way back.
   */
  const browseRows = useMemo(() => {
    const rows = browse === "categories" ? categories : brands;
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => r.id === "" || r.name.toLowerCase().includes(needle));
  }, [browse, categories, brands, query]);

  // SERVER-side, a page at a time. It used to ask for 60 products and search
  // them in the browser, so on a real catalogue the wall held the first 60 by
  // name and a cashier searching for anything after them was told there was no
  // such product — while the same product sat plainly on the stock screen.
  const {
    rows: products,
    total,
    loading,
    loadingMore,
    fetching,
    error,
    hasMore,
    sentinelRef,
    refetch,
  } = useInfiniteRows(
    queryKey("pos-products", { search: term, category: categoryId, brand: brandId }),
    (p, limit) => PosService.getProducts({ page: p, limit, search: term, categoryId, brandId }),
    { pageSize, staleMs: 60_000 }
  );
  // The server already sliced. This is the page, less anything the "in stock
  // only" filter hides.
  const shown = useMemo(() => {
    const page = products ?? [];
    return inStockOnly ? page.filter((p) => p.stock > 0) : page;
  }, [products, inStockOnly]);

  /**
   * A scan, or Enter on a typed code: ring the product up.
   *
   * The wall holds 60 products and a shop has hundreds, so a code that is not
   * among them is asked for by name — `/products/lookup/` is the POS hot path
   * and answers on an exact barcode. Only if that finds nothing does the box
   * fall back to being a search box.
   */
  /**
   * Choose a category or a brand: filter the wall and go back to it, because
   * filtering is the only reason the list was opened.
   *
   * Shared by the card and by Enter in the search field, so the two cannot
   * drift into doing different things.
   */
  const pickBrowseRow = useCallback(
    (id: string) => {
      if (browse === "categories") setCategoryId(id);
      else if (browse === "brands") setBrandId(id);
      showBrowse("products");
      // A USB scanner sends keystrokes to the focused element; the field has
      // to be ready again the moment the wall is.
      searchRef.current?.focus();
    },
    [browse, showBrowse]
  );

  const clearScanNote = useCallback(() => setScanNote(null), []);

  /**
   * Put the cursor back in the search box after a scan — unless a dialog has it.
   *
   * A cashier never reaches for the mouse between two items, so the next scan
   * has to land somewhere sensible. But the scanner panel and the customer
   * dialog have fields of their own, and yanking focus out of one mid-sentence
   * is worse than the problem this solves.
   */
  const refocusSearch = () => {
    if (document.activeElement?.closest('[role="dialog"]')) return;
    searchRef.current?.focus();
  };

  const submitScan = async (scannedCode?: string) => {
    const code = (scannedCode ?? queryRef.current).trim();
    // NOT gated on `scanning`. A cashier scanning three items in two seconds
    // used to have the second and third dropped in silence while the first was
    // still being looked up — the queue kept moving and the customer paid for
    // one item. Each lookup is independent, so they can overlap.
    if (!code) return;

    /** Rings the product up, unless the shelf is empty. */
    const ring = (product: ProductItem) => {
      queryRef.current = "";
      setQuery("");
      if (product.stock <= 0) {
        // Out of stock is not a scanning failure, and it must not reach the
        // cart: the server refuses the sale at checkout, and finding that out
        // at the payment screen means unpicking a basket in front of a queue.
        setOutOfStock(product);
        setScanNote(null);
        reportScanResult(false, `${product.fullName} is out of stock`);
        beep(false);
        return;
      }
      onSelectProduct?.(product);
      setScanNote({ kind: "added", text: `Added ${product.fullName}` });
      reportScanResult(true, `Added ${product.fullName}`);
      beep(true);
    };

    /**
     * Three places the answer may already be, in order of how likely they are
     * at a real till. Every one of them rings the item up with NO network call.
     *
     * On a developer's machine the lookup takes a millisecond and none of this
     * matters. On a real deployment it is a round-trip over the internet, and
     * a cashier scanning six of the same thing waited for six of them — which
     * is what "the item appears a beat after the beep" was.
     *
     *   1. ALREADY IN THE BASKET. The commonest scan of all: multiples of one
     *      item. The product in hand is the one the cart is holding, price and
     *      all, so there is nothing to fetch.
     *   2. ON THE WALL. `products`, not `shown` — the "in stock only" filter is
     *      a view preference, and hiding a tile must not change what the
     *      scanner can find.
     *   3. SCANNED BEFORE on this till, within the last half minute.
     */
    const inCart = readPosDraft().items.find(
      (line: CartItem) =>
        line.product.barcode === code ||
        line.product.sku.toLowerCase() === code.toLowerCase()
    )?.product;
    const onTheWall = (products ?? []).find(
      (p) => p.barcode === code || p.sku.toLowerCase() === code.toLowerCase()
    );
    const known = inCart ?? onTheWall ?? recentScan(code);
    if (known) {
      ring(known);
      refocusSearch();
      return;
    }

    setScanning(true);
    setScanNote(null);
    try {
      const found = await PosService.lookupBarcode(code);
      if (found) {
        rememberScan(code, found);
        ring(found);
      } else {
        // Not an error: the cashier may be typing a name, and the list below
        // is already filtered by what they typed.
        setScanNote({ kind: "missing", code });
        reportScanResult(false, `No product carries the barcode ${code}.`);
        beep(false);
      }
    } catch (err) {
      const message =
        err instanceof Error && err.message ? err.message : "That barcode could not be looked up.";
      setScanNote({ kind: "error", text: message });
      reportScanResult(false, message);
      beep(false);
    } finally {
      setScanning(false);
      refocusSearch();
    }
  };
  useEffect(() => {
    submitScanRef.current = submitScan;
  });

  /**
   * One detector for the whole till, wherever the cursor is.
   *
   * This used to be two heuristics that did not agree: a global listener that
   * gave up the moment focus was in ANY text field, and a rapid-keystroke guess
   * inside the search box. So a scan landed in the cart's customer search — or
   * in the discount box — as text, and the item was never rung up. See
   * useBarcodeScanner.ts, which takes the burst back off whichever field caught
   * it and works with any scanner in keyboard mode.
   */
  useBarcodeScanner((code) => void submitScanRef.current(code));

  /**
   * And the scanners that speak down a serial port instead of typing.
   *
   * Same destination, different road. A scanner in USB Virtual COM mode writes
   * its bytes to a port and types nothing at all, so the reader above hears
   * silence while the scanner beeps — the till looks broken and the hardware is
   * fine. Reconnects on its own to a port the shop has already granted, so the
   * click is one-time. See useSerialScanner.ts.
   */
  useEffect(() => initSerialScanner((code) => void submitScanRef.current(code)), []);

  return (
    <div className="relative flex h-full w-full flex-col">
      <RefreshBar active={fetching} />
      {/* The product column's toolbar — Figma 6:890. Search, Scan, Category,
          Brand and notifications on one 12px-gap row.

          It replaced a 44px search field with the scanner pill and a connect
          button beside it. The scanner's state did not go with them: it is the
          dot on Scan, and the panel behind that button is still where a device
          is connected and disconnected. */}
      <PosToolbar
        query={query}
        onQueryChange={(next) => {
          queryRef.current = next;
          setQuery(next);
          clearScanNote();
        }}
        onSubmit={() => {
          if (browse === "products") {
            void submitScanRef.current();
            return;
          }
          // Enter on a narrowed list takes the first row that is not the
          // "everything" one — pressing Enter to mean "all brands" is not
          // what anyone types a name to do.
          const first = browseRows.find((r) => r.id !== "");
          if (first) pickBrowseRow(first.id);
        }}
        searchRef={searchRef}
        scanning={scanning}
        browse={browse}
        onBrowseChange={showBrowse}
        scannerConnected={serial.status === "connected"}
        onOpenScanner={() => {
          // The panel ALWAYS opens. It used to `return` after firing
          // `requestPort()` when no scanner was attached — one press instead
          // of two, which reads well until you notice what it costs: on any
          // desktop Chrome (every one of which supports Web Serial) the button
          // opened a device chooser and nothing else, so somebody with no
          // serial scanner — a shop using a keyboard-wedge reader, or none —
          // could not reach the panel AT ALL. The beep volume, the scanner
          // help and the manual code box all live in there.
          //
          // The connect still happens on the same press, because `requestPort`
          // needs a real user gesture and this is one; it just no longer
          // stands in the way of the panel. "Connect scanner" inside the panel
          // remains for a second attempt.
          if (serial.status !== "connected" && serialSupported()) {
            void connectSerialScanner();
          }
          setScannerOpen(true);
        }}
      />

      <ScannerPanel
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onSubmitCode={(code) => submitScanRef.current(code)}
      />

      <ScanResult outcome={scanNote} onDismiss={clearScanNote} />

      <OutOfStockDialog
        // Keyed by the product, so the form starts empty for each one. A
        // remount is the reset — the last item's quantity and cost must not be
        // sitting in the boxes when the next thing is scanned, and clearing
        // them from an effect is writing state during render by another name.
        key={outOfStock?.id ?? "none"}
        product={outOfStock}
        onClose={() => setOutOfStock(null)}
        // Counted in, so the stock is real now — and the customer is still
        // standing there holding it. Ringing it up is the reason they scanned.
        onRestocked={(product) => {
          setOutOfStock(null);
          onSelectProduct?.(product);
          setScanNote({ kind: "added", text: `Counted in and added ${product.fullName}` });
          beep(true);
        }}
      />

      {/* The chip strip and the wall are the products view. Category and
          Brand replace them rather than sitting above them: two ways to
          pick a category, both on screen, is two things to keep in step. */}
      {browse === "products" && (
        <>
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

        <div className="relative shrink-0">
          <button
            type="button"
            aria-label="More filters"
            aria-expanded={filtersOpen}
            aria-haspopup="true"
            onClick={() => setFiltersOpen((open) => !open)}
            className={`flex size-[40px] shrink-0 cursor-pointer items-center justify-center overflow-clip rounded-[10px] border border-solid bg-white shadow-[0px_1px_2px_0px_rgba(82,88,102,0.06)] transition-colors hover:bg-[#fafafa] ${
              inStockOnly
                ? "border-[#f5b800] text-[#f5b800]"
                : "border-[#eaeaea] text-[#1e1e1e]"
            }`}
          >
            <MoreIcon />
          </button>

          {filtersOpen && (
            <>
              {/* Tap anywhere else to close. Behind the panel, so the panel's
                  own taps still land. */}
              <div
                aria-hidden
                onClick={() => setFiltersOpen(false)}
                className="fixed inset-0 z-20"
              />
              <div
                role="dialog"
                aria-label="Filters"
                className="absolute top-[46px] right-0 z-30 w-[220px] rounded-[10px] border border-solid border-[#eaeaea] bg-white p-[12px] shadow-[0_8px_20px_-6px_rgba(16,24,40,0.12)]"
              >
                <label className="flex cursor-pointer items-center justify-between gap-[12px] text-[13px] leading-[1.4] text-[#1e1e1e]">
                  <span>In stock only</span>
                  <input
                    type="checkbox"
                    checked={inStockOnly}
                    onChange={(e) => setInStockOnly(e.target.checked)}
                    className="size-[18px] shrink-0 accent-[#f5b800]"
                  />
                </label>
                <p className="mt-[8px] text-[12px] leading-[1.4] text-[#737373]">
                  Hides what the till cannot sell on this page.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

        </>
      )}

      {/* Category / Brand — what the toolbar's buttons put in place of the
          wall. The SAME card as a product: same grid track, same 10px radius
          and hairline, same square tile over a name — a chooser that looked
          like a different screen made picking a category feel like leaving the
          till. Under the name is what you actually choose on: how many
          products are in there. Picking one filters the wall and returns to
          it, because filtering is the only reason the list was opened. */}
      {browse !== "products" && (
        <div className="mt-[24px] flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-[12.5px] gap-y-[14px]">
            {browseRows.map((row) => {
              const selected = row.id === (browse === "categories" ? categoryId : brandId);
              // "All" carries no count of its own — it is every product on the
              // wall, which the pager under the wall already states.
              const isAll = row.id === "";
              return (
                <button
                  key={row.id || "all"}
                  type="button"
                  onClick={() => pickBrowseRow(row.id)}
                  className={`flex cursor-pointer items-center overflow-clip rounded-[10px] border-[0.6px] border-solid bg-white p-[10px] text-left transition-colors ${
                    selected ? "border-[#f5b800]" : "border-[#eaeaea] hover:border-[#f5b800]"
                  }`}
                >
                  <div className="flex w-full flex-col items-center justify-center gap-[12px]">
                    <div className="relative aspect-square w-full overflow-hidden rounded-[8px] border-[0.3px] border-solid border-[#eaeaea] bg-[#fafafa]">
                      {row.image ? (
                        <ProductImage src={row.image} alt={row.name} sizes="180px" />
                      ) : (
                        // Categories and brands almost never carry artwork.
                        // Initials are what the product tiles already fall back
                        // to, so an imageless wall and an imageless chooser
                        // look like one system rather than two.
                        <span
                          aria-hidden
                          className="flex h-full w-full items-center justify-center text-[22px] font-semibold text-[#c9c9c9]"
                        >
                          {isAll ? "ALL" : initials(row.name)}
                        </span>
                      )}
                    </div>
                    <div className="flex w-full flex-col items-start gap-[4px]">
                      <p
                        className={`w-full truncate text-[14px] leading-[24px] ${
                          selected ? "font-medium text-[#f5b800]" : "font-normal text-[#525252]"
                        }`}
                      >
                        {row.name}
                      </p>
                      <p className="w-full truncate text-[12px] leading-[1.4] text-[#737373]">
                        {isAll
                          ? browse === "categories"
                            ? "Every category"
                            : "Every brand"
                          : `${row.productCount} ${row.productCount === 1 ? "product" : "products"}`}
                      </p>
                      {row.description && (
                        <p className="w-full truncate text-[12px] leading-[1.4] text-[#a3a3a3]">
                          {row.description}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* An empty answer is not a loading one. A catalogue with no brands
              at all is a real state, and it must not read as a wall that
              failed to arrive. */}
          {browseRows.length <= 1 && (
            <p className="mt-[12px] text-[13px] leading-[1.4] text-[#666]">
              {query.trim()
                ? `Nothing matching “${query.trim()}”.`
                : browse === "categories"
                  ? "No categories yet."
                  : "No brands yet."}
            </p>
          )}
        </div>
      )}

      {browse === "products" && (
        <>
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
            onClick={() => {
              onSelectProduct?.(p);
              // USB scanners such as the Yumite YT-100 send keystrokes to the
              // focused element. Keep the scan field ready after a sale.
              searchRef.current?.focus();
            }}
            className={`flex items-center overflow-clip rounded-[10px] border-[0.6px] border-solid border-[#eaeaea] bg-white p-[10px] text-left transition-colors ${
              soldOut ? "cursor-not-allowed opacity-55" : "cursor-pointer hover:border-[#f5b800]"
            }`}
          >
            <div className="flex w-full flex-col items-center justify-center gap-[12px]">
              <div className="relative aspect-square w-full overflow-hidden rounded-[8px] border-[0.3px] border-solid border-[#eaeaea] bg-[#fafafa]">
                {p.image ? (
                  <ProductImage src={p.image} alt={p.fullName} sizes="180px" />
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
                <div className="w-full min-w-0">
                  <p className="w-full truncate text-[14px] leading-[24px] font-normal text-[#525252]">
                    {p.name}
                  </p>
                  {/* Which one of it. Shown only when the product HAS more than
                      the one unnamed variant — see `labelFor` — so a shop that
                      sells one size of everything gets the tile it always had,
                      and a shop selling 250ml beside 1L can tell two tiles
                      carrying the same product name apart. Without this the
                      wall showed "Coca-Cola" three times over. */}
                  {p.variantLabel && (
                    <span className="mt-[2px] flex w-full min-w-0">
                      <VariantChip label={p.variantLabel} />
                    </span>
                  )}
                </div>
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
            // The filter hides rows the SERVER counted, so a page can empty
            // out while the pager beneath still reads "1-9 of 240". Saying
            // which of the two emptied it is the difference between a filter
            // and a fault.
            inStockOnly && (products?.length ?? 0) > 0
              ? "Everything on this page is out of stock."
              : term || categoryId
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
        <ScrollEnd
          sentinelRef={sentinelRef}
          hasMore={hasMore}
          loadingMore={loadingMore}
          shown={(products ?? []).length}
          total={total}
          noun="products"
        />
      </div>
        </>
      )}
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
