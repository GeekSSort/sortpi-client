"use client";

import React, { useEffect, useState } from "react";
import { StockItem } from "@/types/stock";
import { StockService } from "@/services";
import StatusPill, { Tone } from "@/components/shared/StatusPill";
import RowActionMenu from "@/components/shared/RowActionMenu";
import ScrollEnd from "@/components/shared/ScrollEnd";
import FilterDropdown from "@/components/shared/FilterDropdown";
import TableSkeleton from "@/components/shared/TableSkeleton";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY } from "@/components/shared/Modal";
import { queryKey, invalidate } from "@/lib/query/useQuery";
import { useInfiniteRows } from "@/lib/query/useInfiniteRows";
import { CardListState, EmptyState, QueryBoundary, RefreshBar } from "@/components/shared/QueryBoundary";
import ProductImage from "@/components/shared/ProductImage";
import VariantChip from "@/components/shared/VariantChip";
import { isRowClick } from "@/lib/rowClick";

/**
 * Figma: SortPi — Stock 57:13117.
 *
 * Search left; a card holding the 1128-wide table (40px head, 54px rows) over
 * the 64px pagination bar. Column tracks are the design widths as fr units so
 * extra width spreads evenly.
 *
 * Counting happens in the row. The design had an Add New button leading to a
 * separate screen that made you find the product again by name — but the row
 * already knows its variant and its warehouse, which is everything an
 * adjustment needs, so the count is typed where the number already is.
 */

/** A unique reference for one adjustment. Module scope, because reading the
    clock is a side effect and does not belong in a component body. */
function adjustmentRef(): string {
  return `ADJ-${Date.now()}`;
}

const STATUS_TONE: Record<StockItem["status"], Tone> = {
  "In Stock": "green",
  "Low Stock": "gold",
  "Out of Stock": "rose",
};

function SearchIcon() {
  return (
    <svg className="block size-[24px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="10.5" cy="10.5" r="7.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 16L21 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}


// Product Name  SKU  Warehouse  Available  Reserved  Low Stock  Status  Action
// Product Name  SKU  Warehouse  Available  Reserved  Low Stock  Manage  Status  Action
const GRID = "grid-cols-[205fr_170fr_135fr_100fr_100fr_100fr_170fr_130fr_83fr]";
const CELL = "flex min-w-0 items-center p-[12px]";
const HEAD = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e]";
// `cursor-text` on the data itself: the ROW is clickable and shows a pointer,
// but the text inside it is text — an I-beam is how a person knows they can
// drag across a SKU and copy it.
const TEXT = "cursor-text text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]";

/**
 * Counting a line, in the row.
 *
 * The number shown is what the shelf holds. Typing a different one, or
 * stepping it, arms a tick; nothing is sent until that tick is pressed, because
 * this writes a stock movement and a stray keystroke should not. Escape puts
 * the row back.
 */
