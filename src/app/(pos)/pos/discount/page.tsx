"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ProductImage from "@/components/shared/ProductImage";
import ChipScroller from "@/components/shared/ChipScroller";
import { ProductItem } from "@/types/pos";
import { DiscountService, PosService, SettingsService } from "@/services";
import { useSession } from "@/services/useSession";
import { useQuery, queryKey, invalidate } from "@/lib/query/useQuery";
import { RefreshBar } from "@/components/shared/QueryBoundary";
import TableSkeleton from "@/components/shared/TableSkeleton";
import {
  Discount,
  DiscountMap,
  DiscountMode,
  amountOff,
  capped,
  effectivePercent,
  priceAfter,
} from "@/lib/posDiscounts";

/**
 * POS Discount — what comes off which product.
 *
 * Four bands, top to bottom: what the offers add up to, the controls that find
 * a product, the products themselves as a table, and the pager. Only the table
 * scrolls — its head stays put and so do the figures and the search, so a
 * shopkeeper can work down a long catalogue without losing either.
 *
 * A rate can be set on one product, on several at once, or on a whole
 * category. It is kept per branch on this device and is honoured by this till;
 * the catalogue has nowhere to store a product discount yet.
 */

/** The shop's ceiling, from Settings, until it is read. */
const FALLBACK_CAP = 100;
/** The permission that separates setting a rate from reading one. */
const EDIT_PERMISSION = "pos.manual_discount";

type SortKey = "name" | "price-desc" | "price-asc" | "discount-desc" | "stock-asc";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name (A–Z)" },
  { key: "discount-desc", label: "Biggest discount" },
  { key: "price-desc", label: "Price: high to low" },
  { key: "price-asc", label: "Price: low to high" },
  { key: "stock-asc", label: "Stock: low first" },
];

/** Tick · Product · Category · Price · Discount · Sells at · Stock · Action */
const ROW =
  "grid grid-cols-[34px_minmax(180px,1fr)_120px_100px_110px_110px_100px_52px] items-center gap-[8px]";

/**
 * Run a pile of writes a few at a time, and stop at the first failure.
 *
 * `Promise.all` over the whole list starts every request at once. That was
 * fine while the only bulk action was a page of sixteen; pricing a whole
 * catalogue is hundreds, and a browser will not open hundreds of connections —
 * it queues them, so the tail waits anyway while the API takes the burst.
 *
 * Eight keeps the connection pool busy and is small enough that a failure is
 * noticed after eight wasted requests rather than six hundred. The screen
 * reloads the server's answer on failure either way, so stopping early leaves
 * less to reconcile, not more.
 */
async function runInBatches<T>(thunks: (() => Promise<T>)[], size = 8): Promise<void> {
  for (let i = 0; i < thunks.length; i += size) {
    await Promise.all(thunks.slice(i, i + size).map((run) => run()));
  }
}

const money = (n: number) => `৳${Math.round(n).toLocaleString("en-IN")}`;

/* ── Icons ─────────────────────────────────────────────────────────────── */

