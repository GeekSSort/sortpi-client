"use client";

import React, { useEffect, useRef, useState } from "react";
import { PurchaseRecord } from "@/types/purchases";
import { PurchaseService } from "@/services";
import StatusPill, { Tone } from "@/components/shared/StatusPill";
import RowActionMenu from "@/components/shared/RowActionMenu";
import TablePagination from "@/components/shared/TablePagination";
import TableSkeleton from "@/components/shared/TableSkeleton";
import Avatar from "@/components/shared/Avatar";
import DateField from "@/components/shared/DateField";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY } from "@/components/shared/Modal";
import { toApiDay } from "@/lib/dateFilter";

/**
 * Figma: SORTPoint — Purchase History 59:15218.
 *
 * Search left, date field right (this screen has no Add New); an 898px card
 * with the 1128-wide eight-column table (40px head, 54px rows) over the 64px
 * pagination bar.
 */

const PAYMENT_TONE: Record<PurchaseRecord["paymentStatus"], Tone> = {
  Paid: "green",
  Due: "gold",
  // Not drawn in the design; same construction, amber.
  Partial: "amber",
};

const STATUS_TONE: Record<PurchaseRecord["status"], Tone> = {
  Received: "green",
  Pending: "gold",
  Ordered: "slate",
  Cancelled: "rose",
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

// Purchase ID  Supplier  Purchase Date  Items  Total Amount  Payment Status  Status  Action
const GRID = "grid-cols-[157fr_220fr_144fr_114fr_130fr_140fr_140fr_83fr]";
const CELL = "flex min-w-0 items-center p-[12px]";
const HEAD = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e]";
const TEXT = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]";

