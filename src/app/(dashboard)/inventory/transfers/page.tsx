"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { TransferRecord } from "@/types/transfers";
import { TransferService } from "@/services";
import StatusPill, { Tone } from "@/components/shared/StatusPill";
import TablePagination from "@/components/shared/TablePagination";
import TableSkeleton from "@/components/shared/TableSkeleton";
import { useQuery, queryKey, invalidate } from "@/lib/query/useQuery";
import { CardListState, EmptyState, QueryBoundary, RefreshBar } from "@/components/shared/QueryBoundary";
import { isRowClick, isRowKey } from "@/lib/rowClick";
import DateField from "@/components/shared/DateField";
import Modal, { GOLD_GRADIENT, MODAL_GHOST } from "@/components/shared/Modal";
import { toApiDay } from "@/lib/dateFilter";

/**
 * Figma: SortPi — Transfers 57:14237.
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


/** The three things this screen can do to a transfer. `undo` is the only one
    that goes backwards, and it writes a reversing pair rather than deleting
    what it reverses — the ledger is insert-only. */
type TransferMove = "dispatch" | "receive" | "undo";

export default function TransfersPage() {
  const [query, setQuery] = useState("");
  /** The debounce settles the term before it reaches the cache key, so typing
      makes one request rather than one per letter — and a slow answer for "TR"
      can no longer land on top of the rows for "TRF-2". */
  const [term, setTerm] = useState("");
  const [date, setDate] = useState<Date | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [note, setNote] = useState<string | null>(null);
  const [detailOf, setDetailOf] = useState<TransferRecord | null>(null);
  /** Which transfer is mid-dispatch or mid-receive. */
  const [movingId, setMovingId] = useState<string | null>(null);

  useEffect(() => {
    if (query === term) return;
    const id = setTimeout(() => setTerm(query), 250);
    return () => clearTimeout(id);
  }, [query, term]);

  const day = date ? toApiDay(date) : undefined;
  const { data, loading, fetching, error, refetch } = useQuery(
    queryKey("transfers", { page, limit: pageSize, search: term, day }),
    () =>
      TransferService.getTransfers({
        search: term,
        startDate: day,
        endDate: day,
        page,
        limit: pageSize,
      })
  );

  // The two ends of a transfer. Shared with Add Stock, which offers the same



  /**
   * Pin this branch to whichever end the person did not just choose.
   *
   * Pick another branch to send FROM and this branch becomes the destination —
   * you are receiving. Pick one to send TO and this branch becomes the source —
   * you are sending. Choosing this branch on one side leaves the other free.
   */



  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages);
  // The server already filtered and sliced. `rows` is the page.
  const rows = data?.data ?? [];

  /** What the product box offers: on the source shelf, not already on the
      note, and matching what has been typed. */





  /**
   * Move a transfer along: source -> transit on dispatch, transit ->
   * destination on receive. Both write two stock movements each, which is why
   * neither is undoable from here.
   */
  const DID: Record<TransferMove, string> = {
    dispatch: "dispatched",
    receive: "received",
    undo: "put back — it is a draft again",
  };

  const advance = async (row: TransferRecord, to: TransferMove) => {
    if (movingId) return;
    setMovingId(row.id);
    setNote(null);
    try {
      if (to === "dispatch") await TransferService.dispatchTransfer(row.id);
      else if (to === "undo") await TransferService.undoDispatch(row.id);
      // No lines: what arrived is what was sent. Recording a short delivery
      // needs a per-line count, and that belongs in its own screen.
      else await TransferService.receiveTransfer(row.id);
      setNote(`${row.transferId} ${DID[to]}`);
      // Every one of them writes stock movements, so the balances on Stock, the
      // Products list and the dashboard are no longer what they were.
      invalidate("transfers", "stock", "inventory", "dashboard", "pos-products");
    } catch (err) {
      setNote(
        err instanceof Error && err.message
          ? `${row.transferId}: ${err.message}`
          : `${row.transferId} could not be ${DID[to]}.`
      );
    } finally {
      setMovingId(null);
    }
  };

  return (
    <div className="flex w-full flex-col gap-[14px]">
      {/* Headline — 57:14239 */}
      <div className="flex w-full flex-col items-stretch gap-[16px] lg:h-[48px] lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:gap-[16px]">
        <div className="flex h-[44px] w-full items-center justify-between gap-[12px] overflow-clip rounded-[10px] bg-white px-[12px] py-[10px] shadow-[inset_0_0_0_1px_#eaeaea] lg:min-w-[220px] lg:max-w-[370px] lg:flex-1">
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
          <Link
            href="/inventory/transfers/add"
            style={{ backgroundImage: GOLD_GRADIENT }}
            className="flex h-[48px] shrink-0 cursor-pointer items-center justify-center gap-[12px] rounded-[12px] px-[16px] py-[8px] text-[16px] leading-[24px] font-semibold whitespace-nowrap text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)]"
          >
            <AddIcon />
            Add New
          </Link>
        </div>
      </div>

      {/* Table card — 57:14271 */}
      <div className="relative w-full overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
        <RefreshBar active={fetching} />
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
                <QueryBoundary
                  loading={loading}
                  error={error}
                  hasData={data !== undefined}
                  skeleton={<TableSkeleton columns={GRID} rows={pageSize} />}
                  errorMessage="Transfers could not be loaded."
                  onRetry={refetch}
                >
                {rows.length === 0 && (
                  <EmptyState
                    message={
                      term || date ? "No transfers match that search." : "No transfers yet."
                    }
                    hint={term || date ? undefined : "Create one to move stock between warehouses."}
                  />
                )}
                {rows.map((t, i) => (
                  // A div, NOT a button. The row carries Dispatch and Receive
                  // buttons of its own, and a <button> may not contain one —
                  // the browser refuses to nest them and React reports it as a
                  // hydration error.
                  <div
                    key={t.id}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      if (isRowClick(e.target)) setDetailOf(t);
                    }}
                    onKeyDown={(e) => {
                      if (!isRowKey(e)) return;
                      e.preventDefault();
                      setDetailOf(t);
                    }}
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
                    <div className={`${CELL} justify-center`}>
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
                        <div className="flex items-center gap-[6px]">
                          <button
                            type="button"
                            disabled={movingId === t.id}
                            onClick={() => advance(t, "receive")}
                            className="flex h-[30px] cursor-pointer items-center rounded-[8px] px-[12px] text-[12px] font-semibold text-[#00b837] shadow-[inset_0_0_0_1px_#00b837] transition-colors hover:bg-[#f5fff8] disabled:opacity-50"
                          >
                            {movingId === t.id ? "Receiving…" : "Receive"}
                          </button>
                          {/* Only while it is still in transit. Once it has
                              been received the units are on another branch's
                              shelf, and the API says so. */}
                          <button
                            type="button"
                            disabled={movingId === t.id}
                            onClick={() => advance(t, "undo")}
                            title="Put the stock back on the source shelf"
                            className="flex h-[30px] shrink-0 cursor-pointer items-center rounded-[8px] px-[10px] text-[12px] font-medium text-[#8f8d87] transition-colors hover:bg-[#fafafa] hover:text-[#1e1e1e] disabled:opacity-50"
                          >
                            Undo
                          </button>
                        </div>
                      )}
                      {(t.status === "Received" || t.status === "Cancelled") && (
                        <span className="text-[13px] text-[#d4d4d4]">—</span>
                      )}
                    </div>
                  </div>
                ))}
                </QueryBoundary>
              </div>
            </div>
          </div>
        </div>

        {/* Stacked cards below md — also tappable */}
        <div className="flex flex-col gap-[10px] px-[16px] pt-[16px] md:hidden">
          {/* Below md there is no table, so the boundary around it never
              speaks here. Without this the phone showed one blank card for
              loading, for failure and for an empty list alike. */}
          <CardListState
            loading={loading}
            error={error}
            hasData={data !== undefined}
            isEmpty={rows.length === 0}
            errorMessage="Transfers could not be loaded."
            emptyMessage={term || date ? "No transfers match that search." : "No transfers yet."}
            onRetry={refetch}
            rows={4}
          />
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

            {/* What is actually in the van. The dialog showed "Sony +2 more"
                and a total, which is the table's summary again — it never said
                WHICH products or how many of each, and that is the question
                somebody opens a transfer to answer. */}
            <div className="flex flex-col gap-[8px]">
              <p className="text-[14px] font-medium text-[#525252]">
                Products <span className="text-[#8a8a8a]">({detailOf.lines.length})</span>
              </p>
              <div className="overflow-hidden rounded-[10px] border border-solid border-[#eaeaea]">
                <div className="flex items-center gap-[10px] border-b border-solid border-[#eaeaea] bg-[#fafafa] px-[12px] py-[8px]">
                  <span className="min-w-0 flex-1 text-[12px] font-medium text-[#8a8a8a]">Product</span>
                  <span className="w-[64px] shrink-0 text-right text-[12px] font-medium text-[#8a8a8a]">
                    Sent
                  </span>
                  {/* Only once there is a receipt to compare against. */}
                  {detailOf.status === "Received" && (
                    <span className="w-[72px] shrink-0 text-right text-[12px] font-medium text-[#8a8a8a]">
                      Arrived
                    </span>
                  )}
                </div>
                {detailOf.lines.length === 0 && (
                  <p className="px-[12px] py-[10px] text-[13px] text-[#8f8d87]">
                    This transfer has no lines.
                  </p>
                )}
                {/* The lines scroll, the head and the total do not. A van can
                    hold forty products, and a dialog that grows to forty rows
                    pushes its own totals off the bottom of the screen. */}
                <div className="max-h-[240px] overflow-y-auto">
                {detailOf.lines.map((l) => {
                  const short = detailOf.status === "Received" && l.receivedQuantity < l.quantity;
                  return (
                    <div
                      key={l.id}
                      className="flex items-center gap-[10px] border-b border-solid border-[#eaeaea] px-[12px] py-[9px] last:border-b-0"
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[13px] text-[#1e1e1e]">{l.name}</span>
                        <span className="truncate text-[11px] text-[#8f8d87]">{l.sku}</span>
                      </span>
                      <span className="w-[64px] shrink-0 text-right text-[13px] tabular-nums text-[#525252]">
                        {l.quantity}
                      </span>
                      {detailOf.status === "Received" && (
                        <span
                          className={`w-[72px] shrink-0 text-right text-[13px] tabular-nums ${
                            short ? "font-medium text-[#e63946]" : "text-[#525252]"
                          }`}
                          // A shortfall stays in TRANSIT rather than being
                          // written off, so it is worth pointing at.
                          title={short ? `${l.quantity - l.receivedQuantity} still in transit` : undefined}
                        >
                          {l.receivedQuantity}
                        </span>
                      )}
                    </div>
                  );
                })}
                </div>
                <div className="flex items-center gap-[10px] border-t border-solid border-[#eaeaea] bg-[#fafafa] px-[12px] py-[8px]">
                  <span className="min-w-0 flex-1 text-[12px] font-medium text-[#525252]">Total</span>
                  <span className="w-[64px] shrink-0 text-right text-[13px] font-medium tabular-nums text-[#1e1e1e]">
                    {detailOf.quantity}
                  </span>
                  {detailOf.status === "Received" && (
                    <span className="w-[72px] shrink-0 text-right text-[13px] font-medium tabular-nums text-[#1e1e1e]">
                      {detailOf.lines.reduce((n, l) => n + l.receivedQuantity, 0)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* New transfer — no Figma frame; built in the app's own language. */}
    </div>
  );
}
