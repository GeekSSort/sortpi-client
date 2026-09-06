"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ReturnRecord } from "@/types/returns";
import { ReturnService } from "@/services";
import StatusPill, { Tone } from "@/components/shared/StatusPill";
import RowActionMenu from "@/components/shared/RowActionMenu";
import TablePagination from "@/components/shared/TablePagination";
import TableSkeleton from "@/components/shared/TableSkeleton";
import DateField from "@/components/shared/DateField";
import { toApiDay } from "@/lib/dateFilter";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY } from "@/components/shared/Modal";

/**
 * Returns — Figma 45:4116.
 *
 * Search on the left of the headline, date and Add New on the right, then a
 * nine-column table: 40px head, 54px rows, pager below.
 *
 * Below md each row becomes a card, and in between the table scrolls
 * sideways. No Figma frame for either; both are our choice.
 */

const STATUS_TONE: Record<ReturnRecord["status"], Tone> = {
  Paid: "green",
  Unpaid: "orange",
  Pending: "amber",
  Rejected: "red",
};

/** Add, node 48:5997. */
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

const GRID = "grid-cols-[145fr_145fr_185fr_130fr_120fr_120fr_100fr_100fr_83fr]";
const CELL = "flex min-w-0 items-center p-[12px]";
const HEAD = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e]";
const TEXT = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]";

