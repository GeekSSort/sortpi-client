"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CustomerRecord } from "@/types/customer";
import { CustomerService } from "@/services";
import StatusPill, { Tone } from "@/components/shared/StatusPill";
import RowActionMenu from "@/components/shared/RowActionMenu";
import ScrollEnd from "@/components/shared/ScrollEnd";
import FilterDropdown from "@/components/shared/FilterDropdown";
import TableSkeleton from "@/components/shared/TableSkeleton";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY } from "@/components/shared/Modal";
import { queryKey, invalidate } from "@/lib/query/useQuery";
import { useInfiniteRows } from "@/lib/query/useInfiniteRows";
import { CardListState, EmptyState, QueryBoundary, RefreshBar } from "@/components/shared/QueryBoundary";
import { clampTypedAmount } from "@/lib/money";
import { AmountLabel } from "@/components/shared/MaxButton";
import { isRowClick, isRowKey } from "@/lib/rowClick";
import {
  ActionButton,
  ActionLink,
  ExportIcon,
  PageToolbar,
  PlusIcon,
  SearchInput,
  TABLE_CARD,
} from "@/components/shared/Toolbar";

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


const GRID = "grid-cols-[140fr_165fr_180fr_115fr_115fr_115fr_115fr_100fr_83fr]";
const CELL = "flex min-w-0 items-center p-[12px]";
const HEAD = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e]";
const TEXT = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]";

