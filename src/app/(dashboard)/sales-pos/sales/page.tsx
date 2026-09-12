"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SaleRecord } from "@/types/sales";
import { SalesService, ReturnService } from "@/services";
import StatusPill, { Tone } from "@/components/shared/StatusPill";
import RowActionMenu from "@/components/shared/RowActionMenu";
import ScrollEnd from "@/components/shared/ScrollEnd";
import FilterDropdown from "@/components/shared/FilterDropdown";
import DateFilter, { ALL_DATES, DateValue, resolveDates } from "@/components/shared/DateFilter";
import TableSkeleton from "@/components/shared/TableSkeleton";
import { formatMoney } from "@/lib/format";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY } from "@/components/shared/Modal";
import { useQuery, queryKey } from "@/lib/query/useQuery";
import { useInfiniteRows } from "@/lib/query/useInfiniteRows";
import { CardListState, EmptyState, ErrorState, QueryBoundary, RefreshBar } from "@/components/shared/QueryBoundary";
import { DetailSkeleton } from "@/components/shared/Skeleton";
import Receipt from "@/components/shared/Receipt";
import { useShopProfile } from "@/components/shared/useShopProfile";
import { usePartialPayment } from "@/components/shared/usePartialPayment";
import { CustomerService } from "@/services";
import { clampTypedAmount } from "@/lib/money";
import { AmountLabel } from "@/components/shared/MaxButton";
import { invalidate } from "@/lib/query/useQuery";

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
  Partial: "gold",
  Unpaid: "orange",
  Pending: "amber",
  Refunded: "slate",
  // Not slate: a sale with some of its goods back is still a live invoice —
  // it may still owe money — and greying it out the way a finished one is
  // greyed would file it under "dealt with".
  "Partially Refunded": "gold",
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


/**
 * Two shapes, because the table has two.
 *
 * A shop that takes part payments needs Paid and Due beside the total; one
 * that does not would get a Paid column forever equal to Total Amount and a
 * Due column forever zero, crowding out the columns that say something. Which
 * one is live is `pos.allow_partial_payment` — see `usePartialPayment`.
 */
const GRID_FULL = "grid-cols-[166fr_247fr_155fr_150fr_150fr_130fr_130fr]";
const GRID_PARTIAL =
  "grid-cols-[145fr_195fr_140fr_128fr_165fr_120fr_130fr_112fr_105fr]";
const CELL = "flex min-w-0 items-center p-[12px]";
const HEAD = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e]";
const TEXT = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]";

/** An invoice states the money to the paisa; whole taka hides a 25p line. */
const MONEY = { decimals: 2 } as const;