function CountCell({
  row,
  busy,
  onApply,
}: {
  row: StockItem;
  busy: boolean;
  onApply: (next: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  // A refetch after applying brings a new `available`; drop the draft so the
  // row shows the server's number rather than the one just typed. Adjusted
  // during render rather than in an effect — an effect would paint the stale
  // draft once before clearing it.
  const [seenAvailable, setSeenAvailable] = useState(row.available);
  if (seenAvailable !== row.available) {
    setSeenAvailable(row.available);
    setDraft(null);
  }
  const shown = draft ?? String(row.available);
  const next = Number(shown);
  const dirty = draft !== null && Number.isFinite(next) && next >= 0 && next !== row.available;

  const step = (by: number) => setDraft(String(Math.max(0, (Number(shown) || 0) + by)));

  return (
    <div className="flex items-center gap-[4px]">
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={busy || next <= 0}
        aria-label={`One fewer ${row.name}`}
        className="flex size-[26px] shrink-0 items-center justify-center rounded-[7px] text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] not-disabled:cursor-pointer hover:not-disabled:text-[#1e1e1e] disabled:opacity-40"
      >
        &minus;
      </button>

      <input
        value={shown}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && dirty) onApply(next);
          if (e.key === "Escape") setDraft(null);
        }}
        disabled={busy}
        inputMode="numeric"
        aria-label={`Counted quantity for ${row.name}`}
        className={`h-[26px] w-[52px] rounded-[7px] bg-white text-center text-[13px] tabular-nums outline-none ${
          dirty
            ? "text-[#1e1e1e] shadow-[inset_0_0_0_1.5px_#f5b800]"
            : "text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea]"
        } disabled:opacity-50`}
      />

      <button
        type="button"
        onClick={() => step(1)}
        disabled={busy}
        aria-label={`One more ${row.name}`}
        className="flex size-[26px] shrink-0 items-center justify-center rounded-[7px] text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] not-disabled:cursor-pointer hover:not-disabled:text-[#1e1e1e] disabled:opacity-40"
      >
        +
      </button>

      {/* Only once the number differs: an always-on Save invites a click that
          writes a movement saying nothing changed. */}
      {dirty && (
        <button
          type="button"
          onClick={() => onApply(next)}
          disabled={busy}
          aria-label={`Apply count of ${next} for ${row.name}`}
          title={`Count ${row.available} → ${next}`}
          className="sp-fade flex size-[26px] shrink-0 cursor-pointer items-center justify-center rounded-[7px] bg-[#f5b800] text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? (
            <span className="size-[10px] animate-pulse rounded-full bg-white" />
          ) : (
            <svg className="block size-[13px]" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M3.5 8.5l3 3 6-6.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}

export default function StockPage() {
  const [query, setQuery] = useState("");
  /** The debounce settles the term before it reaches the cache key: one
      request for a word instead of one per letter, and a slow answer for "so"
      can no longer overwrite the rows for "sony" — it belongs to a key that is
      no longer on screen. */
  const [term, setTerm] = useState("");
  // Rows per request. Not a page size anyone picks — the table scrolls.
  const pageSize = 25;
  const [stockStatus, setStockStatus] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  /** Which row is mid-write, so only that one's control locks. */
  const [countingId, setCountingId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [detailOf, setDetailOf] = useState<StockItem | null>(null);
  const [adjustOf, setAdjustOf] = useState<StockItem | null>(null);
  /** A count that is stocking an EMPTY line, waiting for what the units cost.
      An empty line has no weighted average for the new units to inherit, so the
      API refuses the apply — see `needsCost`. */
  const [costOf, setCostOf] = useState<{ row: StockItem; next: number } | null>(null);
  const [costDraft, setCostDraft] = useState("");
  const [costError, setCostError] = useState<string | null>(null);
  const [adjustBy, setAdjustBy] = useState("");
  const [adjustError, setAdjustError] = useState<string | null>(null);

  useEffect(() => {
    if (query === term) return;
    const id = setTimeout(() => setTerm(query), 250);
    return () => clearTimeout(id);
  }, [query, term]);

  // One page at a time, and the WHOLE catalogue against this branch's shelf —
  // in stock, low, or none at all. The list was Stock ledger rows, and a
  // product the warehouse has never held has no row, so 207 of a 514-product
  // catalogue were unreachable from the one screen that can count them in.
  // Being at zero is exactly when somebody comes looking for a product.
  const {
    rows,
    total,
    loading,
    loadingMore,
    fetching,
    error,
    hasMore,
    sentinelRef,
    refetch,
  } = useInfiniteRows(
    queryKey("stock", { search: term, all: true, stockStatus }),
    (p, limit) =>
      StockService.getStock({
        search: term,
        stockStatus: stockStatus || undefined,
        page: p,
        limit,
        includeUnstocked: true,
      }),
    { pageSize }
  );

  /**
   * Count one line to a new quantity, from the row.
   *
   * Same endpoint the Adjust dialog uses: a draft adjustment then applied, and
   * the server works out the movement against the balance at that moment. The
   * table is refetched rather than patched, because the ledger owns the number.
   */
  /**
   * Whether counting this line UP has to state a unit cost.
   *
   * Weighted-average costing: units joining a line inherit the line's average,
   * and an empty line has none — so the API refuses the apply with
   * `ADJUSTMENT_COST_REQUIRED` rather than let the first sale compute COGS
   * against zero. Asked for up front instead of after a failed round trip.
   */
  // Against what is on the shelf, not what is sellable: a count says how many
  // units are there, reserved or not.
  const needsCost = (row: StockItem, next: number) =>
    next > row.quantity && row.averageCost <= 0;

  const applyCount = async (row: StockItem, next: number, unitCost?: number) => {
    if (countingId) return;
    if (!row.variantId || !row.warehouseId) {
      return setNote(`${row.name}: that line is missing its variant or warehouse.`);
    }
    if (unitCost == null && needsCost(row, next)) {
      setCostDraft("");
      setCostError(null);
      setCostOf({ row, next });
      return;
    }
    setCountingId(row.id);
    setNote(null);
    try {
      await StockService.adjustStock({
        warehouseId: row.warehouseId,
        variantId: row.variantId,
        newQuantity: next,
        referenceNo: adjustmentRef(),
        // COUNT — this IS a shelf count. "STOCK_IN"/"STOCK_OUT" were not
        // AdjustmentReason choices at all, so every count 400'd on `reason`
        // and the row put its old number back with only a toast to say why.
        reason: "COUNT",
        unitCost,
        note: `Counted ${row.quantity} to ${next}`,
      });
      setNote(`${row.name}: ${row.quantity} → ${next}`);
      // A movement changes this table, the product list's stock column, the
      // transfers screen's availability and the dashboard's stock figures.
      invalidate("stock", "inventory", "transfers", "dashboard", "pos-products");
    } catch (err) {
      setNote(
        err instanceof Error && err.message
          ? `${row.name}: ${err.message}`
          : `${row.name}: the count could not be applied.`
      );
    } finally {
      setCountingId(null);
    }
  };

  return (
    <div className="flex w-full flex-col gap-[14px]">
      {/* Headline — 57:13119 */}
      <div className="flex w-full flex-col items-stretch gap-[16px] lg:h-[48px] lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:gap-[16px]">
        <div className="flex h-[44px] w-full items-center justify-between gap-[12px] overflow-clip rounded-[10px] bg-white px-[12px] py-[10px] shadow-[inset_0_0_0_1px_#eaeaea] lg:min-w-[220px] lg:max-w-[370px] lg:flex-1">
          <div className="flex min-w-0 flex-1 items-center gap-[6px] text-[#525252]">
            <SearchIcon />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
              placeholder="Search by product name, SKU or barcode..."
              aria-label="Search stock"
              className="min-w-0 flex-1 bg-transparent text-[14px] leading-[1.5] tracking-[-0.28px] text-[#525252] outline-none placeholder:text-[#525252]"
            />
          </div>        </div>

        {/* The filters, beside the search box: a narrowed list has to
            say on screen that it is narrowed. */}
        <div className="flex shrink-0 flex-wrap items-center gap-[12px]">
          <FilterDropdown
            label="Stock level"
            value={stockStatus}
            onChange={setStockStatus}
            options={[
              { value: "", label: "Any level" },
              { value: "in", label: "In stock" },
              { value: "low", label: "Running low" },
              { value: "out", label: "Out of stock" },
            ]}
          />
        </div>

      </div>

      {/* Table card — 57:13151 */}
      <div className="relative w-full overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
        <RefreshBar active={fetching} />
        {/* One scroller for the table, the phone cards and the load trigger.
            The trigger has to sit INSIDE it — below the scroller it never
            leaves the screen, and every page loads at once the moment the
            table opens. */}
        <div className="table-scroll">

        <div className="hidden px-[16px] pt-[16px] md:block">
          <div>
            <div className="min-w-[1128px]">
              <div className={`table-head grid ${GRID} items-start overflow-clip rounded-[6px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]`}>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Product Name</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>SKU</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Warehouse</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Available</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Reserved</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Low Stock</span></div>
                <div className={`${CELL} h-[40px] justify-center bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Manage Stock</span></div>
                <div className={`${CELL} h-[40px] justify-center bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Status</span></div>
                <div className={`${CELL} h-[40px] justify-center bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Action</span></div>
              </div>

              <div className="mt-[6px]">
                <QueryBoundary
                  loading={loading}
                  error={error}
                  hasData={!loading && !error}
                  skeleton={<TableSkeleton columns={GRID} rows={8} />}
                  // The server names the real problem — most often that no
                  // branch is active, so there is no one shelf to report zero
                  // against — and that is more use than "try again".
                  errorMessage={
                    error instanceof Error && error.message
                      ? error.message
                      : "Stock could not be loaded."
                  }
                  onRetry={refetch}
                >
                {rows.length === 0 && (
                  <EmptyState
                    message={term ? "No stock matches that search." : "No stock lines yet."}
                    hint={term ? undefined : "Add a product to get started."}
                  />
                )}
                {rows.map((r, i) => (
                  <div
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`View stock for ${r.name}`}
                    onClick={(e) => {
                      if (isRowClick(e.target)) setDetailOf(r);
                    }}
                    onKeyDown={(e) => {
                      // Only when the ROW itself has focus. Enter inside the
                      // count input already means "apply this count".
                      if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setDetailOf(r);
                      }
                    }}
                    className={`grid ${GRID} h-[54px] cursor-pointer items-center transition-colors hover:bg-[#fafafa] focus-visible:bg-[#fafafa] focus-visible:outline-none ${i === rows.length - 1 ? "" : "border-b border-solid border-[#eaeaea]"}`}
                  >
                    {/* 28px thumbnail, 8px from the name — 57:13233 */}
                    <div className={`${CELL} gap-[8px]`}>
                      <span className="relative size-[28px] shrink-0 overflow-hidden rounded-[6px]">
                        <ProductImage src={r.image} alt="" sizes="28px" />
                      </span>
                      {/* A Stock row is keyed on variant + warehouse, so a
                          product sold in three sizes is three rows all reading
                          "Coca-Cola" — told apart by nothing but the SKU, which
                          is a code rather than a name. The chip is shrink-0, so
                          the size survives a long product name. */}
                      <span className={`${TEXT} truncate`}>{r.name}</span>
                      <VariantChip label={r.variantLabel} size="xs" />
                    </div>
                    <div className={CELL}><span className={`${TEXT} truncate`}>{r.sku}</span></div>
                    <div className={CELL}><span className={`${TEXT} truncate`}>{r.warehouse}</span></div>
                    <div className={CELL}><span className={`${TEXT} truncate`}>{r.available}</span></div>
                    <div className={CELL}><span className={`${TEXT} truncate`}>{r.reserved}</span></div>
                    <div className={CELL}><span className={`${TEXT} truncate`}>{r.lowStock}</span></div>
                    <div className={`${CELL} justify-center`}>
                      <CountCell
                        row={r}
                        busy={countingId === r.id}
                        onApply={(next) => applyCount(r, next)}
                      />
                    </div>
                    <div className={`${CELL} justify-center`}>
                      <StatusPill label={r.status} tone={STATUS_TONE[r.status] ?? "slate"} />
                    </div>
                    <div className={`${CELL} justify-center`}>
                      <RowActionMenu
                        label={`Actions for ${r.sku}`}
                        actions={[
                          { label: "View stock", onSelect: () => setDetailOf(r) },
                          {
                            label: "Adjust stock",
                            onSelect: () => {
                              setAdjustBy("");
                              setAdjustError(null);
                              setAdjustOf(r);
                            },
                          },
                        ]}
                      />
                    </div>
                  </div>
                ))}
                </QueryBoundary>
              </div>
            </div>
          </div>
        </div>

        {/* Stacked cards below md */}
        <div className="flex flex-col gap-[10px] px-[16px] pt-[16px] md:hidden">
          {/* Below md there is no table, so the boundary around it never
              speaks here. Without this the phone showed one blank card for
              loading, for failure and for an empty list alike. */}
          <CardListState
            loading={loading}
            error={error}
            hasData={!loading && !error}
            isEmpty={rows.length === 0}
            errorMessage={error instanceof Error && error.message ? error.message : "Stock could not be loaded."}
            emptyMessage={term ? "No stock matches that search." : "No stock lines yet."}
            onRetry={refetch}
            rows={4}
          />
          {rows.map((r) => (
            <div
              key={r.id}
              role="button"
              tabIndex={0}
              aria-label={`View stock for ${r.name}`}
              onClick={(e) => {
                if (isRowClick(e.target)) setDetailOf(r);
              }}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setDetailOf(r);
                }
              }}
              className="cursor-pointer rounded-[10px] border border-solid border-[#eaeaea] p-[12px] transition-colors hover:bg-[#fafafa] focus-visible:bg-[#fafafa] focus-visible:outline-none"
            >
              <div className="flex items-start justify-between gap-[10px]">
                <div className="flex min-w-0 items-center gap-[8px]">
                  <span className="relative size-[28px] shrink-0 overflow-hidden rounded-[6px]">
                    <ProductImage src={r.image} alt="" sizes="28px" />
                  </span>
                  <div className="min-w-0">
                    <p className="flex min-w-0 items-center gap-[6px]">
                      <span className={`${TEXT} truncate !text-[#1e1e1e]`}>{r.name}</span>
                      <VariantChip label={r.variantLabel} size="xs" />
                    </p>
                    <p className="mt-[2px] truncate text-[12px] tracking-[-0.24px] text-[#525252]">
                      {r.sku} · {r.warehouse}
                    </p>
                  </div>
                </div>
                <StatusPill label={r.status} tone={STATUS_TONE[r.status] ?? "slate"} />
              </div>
              <p className="mt-[10px] text-[12px] tracking-[-0.24px] text-[#525252]">
                {r.available} available · {r.reserved} reserved · low at {r.lowStock}
              </p>
              {/* Same control as the table's Manage column — a phone is where a
                  stock count actually gets typed, walking the aisle. */}
              <div className="mt-[10px] flex items-center justify-between gap-[10px]">
                <span className="text-[12px] text-[#8f8d87]">Counted</span>
                <CountCell row={r} busy={countingId === r.id} onApply={(n) => applyCount(r, n)} />
              </div>
            </div>
          ))}
        </div>

        {note && <p className="px-[16px] pt-[10px] text-[13px] text-[#525252]">{note}</p>}

        {/* Pagination — 57:13603 */}
        <div className="mt-[9px]">
          <ScrollEnd
            sentinelRef={sentinelRef}
            hasMore={hasMore}
            loadingMore={loadingMore}
            shown={rows.length}
            total={total}
            noun="lines"
          />
        </div>
        </div>
      </div>

      {/* View stock */}
      <Modal
        open={detailOf !== null}
        onClose={() => setDetailOf(null)}
        title={detailOf?.name ?? ""}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setDetailOf(null)}>
              Close
            </button>
            <button
              type="button"
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={MODAL_PRIMARY}
              onClick={() => {
                if (detailOf) {
                  setAdjustBy("");
                  setAdjustError(null);
                  setAdjustOf(detailOf);
                }
                setDetailOf(null);
              }}
            >
              Adjust stock
            </button>
          </>
        }
      >
        {detailOf && (
          <div className="flex flex-col gap-[16px]">
            <div className="flex items-center gap-[12px]">
              <span className="relative size-[56px] shrink-0 overflow-hidden rounded-[10px] border border-solid border-[#eaeaea]">
                <ProductImage src={detailOf.image} alt="" sizes="56px" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[16px] font-medium text-[#1e1e1e]">{detailOf.name}</p>
                <p className="truncate text-[13px] text-[#525252]">{detailOf.sku}</p>
              </div>
            </div>
            <dl className="flex flex-col gap-[12px]">
              {[
                ["Warehouse", detailOf.warehouse],
                ["Available", String(detailOf.available)],
                ["Reserved", String(detailOf.reserved)],
                ["Low stock at", String(detailOf.lowStock)],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-[16px]">
                  <dt className="text-[14px] text-[#525252]">{k}</dt>
                  <dd className="text-[14px] font-medium text-[#1e1e1e]">{v}</dd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-[16px]">
                <dt className="text-[14px] text-[#525252]">Status</dt>
                <dd>
                  <StatusPill label={detailOf.status} tone={STATUS_TONE[detailOf.status] ?? "slate"} />
                </dd>
              </div>
            </dl>
          </div>
        )}
      </Modal>

      {/* First stock on an empty line — what did the units cost? */}
      <Modal
        open={costOf !== null}
        onClose={() => setCostOf(null)}
        title="What did these cost?"
        width={420}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setCostOf(null)}>
              Cancel
            </button>
            <button
              type="button"
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={MODAL_PRIMARY}
              onClick={() => {
                if (!costOf) return;
                const cost = Number(costDraft);
                if (!costDraft.trim() || Number.isNaN(cost) || cost <= 0) {
                  return setCostError("Enter what one unit cost, greater than zero.");
                }
                const { row, next } = costOf;
                setCostOf(null);
                void applyCount(row, next, cost);
              }}
            >
              Count it in
            </button>
          </>
        }
      >
        {costOf && (
          <div className="flex flex-col gap-[12px]">
            <p className="text-[14px] leading-[1.6] text-[#525252]">
              <span className="font-medium text-[#1e1e1e]">{costOf.row.name}</span> has never been
              stocked in {costOf.row.warehouse}, so there is no cost for these{" "}
              <span className="font-medium text-[#1e1e1e]">{costOf.next}</span> units to inherit.
            </p>
            <label className="flex flex-col gap-[6px]">
              <span className="text-[14px] font-medium tracking-[-0.28px] text-[#525252]">
                Cost per unit
              </span>
              <input
                autoFocus
                value={costDraft}
                onChange={(e) => {
                  setCostDraft(e.target.value.replace(/[^\d.]/g, ""));
                  setCostError(null);
                }}
                inputMode="decimal"
                placeholder="৳ 0.00"
                aria-label="Cost per unit"
                className="flex h-[44px] items-center rounded-[10px] bg-white px-[12px] text-[14px] tracking-[-0.28px] text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] outline-none placeholder:text-[rgba(82,82,82,0.6)]"
              />
            </label>
            <p className="text-[12px] leading-[1.5] text-[#8a8a8a]">
              This is what the shop PAID, and it becomes the line&rsquo;s weighted average — the
              figure profit is measured against. It is not the selling price.
            </p>
            {costError && <p className="text-[13px] text-[#ef4444]">{costError}</p>}
          </div>
        )}
      </Modal>

      {/* Adjust stock — a signed delta against the available count */}
      <Modal
        open={adjustOf !== null}
        onClose={() => setAdjustOf(null)}
        title="Adjust stock"
        width={440}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setAdjustOf(null)}>
              Cancel
            </button>
            <button
              type="button"
              disabled={adjusting}
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={MODAL_PRIMARY}
              onClick={async () => {
                if (!adjustOf || adjusting) return;
                const delta = Number(adjustBy);
                if (!adjustBy.trim() || Number.isNaN(delta) || delta === 0) {
                  return setAdjustError("Enter a non-zero amount, e.g. 12 or -5.");
                }
                const next = adjustOf.available + delta;
                if (next < 0) return setAdjustError("That would take available stock below zero.");
                if (!adjustOf.variantId || !adjustOf.warehouseId) {
                  return setAdjustError("That line is missing its variant or warehouse.");
                }
                // Same rule as the row counter: stock joining an EMPTY line has
                // no average to inherit, so the cost is asked for first.
                if (needsCost(adjustOf, next)) {
                  const row = adjustOf;
                  setAdjustOf(null);
                  setCostDraft("");
                  setCostError(null);
                  setCostOf({ row, next });
                  return;
                }
                // Drafted and applied against the ledger, not edited on screen.
                // This used to change the row and nothing else.
                setAdjusting(true);
                setAdjustError(null);
                try {
                  await StockService.adjustStock({
                    warehouseId: adjustOf.warehouseId,
                    variantId: adjustOf.variantId,
                    // A count, not a delta — the service works out the movement.
                    newQuantity: next,
                    referenceNo: adjustmentRef(),
                    // CORRECTION, not COUNT: nobody counted the shelf here,
                    // they typed a difference against what the screen showed.
                    reason: "CORRECTION",
                    note: `Adjusted by ${delta > 0 ? "+" : ""}${delta}`,
                  });
                  setNote(`${adjustOf.name}: available ${adjustOf.available} → ${next}`);
                  setAdjustOf(null);
                  // Refetch rather than patch: the ledger owns the balance,
                  // and the same movement is what Products and the dashboard
                  // are counting.
                  invalidate("stock", "inventory", "transfers", "dashboard", "pos-products");
                } catch (err) {
                  setAdjustError(
                    err instanceof Error && err.message
                      ? err.message
                      : "The adjustment could not be applied."
                  );
                } finally {
                  setAdjusting(false);
                }
              }}
            >
              {adjusting ? "Applying…" : "Apply adjustment"}
            </button>
          </>
        }
      >
        {adjustOf && (
          <div className="flex flex-col gap-[12px]">
            <p className="text-[14px] leading-[1.6] text-[#525252]">
              <span className="font-medium text-[#1e1e1e]">{adjustOf.name}</span> has{" "}
              <span className="font-medium text-[#1e1e1e]">{adjustOf.available}</span> available in{" "}
              {adjustOf.warehouse}.
            </p>
            <label className="flex flex-col gap-[6px]">
              <span className="text-[14px] font-medium tracking-[-0.28px] text-[#525252]">
                Adjustment (+ / −)
              </span>
              <input
                autoFocus
                value={adjustBy}
                onChange={(e) => {
                  setAdjustBy(e.target.value.replace(/[^\d-]/g, ""));
                  setAdjustError(null);
                }}
                inputMode="numeric"
                placeholder="e.g. 12 or -5"
                aria-label="Stock adjustment"
                className="flex h-[44px] items-center rounded-[10px] bg-white px-[12px] text-[14px] tracking-[-0.28px] text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] outline-none placeholder:text-[rgba(82,82,82,0.6)]"
              />
            </label>
            {adjustBy.trim() !== "" && !Number.isNaN(Number(adjustBy)) && (
              <p className="text-[13px] text-[#525252]">
                New available:{" "}
                <span className="font-medium text-[#1e1e1e]">
                  {adjustOf.available + Number(adjustBy)}
                </span>
              </p>
            )}
            {adjustError && <p className="text-[13px] text-[#ef4444]">{adjustError}</p>}
          </div>
        )}
      </Modal>

    </div>
  );
}
