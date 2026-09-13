"use client";

import React, { useEffect, useRef, useState } from "react";
import { SupplierRecord } from "@/types/suppliers";
import { SupplierService } from "@/services";
import StatusPill, { Tone } from "@/components/shared/StatusPill";
import FilterDropdown from "@/components/shared/FilterDropdown";
import RowActionMenu from "@/components/shared/RowActionMenu";
import ScrollEnd from "@/components/shared/ScrollEnd";
import TableSkeleton from "@/components/shared/TableSkeleton";
import Avatar from "@/components/shared/Avatar";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY, RED_GRADIENT } from "@/components/shared/Modal";
import { queryKey, invalidate } from "@/lib/query/useQuery";
import { useInfiniteRows } from "@/lib/query/useInfiniteRows";
import { CardListState, EmptyState, QueryBoundary, RefreshBar } from "@/components/shared/QueryBoundary";
import { clampTypedAmount } from "@/lib/money";
import { AmountLabel } from "@/components/shared/MaxButton";
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
 * Suppliers. There is no Figma frame for this screen, so it borrows the
 * Purchase History one exactly — search left, Add New right, 40px head over
 * 54px rows — and the two pages read as a pair.
 *
 * Clicking a row opens the supplier; everything that changes data is in the
 * row menu.
 */

const STATUS_TONE: Record<SupplierRecord["status"], Tone> = {
  Active: "green",
  Inactive: "rose",
};

const TAKA = new Intl.NumberFormat("en-US");
const money = (n: number) => `৳ ${TAKA.format(Math.max(0, Math.round(n)))}`;


// #  Supplier Name  Phone  Mail  Total Purchases  Balance  Last Purchase  Status  Action
const GRID = "grid-cols-[52fr_176fr_156fr_196fr_132fr_118fr_128fr_104fr_83fr]";
const CELL = "flex min-w-0 items-center p-[12px]";
const HEAD = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e]";
const TEXT = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]";
const FIELD =
  "h-[44px] w-full rounded-[10px] bg-white px-[12px] text-[14px] leading-[1.5] tracking-[-0.28px] text-[#1e1e1e] shadow-[inset_0_0_0_1px_#eaeaea] outline-none transition-shadow placeholder:text-[#a3a3a3] focus:shadow-[inset_0_0_0_1px_#f5b800]";
const LABEL = "text-[13px] leading-[1.5] font-medium tracking-[-0.26px] text-[#1e1e1e]";

// Still the source of the state's type, though the options now live on the
// dropdown itself.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const STATUS_FILTERS = ["All", "Active", "Inactive"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

type EditDraft = { name: string; phone: string; mail: string; status: SupplierRecord["status"] };

