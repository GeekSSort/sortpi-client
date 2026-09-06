"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CustomerRecord } from "@/types/customer";
import { CustomerService } from "@/services";
import StatusPill, { Tone } from "@/components/shared/StatusPill";
import RowActionMenu from "@/components/shared/RowActionMenu";
import TablePagination from "@/components/shared/TablePagination";
import TableSkeleton from "@/components/shared/TableSkeleton";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY } from "@/components/shared/Modal";

/**
 * Customers — Figma 51:9099.
 *
 * Search and Add New in the headline, then a nine-column table: 40px head,
 * 54px rows, pager below.
 *
 * Below md each row becomes a card, and in between the table scrolls
 * sideways. No Figma frame for either; both are our choice.
 */

const STATUS_TONE: Record<CustomerRecord["status"], Tone> = {
  Active: "green",
  Inactive: "slate",
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

const GRID = "grid-cols-[140fr_165fr_180fr_115fr_115fr_115fr_115fr_100fr_83fr]";
const CELL = "flex min-w-0 items-center p-[12px]";
const HEAD = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e]";
const TEXT = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [loading, setLoading] = useState(true);
  /** The debounce is for typing. Waiting 250ms to make the FIRST
      request just adds a quarter second of blank table on reload. */
  const firstLoad = useRef(true);
  const [failed, setFailed] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [profileOf, setProfileOf] = useState<CustomerRecord | null>(null);
  const [payFor, setPayFor] = useState<CustomerRecord | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payError, setPayError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  /** Bumped to refetch after a payment, so the balance shown is the server's. */
  const [refresh, setRefresh] = useState(0);
  /** The API's count of everything matching, not of what this page holds. */
  const [total, setTotal] = useState(0);

  useEffect(() => {
    // Debounced and guarded: a request per keystroke let a slow answer for
    // "ra" land after "rahman" and repopulate the table with the wrong rows.
    let live = true;
    const id = setTimeout(() => {
      setLoading(true);
      // One page at a time. The whole list used to be requested and sliced in
      // the browser, but the API caps a page at 200 — so a directory past 200
      // customers was silently truncated and the pager called 200 the total.
      CustomerService.getCustomers({ search: query, page, limit: pageSize })
        .then((res) => {
          if (!live) return;
          setCustomers(res.data);
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

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages);
  // The server already sliced. `rows` is the page.
  const rows = customers;

  return (
    <div className="flex w-full flex-col gap-[14px] select-none">
      {/* Headline — 51:9100 */}
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
              placeholder="Search by name, customer ID or exact phone..."
              aria-label="Search customers"
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

          <Link
            href="/customers/add"
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

      {/* Table card — 51:9132 */}
      <div className="w-full overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
        {/* Table — 51:9149 */}
        <div className="hidden px-[16px] pt-[16px] md:block">
          <div className="overflow-x-auto">
            <div className="min-w-[1128px]">
              <div className={`grid ${GRID} items-start overflow-clip rounded-[6px] shadow-[inset_0_0_0_1px_#eaeaea]`}>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Customer ID</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Customer</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Phone</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Type</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Order</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Total Spent</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Due</span></div>
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
                      ? "Loading customers…"
                      : failed
                        ? "Customers could not be loaded. Refresh to try again."
                        : "No customers match that search."}
                  </p>
                )}
                {rows.map((c, i) => (
                  <div
                    key={c.id}
                    className={`grid ${GRID} h-[54px] items-center ${i === rows.length - 1 ? "" : "border-b border-solid border-[#eaeaea]"}`}
                  >
                    <div className={`${CELL}`}><span className={`${TEXT} truncate`}>{c.customerId}</span></div>
                    <div className={`${CELL}`}><span className={`${TEXT} truncate`}>{c.name}</span></div>
                    <div className={`${CELL}`}><span className={`${TEXT} truncate`}>{c.phone}</span></div>
                    <div className={`${CELL}`}><span className={`${TEXT} truncate`}>{c.type}</span></div>
                    <div className={`${CELL}`}><span className={`${TEXT} truncate`}>{c.orderCount}</span></div>
                    <div className={`${CELL}`}><span className={`${TEXT} truncate`}>{c.totalSpentFormatted}</span></div>
                    <div className={`${CELL}`}><span className={`${TEXT} truncate`}>{c.dueAmountFormatted}</span></div>
                    <div className={`${CELL} justify-center`}>
                      <StatusPill label={c.status} tone={STATUS_TONE[c.status] ?? "slate"} />
                    </div>
                    <div className={`${CELL} justify-center`}>
                      <RowActionMenu
                        label={`Actions for ${c.customerId}`}
                        actions={[
                          { label: "View profile", onSelect: () => setProfileOf(c) },
                          {
                            label: "Edit customer",
                            onSelect: () => setNote(`Edit ${c.name} — form not designed yet`),
                          },
                          {
                            label: "Record payment",
                            onSelect: () => {
                              setPayAmount("");
                              setPayError(null);
                              setPayFor(c);
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
          {rows.map((c) => (
            <div key={c.id} className="rounded-[10px] border border-solid border-[#eaeaea] p-[12px]">
              <div className="flex items-start justify-between gap-[10px]">
                <div className="min-w-0">
                  <p className={`${TEXT} truncate !text-[#1e1e1e]`}>{c.name}</p>
                  <p className="mt-[2px] truncate text-[12px] tracking-[-0.24px] text-[#525252]">
                    {c.customerId} · {c.phone}
                  </p>
                </div>
                <StatusPill label={c.status} tone={STATUS_TONE[c.status] ?? "slate"} />
              </div>
              <div className="mt-[10px] flex items-center justify-between gap-[10px]">
                <span className="truncate text-[12px] tracking-[-0.24px] text-[#525252]">
                  {c.type} · {c.orderCount} orders
                </span>
                <span className={`${TEXT} shrink-0`}>{c.totalSpentFormatted}</span>
              </div>
              <p className="mt-[4px] text-[12px] tracking-[-0.24px] text-[#525252]">Due {c.dueAmountFormatted}</p>
            </div>
          ))}
        </div>

        {note && <p className="px-[16px] pt-[10px] text-[13px] text-[#525252]">{note}</p>}

        {/* Pagination — 51:9558 */}
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

      {/* View profile */}
      <Modal
        open={profileOf !== null}
        onClose={() => setProfileOf(null)}
        title={profileOf?.name ?? ""}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setProfileOf(null)}>
              Close
            </button>
            <button
              type="button"
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={MODAL_PRIMARY}
              onClick={() => {
                setPayAmount("");
                setPayError(null);
                setPayFor(profileOf);
                setProfileOf(null);
              }}
            >
              Record payment
            </button>
          </>
        }
      >
        {profileOf && (
          <dl className="flex flex-col gap-[12px]">
            {[
              ["Customer ID", profileOf.customerId],
              ["Phone", profileOf.phone],
              ["Type", profileOf.type],
              ["Orders", String(profileOf.orderCount)],
              ["Total Spent", profileOf.totalSpentFormatted],
              ["Due", profileOf.dueAmountFormatted],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-[16px]">
                <dt className="text-[14px] text-[#525252]">{k}</dt>
                <dd className="text-[14px] font-medium text-[#1e1e1e]">{v}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-[16px]">
              <dt className="text-[14px] text-[#525252]">Status</dt>
              <dd>
                <StatusPill label={profileOf.status} tone={STATUS_TONE[profileOf.status] ?? "slate"} />
              </dd>
            </div>
          </dl>
        )}
      </Modal>

      {/* Record payment — settles against the outstanding balance */}
      <Modal
        open={payFor !== null}
        onClose={() => setPayFor(null)}
        title="Record payment"
        width={440}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setPayFor(null)}>
              Cancel
            </button>
            <button
              type="button"
              disabled={paying}
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={MODAL_PRIMARY}
              onClick={async () => {
                if (!payFor || paying) return;
                const amount = Number(payAmount);
                if (!payAmount.trim() || Number.isNaN(amount) || amount <= 0) {
                  return setPayError("Enter an amount greater than zero.");
                }
                if (amount > payFor.dueAmount) {
                  return setPayError(`Amount can't exceed the ${payFor.dueAmountFormatted} due.`);
                }
                // Posted to the ledger, not edited on screen. This used to
                // change the row and nothing else — the endpoint had been
                // there all along.
                setPaying(true);
                setPayError(null);
                try {
                  await CustomerService.recordPayment(
                    payFor.id,
                    amount,
                    `Payment from ${payFor.name}`
                  );
                  setNote(`৳ ${amount.toLocaleString("en-IN")} recorded for ${payFor.name}`);
                  setPayFor(null);
                  // Refetch rather than patch: the ledger owns the balance.
                  setRefresh((n) => n + 1);
                } catch (error) {
                  setPayError(
                    error instanceof Error && error.message
                      ? error.message
                      : "The payment could not be recorded."
                  );
                } finally {
                  setPaying(false);
                }
              }}
            >
              {paying ? "Saving…" : "Save payment"}
            </button>
          </>
        }
      >
        {payFor && (
          <div className="flex flex-col gap-[12px]">
            <p className="text-[14px] leading-[1.6] text-[#525252]">
              <span className="font-medium text-[#1e1e1e]">{payFor.name}</span> owes{" "}
              <span className="font-medium text-[#1e1e1e]">{payFor.dueAmountFormatted}</span>.
            </p>
            <label className="flex flex-col gap-[6px]">
              <span className="text-[14px] font-medium tracking-[-0.28px] text-[#525252]">Amount</span>
              <input
                autoFocus
                value={payAmount}
                onChange={(e) => {
                  setPayAmount(e.target.value.replace(/[^\d.]/g, ""));
                  setPayError(null);
                }}
                inputMode="decimal"
                placeholder="0"
                aria-label="Payment amount"
                className="flex h-[44px] items-center rounded-[10px] bg-white px-[12px] text-[14px] tracking-[-0.28px] text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] outline-none placeholder:text-[rgba(82,82,82,0.6)]"
              />
            </label>
            {payError && <p className="text-[13px] text-[#ef4444]">{payError}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
