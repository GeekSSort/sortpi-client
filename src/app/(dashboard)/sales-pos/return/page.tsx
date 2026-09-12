"use client";

import React, { useEffect, useState } from "react";
import { ReturnRecord } from "@/types/returns";
import { ReturnService } from "@/services";
import RowActionMenu from "@/components/shared/RowActionMenu";
import ScrollEnd from "@/components/shared/ScrollEnd";
import FilterDropdown from "@/components/shared/FilterDropdown";
import DateFilter, { ALL_DATES, DateValue, resolveDates } from "@/components/shared/DateFilter";
import TableSkeleton from "@/components/shared/TableSkeleton";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY } from "@/components/shared/Modal";
import { queryKey } from "@/lib/query/useQuery";
import { useInfiniteRows } from "@/lib/query/useInfiniteRows";
import { CardListState, EmptyState, QueryBoundary, RefreshBar } from "@/components/shared/QueryBoundary";
import Receipt from "@/components/shared/Receipt";
import { useShopProfile } from "@/components/shared/useShopProfile";
import { formatMoney } from "@/lib/format";
import { REFUND_METHODS } from "@/lib/paymentMethods";
import {
  ActionLink,
  PageToolbar,
  PlusIcon,
  SearchInput,
  TABLE_CARD,
} from "@/components/shared/Toolbar";

/**
 * Returns — Figma 45:4116.
 *
 * Search on the left of the headline, date and Add New on the right, then a
 * nine-column table: 40px head, 54px rows, pager below.
 *
 * Below md each row becomes a card, and in between the table scrolls
 * sideways. No Figma frame for either; both are our choice.
 */

const MONEY = { decimals: 2 } as const;


/** Eight columns since Status left: it said "Paid" on every row. */
const GRID = "grid-cols-[145fr_145fr_185fr_130fr_120fr_120fr_100fr_83fr]";
const CELL = "flex min-w-0 items-center p-[12px]";
const HEAD = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e]";
const TEXT = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]";

