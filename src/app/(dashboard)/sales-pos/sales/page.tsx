"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { SaleRecord } from "@/types/sales";
import { SalesService } from "@/services";
import StatusPill, { Tone } from "@/components/shared/StatusPill";
import RowActionMenu from "@/components/shared/RowActionMenu";
import TablePagination from "@/components/shared/TablePagination";
import TableSkeleton from "@/components/shared/TableSkeleton";
import DateField from "@/components/shared/DateField";
import { toApiDay } from "@/lib/dateFilter";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY, RED_GRADIENT } from "@/components/shared/Modal";

/**
 * Sales — Figma 45:3002.
 *
 * Search on the left of the headline, date and Export on the right, then the
 * table: 40px head, 54px rows, pager below.
 *
 * Below md each row becomes a card, and in between the table scrolls
 * sideways. No Figma frame for either; both are our choice.
 */

const STATUS_TONE: Record<SaleRecord["status"], Tone> = {
  Paid: "green",
  Unpaid: "orange",
  Pending: "amber",
  Refunded: "slate",
};

function ExportIcon() {
  const s = { stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg className="block size-[18px] shrink-0" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M12.33 6.675C15.03 6.9075 16.1325 8.295 16.1325 11.3325V11.43C16.1325 14.7825 14.79 16.125 11.4375 16.125H6.555C3.2025 16.125 1.86 14.7825 1.86 11.43V11.3325C1.86 8.3175 2.9475 6.93 5.6025 6.6825" {...s} />
      <path d="M9 11.25V2.715" {...s} />
      <path d="M11.5125 4.3875L9 1.875L6.4875 4.3875" {...s} />
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

const GRID = "grid-cols-[166fr_247fr_155fr_150fr_150fr_130fr_130fr]";
const CELL = "flex min-w-0 items-center p-[12px]";
const HEAD = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e]";
const TEXT = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]";

