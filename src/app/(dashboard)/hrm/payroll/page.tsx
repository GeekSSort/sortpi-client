"use client";

import React, { useEffect, useRef, useState } from "react";
import { PayrollRecord } from "@/types/payroll";
import { PayrollService } from "@/services/payrollService";
import StatusPill, { Tone } from "@/components/shared/StatusPill";
import FilterDropdown from "@/components/shared/FilterDropdown";
import { formatMoney } from "@/lib/format";
import ScrollEnd from "@/components/shared/ScrollEnd";
import TableSkeleton from "@/components/shared/TableSkeleton";
import Avatar from "@/components/shared/Avatar";
import RowActionMenu from "@/components/shared/RowActionMenu";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY } from "@/components/shared/Modal";
import { useQuery, queryKey, invalidate } from "@/lib/query/useQuery";
import { useInfiniteRows } from "@/lib/query/useInfiniteRows";
import { CardListState, EmptyState, QueryBoundary, RefreshBar } from "@/components/shared/QueryBoundary";
import {
  ActionButton,
  PageToolbar,
  PlusIcon,
  SearchInput,
  TABLE_CARD,
} from "@/components/shared/Toolbar";

/**
 * Payroll — Figma 75:5509.
 *
 * Seven columns fixed at both ends: # 80, Employee 230, four equal money
 * columns, Status 140, then the 83px action column. Rows 54 tall with 12px
 * cells. Search and the filter sit
 * in the headline row, as they do on the other list pages.
 */

const GRID = "grid-cols-[80px_230px_1fr_1fr_1fr_1fr_140px_83px]";
const CELL = "flex items-center px-[12px]";
const HEAD =
  "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e] whitespace-nowrap";
const BODY =
  "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252] whitespace-nowrap";

const MONEY_FIELD =
  "h-[44px] w-full rounded-[10px] bg-white px-[12px] text-[14px] text-[#1e1e1e] shadow-[inset_0_0_0_1px_#eaeaea] outline-none focus:shadow-[inset_0_0_0_1.5px_#f5b800]";

const STATUS_TONE: Record<PayrollRecord["status"], Tone> = { Paid: "green", "Not Paid": "rose" };
// Still the source of the state's type, though the options now live on
// the dropdown itself.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const FILTERS = ["Payroll", "Paid", "Not Paid"] as const;

