"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FinanceService } from "@/services";
import { invalidate, queryKey, useQuery } from "@/lib/query/useQuery";
import { useInfiniteRows } from "@/lib/query/useInfiniteRows";
import { CardListState, QueryBoundary, RefreshBar } from "@/components/shared/QueryBoundary";
import ScrollEnd from "@/components/shared/ScrollEnd";
import {
  ActionButton,
  PageToolbar,
  PlusIcon,
  SearchInput,
  TABLE_CARD,
} from "@/components/shared/Toolbar";
import TableSkeleton from "@/components/shared/TableSkeleton";
import RowActionMenu from "@/components/shared/RowActionMenu";
import Modal, { MODAL_GHOST, MODAL_PRIMARY, RED_GRADIENT } from "@/components/shared/Modal";
import FinanceStatCards, {
  type FinanceStatCard,
} from "@/components/modules/finance/FinanceStatCards";
import IncomeExpenseTrend from "@/components/modules/finance/IncomeExpenseTrend";
import YearlyMatrix from "@/components/modules/finance/YearlyMatrix";
import LedgerEntryDialog from "@/components/modules/finance/LedgerEntryDialog";
import type { LedgerEntry, LedgerType } from "@/types/finance";

/**
 * Income & Expense — Figma 367:2574 (Monthly) and 369:5873 (Yearly).
 *
 * ONE screen with two views, which is what the two frames are: the cards and
 * the chart are identical in both, and only the block underneath changes —
 * a list of individual entries, or the same year as a category-by-month
 * matrix. Building them as two routes would have duplicated the top half and
 * let the two halves drift.
 *
 * The summary is one request and the list is another, split by what changes
 * when. Picking a year re-asks for both; typing in the search box, changing
 * the type filter or turning a page re-asks only for the list, which is what
 * keeps the chart from flickering on every keystroke.
 */

const GRID = "grid-cols-[80fr_193fr_193fr_193fr_193fr_193fr_83fr]";
const CELL = "flex min-w-0 items-center p-[12px]";
const HEAD = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e]";
const TEXT = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]";

const INCOME_INK = "#27b85e";
const EXPENSE_INK = "#ff0000";

