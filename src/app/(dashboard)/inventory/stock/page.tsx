"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { StockItem } from "@/types/stock";
import { StockService } from "@/services";
import StatusPill, { Tone } from "@/components/shared/StatusPill";
import RowActionMenu from "@/components/shared/RowActionMenu";
import TablePagination from "@/components/shared/TablePagination";
import TableSkeleton from "@/components/shared/TableSkeleton";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY } from "@/components/shared/Modal";

/**
 * Figma: SORTPoint — Stock 57:13117.
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

function FilterIcon() {
  return (
    <svg className="block size-[18px] shrink-0" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M2.25 4.5h13.5M4.5 9h9M7.5 13.5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// Product Name  SKU  Warehouse  Available  Reserved  Low Stock  Status  Action
// Product Name  SKU  Warehouse  Available  Reserved  Low Stock  Manage  Status  Action
const GRID = "grid-cols-[205fr_170fr_135fr_100fr_100fr_100fr_170fr_130fr_83fr]";
const CELL = "flex min-w-0 items-center p-[12px]";
const HEAD = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e]";
const TEXT = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]";

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
  const shown = draft ?? String(row.available);
  const next = Number(shown);
  const dirty = draft !== null && Number.isFinite(next) && next >= 0 && next !== row.available;

  // A refetch after applying brings a new `available`; drop the draft so the
  // row shows the server's number rather than the one just typed.
  useEffect(() => {
    setDraft(null);
  }, [row.available]);

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
  const [stock, setStock] = useState<StockItem[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  /** The debounce is for typing. Waiting 250ms to make the FIRST request
      just adds a quarter second of blank table on reload. */
  const firstLoad = useRef(true);
  /** The API's count of everything matching, not of what this page holds. */
  const [total, setTotal] = useState(0);
  const [adjusting, setAdjusting] = useState(false);
  /** Which row is mid-write, so only that one's control locks. */
  const [countingId, setCountingId] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [detailOf, setDetailOf] = useState<StockItem | null>(null);
  const [adjustOf, setAdjustOf] = useState<StockItem | null>(null);
  const [adjustBy, setAdjustBy] = useState("");
  const [adjustError, setAdjustError] = useState<string | null>(null);

  useEffect(() => {
    // Debounced and guarded: a request per keystroke let a slow answer for
    // "so" land after "sony" and repopulate the table with the wrong rows.
    let live = true;
    const id = setTimeout(() => {
      setLoading(true);
      // One page at a time. The whole list used to be requested and sliced in
      // the browser, but the API caps a page at 200, so anything past that was
      // silently truncated and the pager called 200 the total.
      StockService.getStock({ search: query, page, limit: pageSize })
        .then((res) => {
          if (!live) return;
          setStock(res.data);
          setTotal(res.total);
          setFailed(false);
        })
        .catch(() => live && setFailed(true))
        .finally(() => live && setLoading(false));
    }, firstLoad.current ? 0 : 250);
    firstLoad.current = false;
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [query, refresh, page, pageSize]);

  /**
   * Count one line to a new quantity, from the row.
   *
   * Same endpoint the Adjust dialog uses: a draft adjustment then applied, and
   * the server works out the movement against the balance at that moment. The
   * table is refetched rather than patched, because the ledger owns the number.
   */
  const applyCount = async (row: StockItem, next: number) => {
    if (countingId) return;
    if (!row.variantId || !row.warehouseId) {
      return setNote(`${row.name}: that line is missing its variant or warehouse.`);
    }
    setCountingId(row.id);
    setNote(null);
    try {
      await StockService.adjustStock({
        warehouseId: row.warehouseId,
        variantId: row.variantId,
        newQuantity: next,
        referenceNo: `ADJ-${Date.now()}`,
        reason: next > row.available ? "STOCK_IN" : "STOCK_OUT",
        note: `Counted ${row.available} to ${next}`,
      });
      setNote(`${row.name}: ${row.available} → ${next}`);
      setRefresh((n) => n + 1);
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

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages);
  // The server already sliced. `rows` is the page.
  const rows = stock;

  return (
    <div className="flex w-full flex-col gap-[14px] select-none">
      {/* Headline — 57:13119 */}
      <div className="flex w-full flex-col items-stretch gap-[16px] lg:h-[48px] lg:flex-row lg:items-center lg:justify-between lg:gap-0">
        <div className="flex h-[44px] w-full items-center justify-between gap-[12px] overflow-clip rounded-[10px] bg-white px-[12px] py-[10px] shadow-[inset_0_0_0_1px_#eaeaea] lg:w-[370px]">
          <div className="flex min-w-0 flex-1 items-center gap-[6px] text-[#525252]">
            <SearchIcon />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search by product name, SKU or barcode..."
              aria-label="Search stock"
              className="min-w-0 flex-1 bg-transparent text-[14px] leading-[1.5] tracking-[-0.28px] text-[#525252] outline-none placeholder:text-[#525252]"
            />
          </div>
          <button
            type="button"
            aria-label="Filter"
            onClick={() => setNote("Filter panel not designed yet")}
            className="shrink-0 cursor-pointer text-[#525252] transition-colors hover:text-[#1e1e1e]"
          >
            <FilterIcon />
          </button>
        </div>

      </div>

      {/* Table card — 57:13151 */}
      <div className="w-full overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
        <div className="hidden px-[16px] pt-[16px] md:block">
          <div className="overflow-x-auto">
            <div className="min-w-[1128px]">
              <div className={`grid ${GRID} items-start overflow-clip rounded-[6px] shadow-[inset_0_0_0_1px_#eaeaea]`}>
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
                {rows.length === 0 && loading && (
                  <TableSkeleton columns={GRID} rows={pageSize} />
                )}
                {rows.length === 0 && !loading && (
                  <p className="py-[40px] text-center text-[14px] text-[#525252]">
                    {failed
                      ? "Stock could not be loaded. Refresh to try again."
                      : "No stock matches that search."}
                  </p>
                )}
                {rows.map((r, i) => (
                  <div
                    key={r.id}
                    className={`grid ${GRID} h-[54px] items-center ${i === rows.length - 1 ? "" : "border-b border-solid border-[#eaeaea]"}`}
                  >
                    {/* 28px thumbnail, 8px from the name — 57:13233 */}
                    <div className={`${CELL} gap-[8px]`}>
                      <span className="relative size-[28px] shrink-0 overflow-hidden rounded-[6px]">
                        <Image src={r.image || "/placeholder-product.svg"} alt="" fill sizes="28px" className="object-cover" />
                      </span>
                      <span className={`${TEXT} truncate`}>{r.name}</span>
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
              </div>
            </div>
          </div>
        </div>

        {/* Stacked cards below md */}
        <div className="flex flex-col gap-[10px] px-[16px] pt-[16px] md:hidden">
          {rows.map((r) => (
            <div key={r.id} className="rounded-[10px] border border-solid border-[#eaeaea] p-[12px]">
              <div className="flex items-start justify-between gap-[10px]">
                <div className="flex min-w-0 items-center gap-[8px]">
                  <span className="relative size-[28px] shrink-0 overflow-hidden rounded-[6px]">
                    <Image src={r.image || "/placeholder-product.svg"} alt="" fill sizes="28px" className="object-cover" />
                  </span>
                  <div className="min-w-0">
                    <p className={`${TEXT} truncate !text-[#1e1e1e]`}>{r.name}</p>
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
          <TablePagination
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
                <Image src={detailOf.image || "/placeholder-product.svg"} alt="" fill sizes="56px" className="object-cover" />
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
                    referenceNo: `ADJ-${Date.now()}`,
                    reason: delta > 0 ? "STOCK_IN" : "STOCK_OUT",
                    note: `Adjusted by ${delta > 0 ? "+" : ""}${delta}`,
                  });
                  setNote(`${adjustOf.name}: available ${adjustOf.available} → ${next}`);
                  setAdjustOf(null);
                  // Refetch rather than patch: the ledger owns the balance.
                  setRefresh((n) => n + 1);
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
