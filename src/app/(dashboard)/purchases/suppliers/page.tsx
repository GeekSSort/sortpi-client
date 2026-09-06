"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SupplierRecord } from "@/types/suppliers";
import { SupplierService } from "@/services";
import StatusPill, { Tone } from "@/components/shared/StatusPill";
import RowActionMenu from "@/components/shared/RowActionMenu";
import TablePagination from "@/components/shared/TablePagination";
import TableSkeleton from "@/components/shared/TableSkeleton";
import Avatar from "@/components/shared/Avatar";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY, RED_GRADIENT } from "@/components/shared/Modal";

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

function PlusIcon() {
  return (
    <svg className="block size-[20px] shrink-0" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M10 4.167v11.666M4.167 10h11.666" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

// #  Supplier Name  Phone  Mail  Total Purchases  Balance  Last Purchase  Status  Action
const GRID = "grid-cols-[52fr_176fr_156fr_196fr_132fr_118fr_128fr_104fr_83fr]";
const CELL = "flex min-w-0 items-center p-[12px]";
const HEAD = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e]";
const TEXT = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]";
const FIELD =
  "h-[44px] w-full rounded-[10px] bg-white px-[12px] text-[14px] leading-[1.5] tracking-[-0.28px] text-[#1e1e1e] shadow-[inset_0_0_0_1px_#eaeaea] outline-none transition-shadow placeholder:text-[#a3a3a3] focus:shadow-[inset_0_0_0_1px_#f5b800]";
const LABEL = "text-[13px] leading-[1.5] font-medium tracking-[-0.26px] text-[#1e1e1e]";