export default function ReturnPage() {
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
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
  const [note, setNote] = useState<string | null>(null);
  const [detailOf, setDetailOf] = useState<ReturnRecord | null>(null);
  const [slipOf, setSlipOf] = useState<ReturnRecord | null>(null);

  useEffect(() => {
    // Debounced and guarded: a request per keystroke let a slow answer for
    // "RET-1" land after "RET-12" and repopulate the table with the wrong
    // rows. The day is sent to the API too -- it used to be applied in the
    // browser over one capped page, so filtering to an older day found
    // nothing that had not already been fetched.
    let live = true;
    const day = date ? toApiDay(date) : undefined;
    const id = setTimeout(() => {
      setLoading(true);
      ReturnService.getReturns({
        search: query,
        startDate: day,
        endDate: day,
        page,
        limit: pageSize,
      })
        .then((res) => {
          if (!live) return;
          setReturns(res.data);
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
  const rows = returns;

  return (
    <div className="flex w-full flex-col gap-[14px] select-none">
      {/* Headline — 45:4118: search left, date + Add New right */}
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
              placeholder="Search by return ID, Invoice No. or Customer..."
              aria-label="Search returns"
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
            }} ariaLabel="Filter returns by date" />

          <Link
            href="/sales-pos/return/new"
            style={{
              backgroundImage:
                "linear-gradient(180deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 100%), linear-gradient(90deg, rgb(245,184,0) 0%, rgb(245,184,0) 100%)",
            }}
            className="flex h-[48px] shrink-0 cursor-pointer items-center justify-center gap-[12px] rounded-[12px] px-[16px] py-[8px] text-[16px] leading-[24px] font-semibold whitespace-nowrap text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)]"
          >
            <AddIcon />
            Add New
          </Link>
        </div>
      </div>

      {/* Table card — 48:5494 */}
      <div className="w-full overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
        {/* Table — 48:5511 */}
        <div className="hidden px-[16px] pt-[16px] md:block">
          <div className="overflow-x-auto">
            <div className="min-w-[1128px]">
              <div className={`grid ${GRID} items-start overflow-clip rounded-[6px] shadow-[inset_0_0_0_1px_#eaeaea]`}>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Return No.</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Invoice No.</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Date &amp; Time</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Customer</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Total Amount</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Refund</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Payment</span></div>
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
                      ? "Loading returns…"
                      : failed
                        ? "Returns could not be loaded. Refresh to try again."
                        : "No returns match that search or date."}
                  </p>
                )}
                {rows.map((r, i) => (
                  <div
                    key={r.id}
                    className={`grid ${GRID} h-[54px] items-center ${i === rows.length - 1 ? "" : "border-b border-solid border-[#eaeaea]"}`}
                  >
                    <div className={`${CELL}`}><span className={`${TEXT} truncate`}>{r.returnNo}</span></div>
                    <div className={`${CELL}`}><span className={`${TEXT} truncate`}>{r.invoiceNo}</span></div>
                    <div className={`${CELL}`}><span className={`${TEXT} truncate`}>{r.dateTime}</span></div>
                    <div className={`${CELL}`}><span className={`${TEXT} truncate`}>{r.customerName}</span></div>
                    <div className={`${CELL}`}><span className={`${TEXT} truncate`}>{r.totalAmountFormatted}</span></div>
                    <div className={`${CELL}`}><span className={`${TEXT} truncate`}>{r.refundAmountFormatted}</span></div>
                    <div className={`${CELL}`}><span className={`${TEXT} truncate`}>{r.paymentMethod}</span></div>
                    <div className={`${CELL} justify-center`}>
                      <StatusPill label={r.status} tone={STATUS_TONE[r.status] ?? "slate"} />
                    </div>
                    <div className={`${CELL} justify-center`}>
                      <RowActionMenu
                        label={`Actions for ${r.returnNo}`}
                        // Approve / Reject / Withdraw used to sit here. They
                        // changed a row on screen and nothing else: SaleReturn
                        // has two states, CONFIRMED and CANCELLED, no approval
                        // step, and no endpoint to move between them. A return
                        // is already refunded by the time it is listed.
                        actions={[
                          { label: "View return", onSelect: () => setDetailOf(r) },
                          { label: "Print slip", onSelect: () => setSlipOf(r) },
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
                <div className="min-w-0">
                  <p className={`${TEXT} truncate !text-[#1e1e1e]`}>{r.returnNo}</p>
                  <p className="mt-[2px] truncate text-[12px] tracking-[-0.24px] text-[#525252]">
                    {r.invoiceNo} · {r.customerName}
                  </p>
                </div>
                <StatusPill label={r.status} tone={STATUS_TONE[r.status] ?? "slate"} />
              </div>
              <div className="mt-[10px] flex items-center justify-between gap-[10px]">
                <span className="truncate text-[12px] tracking-[-0.24px] text-[#525252]">{r.dateTime}</span>
                <span className={`${TEXT} shrink-0`}>{r.refundAmountFormatted}</span>
              </div>
              <p className="mt-[4px] text-[12px] tracking-[-0.24px] text-[#525252]">{r.paymentMethod}</p>
            </div>
          ))}
        </div>

        {note && <p className="px-[16px] pt-[10px] text-[13px] text-[#525252]">{note}</p>}

        {/* Pagination — 48:5835 */}
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
            <div className="flex items-center justify-between gap-[16px]">
              <dt className="text-[14px] text-[#525252]">Status</dt>
              <dd>
                <StatusPill label={detailOf.status} tone={STATUS_TONE[detailOf.status] ?? "slate"} />
              </dd>
            </div>
          </dl>
        )}
      </Modal>

      {/* Print slip — the print stylesheet hides everything but .print-area */}
      <Modal
        open={slipOf !== null}
        onClose={() => setSlipOf(null)}
        title="Return slip"
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
          <div className="print-area flex flex-col gap-[10px] text-[13px] text-[#525252]">
            <p className="text-center text-[16px] font-semibold text-[#1e1e1e]">SORTPoint</p>
            <p className="text-center text-[12px]">Return / Refund slip</p>
            <div className="my-[6px] h-px w-full bg-[#eaeaea]" />
            <p className="flex justify-between"><span>Return</span><span className="font-medium text-[#1e1e1e]">{slipOf.returnNo}</span></p>
            <p className="flex justify-between"><span>Against invoice</span><span>{slipOf.invoiceNo}</span></p>
            <p className="flex justify-between"><span>Date</span><span>{slipOf.dateTime}</span></p>
            <p className="flex justify-between"><span>Customer</span><span>{slipOf.customerName}</span></p>
            <p className="flex justify-between"><span>Payment</span><span>{slipOf.paymentMethod}</span></p>
            <p className="flex justify-between"><span>Status</span><span>{slipOf.status}</span></p>
            <div className="my-[6px] h-px w-full bg-[#eaeaea]" />
            <p className="flex justify-between text-[15px] font-semibold text-[#1e1e1e]">
              <span>Refund</span>
              <span>{slipOf.refundAmountFormatted}</span>
            </p>
            <p className="mt-[8px] text-center text-[12px]">Customer signature ____________________</p>
          </div>
        )}
      </Modal>

    </div>
  );
}