/** A plain chevron, for stepping a month at a time. */
function ChevronIcon({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="block">
      <path
        d={dir === "left" ? "M10 3.5 5.5 8l4.5 4.5" : "M6 3.5 10.5 8 6 12.5"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}


export default function PayrollPage() {
  const [query, setQuery] = useState("");
  /** The debounce settles the term before it reaches the cache key, so typing
      a name is one request rather than one per letter. */
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Payroll");
  // Rows per request. Not a page size anyone picks — the table scrolls.
  const pageSize = 25;
  const [note, setNote] = useState<string | null>(null);
  /** Which wage is mid-payment, so its row can say so. */
  const [paying, setPaying] = useState<string | null>(null);
  const [payingAll, setPayingAll] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [period, setPeriod] = useState(() => PayrollService.monthBounds());
  /** Which month the table is showing. Starts on this one. */
  const [month, setMonth] = useState(() => PayrollService.monthKey());
  const [monthOpen, setMonthOpen] = useState(false);
  const monthRef = useRef<HTMLDivElement>(null);
  const [editOf, setEditOf] = useState<PayrollRecord | null>(null);
  const [form, setForm] = useState({ basicSalary: "", allowances: "", deductions: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (query === term) return;
    const id = setTimeout(() => setTerm(query), 250);
    return () => clearTimeout(id);
  }, [query, term]);

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
    queryKey("payroll", {
      search: term,
      month,
      status: filter === "Payroll" ? undefined : filter,
    }),
    (p, limit) =>
      PayrollService.getPayroll({
        search: term || undefined,
        status: filter === "Payroll" ? undefined : filter,
        month,
        page: p,
        limit,
      }),
    { pageSize }
  );

  /** Which months have anything in them, so the picker can offer them. */
  const { data: monthsWithRuns } = useQuery(
    queryKey("payroll-months"),
    () => PayrollService.months(),
    { staleMs: 60_000 }
  );


  useEffect(() => {
    if (!monthOpen) return;
    const onDown = (e: MouseEvent) => {
      if (monthRef.current && !monthRef.current.contains(e.target as Node)) setMonthOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMonthOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [monthOpen]);


  /** Open the edit dialog with the row's own figures. */
  /**
   * Settle one person's wage.
   *
   * The server writes the expense and both its ledger legs, so the money is on
   * the Income & Expense screen and the P&L the moment this returns — those
   * caches are dropped rather than left to go stale.
   */
  const payOne = async (row: PayrollRecord) => {
    setPaying(row.id);
    try {
      // A preview row has no payslip behind it — the month has not been
      // calculated yet. Paying somebody is a perfectly reasonable way to say
      // "run this month", so it runs it (unpaid) and then settles the one
      // person, rather than refusing and pointing at another button.
      let payslipId = row.id;
      if (row.preview) {
        // The bounds of the month ON SCREEN, not `period` — that belongs to
        // the Run payroll dialog and can be pointing at a different month
        // entirely.
        const bounds = PayrollService.boundsOfMonth(month);
        await PayrollService.runPayroll(bounds.start, bounds.end, false);
        const fresh = await PayrollService.getPayroll({ month, limit: 200, page: 1 });
        const match = fresh.data.find((r) => r.employee.name === row.employee.name);
        if (!match || match.preview) {
          throw new Error("The month was calculated but that payslip could not be found.");
        }
        payslipId = match.id;
      }
      await PayrollService.payPayslip(payslipId);
      setNote(`${row.employee.name} marked as paid.`);
      invalidate("payroll", "finance-summary", "finance-transactions", "dashboard");
      await refetch();
    } catch (e) {
      setNote(e instanceof Error && e.message ? e.message : "That wage could not be paid.");
    } finally {
      setPaying(null);
    }
  };

  /**
   * Settle every wage still owed on the month showing.
   *
   * One at a time rather than a bulk endpoint, because each payment is its own
   * expense and its own pair of ledger legs — a partial failure has to leave
   * the people already paid paid, not roll the whole month back out of the
   * books.
   */
  const payAll = async () => {
    const owed = rows.filter((r) => r.status === "Not Paid");
    if (owed.length === 0) return;

    setPayingAll(true);
    try {
      // Calculate the month first if it has never been run — every row would
      // otherwise be a preview and each would try to run it again.
      let toPay = owed;
      if (owed.some((r) => r.preview)) {
        const bounds = PayrollService.boundsOfMonth(month);
        await PayrollService.runPayroll(bounds.start, bounds.end, false);
        const fresh = await PayrollService.getPayroll({ month, limit: 200, page: 1 });
        toPay = fresh.data.filter((r) => r.status === "Not Paid" && !r.preview);
      }

      let paid = 0;
      const failures: string[] = [];
      for (const row of toPay) {
        try {
          await PayrollService.payPayslip(row.id);
          paid += 1;
        } catch (e) {
          failures.push(
            `${row.employee.name}: ${e instanceof Error ? e.message : "could not be paid"}`
          );
        }
      }

      setNote(
        failures.length === 0
          ? `${paid} wage${paid === 1 ? "" : "s"} marked as paid.`
          : `${paid} paid, ${failures.length} could not be — ${failures[0]}`
      );
      invalidate("payroll", "finance-summary", "finance-transactions", "dashboard");
      await refetch();
    } catch (e) {
      setNote(e instanceof Error && e.message ? e.message : "The wages could not be paid.");
    } finally {
      setPayingAll(false);
    }
  };

  const actionsFor = (row: PayrollRecord) => [
    ...(row.status === "Not Paid"
      ? [{ label: paying === row.id ? "Paying…" : "Mark as paid", onSelect: () => void payOne(row) }]
      : []),
    // A preview row has no payslip to correct — the figures on it are the
    // employee's own, and those are edited on the employee.
    ...(row.preview ? [] : [{ label: "Edit payroll", onSelect: () => openEdit(row) }]),
  ];

  const openEdit = (row: PayrollRecord) => {
    setForm({
      basicSalary: String(row.basicSalary),
      allowances: String(row.allowances),
      deductions: String(row.deductions),
    });
    setEditOf(row);
  };

  const saveEdit = async () => {
    if (!editOf) return;
    setSaving(true);
    try {
      await PayrollService.updatePayslip(editOf.id, {
        basicSalary: Number(form.basicSalary) || 0,
        allowances: Number(form.allowances) || 0,
        deductions: Number(form.deductions) || 0,
      });
      setNote(`${editOf.employee.name}'s payroll updated.`);
      setEditOf(null);
      // The payslip figures are what this table and the employee's record both
      // report, so neither is allowed to keep the old numbers.
      invalidate("payroll", "employees");
    } catch (e) {
      setNote(PayrollService.describeError(e));
    } finally {
      setSaving(false);
    }
  };

  const runPayroll = async () => {
    setRunning(true);
    try {
      await PayrollService.runPayroll(period.start, period.end);
      setNote(
        `Payroll calculated for ${period.start} to ${period.end}. ` +
          "Nobody is paid yet — mark each wage as paid from the rows below."
      );
      setRunOpen(false);
      // A run writes a payslip per employee and NOTHING to the ledger — the
      // wage bill posts as each one is paid. So only the payroll list changes
      // here; the finance caches move when `payOne` does.
      invalidate("payroll", "employees");
    } catch (e) {
      setNote(PayrollService.describeError(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-[14px]">
      {/* Headline — 75:5511 */}
      <PageToolbar
        search={
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search by name, ID, email, phone..."
            label="Search payroll"
          />
        }
      >
        {/* Which month. A step either way for the common case — last month,
            the month before — and the name itself opens a list of the months
            that actually have a run, so reaching last March is one click
            rather than eighteen through screens that are empty for a reason
            nobody can see. */}
        <div ref={monthRef} className="relative shrink-0">
          <div className="flex h-[44px] items-center rounded-[10px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => {
                setMonth((m) => PayrollService.shiftMonth(m, -1));
              }}
              className="flex h-full w-[40px] cursor-pointer items-center justify-center rounded-l-[10px] text-[#525252] transition-colors hover:bg-[#fafafa]"
            >
              <ChevronIcon dir="left" />
            </button>
            <button
              type="button"
              onClick={() => setMonthOpen((v) => !v)}
              aria-haspopup="listbox"
              aria-expanded={monthOpen}
              className="h-full min-w-[150px] cursor-pointer px-[10px] text-[14px] leading-[1.5] font-medium tracking-[-0.28px] whitespace-nowrap text-[#1e1e1e] transition-colors hover:bg-[#fafafa]"
            >
              {PayrollService.monthLabel(month)}
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => {
                setMonth((m) => PayrollService.shiftMonth(m, 1));
              }}
              className="flex h-full w-[40px] cursor-pointer items-center justify-center rounded-r-[10px] text-[#525252] transition-colors hover:bg-[#fafafa]"
            >
              <ChevronIcon dir="right" />
            </button>
          </div>

          {monthOpen && (
            <ul
              role="listbox"
              aria-label="Months with a payroll run"
              className="absolute left-0 z-30 mt-[6px] max-h-[280px] w-[220px] overflow-y-auto rounded-[10px] border border-[#eaeaea] bg-white py-[4px] shadow-[0_8px_30px_rgba(0,0,0,0.10)]"
            >
              {/* This month is always offered even with no run yet — it is
                  where somebody goes to MAKE one. */}
              {Array.from(
                new Set([PayrollService.monthKey(), month, ...(monthsWithRuns ?? [])])
              )
                .sort()
                .reverse()
                .map((m) => (
                  <li key={m}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={m === month}
                      onClick={() => {
                        setMonth(m);
                        setMonthOpen(false);
                      }}
                      className={`flex w-full cursor-pointer items-center justify-between gap-[8px] px-[14px] py-[9px] text-left text-[14px] transition-colors hover:bg-[#fdf7e6] ${
                        m === month ? "bg-[#fdf7e6] font-medium text-[#1e1e1e]" : "text-[#525252]"
                      }`}
                    >
                      {PayrollService.monthLabel(m)}
                      {!(monthsWithRuns ?? []).includes(m) && (
                        <span className="shrink-0 text-[11px] text-[#a3a3a3]">no run</span>
                      )}
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>

        <FilterDropdown
          label="Status"
          value={filter === "Payroll" ? "" : filter}
          onChange={(next) => setFilter((next || "Payroll") as typeof filter)}
          options={[
            { value: "Payroll", label: "All payslips" },
            { value: "Paid", label: "Paid" },
            { value: "Not Paid", label: "Not paid" },
          ]}
        />

        {/* Settle the whole month in one press. Shown only while something
            is actually owed, so it is not a button that does nothing. */}
        {rows.some((r) => r.status === "Not Paid") && (
          <ActionButton onClick={() => void payAll()} disabled={payingAll}>
            {payingAll ? "Paying…" : "Mark all as paid"}
          </ActionButton>
        )}
        <ActionButton
          variant="primary"
          onClick={() => {
            // The month on screen, not today's. With a switcher on the page,
            // defaulting to the current month means somebody reviewing August
            // and pressing Add New runs September — and a payroll run posts
            // to the ledger.
            setPeriod(PayrollService.boundsOfMonth(month));
            setRunOpen(true);
          }}
        >
          <PlusIcon />
          Add New
        </ActionButton>
      </PageToolbar>

      {/* Table card — 75:5543 */}
      <div className={TABLE_CARD}>
        <RefreshBar active={fetching} />
        {note && (
          <p role="status" className="mx-[16px] mt-[16px] rounded-[8px] bg-[#fdf7e6] px-[12px] py-[8px] text-[13px] text-[#6d5b46]">
            {note}
          </p>
        )}

        {/* Table — 75:5560 */}
        {/* One scroller for the table, the phone cards and the load trigger.
            The trigger has to sit INSIDE it — below the scroller it never
            leaves the screen, and every page loads at once the moment the
            table opens. */}
        <div className="table-scroll">

        <div className="hidden px-[16px] pt-[16px] md:block">
          <div>
            <div className="min-w-[1050px]">
              <div className={`table-head grid ${GRID} items-start overflow-clip bg-white`}>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>#</span></div>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Employee</span></div>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Basic Salary</span></div>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Allowances</span></div>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Deductions</span></div>
                <div className={`${CELL} h-[40px] border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Net Salary</span></div>
                <div className={`${CELL} h-[40px] justify-center border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Status</span></div>
                <div className={`${CELL} h-[40px] justify-center border-b border-solid border-[#eaeaea]`}><span className={HEAD}>Action</span></div>

                <QueryBoundary
                  loading={loading}
                  error={error}
                  hasData={!loading && !error}
                  skeleton={
                    <div className="col-span-8">
                      <TableSkeleton columns={GRID} rows={8} />
                    </div>
                  }
                  errorMessage={PayrollService.describeError(error)}
                  onRetry={refetch}
                >
                {rows.length === 0 && (
                  <div className="col-span-8">
                    <EmptyState
                      // The month is named. With a switcher on the page,
                      // "No payslips yet" reads as "this company has never run
                      // payroll" when it means "not this month" — and the
                      // remedy, Add New, would then be the wrong thing to press.
                      message={
                        term || filter !== "Payroll"
                          ? "No payslips match this view."
                          : `No payroll run for ${PayrollService.monthLabel(month)}.`
                      }
                      hint={
                        term || filter !== "Payroll"
                          ? undefined
                          : "Use Add New to run it, or step to another month."
                      }
                      compact
                    />
                  </div>
                )}

                {rows.map((r) => (
                    <React.Fragment key={r.id}>
                      <div className={`${CELL} h-[54px] border-b border-solid border-[#eaeaea]`}>
                        <span className={BODY}>{r.index}</span>
                      </div>
                      <div className={`${CELL} h-[54px] gap-[8px] border-b border-solid border-[#eaeaea]`}>
                        <Avatar radius={4} name={r.employee.name} />
                        <span className={`${BODY} truncate`}>{r.employee.name}</span>
                      </div>
                      <div className={`${CELL} h-[54px] border-b border-solid border-[#eaeaea]`}>
                        <span className={BODY}>{r.basicSalaryFormatted}</span>
                      </div>
                      <div className={`${CELL} h-[54px] border-b border-solid border-[#eaeaea]`}>
                        <span className={BODY}>{r.allowancesFormatted}</span>
                      </div>
                      <div className={`${CELL} h-[54px] border-b border-solid border-[#eaeaea]`}>
                        <span className={BODY}>{r.deductionsFormatted}</span>
                      </div>
                      <div className={`${CELL} h-[54px] border-b border-solid border-[#eaeaea]`}>
                        <span className={BODY}>{r.netSalaryFormatted}</span>
                      </div>
                      <div className={`${CELL} h-[54px] justify-center border-b border-solid border-[#eaeaea]`}>
                        <StatusPill label={r.status} tone={STATUS_TONE[r.status]} />
                      </div>
                      <div className={`${CELL} h-[54px] justify-center border-b border-solid border-[#eaeaea]`}>
                        <RowActionMenu
                          label={`Actions for ${r.employee.name}`}
                          actions={actionsFor(r)}
                        />
                      </div>
                    </React.Fragment>
                  ))}
                </QueryBoundary>
              </div>
            </div>
          </div>
        </div>

        {/* Below md the grid cannot hold seven columns; each row becomes a card. */}
        <div className="flex flex-col gap-[10px] px-[16px] pt-[16px] md:hidden">
          {/* Below md there is no table, so the boundary around it never
              speaks here. Without this the phone showed one blank card for
              loading, for failure and for an empty list alike. */}
          <CardListState
            loading={loading}
            error={error}
            hasData={!loading && !error}
            isEmpty={rows.length === 0}
            errorMessage={PayrollService.describeError(error)}
            emptyMessage={
              term || filter !== "Payroll"
                ? "No payslips match this view."
                : `No payroll run for ${PayrollService.monthLabel(month)}.`
            }
            onRetry={refetch}
            rows={4}
          />
          {rows.map((r) => (
            <div key={r.id} className="rounded-[10px] p-[12px] shadow-[inset_0_0_0_1px_#eaeaea]">
              <div className="flex items-center justify-between gap-[10px]">
                <div className="flex min-w-0 items-center gap-[8px]">
                  <Avatar radius={4} name={r.employee.name} />
                  <span className="truncate text-[14px] font-medium text-[#1e1e1e]">
                    {r.employee.name}
                  </span>
                </div>
                <StatusPill label={r.status} tone={STATUS_TONE[r.status]} />
              </div>
              <div className="mt-[8px] grid grid-cols-2 gap-x-[12px] gap-y-[4px] text-[13px] text-[#525252]">
                <span>Basic {r.basicSalaryFormatted}</span>
                <span className="text-right">Allow {r.allowancesFormatted}</span>
                <span>Deduct {r.deductionsFormatted}</span>
                <span className="text-right">Net {r.netSalaryFormatted}</span>
              </div>
            </div>
          ))}
        </div>

        <ScrollEnd
          sentinelRef={sentinelRef}
          hasMore={hasMore}
          loadingMore={loadingMore}
          shown={rows.length}
          total={total}
          noun="payslips"
        />
        </div>
      </div>

      {/* Add New runs payroll: the server writes one payslip per employee. */}
      <Modal
        open={runOpen}
        onClose={() => setRunOpen(false)}
        title="Run payroll"
        width={420}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setRunOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              disabled={running}
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={`${MODAL_PRIMARY} disabled:cursor-not-allowed disabled:opacity-60`}
              onClick={runPayroll}
            >
              {running ? "Running..." : "Run payroll"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-[16px]">
          <p className="text-[14px] leading-[1.6] text-[#525252]">
            A payslip is created for every active employee in this period.
          </p>
          <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-2">
            <label className="flex flex-col gap-[6px]">
              <span className="text-[13px] font-medium text-[#1e1e1e]">Period start</span>
              <input
                type="date"
                value={period.start}
                onChange={(e) => setPeriod({ ...period, start: e.target.value })}
                className="h-[44px] rounded-[10px] bg-white px-[12px] text-[14px] text-[#1e1e1e] shadow-[inset_0_0_0_1px_#eaeaea] outline-none focus:shadow-[inset_0_0_0_1.5px_#f5b800]"
              />
            </label>
            <label className="flex flex-col gap-[6px]">
              <span className="text-[13px] font-medium text-[#1e1e1e]">Period end</span>
              <input
                type="date"
                value={period.end}
                onChange={(e) => setPeriod({ ...period, end: e.target.value })}
                className="h-[44px] rounded-[10px] bg-white px-[12px] text-[14px] text-[#1e1e1e] shadow-[inset_0_0_0_1px_#eaeaea] outline-none focus:shadow-[inset_0_0_0_1.5px_#f5b800]"
              />
            </label>
          </div>
        </div>
      </Modal>

      {/* Correcting a payslip — draft runs only; a posted run is in the ledger. */}
      <Modal
        open={editOf !== null}
        onClose={() => setEditOf(null)}
        title="Edit payroll"
        width={440}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setEditOf(null)}>
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || !editOf?.editable}
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={`${MODAL_PRIMARY} disabled:cursor-not-allowed disabled:opacity-60`}
              onClick={saveEdit}
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-[16px]">
          <div className="flex items-center gap-[12px]">
            <Avatar radius={4} name={editOf?.employee.name ?? ""} />
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium text-[#1e1e1e]">
                {editOf?.employee.name}
              </p>
              <p className="text-[13px] text-[#525252]">Payslip {editOf?.index}</p>
            </div>
          </div>

          {!editOf?.editable && (
            <p role="alert" className="rounded-[8px] bg-[#fffbee] px-[12px] py-[8px] text-[13px] text-[#6d5b46]">
              This payroll run is already paid out, so its figures are locked.
            </p>
          )}

          {(
            [
              ["Basic salary", "basicSalary"],
              ["Allowances", "allowances"],
              ["Deductions", "deductions"],
            ] as const
          ).map(([label, key]) => (
            <label key={key} className="flex flex-col gap-[6px]">
              <span className="text-[13px] font-medium text-[#1e1e1e]">{label}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={!editOf?.editable}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className={MONEY_FIELD}
              />
            </label>
          ))}

          <div className="flex items-center justify-between rounded-[10px] bg-[#fafafa] px-[12px] py-[10px]">
            <span className="text-[13px] text-[#525252]">Net salary</span>
            <span className="text-[14px] font-medium text-[#1e1e1e]">
              {formatMoney((Number(form.basicSalary) || 0) + (Number(form.allowances) || 0) - (Number(form.deductions) || 0))}
            </span>
          </div>
        </div>
      </Modal>
    </div>
  );
}
