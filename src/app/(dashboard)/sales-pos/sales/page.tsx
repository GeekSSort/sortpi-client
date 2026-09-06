"use client";

import React, { useEffect, useState } from "react";
import { SaleRecord } from "@/types/sales";
import { SalesService } from "@/services";
import StatusPill, { Tone } from "@/components/shared/StatusPill";
import RowActionMenu from "@/components/shared/RowActionMenu";
import TablePagination from "@/components/shared/TablePagination";
import TableSkeleton from "@/components/shared/TableSkeleton";
import DateField from "@/components/shared/DateField";
import { toApiDay } from "@/lib/dateFilter";
import { formatMoney } from "@/lib/format";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY, RED_GRADIENT } from "@/components/shared/Modal";
import { useQuery, queryKey, setQueryData } from "@/lib/query/useQuery";
import { QueryBoundary, RefreshBar, EmptyState, ErrorState } from "@/components/shared/QueryBoundary";
import { DetailSkeleton } from "@/components/shared/Skeleton";
import Receipt from "@/components/shared/Receipt";
import { useShopProfile } from "@/components/shared/useShopProfile";

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

/** An invoice states the money to the paisa; whole taka hides a 25p line. */
const MONEY = { decimals: 2 } as const;

export default function SalesPage() {
  const [query, setQuery] = useState("");
  /** The debounce settles the term before it reaches the cache key: typing is
      one request rather than one per letter, and a slow reply for "ah" can no
      longer land on top of the rows for "ahmed" — it belongs to a key that is
      no longer on screen. */
  const [term, setTerm] = useState("");
  const [date, setDate] = useState<Date | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [exporting, setExporting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [invoiceOf, setInvoiceOf] = useState<SaleRecord | null>(null);
  const [receiptOf, setReceiptOf] = useState<SaleRecord | null>(null);

  // The shop's own masthead, shared with the till's cache entry.
  const { shop } = useShopProfile();

  /**
   * The lines only exist on the detail endpoint, and only matter while the
   * receipt is open — `enabled` keeps the list screen from fetching one sale
   * at a time as somebody scrolls.
   */
  /**
   * The lines and the money breakdown for whichever sale is open — the detail
   * modal or the receipt, since they are the same record. `enabled` keeps the
   * list from fetching one sale per row as somebody scrolls.
   */
  const openSaleId = invoiceOf?.id ?? receiptOf?.id ?? null;
  const {
    data: saleDetail,
    loading: saleDetailLoading,
    error: saleDetailError,
    refetch: refetchSale,
  } = useQuery(
    queryKey("sales", { detail: openSaleId ?? "none" }),
    () => SalesService.getSale(openSaleId!),
    { enabled: openSaleId !== null }
  );
  const [refundOf, setRefundOf] = useState<SaleRecord | null>(null);
  const [refunding, setRefunding] = useState(false);

  useEffect(() => {
    if (query === term) return;
    const id = setTimeout(() => setTerm(query), 250);
    return () => clearTimeout(id);
  }, [query, term]);

  // The day goes to the API and so does the page, and both are part of the
  // key. Both used to be applied in the browser over one capped page, so
  // filtering to an older day found nothing that had not already been
  // fetched, and the pager called 200 the total.
  const day = date ? toApiDay(date) : undefined;
  const key = queryKey("sales", { page, limit: pageSize, search: term, day });
  const { data, loading, fetching, error, refetch } = useQuery(key, () =>
    SalesService.getSales({
      search: term,
      startDate: day,
      endDate: day,
      page,
      limit: pageSize,
    })
  );

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages);
  // The server already filtered and sliced. `rows` is the page.
  const sales = data?.data ?? [];
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
    <div className="flex w-full flex-col gap-[14px]">
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
      <div className="relative w-full overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
        <RefreshBar active={fetching} />
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
                <QueryBoundary
                  loading={loading}
                  error={error}
                  hasData={data !== undefined}
                  skeleton={<TableSkeleton columns={GRID} rows={pageSize} />}
                  errorMessage="Sales could not be loaded."
                  onRetry={refetch}
                >
                {rows.length === 0 && (
                  <EmptyState
                    message={
                      term || date ? "No sales match that search or date." : "No sales yet."
                    }
                    hint={term || date ? undefined : "Sales rung up at the till show up here."}
                  />
                )}
                {rows.map((s, i) => (
                  <div
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open invoice ${s.invoiceNo}`}
                    onClick={() => setInvoiceOf(s)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setInvoiceOf(s);
                      }
                    }}
                    className={`grid ${GRID} h-[54px] cursor-pointer items-center transition-colors hover:bg-[#fafafa] ${i === rows.length - 1 ? "" : "border-b border-solid border-[#eaeaea]"}`}
                  >
                    <div className={`${CELL}`}><span className={`${TEXT} truncate`}>{s.invoiceNo}</span></div>
                    <div className={`${CELL}`}><span className={`${TEXT} truncate`}>{s.dateTime}</span></div>
                    <div className={`${CELL}`}><span className={`${TEXT} truncate`}>{s.customerName}</span></div>
                    <div className={`${CELL}`}><span className={`${TEXT} truncate`}>{s.totalAmountFormatted}</span></div>
                    <div className={`${CELL}`}>
                      <div className="flex flex-col min-w-0">
                        <span className={`${TEXT} truncate`}>{s.paymentMethod}</span>
                        {s.referenceNo && (
                          <span className="text-[11px] font-mono text-[#3300bc] truncate" title={`Txn: ${s.referenceNo}`}>
                            Txn: {s.referenceNo}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={`${CELL} justify-center`}>
                      <StatusPill label={s.status} tone={STATUS_TONE[s.status] ?? "slate"} />
                    </div>
                    {/* The menu sits inside a clickable row, so its own clicks
                        must not also open the invoice behind it. */}
                    <div
                      className={`${CELL} justify-center`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <RowActionMenu
                        label={`Actions for ${s.invoiceNo}`}
                        actions={[
                          { label: "View invoice", onSelect: () => setInvoiceOf(s) },
                          { label: "Print receipt", onSelect: () => setReceiptOf(s) },
                          ...(s.status !== "Refunded"
                            ? [
                                {
                                  label: "Refund",
                                  tone: "danger" as const,
                                  onSelect: () => setRefundOf(s),
                                },
                              ]
                            : []),
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
          {rows.map((s) => (
            <div
              key={s.id}
              role="button"
              tabIndex={0}
              aria-label={`Open invoice ${s.invoiceNo}`}
              onClick={() => setInvoiceOf(s)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setInvoiceOf(s);
                }
              }}
              className="cursor-pointer rounded-[10px] border border-solid border-[#eaeaea] p-[12px] transition-colors hover:bg-[#fafafa]"
            >
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
              <div className="mt-[4px] flex items-center justify-between text-[12px] tracking-[-0.24px] text-[#525252]">
                <span>{s.paymentMethod}</span>
                {s.referenceNo && (
                  <span className="font-mono text-[11px] text-[#3300bc]">Txn: {s.referenceNo}</span>
                )}
              </div>
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
        fillBody
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
          /* A column that fills the dialog body exactly.
             The item list is the only part allowed to grow, so the header
             fields and the money always sit on screen and the list takes
             whatever height is left. A fixed `max-h` on the list worked at one
             window size and pushed the totals below the fold at another. */
          <div className="flex min-h-0 flex-1 flex-col gap-[18px]">
            {/* Who and when. The row already showed these, but a modal that
                opens from a click has to stand on its own. */}
            <dl className="flex shrink-0 flex-col gap-[10px]">
              {[
                ["Invoice No.", invoiceOf.invoiceNo],
                ["Date & Time", invoiceOf.dateTime],
                ["Customer", saleDetail?.customerName || invoiceOf.customerName],
                ["Cashier", saleDetail?.cashierName || "—"],
                ["Branch", saleDetail?.branchName || "—"],
                ["Payment Method", saleDetail?.paymentMethod || invoiceOf.paymentMethod],
                ...(saleDetail?.referenceNo || invoiceOf.referenceNo
                  ? [["Transaction ID", (saleDetail?.referenceNo || invoiceOf.referenceNo)!]]
                  : []),
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-[16px]">
                  <dt className="text-[14px] text-[#525252]">{k}</dt>
                  <dd
                    className={`truncate text-[14px] font-medium ${
                      k === "Transaction ID"
                        ? "font-mono text-[#3300bc] bg-[#f8f7ff] px-2 py-0.5 rounded-[6px] border border-[#3300bc]/20"
                        : "text-[#1e1e1e]"
                    }`}
                  >
                    {v}
                  </dd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-[16px]">
                <dt className="text-[14px] text-[#525252]">Status</dt>
                <dd>
                  <StatusPill label={invoiceOf.status} tone={STATUS_TONE[invoiceOf.status] ?? "slate"} />
                </dd>
              </div>
            </dl>

            {/* What was sold, and how the total was arrived at.
                The modal used to show five summary fields and a grand total,
                which is the one thing somebody opening an invoice already knew
                from the row they clicked. The lines and the VAT and discount
                behind that figure are the reason to open it. */}
            {saleDetailLoading && !saleDetail ? (
              <DetailSkeleton rows={5} />
            ) : saleDetailError && !saleDetail ? (
              <ErrorState
                message="Could not load the items on this sale."
                onRetry={refetchSale}
                compact
              />
            ) : saleDetail ? (
              <div className="flex min-h-0 flex-1 flex-col gap-[12px]">
                <p className="shrink-0 text-[13px] leading-[1.5] font-medium tracking-[-0.26px] text-[#1e1e1e]">
                  Items ({saleDetail.items.length})
                </p>

                {/* The LIST scrolls, not the modal.
                    The dialog is capped at 90vh and scrolls its whole body, so
                    a twenty-line sale pushed Subtotal, VAT and Total off the
                    bottom — the reader had to scroll past every item to reach
                    the figure they opened the invoice for. Holding the lines to
                    their own scroller keeps the money in view at any length,
                    and the modal stops growing after about six rows.

                    The list flexes rather than carrying a fixed max-height: a
                    fixed one fits at 900px tall and pushes the totals off the
                    bottom at 800. The floor is two rows: below that the dialog
                    body scrolls as it always did, which is the right thing to
                    give up on a laptop-lid-height window. */}
                <div className="flex min-h-[4.5rem] min-w-0 flex-1 flex-col overflow-hidden rounded-[10px] shadow-[inset_0_0_0_1px_#eaeaea]">
                  <div className="grid shrink-0 grid-cols-[1fr_54px_88px_92px] border-b border-solid border-[#eaeaea] bg-[#fafafa] px-[12px] py-[8px] text-[12px] font-medium tracking-[-0.24px] text-[#525252]">
                    <span>Item</span>
                    <span className="text-center">Qty</span>
                    <span className="text-right">Price</span>
                    <span className="text-right">Total</span>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  {saleDetail.items.length === 0 ? (
                    <p className="px-[12px] py-[14px] text-[13px] text-[#525252]">
                      This sale has no line items.
                    </p>
                  ) : (
                    saleDetail.items.map((it, i) => (
                      <div
                        key={`${it.sku}-${i}`}
                        className={`grid grid-cols-[1fr_54px_88px_92px] items-center px-[12px] py-[9px] text-[13px] tracking-[-0.26px] text-[#525252] ${
                          i === saleDetail.items.length - 1
                            ? ""
                            : "border-b border-solid border-[#eaeaea]"
                        }`}
                      >
                        <span className="min-w-0 truncate text-[#1e1e1e]" title={it.name}>
                          {it.name}
                        </span>
                        <span className="text-center tabular-nums">{it.quantity}</span>
                        <span className="text-right tabular-nums">
                          {formatMoney(it.unitPrice, MONEY)}
                        </span>
                        <span className="text-right tabular-nums text-[#1e1e1e]">
                          {formatMoney(it.lineTotal, MONEY)}
                        </span>
                      </div>
                    ))
                  )}
                  </div>
                </div>

                <dl className="flex shrink-0 flex-col gap-[8px] rounded-[10px] bg-[#fafafa] px-[12px] py-[12px]">
                  {/* The rate beside the money.
                      "VAT ৳ 142.15" leaves the reader to divide in their head
                      to check it, and "Discount -৳ 50" says nothing about
                      whether that was the 10% the cashier meant to give. The
                      percentage is only shown when there is one to show. */}
                  {[
                    ["Subtotal", formatMoney(saleDetail.subtotal, MONEY), false],
                    [
                      saleDetail.discountPercent !== null
                        ? `Discount (${saleDetail.discountPercent}%)`
                        : "Discount",
                      `-${formatMoney(saleDetail.discount, MONEY)}`,
                      false,
                    ],
                    [
                      saleDetail.taxRatePercent !== null
                        ? `VAT (${saleDetail.taxRatePercent}%)`
                        : "VAT",
                      formatMoney(saleDetail.tax, MONEY),
                      false,
                    ],
                    ["Total", formatMoney(saleDetail.grandTotal, MONEY), true],
                    ["Paid", formatMoney(saleDetail.paid, MONEY), false],
                    ["Due", formatMoney(saleDetail.due, MONEY), saleDetail.due > 0],
                  ].map(([label, value, strong]) => (
                    <div
                      key={label as string}
                      className={`flex items-center justify-between gap-[16px] ${
                        label === "Total" ? "border-t border-solid border-[#eaeaea] pt-[8px]" : ""
                      }`}
                    >
                      <dt
                        className={`text-[13px] tracking-[-0.26px] ${
                          strong ? "font-medium text-[#1e1e1e]" : "text-[#525252]"
                        }`}
                      >
                        {label}
                      </dt>
                      <dd
                        className={`text-[13px] tabular-nums tracking-[-0.26px] ${
                          strong ? "font-medium text-[#1e1e1e]" : "text-[#525252]"
                        } ${label === "Due" && saleDetail.due > 0 ? "!text-[#e63946]" : ""}`}
                      >
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
          </div>
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
          <div className="print-area">
            {/* The same slip the till prints, from the same component. This
                used to be a hand-rolled block headed "SORTPoint" — the
                software's name on the customer's receipt, with no line items
                and none of the shop's own details. */}
            {saleDetailLoading && !saleDetail ? (
              <DetailSkeleton rows={7} />
            ) : saleDetail ? (
              <Receipt
                business={{
                  name: shop.name,
                  tagline: shop.tagline,
                  address: shop.address,
                  bin: shop.bin,
                }}
                title="SALES INVOICE"
                meta={[
                  { label: "Invoice No", value: saleDetail.invoiceNo || receiptOf.invoiceNo },
                  { label: "Date", value: receiptOf.dateTime },
                  { label: "Customer", value: saleDetail.customerName },
                  { label: "Cashier", value: saleDetail.cashierName || "—" },
                  { label: "Branch", value: saleDetail.branchName || "—" },
                  { label: "Payment", value: saleDetail.paymentMethod || receiptOf.paymentMethod },
                  ...(saleDetail.referenceNo || receiptOf.referenceNo
                    ? [{ label: "Txn ID", value: (saleDetail.referenceNo || receiptOf.referenceNo)! }]
                    : []),
                ]}
                items={saleDetail.items.map((it) => ({
                  name: it.name,
                  price: formatMoney(it.unitPrice, MONEY),
                  qty: it.quantity,
                  total: formatMoney(it.lineTotal, MONEY),
                }))}
                totals={[
                  { label: "Subtotal", value: formatMoney(saleDetail.subtotal, MONEY) },
                  ...(saleDetail.discount
                    ? [
                        {
                          label:
                            saleDetail.discountPercent !== null
                              ? `Discount (${saleDetail.discountPercent}%)`
                              : "Discount",
                          value: `-${formatMoney(saleDetail.discount, MONEY)}`,
                        },
                      ]
                    : []),
                  // The rate belongs on the printed slip too: a customer
                  // checking a receipt is doing the same arithmetic.
                  ...(saleDetail.tax
                    ? [
                        {
                          label:
                            saleDetail.taxRatePercent !== null
                              ? `VAT (${saleDetail.taxRatePercent}%)`
                              : "VAT",
                          value: formatMoney(saleDetail.tax, MONEY),
                        },
                      ]
                    : []),
                  { label: "Total Amount", value: formatMoney(saleDetail.grandTotal, MONEY), strong: true, ruleAbove: true },
                  { label: "Paid", value: formatMoney(saleDetail.paid, MONEY) },
                  ...(saleDetail.due
                    ? [{ label: "Due", value: formatMoney(saleDetail.due, MONEY), strong: true }]
                    : []),
                ]}
                footerNotes={["Thank you for your purchase.", "Goods once sold are exchangeable within 7 days with this receipt."]}
                system={{ name: "SORTPoint" }}
              />
            ) : (
              <ErrorState message="Could not load this receipt." onRetry={refetchSale} compact />
            )}
          </div>
        )}
      </Modal>

      {/* Refund sale */}
      <Modal
        open={refundOf !== null}
        onClose={() => {
          if (!refunding) setRefundOf(null);
        }}
        title="Refund sale"
        width={440}
        footer={
          <>
            <button
              type="button"
              disabled={refunding}
              className={MODAL_GHOST}
              onClick={() => setRefundOf(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={refunding}
              style={{ backgroundImage: RED_GRADIENT }}
              className={MODAL_PRIMARY}
              onClick={async () => {
                if (!refundOf) return;
                setRefunding(true);
                try {
                  await SalesService.refundSale(refundOf.id);
                  if (data) {
                    setQueryData(key, {
                      ...data,
                      data: data.data.map((x) =>
                        x.id === refundOf.id ? { ...x, status: "Refunded" } : x
                      ),
                    });
                  }
                  await refetch();
                  setNote(`${refundOf.invoiceNo} marked as refunded`);
                  setRefundOf(null);
                } catch (err: any) {
                  setNote(err?.message || "Failed to refund sale");
                } finally {
                  setRefunding(false);
                }
              }}
            >
              {refunding ? "Refunding…" : "Confirm refund"}
            </button>
          </>
        }
      >
        {refundOf && (
          <p className="text-[14px] leading-[1.6] text-[#525252]">
            Refund <span className="font-medium text-[#1e1e1e]">{refundOf.totalAmountFormatted}</span> for
            invoice <span className="font-medium text-[#1e1e1e]">{refundOf.invoiceNo}</span> to{" "}
            <span className="font-medium text-[#1e1e1e]">{refundOf.customerName}</span>? The sale will be
            cancelled and marked as Refunded.
          </p>
        )}
      </Modal>
    </div>
  );
}
