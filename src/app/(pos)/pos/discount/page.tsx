"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ProductItem } from "@/types/pos";
import { PosService, SettingsService } from "@/services";
import { useSession } from "@/services/useSession";
import TablePagination from "@/components/shared/TablePagination";
import {
  Discount,
  DiscountMap,
  DiscountMode,
  amountOff,
  capped,
  effectivePercent,
  priceAfter,
  readDiscounts,
  writeDiscounts,
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

/** One figure from the offers, in the band across the top. */
function Stat({
  label,
  value,
  hint,
  tone = "plain",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "plain" | "gold";
}) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-[2px] rounded-[12px] px-[14px] py-[10px] ${
        tone === "gold"
          ? "bg-[#fdf7e6] shadow-[inset_0_0_0_1px_#f7e3a1]"
          : "bg-white shadow-[inset_0_0_0_1px_#eaeaea]"
      }`}
    >
      <span className="truncate text-[11px] font-medium tracking-[0.02em] text-[#8f8d87] uppercase">
        {label}
      </span>
      <span
        className={`truncate text-[19px] leading-[26px] font-semibold tabular-nums ${
          tone === "gold" ? "text-[#f5b800]" : "text-[#1e1e1e]"
        }`}
      >
        {value}
      </span>
      <span className="truncate text-[11px] text-[#8f8d87]">{hint || " "}</span>
    </div>
  );
}

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

/** Rows in outline, so the table does not jump into place. */
function Skeleton() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="border-b border-solid border-[#f4f4f4] px-[12px] py-[11px] last:border-b-0">
          <div className="h-[38px] w-full animate-pulse rounded-[8px] bg-[#fafafa]" />
        </div>
      ))}
    </div>
  );
}

/* ── The page ──────────────────────────────────────────────────────────── */

export default function PosDiscountPage() {
  const { user, loading: sessionLoading } = useSession();

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All Categories");
  const [offersOnly, setOffersOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("name");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(16);

  const [rates, setRates] = useState<DiscountMap>({});
  const [cap, setCap] = useState(FALLBACK_CAP);
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

  useEffect(() => {
    PosService.getProducts()
      .then(setProducts)
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));

    SettingsService.getValues()
      .then((v) => {
        const max = Number(v["pos.max_discount_percent"]);
        if (Number.isFinite(max) && max > 0) setCap(Math.round(max * 100));
      })
      .catch(() => {});

    // Read after this render, not during it: the server has no localStorage,
    // so the first paint has to match it and the offers arrive a tick later.
    queueMicrotask(() => setRates(readDiscounts()));

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

  const persist = useCallback((next: DiscountMap) => {
    setRates(next);
    writeDiscounts(next);
  }, []);

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

  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const current = Math.min(page, totalPages);
  const shown = visible.slice((current - 1) * pageSize, current * pageSize);

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

  const pageIds = shown.map((p) => p.id);
  const allOnPagePicked = pageIds.length > 0 && pageIds.every((id) => picked.has(id));

  const togglePage = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (allOnPagePicked) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
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
    setPage(1);
  };

  const CHIP =
    "flex h-[34px] shrink-0 cursor-pointer items-center gap-[6px] rounded-[9px] px-[12px] text-[13px] font-medium whitespace-nowrap transition-colors";
  const HEAD = "text-[12px] leading-[16px] font-medium text-[#8f8d87]";

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-[14px] select-none">
      {/* ── What the offers add up to ─────────────────────────────────── */}
      <div className="flex shrink-0 flex-col gap-[12px]">
        <div className="flex flex-wrap items-center justify-between gap-[12px]">
          <div className="flex min-w-0 items-center gap-[10px]">
            <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px] bg-[#fdf7e6] text-[#f5b800]">
              <TagIcon size={20} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-[17px] leading-[24px] font-semibold text-[#1e1e1e]">Discounts</span>
              <span className="text-[12px] text-[#8f8d87]">
                {readOnly
                  ? "You can see the shop's offers but not change them."
                  : `Pick a product to set what comes off. Up to ${cap}% — the shop's limit.`}
              </span>
            </span>
          </div>

          <div className="flex items-center gap-[8px]">
            {undoState && (
              <button
                type="button"
                onClick={undo}
                className="sp-fade flex h-[36px] cursor-pointer items-center gap-[6px] rounded-[9px] bg-[#1e1e1e] px-[12px] text-[13px] font-medium text-white transition-opacity hover:opacity-90"
              >
                <UndoIcon />
                Undo — {undoState.what}
              </button>
            )}
            {!readOnly && summary.count > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="flex h-[36px] cursor-pointer items-center rounded-[9px] border border-solid border-[#eaeaea] bg-white px-[14px] text-[13px] font-medium text-[#525252] transition-colors hover:border-[#e63946] hover:text-[#e63946]"
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-[10px] lg:grid-cols-4">
          <Stat
            label="On offer"
            value={String(summary.count)}
            hint={`of ${products.length} product${products.length === 1 ? "" : "s"}`}
            tone={summary.count > 0 ? "gold" : "plain"}
          />
          <Stat
            label="Average off"
            value={summary.count ? `${summary.average.toFixed(1)}%` : "—"}
            hint={`shop limit ${cap}%`}
          />
          <Stat
            label="Off per unit sold"
            value={summary.offSum ? money(summary.offSum) : "—"}
            hint="if one of each is sold"
          />
          <Stat
            label="Deepest cut"
            value={summary.deepest ? `${summary.deepest.pct.toFixed(0)}%` : "—"}
            hint={summary.deepest ? summary.deepest.p.name : "nothing discounted yet"}
          />
        </div>
      </div>

      {/* ── Finding a product ──────────────────────────────────────────── */}
      <div className="flex shrink-0 flex-col gap-[10px]">
        <div className="flex flex-wrap items-center gap-[10px]">
          <div className="flex h-[42px] min-w-[220px] flex-1 items-center gap-[8px] rounded-[10px] bg-white px-[12px] shadow-[inset_0_0_0_1px_#eaeaea] focus-within:shadow-[inset_0_0_0_1.5px_#f5b800]">
            <span className="text-[#8f8d87]">
              <SearchIcon />
            </span>
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
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

          <button
            type="button"
            onClick={() => {
              setOffersOnly((v) => !v);
              setPage(1);
            }}
            aria-pressed={offersOnly}
            className={`${CHIP} h-[42px] ${
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

          <label className="flex h-[42px] shrink-0 items-center gap-[8px] rounded-[10px] bg-white pr-[10px] pl-[12px] shadow-[inset_0_0_0_1px_#eaeaea]">
            <span className="text-[12px] text-[#8f8d87]">Sort</span>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as SortKey);
                setPage(1);
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
        </div>

        {/* Categories — chips that scroll, not headings spread across the page. */}
        <div className="flex w-full items-center gap-[8px] overflow-x-auto pb-[2px]">
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
                  setPage(1);
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

          {activeFilters > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              className="ml-auto flex h-[34px] shrink-0 cursor-pointer items-center gap-[5px] rounded-[9px] px-[10px] text-[12px] font-medium text-[#8f8d87] transition-colors hover:text-[#e63946]"
            >
              <CloseIcon />
              Reset filters
            </button>
          )}
        </div>
      </div>

      {/* ── The table ──────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
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

            {category !== "All Categories" && picked.size === 0 && (
              <button
                type="button"
                onClick={() => openFor(products.filter((p) => p.category === category))}
                className="ml-auto flex h-[30px] shrink-0 cursor-pointer items-center rounded-[8px] bg-white px-[10px] text-[12px] font-medium text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] transition-colors hover:text-[#f5b800]"
              >
                Price all of {category}
              </button>
            )}
          </div>
        )}

        {/* One scroller for head and rows together, so the columns stay in
            step when the table is wider than the window. */}
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="min-w-[880px]">
            <div
              className={`${ROW} sticky top-0 z-10 border-b border-solid border-[#eaeaea] bg-[#fafafa] px-[12px] py-[10px]`}
            >
              <button
                type="button"
                onClick={togglePage}
                disabled={readOnly || shown.length === 0}
                aria-label="Select every product on this page"
                title="Select page"
                className="not-disabled:cursor-pointer disabled:opacity-0"
              >
                <Tick on={allOnPagePicked} />
              </button>
              <span className={HEAD}>Product</span>
              <span className={HEAD}>Category</span>
              <span className={`${HEAD} text-right`}>Price</span>
              <span className={`${HEAD} text-right`}>Discount</span>
              <span className={`${HEAD} text-right`}>Sells at</span>
              <span className={`${HEAD} text-right`}>Stock</span>
              <span />
            </div>

            {loading && <Skeleton />}

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
                          <Image src={p.image} alt="" fill sizes="40px" className="object-cover" />
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
          <TablePagination
            dense
            sizes={[16, 32, 64]}
            page={current}
            pageSize={pageSize}
            total={visible.length}
            onPageChange={setPage}
            onPageSizeChange={(n) => {
              setPageSize(n);
              setPage(1);
            }}
          />
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
                      <Image src={editing[0].image} alt="" fill sizes="40px" className="object-cover" />
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