export default function SalesPage() {
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [query, setQuery] = useState("");
  const [date, setDate] = useState<Date | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [loading, setLoading] = useState(true);
  /** The debounce is for typing. Waiting 250ms to make the FIRST
      request just adds a quarter second of blank table on reload. */
  const firstLoad = useRef(true);
  /** The API's count of everything matching, not of what this page holds. */
  const [total, setTotal] = useState(0);
  const [failed, setFailed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [invoiceOf, setInvoiceOf] = useState<SaleRecord | null>(null);
  const [receiptOf, setReceiptOf] = useState<SaleRecord | null>(null);
  const [refundOf, setRefundOf] = useState<SaleRecord | null>(null);
  const [refunding, setRefunding] = useState(false);
  const undoing = refundOf?.status === "Refunded";

  useEffect(() => {
    // A keystroke used to fire a request each, and the answers raced: a slow
    // reply for "ah" could land after "ahmed" and repopulate the table with
    // the wrong rows. Wait for a pause, then let only the newest reply win.
    let live = true;
    const day = date ? toApiDay(date) : undefined;
    const id = setTimeout(() => {
      setLoading(true);
      // The day goes to the API and so does the page. Both used to be applied
      // in the browser over one capped page, so filtering to an older day
      // found nothing that had not already been fetched, and the pager called
      // 200 the total.
      SalesService.getSales({
        search: query,
        startDate: day,
        endDate: day,
        page,
        limit: pageSize,
      })
        .then((res) => {
          if (!live) return;
          setSales(res.data);
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
  }, [query, date, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages);
  // The server already filtered and sliced. `rows` is the page.
  const rows = sales;

  /** A field is safe in a CSV only once quotes are doubled and it is wrapped:
      a customer called "Rahman, Md." split one row into two columns. */
  const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

  const exportCsv = async () => {
    setExporting(true);
    setNote(null);
    try {
      // Exports what the filters actually left on screen. This also used to
      // call SalesService.exportSales(), which downloaded a SECOND file built
      // from the bundled sample rows -- two files a click, one of them fake.
      const head = ["Invoice No.", "Date & Time", "Customer", "Total Amount", "Payment Method", "Status"];
      const csv = [
        head,
        ...sales.map((s) => [
          s.invoiceNo,
          s.dateTime,
          s.customerName,
          s.totalAmount,
          s.paymentMethod,
          s.status,
        ]),
      ]
        .map((r) => r.map(csvCell).join(","))
        .join("\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "sales.csv";
      a.click();
      URL.revokeObjectURL(url);
      setNote(`Exported ${sales.length} sale${sales.length === 1 ? "" : "s"} on this page`);
    } catch {
      setNote("Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-[14px] select-none">
      {/* Headline — 45:3003 */}
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
              placeholder="Search by customer name, Invoice or Phone..."
              aria-label="Search sales"
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
          <DateField value={date} onChange={(d) => {
              setDate(d);
              // Page 1 of the new filter, not page 5 of the old one.
              setPage(1);
            }} ariaLabel="Filter sales by date" />

          <button
            type="button"
            onClick={exportCsv}
            disabled={exporting}
            style={{
              backgroundImage:
                "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 100%), linear-gradient(90deg, rgb(245,184,0) 0%, rgb(245,184,0) 100%)",
            }}
            className="flex h-[48px] cursor-pointer items-center justify-center gap-[8px] overflow-clip rounded-[10px] border border-solid border-[#f5b800] px-[24px] text-[14px] leading-[1.5] font-semibold tracking-[-0.28px] whitespace-nowrap text-white shadow-[inset_0px_0px_0px_1.8px_rgba(255,255,255,0.25)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            <ExportIcon />
            Export
          </button>
        </div>
      </div>

      {/* Table card — 45:3098 */}
      <div className="w-full overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
        {/* Table — 45:3102 */}
        <div className="hidden px-[16px] pt-[16px] md:block">
          <div className="overflow-x-auto">
            <div className="min-w-[1128px]">
              <div className={`grid ${GRID} items-start overflow-clip rounded-[6px] shadow-[inset_0_0_0_1px_#eaeaea]`}>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Invoice No.</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Date &amp; Time</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Customer</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Total Amount</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Payment Method</span></div>
                <div className={`${CELL} h-[40px] justify-center bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Status</span></div>
                <div className={`${CELL} h-[40px] justify-center bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Action</span></div>
              </div>

              <div className="mt-[6px]">
                {rows.length === 0 && loading && (
                  <TableSkeleton columns={GRID} rows={pageSize} />
                )}
                {rows.length === 0 && !loading && (
                  <p className="py-[40px] text-center text-[14px] text-[#525252]">
                    {loading
                      ? "Loading sales…"
                      : failed
                        ? "Sales could not be loaded. Refresh to try again."
                        : "No sales match that search or date."}
                  </p>
                )}
                {rows.map((s, i) => (
                  <div
                    key={s.id}
                    className={`grid ${GRID} h-[54px] items-center ${i === rows.length - 1 ? "" : "border-b border-solid border-[#eaeaea]"}`}
                  >
                    <div className={`${CELL}`}><span className={`${TEXT} truncate`}>{s.invoiceNo}</span></div>
                    <div className={`${CELL}`}><span className={`${TEXT} truncate`}>{s.dateTime}</span></div>
                    <div className={`${CELL}`}><span className={`${TEXT} truncate`}>{s.customerName}</span></div>
                    <div className={`${CELL}`}><span className={`${TEXT} truncate`}>{s.totalAmountFormatted}</span></div>
                    <div className={`${CELL}`}><span className={`${TEXT} truncate`}>{s.paymentMethod}</span></div>
                    <div className={`${CELL} justify-center`}>
                      <StatusPill label={s.status} tone={STATUS_TONE[s.status] ?? "slate"} />
                    </div>
                    <div className={`${CELL} justify-center`}>
                      <RowActionMenu
                        label={`Actions for ${s.invoiceNo}`}
                        actions={[
                          { label: "View invoice", onSelect: () => setInvoiceOf(s) },
                          { label: "Print receipt", onSelect: () => setReceiptOf(s) },
                          {
                            label: s.status === "Refunded" ? "Withdraw refund" : "Refund",
                            onSelect: () => setRefundOf(s),
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
          {rows.map((s) => (
            <div key={s.id} className="rounded-[10px] border border-solid border-[#eaeaea] p-[12px]">
              <div className="flex items-start justify-between gap-[10px]">
                <div className="min-w-0">
                  <p className={`${TEXT} truncate !text-[#1e1e1e]`}>{s.invoiceNo}</p>
                  <p className="mt-[2px] truncate text-[12px] tracking-[-0.24px] text-[#525252]">{s.customerName}</p>
                </div>
                <StatusPill label={s.status} tone={STATUS_TONE[s.status] ?? "slate"} />
              </div>
              <div className="mt-[10px] flex items-center justify-between gap-[10px]">
                <span className="truncate text-[12px] tracking-[-0.24px] text-[#525252]">{s.dateTime}</span>
                <span className={`${TEXT} shrink-0`}>{s.totalAmountFormatted}</span>
              </div>
              <p className="mt-[4px] text-[12px] tracking-[-0.24px] text-[#525252]">{s.paymentMethod}</p>
            </div>
          ))}
        </div>

        {note && <p className="px-[16px] pt-[10px] text-[13px] text-[#525252]">{note}</p>}

        {/* Pagination — 45:3224 */}
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

      {/* View invoice */}
      <Modal
        open={invoiceOf !== null}
        onClose={() => setInvoiceOf(null)}
        title={`Invoice ${invoiceOf?.invoiceNo ?? ""}`}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setInvoiceOf(null)}>
              Close
            </button>
            <button
              type="button"
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={MODAL_PRIMARY}
              onClick={() => {
                setReceiptOf(invoiceOf);
                setInvoiceOf(null);
              }}
            >
              Print receipt
            </button>
          </>
        }
      >
        {invoiceOf && (
          <dl className="flex flex-col gap-[12px]">
            {[
              ["Invoice No.", invoiceOf.invoiceNo],
              ["Date & Time", invoiceOf.dateTime],
              ["Customer", invoiceOf.customerName],
              ["Payment Method", invoiceOf.paymentMethod],
              ["Total Amount", invoiceOf.totalAmountFormatted],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-[16px]">
                <dt className="text-[14px] text-[#525252]">{k}</dt>
                <dd className="text-[14px] font-medium text-[#1e1e1e]">{v}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-[16px]">
              <dt className="text-[14px] text-[#525252]">Status</dt>
              <dd>
                <StatusPill label={invoiceOf.status} tone={STATUS_TONE[invoiceOf.status] ?? "slate"} />
              </dd>
            </div>
          </dl>
        )}
      </Modal>

      {/* Print receipt — the print stylesheet hides everything but .print-area */}
      <Modal
        open={receiptOf !== null}
        onClose={() => setReceiptOf(null)}
        title="Receipt"
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
            <p className="text-center text-[12px]">Smart POS · Simply Business</p>
            <div className="my-[6px] h-px w-full bg-[#eaeaea]" />
            <p className="flex justify-between"><span>Invoice</span><span className="font-medium text-[#1e1e1e]">{receiptOf.invoiceNo}</span></p>
            <p className="flex justify-between"><span>Date</span><span>{receiptOf.dateTime}</span></p>
            <p className="flex justify-between"><span>Customer</span><span>{receiptOf.customerName}</span></p>
            <p className="flex justify-between"><span>Payment</span><span>{receiptOf.paymentMethod}</span></p>
            <div className="my-[6px] h-px w-full bg-[#eaeaea]" />
            <p className="flex justify-between text-[15px] font-semibold text-[#1e1e1e]">
              <span>Total</span>
              <span>{receiptOf.totalAmountFormatted}</span>
            </p>
            <p className="mt-[8px] text-center text-[12px]">Thank you for your purchase.</p>
          </div>
        )}
      </Modal>

      {/* Refund / Withdraw refund — same dialog, opposite directions */}
      <Modal
        open={refundOf !== null}
        onClose={() => setRefundOf(null)}
        title={undoing ? "Withdraw refund" : "Refund sale"}
        width={440}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setRefundOf(null)}>
              Cancel
            </button>
            <button
              type="button"
              disabled={refunding}
              style={{ backgroundImage: undoing ? GOLD_GRADIENT : RED_GRADIENT }}
              className={MODAL_PRIMARY}
              onClick={() => {
                if (!refundOf) return;
                setRefunding(true);
                // Changed on screen only: there is no refund endpoint yet.
                const next: SaleRecord["status"] = undoing ? "Paid" : "Refunded";
                setSales((list) => list.map((x) => (x.id === refundOf.id ? { ...x, status: next } : x)));
                setNote(
                  undoing
                    ? `Refund withdrawn — ${refundOf.invoiceNo} is Paid again`
                    : `${refundOf.invoiceNo} marked as refunded`
                );
                setRefundOf(null);
                setRefunding(false);
              }}
            >
              {refunding ? "Working…" : undoing ? "Confirm withdrawal" : "Confirm refund"}
            </button>
          </>
        }
      >
        {refundOf && (
          <p className="text-[14px] leading-[1.6] text-[#525252]">
            {undoing ? (
              <>
                Withdraw the refund of{" "}
                <span className="font-medium text-[#1e1e1e]">{refundOf.totalAmountFormatted}</span> on invoice{" "}
                <span className="font-medium text-[#1e1e1e]">{refundOf.invoiceNo}</span>? The sale goes back to
                Paid.
              </>
            ) : (
              <>
                Refund <span className="font-medium text-[#1e1e1e]">{refundOf.totalAmountFormatted}</span> for
                invoice <span className="font-medium text-[#1e1e1e]">{refundOf.invoiceNo}</span> to{" "}
                <span className="font-medium text-[#1e1e1e]">{refundOf.customerName}</span>? The sale will be
                marked as Refunded.
              </>
            )}
          </p>
        )}
      </Modal>
    </div>
  );
}