function SearchIcon() {
  return (
    <svg className="block size-[20px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="10.5" cy="10.5" r="7.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 16L21 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function TagIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      className="block shrink-0"
      style={{ width: size, height: size }}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
    >
      <path
        d="M3 8.5V4a1 1 0 0 1 1-1h4.5a1 1 0 0 1 .7.3l7.5 7.5a1 1 0 0 1 0 1.4l-4.5 4.5a1 1 0 0 1-1.4 0L3.3 9.2a1 1 0 0 1-.3-.7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="6.75" cy="6.75" r="1.15" fill="currentColor" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="block size-[14px] shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="block size-[12px] shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3.5 8.5l3 3 6-6.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg className="block size-[15px] shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M11.2 2.3a1.4 1.4 0 0 1 2 2l-7 7-2.7.7.7-2.7 7-7Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg className="block size-[16px] shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 8a5 5 0 1 1 1.6 3.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M2.5 4.5V8H6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ── Small pieces ──────────────────────────────────────────────────────── */

/** The square that says a product is picked. */
function Tick({ on }: { on: boolean }) {
  return (
    <span
      className={`flex size-[18px] items-center justify-center rounded-[5px] transition-colors ${
        on ? "bg-[#f5b800] text-white" : "bg-white text-transparent shadow-[inset_0_0_0_1.5px_#d4d4d4]"
      }`}
    >
      <CheckIcon />
    </span>
  );
}

/* ── The page ──────────────────────────────────────────────────────────── */

export default function PosDiscountPage() {
  const { user, loading: sessionLoading } = useSession();

  // The same catalogue key the till's product wall reads, so opening Discount
  // after the till costs no request and shows no skeleton.
  const {
    data: productRows,
    loading,
    fetching,
    error,
    // The whole catalogue, not a page of it: this screen sorts by biggest
    // discount and by stock, and neither can be answered a page at a time. Its
    // own cache key, because the till's wall is now one page per request and
    // the two answers are different shapes.
  } = useQuery(queryKey("pos-products", { all: true }), () => PosService.getAllProducts(), {
    staleMs: 60_000,
  });
  const products = useMemo(() => productRows ?? [], [productRows]);
  const failed = error !== undefined;

  const { data: shopValues } = useQuery(
    queryKey("settings", { scope: "values" }),
    () => SettingsService.getValues(),
    { staleMs: 5 * 60_000 }
  );
  // The shop's ceiling on what a till may give away, as a percentage.
  const cap = useMemo(() => {
    const max = Number(shopValues?.["pos.max_discount_percent"]);
    return Number.isFinite(max) && max > 0 ? Math.round(max * 100) : FALLBACK_CAP;
  }, [shopValues]);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All Categories");
  const [offersOnly, setOffersOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("name");

  const [rates, setRates] = useState<DiscountMap>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  /** One product or several: what the rate card is about to change. */
  const [editing, setEditing] = useState<ProductItem[] | null>(null);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<DiscountMode>("percent");

  /** The set before the last sweeping change, so it can be put back. */
  const [undoState, setUndo] = useState<{ rates: DiscountMap; what: string } | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // An empty list means the call for the session failed; that must not lock a
  // cashier out of a page the server would have let them use.
  const readOnly =
    !sessionLoading &&
    !!user &&
    user.permissions.length > 0 &&
    !user.permissions.includes(EDIT_PERMISSION);

  /**
   * The offers, from the server.
   *
   * They used to be read out of this browser's localStorage — which is exactly
   * why an offer set here was invisible to the till in the next room. The map
   * arrives keyed by variant, which is what this screen keys by too.
   */
  const { data: serverRates, refetch: refetchRates } = useQuery(
    queryKey("discounts"),
    () => DiscountService.map(),
    { staleMs: 60_000 }
  );

  // Server data seeding locally EDITABLE state. The screen applies a rate card
  // optimistically and reconciles on failure, so it cannot render straight off
  // the query — and the rule cannot tell that case from the derived-state
  // mistake it exists for.
  useEffect(() => {
    if (!serverRates) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRates(
      Object.fromEntries(
        Object.entries(serverRates).map(([variantId, offer]) => [
          variantId,
          { mode: offer.mode === "FLAT" ? "flat" : "percent", value: offer.value } as Discount,
        ])
      )
    );
  }, [serverRates]);

  useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);

  /** "/" reaches the search from anywhere on the page, as a till expects. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /**
   * Save a whole map by writing only what CHANGED.
   *
   * The screen thinks in a map — it edits several products at once, and clears
   * the lot — while the API is one product at a time, which is the right shape
   * for an offer that has to be audited and scoped to a branch. So the diff
   * happens here: set what is new or different, clear what has gone.
   *
   * Applied optimistically, then reconciled. A rate card that waits for a round
   * trip per product before showing anything makes bulk edits feel broken; a
   * failure puts the server's answer back.
   */
  const persist = useCallback(
    (next: DiscountMap) => {
      const before = rates;
      setRates(next);

      const byId = new Map(products.map((p) => [p.id, p]));
      const touched = new Set([...Object.keys(before), ...Object.keys(next)]);
      /**
       * Thunks, not promises.
       *
       * Calling `DiscountService.set(...)` inside the loop STARTS the request
       * there and then, so pricing a whole catalogue would fire one fetch per
       * product all at once — hundreds the moment somebody uses "Price all". A
       * browser queues past six per host and the API sees a burst it has no
       * reason to absorb. Deferring the call lets them run in batches below.
       */
      const writes: (() => Promise<unknown>)[] = [];

      touched.forEach((variantId) => {
        const product = byId.get(variantId);
        if (!product) return;
        const was = before[variantId];
        const now = next[variantId];
        // A zero is not an offer, and the API refuses one — "A discount must be
        // greater than zero. Remove it instead." An unpriced product reaches
        // here with exactly that: `capped()` works a flat amount out as a share
        // of the price, and a share of nothing is nothing. Applying a flat
        // discount to a selection containing one unpriced product failed the
        // whole batch on its account.
        if (now && now.value <= 0) {
          if (was) writes.push(() => DiscountService.clear(product.productId, { variantId }));
          delete next[variantId];
          return;
        }
        if (now && (!was || was.mode !== now.mode || was.value !== now.value)) {
          writes.push(() =>
            DiscountService.set(product.productId, {
              mode: now.mode === "flat" ? "FLAT" : "PERCENT",
              value: now.value,
              variantId,
            })
          );
        } else if (!now && was) {
          writes.push(() => DiscountService.clear(product.productId, { variantId }));
        }
      });

      if (writes.length === 0) return;
      void runInBatches(writes)
        .then(() => {
          // The till's wall prices its tiles by this, and the products table
          // shows it: both read the same key.
          invalidate("discounts", "pos-products", "inventory");
        })
        .catch((err) => {
          // "Not everything saved: Validation failed." named nothing a
          // shopkeeper could act on. The API puts the reason in `errors`,
          // keyed by field, and it was being thrown away.
          setSaveError(`Not everything saved: ${DiscountService.describeError(err)}`);
          void refetchRates();
        });
    },
    [products, rates, refetchRates]
  );

  /** A change big enough to regret: keep the old set for a few seconds. */
  const persistUndoable = useCallback(
    (next: DiscountMap, what: string) => {
      const before = rates;
      persist(next);
      setUndo({ rates: before, what });
      if (undoTimer.current) clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setUndo(null), 12000);
    },
    [persist, rates]
  );

  const undo = () => {
    if (!undoState) return;
    persist(undoState.rates);
    setUndo(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
  };

  // Built from the catalogue, not from a fixed list: the old four tabs matched
  // none of the real categories, so every filter came back empty.
  const categories = useMemo(() => {
    const found = Array.from(new Set(products.map((p) => p.category).filter(Boolean)));
    found.sort();
    return ["All Categories", ...found];
  }, [products]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = products.filter(
      (p) =>
        (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)) &&
        (category === "All Categories" || p.category === category) &&
        (!offersOnly || !!rates[p.id])
    );
    const by: Record<SortKey, (a: ProductItem, b: ProductItem) => number> = {
      name: (a, b) => a.name.localeCompare(b.name),
      "price-desc": (a, b) => b.price - a.price,
      "price-asc": (a, b) => a.price - b.price,
      "discount-desc": (a, b) =>
        effectivePercent(b.price, rates[b.id]) - effectivePercent(a.price, rates[a.id]),
      "stock-asc": (a, b) => a.stock - b.stock,
    };
    return [...out].sort(by[sort]);
  }, [products, query, category, offersOnly, rates, sort]);

  // Everything the filters left, in a list that scrolls.
  const shown = visible;

  /** What the offers add up to, across the whole catalogue. */
  const summary = useMemo(() => {
    const priced = products.filter((p) => rates[p.id]);
    const offSum = priced.reduce((n, p) => n + amountOff(p.price, rates[p.id]), 0);
    const pctSum = priced.reduce((n, p) => n + effectivePercent(p.price, rates[p.id]), 0);
    let deepest: { p: ProductItem; pct: number } | null = null;
    for (const p of priced) {
      const pct = effectivePercent(p.price, rates[p.id]);
      if (!deepest || pct > deepest.pct) deepest = { p, pct };
    }
    return {
      count: Object.keys(rates).length,
      average: priced.length ? pctSum / priced.length : 0,
      offSum,
      deepest,
    };
  }, [products, rates]);

  /* ── Picking ─────────────────────────────────────────────────────────── */

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /**
   * Everything the current filters match — which is now the same list the
   * table renders, and that is why the "page" language is gone.
   *
   * The head tick used to take a PAGE of sixteen while looking like it had
   * taken the shop, and the fix at the time was a second control beside it:
   * "All 16 on this page. Select all 30." Then the pager went and the table
   * became one scrolling list, so `shown` and `visible` are the same rows —
   * `visible.length > shown.length` could never be true again, and that escape
   * hatch was unreachable code sitting under a comment explaining a defect
   * that no longer exists. The tick now means what everybody always read it to
   * mean.
   */
  const visibleIds = useMemo(() => visible.map((p) => p.id), [visible]);
  const allMatchingPicked =
    visibleIds.length > 0 && visibleIds.every((id) => picked.has(id));

  const toggleAllMatching = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (allMatchingPicked) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });

  const pickedProducts = useMemo(() => products.filter((p) => picked.has(p.id)), [products, picked]);

  /* ── Setting and clearing ────────────────────────────────────────────── */

  const openFor = (items: ProductItem[]) => {
    if (readOnly || items.length === 0) return;
    const first = items.length === 1 ? rates[items[0].id] : undefined;
    setMode(first?.mode ?? "percent");
    setDraft(first ? String(first.value) : "");
    setEditing(items);
  };

  const save = () => {
    if (!editing) return;
    const entered = Number(draft);
    const next = { ...rates };
    if (!draft.trim() || Number.isNaN(entered) || entered <= 0) {
      editing.forEach((p) => delete next[p.id]);
    } else {
      editing.forEach((p) => {
        next[p.id] = capped(p.price, { mode, value: entered }, cap);
      });
    }
    if (editing.length > 1) persistUndoable(next, `${editing.length} products changed`);
    else persist(next);
    setEditing(null);
    setPicked(new Set());
  };

  const removeOne = (id: string) => {
    if (readOnly) return;
    const next = { ...rates };
    delete next[id];
    persist(next);
  };

  const removePicked = () => {
    const next = { ...rates };
    let hit = 0;
    picked.forEach((id) => {
      if (next[id]) hit++;
      delete next[id];
    });
    persistUndoable(next, `${hit} discount${hit === 1 ? "" : "s"} removed`);
    setPicked(new Set());
  };

  const clearAll = () =>
    persistUndoable({}, `${summary.count} discount${summary.count === 1 ? "" : "s"} cleared`);

  /** The rate card's live figures — one product, or the pile. */
  const preview = useMemo(() => {
    if (!editing) return null;
    const d: Discount = { mode, value: Number(draft) || 0 };
    const rows = editing.map((p) => {
      const eff = capped(p.price, d, cap);
      return { p, off: amountOff(p.price, eff), after: priceAfter(p.price, eff) };
    });
    return {
      rows,
      off: rows.reduce((n, r) => n + r.off, 0),
      before: editing.reduce((n, p) => n + p.price, 0),
      overCap: editing.some((p) => effectivePercent(p.price, d) > cap + 0.001),
    };
  }, [editing, draft, mode, cap]);

  const activeFilters =
    (query.trim() ? 1 : 0) + (category !== "All Categories" ? 1 : 0) + (offersOnly ? 1 : 0);

  const resetFilters = () => {
    setQuery("");
    setCategory("All Categories");
    setOffersOnly(false);
  };

  const CHIP =
    "flex h-[34px] shrink-0 cursor-pointer items-center gap-[6px] rounded-[9px] px-[12px] text-[13px] font-medium whitespace-nowrap transition-colors";
  const HEAD = "text-[12px] leading-[16px] font-medium text-[#8f8d87]";

  return (
    // The same shell as Customers, Inventory and Purchases: a column that
    // flows and lets the PAGE scroll, not a full-height flex whose table
    // scrolls inside itself. The two behave differently under the same header
    // and that difference is most of why this screen read as a different
    // product.
    <div className="relative flex w-full flex-col gap-[14px]">
      <RefreshBar active={fetching} />
      {/* ── Headline row ───────────────────────────────────────────────
          One row, the same shape Customers / Inventory / Purchases use: a
          370px search box on the left, everything that acts on the list on the
          right, 48px tall on a wide screen. This screen used to carry TWO
          header rows — an action strip above a filter strip — which is why it
          did not line up with the pages either side of it in the sidebar. */}
      <div className="flex w-full flex-col gap-[10px]">
        <div className="flex w-full flex-col items-stretch gap-[16px] lg:h-[48px] lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:gap-[16px]">
          <div className="flex h-[44px] w-full items-center gap-[8px] rounded-[10px] bg-white px-[12px] shadow-[inset_0_0_0_1px_#eaeaea] focus-within:shadow-[inset_0_0_0_1.5px_#f5b800] lg:min-w-[220px] lg:max-w-[370px] lg:flex-1">
            <span className="text-[#8f8d87]">
              <SearchIcon />
            </span>
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
              onKeyDown={(e) => e.key === "Escape" && setQuery("")}
              placeholder="Search product by name or SKU…"
              aria-label="Search products"
              className="min-w-0 flex-1 bg-transparent text-[14px] tracking-[-0.28px] text-[#1e1e1e] outline-none placeholder:text-[#8f8d87]"
            />
            <kbd className="hidden shrink-0 rounded-[5px] bg-[#fafafa] px-[6px] py-[2px] text-[11px] text-[#8f8d87] shadow-[inset_0_0_0_1px_#eaeaea] sm:block">
              /
            </kbd>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-[10px]">
            {readOnly && (
              <span className="text-[12px] text-[#8f8d87]">
                You can see the shop&apos;s offers but not change them.
              </span>
            )}
            {saveError && (
              <span className="flex h-[44px] items-center rounded-[10px] bg-[#fef6f5] px-[12px] text-[13px] font-medium text-[#ef4444]">
                {saveError}
              </span>
            )}
            {undoState && (
              <button
                type="button"
                onClick={undo}
                className="sp-fade flex h-[44px] cursor-pointer items-center gap-[6px] rounded-[10px] bg-[#1e1e1e] px-[12px] text-[13px] font-medium text-white transition-opacity hover:opacity-90"
              >
                <UndoIcon />
                Undo — {undoState.what}
              </button>
            )}
            {!readOnly && summary.count > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="flex h-[44px] cursor-pointer items-center rounded-[10px] border border-solid border-[#eaeaea] bg-white px-[14px] text-[13px] font-medium text-[#525252] transition-colors hover:border-[#e63946] hover:text-[#e63946]"
              >
                Clear all
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setOffersOnly((v) => !v);
              }}
              aria-pressed={offersOnly}
              className={`${CHIP} h-[44px] ${
                offersOnly
                  ? "bg-[#fdf7e6] text-[#f5b800] shadow-[inset_0_0_0_1px_#f5b800]"
                  : "bg-white text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] hover:text-[#1e1e1e]"
              }`}
            >
              <TagIcon size={15} />
              On offer
              <span
                className={`rounded-[5px] px-[5px] py-[1px] text-[11px] tabular-nums ${
                  offersOnly ? "bg-[#f5b800] text-white" : "bg-[#fafafa] text-[#8f8d87]"
                }`}
              >
                {summary.count}
              </span>
            </button>

            <label className="flex h-[44px] shrink-0 items-center gap-[8px] rounded-[10px] bg-white pr-[10px] pl-[12px] shadow-[inset_0_0_0_1px_#eaeaea]">
              <span className="text-[12px] text-[#8f8d87]">Sort</span>
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as SortKey);
                }}
                aria-label="Sort products"
                className="cursor-pointer bg-transparent text-[13px] font-medium text-[#1e1e1e] outline-none"
              >
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            {activeFilters > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="flex h-[44px] shrink-0 cursor-pointer items-center gap-[5px] rounded-[10px] px-[10px] text-[12px] font-medium text-[#8f8d87] transition-colors hover:text-[#e63946]"
              >
                <CloseIcon />
                Reset filters
              </button>
            )}
          </div>
        </div>

        {/* Categories. A bare overflow-x strip is a scrollbar a till's touch
            screen has no comfortable way to drag and a mouse cannot see, so
            the arrows do the moving and hide themselves at each end. */}
        <ChipScroller>
          {categories.map((c) => {
            const on = c === category;
            const n =
              c === "All Categories"
                ? products.length
                : products.filter((p) => p.category === c).length;
            return (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setCategory(c);
                }}
                aria-pressed={on}
                className={`${CHIP} ${
                  on
                    ? "bg-[#fdf7e6] text-[#f5b800] shadow-[inset_0_0_0_1px_#f5b800]"
                    : "bg-white text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] hover:text-[#1e1e1e]"
                }`}
              >
                {c}
                <span className="text-[11px] text-[#a3a3a3] tabular-nums">{n}</span>
              </button>
            );
          })}
        </ChipScroller>
      </div>
      {/* ── The table ──────────────────────────────────────────────────── */}
      <div className="relative flex w-full flex-col overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
        {/* What is picked, and what can be done to it — above the head so it
            never scrolls away mid-selection. */}
        {!readOnly && !loading && visible.length > 0 && (
          <div
            className={`flex flex-wrap items-center gap-[10px] border-b border-solid px-[12px] py-[8px] ${
              picked.size > 0 ? "border-[#f7e3a1] bg-[#fdf7e6]" : "border-[#eaeaea] bg-white"
            }`}
          >
            {picked.size === 0 ? (
              <span className="text-[12px] text-[#8f8d87]">
                {visible.length} product{visible.length === 1 ? "" : "s"}
                {category !== "All Categories" ? ` in ${category}` : ""} — tick a few to price them
                together.
              </span>
            ) : (
              <>
                <span className="text-[13px] font-medium text-[#1e1e1e] tabular-nums">
                  {picked.size} selected
                </span>
                <button
                  type="button"
                  onClick={() => openFor(pickedProducts)}
                  className="flex h-[30px] cursor-pointer items-center rounded-[8px] bg-[#f5b800] px-[12px] text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Set discount
                </button>
                <button
                  type="button"
                  onClick={removePicked}
                  className="flex h-[30px] cursor-pointer items-center rounded-[8px] bg-white px-[10px] text-[12px] font-medium text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] transition-colors hover:text-[#e63946]"
                >
                  Remove discount
                </button>
                <button
                  type="button"
                  onClick={() => setPicked(new Set())}
                  className="cursor-pointer text-[12px] font-medium text-[#8f8d87] transition-colors hover:text-[#1e1e1e]"
                >
                  Clear selection
                </button>
              </>
            )}

            {/* The tick at the head of the table selects THIS PAGE — sixteen
                products — and nothing said so where it could be read. The one
                control that priced more than a page was this button, and it
                was hidden unless a category had been chosen: in the "All
                Categories" view, the view somebody uses to price the whole
                shop, there was no way to do it at all. Ticking the header and
                setting 5% looked like it had, and had priced sixteen.

                So it is offered whenever nothing is selected, and it prices
                what the filters MATCH — the same number quoted beside it —
                rather than a category, which ignored the search box. */}
            {picked.size === 0 && (
              <button
                type="button"
                onClick={() => openFor(visible)}
                className="ml-auto flex h-[30px] shrink-0 cursor-pointer items-center rounded-[8px] bg-white px-[10px] text-[12px] font-medium text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] transition-colors hover:text-[#f5b800]"
              >
                Price all {visible.length}
                {category !== "All Categories" ? ` in ${category}` : ""}
              </button>
            )}
          </div>
        )}

        {/* One scroller for head and rows together, so the columns stay in
            step when the table is wider than the window — and for both
            directions, so the head can be pinned while the rows move under it.

            It carries the vertical overflow again now that the pager is gone:
            every discount renders, and the table holds its place on screen
            instead of growing the page. Which is what every other list screen
            does since the same change. */}
        <div className="table-scroll">
          <div className="min-w-[880px]">
            <div
              className={`table-head ${ROW} border-b border-solid border-[#eaeaea] bg-[#fafafa] px-[12px] py-[10px]`}
            >
              <button
                type="button"
                onClick={toggleAllMatching}
                disabled={readOnly || shown.length === 0}
                aria-label="Select every product the filters match"
                title="Select every product shown"
                className="not-disabled:cursor-pointer disabled:opacity-0"
              >
                <Tick on={allMatchingPicked} />
              </button>
              <span className={HEAD}>Product</span>
              <span className={HEAD}>Category</span>
              <span className={`${HEAD} text-right`}>Price</span>
              <span className={`${HEAD} text-right`}>Discount</span>
              <span className={`${HEAD} text-right`}>Sells at</span>
              <span className={`${HEAD} text-right`}>Stock</span>
              <span />
            </div>

            {/* Sized to the ROW grid so the columns do not shift when the
                catalogue lands. */}
            {loading && (
              <div className="px-[12px]">
                <TableSkeleton columns={ROW} rows={8} />
              </div>
            )}

            {!loading && failed && (
              <p className="py-[48px] text-center text-[14px] text-[#e63946]">
                The product list could not be loaded. Refresh to try again.
              </p>
            )}

            {!loading && !failed && shown.length === 0 && (
              <div className="flex flex-col items-center gap-[10px] py-[56px]">
                <span className="flex size-[44px] items-center justify-center rounded-[12px] bg-[#fafafa] text-[#d4d4d4]">
                  <TagIcon size={22} />
                </span>
                <p className="text-[14px] text-[#8f8d87]">
                  {offersOnly ? "No product is discounted yet." : "No product matches that search."}
                </p>
                {activeFilters > 0 && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="cursor-pointer text-[13px] font-medium text-[#f5b800]"
                  >
                    Reset filters
                  </button>
                )}
              </div>
            )}

            {!loading &&
              shown.map((p) => {
                const d = rates[p.id];
                const on = picked.has(p.id);
                const soldOut = p.stock <= 0;
                return (
                  <div
                    key={p.id}
                    className={`${ROW} sp-row group border-b border-solid border-[#f4f4f4] px-[12px] py-[8px] transition-colors last:border-b-0 ${
                      on ? "bg-[#fdf7e6]" : "hover:bg-[#fafafa]"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(p.id)}
                      disabled={readOnly}
                      aria-pressed={on}
                      aria-label={`Select ${p.name}`}
                      className="not-disabled:cursor-pointer disabled:opacity-0"
                    >
                      <Tick on={on} />
                    </button>

                    <button
                      type="button"
                      onClick={() => openFor([p])}
                      disabled={readOnly}
                      aria-label={`Set discount for ${p.name}`}
                      className="flex min-w-0 items-center gap-[10px] text-left not-disabled:cursor-pointer disabled:cursor-default"
                    >
                      <span
                        className={`relative size-[40px] shrink-0 overflow-hidden rounded-[8px] bg-[#fafafa] ${
                          d ? "shadow-[inset_0_0_0_1.5px_#f5b800]" : ""
                        }`}
                      >
                        {p.image ? (
                          <ProductImage src={p.image} alt="" sizes="40px" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-[14px] font-semibold text-[#d4d4d4]">
                            {p.name.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-[14px] leading-[20px] text-[#1e1e1e]">
                          {p.name}
                        </span>
                        <span className="truncate text-[12px] text-[#8f8d87]">{p.sku}</span>
                      </span>
                    </button>

                    <span className="truncate text-[13px] text-[#525252]">{p.category}</span>

                    <span
                      className={`text-right text-[13px] tabular-nums ${
                        d ? "text-[#a3a3a3] line-through" : "text-[#525252]"
                      }`}
                    >
                      {money(p.price)}
                    </span>

                    <span className="flex justify-end">
                      {d ? (
                        <span className="rounded-[6px] bg-[#fdf7e6] px-[7px] py-[3px] text-[12px] font-semibold text-[#f5b800] tabular-nums">
                          {d.mode === "percent" ? `-${d.value}%` : `-${money(d.value)}`}
                        </span>
                      ) : (
                        <span className="text-[13px] text-[#d4d4d4]">—</span>
                      )}
                    </span>

                    <span
                      className={`text-right text-[14px] font-semibold tabular-nums ${
                        d ? "text-[#f5b800]" : "text-[#1e1e1e]"
                      }`}
                    >
                      {money(priceAfter(p.price, d))}
                    </span>

                    <span className="flex justify-end">
                      <span
                        className={`flex h-[22px] items-center gap-[6px] rounded-full px-[8px] text-[11px] ${
                          soldOut ? "bg-[#ffdfe2] text-[#e63946]" : "bg-[#f5fff8] text-[#00b837]"
                        }`}
                      >
                        <span
                          className={`size-[5px] rounded-full ${soldOut ? "bg-[#e63946]" : "bg-[#00b837]"}`}
                        />
                        {soldOut ? "None" : p.stock}
                      </span>
                    </span>

                    <span className="flex justify-end gap-[2px]">
                      {!readOnly && (
                        <>
                          <button
                            type="button"
                            onClick={() => openFor([p])}
                            aria-label={`Set discount for ${p.name}`}
                            title={d ? "Change discount" : "Set discount"}
                            className="flex size-[26px] cursor-pointer items-center justify-center rounded-[7px] text-[#a3a3a3] opacity-0 transition-all group-hover:opacity-100 hover:bg-[#fdf7e6] hover:text-[#f5b800] focus-visible:opacity-100"
                          >
                            <PencilIcon />
                          </button>
                          {d && (
                            <button
                              type="button"
                              onClick={() => removeOne(p.id)}
                              aria-label={`Remove discount from ${p.name}`}
                              title="Remove discount"
                              className="flex size-[26px] cursor-pointer items-center justify-center rounded-[7px] text-[#a3a3a3] opacity-0 transition-all group-hover:opacity-100 hover:bg-[#ffdfe2] hover:text-[#e63946] focus-visible:opacity-100"
                            >
                              <CloseIcon />
                            </button>
                          )}
                        </>
                      )}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {visible.length > 0 && (
        <div className="shrink-0">
        </div>
      )}

      {/* ── Setting a rate ─────────────────────────────────────────────── */}
      {editing && preview && (
        <div
          className="sp-fade fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-[16px]"
          onMouseDown={(e) => e.target === e.currentTarget && setEditing(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Set discount"
        >
          <div className="sp-rise flex max-h-[90vh] w-full max-w-[400px] flex-col overflow-hidden rounded-[14px] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
            {/* Who this is about */}
            <div className="flex shrink-0 items-center gap-[10px] border-b border-solid border-[#eaeaea] px-[20px] py-[16px]">
              {editing.length === 1 ? (
                <>
                  <span className="relative size-[40px] shrink-0 overflow-hidden rounded-[8px] bg-[#fafafa]">
                    {editing[0].image ? (
                      <ProductImage src={editing[0].image} alt="" sizes="40px" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-[14px] font-semibold text-[#d4d4d4]">
                        {editing[0].name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[15px] font-medium text-[#1e1e1e]">
                      {editing[0].name}
                    </span>
                    <span className="truncate text-[12px] text-[#8f8d87]">{editing[0].sku}</span>
                  </span>
                </>
              ) : (
                <>
                  <span className="flex size-[40px] shrink-0 items-center justify-center rounded-[8px] bg-[#fdf7e6] text-[15px] font-semibold text-[#f5b800] tabular-nums">
                    {editing.length}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[15px] font-medium text-[#1e1e1e]">
                      {editing.length} products
                    </span>
                    <span className="truncate text-[12px] text-[#8f8d87]">
                      {editing
                        .slice(0, 3)
                        .map((p) => p.name)
                        .join(", ")}
                      {editing.length > 3 ? ` +${editing.length - 3} more` : ""}
                    </span>
                  </span>
                </>
              )}
            </div>

            <div className="flex min-h-0 flex-col gap-[12px] overflow-y-auto px-[20px] py-[16px]">
              {/* Percent or taka — a shop says both. */}
              <div className="flex h-[36px] items-center gap-[2px] rounded-[9px] bg-[#fafafa] p-[3px] shadow-[inset_0_0_0_1px_#eaeaea]">
                {(
                  [
                    ["percent", "Percent (%)"],
                    ["flat", "Amount (৳)"],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    aria-pressed={mode === m}
                    className={`flex h-[30px] flex-1 cursor-pointer items-center justify-center rounded-[7px] text-[13px] font-medium transition-colors ${
                      mode === m
                        ? "bg-white text-[#f5b800] shadow-[0_1px_2px_rgba(82,88,102,0.08)]"
                        : "text-[#525252] hover:text-[#1e1e1e]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <label htmlFor="pos-discount" className="text-[13px] font-medium text-[#1e1e1e]">
                {mode === "percent" ? "Discount (%)" : "Discount (৳ off each)"}
              </label>
              <input
                id="pos-discount"
                autoFocus
                inputMode="decimal"
                value={draft}
                onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                  if (e.key === "Escape") setEditing(null);
                }}
                placeholder="0"
                className="h-[44px] w-full rounded-[10px] bg-white px-[12px] text-[14px] text-[#1e1e1e] tabular-nums shadow-[inset_0_0_0_1px_#eaeaea] outline-none focus:shadow-[inset_0_0_0_1.5px_#f5b800]"
              />

              {/* The rates a shop actually uses, one tap each. */}
              <div className="flex flex-wrap gap-[6px]">
                {(mode === "percent" ? [5, 10, 15, 20, 25, 50] : [20, 50, 100, 200, 500])
                  .filter((n) => mode === "flat" || n <= cap)
                  .map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setDraft(String(n))}
                      className={`cursor-pointer rounded-[8px] px-[10px] py-[6px] text-[13px] font-medium tabular-nums transition-colors ${
                        Number(draft) === n
                          ? "bg-[#fdf7e6] text-[#f5b800] shadow-[inset_0_0_0_1px_#f5b800]"
                          : "text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] hover:text-[#1e1e1e]"
                      }`}
                    >
                      {mode === "percent" ? `${n}%` : money(n)}
                    </button>
                  ))}
              </div>

              {/* What it comes to. */}
              {editing.length === 1 ? (
                <div className="flex items-center justify-between rounded-[10px] bg-[#fafafa] px-[12px] py-[10px] text-[13px]">
                  <span className="text-[#525252]">Sells at</span>
                  <span className="font-semibold text-[#1e1e1e] tabular-nums">
                    {money(preview.rows[0].after)}
                    <span className="ml-[6px] text-[12px] font-normal text-[#a3a3a3] line-through">
                      {money(editing[0].price)}
                    </span>
                  </span>
                </div>
              ) : (
                <div className="flex flex-col gap-[6px] rounded-[10px] bg-[#fafafa] px-[12px] py-[10px] text-[13px]">
                  <span className="flex items-center justify-between">
                    <span className="text-[#525252]">One of each, before</span>
                    <span className="text-[#525252] tabular-nums">{money(preview.before)}</span>
                  </span>
                  <span className="flex items-center justify-between">
                    <span className="text-[#525252]">Comes off</span>
                    <span className="font-semibold text-[#e63946] tabular-nums">
                      -{money(preview.off)}
                    </span>
                  </span>
                  <span className="flex items-center justify-between border-t border-solid border-[#eaeaea] pt-[6px]">
                    <span className="font-medium text-[#1e1e1e]">Sells at</span>
                    <span className="font-semibold text-[#1e1e1e] tabular-nums">
                      {money(preview.before - preview.off)}
                    </span>
                  </span>
                </div>
              )}

              {preview.overCap && (
                <p className="rounded-[8px] bg-[#fdf7e6] px-[10px] py-[8px] text-[12px] text-[#a07800]">
                  Trimmed to {cap}% — the most this shop allows.
                </p>
              )}

              <p className="text-[12px] text-[#8f8d87]">
                Leave it empty to remove the discount
                {editing.length > 1 ? " from all of them" : ""}.
              </p>
            </div>

            <div className="flex shrink-0 items-center justify-end gap-[12px] border-t border-solid border-[#eaeaea] px-[20px] py-[16px]">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="flex h-[44px] cursor-pointer items-center justify-center rounded-[12px] border border-solid border-[#eaeaea] bg-white px-[16px] text-[14px] font-medium text-[#525252] transition-colors hover:bg-[#fafafa]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                style={{
                  backgroundImage:
                    "linear-gradient(180deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 100%), linear-gradient(90deg, rgb(245,184,0) 0%, rgb(245,184,0) 100%)",
                }}
                className="flex h-[44px] cursor-pointer items-center justify-center rounded-[12px] px-[16px] text-[14px] font-semibold text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)]"
              >
                {draft.trim() && Number(draft) > 0
                  ? editing.length > 1
                    ? `Apply to ${editing.length}`
                    : "Save"
                  : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
