"use client";

import React, { useMemo, useState } from "react";
import { FinanceService, VoucherService } from "@/services";
import { invalidate, queryKey, useQuery } from "@/lib/query/useQuery";
import { useInfiniteRows } from "@/lib/query/useInfiniteRows";
import { CardListState, QueryBoundary, RefreshBar } from "@/components/shared/QueryBoundary";
import ScrollEnd from "@/components/shared/ScrollEnd";
import TableSkeleton from "@/components/shared/TableSkeleton";
import RowActionMenu from "@/components/shared/RowActionMenu";
import FilterDropdown from "@/components/shared/FilterDropdown";
import DateFilter, { ALL_DATES, resolveDates, type DateValue } from "@/components/shared/DateFilter";
import {
  ActionButton,
  ExportIcon,
  PageToolbar,
  PlusIcon,
  SearchInput,
  TABLE_CARD,
} from "@/components/shared/Toolbar";
import Modal, {
  GOLD_GRADIENT,
  MODAL_GHOST,
  MODAL_PRIMARY,
  RED_GRADIENT,
} from "@/components/shared/Modal";
import FinanceStatCards, {
  type FinanceStatCard,
} from "@/components/modules/finance/FinanceStatCards";
import VoucherDialog from "@/components/modules/finance/VoucherDialog";
import VoucherReceipt from "@/components/modules/finance/VoucherReceipt";
import CategoryManager from "@/components/modules/finance/CategoryManager";
import { useSession } from "@/services/useSession";
import type { LedgerType, Voucher } from "@/types/finance";

/**
 * Vouchers — the shop's money in and out, as numbered documents.
 *
 * The second Finance screen, and deliberately not a second set of numbers.
 * A voucher IS an `Income` or an `Expense` row: the same rows the Income &
 * Expense screen charts, the same rows the P&L reads, the same rows the
 * dashboard's expense figure sums. What this screen adds is the document
 * around them — a gapless per-branch number, and a slip that can be printed
 * and signed.
 *
 * That is why nothing here is amendable. A voucher has been printed and handed
 * over; editing the figure afterwards leaves two versions of one payment. The
 * correction is a VOID — which reverses the ledger and leaves the reversal
 * visible — and then a new voucher.
 */

const GRID = "grid-cols-[60fr_190fr_170fr_240fr_150fr_170fr_90fr]";
const CELL = "flex min-w-0 items-center p-[12px]";
const HEAD = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e]";
const TEXT = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]";

const INCOME_INK = "#1f9d55";
const EXPENSE_INK = "#c0392b";