export default function SuppliersPage() {
  const [query, setQuery] = useState("");
  /** The debounce settles the term before it reaches the cache key, so typing
      makes one request rather than one per letter — and a slow answer for "ac"
      can no longer land on top of the rows for "acme". */
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState<StatusFilter>("All");
  const [filterOpen, setFilterOpen] = useState(false);
  // Rows per request. Not a page size anyone picks — the table scrolls.
  const pageSize = 25;
  const [note, setNote] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [detailOf, setDetailOf] = useState<SupplierRecord | null>(null);
  const [editOf, setEditOf] = useState<SupplierRecord | null>(null);
  const [draft, setDraft] = useState<EditDraft>({ name: "", phone: "", mail: "", status: "Active" });
  const [editError, setEditError] = useState<string | null>(null);
  const [payOf, setPayOf] = useState<SupplierRecord | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("CASH");
  const [paying, setPaying] = useState(false);
  /**
   * One key for one PAYMENT, minted when the dialog opens.
   *
   * The ledger is insert-only, so a double-tapped Record posts the money twice
   * and the only correction is a manual reversing entry. A key per ATTEMPT
   * would make the header decorative.
   */
  const [payKey, setPayKey] = useState("");
  /**
   * A counter, not `Date.now()`.
   *
   * `Date.now()` in a render path is what makes a component non-deterministic
   * between server and client; this only has to be unique within the session,
   * and the supplier id already carries the rest of the identity.
   */
  const payKeyCounter = useRef(1);
  const [payError, setPayError] = useState<string | null>(null);
  const [toggleOf, setToggleOf] = useState<SupplierRecord | null>(null);
  const [deleteOf, setDeleteOf] = useState<SupplierRecord | null>(null);

  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query === term) return;
    const id = setTimeout(() => setTerm(query), 250);
    return () => clearTimeout(id);
  }, [query, term]);

  // Status goes to the API too, and so does the page — so both belong in the
  // key, or "Active" and "All" would share one cache slot.
  const key = queryKey("suppliers", {
    search: term,
    status: status === "All" ? undefined : status,
  });
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
    patch: patchLoadedRows,
  } = useInfiniteRows(
    key,
    (p, limit) =>
      SupplierService.getSuppliers({
        search: term,
        status: status === "All" ? undefined : status,
        page: p,
        limit,
      }),
    { pageSize }
  );

  /** A field is safe in a CSV only once quotes are doubled and it is wrapped:
      a supplier called "Rahman, Md." split one row into two columns. */
  const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

  /**
   * The suppliers on screen, as a spreadsheet.
   *
   * `balance` is what the shop owes THEM, and it goes out as a number so the
   * column can be totalled — which is the reason to take this list off the
   * screen in the first place.
   */
  const exportCsv = async () => {
    setExporting(true);
    setNote(null);
    try {
      const head = ["Supplier", "Phone", "Email", "Total Purchases", "Balance", "Last Purchase", "Status"];
      const csv = [
        head,
        ...rows.map((r) => [
          r.name,
          r.phone,
          r.mail,
          r.totalPurchases,
          r.balance,
          r.lastPurchase,
          r.status,
        ]),
      ]
        .map((line) => line.map(csvCell).join(","))
        .join("\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "suppliers.csv";
      a.click();
      URL.revokeObjectURL(url);
      setNote(`Exported ${rows.length} supplier${rows.length === 1 ? "" : "s"} on this page`);
    } catch {
      setNote("Export failed");
    } finally {
      setExporting(false);
    }
  };

  // The funnel popover closes on an outside click or Escape, like every other
  // popover in the app.
  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFilterOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [filterOpen]);

  /**
   * Rewrite this page in the cache.
   *
   * Edit, payment, activate and delete have no supplier endpoint yet, so all
   * four are screen-only — but the rows live in the cache now, and patching
   * the entry is what keeps the change visible until the next refetch replaces
   * it with the server's answer.
   */
  const patchRows = (fn: (list: SupplierRecord[]) => SupplierRecord[]) => patchLoadedRows(fn);

  const patch = (id: string, next: Partial<SupplierRecord>) =>
    patchRows((list) => list.map((s) => (s.id === id ? { ...s, ...next } : s)));

  const openEdit = (s: SupplierRecord) => {
    setDraft({ name: s.name, phone: s.phone, mail: s.mail, status: s.status });
    setEditError(null);
    setEditOf(s);
  };

  const openPayment = (s: SupplierRecord) => {
    setPayAmount("");
    setPayMethod("CASH");
    setPayError(null);
    // A key per PAYMENT, not per attempt — see `payKey`.
    setPayKey(`sup-pay-${s.id}-${payKeyCounter.current++}`);
    setPayOf(s);
  };

  const actionsFor = (s: SupplierRecord) => [
    { label: "View supplier", onSelect: () => setDetailOf(s) },
    { label: "Edit supplier", onSelect: () => openEdit(s) },
    ...(s.balance > 0 ? [{ label: "Record payment", onSelect: () => openPayment(s) }] : []),
    { label: s.status === "Active" ? "Deactivate" : "Activate", onSelect: () => setToggleOf(s) },
    { label: "Delete supplier", onSelect: () => setDeleteOf(s) },
  ];

  return (
    <div className="flex w-full flex-col gap-[14px]">
      {/* Search left, Add New right — the Purchase History header row */}
      <PageToolbar
        search={
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search by name, phone or mail..."
            label="Search suppliers"
          />
        }
      >
        {/* Status, beside the search box with the other controls rather than
            inside it — the standard every listing page follows. */}
        <FilterDropdown
          label="Status"
          value={status === "All" ? "" : status}
          onChange={(next) => setStatus((next || "All") as StatusFilter)}
          options={[
            { value: "", label: "All suppliers" },
            { value: "Active", label: "Active" },
            { value: "Inactive", label: "Inactive" },
          ]}
        />
        <ActionButton onClick={exportCsv} disabled={exporting || rows.length === 0}>
          <ExportIcon />
          Export
        </ActionButton>
        <ActionLink href="/purchases/suppliers/add" variant="primary">
          <PlusIcon />
          Add New
        </ActionLink>
      </PageToolbar>

      {/* Table card */}
      <div className={TABLE_CARD}>
        <RefreshBar active={fetching} />
        {/* One scroller for the table, the phone cards and the load trigger.
            The trigger has to sit INSIDE it — below the scroller it never
            leaves the screen, and every page loads at once the moment the
            table opens. */}
        <div className="table-scroll">

        <div className="hidden px-[16px] pt-[16px] md:block">
          <div>
            <div className="min-w-[1145px]">
              <div className={`table-head grid ${GRID} items-start overflow-clip rounded-[6px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]`}>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>#</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Supplier Name</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Phone</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Mail</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Total Purchases</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Balance</span></div>
                <div className={`${CELL} h-[40px] bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Last Purchase</span></div>
                <div className={`${CELL} h-[40px] justify-center bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Status</span></div>
                <div className={`${CELL} h-[40px] justify-center bg-white`}><span className={`${HEAD} whitespace-nowrap`}>Action</span></div>
              </div>

              <div className="mt-[6px]">
                <QueryBoundary
                  loading={loading}
                  error={error}
                  hasData={!loading && !error}
                  skeleton={<TableSkeleton columns={GRID} rows={8} />}
                  errorMessage="Suppliers could not be loaded."
                  onRetry={refetch}
                >
                {rows.length === 0 && (
                  <EmptyState
                    message={
                      term || status !== "All"
                        ? "No suppliers match that search or filter."
                        : "No suppliers yet."
                    }
                    hint={term || status !== "All" ? undefined : "Add one to get started."}
                  />
                )}
                {rows.map((s, i) => (
                  // Not a <button>: the Action cell holds one, and buttons can't nest.
                  <div
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${s.name}`}
                    onClick={() => setDetailOf(s)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setDetailOf(s);
                      }
                    }}
                    className={`grid ${GRID} h-[54px] cursor-pointer items-center transition-colors outline-none hover:bg-[#fafafa] focus-visible:bg-[#fffaeb] focus-visible:ring-1 focus-visible:ring-[#f5b800] focus-visible:ring-inset ${
                      i === rows.length - 1 ? "" : "border-b border-solid border-[#eaeaea]"
                    }`}
                  >
                    <div className={CELL}><span className={`${TEXT} truncate`}>{s.index}</span></div>
                    <div className={`${CELL} gap-[8px]`}>
                      <Avatar name={s.name} src={s.avatar} />
                      <span className={`${TEXT} truncate !text-[#1e1e1e]`}>{s.name}</span>
                    </div>
                    <div className={CELL}><span className={`${TEXT} truncate`}>{s.phone}</span></div>
                    <div className={CELL}><span className={`${TEXT} truncate`}>{s.mail}</span></div>
                    <div className={CELL}><span className={`${TEXT} truncate`}>{s.totalPurchasesFormatted}</span></div>
                    <div className={CELL}><span className={`${TEXT} truncate`}>{s.balanceFormatted}</span></div>
                    <div className={CELL}><span className={`${TEXT} truncate`}>{s.lastPurchase}</span></div>
                    <div className={`${CELL} justify-center`}>
                      <StatusPill label={s.status} tone={STATUS_TONE[s.status] ?? "slate"} />
                    </div>
                    {/* The menu lives inside the row hit area — keep its clicks to itself. */}
                    <div
                      className={`${CELL} justify-center`}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <RowActionMenu label={`Actions for ${s.name}`} actions={actionsFor(s)} />
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
            hasData={!loading && !error}
            isEmpty={rows.length === 0}
            errorMessage="Suppliers could not be loaded."
            emptyMessage={term || status !== "All" ? "No suppliers match that search or filter." : "No suppliers yet."}
            onRetry={refetch}
            rows={4}
          />
          {rows.length === 0 && (
            <p className="py-[24px] text-center text-[14px] text-[#525252]">
              No suppliers match that search or filter.
            </p>
          )}
          {rows.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setDetailOf(s)}
              aria-label={`Open ${s.name}`}
              className="w-full cursor-pointer rounded-[10px] border border-solid border-[#eaeaea] p-[12px] text-left transition-colors outline-none hover:bg-[#fafafa] focus-visible:border-[#f5b800] focus-visible:bg-[#fffaeb]"
            >
              <div className="flex items-start justify-between gap-[10px]">
                <div className="flex min-w-0 items-center gap-[8px]">
                  <Avatar name={s.name} src={s.avatar} />
                  <div className="min-w-0">
                    <p className={`${TEXT} truncate !text-[#1e1e1e]`}>{s.name}</p>
                    <p className="mt-[2px] truncate text-[12px] tracking-[-0.24px] text-[#525252]">{s.phone}</p>
                  </div>
                </div>
                <StatusPill label={s.status} tone={STATUS_TONE[s.status] ?? "slate"} />
              </div>
              <div className="mt-[10px] flex items-center justify-between gap-[10px]">
                <span className="truncate text-[12px] tracking-[-0.24px] text-[#525252]">
                  Last purchase {s.lastPurchase}
                </span>
                <span className={`${TEXT} shrink-0`}>{s.balanceFormatted}</span>
              </div>
            </button>
          ))}
        </div>

        {note && <p className="px-[16px] pt-[10px] text-[13px] text-[#525252]">{note}</p>}

        <div className="mt-[9px]">
          <ScrollEnd
            sentinelRef={sentinelRef}
            hasMore={hasMore}
            loadingMore={loadingMore}
            shown={rows.length}
            total={total}
            noun="suppliers"
          />
        </div>
        </div>
      </div>

      {/* View supplier */}
      <Modal
        open={detailOf !== null}
        onClose={() => setDetailOf(null)}
        title={detailOf?.name ?? ""}
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
                if (!detailOf) return;
                openEdit(detailOf);
                setDetailOf(null);
              }}
            >
              Edit supplier
            </button>
          </>
        }
      >
        {detailOf && (
          <div className="flex flex-col gap-[16px]">
            <div className="flex items-center gap-[12px]">
              <Avatar name={detailOf.name} src={detailOf.avatar} size={48} radius={10} />
              <div className="min-w-0">
                <p className="truncate text-[16px] font-medium text-[#1e1e1e]">{detailOf.name}</p>
                <p className="truncate text-[13px] text-[#525252]">{detailOf.mail}</p>
              </div>
            </div>
            <dl className="flex flex-col gap-[12px]">
              {[
                ["Phone", detailOf.phone],
                ["Total Purchases", detailOf.totalPurchasesFormatted],
                ["Outstanding Balance", detailOf.balanceFormatted],
                ["Last Purchase", detailOf.lastPurchase],
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
          </div>
        )}
      </Modal>

      {/* Edit supplier */}
      <Modal
        open={editOf !== null}
        onClose={() => setEditOf(null)}
        title="Edit supplier"
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setEditOf(null)}>
              Cancel
            </button>
            <button
              type="button"
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={MODAL_PRIMARY}
              onClick={() => {
                if (!editOf) return;
                if (!draft.name.trim()) return setEditError("Supplier name is required.");
                if (!draft.phone.trim()) return setEditError("Phone number is required.");
                if (draft.mail.trim() && !/^\S+@\S+\.\S+$/.test(draft.mail.trim()))
                  return setEditError("That email address doesn’t look right.");
                patch(editOf.id, {
                  name: draft.name.trim(),
                  phone: draft.phone.trim(),
                  mail: draft.mail.trim(),
                  status: draft.status,
                });
                setNote(`${draft.name.trim()} updated`);
                setEditOf(null);
              }}
            >
              Save changes
            </button>
          </>
        }
      >
        {editOf && (
          <div className="flex flex-col gap-[14px]">
            <div className="flex flex-col gap-[6px]">
              <label htmlFor="sup-name" className={LABEL}>Supplier Name</label>
              <input
                id="sup-name"
                value={draft.name}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, name: e.target.value }));
                  setEditError(null);
                }}
                placeholder="e.g. ABC Traders"
                className={FIELD}
              />
            </div>
            <div className="flex flex-col gap-[6px]">
              <label htmlFor="sup-phone" className={LABEL}>Phone Number</label>
              <input
                id="sup-phone"
                value={draft.phone}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, phone: e.target.value }));
                  setEditError(null);
                }}
                placeholder="e.g. +880 1912 345 680"
                className={FIELD}
              />
            </div>
            <div className="flex flex-col gap-[6px]">
              <label htmlFor="sup-mail" className={LABEL}>Email Address</label>
              <input
                id="sup-mail"
                value={draft.mail}
                onChange={(e) => {
                  setDraft((d) => ({ ...d, mail: e.target.value }));
                  setEditError(null);
                }}
                placeholder="e.g. info@abctraders.com"
                className={FIELD}
              />
            </div>
            <div className="flex flex-col gap-[6px]">
              <span className={LABEL}>Status</span>
              <div className="flex gap-[8px]">
                {(["Active", "Inactive"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, status: v }))}
                    className={`h-[40px] flex-1 cursor-pointer rounded-[10px] text-[14px] font-medium transition-colors ${
                      draft.status === v
                        ? "bg-[#fffbee] text-[#f5b800] shadow-[inset_0_0_0_1px_#f5b800]"
                        : "text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] hover:bg-[#fafafa]"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            {editError && <p className="text-[13px] text-[#e63946]">{editError}</p>}
          </div>
        )}
      </Modal>

      {/* Record payment against the outstanding balance */}
      <Modal
        open={payOf !== null}
        onClose={() => setPayOf(null)}
        title="Record payment"
        width={440}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setPayOf(null)}>
              Cancel
            </button>
            <button
              type="button"
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={MODAL_PRIMARY}
              onClick={async () => {
                if (!payOf || paying) return;
                const amount = Number(payAmount);
                if (!payAmount.trim() || Number.isNaN(amount) || amount <= 0)
                  return setPayError("Enter an amount.");
                if (amount > payOf.balance)
                  return setPayError(`That is more than the ${payOf.balanceFormatted} outstanding.`);

                /**
                 * IT NOW CALLS THE SERVER.
                 *
                 * This handler used to compute `payOf.balance - amount` and
                 * hand it to `patch()` — a local edit of the cached row. The
                 * balance fell on screen, the note said the money was paid,
                 * and no request was ever made: nothing reached the supplier
                 * ledger, the general ledger or the cash account, and the old
                 * figure came back on the next refresh.
                 *
                 * `invalidate` rather than `patch`: the server owns the new
                 * balance, and guessing it locally is how the two came apart
                 * in the first place.
                 */
                setPaying(true);
                setPayError(null);
                try {
                  await SupplierService.recordPayment(
                    payOf.id,
                    amount,
                    `Payment to ${payOf.name}`,
                    { paymentMethod: payMethod, idempotencyKey: payKey }
                  );
                  setNote(`${money(amount)} paid to ${payOf.name}`);
                  setPayOf(null);
                  setPayAmount("");
                  // A supplier payment moves their balance, the payables
                  // report, the cash account and the dashboard's P&L.
                  invalidate("suppliers", "purchases", "dashboard");
                } catch (err) {
                  setPayError(SupplierService.describeError(err));
                } finally {
                  setPaying(false);
                }
              }}
            >
              Record payment
            </button>
          </>
        }
      >
        {payOf && (
          <div className="flex flex-col gap-[14px]">
            <p className="text-[14px] leading-[1.6] text-[#525252]">
              <span className="font-medium text-[#1e1e1e]">{payOf.name}</span> has{" "}
              <span className="font-medium text-[#1e1e1e]">{payOf.balanceFormatted}</span> outstanding.
            </p>
            <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-2">
              <div className="flex flex-col gap-[6px]">
                <AmountLabel
                  htmlFor="sup-pay"
                  className={LABEL}
                  onMax={() => {
                    setPayAmount(String(payOf?.balance ?? 0));
                    setPayError(null);
                  }}
                  maxDisabled={!payOf?.balance}
                >
                  Amount
                </AmountLabel>
                <input
                  id="sup-pay"
                  inputMode="decimal"
                  value={payAmount}
                  onChange={(e) => {
                    // Never more than is owed to them: over-typing is replaced
                    // by the outstanding balance. See `@/lib/money`.
                    setPayAmount(clampTypedAmount(e.target, payOf?.balance ?? 0));
                    setPayError(null);
                  }}
                  placeholder="0"
                  className={FIELD}
                />
              </div>
              {/* HOW it was paid, because the general ledger credits the
                  account the money actually moved through — cash out of the
                  drawer, anything else out of the bank. It was assumed to be
                  cash, which is the one account somebody counts by hand. */}
              <div className="flex flex-col gap-[6px]">
                <label htmlFor="sup-pay-method" className={LABEL}>Paid by</label>
                <select
                  id="sup-pay-method"
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className={FIELD}
                >
                  <option value="CASH">Cash</option>
                  <option value="BANK">Bank transfer</option>
                  <option value="CARD">Card</option>
                  <option value="MOBILE">Mobile banking</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
            </div>
            {payError && <p className="text-[13px] text-[#e63946]">{payError}</p>}
          </div>
        )}
      </Modal>

      {/* Activate / deactivate */}
      <Modal
        open={toggleOf !== null}
        onClose={() => setToggleOf(null)}
        title={toggleOf?.status === "Active" ? "Deactivate supplier" : "Activate supplier"}
        width={440}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setToggleOf(null)}>
              Cancel
            </button>
            <button
              type="button"
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={MODAL_PRIMARY}
              onClick={() => {
                if (!toggleOf) return;
                const next = toggleOf.status === "Active" ? "Inactive" : "Active";
                patch(toggleOf.id, { status: next });
                setNote(`${toggleOf.name} is now ${next.toLowerCase()}`);
                setToggleOf(null);
              }}
            >
              {toggleOf?.status === "Active" ? "Deactivate" : "Activate"}
            </button>
          </>
        }
      >
        {toggleOf && (
          <p className="text-[14px] leading-[1.6] text-[#525252]">
            {toggleOf.status === "Active" ? (
              <>
                Deactivate <span className="font-medium text-[#1e1e1e]">{toggleOf.name}</span>? They stay in the
                list and keep their history, but won’t be offered on new purchase orders.
              </>
            ) : (
              <>
                Activate <span className="font-medium text-[#1e1e1e]">{toggleOf.name}</span> so they can be
                selected on new purchase orders again?
              </>
            )}
          </p>
        )}
      </Modal>

      {/* Delete */}
      <Modal
        open={deleteOf !== null}
        onClose={() => setDeleteOf(null)}
        title="Delete supplier"
        width={440}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setDeleteOf(null)}>
              Cancel
            </button>
            <button
              type="button"
              style={{ backgroundImage: RED_GRADIENT }}
              className={MODAL_PRIMARY}
              onClick={() => {
                if (!deleteOf) return;
                patchRows((list) => list.filter((s) => s.id !== deleteOf.id));
                setNote(`${deleteOf.name} deleted`);
                setDeleteOf(null);
              }}
            >
              Delete
            </button>
          </>
        }
      >
        {deleteOf && (
          <p className="text-[14px] leading-[1.6] text-[#525252]">
            Delete <span className="font-medium text-[#1e1e1e]">{deleteOf.name}</span>? Their{" "}
            {deleteOf.totalPurchasesFormatted} of purchase history goes with them. This can’t be undone.
          </p>
        )}
      </Modal>
    </div>
  );
}