const STATUS_FILTERS = ["All", "Active", "Inactive"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

type EditDraft = { name: string; phone: string; mail: string; status: SupplierRecord["status"] };

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("All");
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [note, setNote] = useState<string | null>(null);

  const [detailOf, setDetailOf] = useState<SupplierRecord | null>(null);
  const [editOf, setEditOf] = useState<SupplierRecord | null>(null);
  const [draft, setDraft] = useState<EditDraft>({ name: "", phone: "", mail: "", status: "Active" });
  const [editError, setEditError] = useState<string | null>(null);
  const [payOf, setPayOf] = useState<SupplierRecord | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payError, setPayError] = useState<string | null>(null);
  const [toggleOf, setToggleOf] = useState<SupplierRecord | null>(null);
  const [deleteOf, setDeleteOf] = useState<SupplierRecord | null>(null);

  const filterRef = useRef<HTMLDivElement>(null);
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
    // "ac" land after "acme" and repopulate the table with the wrong rows.
    // Status goes to the API too, and so does the page.
    let live = true;
    const id = setTimeout(() => {
      setLoading(true);
      SupplierService.getSuppliers({
        search: query,
        status: status === "All" ? undefined : status,
        page,
        limit: pageSize,
      })
        .then((res) => {
          if (!live) return;
          setSuppliers(res.data);
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
  }, [query, status, refresh, page, pageSize]);

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

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages);
  // The server already filtered and sliced. `rows` is the page.
  const rows = suppliers;

  const patch = (id: string, next: Partial<SupplierRecord>) =>
    setSuppliers((list) => list.map((s) => (s.id === id ? { ...s, ...next } : s)));

  const openEdit = (s: SupplierRecord) => {
    setDraft({ name: s.name, phone: s.phone, mail: s.mail, status: s.status });
    setEditError(null);
    setEditOf(s);
  };

  const openPayment = (s: SupplierRecord) => {
    setPayAmount("");
    setPayError(null);
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
    <div className="flex w-full flex-col gap-[14px] select-none">
      {/* Search left, Add New right — the Purchase History header row */}
      <div className="flex w-full flex-col items-stretch gap-[16px] lg:h-[48px] lg:flex-row lg:items-center lg:justify-between lg:gap-0">
        <div className="flex h-[44px] w-full items-center justify-between gap-[12px] rounded-[10px] bg-white px-[12px] py-[10px] shadow-[inset_0_0_0_1px_#eaeaea] lg:w-[370px]">
          <div className="flex min-w-0 flex-1 items-center gap-[6px] text-[#525252]">
            <SearchIcon />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name, phone or mail..."
              aria-label="Search suppliers"
              className="min-w-0 flex-1 bg-transparent text-[14px] leading-[1.5] tracking-[-0.28px] text-[#525252] outline-none placeholder:text-[#525252]"
            />
          </div>

          {/* Status filter — the funnel was dead in the scaffold */}
          <div ref={filterRef} className="relative shrink-0">
            <button
              type="button"
              aria-label="Filter by status"
              aria-expanded={filterOpen}
              onClick={() => setFilterOpen((v) => !v)}
              className={`cursor-pointer transition-colors ${status === "All" ? "text-[#525252] hover:text-[#1e1e1e]" : "text-[#f5b800]"}`}
            >
              <FilterIcon />
            </button>
            {filterOpen && (
              <div className="absolute top-[28px] right-0 z-30 w-[150px] overflow-hidden rounded-[10px] bg-white py-[4px] shadow-[0_8px_30px_rgba(0,0,0,0.10)] ring-1 ring-[#eaeaea]">
                {STATUS_FILTERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setStatus(s);
                      setPage(1);
                      setFilterOpen(false);
                    }}
                    className={`block w-full cursor-pointer px-[12px] py-[9px] text-left text-[13px] transition-colors hover:bg-[#fafafa] ${
                      status === s ? "font-medium text-[#f5b800]" : "text-[#525252]"
                    }`}
                  >
                    {s === "All" ? "All suppliers" : s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <Link
          href="/purchases/suppliers/add"
          style={{ backgroundImage: GOLD_GRADIENT }}
          className="flex h-[48px] shrink-0 cursor-pointer items-center justify-center gap-[12px] rounded-[12px] px-[16px] py-[8px] text-[16px] leading-[24px] font-semibold whitespace-nowrap text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)]"
        >
          <PlusIcon />
          Add New
        </Link>
      </div>

      {/* Table card */}
      <div className="w-full overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
        <div className="hidden px-[16px] pt-[16px] md:block">
          <div className="overflow-x-auto">
            <div className="min-w-[1145px]">
              <div className={`grid ${GRID} items-start overflow-clip rounded-[6px] shadow-[inset_0_0_0_1px_#eaeaea]`}>
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
                {rows.length === 0 && loading && (
                  <TableSkeleton columns={GRID} rows={pageSize} />
                )}
                {rows.length === 0 && !loading && (
                  <p className="py-[40px] text-center text-[14px] text-[#525252]">
                    {failed
                      ? "Suppliers could not be loaded. Refresh to try again."
                      : "No suppliers match that search or filter."}
                  </p>
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
              </div>
            </div>
          </div>
        </div>

        {/* Stacked cards below md — also tappable */}
        <div className="flex flex-col gap-[10px] px-[16px] pt-[16px] md:hidden">
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
              onClick={() => {
                if (!payOf) return;
                const amount = Number(payAmount);
                if (!payAmount.trim() || Number.isNaN(amount) || amount <= 0)
                  return setPayError("Enter an amount greater than zero.");
                if (amount > payOf.balance)
                  return setPayError(`That is more than the ${payOf.balanceFormatted} outstanding.`);
                const left = payOf.balance - amount;
                patch(payOf.id, { balance: left, balanceFormatted: money(left) });
                setNote(`${money(amount)} paid to ${payOf.name}`);
                setPayOf(null);
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
            <div className="flex flex-col gap-[6px]">
              <label htmlFor="sup-pay" className={LABEL}>Amount</label>
              <input
                id="sup-pay"
                inputMode="decimal"
                value={payAmount}
                onChange={(e) => {
                  setPayAmount(e.target.value);
                  setPayError(null);
                }}
                placeholder="0"
                className={FIELD}
              />
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
                setSuppliers((list) => list.filter((s) => s.id !== deleteOf.id));
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