/** `৳ 12,84,500` — the spacing and the Indian grouping every other card uses. */
function taka(value: number): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}৳ ${Math.abs(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function signedTaka(row: Voucher): string {
  const mark = row.type === "INCOME" ? "+" : "-";
  return `${mark}৳ ${row.amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/** `11-04-2026`, the order every other list here prints. */
function displayDate(iso: string): string {
  const [y, m, d] = (iso || "").split("-");
  return y && m && d ? `${d}-${m}-${y}` : iso;
}

/** The type badge. Small, and the only colour in the row besides the amount. */
function TypePill({ type }: { type: LedgerType }) {
  const income = type === "INCOME";
  return (
    <span
      className="inline-flex h-[26px] items-center rounded-[13px] px-[10px] text-[12px] font-semibold whitespace-nowrap"
      style={{
        color: income ? INCOME_INK : EXPENSE_INK,
        backgroundColor: income ? "#eaf7ef" : "#fdeceb",
      }}
    >
      {income ? "Income" : "Expense"}
    </span>
  );
}

export default function VouchersPage() {
  const [term, setTerm] = useState("");
  const [type, setType] = useState<LedgerType | "">("");
  const [categoryId, setCategoryId] = useState("");
  const [dates, setDates] = useState<DateValue>(ALL_DATES);
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);
  const [receiptOf, setReceiptOf] = useState<Voucher | null>(null);
  const [voiding, setVoiding] = useState<Voucher | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const { user: session } = useSession();
  const held = useMemo(() => session?.permissions ?? [], [session]);
  // A voucher is an income OR an expense, so the right to write one is the
  // right to write either. Somebody who may only record spending still gets
  // the button — the dialog's Income half is what the API would refuse, and
  // that refusal is shown there rather than guessed at here.
  const mayWrite = held.includes("expense.create") || held.includes("income.create");
  const mayVoid = held.includes("expense.delete") || held.includes("income.delete");
  const mayManageCategories =
    held.includes("expense_category.create") || held.includes("income_category.create");

  const range = useMemo(() => resolveDates(dates), [dates]);

  /** One filter object, shared by the cards and the rows so they cannot drift. */
  const filter = useMemo(
    () => ({
      type,
      categoryId,
      search: term,
      dateFrom: range.from,
      dateTo: range.to,
    }),
    [type, categoryId, term, range.from, range.to]
  );

  const totalsQuery = useQuery(queryKey("vouchers-summary", filter), () =>
    VoucherService.totals(filter)
  );

  const listQuery = useInfiniteRows(
    queryKey("vouchers", filter),
    (page, limit) => VoucherService.list({ ...filter, page, limit }),
    { pageSize: 25 }
  );

  const rows = listQuery.rows;
  const { loadingMore, hasMore, sentinelRef, total } = listQuery;
  const totals = totalsQuery.data;

  // The categories of BOTH sides when no type is chosen, so the dropdown
  // offers what the list can actually contain. Filtering by an expense
  // category while the list shows income is not a state worth reaching, and
  // the type filter above narrows this automatically.
  const { data: expenseCategories } = useQuery(
    queryKey("finance-categories", { type: "EXPENSE" }),
    () => FinanceService.categories("EXPENSE")
  );
  const { data: incomeCategories } = useQuery(
    queryKey("finance-categories", { type: "INCOME" }),
    () => FinanceService.categories("INCOME")
  );

  const categoryOptions = useMemo(() => {
    const income = incomeCategories ?? [];
    const expense = expenseCategories ?? [];
    const list = type === "INCOME" ? income : type === "EXPENSE" ? expense : [...expense, ...income];
    return [
      { value: "", label: "All categories" },
      ...list.map((c) => ({ value: c.id, label: c.name })),
    ];
  }, [incomeCategories, expenseCategories, type]);

  /** A chosen category that the current type filter no longer offers is not one. */
  const selectedCategory = categoryOptions.some((o) => o.value === categoryId)
    ? categoryId
    : "";

  // ONE prefix. The Income & Expense screen reads the same rows and so does
  // the dashboard's P&L, and `DERIVED` in the query store says so — which is
  // where that belongs, rather than in a list here that the next write site
  // has to remember to copy.
  const refreshAll = () => invalidate("vouchers");

  const confirmVoid = async () => {
    if (!voiding) return;
    setBusy(true);
    try {
      await VoucherService.remove(voiding.id);
      setNote(`Voucher ${voiding.voucherNo || ""} voided.`.replace("  ", " "));
      setVoiding(null);
      refreshAll();
    } catch (e) {
      setNote(
        e instanceof Error && e.message ? e.message : "That voucher could not be voided."
      );
    } finally {
      setBusy(false);
    }
  };

  const runExport = async () => {
    setExporting(true);
    try {
      // The whole FILTERED set, not the rows scrolled to so far: an export
      // that silently stopped where the reader's scrolling did would be a
      // partial book with nothing in the file to say so.
      //
      // Paged, because the server caps `limit` at 200. Asking once for 200 is
      // what the Income & Expense screen does and it TRUNCATES silently — the
      // 201st voucher is simply absent from a file somebody files. The loop is
      // bounded so a paging bug cannot spin forever.
      const rowsOut: Voucher[] = [];
      for (let page = 1; page <= 50; page += 1) {
        const chunk = await VoucherService.list({ ...filter, page, limit: 200 });
        rowsOut.push(...chunk.data);
        if (rowsOut.length >= chunk.total || chunk.data.length === 0) break;
      }
      const all = { data: rowsOut };
      const header = [
        "Voucher No",
        "Date",
        "Type",
        "Category",
        "Note",
        "Paid from / Received into",
        "Amount",
      ];
      const body = all.data.map((r) => [
        r.voucherNo,
        r.date,
        r.type === "INCOME" ? "Income" : "Expense",
        r.categoryName,
        r.description,
        r.paymentAccountName,
        String(r.signedAmount),
      ]);
      const csv = [header, ...body]
        .map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
        .join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const { saveBlob } = await import("@/services/apiClient");
      saveBlob(blob, "vouchers.csv");
      setNote("Exported the vouchers on screen.");
    } catch {
      setNote("The export could not be produced.");
    } finally {
      setExporting(false);
    }
  };

  const cards: FinanceStatCard[] = useMemo(() => {
    const net = totals?.net ?? 0;
    const scope = dates.mode === "all" ? "All time" : "Selected period";
    return [
      {
        id: "transactions",
        title: "Total Vouchers",
        value: String(totals?.count ?? 0),
        note: scope,
      },
      { id: "income", title: "Total Income", value: taka(totals?.income ?? 0), note: scope },
      { id: "expense", title: "Total Expense", value: taka(totals?.expense ?? 0), note: scope },
      {
        id: "net",
        title: "Net Balance",
        value: taka(net),
        note: net >= 0 ? "In hand" : "Overspent",
        tone: net >= 0 ? "good" : "bad",
      },
    ];
  }, [totals, dates.mode]);

  const actionsFor = (row: Voucher) => [
    { label: "Print receipt", onSelect: () => setReceiptOf(row) },
    ...(mayVoid
      ? [{ label: "Void", tone: "danger" as const, onSelect: () => setVoiding(row) }]
      : []),
  ];

  const filtered = term !== "" || type !== "" || selectedCategory !== "" || dates.mode !== "all";

  return (
    <div className="flex w-full flex-col gap-[16px] pb-[24px]">
      <FinanceStatCards cards={cards} />

      {/* Page-level controls, ABOVE the card.
          These used to sit inside it, under a second "Voucher list" heading —
          so the page had two titles, and Export read as though it meant the
          rows on screen rather than the filtered set. */}
      <PageToolbar
        search={
          <SearchInput
            value={term}
            onChange={setTerm}
            placeholder="Search voucher no, category or note…"
            label="Search vouchers"
          />
        }
      >
        <FilterDropdown
          label="All types"
          value={type}
          options={[
            { value: "", label: "All types" },
            { value: "INCOME", label: "Income" },
            { value: "EXPENSE", label: "Expense" },
          ]}
          onChange={(next) => setType(next as LedgerType | "")}
        />

        <FilterDropdown
          label="All categories"
          value={selectedCategory}
          options={categoryOptions}
          onChange={setCategoryId}
        />

        <DateFilter value={dates} onChange={setDates} />

        <ActionButton onClick={runExport} disabled={exporting}>
          <ExportIcon />
          {exporting ? "Exporting…" : "Export"}
        </ActionButton>

        {mayManageCategories && (
          <ActionButton onClick={() => setManaging(true)}>Categories</ActionButton>
        )}

        {mayWrite && (
          <ActionButton variant="primary" onClick={() => setAdding(true)}>
            <PlusIcon />
            New voucher
          </ActionButton>
        )}
      </PageToolbar>

      <div className={TABLE_CARD}>
        <RefreshBar active={totalsQuery.fetching || listQuery.fetching} />

        {/* One scroller for the table, the phone cards and the load trigger.
            The trigger has to sit INSIDE it — below the scroller it never
            leaves the screen, and every page loads at once. */}
        <div className="table-scroll">
          <div className="hidden px-[16px] pt-[16px] md:block">
            <div className="min-w-[1050px]">
              <div
                className={`table-head grid ${GRID} border-b border-solid border-[#eaeaea] bg-white`}
              >
                {["#", "Voucher No", "Date", "Category / Note", "Type", "Paid from", "Amount"].map(
                  (label) => (
                    <div key={label} className={`${CELL} h-[40px]`}>
                      <span className={`${HEAD} whitespace-nowrap`}>{label}</span>
                    </div>
                  )
                )}
              </div>

              <QueryBoundary
                loading={listQuery.loading}
                error={listQuery.error}
                hasData={!listQuery.loading && !listQuery.error}
                errorMessage="The vouchers could not be loaded."
                onRetry={listQuery.refetch}
                skeleton={<TableSkeleton rows={8} columns={GRID} />}
              >
                {rows.length === 0 && (
                  <p className="px-[12px] py-[24px] text-[14px] text-[#8f8d87]">
                    {filtered ? "No vouchers match that search." : "No vouchers written yet."}
                  </p>
                )}
                {rows.map((row, i) => (
                  <div
                    key={`${row.type}-${row.id}`}
                    className={`grid ${GRID} border-b border-solid border-[#f2f2f2] transition-colors hover:bg-[#fafafa]`}
                  >
                    <div className={CELL}>
                      <span className={`${TEXT} truncate`}>{String(i + 1).padStart(2, "0")}</span>
                    </div>
                    <div className={CELL}>
                      <span
                        className={`${TEXT} truncate !text-[#1e1e1e]`}
                        title={row.voucherNo}
                      >
                        {/* An entry written from the Income & Expense screen
                            has no number. It is still one of the shop's
                            vouchers — the same money out of the same drawer —
                            so it is shown, and the dash is honest. */}
                        {row.voucherNo || "—"}
                      </span>
                    </div>
                    <div className={CELL}>
                      <span className={`${TEXT} truncate`}>{displayDate(row.date)}</span>
                    </div>
                    <div className={`${CELL} flex-col !items-start gap-[2px]`}>
                      <span className={`${TEXT} w-full truncate !text-[#1e1e1e]`}>
                        {row.categoryName || "—"}
                      </span>
                      {row.description && (
                        <span
                          className="w-full truncate text-[12px] tracking-[-0.24px] text-[#8f8d87]"
                          title={row.description}
                        >
                          {row.description}
                        </span>
                      )}
                    </div>
                    <div className={CELL}>
                      <TypePill type={row.type} />
                    </div>
                    <div className={CELL}>
                      <span className={`${TEXT} truncate`}>{row.paymentAccountName}</span>
                    </div>
                    <div className={`${CELL} justify-between gap-[8px]`}>
                      <span
                        className="truncate text-[14px] leading-[1.5] font-semibold tracking-[-0.28px] tabular-nums"
                        style={{ color: row.type === "INCOME" ? INCOME_INK : EXPENSE_INK }}
                      >
                        {signedTaka(row)}
                      </span>
                      <RowActionMenu
                        label={`Actions for voucher ${row.voucherNo || displayDate(row.date)}`}
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
              errorMessage="The vouchers could not be loaded."
              emptyMessage={
                filtered ? "No vouchers match that search." : "No vouchers written yet."
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
                    <p className={`${TEXT} truncate !text-[#1e1e1e]`}>{row.voucherNo || "—"}</p>
                    <p className="mt-[2px] truncate text-[12px] tracking-[-0.24px] text-[#525252]">
                      {row.categoryName}
                      {row.description ? ` · ${row.description}` : ""}
                    </p>
                  </div>
                  <span
                    className="shrink-0 text-[14px] font-semibold tracking-[-0.28px] tabular-nums"
                    style={{ color: row.type === "INCOME" ? INCOME_INK : EXPENSE_INK }}
                  >
                    {signedTaka(row)}
                  </span>
                </div>
                <div className="mt-[10px] flex items-center justify-between gap-[10px]">
                  <span className="text-[12px] tracking-[-0.24px] text-[#525252]">
                    {displayDate(row.date)} · {row.paymentAccountName}
                  </span>
                  <RowActionMenu
                    label={`Actions for voucher ${row.voucherNo || displayDate(row.date)}`}
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
              noun="vouchers"
            />
          </div>
        </div>
      </div>

      <VoucherDialog
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={(saved) => {
          refreshAll();
          // Straight to the slip. A voucher exists to be printed and signed,
          // so hiding the print behind a row menu would make the common path
          // two extra clicks and a scan of the list for the row just written.
          setReceiptOf(saved);
        }}
      />

      <CategoryManager
        open={managing}
        onClose={() => setManaging(false)}
        initialType={type === "INCOME" ? "INCOME" : "EXPENSE"}
      />

      {/* Print — the print stylesheet hides everything but .print-area. */}
      <Modal
        open={receiptOf !== null}
        onClose={() => setReceiptOf(null)}
        title="Voucher"
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
            <VoucherReceipt voucher={receiptOf} />
          </div>
        )}
      </Modal>

      <Modal
        open={voiding !== null}
        onClose={() => !busy && setVoiding(null)}
        title="Void this voucher?"
        width={440}
        footer={
          <>
            <button
              type="button"
              className={MODAL_GHOST}
              disabled={busy}
              onClick={() => setVoiding(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              style={{ backgroundImage: RED_GRADIENT }}
              className={MODAL_PRIMARY}
              onClick={confirmVoid}
            >
              {busy ? "Voiding…" : "Void voucher"}
            </button>
          </>
        }
      >
        <p className="text-[14px] leading-[1.6] text-[#525252]">
          {voiding
            ? `${voiding.voucherNo || "This voucher"} — ${signedTaka(voiding)} on ${displayDate(
                voiding.date
              )}.`
            : ""}{" "}
          The ledger rows behind it are reversed, so the books stay balanced. The number is not
          reused. This cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