export default function PurchasesPage() {
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [query, setQuery] = useState("");
  const [date, setDate] = useState<Date | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [note, setNote] = useState<string | null>(null);
  const [detailOf, setDetailOf] = useState<PurchaseRecord | null>(null);
  const [receiptOf, setReceiptOf] = useState<PurchaseRecord | null>(null);
  const [markOf, setMarkOf] = useState<{ row: PurchaseRecord; kind: "received" | "paid" } | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [markError, setMarkError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  /** The debounce is for typing. Waiting 250ms to make the FIRST request
      just adds a quarter second of blank table on reload. */
  const firstLoad = useRef(true);
  /** The API's count of everything matching, not of what this page holds. */
  const [total, setTotal] = useState(0);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    // Debounced and guarded: a request per keystroke let a slow answer for
    // "PO" land after "PO-12" and repopulate the table with the wrong rows.
    // The day and the page go to the API too — both used to be applied in the
    // browser over one capped page, so an older day found nothing that had not
    // already been fetched and the pager called 200 the total.
    let live = true;
    const day = date ? toApiDay(date) : undefined;
    const id = setTimeout(() => {
      setLoading(true);
      PurchaseService.getPurchases({
        search: query,
        startDate: day,
        endDate: day,
        page,
        limit: pageSize,
      })
        .then((res) => {
          if (!live) return;
          setPurchases(res.data);
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

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages);
  // The server already filtered and sliced. `rows` is the page.
  const rows = purchases;

  /** DRAFT -> CONFIRMED. The order is placed; nothing has arrived yet. */
  const confirmOrder = async (row: PurchaseRecord) => {
    if (working) return;
    setWorking(true);
    try {
      await PurchaseService.confirm(row.id);
      setNote(`${row.purchaseId} confirmed`);
      setRefresh((n) => n + 1);
    } catch (err) {
      setNote(
        err instanceof Error && err.message
          ? `${row.purchaseId}: ${err.message}`
          : `${row.purchaseId} could not be confirmed.`
      );
    } finally {
      setWorking(false);
    }
  };

  const cancelOrder = async (row: PurchaseRecord) => {
    if (working) return;
    setWorking(true);
    try {
      await PurchaseService.cancel(row.id);
      setNote(`${row.purchaseId} cancelled`);
      setRefresh((n) => n + 1);
    } catch (err) {
      setNote(
        err instanceof Error && err.message
          ? `${row.purchaseId}: ${err.message}`
          : `${row.purchaseId} could not be cancelled.`
      );
    } finally {
      setWorking(false);
    }
  };

  /**
   * Receiving books the goods in and moves stock; paying posts to the supplier
   * ledger. Both are real endpoints — this screen used to change the row and
   * nothing else, so an order could read Received with no stock behind it.
   */
  const applyMark = async () => {
    if (!markOf || working) return;
    setWorking(true);
    setMarkError(null);
    try {
      if (markOf.kind === "received") {
        // No lines: everything still outstanding arrives.
        await PurchaseService.receive(markOf.row.id);
        setNote(`${markOf.row.purchaseId} received — stock booked in`);
      } else {
        const amount = Number(payAmount);
        if (!payAmount.trim() || Number.isNaN(amount) || amount <= 0) {
          setWorking(false);
          return setMarkError("Enter an amount greater than zero.");
        }
        await PurchaseService.recordPayment(markOf.row.id, amount);
        setNote(`৳ ${amount.toLocaleString("en-IN")} paid on ${markOf.row.purchaseId}`);
      }
      setMarkOf(null);
      setPayAmount("");
      // Refetch rather than patch: the ledger owns these numbers.
      setRefresh((n) => n + 1);
    } catch (err) {
      setMarkError(
        err instanceof Error && err.message ? err.message : "That could not be recorded."
      );
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-[14px] select-none">
      {/* Headline — 59:15220 */}
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
              placeholder="Search by Purchase ID or Supplier..."
              aria-label="Search purchases"
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

        <DateField value={date} onChange={setDate} ariaLabel="Filter purchases by date" />
      </div>

      {/* Table card — 59:15252 */}
      <div className="w-full overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
        <div className="hidden px-[16px] pt-[16px] md:block">
          <div className="overflow-x-auto">
            <div className="min-w-[1128px]">
              <div className={`grid ${GRID} items-start overflow-clip rounded-[6px] shadow-[inset_0_0_0_1px_#eaeaea]`}>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Purchase ID</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Supplier</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Purchase Date</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Items</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Total Amount</span></div>
                <div className={`${CELL} h-[40px] justify-center bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Payment Status</span></div>
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
                      ? "Purchases could not be loaded. Refresh to try again."
                      : "No purchases match that search or date."}
                  </p>
                )}
                {rows.map((r, i) => (
                  // Not a <button>: the Action cell holds one, and buttons can't nest.
                  <div
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${r.purchaseId}`}
                    onClick={() => setDetailOf(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setDetailOf(r);
                      }
                    }}
                    className={`grid ${GRID} h-[54px] cursor-pointer items-center transition-colors outline-none hover:bg-[#fafafa] focus-visible:bg-[#fffaeb] focus-visible:ring-1 focus-visible:ring-[#f5b800] focus-visible:ring-inset ${i === rows.length - 1 ? "" : "border-b border-solid border-[#eaeaea]"}`}
                  >
                    <div className={CELL}><span className={`${TEXT} truncate`}>{r.purchaseId}</span></div>
                    {/* 28px avatar, 8px from the name — 59:15334 */}
                    <div className={`${CELL} gap-[8px]`}>
                      <Avatar name={r.supplier.name} src={r.supplier.avatar} />
                      <span className={`${TEXT} truncate`}>{r.supplier.name}</span>
                    </div>
                    <div className={CELL}><span className={`${TEXT} truncate`}>{r.purchaseDate}</span></div>
                    <div className={CELL}><span className={`${TEXT} truncate`}>{r.itemsCount}</span></div>
                    <div className={CELL}><span className={`${TEXT} truncate`}>{r.totalAmountFormatted}</span></div>
                    <div className={`${CELL} justify-center`}>
                      <StatusPill label={r.paymentStatus} tone={PAYMENT_TONE[r.paymentStatus] ?? "slate"} />
                    </div>
                    <div className={`${CELL} justify-center`}>
                      <StatusPill label={r.status} tone={STATUS_TONE[r.status] ?? "slate"} />
                    </div>
                    {/* The menu lives inside the row hit area — keep its clicks to itself. */}
                    <div
                      className={`${CELL} justify-center`}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <RowActionMenu
                        label={`Actions for ${r.purchaseId}`}
                        actions={[
                          { label: "View purchase", onSelect: () => setDetailOf(r) },
                          { label: "Print order", onSelect: () => setReceiptOf(r) },
                          // An order is placed before it arrives. Confirming is
                          // its own step on the API and had no way in here.
                          ...(r.status === "Pending"
                            ? [{ label: "Confirm order", onSelect: () => confirmOrder(r) }]
                            : []),
                          ...(r.status === "Received" || r.status === "Cancelled"
                            ? []
                            : [{ label: "Receive goods", onSelect: () => setMarkOf({ row: r, kind: "received" as const }) }]),
                          ...(r.paymentStatus === "Paid" || r.status === "Cancelled"
                            ? []
                            : [
                                {
                                  label: "Record payment",
                                  onSelect: () => {
                                    setPayAmount("");
                                    setMarkError(null);
                                    setMarkOf({ row: r, kind: "paid" as const });
                                  },
                                },
                              ]),
                          ...(r.status === "Received" || r.status === "Cancelled"
                            ? []
                            : [{ label: "Cancel order", onSelect: () => cancelOrder(r) }]),
                        ]}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Stacked cards below md — also tappable */}
        <div className="flex flex-col gap-[10px] px-[16px] pt-[16px] md:hidden">
          {rows.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setDetailOf(r)}
              aria-label={`Open ${r.purchaseId}`}
              className="w-full cursor-pointer rounded-[10px] border border-solid border-[#eaeaea] p-[12px] text-left transition-colors outline-none hover:bg-[#fafafa] focus-visible:border-[#f5b800] focus-visible:bg-[#fffaeb]"
            >
              <div className="flex items-start justify-between gap-[10px]">
                <div className="flex min-w-0 items-center gap-[8px]">
                  <Avatar name={r.supplier.name} src={r.supplier.avatar} />
                  <div className="min-w-0">
                    <p className={`${TEXT} truncate !text-[#1e1e1e]`}>{r.supplier.name}</p>
                    <p className="mt-[2px] truncate text-[12px] tracking-[-0.24px] text-[#525252]">
                      {r.purchaseId}
                    </p>
                  </div>
                </div>
                <StatusPill label={r.status} tone={STATUS_TONE[r.status] ?? "slate"} />
              </div>
              <div className="mt-[10px] flex items-center justify-between gap-[10px]">
                <span className="truncate text-[12px] tracking-[-0.24px] text-[#525252]">
                  {r.purchaseDate} · {r.itemsCount} items
                </span>
                <span className={`${TEXT} shrink-0`}>{r.totalAmountFormatted}</span>
              </div>
              <div className="mt-[8px]">
                <StatusPill label={r.paymentStatus} tone={PAYMENT_TONE[r.paymentStatus] ?? "slate"} />
              </div>
            </button>
          ))}
        </div>

        {note && <p className="px-[16px] pt-[10px] text-[13px] text-[#525252]">{note}</p>}

        {/* Pagination — 59:15704 */}
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

      {/* View purchase */}
      <Modal
        open={detailOf !== null}
        onClose={() => setDetailOf(null)}
        title={`Purchase ${detailOf?.purchaseId ?? ""}`}
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
                setReceiptOf(detailOf);
                setDetailOf(null);
              }}
            >
              Print order
            </button>
          </>
        }
      >
        {detailOf && (
          <div className="flex flex-col gap-[16px]">
            <div className="flex items-center gap-[12px]">
              <Avatar name={detailOf.supplier.name} src={detailOf.supplier.avatar} size={48} radius={10} />
              <div className="min-w-0">
                <p className="truncate text-[16px] font-medium text-[#1e1e1e]">{detailOf.supplier.name}</p>
                <p className="truncate text-[13px] text-[#525252]">{detailOf.purchaseId}</p>
              </div>
            </div>
            <dl className="flex flex-col gap-[12px]">
              {[
                ["Purchase Date", detailOf.purchaseDate],
                ["Items", String(detailOf.itemsCount)],
                ["Total Amount", detailOf.totalAmountFormatted],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-[16px]">
                  <dt className="text-[14px] text-[#525252]">{k}</dt>
                  <dd className="text-[14px] font-medium text-[#1e1e1e]">{v}</dd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-[16px]">
                <dt className="text-[14px] text-[#525252]">Payment Status</dt>
                <dd>
                  <StatusPill label={detailOf.paymentStatus} tone={PAYMENT_TONE[detailOf.paymentStatus] ?? "slate"} />
                </dd>
              </div>
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

      {/* Printable purchase order */}
      <Modal
        open={receiptOf !== null}
        onClose={() => setReceiptOf(null)}
        title="Purchase order"
        width={420}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setReceiptOf(null)}>
              Close
            </button>
            <button
              type="button"
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={MODAL_PRIMARY}
              onClick={() => window.print()}
            >
              Print
            </button>
          </>
        }
      >
        {receiptOf && (
          <div className="print-area flex flex-col gap-[10px] text-[13px] text-[#525252]">
            <p className="text-center text-[16px] font-semibold text-[#1e1e1e]">SORTPoint</p>
            <p className="text-center text-[12px]">Purchase order</p>
            <div className="my-[6px] h-px w-full bg-[#eaeaea]" />
            <p className="flex justify-between"><span>Purchase</span><span className="font-medium text-[#1e1e1e]">{receiptOf.purchaseId}</span></p>
            <p className="flex justify-between"><span>Supplier</span><span>{receiptOf.supplier.name}</span></p>
            <p className="flex justify-between"><span>Date</span><span>{receiptOf.purchaseDate}</span></p>
            <p className="flex justify-between"><span>Items</span><span>{receiptOf.itemsCount}</span></p>
            <p className="flex justify-between"><span>Payment</span><span>{receiptOf.paymentStatus}</span></p>
            <p className="flex justify-between"><span>Status</span><span>{receiptOf.status}</span></p>
            <div className="my-[6px] h-px w-full bg-[#eaeaea]" />
            <p className="flex justify-between text-[15px] font-semibold text-[#1e1e1e]">
              <span>Total</span>
              <span>{receiptOf.totalAmountFormatted}</span>
            </p>
            <p className="mt-[8px] text-center text-[12px]">Authorised signature ____________________</p>
          </div>
        )}
      </Modal>

      {/* Mark received / paid */}
      <Modal
        open={markOf !== null}
        onClose={() => setMarkOf(null)}
        title={markOf?.kind === "paid" ? "Mark as paid" : "Mark as received"}
        width={440}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setMarkOf(null)}>
              Cancel
            </button>
            <button
              type="button"
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={MODAL_PRIMARY}
              disabled={working}
              onClick={applyMark}
            >
              {working
                ? "Working…"
                : markOf?.kind === "paid"
                  ? "Confirm payment"
                  : "Confirm receipt"}
            </button>
          </>
        }
      >
        {markOf && (
          <div className="flex flex-col gap-[12px]">
            <p className="text-[14px] leading-[1.6] text-[#525252]">
              {markOf.kind === "paid" ? (
                <>
                  Pay <span className="font-medium text-[#1e1e1e]">{markOf.row.supplier.name}</span> against{" "}
                  <span className="font-medium text-[#1e1e1e]">{markOf.row.purchaseId}</span>, total{" "}
                  <span className="font-medium text-[#1e1e1e]">{markOf.row.totalAmountFormatted}</span>.
                </>
              ) : (
                <>
                  Receive <span className="font-medium text-[#1e1e1e]">{markOf.row.purchaseId}</span> (
                  {markOf.row.itemsCount} items from{" "}
                  <span className="font-medium text-[#1e1e1e]">{markOf.row.supplier.name}</span>)? This books
                  the goods into stock and posts to the supplier ledger.
                </>
              )}
            </p>

            {/* A supplier is often paid in instalments, so the amount is asked
                for rather than assumed to be the whole invoice. */}
            {markOf.kind === "paid" && (
              <label className="flex flex-col gap-[6px]">
                <span className="text-[14px] font-medium tracking-[-0.28px] text-[#525252]">Amount</span>
                <input
                  autoFocus
                  value={payAmount}
                  onChange={(e) => {
                    setPayAmount(e.target.value.replace(/[^\d.]/g, ""));
                    setMarkError(null);
                  }}
                  inputMode="decimal"
                  placeholder="0"
                  aria-label="Payment amount"
                  className="flex h-[44px] items-center rounded-[10px] bg-white px-[12px] text-[14px] tracking-[-0.28px] text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] outline-none placeholder:text-[rgba(82,82,82,0.6)]"
                />
              </label>
            )}

            {markError && <p className="text-[13px] text-[#ef4444]">{markError}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
