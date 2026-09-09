"use client";

import React, { useEffect, useMemo, useState } from "react";
import { TransferRecord } from "@/types/transfers";
import { StockItem } from "@/types/stock";
import { StockService, TransferService } from "@/services";
import StatusPill, { Tone } from "@/components/shared/StatusPill";
import TablePagination from "@/components/shared/TablePagination";
import TableSkeleton from "@/components/shared/TableSkeleton";
import { useQuery, queryKey, invalidate } from "@/lib/query/useQuery";
import { CardListState, EmptyState, QueryBoundary, RefreshBar } from "@/components/shared/QueryBoundary";
import { useSession } from "@/services/useSession";
import { isRowClick, isRowKey } from "@/lib/rowClick";
import DateField from "@/components/shared/DateField";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY } from "@/components/shared/Modal";
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
const FORM_FIELD =
  "flex h-[44px] items-center rounded-[10px] bg-white px-[12px] text-[14px] tracking-[-0.28px] text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] outline-none placeholder:text-[rgba(82,82,82,0.6)]";

// Warehouse ids and a stock line — a transfer moves a specific variant between
// two specific warehouses, so names were never enough to send one.
const blank = { from: "", to: "" };

/** One product on a transfer note: the stock line it came from, and how many.
    A transfer takes as many of these as the storeman is loading into the van —
    the API has always accepted a list and this screen sent exactly one. */
interface TransferLine {
  /** The stock row picked from the source warehouse. */
  stockLineId: string;
  variantId: string;
  name: string;
  sku: string;
  available: number;
  quantity: number;
}

/** The three things this screen can do to a transfer. `undo` is the only one
    that goes backwards, and it writes a reversing pair rather than deleting
    what it reverses — the ledger is insert-only. */
type TransferMove = "dispatch" | "receive" | "undo";

/** A unique reference for one transfer. Module scope, because reading the
    clock is a side effect and does not belong in a component body. */
function transferRef(): string {
  return `TRF-${Date.now()}`;
}