export default function ReturnPage() {
  const [query, setQuery] = useState("");
  /** The debounce settles the term before it reaches the cache key: one
      request per pause, and a slow answer for "RET-1" can no longer land on
      top of the rows for "RET-12". */
  const [term, setTerm] = useState("");
  // Rows per request. Not a page size anyone picks — the table scrolls.
  const pageSize = 25;
  const { shop } = useShopProfile();
  /**
   * How the money went back. The filter that replaced Status.
   *
   * Status offered Paid / Pending / Rejected — three values a return has never
   * had; the model holds CONFIRMED and CANCELLED and nothing else, so picking
   * any of them asked the API for a state no row is in and emptied the table.
   * And with withdrawn refunds no longer listed at all, every row on this
   * screen now has the SAME status, which is not something worth a control.
   *
   * Refund method is the question this list actually raises — how much went
   * back in cash today — and it is a real column on the row.
   */
  const [method, setMethod] = useState("");
  const [dates, setDates] = useState<DateValue>(ALL_DATES);
  const [detailOf, setDetailOf] = useState<ReturnRecord | null>(null);
  const [slipOf, setSlipOf] = useState<ReturnRecord | null>(null);

  useEffect(() => {
    if (query === term) return;
    const id = setTimeout(() => setTerm(query), 250);
    return () => clearTimeout(id);
  }, [query, term]);

  // The day is sent to the API and is part of the key. It used to be applied
  // in the browser over one capped page, so filtering to an older day found
  // nothing that had not already been fetched.
  const span = resolveDates(dates);
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
    queryKey("returns", { search: term, from: span.from, to: span.to, method }),
    (p, limit) =>
      ReturnService.getReturns({
        search: term,
        startDate: span.from,
        endDate: span.to,
        refundMethod: method || undefined,
        page: p,
        limit,
      }),
    { pageSize }
  );

  return (
    <div className="flex w-full flex-col gap-[14px]">
      {/* Headline — 45:4118: search left, filters + Add New right */}
      <PageToolbar
        search={
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search by return ID, Invoice No. or Customer..."
            label="Search returns"
          />
        }
      >
        <FilterDropdown
          label="Refund method"
          value={method}
          onChange={setMethod}
          options={[
            { value: "", label: "Any method" },
            ...REFUND_METHODS.map((m) => ({ value: m.value, label: m.label })),
          ]}
        />
        <DateFilter value={dates} onChange={setDates} />

        <ActionLink href="/sales-pos/return/new" variant="primary">
          <PlusIcon />
          Add New
        </ActionLink>
      </PageToolbar>

      {/* Table card — 48:5494 */}
      <div className={TABLE_CARD}>
        <RefreshBar active={fetching} />
        {/* Table — 48:5511 */}
        {/* One scroller for the table, the phone cards and the load trigger.
            The trigger has to sit INSIDE it — below the scroller it never
            leaves the screen, and every page loads at once the moment the
            table opens. */}
        <div className="table-scroll">

        <div className="hidden px-[16px] pt-[16px] md:block">
          <div>
            <div className="min-w-[1128px]">
              <div className={`table-head grid ${GRID} items-start overflow-clip rounded-[6px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]`}>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Return No.</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Invoice No.</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Date &amp; Time</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Customer</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Total Amount</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Refund</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Payment</span></div>
                <div className={`${CELL} h-[40px] justify-center bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Action</span></div>
              </div>

              <div className="mt-[6px]">
                <QueryBoundary
                  loading={loading}
                  error={error}
                  hasData={!loading && !error}
                  skeleton={<TableSkeleton columns={GRID} rows={8} />}
                  errorMessage="Returns could not be loaded."
                  onRetry={refetch}
                >
                {rows.length === 0 && (
                  <EmptyState
                    message={
                      term || dates.mode !== "all" ? "No returns match that search or date." : "No returns yet."
                    }
                    hint={term || dates.mode !== "all" ? undefined : "Start one from an invoice."}
                  />
                )}
                {rows.map((r, i) => (
                  <div
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open return ${r.returnNo}`}
                    onClick={() => setDetailOf(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setDetailOf(r);
                      }
                    }}
                    className={`grid ${GRID} h-[54px] cursor-pointer items-center transition-colors outline-none hover:bg-[#fafafa] focus-visible:bg-[#fffaeb] focus-visible:ring-1 focus-visible:ring-[#f5b800] focus-visible:ring-inset ${i === rows.length - 1 ? "" : "border-b border-solid border-[#eaeaea]"}`}
                  >
                    <div className={`${CELL}`}><span className={`${TEXT} truncate`}>{r.returnNo}</span></div>
                    <div className={`${CELL}`}><span className={`${TEXT} truncate`}>{r.invoiceNo}</span></div>
                    <div className={`${CELL}`}><span className={`${TEXT} truncate`}>{r.dateTime}</span></div>
                    <div className={`${CELL}`}><span className={`${TEXT} truncate`}>{r.customerName}</span></div>
                    <div className={`${CELL}`}><span className={`${TEXT} truncate`}>{r.totalAmountFormatted}</span></div>
                    <div className={`${CELL}`}><span className={`${TEXT} truncate`}>{r.refundAmountFormatted}</span></div>
                    <div className={`${CELL}`}><span className={`${TEXT} truncate`}>{r.paymentMethod}</span></div>
                    <div
                      className={`${CELL} justify-center`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <RowActionMenu
                        label={`Actions for ${r.returnNo}`}
                        // Approve / Reject / Withdraw all used to sit here.
                        //
                        // The first two changed a row on screen and nothing
                        // else: SaleReturn has two states, CONFIRMED and
                        // CANCELLED, no approval step, and no endpoint to move
                        // between them.
                        //
                        // Withdraw was real, and it lives on the SALES screen
                        // instead — beside the invoice whose stock, ledger and
                        // status it puts back. Undoing a refund from the list
                        // OF refunds meant the row you were undoing was the
                        // only context you had; the sale it reverses is the
                        // thing a shopkeeper actually needs to look at. Nothing
                        // was lost: this list now shows confirmed refunds only,
                        // so a refund withdrawn over there disappears from here
                        // on the next fetch.
                        actions={[
                          { label: "View return", onSelect: () => setDetailOf(r) },
                          { label: "Print slip", onSelect: () => setSlipOf(r) },
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
            errorMessage="Returns could not be loaded."
            emptyMessage={term || dates.mode !== "all" ? "No returns match that search or date." : "No returns yet."}
            onRetry={refetch}
            rows={4}
          />
          {rows.map((r) => (
            <div key={r.id} className="rounded-[10px] border border-solid border-[#eaeaea] p-[12px]">
              <div className="flex items-start justify-between gap-[10px]">
                <div className="min-w-0">
                  <p className={`${TEXT} truncate !text-[#1e1e1e]`}>{r.returnNo}</p>
                  <p className="mt-[2px] truncate text-[12px] tracking-[-0.24px] text-[#525252]">
                    {r.invoiceNo} · {r.customerName}
                  </p>
                </div>
                {/* The status pill is gone with the column. Every refund on
                    this screen is a confirmed one, so it read "Paid" on every
                    card and told a shopkeeper nothing. */}
                <span className={`${TEXT} shrink-0 !text-[#1e1e1e]`}>
                  {r.totalAmountFormatted}
                </span>
              </div>
              <div className="mt-[10px] flex items-center justify-between gap-[10px]">
                <span className="truncate text-[12px] tracking-[-0.24px] text-[#525252]">{r.dateTime}</span>
                <span className={`${TEXT} shrink-0`}>{r.refundAmountFormatted}</span>
              </div>
              <p className="mt-[4px] text-[12px] tracking-[-0.24px] text-[#525252]">{r.paymentMethod}</p>
            </div>
          ))}
        </div>

        {/* Pagination — 48:5835 */}
        <div className="mt-[9px]">
          <ScrollEnd
            sentinelRef={sentinelRef}
            hasMore={hasMore}
            loadingMore={loadingMore}
            shown={rows.length}
            total={total}
            noun="returns"
          />
        </div>
        </div>
      </div>

      {/* View return */}
      <Modal
        open={detailOf !== null}
        onClose={() => setDetailOf(null)}
        title={`Return ${detailOf?.returnNo ?? ""}`}
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
                setSlipOf(detailOf);
                setDetailOf(null);
              }}
            >
              Print slip
            </button>
          </>
        }
      >
        {detailOf && (
          <dl className="flex flex-col gap-[12px]">
            {[
              ["Return No.", detailOf.returnNo],
              ["Invoice No.", detailOf.invoiceNo],
              ["Date & Time", detailOf.dateTime],
              ["Customer", detailOf.customerName],
              ["Total Amount", detailOf.totalAmountFormatted],
              ["Refund", detailOf.refundAmountFormatted],
              ["Payment", detailOf.paymentMethod],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-[16px]">
                <dt className="text-[14px] text-[#525252]">{k}</dt>
                <dd className="text-[14px] font-medium text-[#1e1e1e]">{v}</dd>
              </div>
            ))}
            {/* No Status row. This screen lists confirmed refunds only, so the
                pill read "Paid" on every one of them — a field that cannot
                vary is a field nobody should have to read. */}

            {/* What came back, and therefore what went back into stock. The
                quantities are the return's own lines, not a guess from the
                total. */}
            <div className="mt-[4px] flex flex-col gap-[8px] border-t border-solid border-[#eaeaea] pt-[12px]">
              <p className="text-[14px] font-medium text-[#1e1e1e]">Restocked to inventory</p>
              {detailOf.items.length === 0 ? (
                <p className="text-[13px] text-[#9e9e9e]">
                  This return has no lines recorded against it.
                </p>
              ) : (
                <ul className="flex flex-col gap-[6px]">
                  {detailOf.items.map((line) => (
                    <li key={line.id} className="flex items-start justify-between gap-[12px]">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] text-[#1e1e1e]">{line.name}</span>
                        <span className="block truncate text-[12px] text-[#9e9e9e]">{line.sku}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-[14px] font-medium text-[#00b837]">
                          +{line.quantity} back in stock
                        </span>
                        <span className="block text-[12px] text-[#525252]">
                          {line.lineTotalFormatted}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </dl>
        )}
      </Modal>

      {/* The refund slip — the same document as the invoice, in the same shape.
          It used to be a hand-drawn list of label/value rows: no shop name, no
          address, no lines, nothing a customer could match against the receipt
          they were handed when they bought the thing. The print stylesheet
          hides everything but .print-area. */}
      <Modal
        open={slipOf !== null}
        onClose={() => setSlipOf(null)}
        title="Refund slip"
        width={420}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setSlipOf(null)}>
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
        {slipOf && (
          <div className="print-area">
            <Receipt
              business={{
                name: shop.name,
                tagline: shop.tagline,
                address: shop.address,
                bin: shop.bin,
              }}
              title="RETURN / REFUND"
              customer={{ name: slipOf.customerName, phone: slipOf.customerPhone }}
              meta={[
                { label: "Return No", value: slipOf.returnNo },
                { label: "Against Invoice", value: slipOf.invoiceNo },
                { label: "Date", value: slipOf.dateTime },
                { label: "Refund by", value: slipOf.paymentMethod },
                { label: "Status", value: slipOf.status },
              ]}
              itemsHeading="Item Returned"
              items={slipOf.items.map((line) => ({
                name: line.name,
                price: formatMoney(line.unitPrice, MONEY),
                qty: line.quantity,
                total: formatMoney(line.lineTotal, MONEY),
              }))}
              totals={[
                { label: "Returned value:", value: formatMoney(slipOf.totalAmount, MONEY) },
                {
                  label: "Refunded:",
                  value: formatMoney(slipOf.refundAmount, MONEY),
                  strong: true,
                  ruleAbove: true,
                },
                // What is NOT being handed back in cash today. A refund can be
                // less than the goods are worth — a restocking fee, or credit
                // taken against the customer's account instead — and a slip
                // that showed only one of the two figures was the one argued
                // about at the counter.
                ...(slipOf.totalAmount - slipOf.refundAmount > 0
                  ? [
                      {
                        label: "To account:",
                        value: formatMoney(slipOf.totalAmount - slipOf.refundAmount, MONEY),
                      },
                    ]
                  : []),
              ]}
              footerNotes={[
                "Goods returned as listed above.",
                "Customer signature ____________________",
              ]}
              system={{ name: "SortPi", url: "www.sortpi.com" }}
            />
          </div>
        )}
      </Modal>

    </div>
  );
}
