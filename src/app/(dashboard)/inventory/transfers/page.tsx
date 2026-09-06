"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { TransferRecord } from "@/types/transfers";
import { StockItem } from "@/types/stock";
import { StockService, TransferService } from "@/services";
import StatusPill, { Tone } from "@/components/shared/StatusPill";
import TablePagination from "@/components/shared/TablePagination";
import TableSkeleton from "@/components/shared/TableSkeleton";
import DateField from "@/components/shared/DateField";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY } from "@/components/shared/Modal";
import { toApiDay } from "@/lib/dateFilter";

/**
 * Figma: SORTPoint — Transfers 57:14237.
 *
 * Search left, date field + Add New right; an 898px card with the 1128-wide
 * seven-column table (40px head, 54px rows) over the 64px pagination bar.
 *
 * The design has no Action column, so the row itself is the control: clicking
 * one opens its detail.
 */

const STATUS_TONE: Record<TransferRecord["status"], Tone> = {
  Draft: "slate",
  Dispatched: "amber",
  Received: "green",
  Cancelled: "red",
};

function AddIcon() {
  return (
    <svg className="block size-[20px] shrink-0" viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="0.9" y="0.9" width="18.2" height="18.2" rx="5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 6.4v7.2M6.4 10h7.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

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

/** The arrow between the two locations in the detail modal. */
function ArrowRight() {
  return (
    <svg className="block size-[18px] shrink-0" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M3 9h12M10.5 4.5L15 9l-4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Transfer ID  From  To  Products  Quantity  Date  Status  Action
const GRID = "grid-cols-[135fr_165fr_165fr_130fr_110fr_170fr_130fr_120fr]";
const CELL = "flex min-w-0 items-center p-[12px]";
const HEAD = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e]";
const TEXT = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]";
const FORM_FIELD =
  "flex h-[44px] items-center rounded-[10px] bg-white px-[12px] text-[14px] tracking-[-0.28px] text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] outline-none placeholder:text-[rgba(82,82,82,0.6)]";

// Warehouse ids and a stock line — a transfer moves a specific variant between
// two specific warehouses, so names were never enough to send one.
const blank = { from: "", to: "", stockLineId: "", quantity: "" };

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [query, setQuery] = useState("");
  const [date, setDate] = useState<Date | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [note, setNote] = useState<string | null>(null);
  const [detailOf, setDetailOf] = useState<TransferRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState({ ...blank });
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  /** The debounce is for typing. Waiting 250ms to make the FIRST request
      just adds a quarter second of blank table on reload. */
  const firstLoad = useRef(true);
  /** The API's count of everything matching, not of what this page holds. */
  const [total, setTotal] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [saving, setSaving] = useState(false);
  /** Which transfer is mid-dispatch or mid-receive. */
  const [movingId, setMovingId] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  /** Stock in the chosen source, so a line can name a real variant. */
  const [sourceStock, setSourceStock] = useState<StockItem[]>([]);

  useEffect(() => {
    // Debounced and guarded: a request per keystroke let a slow answer for
    // "TR" land after "TRF-2" and repopulate the table with the wrong rows.
    let live = true;
    const day = date ? toApiDay(date) : undefined;
    const id = setTimeout(() => {
      setLoading(true);
      TransferService.getTransfers({
        search: query,
        startDate: day,
        endDate: day,
        page,
        limit: pageSize,
      })
        .then((res) => {
          if (!live) return;
          setTransfers(res.data);
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
  }, [query, date, refresh, page, pageSize]);

  // The two ends of a transfer. Loaded once — a shop's warehouse list does not
  // change while somebody is filling in this form.
  useEffect(() => {
    TransferService.getWarehouses()
      .then(setWarehouses)
      .catch(() => {});
  }, []);

  // What is actually on the source shelf. A transfer cannot send what is not
  // there, and this is where the variant id comes from.
  useEffect(() => {
    if (!draft.from) {
      setSourceStock([]);
      return;
    }
    let live = true;
    StockService.getStock({ warehouse: draft.from, limit: 200 })
      .then((res) => live && setSourceStock(res.data.filter((r) => r.available > 0)))
      .catch(() => live && setSourceStock([]));
    return () => {
      live = false;
    };
  }, [draft.from]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages);
  // The server already filtered and sliced. `rows` is the page.
  const rows = transfers;

  const pickedLine = sourceStock.find((r) => r.id === draft.stockLineId) ?? null;

  const createTransfer = async () => {
    const qty = Number(draft.quantity);
    if (!draft.from) return setFormError("Pick a source warehouse.");
    if (!draft.to) return setFormError("Pick a destination warehouse.");
    if (draft.from === draft.to) return setFormError("Source and destination must differ.");
    if (!pickedLine) return setFormError("Pick a product to send.");
    if (!pickedLine.variantId) return setFormError("That line is missing its variant.");
    if (!draft.quantity.trim() || Number.isNaN(qty) || qty <= 0)
      return setFormError("Enter a quantity greater than zero.");
    if (qty > pickedLine.available)
      return setFormError(`Only ${pickedLine.available} available in that warehouse.`);

    setSaving(true);
    setFormError(null);
    try {
      // A draft. Nothing leaves the shelf until it is dispatched — the screen
      // used to build a record in local state and call it created.
      const created = await TransferService.createTransfer({
        referenceNo: `TRF-${Date.now()}`,
        fromWarehouseId: draft.from,
        toWarehouseId: draft.to,
        items: [{ variantId: pickedLine.variantId, quantity: qty }],
      });
      setNote(`${created.transferId} drafted — dispatch it to move the stock`);
      setDraft({ ...blank });
      setCreateOpen(false);
      setPage(1);
      setRefresh((n) => n + 1);
    } catch (err) {
      setFormError(
        err instanceof Error && err.message ? err.message : "The transfer could not be created."
      );
    } finally {
      setSaving(false);
    }
  };

  /**
   * Move a transfer along: source -> transit on dispatch, transit ->
   * destination on receive. Both write two stock movements each, which is why
   * neither is undoable from here.
   */
  const advance = async (row: TransferRecord, to: "dispatch" | "receive") => {
    if (movingId) return;
    setMovingId(row.id);
    setNote(null);
    try {
      if (to === "dispatch") await TransferService.dispatchTransfer(row.id);
      // No lines: what arrived is what was sent. Recording a short delivery
      // needs a per-line count, and that belongs in its own screen.
      else await TransferService.receiveTransfer(row.id);
      setNote(`${row.transferId} ${to === "dispatch" ? "dispatched" : "received"}`);
      setRefresh((n) => n + 1);
    } catch (err) {
      setNote(
        err instanceof Error && err.message
          ? `${row.transferId}: ${err.message}`
          : `${row.transferId} could not be ${to === "dispatch" ? "dispatched" : "received"}.`
      );
    } finally {
      setMovingId(null);
    }
  };

  return (
    <div className="flex w-full flex-col gap-[14px] select-none">
      {/* Headline — 57:14239 */}
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
              aria-label="Search transfers"
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

        <div className="flex shrink-0 items-center gap-[16px]">
          <DateField
            value={date}
            onChange={(d) => {
              setDate(d);
              // Page 1 of the new filter, not page 5 of the old one.
              setPage(1);
            }}
            ariaLabel="Filter transfers by date"
          />
          <button
            type="button"
            onClick={() => {
              setDraft({ ...blank });
              setFormError(null);
              setCreateOpen(true);
            }}
            style={{ backgroundImage: GOLD_GRADIENT }}
            className="flex h-[48px] shrink-0 cursor-pointer items-center justify-center gap-[12px] rounded-[12px] px-[16px] py-[8px] text-[16px] leading-[24px] font-semibold whitespace-nowrap text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)]"
          >
            <AddIcon />
            Add New
          </button>
        </div>
      </div>

      {/* Table card — 57:14271 */}
      <div className="w-full overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
        <div className="hidden px-[16px] pt-[16px] md:block">
          <div className="overflow-x-auto">
            <div className="min-w-[1127px]">
              <div className={`grid ${GRID} items-start overflow-clip rounded-[6px] shadow-[inset_0_0_0_1px_#eaeaea]`}>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Transfer ID</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>From</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>To</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Products</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Quantity</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Date</span></div>
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
                      ? "Transfers could not be loaded. Refresh to try again."
                      : "No transfers match that search."}
                  </p>
                )}
                {rows.map((t, i) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setDetailOf(t)}
                    aria-label={`Open ${t.transferId}`}
                    className={`grid ${GRID} h-[54px] w-full cursor-pointer items-center text-left transition-colors outline-none hover:bg-[#fafafa] focus-visible:bg-[#fffaeb] focus-visible:ring-1 focus-visible:ring-[#f5b800] focus-visible:ring-inset ${
                      i === rows.length - 1 ? "" : "border-b border-solid border-[#eaeaea]"
                    }`}
                  >
                    <div className={CELL}><span className={`${TEXT} truncate`}>{t.transferId}</span></div>
                    <div className={CELL}><span className={`${TEXT} truncate`}>{t.fromLocation}</span></div>
                    <div className={CELL}><span className={`${TEXT} truncate`}>{t.toLocation}</span></div>
                    <div className={CELL}><span className={`${TEXT} truncate`}>{t.productsSummary}</span></div>
                    <div className={CELL}><span className={`${TEXT} truncate`}>{t.quantity}</span></div>
                    <div className={CELL}><span className={`${TEXT} truncate`}>{t.dateTime}</span></div>
                    <div className={`${CELL} justify-center`}>
                      <StatusPill label={t.status} tone={STATUS_TONE[t.status] ?? "slate"} />
                    </div>
                    {/* A transfer moves in two halves, and neither was
                        reachable from this screen: it could be drafted and then
                        sit there forever. */}
                    <div
                      className={`${CELL} justify-center`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {t.status === "Draft" && (
                        <button
                          type="button"
                          disabled={movingId === t.id}
                          onClick={() => advance(t, "dispatch")}
                          className="flex h-[30px] cursor-pointer items-center rounded-[8px] bg-[#f5b800] px-[12px] text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                          {movingId === t.id ? "Sending…" : "Dispatch"}
                        </button>
                      )}
                      {t.status === "Dispatched" && (
                        <button
                          type="button"
                          disabled={movingId === t.id}
                          onClick={() => advance(t, "receive")}
                          className="flex h-[30px] cursor-pointer items-center rounded-[8px] px-[12px] text-[12px] font-semibold text-[#00b837] shadow-[inset_0_0_0_1px_#00b837] transition-colors hover:bg-[#f5fff8] disabled:opacity-50"
                        >
                          {movingId === t.id ? "Receiving…" : "Receive"}
                        </button>
                      )}
                      {(t.status === "Received" || t.status === "Cancelled") && (
                        <span className="text-[13px] text-[#d4d4d4]">—</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Stacked cards below md — also tappable */}
        <div className="flex flex-col gap-[10px] px-[16px] pt-[16px] md:hidden">
          {rows.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setDetailOf(t)}
              aria-label={`Open ${t.transferId}`}
              className="w-full cursor-pointer rounded-[10px] border border-solid border-[#eaeaea] p-[12px] text-left transition-colors outline-none hover:bg-[#fafafa] focus-visible:border-[#f5b800] focus-visible:bg-[#fffaeb]"
            >
              <div className="flex items-start justify-between gap-[10px]">
                <div className="min-w-0">
                  <p className={`${TEXT} truncate !text-[#1e1e1e]`}>{t.transferId}</p>
                  <p className="mt-[2px] truncate text-[12px] tracking-[-0.24px] text-[#525252]">
                    {t.fromLocation} → {t.toLocation}
                  </p>
                </div>
                <StatusPill label={t.status} tone={STATUS_TONE[t.status] ?? "slate"} />
              </div>
              <div className="mt-[10px] flex items-center justify-between gap-[10px]">
                <span className="truncate text-[12px] tracking-[-0.24px] text-[#525252]">{t.dateTime}</span>
                <span className={`${TEXT} shrink-0`}>
                  {t.productsSummary} · {t.quantity}
                </span>
              </div>
            </button>
          ))}
        </div>

        {note && <p className="px-[16px] pt-[10px] text-[13px] text-[#525252]">{note}</p>}

        {/* Pagination — 57:14680 */}
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

      {/* Transfer detail — opened by clicking the row */}
      <Modal
        open={detailOf !== null}
        onClose={() => setDetailOf(null)}
        title={`Transfer ${detailOf?.transferId ?? ""}`}
        footer={
          <button type="button" className={MODAL_GHOST} onClick={() => setDetailOf(null)}>
            Close
          </button>
        }
      >
        {detailOf && (
          <div className="flex flex-col gap-[16px]">
            <div className="flex items-center gap-[12px] rounded-[10px] bg-[#fafafa] p-[12px]">
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-[#8a8a8a]">From</p>
                <p className="truncate text-[14px] font-medium text-[#1e1e1e]">{detailOf.fromLocation}</p>
              </div>
              <span className="shrink-0 text-[#f5b800]">
                <ArrowRight />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] text-[#8a8a8a]">To</p>
                <p className="truncate text-[14px] font-medium text-[#1e1e1e]">{detailOf.toLocation}</p>
              </div>
            </div>

            <dl className="flex flex-col gap-[12px]">
              {[
                ["Transfer ID", detailOf.transferId],
                ["Products", detailOf.productsSummary],
                ["Quantity", String(detailOf.quantity)],
                ["Date", detailOf.dateTime],
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

      {/* New transfer — no Figma frame; built in the app's own language. */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New transfer"
        width={460}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={MODAL_PRIMARY}
              disabled={saving}
              onClick={createTransfer}
            >
              {saving ? "Creating…" : "Create transfer"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-[14px]">
          {(["from", "to"] as const).map((k) => (
            <label key={k} className="flex flex-col gap-[6px]">
              <span className="text-[14px] font-medium tracking-[-0.28px] text-[#525252]">
                {k === "from" ? "From" : "To"}
              </span>
              <select
                value={draft[k]}
                aria-label={k === "from" ? "Transfer from" : "Transfer to"}
                onChange={(e) => {
                  // Changing the source invalidates the line picked from it.
                  setDraft((d) => ({
                    ...d,
                    [k]: e.target.value,
                    ...(k === "from" ? { stockLineId: "", quantity: "" } : {}),
                  }));
                  setFormError(null);
                }}
                className={`${FORM_FIELD} cursor-pointer`}
              >
                <option value="">Select a warehouse</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
          ))}

          <label className="flex flex-col gap-[6px]">
            <span className="text-[14px] font-medium tracking-[-0.28px] text-[#525252]">Product</span>
            <select
              value={draft.stockLineId}
              disabled={!draft.from}
              aria-label="Product to transfer"
              onChange={(e) => {
                setDraft((d) => ({ ...d, stockLineId: e.target.value }));
                setFormError(null);
              }}
              className={`${FORM_FIELD} cursor-pointer disabled:opacity-60`}
            >
              <option value="">
                {draft.from ? "Select a product in stock there" : "Pick a source warehouse first"}
              </option>
              {sourceStock.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} — {r.available} available
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-[6px]">
            <span className="text-[14px] font-medium tracking-[-0.28px] text-[#525252]">Quantity</span>
            <input
              value={draft.quantity}
              onChange={(e) => {
                setDraft((d) => ({ ...d, quantity: e.target.value.replace(/[^\d]/g, "") }));
                setFormError(null);
              }}
              inputMode="numeric"
              placeholder="0"
              aria-label="Quantity"
              className={FORM_FIELD}
            />
            {pickedLine && (
              <span className="text-[12px] text-[#8a8a8a]">
                {pickedLine.available} available in that warehouse.
              </span>
            )}
          </label>

          <p className="text-[12px] text-[#8a8a8a]">
            A new transfer is a draft. Dispatching it is what takes the stock off the
            source shelf.
          </p>
          {formError && <p className="text-[13px] text-[#ef4444]">{formError}</p>}
        </div>
      </Modal>
    </div>
  );
}