export default function CustomersPage() {
  const [query, setQuery] = useState("");
  /** The debounce lives here, not in the request: settling the term before it
      reaches the cache key stops a request per keystroke, and the cache stops
      a slow answer for "ra" landing after "rahman" — the key it belongs to is
      no longer the key on screen. */
  const [term, setTerm] = useState("");
  // Rows per request. Not a page size anyone picks — the table scrolls.
  const pageSize = 25;
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [due, setDue] = useState("");
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [profileOf, setProfileOf] = useState<CustomerRecord | null>(null);
  const [payFor, setPayFor] = useState<CustomerRecord | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payError, setPayError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (query === term) return;
    const id = setTimeout(() => setTerm(query), 250);
    return () => clearTimeout(id);
  }, [query, term]);

  // One page at a time. The whole list used to be requested and sliced in the
  // browser, but the API caps a page at 200 — so a directory past 200
  // customers was silently truncated and the pager called 200 the total.
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
    queryKey("customers", { search: term, status, kind, due }),
    (p, limit) =>
      CustomerService.getCustomers({
        search: term,
        status: status || undefined,
        customerType: (kind || undefined) as "RETAIL" | "WHOLESALE" | undefined,
        hasDue: due === "due" || undefined,
        page: p,
        limit,
      }),
    { pageSize }
  );

  /** A field is safe in a CSV only once quotes are doubled and it is wrapped:
      a customer called "Rahman, Md." split one row into two columns. */
  const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

  /**
   * The customers on screen, as a spreadsheet.
   *
   * What the FILTERS left, so the file matches the list that was being looked
   * at. Money goes out as numbers rather than the formatted strings, so the
   * Due column can be totalled instead of arriving as text — chasing debt is
   * the reason to export this list at all.
   */
  const exportCsv = async () => {
    setExporting(true);
    setNote(null);
    try {
      const head = ["Customer ID", "Name", "Phone", "Type", "Orders", "Total Spent", "Due", "Status"];
      const csv = [
        head,
        ...rows.map((c) => [
          c.customerId,
          c.name,
          c.phone,
          c.type,
          c.orderCount,
          c.totalSpent,
          c.dueAmount,
          c.status,
        ]),
      ]
        .map((line) => line.map(csvCell).join(","))
        .join("\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "customers.csv";
      a.click();
      URL.revokeObjectURL(url);
      setNote(`Exported ${rows.length} customer${rows.length === 1 ? "" : "s"} on this page`);
    } catch {
      setNote("Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-[14px]">
      {/* Headline — 51:9100 */}
      <PageToolbar
        search={
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search by name, customer ID or exact phone..."
            label="Search customers"
          />
        }
      >
        <FilterDropdown
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "", label: "Any status" },
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ]}
        />
        <FilterDropdown
          label="Type"
          value={kind}
          onChange={setKind}
          options={[
            { value: "", label: "Any type" },
            { value: "RETAIL", label: "Retail" },
            { value: "WHOLESALE", label: "Wholesale" },
          ]}
        />
        <FilterDropdown
          label="Balance"
          value={due}
          onChange={setDue}
          options={[
            { value: "", label: "Any balance" },
            { value: "due", label: "Owes money" },
          ]}
        />

        <ActionButton onClick={exportCsv} disabled={exporting || rows.length === 0}>
          <ExportIcon />
          Export
        </ActionButton>

        <ActionLink href="/customers/add" variant="primary">
          <PlusIcon />
          Add New
        </ActionLink>
      </PageToolbar>

      {/* Table card — 51:9132 */}
      <div className={TABLE_CARD}>
        <RefreshBar active={fetching} />
        {/* Table — 51:9149 */}
        {/* One scroller for the table, the phone cards and the load trigger.
            The trigger has to sit INSIDE it — below the scroller it never
            leaves the screen, and every page loads at once the moment the
            table opens. */}
        <div className="table-scroll">

        <div className="hidden px-[16px] pt-[16px] md:block">
          <div>
            <div className="min-w-[1128px]">
              <div className={`table-head grid ${GRID} items-start overflow-clip rounded-[6px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]`}>
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
                <QueryBoundary
                  loading={loading}
                  error={error}
                  hasData={!loading && !error}
                  skeleton={<TableSkeleton columns={GRID} rows={8} />}
                  errorMessage="Customers could not be loaded."
                  onRetry={refetch}
                >
                {rows.length === 0 && (
                  <EmptyState
                    message={term ? "No customers match that search." : "No customers yet."}
                    hint={term ? undefined : "Add one to get started."}
                  />
                )}
                {rows.map((c, i) => (
                  // A div with role="button", not a <button>: the Action cell
                  // holds one and the browser refuses to nest them.
                  //
                  // `isRowClick` keeps the row's own controls working — the
                  // action menu, and a drag to select a phone number to copy,
                  // which ends in a click and would otherwise open the page on
                  // top of the selection.
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${c.name}`}
                    onClick={(e) => {
                      if (isRowClick(e.target)) router.push(`/customers/${c.id}`);
                    }}
                    onKeyDown={(e) => {
                      if (!isRowKey(e)) return;
                      e.preventDefault();
                      router.push(`/customers/${c.id}`);
                    }}
                    className={`grid ${GRID} h-[54px] cursor-pointer items-center transition-colors hover:bg-[#fafafa] ${i === rows.length - 1 ? "" : "border-b border-solid border-[#eaeaea]"}`}
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
                          { label: "Open", onSelect: () => router.push(`/customers/${c.id}`) },
                          { label: "Quick profile", onSelect: () => setProfileOf(c) },
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
            errorMessage="Customers could not be loaded."
            emptyMessage={term ? "No customers match that search." : "No customers yet."}
            onRetry={refetch}
            rows={4}
          />
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
          <ScrollEnd
            sentinelRef={sentinelRef}
            hasMore={hasMore}
            loadingMore={loadingMore}
            shown={rows.length}
            total={total}
            noun="customers"
          />
        </div>
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
                  // Refetch rather than patch: the ledger owns the balance. A
                  // payment moves the customer's due, the sales ledger and the
                  // dashboard's revenue figures, so all three go stale.
                  invalidate("customers", "sales", "dashboard");
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
            <div className="flex flex-col gap-[6px]">
              <AmountLabel
                htmlFor="cus-pay"
                onMax={() => {
                  setPayAmount(String(payFor?.dueAmount ?? 0));
                  setPayError(null);
                }}
                maxDisabled={!payFor?.dueAmount}
              >
                Amount
              </AmountLabel>
              <input
                id="cus-pay"
                autoFocus
                value={payAmount}
                onChange={(e) => {
                  // Never more than the balance: over-typing is replaced by
                  // what is owed. See `@/lib/money`.
                  setPayAmount(clampTypedAmount(e.target, payFor?.dueAmount ?? 0));
                  setPayError(null);
                }}
                inputMode="decimal"
                placeholder="0"
                aria-label="Payment amount"
                className="flex h-[44px] items-center rounded-[10px] bg-white px-[12px] text-[14px] tracking-[-0.28px] text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] outline-none placeholder:text-[rgba(82,82,82,0.6)]"
              />
            </div>
            {payError && <p className="text-[13px] text-[#ef4444]">{payError}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