type View = "monthly" | "yearly";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** `৳ 12,84,500` — the design's spacing and the Indian grouping it uses. */
function taka(value: number): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}৳ ${Math.abs(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/** `+৳ 12,500` / `-৳ 13,200` — the sign comes from the type, never the amount. */
function signedTaka(entry: LedgerEntry): string {
  const mark = entry.type === "INCOME" ? "+" : "-";
  return `${mark}৳ ${entry.amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/** `11-04-2026`, the design's order. */
function displayDate(iso: string): string {
  const [y, m, d] = (iso || "").split("-");
  return y && m && d ? `${d}-${m}-${y}` : iso;
}

function CaretIcon() {
  return (
    <svg
      className="block h-[4px] w-[8px] shrink-0 overflow-visible"
      viewBox="0 0 8 4"
      fill="none"
      aria-hidden
    >
      <path
        d="M0.5 0.5L4 3.5L7.5 0.5"
        stroke="currentColor"
        strokeWidth="1.33"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function IncomeExpensePage() {
  // Read ONCE, not on every render: `new Date()` in the body makes a fresh
  // object each pass, so every `useMemo` that depends on it recomputes forever.
  const router = useRouter();
  const [now] = useState(() => new Date());
  // Yearly first. The year is what somebody opens this screen to see — the
  // shape of the whole book — and the entries list is where they go next to
  // find one row.
  const [view, setView] = useState<View>("yearly");
  const [year, setYear] = useState(now.getFullYear());
  /** null is the whole year — which is what the Yearly view always asks for. */
  const [month, setMonth] = useState<number | null>(now.getMonth() + 1);
  const [term, setTerm] = useState("");
  const [type, setType] = useState<LedgerType | "">("");
  // Rows per request. Not a page size anyone picks — the table scrolls.
  const pageSize = 25;
  const [note, setNote] = useState<string | null>(null);
  const [viewMenu, setViewMenu] = useState(false);
  const [typeMenu, setTypeMenu] = useState(false);
  const [monthMenu, setMonthMenu] = useState(false);
  const [editing, setEditing] = useState<LedgerEntry | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<LedgerEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  /**
   * The cards follow the MONTHLY view's month and the YEARLY view's year.
   *
   * Not a cosmetic choice: the yearly tables below total the whole year, and
   * cards showing one month above them would be four numbers that do not add
   * up to the table under them.
   */
  const cardMonth = view === "monthly" ? month : null;

  const summaryQuery = useQuery(
    queryKey("finance-summary", { year, month: cardMonth }),
    () => FinanceService.summary({ year, month: cardMonth })
  );

  const listQuery = useInfiniteRows(
    queryKey("finance-transactions", { year, month, type, term }),
    (p, limit) =>
      FinanceService.transactions({ year, month, type, search: term, page: p, limit }),
    // The list is not read in the yearly view, so it is not fetched there.
    { pageSize, enabled: view === "monthly" }
  );

  const summary = summaryQuery.data;
  const rows = listQuery.rows;
  const total = listQuery.total;
  const { loadingMore, hasMore, sentinelRef } = listQuery;

  const years = useMemo(() => {
    const current = now.getFullYear();
    return Array.from({ length: 6 }, (_, i) => current - i);
  }, [now]);

  const cards: FinanceStatCard[] = useMemo(() => {
    const t = summary?.totals;
    const scope = cardMonth ? `${MONTH_NAMES[cardMonth - 1]} ${year}` : `${year}`;
    const margin = t?.marginPercent ?? 0;
    const net = t?.net ?? 0;
    return [
      { id: "income", title: "Total Income", value: taka(t?.income ?? 0), note: scope },
      {
        id: "transactions",
        title: "Total Transactions",
        value: String(t?.transactions ?? 0),
        note: scope,
      },
      { id: "expense", title: "Total Expense", value: taka(t?.expense ?? 0), note: scope },
      {
        id: "net",
        title: "Net Balance",
        value: taka(net),
        // The design's "↑ 8.5% Profitable". A shop that spent more than it
        // took gets the other arrow and the red pill, rather than a green
        // badge over a negative number.
        // A month with no money either way is not "0.0% Profitable" — that is
        // a claim about nothing, and it is what an empty September showed
        // above three cards reading zero.
        note:
          (t?.income ?? 0) === 0 && (t?.expense ?? 0) === 0
            ? scope
            : net >= 0
              ? `↑ ${margin.toFixed(1)}% Profitable`
              : `↓ ${Math.abs(margin).toFixed(1)}% At a loss`,
        tone: net >= 0 ? "good" : "bad",
      },
    ];
  }, [summary, cardMonth, year]);

  // The two keys this screen owns; the voucher list and the dashboard's P&L
  // card follow through `DERIVED`. They did not before — an expense typed in
  // here left the dashboard showing the figure from before it.
  const refreshAll = () => invalidate("finance-summary", "finance-transactions");

  const runExport = async () => {
    setExporting(true);
    try {
      const all = await FinanceService.transactions({
        year,
        month,
        type,
        search: term,
        page: 1,
        limit: 200,
      });
      const header = ["Date", "Category", "Description", "Type", "Amount"];
      const body = all.data.map((r) => [
        r.date,
        r.categoryName,
        r.description,
        r.type === "INCOME" ? "Income" : "Expense",
        String(r.signedAmount),
      ]);
      const csv = [header, ...body]
        .map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
        .join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const { saveBlob } = await import("@/services/apiClient");
      saveBlob(blob, `income-expense-${year}${month ? `-${String(month).padStart(2, "0")}` : ""}.csv`);
      setNote("Exported the entries on screen.");
    } catch {
      setNote("The export could not be produced.");
    } finally {
      setExporting(false);
    }
  };

  const confirmRemove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await FinanceService.remove(removing);
      setNote("Entry deleted.");
      setRemoving(null);
      refreshAll();
    } catch (e) {
      setNote(e instanceof Error && e.message ? e.message : "That entry could not be deleted.");
    } finally {
      setBusy(false);
    }
  };

  /**
   * What a row's menu offers, which depends on who owns the row.
   *
   * A sale is the till's document. This screen reports it so the income side
   * is the shop's real money, and an Edit here would be offering to rewrite an
   * invoice from a summary page — the API refuses it, and a menu that offers
   * what the API refuses is the defect this app's own sidebar comments call
   * out. Sales get a link to where they CAN be worked on instead.
   */
  const actionsFor = (row: LedgerEntry) =>
    row.source === "MANUAL"
      ? [
          { label: "Edit", onSelect: () => setEditing(row) },
          { label: "Delete", tone: "danger" as const, onSelect: () => setRemoving(row) },
        ]
      : [
          {
            label: row.source === "SALE" ? "View in Sales" : "View in Returns",
            onSelect: () =>
              router.push(row.source === "SALE" ? "/sales-pos/sales" : "/sales-pos/return"),
          },
        ];

  // The same shape `FilterDropdown` draws — 44px, inset hairline, 14px text —
  // so these hand-rolled menus and the shared ones are one control system.
  // This used a `border`, which puts the hairline outside the box and made
  // these a pixel taller than every dropdown beside them.
  const CONTROL =
    "flex h-[44px] cursor-pointer items-center gap-[8px] rounded-[10px] bg-white px-[12px] " +
    "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252] " +
    "shadow-[inset_0_0_0_1px_#eaeaea] transition-colors hover:bg-[#fafafa] hover:text-[#1e1e1e]";

  return (
    <div className="flex w-full flex-col gap-[16px] pb-[24px]">
      <FinanceStatCards cards={cards} />

      <IncomeExpenseTrend
        points={summary?.trend ?? []}
        rangeLabel={String(year)}
        years={years}
        onYearChange={(next) => {
          setYear(next);
        }}
        onExport={runExport}
        exporting={exporting}
        busy={summaryQuery.loading}
      />

      {/* Page-level controls, ABOVE the card — the pattern every other listing
          screen uses. These sat inside it, under a second "Transactions"
          heading, so Export and Add read as though they belonged to the rows
          on screen rather than to the page. */}
      <PageToolbar
        search={
          <SearchInput
            value={term}
            onChange={setTerm}
            placeholder="Search by name, ID, email, phone…"
            label="Search transactions"
          />
        }
      >
          <div className="flex flex-wrap items-center gap-[12px]">
            <div className="relative">
              <button
                type="button"
                onClick={() => setViewMenu((v) => !v)}
                onBlur={() => window.setTimeout(() => setViewMenu(false), 120)}
                aria-expanded={viewMenu}
                className="flex h-[34px] cursor-pointer items-center gap-[10px] rounded-[8px] bg-[#f5b800] px-[9px] text-[16px] font-medium tracking-[-0.32px] whitespace-nowrap text-white transition-colors hover:bg-[#e5a612]"
              >
                {view === "monthly" ? "Monthly Summary" : "Yearly Summary"}
                <CaretIcon />
              </button>
              {viewMenu && (
                <div className="absolute top-[40px] left-0 z-30 w-[190px] overflow-hidden rounded-[10px] bg-white py-[4px] shadow-[0_8px_30px_rgba(0,0,0,0.10)] ring-1 ring-[#eaeaea]">
                  {(
                    [
                      { key: "monthly" as const, label: "Monthly Summary" },
                      { key: "yearly" as const, label: "Yearly Summary" },
                    ]
                  ).map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setView(option.key);
                        setViewMenu(false);
                      }}
                      className="block w-full cursor-pointer px-[14px] py-[8px] text-left text-[14px] font-medium text-[#525252] transition-colors hover:bg-[#fafafa]"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-[10px] sm:flex-row sm:flex-wrap sm:items-center">

            {/* Type */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setTypeMenu((v) => !v)}
                onBlur={() => window.setTimeout(() => setTypeMenu(false), 120)}
                aria-expanded={typeMenu}
                className={`${CONTROL} w-full justify-between sm:w-[137px]`}
              >
                <span className="truncate">
                  {type === "" ? "All types" : type === "INCOME" ? "Income" : "Expense"}
                </span>
                <CaretIcon />
              </button>
              {typeMenu && (
                <div className="absolute top-[50px] right-0 z-30 w-[160px] overflow-hidden rounded-[10px] bg-white py-[4px] shadow-[0_8px_30px_rgba(0,0,0,0.10)] ring-1 ring-[#eaeaea]">
                  {(
                    [
                      { key: "" as const, label: "All types" },
                      { key: "INCOME" as const, label: "Income" },
                      { key: "EXPENSE" as const, label: "Expense" },
                    ]
                  ).map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setType(option.key);
                        setTypeMenu(false);
                      }}
                      className="block w-full cursor-pointer px-[14px] py-[8px] text-left text-[14px] font-medium text-[#525252] transition-colors hover:bg-[#fafafa]"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* The period. A month in the monthly view; the yearly view is the
                whole year by definition, so it shows the year and no month. */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => view === "monthly" && setMonthMenu((v) => !v)}
                onBlur={() => window.setTimeout(() => setMonthMenu(false), 120)}
                aria-expanded={monthMenu}
                // Wide enough for the longest month name plus a year:
                // "September 2026" was truncating to "September 20…" at the
                // design's 137px, which reads as a broken control.
                className={`${CONTROL} w-full justify-between sm:w-[178px] ${
                  view === "yearly" ? "cursor-default" : ""
                }`}
              >
                <span className="truncate">
                  {view === "yearly" || !month
                    ? String(year)
                    : `${MONTH_NAMES[month - 1]} ${year}`}
                </span>
                {view === "monthly" && <CaretIcon />}
              </button>
              {monthMenu && view === "monthly" && (
                <div className="absolute top-[50px] right-0 z-30 max-h-[260px] w-[180px] overflow-y-auto rounded-[10px] bg-white py-[4px] shadow-[0_8px_30px_rgba(0,0,0,0.10)] ring-1 ring-[#eaeaea]">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setMonth(null);
                      setMonthMenu(false);
                    }}
                    className="block w-full cursor-pointer px-[14px] py-[8px] text-left text-[14px] font-medium text-[#525252] transition-colors hover:bg-[#fafafa]"
                  >
                    Whole year
                  </button>
                  {MONTH_NAMES.map((name, i) => (
                    <button
                      key={name}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setMonth(i + 1);
                        setMonthMenu(false);
                      }}
                      className="block w-full cursor-pointer px-[14px] py-[8px] text-left text-[14px] font-medium text-[#525252] transition-colors hover:bg-[#fafafa]"
                    >
                      {name} {year}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <ActionButton variant="primary" onClick={() => setAdding(true)}>
              <PlusIcon />
              Add entry
            </ActionButton>
          </div>
      </PageToolbar>

      {/* The table card — head, body, pagination. */}
      <div className={TABLE_CARD}>
        <RefreshBar active={summaryQuery.fetching || listQuery.fetching} />

        {view === "monthly" ? (
          <>
            {/* Table from md up — the design's seven columns. */}
            {/* One scroller for the table, the phone cards and the load trigger.
                The trigger has to sit INSIDE it — below the scroller it never
                leaves the screen, and every page loads at once the moment the
                table opens. */}
            <div className="table-scroll">

            <div className="hidden px-[16px] pt-[16px] md:block">
              <div className="min-w-[1000px]">
                <div className={`table-head grid ${GRID} border-b border-solid border-[#eaeaea] bg-white`}>
                  {["#", "Date", "Category", "Description", "Type", "Amount"].map((label) => (
                    <div key={label} className={`${CELL} h-[40px]`}>
                      <span className={`${HEAD} whitespace-nowrap`}>{label}</span>
                    </div>
                  ))}
                  <div className={`${CELL} h-[40px] justify-center`}>
                    <span className={`${HEAD} whitespace-nowrap`}>Action</span>
                  </div>
                </div>

                <QueryBoundary
                  loading={listQuery.loading}
                  error={listQuery.error}
                  hasData={!listQuery.loading && !listQuery.error}
                  errorMessage="The entries could not be loaded."
                  onRetry={listQuery.refetch}
                  skeleton={<TableSkeleton rows={8} columns={GRID} />}
                >
                  {/* The empty state lives inside the boundary, so it is shown
                      only once the request has actually come back empty rather
                      than during the first load. */}
                  {rows.length === 0 && (
                    <p className="px-[12px] py-[24px] text-[14px] text-[#8f8d87]">
                      {term || type
                        ? "No entries match that search."
                        : "Nothing recorded yet."}
                    </p>
                  )}
                  {rows.map((row, i) => (
                    <div
                      key={`${row.type}-${row.id}`}
                      className={`grid ${GRID} border-b border-solid border-[#f2f2f2] transition-colors hover:bg-[#fafafa]`}
                    >
                      <div className={CELL}>
                        <span className={`${TEXT} truncate`}>
                          {String(i + 1).padStart(2, "0")}
                        </span>
                      </div>
                      <div className={CELL}>
                        <span className={`${TEXT} truncate`}>{displayDate(row.date)}</span>
                      </div>
                      <div className={CELL}>
                        <span className={`${TEXT} truncate`}>{row.categoryName || "—"}</span>
                      </div>
                      <div className={CELL}>
                        <span className={`${TEXT} truncate`} title={row.description}>
                          {row.description || "—"}
                        </span>
                      </div>
                      <div className={CELL}>
                        <span className={`${TEXT} truncate`}>
                          {row.type === "INCOME" ? "Income" : "Expense"}
                        </span>
                      </div>
                      <div className={CELL}>
                        <span
                          className="truncate text-[14px] leading-[1.5] font-medium tracking-[-0.28px]"
                          style={{ color: row.type === "INCOME" ? INCOME_INK : EXPENSE_INK }}
                        >
                          {signedTaka(row)}
                        </span>
                      </div>
                      <div className={`${CELL} justify-center`}>
                        <RowActionMenu
                          label={`Actions for ${row.categoryName} ${displayDate(row.date)}`}
                          actions={actionsFor(row)}
                        />
                      </div>
                    </div>
                  ))}
                </QueryBoundary>
              </div>
            </div>

            {/* Stacked cards below md. */}
            <div className="flex flex-col gap-[10px] px-[16px] pt-[16px] md:hidden">
              <CardListState
                loading={listQuery.loading}
                error={listQuery.error}
                hasData={!listQuery.loading && !listQuery.error}
                isEmpty={rows.length === 0}
                errorMessage="The entries could not be loaded."
                emptyMessage={
                  term || type ? "No entries match that search." : "Nothing recorded yet."
                }
                onRetry={listQuery.refetch}
                rows={4}
              />
              {rows.map((row) => (
                <div
                  key={`${row.type}-${row.id}`}
                  className="rounded-[10px] border border-solid border-[#eaeaea] p-[12px]"
                >
                  <div className="flex items-start justify-between gap-[10px]">
                    <div className="min-w-0">
                      <p className={`${TEXT} truncate !text-[#1e1e1e]`}>
                        {row.categoryName || "—"}
                      </p>
                      <p className="mt-[2px] truncate text-[12px] tracking-[-0.24px] text-[#525252]">
                        {row.description || "—"}
                      </p>
                    </div>
                    <span
                      className="shrink-0 text-[14px] font-medium tracking-[-0.28px]"
                      style={{ color: row.type === "INCOME" ? INCOME_INK : EXPENSE_INK }}
                    >
                      {signedTaka(row)}
                    </span>
                  </div>
                  <div className="mt-[10px] flex items-center justify-between gap-[10px]">
                    <span className="text-[12px] tracking-[-0.24px] text-[#525252]">
                      {displayDate(row.date)} · {row.type === "INCOME" ? "Income" : "Expense"}
                    </span>
                    <RowActionMenu
                      label={`Actions for ${row.categoryName} ${displayDate(row.date)}`}
                      actions={actionsFor(row)}
                    />
                  </div>
                </div>
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
                noun="transactions"
              />
            </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-[28px] px-[16px] pt-[8px] pb-[24px]">
            <QueryBoundary
              loading={summaryQuery.loading}
              error={summaryQuery.error}
              hasData={summaryQuery.data !== undefined}
              errorMessage="The yearly summary could not be loaded."
              onRetry={summaryQuery.refetch}
              skeleton={<TableSkeleton rows={6} columns={GRID} />}
            >
              <YearlyMatrix
                tone="income"
                banner="Income Summary (Month by Month)"
                heading="Income Summary (Month by Month)"
                rowLabel="Month"
                rows={summary?.matrix.income ?? []}
                totalLabel="Total Income"
                totalMonths={Array.from({ length: 12 }, (_, i) =>
                  (summary?.matrix.income ?? []).reduce((sum, r) => sum + r.months[i], 0)
                )}
                totalValue={(summary?.matrix.income ?? []).reduce((s, r) => s + r.total, 0)}
                emptyMessage={`No income recorded in ${year}.`}
              />
              <YearlyMatrix
                tone="expense"
                banner="Expense Summary (Month by Month)"
                heading="Expense Summary (Month by Month)"
                rowLabel="Month"
                rows={summary?.matrix.expense ?? []}
                totalLabel="Total Expense"
                totalMonths={Array.from({ length: 12 }, (_, i) =>
                  (summary?.matrix.expense ?? []).reduce((sum, r) => sum + r.months[i], 0)
                )}
                totalValue={(summary?.matrix.expense ?? []).reduce((s, r) => s + r.total, 0)}
                emptyMessage={`No expenses recorded in ${year}.`}
              />
              <YearlyMatrix
                tone="net"
                banner="Net Balance (Month by Month)"
                heading="Net Balance (Month by Month)"
                rowLabel="Month"
                rows={[]}
                totalLabel="Income – Expense"
                totalMonths={summary?.matrix.net.months ?? Array(12).fill(0)}
                totalValue={summary?.matrix.net.total ?? 0}
                emptyMessage=""
              />
            </QueryBoundary>
          </div>
        )}
      </div>

      <LedgerEntryDialog
        open={adding || editing !== null}
        entry={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        onSaved={() => {
          setNote(editing ? "Entry updated." : "Entry added.");
          refreshAll();
        }}
      />

      {/* Delete — a confirm, because it reverses ledger rows behind it. */}
      <Modal
        open={removing !== null}
        onClose={() => !busy && setRemoving(null)}
        title="Delete this entry?"
        width={420}
        footer={
          <>
            <button
              type="button"
              className={MODAL_GHOST}
              disabled={busy}
              onClick={() => setRemoving(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              style={{ backgroundImage: RED_GRADIENT }}
              className={MODAL_PRIMARY}
              onClick={confirmRemove}
            >
              {busy ? "Deleting…" : "Delete"}
            </button>
          </>
        }
      >
        <p className="text-[14px] leading-[1.6] text-[#525252]">
          {removing
            ? `${removing.categoryName || "This entry"} — ${signedTaka(removing)} on ${displayDate(
                removing.date
              )}.`
            : ""}{" "}
          The ledger rows behind it are reversed, so the books stay balanced. This cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