export default function TransfersPage() {
  const session = useSession();
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
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState({ ...blank });
  /** The note's lines, in the order they were added. */
  const [lines, setLines] = useState<TransferLine[]>([]);
  /** What is being typed into the product box before it becomes a line. */
  const [pickQuery, setPickQuery] = useState("");
  const [pickOpen, setPickOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
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
  // list — a shop's warehouses do not change while a form is being filled in.
  const warehouseQuery = useQuery(queryKey("warehouses"), () =>
    TransferService.getWarehouses()
  );
  // MAIN warehouses only. TRANSIT is machinery — `dispatch` routes the stock
  // through the SOURCE branch's transit warehouse by itself — so naming one as
  // an end of a transfer is not a choice a storeman has, and offering it made
  // the list twice as long as the number of places stock can actually go.
  const warehouses = (warehouseQuery.data ?? []).filter((w) => w.type !== "TRANSIT");

  /**
   * This branch's own shelf. One end of every transfer has to be it.
   *
   * A transfer is a shop sending stock somewhere or expecting it from
   * somewhere, and either way this branch is standing at one end of it.
   * Drafting Chattogram → Dhaka from Head Office is a movement between two
   * places the person is not, arranged on their behalf, and the API refuses it
   * anyway: `perform_create` checks the caller may write to the SOURCE, so the
   * pair could be typed in full and only fail on save.
   */
  const here = useMemo(
    () => warehouses.find((w) => w.branchId === session.user?.activeBranch?.id) ?? null,
    [warehouses, session.user?.activeBranch?.id]
  );

  /** The other end: anywhere but here. */
  const elsewhere = useMemo(
    () => warehouses.filter((w) => w.id !== here?.id),
    [warehouses, here]
  );

  /**
   * Pin this branch to whichever end the person did not just choose.
   *
   * Pick another branch to send FROM and this branch becomes the destination —
   * you are receiving. Pick one to send TO and this branch becomes the source —
   * you are sending. Choosing this branch on one side leaves the other free.
   */
  const pickEnd = (end: "from" | "to", warehouseId: string) => {
    const next = { ...draft, [end]: warehouseId };
    if (here && warehouseId && warehouseId !== here.id) {
      next[end === "from" ? "to" : "from"] = here.id;
    }
    setDraft(next);
    // Only when the SOURCE actually moved. Changing the destination leaves the
    // note alone — those lines still came off the shelf they came off.
    if (next.from !== draft.from) {
      setLines([]);
      setPickQuery("");
    }
    setFormError(null);
  };

  // The branch the source shelf belongs to. When it is not the branch the
  // person is standing in — an INBOUND transfer, stock coming here from
  // somewhere else — the read has to say so, or the branch scope answers empty
  // and the product picker looks like an empty warehouse.
  const sourceBranchId = warehouses.find((w) => w.id === draft.from)?.branchId ?? "";
  const asBranch = sourceBranchId && sourceBranchId !== here?.branchId ? sourceBranchId : undefined;

  // What is actually on the source shelf. A transfer cannot send what is not
  // there, and this is where the variant id comes from. `enabled` keeps the
  // request from going out before a source has been picked.
  const sourceStockQuery = useQuery(
    queryKey("stock", { warehouse: draft.from, limit: 200, as: asBranch ?? "" }),
    () => StockService.getStock({ warehouse: draft.from, limit: 200 }, asBranch),
    { enabled: draft.from !== "" }
  );
  // Memoised: a fresh array on every render would make `pickable` recompute on
  // every keystroke of every other field in the dialog.
  const sourceRows = sourceStockQuery.data?.data;
  const sourceStock: StockItem[] = useMemo(
    () => (draft.from ? (sourceRows ?? []).filter((r) => r.available > 0) : []),
    [draft.from, sourceRows]
  );

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages);
  // The server already filtered and sliced. `rows` is the page.
  const rows = data?.data ?? [];

  /** What the product box offers: on the source shelf, not already on the
      note, and matching what has been typed. */
  const pickable = useMemo(() => {
    const q = pickQuery.trim().toLowerCase();
    const taken = new Set(lines.map((l) => l.stockLineId));
    return sourceStock
      .filter((r) => !taken.has(r.id))
      .filter(
        (r) => !q || r.name.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q)
      )
      .slice(0, 40);
  }, [sourceStock, lines, pickQuery]);

  const addLine = (row: StockItem) => {
    // The variant is what the API moves; a line without one cannot be sent, so
    // it is checked here rather than at submit, where the storeman has already
    // built the whole note.
    const variantId = row.variantId;
    if (!variantId) return setFormError("That line is missing its variant.");
    setLines((current) => [
      ...current,
      {
        stockLineId: row.id,
        variantId,
        name: row.name,
        sku: row.sku,
        available: row.available,
        // One to start with: the storeman came here to send at least one.
        quantity: 1,
      },
    ]);
    setPickQuery("");
    setPickOpen(false);
    setFormError(null);
  };

  const setLineQuantity = (stockLineId: string, next: number) =>
    setLines((current) =>
      current.map((l) =>
        l.stockLineId === stockLineId
          ? { ...l, quantity: Math.max(0, Math.min(l.available, next)) }
          : l
      )
    );

  const removeLine = (stockLineId: string) =>
    setLines((current) => current.filter((l) => l.stockLineId !== stockLineId));

  const createTransfer = async () => {
    if (!draft.from) return setFormError("Pick a source warehouse.");
    if (!draft.to) return setFormError("Pick a destination warehouse.");
    if (draft.from === draft.to) return setFormError("Source and destination must differ.");
    // This branch stands at one end or the other. Two branches that are both
    // somewhere else are moving stock between two places nobody here is, and
    // the API refuses it on save anyway.
    if (here && draft.from !== here.id && draft.to !== here.id) {
      return setFormError(`A transfer has to start or end at ${here.name}.`);
    }
    if (lines.length === 0) return setFormError("Add at least one product to send.");

    const empty = lines.find((l) => l.quantity <= 0);
    if (empty) return setFormError(`Enter a quantity for ${empty.name}.`);
    const over = lines.find((l) => l.quantity > l.available);
    if (over) return setFormError(`Only ${over.available} of ${over.name} available there.`);

    setSaving(true);
    setFormError(null);
    try {
      // A draft. Nothing leaves the shelf until it is dispatched — the screen
      // used to build a record in local state and call it created.
      const created = await TransferService.createTransfer(
        {
          referenceNo: transferRef(),
          fromWarehouseId: draft.from,
          toWarehouseId: draft.to,
          items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        },
        // Drafting stock OUT of another branch is asking that branch to send
        // it. The API checks the caller may write to the SOURCE, so the request
        // says which branch it is being made on behalf of. Nothing moves either
        // way: only the source branch can dispatch it.
        asBranch
      );
      setNote(`${created.transferId} drafted — dispatch it to move the stock`);
      setDraft({ ...blank });
      setLines([]);
      setPickQuery("");
      setCreateOpen(false);
      setPage(1);
      // A draft holds stock in place but does not move it yet, so the list is
      // the thing that changed.
      invalidate("transfers");
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
          <button
            type="button"
            onClick={() => {
              // Sending out is the common case, so this branch starts as the
              // source. Picking another branch on either side flips it — see
              // `pickEnd`.
              setDraft({ ...blank, from: here?.id ?? "" });
              setLines([]);
              setPickQuery("");
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
          {(["from", "to"] as const).map((k) => {
            const other = k === "from" ? draft.to : draft.from;
            return (
            <label key={k} className="flex flex-col gap-[6px]">
              <span className="text-[14px] font-medium tracking-[-0.28px] text-[#525252]">
                {k === "from" ? "From" : "To"}
              </span>
              <select
                value={draft[k]}
                aria-label={k === "from" ? "Transfer from" : "Transfer to"}
                onChange={(e) => pickEnd(k, e.target.value)}
                className={`${FORM_FIELD} cursor-pointer`}
              >
                <option value="">Select a warehouse</option>
                {/* This branch, plus everywhere else. The OTHER end is left
                    off — the API refuses a transfer to the warehouse it came
                    from (TRANSFER_SAME_WAREHOUSE), so offering it is offering a
                    choice that can only end in an error message. */}
                {(here ? [here, ...elsewhere] : warehouses)
                  .filter((w) => w.id !== other)
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                      {here && w.id === here.id ? " (here)" : ""}
                    </option>
                  ))}
              </select>
            </label>
            );
          })}

          {/* Says what just happened, because the other end filling itself in
              is otherwise a surprise. */}
          {here && (draft.from || draft.to) && (
            <p className="text-[12px] leading-[1.5] text-[#8a8a8a]">
              {draft.from === here.id && draft.to
                ? `Sending out of ${here.name}.`
                : draft.to === here.id && draft.from
                  ? `Receiving into ${here.name} — only ${
                      warehouses.find((w) => w.id === draft.from)?.name ?? "that branch"
                    } can dispatch it.`
                  : `${here.name} is one end of every transfer you make here.`}
            </p>
          )}

          {/* Type a name, pick it, set how many — as many times as the van
              holds. The API has always taken a list of lines; this screen sent
              exactly one, so a shop moving six products drafted six transfers. */}
          <div className="flex flex-col gap-[6px]">
            <span className="text-[14px] font-medium tracking-[-0.28px] text-[#525252]">
              Products
            </span>
            <div className="relative">
              <input
                value={pickQuery}
                disabled={!draft.from}
                onChange={(e) => {
                  setPickQuery(e.target.value);
                  setPickOpen(true);
                  setFormError(null);
                }}
                onFocus={() => setPickOpen(true)}
                // A click on an option has to land before the list closes.
                onBlur={() => window.setTimeout(() => setPickOpen(false), 140)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && pickable.length > 0) {
                    e.preventDefault();
                    addLine(pickable[0]);
                  }
                  if (e.key === "Escape") setPickOpen(false);
                }}
                placeholder={
                  draft.from
                    ? "Search a product in that warehouse…"
                    : "Pick a source warehouse first"
                }
                aria-label="Product to transfer"
                className={`${FORM_FIELD} disabled:opacity-60`}
              />
              {pickOpen && draft.from && (
                <div className="absolute top-[48px] right-0 left-0 z-40 max-h-[220px] overflow-y-auto rounded-[10px] bg-white py-[4px] shadow-[0_8px_30px_rgba(0,0,0,0.10)] ring-1 ring-[#eaeaea]">
                  {sourceStockQuery.loading && (
                    <p className="px-[14px] py-[9px] text-[13px] text-[#8f8d87]">Loading stock…</p>
                  )}
                  {!sourceStockQuery.loading && pickable.length === 0 && (
                    <p className="px-[14px] py-[9px] text-[13px] text-[#8f8d87]">
                      {pickQuery.trim()
                        ? "Nothing in that warehouse matches."
                        : "Everything in stock there is already on this note."}
                    </p>
                  )}
                  {pickable.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => addLine(r)}
                      className="flex w-full cursor-pointer items-center justify-between gap-[10px] px-[14px] py-[9px] text-left transition-colors hover:bg-[#fafafa]"
                    >
                      <span className="min-w-0 truncate text-[13px] text-[#525252]">
                        {r.name}
                        <span className="text-[#a3a3a3]"> · {r.sku}</span>
                      </span>
                      <span className="shrink-0 text-[12px] tabular-nums text-[#8f8d87]">
                        {r.available} available
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {lines.length > 0 && (
            <div className="flex flex-col gap-[6px] rounded-[10px] border border-solid border-[#eaeaea] p-[8px]">
              {lines.map((l) => (
                <div key={l.stockLineId} className="flex items-center gap-[8px]">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] text-[#1e1e1e]">{l.name}</span>
                    <span className="truncate text-[11px] text-[#8f8d87]">
                      {l.sku} · {l.available} available
                    </span>
                  </span>
                  <input
                    value={String(l.quantity)}
                    onChange={(e) => {
                      setLineQuantity(l.stockLineId, Number(e.target.value.replace(/[^\d]/g, "")) || 0);
                      setFormError(null);
                    }}
                    inputMode="numeric"
                    aria-label={`Quantity of ${l.name}`}
                    className="h-[36px] w-[70px] shrink-0 rounded-[8px] bg-white text-center text-[13px] tabular-nums text-[#1e1e1e] shadow-[inset_0_0_0_1px_#eaeaea] outline-none focus:shadow-[inset_0_0_0_1.5px_#f5b800]"
                  />
                  <button
                    type="button"
                    onClick={() => removeLine(l.stockLineId)}
                    aria-label={`Remove ${l.name}`}
                    className="shrink-0 cursor-pointer px-[4px] text-[16px] leading-none text-[#a3a3a3] transition-colors hover:text-[#ef4444]"
                  >
                    ×
                  </button>
                </div>
              ))}
              <p className="pt-[2px] text-[12px] text-[#8a8a8a]">
                {lines.length} product{lines.length === 1 ? "" : "s"} ·{" "}
                {lines.reduce((n, l) => n + l.quantity, 0)} units
              </p>
            </div>
          )}

          <p className="text-[12px] text-[#8a8a8a]">
            A new transfer is a draft. Dispatching it takes the stock off the source
            branch&rsquo;s shelf; receiving it puts the same units on the destination
            branch&rsquo;s. Nothing moves until then.
          </p>
          {formError && <p className="text-[13px] text-[#ef4444]">{formError}</p>}
        </div>
      </Modal>
    </div>
  );
}