export default function SalesPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  /** The debounce settles the term before it reaches the cache key: typing is
      one request rather than one per letter, and a slow reply for "ah" can no
      longer land on top of the rows for "ahmed" — it belongs to a key that is
      no longer on screen. */
  const [term, setTerm] = useState("");
  // How many rows come back per request. Not a page size anyone picks any
  // more — the table scrolls — just the size of each batch.
  const pageSize = 25;
  /** Empty is "no filter". Both go to the server: the list loads a batch at a
      time, so narrowing in the browser would only hide the rows already
      fetched. */
  const [payStatus, setPayStatus] = useState("");
  const [dates, setDates] = useState<DateValue>(ALL_DATES);
  /**
   * Whether this shop takes part payments, which decides how much of the
   * settlement this screen reports. Off, it is the table it was before part
   * payment existed: one Total Amount column and a Status of Paid.
   */
  const { allowPartial } = usePartialPayment();
  const GRID = allowPartial ? GRID_PARTIAL : GRID_FULL;
  /**
   * The filter actually in force.
   *
   * Part payment switched off while "Partial" is selected would leave the
   * list narrowed by an option no longer in the dropdown: an empty table with
   * nothing on screen to explain it. Derived rather than written back into
   * `payStatus` from an effect — that is a cascading render, and it would
   * also forget the cashier's choice if they switched the setting back on.
   */
  const livePayStatus =
    !allowPartial && (payStatus === "partial" || payStatus === "unpaid") ? "" : payStatus;
  const [exporting, setExporting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [invoiceOf, setInvoiceOf] = useState<SaleRecord | null>(null);
  /**
   * Collecting the rest of an invoice, from the row that shows it owing.
   *
   * The money is posted to the CUSTOMER's ledger with an allocation naming
   * this sale — the same endpoint the Customers screen uses — because that is
   * where a debt lives. A sale row is insert-only and settling one by editing
   * it would leave the customer's balance untouched.
   */
  const [collectFor, setCollectFor] = useState<SaleRecord | null>(null);
  const [collectAmount, setCollectAmount] = useState("");
  const [collectError, setCollectError] = useState<string | null>(null);
  const [collecting, setCollecting] = useState(false);
  /**
   * The idempotency key this collection posts under.
   *
   * Insert-only ledgers, so the key has to hold across a RETRY: a fresh one
   * per attempt turns a double-tapped Save into two payments, correctable
   * only by a manual reversing entry.
   *
   * But it must also change when the AMOUNT does. The server hashes the body
   * against the key and answers 409 to the same key carrying a different one —
   * correctly, because that is a different payment. Keyed on the dialog
   * session alone, a cashier whose 5,000 was refused and who corrected it to
   * 500 got "conflict" and no way forward but reloading the page.
   *
   * So: one session per dialog opening, and the amount in the key. The same
   * figure retried replays; a corrected figure is its own payment; a second
   * deliberate payment on the same invoice opens a new dialog and a new
   * session.
   */
  const collectSession = useRef("");
  /**
   * A latch, not the `collecting` flag.
   *
   * `collecting` is React state: two clicks landing in one tick both read
   * `false` and both call through. A ref is written synchronously, so the
   * second one sees the first. The idempotency key makes the duplicate a
   * replay rather than a second payment, but a request that never leaves is
   * better than one the server has to deduplicate — and the key only covers
   * it while the amount is unchanged.
   */
  const collectingRef = useRef(false);
  const [receiptOf, setReceiptOf] = useState<SaleRecord | null>(null);
  const [withdrawOf, setWithdrawOf] = useState<SaleRecord | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);

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
  // The refund dialog is included: it has to say which products go back on
  // the shelf, and that is on the sale's lines rather than on the list row.
  const openSaleId = invoiceOf?.id ?? receiptOf?.id ?? collectFor?.id ?? null;
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

  /**
   * What the collect dialog is allowed to take, and whose account it credits.
   *
   * The loaded DETAIL is preferred over the clicked row: both carry the
   * ledger's outstanding, but the detail was fetched when the dialog opened
   * while the row may have been sitting on screen since before someone else
   * took a payment. Guarded on the id so a detail still loading for a
   * different sale cannot set the ceiling for this one.
   *
   * The row is the fallback so the dialog opens with a sensible cap rather
   * than a disabled Max button for the length of a round trip.
   */
  const collectDetail =
    saleDetail && collectFor && saleDetail.id === collectFor.id ? saleDetail : null;
  const outstanding = collectDetail?.due ?? collectFor?.dueAmount ?? 0;
  /** Empty until the detail lands — only it carries the customer's id. */
  const customerId = collectDetail?.customerId ?? "";

  useEffect(() => {
    if (query === term) return;
    const id = setTimeout(() => setTerm(query), 250);
    return () => clearTimeout(id);
  }, [query, term]);


  // The day goes to the API and so does the page, and both are part of the
  // key. Both used to be applied in the browser over one capped page, so
  // filtering to an older day found nothing that had not already been
  // fetched, and the pager called 200 the total.
  const span = resolveDates(dates);
  // Primitives only: queryKey stringifies each value with String(), so an
  // object becomes "[object Object]" and the key stops changing when its
  // contents do — the list then keeps serving the previous filter's rows.
  const key = queryKey("sales", {
    search: term,
    from: span.from,
    to: span.to,
    payStatus: livePayStatus,
  });
  // The refund documents on the sale being withdrawn. A cancelled sale carries
  // the auto-return the cancel wrote; that is the one to undo.
  const { data: withdrawable, loading: withdrawableLoading } = useQuery(
    queryKey("returns", { invoice: withdrawOf?.invoiceNo ?? "none" }),
    () => ReturnService.getReturnsForInvoice(withdrawOf!.invoiceNo),
    { enabled: withdrawOf !== null }
  );
  /**
   * The refund this withdraw would undo: the most recent one still standing.
   *
   * The list is newest first and the API now returns confirmed refunds only —
   * a withdrawn one did not, in the end, happen — so the first row IS the
   * open refund. The `!== "Rejected"` guard this replaced was doing that job
   * in the browser, over a list that could also contain already-withdrawn
   * documents.
   *
   * Newest first matters on a sale refunded twice: withdrawing the older
   * document while a newer one stands would leave the books describing a
   * sequence that never happened.
   */
  const openRefund = useMemo(() => (withdrawable ?? [])[0] ?? null, [withdrawable]);

  const {
    rows: sales,
    total,
    loading,
    loadingMore,
    fetching,
    error,
    hasMore,
    sentinelRef,
    refetch,
  } = useInfiniteRows(
    key,
    (p, limit) =>
      SalesService.getSales({
        search: term,
        startDate: span.from,
        endDate: span.to,
        paymentStatus: livePayStatus || undefined,
        page: p,
        limit,
      }),
    { pageSize }
  );
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
      // The columns on screen, in the order they are on screen. An export
      // that carried figures the table does not show — or omitted ones it
      // does — is a spreadsheet nobody can reconcile against the page it
      // came from.
      const head = [
        "Invoice No.",
        "Date & Time",
        "Customer",
        "Total Amount",
        ...(allowPartial ? ["Amount Received", "Due"] : []),
        "Payment Method",
        "Status",
      ];
      const csv = [
        head,
        ...sales.map((s) => [
          s.invoiceNo,
          s.dateTime,
          s.customerName,
          s.totalAmount,
          ...(allowPartial ? [s.paidAmount, s.dueAmount] : []),
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
      <div className="flex w-full flex-col items-stretch gap-[16px] lg:h-[48px] lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:gap-[16px]">
        <div className="flex h-[44px] w-full items-center justify-between gap-[12px] overflow-clip rounded-[10px] bg-white px-[12px] py-[10px] shadow-[inset_0_0_0_1px_#eaeaea] lg:min-w-[220px] lg:max-w-[370px] lg:flex-1">
          <div className="flex min-w-0 flex-1 items-center gap-[6px] text-[#525252]">
            <SearchIcon />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
              placeholder="Search by customer name, Invoice or Phone..."
              aria-label="Search sales"
              className="min-w-0 flex-1 bg-transparent text-[14px] leading-[1.5] tracking-[-0.28px] text-[#525252] outline-none placeholder:text-[#525252]"
            />
          </div>
        </div>

        {/* The filters, beside the search box rather than behind a funnel:
            a narrowed list has to say on screen that it is narrowed. */}
        <div className="flex shrink-0 flex-wrap items-center gap-[12px]">
          <FilterDropdown
            label="Status"
            value={livePayStatus}
            onChange={setPayStatus}
            options={[
              { value: "", label: "Any status" },
              { value: "paid", label: "Paid" },
              // Only a shop that can CREATE these has anything to filter for.
              ...(allowPartial
                ? [
                    { value: "partial", label: "Partial" },
                    { value: "unpaid", label: "Unpaid" },
                  ]
                : []),
              { value: "partial_refund", label: "Partly refunded" },
              { value: "refunded", label: "Refunded" },
            ]}
          />
          <DateFilter value={dates} onChange={setDates} />

          <button
            type="button"
            onClick={exportCsv}
            disabled={exporting || sales.length === 0}
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
        {/* One scroller for the table, the phone cards and the load trigger.
            The trigger has to sit INSIDE it — below the scroller it never
            leaves the screen, and every page loads at once the moment the
            table opens. */}
        <div className="table-scroll">

        {/* Table — 45:3102 */}
        <div className="hidden px-[16px] pt-[16px] md:block">
          <div>
            <div className={allowPartial ? "min-w-[1400px]" : "min-w-[1128px]"}>
              <div className={`table-head grid ${GRID} items-start overflow-clip rounded-[6px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]`}>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Invoice No.</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Date &amp; Time</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Customer</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Total Amount</span></div>
                {allowPartial && (
                  <>
                    {/* "Amount Received" — the till's own words for it. The
                        payment dialog asks for an amount received, so the
                        column reporting it says the same thing; "Paid" also
                        collided with the Paid in the Status column beside it. */}
                    <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Amount Received</span></div>
                    <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Due</span></div>
                  </>
                )}
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Payment Method</span></div>
                <div className={`${CELL} h-[40px] justify-center bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Status</span></div>
                <div className={`${CELL} h-[40px] justify-center bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Action</span></div>
              </div>

              <div className="mt-[6px]">
                <QueryBoundary
                  loading={loading}
                  error={error}
                  hasData={!loading && !error}
                  skeleton={<TableSkeleton columns={GRID} rows={pageSize} />}
                  errorMessage="Sales could not be loaded."
                  onRetry={refetch}
                >
                {rows.length === 0 && (
                  <EmptyState
                    message={
                      term || dates.mode !== "all" ? "No sales match that search or date." : "No sales yet."
                    }
                    hint={term || dates.mode !== "all" ? undefined : "Sales rung up at the till show up here."}
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
                    {allowPartial && (
                      <>
                        <div className={`${CELL}`}><span className={`${TEXT} truncate`}>{s.paidAmountFormatted}</span></div>
                        {/* Red only when there IS one. Money still owed is
                            what this column exists to surface, and a column of
                            red zeroes would bury the rows that matter. */}
                        <div className={`${CELL}`}>
                          <span className={`${TEXT} truncate ${s.dueAmount > 0 ? "!font-semibold !text-[#e63946]" : ""}`}>
                            {s.dueAmountFormatted}
                          </span>
                        </div>
                      </>
                    )}
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
                                  // To the returns FORM, carrying the invoice.
                                  //
                                  // This opened a modal that refunded the
                                  // WHOLE sale — there was nowhere in it to say
                                  // "two of the four came back", so a partial
                                  // return meant closing it, walking to
                                  // /sales-pos/return/new and typing the
                                  // invoice number off the row you had just
                                  // been looking at. That page already picks
                                  // lines and quantities; this hands it the
                                  // invoice.
                                  onSelect: () =>
                                    router.push(
                                      `/sales-pos/return/new?invoice=${encodeURIComponent(
                                        s.invoiceNo
                                      )}`
                                    ),
                                },
                              ]
                            : []),
                          /**
                           * Withdraw whenever ANYTHING has already come back.
                           *
                           * This was the `else` of the branch above, so it
                           * appeared only on a fully refunded sale — a partly
                           * refunded one offered Refund and nothing else. That
                           * was survivable while the Returns list carried its
                           * own Withdraw; it no longer does, and without this
                           * a refund of two items out of four could not be
                           * undone from anywhere in the application.
                           */
                          ...(s.status === "Refunded" || s.status === "Partially Refunded"
                            ? [
                                {
                                  label: "Withdraw refund",
                                  onSelect: () => setWithdrawOf(s),
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
          {/* Below md there is no table, so the boundary around it never
              speaks here. Without this the phone showed one blank card for
              loading, for failure and for an empty list alike. */}
          <CardListState
            loading={loading}
            error={error}
            hasData={!loading && !error}
            isEmpty={rows.length === 0}
            errorMessage="Sales could not be loaded."
            emptyMessage={term || dates.mode !== "all" ? "No sales match that search or date." : "No sales yet."}
            onRetry={refetch}
            rows={4}
          />
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
              {/* Below md the columns become rows, so the settlement gets a
                  line of its own rather than being dropped: a phone is where
                  a shopkeeper checks who still owes them. */}
              {allowPartial && (
                <div className="mt-[4px] flex items-center justify-between text-[12px] tracking-[-0.24px] text-[#525252]">
                  <span>Received {s.paidAmountFormatted}</span>
                  <span className={s.dueAmount > 0 ? "font-semibold text-[#e63946]" : ""}>
                    Due {s.dueAmountFormatted}
                  </span>
                </div>
              )}
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

        {/* The pager was here (45:3224). The table scrolls instead, and this
            is both the end-of-list line and the thing that asks for more. */}
        <ScrollEnd
          sentinelRef={sentinelRef}
          hasMore={hasMore}
          loadingMore={loadingMore}
          shown={rows.length}
          total={total}
          noun="sales"
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
            {/* Only while something is actually owed. A settled invoice with a
                Collect button on it invites a payment the server will refuse,
                and a cancelled one is not a debt at all. The figure comes from
                the loaded detail, which is the ledger's answer — the row's own
                Due is the same number until a refetch is in flight. */}
            {(saleDetail?.due ?? invoiceOf?.dueAmount ?? 0) > 0 &&
              invoiceOf?.status !== "Refunded" && (
                <button
                  type="button"
                  className={MODAL_GHOST}
                  onClick={() => {
                    const sale = invoiceOf;
                    if (!sale) return;
                    setCollectAmount("");
                    setCollectError(null);
                    collectSession.current = `${sale.id}-${Date.now().toString(36)}`;
                    setInvoiceOf(null);
                    setCollectFor(sale);
                  }}
                >
                  Collect payment
                </button>
              )}
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
                    /**
                     * The split, when it says anything.
                     *
                     * Off, and fully settled, Paid is the total again and Due
                     * is zero — two rows restating the one above them, which
                     * is the breakdown this panel showed before part payment
                     * existed. A sale that DOES carry a debt keeps them
                     * whatever the setting says: money owed is not hidden by
                     * a display preference, and a shop that switched the
                     * setting off still has to see what it was owed from
                     * before.
                     */
                    ...(allowPartial || saleDetail.due > 0
                      ? [
                          ["Paid", formatMoney(saleDetail.paid, MONEY), false],
                          ["Due", formatMoney(saleDetail.due, MONEY), saleDetail.due > 0],
                        ]
                      : []),
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
                used to be a hand-rolled block headed "SortPi" — the
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
                customer={{
                  name: saleDetail.customerName,
                  phone: saleDetail.customerPhone,
                }}
                meta={[
                  { label: "Invoice No", value: saleDetail.invoiceNo || receiptOf.invoiceNo },
                  { label: "Date", value: receiptOf.dateTime },
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
                  // A reprint has to match the slip handed over at the
                  // counter, so it follows the till's rule: the settlement
                  // when the shop takes part payments or this sale carries a
                  // debt, and the plain Net Payable line otherwise.
                  ...(allowPartial || saleDetail.due > 0
                    ? [
                        { label: "Paid", value: formatMoney(saleDetail.paid, MONEY), strong: true },
                        ...(saleDetail.due > 0
                          ? [{ label: "Due", value: formatMoney(saleDetail.due, MONEY), strong: true }]
                          : []),
                        /**
                         * The word, not just the figures — a reprint showing
                         * two numbers left the customer to work out whether
                         * the sale was settled.
                         *
                         * The ROW's status, which is the one the list shows.
                         * This was `paymentStateOf(paid, due)` with a special
                         * case for CANCELLED, and a sale whose goods had all
                         * come back owes nothing — so the reprint of a
                         * refunded invoice printed "Paid", in the customer's
                         * hand, next to the money they had just been given
                         * back. Goods returned outranks money owed, and the
                         * row already knows it from the server's own reading
                         * of the lines.
                         */
                        { label: "Status", value: receiptOf.status },
                      ]
                    : [
                        { label: "Net Payable", value: formatMoney(saleDetail.grandTotal, MONEY), strong: true },
                        // Not the hardcoded "Paid" this used to print: a cash
                        // sale refunded in full reached here too.
                        { label: "Status", value: receiptOf.status },
                      ]),
                ]}
                footerNotes={["Thank you for your purchase.", "Goods once sold are exchangeable within 7 days with this receipt."]}
                system={{ name: "SortPi" }}
              />
            ) : (
              <ErrorState message="Could not load this receipt." onRetry={refetchSale} compact />
            )}
          </div>
        )}
      </Modal>

      {/* Collect the rest of an invoice ─────────────────────────────────── */}
      <Modal
        open={collectFor !== null}
        onClose={() => !collecting && setCollectFor(null)}
        title="Collect payment"
        width={440}
        footer={
          <>
            <button
              type="button"
              disabled={collecting}
              className={MODAL_GHOST}
              onClick={() => setCollectFor(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              // Not merely `collecting`: the customer id arrives with the
              // DETAIL, and until it does there is no account to credit.
              // Enabled early, Save answered "this sale has no customer on
              // it" — a sentence about the data rather than about the wait.
              disabled={collecting || outstanding <= 0 || !customerId}
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={MODAL_PRIMARY}
              onClick={async () => {
                if (!collectFor || collecting || collectingRef.current) return;
                const amount = Number(collectAmount);
                if (!collectAmount.trim() || Number.isNaN(amount) || amount <= 0) {
                  return setCollectError("Enter an amount greater than zero.");
                }
                if (amount > outstanding + 0.00005) {
                  return setCollectError(
                    `Amount can't exceed the ${formatMoney(outstanding, MONEY)} outstanding.`
                  );
                }
                if (!customerId) {
                  return setCollectError(
                    "This sale has no customer on it, so there is no account to credit."
                  );
                }
                collectingRef.current = true;
                setCollecting(true);
                setCollectError(null);
                try {
                  /**
                   * Allocated to THIS invoice, not left on account.
                   *
                   * The allocation is the whole point of collecting from a
                   * row: without it the money lands against the customer's
                   * oldest debt and the invoice the cashier was looking at
                   * stays open, which is not what they were told would
                   * happen.
                   */
                  await CustomerService.recordPayment(
                    customerId,
                    amount,
                    `Payment against ${collectFor.invoiceNo}`,
                    {
                      allocations: [{ saleId: collectFor.id, amount }],
                      // The amount is IN the key: see `collectSession`.
                      idempotencyKey: `collect-${collectSession.current}-${amount.toFixed(4)}`,
                    }
                  );
                  setNote(
                    `${formatMoney(amount, MONEY)} collected against ${collectFor.invoiceNo}`
                  );
                  setCollectFor(null);
                  /**
                   * Refetched, never patched on screen.
                   *
                   * The ledger owns these figures — Amount Received, Due and
                   * the Status pill are all derived from it server-side — so
                   * the row has to come back from the server rather than be
                   * adjusted here. The customer's balance and the dashboard's
                   * takings move on the same posting.
                   */
                  invalidate("sales", "customers", "dashboard", "overview-sales");
                } catch (error) {
                  setCollectError(
                    error instanceof Error && error.message
                      ? error.message
                      : "The payment could not be recorded."
                  );
                } finally {
                  collectingRef.current = false;
                  setCollecting(false);
                }
              }}
            >
              {collecting ? "Saving…" : "Save payment"}
            </button>
          </>
        }
      >
        {collectFor && (
          <div className="flex flex-col gap-[12px]">
            <p className="text-[14px] leading-[1.6] text-[#525252]">
              <span className="font-medium text-[#1e1e1e]">{collectFor.invoiceNo}</span> ·{" "}
              {collectFor.customerName} still owes{" "}
              <span className="font-medium text-[#1e1e1e]">
                {formatMoney(outstanding, MONEY)}
              </span>{" "}
              of {formatMoney(collectFor.totalAmount, MONEY)}.
            </p>
            <div className="flex flex-col gap-[6px]">
              <AmountLabel
                htmlFor="sale-collect"
                onMax={() => {
                  // Four decimals, as the ceiling is: the server refuses an
                  // allocation a hundredth of a paisa over what is owed.
                  setCollectAmount(String(outstanding));
                  setCollectError(null);
                }}
                maxDisabled={outstanding <= 0}
              >
                Amount
              </AmountLabel>
              <input
                id="sale-collect"
                autoFocus
                value={collectAmount}
                onChange={(e) => {
                  setCollectAmount(clampTypedAmount(e.target, outstanding));
                  setCollectError(null);
                }}
                inputMode="decimal"
                placeholder="0"
                aria-label="Payment amount"
                className="flex h-[44px] items-center rounded-[10px] bg-white px-[12px] text-[14px] tracking-[-0.28px] text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] outline-none placeholder:text-[rgba(82,82,82,0.6)]"
              />
            </div>
            {/* Why Save is greyed out for a beat. Without it the button looked
                broken rather than busy. */}
            {!customerId && !collectError && (
              <p className="text-[13px] text-[#8f8d87]">Loading this invoice…</p>
            )}
            {collectError && <p className="text-[13px] text-[#ef4444]">{collectError}</p>}
          </div>
        )}
      </Modal>

      {/* Withdraw a refund */}
      <Modal
        open={withdrawOf !== null}
        onClose={() => {
          if (!withdrawing) setWithdrawOf(null);
        }}
        title="Withdraw refund"
        width={460}
        footer={
          <>
            <button
              type="button"
              disabled={withdrawing}
              className={MODAL_GHOST}
              onClick={() => setWithdrawOf(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={withdrawing || !openRefund}
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={MODAL_PRIMARY}
              onClick={async () => {
                if (!openRefund || !withdrawOf) return;
                setWithdrawing(true);
                try {
                  await ReturnService.withdrawReturn(openRefund.id);
                  await refetch();
                  setNote(`${withdrawOf.invoiceNo} reinstated`);
                  setWithdrawOf(null);
                } catch (err: any) {
                  setNote(err?.message || "Could not withdraw this refund.");
                } finally {
                  setWithdrawing(false);
                }
              }}
            >
              {withdrawing ? "Withdrawing…" : "Withdraw refund"}
            </button>
          </>
        }
      >
        {withdrawOf && (
          <div className="flex flex-col gap-[14px]">
            <p className="text-[14px] leading-[1.6] text-[#525252]">
              Put invoice <span className="font-medium text-[#1e1e1e]">{withdrawOf.invoiceNo}</span>{" "}
              back? The sale returns to Completed and the refund is marked withdrawn.
            </p>

            <div className="flex flex-col gap-[8px] rounded-[10px] bg-[#fafafa] p-[12px]">
              <p className="text-[13px] font-medium text-[#1e1e1e]">Back off the shelf</p>
              {withdrawableLoading && !withdrawable ? (
                <p className="text-[13px] text-[#9e9e9e]">Reading the refund…</p>
              ) : !openRefund ? (
                <p className="text-[13px] text-[#9e9e9e]">
                  No open refund is recorded against this invoice.
                </p>
              ) : openRefund.items.length === 0 ? (
                <p className="text-[13px] text-[#9e9e9e]">This refund records no lines.</p>
              ) : (
                <ul className="flex flex-col gap-[6px]">
                  {openRefund.items.map((line) => (
                    <li key={line.id} className="flex items-start justify-between gap-[12px]">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-[#1e1e1e]">{line.name}</span>
                        <span className="block truncate text-[11px] text-[#9e9e9e]">{line.sku}</span>
                      </span>
                      <span className="shrink-0 text-[13px] font-medium whitespace-nowrap text-[#e5484d]">
                        −{line.quantity}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[12px] leading-[1.5] text-[#9e9e9e]">
                Refused if any of it has since been sold to somebody else.
              </p>
            </div>

            {openRefund && (
              <div className="flex items-center justify-between gap-[12px] border-t border-solid border-[#eaeaea] pt-[12px]">
                <span className="text-[14px] text-[#525252]">Back onto revenue</span>
                <span className="text-[16px] font-semibold text-[#00b837]">
                  +{openRefund.totalAmountFormatted}
                </span>
              </div>
            )}
          </div>
        )}
      </Modal>

    </div>
  );
}
