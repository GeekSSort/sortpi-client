"use client";

import React, { useMemo, useState } from "react";
import { RegularPaymentService } from "@/services";
import { invalidate, queryKey, useQuery } from "@/lib/query/useQuery";
import { useInfiniteRows } from "@/lib/query/useInfiniteRows";
import {
  CardListState,
  EmptyState,
  ErrorState,
  QueryBoundary,
  RefreshBar,
} from "@/components/shared/QueryBoundary";
import { DetailSkeleton } from "@/components/shared/Skeleton";
import StatusPill from "@/components/shared/StatusPill";
import ScrollEnd from "@/components/shared/ScrollEnd";
import TableSkeleton from "@/components/shared/TableSkeleton";
import RowActionMenu from "@/components/shared/RowActionMenu";
import FilterDropdown from "@/components/shared/FilterDropdown";
import {
  ActionButton,
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
import ScheduleDialog from "@/components/modules/finance/ScheduleDialog";
import VoucherReceipt from "@/components/modules/finance/VoucherReceipt";
import { useSession } from "@/services/useSession";
import type {
  Frequency,
  LedgerType,
  RegularPayment,
  ScheduleState,
  Voucher,
} from "@/types/finance";

/**
 * Regular payments — the money a shop knows is coming.
 *
 * The third Finance screen, and the one that is not a list of things that have
 * happened. Rent, salaries, the internet bill: a shop does not forget that it
 * pays rent, it forgets that the rent is due today. So the screen is ordered by
 * what is LATE and then by what is next, and the primary action on a row is
 * "Pay now".
 *
 * Paying writes an ordinary voucher and hands it straight back to be printed.
 * Nothing on this screen is money of its own: a schedule posts no ledger row,
 * and the figures the P&L reads are the vouchers, exactly as they are for a
 * payment somebody typed in by hand.
 */

const GRID = "grid-cols-[220fr_160fr_140fr_150fr_160fr_130fr_90fr]";
const CELL = "flex min-w-0 items-center p-[12px]";
const HEAD = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#1e1e1e]";
const TEXT = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]";

const INCOME_INK = "#1f9d55";
const EXPENSE_INK = "#c0392b";

/**
 * Every instalment this schedule has passed, and what became of each.
 *
 * Read from `/runs/`, which is where the occurrences live. A PAID row names
 * the voucher it wrote; a NOT PAID row names nothing, because there is nothing
 * to name — no voucher, no ledger entry, no money. That distinction is the
 * point of the screen, so the two are told apart by a pill and by whether
 * there is a voucher number at all, not by a colour alone.
 */
function RunHistory({ scheduleId }: { scheduleId: string }) {
  const { data, loading, error, refetch } = useQuery(
    queryKey("regular-payments", { runs: scheduleId }),
    () => RegularPaymentService.runs(scheduleId),
    {}
  );
  const runs = data ?? [];

  if (loading) return <DetailSkeleton rows={4} />;
  if (error) return <ErrorState message="That history could not be loaded." onRetry={refetch} compact />;
  if (runs.length === 0) {
    return <EmptyState message="Nothing has fallen due yet." compact />;
  }

  return (
    <div className="flex flex-col gap-[8px]">
      {runs.map((run) => {
        const paid = run.status === "PAID";
        return (
          <div
            key={run.id}
            className="flex flex-wrap items-center justify-between gap-[10px] rounded-[10px] bg-[#fafafa] px-[12px] py-[10px]"
          >
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-[#1e1e1e]">
                Due {displayDate(run.dueDate)}
              </p>
              <p className="mt-[2px] truncate text-[12px] text-[#8f8d87]">
                {paid
                  ? `Paid ${run.paidOn ? displayDate(run.paidOn) : ""}${
                      run.voucherNo ? ` · ${run.voucherNo}` : ""
                    }`
                  : "No payment was made"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-[10px]">
              <span
                className={`text-[13px] font-medium tabular-nums ${
                  paid ? "text-[#1e1e1e]" : "text-[#8f8d87] line-through"
                }`}
              >
                {taka(run.amount)}
              </span>
              <StatusPill label={paid ? "Paid" : "Not paid"} tone={paid ? "green" : "slate"} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const FREQUENCY_LABEL: Record<Frequency, string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
};

/** How each state is worded and coloured. One definition, used everywhere. */
const STATE_STYLE: Record<ScheduleState, { label: string; ink: string; bg: string }> = {
  OVERDUE: { label: "Overdue", ink: "#c0392b", bg: "#fdeceb" },
  DUE: { label: "Due today", ink: "#8a6d00", bg: "#fff8e1" },
  UPCOMING: { label: "Upcoming", ink: "#1f6feb", bg: "#eef4ff" },
  PAUSED: { label: "Paused", ink: "#525252", bg: "#f2f2f2" },
  ENDED: { label: "Ended", ink: "#525252", bg: "#f2f2f2" },
};

function taka(value: number): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}৳ ${Math.abs(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/** `11-04-2026`, the order every other list here prints. */
function displayDate(iso: string): string {
  const [y, m, d] = (iso || "").split("-");
  return y && m && d ? `${d}-${m}-${y}` : iso;
}

/**
 * "3 days late", "due today", "in 12 days".
 *
 * A date on its own makes the reader do the arithmetic, and the whole reason
 * this screen exists is that nobody does it.
 */
function whenText(row: RegularPayment): string {
  if (row.state === "PAUSED") return "paused";
  if (row.state === "ENDED") return "finished";
  const days = row.daysUntilDue;
  if (days === 0) return "due today";
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} late`;
  if (days === 1) return "due tomorrow";
  return `in ${days} days`;
}

function StatePill({ state }: { state: ScheduleState }) {
  const style = STATE_STYLE[state] ?? STATE_STYLE.UPCOMING;
  return (
    <span
      className="inline-flex h-[26px] items-center rounded-[13px] px-[10px] text-[12px] font-semibold whitespace-nowrap"
      style={{ color: style.ink, backgroundColor: style.bg }}
    >
      {style.label}
    </span>
  );
}

export default function RegularPaymentsPage() {
  const [term, setTerm] = useState("");
  const [kind, setKind] = useState<LedgerType | "">("");
  const [state, setState] = useState<ScheduleState | "">("");
  const [editing, setEditing] = useState<RegularPayment | null>(null);
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState<RegularPayment | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [removing, setRemoving] = useState<RegularPayment | null>(null);
  const [receiptOf, setReceiptOf] = useState<Voucher | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  /**
   * Prompts the user has closed without answering, for this visit only.
   *
   * NOT a record of the answer — that is the server's job, and the whole point
   * of the feature. Closing the box leaves the instalment unresolved, so it is
   * back the next time the screen opens, which is the correct treatment of a
   * bill nobody has said anything about yet.
   */
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [historyOf, setHistoryOf] = useState<RegularPayment | null>(null);

  const { user: session } = useSession();
  const held = useMemo(() => session?.permissions ?? [], [session]);
  const mayWrite = held.includes("expense.create") || held.includes("income.create");
  const mayEdit = held.includes("expense.update") || held.includes("income.update");
  const mayDelete = held.includes("expense.delete") || held.includes("income.delete");

  const filter = useMemo(() => ({ kind, search: term }), [kind, term]);

  const totalsQuery = useQuery(queryKey("regular-summary", filter), () =>
    RegularPaymentService.totals(filter)
  );

  const listQuery = useInfiniteRows(
    queryKey("regular-payments", { ...filter, state }),
    (page, limit) => RegularPaymentService.list({ ...filter, state, page, limit }),
    { pageSize: 25 }
  );

  /**
   * What is due today or already late, whatever the page is filtered to.
   *
   * Its own query rather than a read of the list above, because the list obeys
   * the toolbar: somebody looking at UPCOMING would be shown no prompt at all,
   * and a bill nobody is asked about is the failure this whole feature exists
   * to prevent. The API orders late first and then soonest, so one page is
   * enough to hold everything that can be due.
   *
   * Same cache prefix as the list, so paying or declining refreshes both.
   */
  const dueQuery = useQuery(
    queryKey("regular-payments", { prompt: "due" }),
    () => RegularPaymentService.list({ page: 1, limit: 50 }),
    {}
  );

  /**
   * The instalments still waiting for an answer, soonest-overdue first.
   *
   * A schedule leaves this list when the SERVER moves it on — which both
   * answers do — so a refresh, a second tab or a walk away and back cannot
   * bring back a prompt that has been answered.
   */
  const duePrompts = useMemo(
    () =>
      (dueQuery.data?.data ?? []).filter(
        (row) =>
          row.isActive &&
          (row.state === "DUE" || row.state === "OVERDUE") &&
          !dismissed.includes(row.id)
      ),
    [dueQuery.data, dismissed]
  );

  /** One at a time, so several bills falling on the same day are answered in turn. */
  const askingAbout = duePrompts[0] ?? null;

  const rows = listQuery.rows;
  const { loadingMore, hasMore, sentinelRef, total } = listQuery;
  const totals = totalsQuery.data;

  // Paying one writes a voucher, so every screen that reads the books has to
  // hear about it — not just this list. What that means is `DERIVED`'s to say.
  const refreshAll = () => invalidate("regular-payments");

  const cards: FinanceStatCard[] = useMemo(
    () => [
      {
        id: "transactions",
        title: "Active schedules",
        value: String(totals?.active ?? 0),
        note: "Running now",
      },
      {
        id: "expense",
        title: "Overdue",
        value: String(totals?.overdue ?? 0),
        note: (totals?.overdue ?? 0) > 0 ? "Needs paying" : "Nothing late",
        tone: (totals?.overdue ?? 0) > 0 ? "bad" : "good",
      },
      {
        id: "income",
        title: "Due in 7 days",
        value: String(totals?.dueSoon ?? 0),
        note: "Coming up",
      },
      {
        id: "net",
        title: "Monthly commitment",
        // Money OUT, which is what "commitment" means. The income side is
        // shown beside it rather than netted: a shop that pays 60,000 of rent
        // and sublets for 20,000 is committed to 60,000, and a net of 40,000
        // would hide the figure it has to find each month.
        value: taka(totals?.monthlyOut ?? 0),
        note:
          (totals?.monthlyIn ?? 0) > 0
            ? `${taka(totals?.monthlyIn ?? 0)} coming in`
            : "Out, every month",
        tone: "good",
      },
    ],
    [totals]
  );

  const payNow = async () => {
    if (!paying) return;
    setBusy(true);
    try {
      const typed = Number(payAmount);
      const voucher = await RegularPaymentService.pay(paying.id, {
        // Blank means "the schedule's figure". Sending it anyway would turn
        // every payment into an override and lose the distinction.
        ...(payAmount.trim() !== "" && Number.isFinite(typed) && typed > 0
          ? { amount: typed }
          : {}),
      });
      setPaying(null);
      setPayAmount("");
      refreshAll();
      setNote(`${voucher.voucherNo} written.`);
      // Straight to the slip — the saving of paying from here is that the
      // figures are already filled in, and making somebody then go and find
      // the voucher would give it back.
      setReceiptOf(voucher);
    } catch (e) {
      setNote(e instanceof Error && e.message ? e.message : "That payment could not be made.");
    } finally {
      setBusy(false);
    }
  };

  const togglePause = async (row: RegularPayment) => {
    try {
      await RegularPaymentService.update(row.id, { isActive: !row.isActive });
      setNote(row.isActive ? `${row.name} paused.` : `${row.name} resumed.`);
      refreshAll();
    } catch (e) {
      setNote(e instanceof Error && e.message ? e.message : "That could not be changed.");
    }
  };

  const skipOne = async (row: RegularPayment) => {
    try {
      await RegularPaymentService.skip(row.id);
      setNote(
        `The ${displayDate(row.nextDueDate)} payment of ${row.name} is recorded as not paid.`
      );
      refreshAll();
    } catch (e) {
      setNote(e instanceof Error && e.message ? e.message : "That could not be recorded.");
    }
  };

  /**
   * "Yes, paid" — and ONLY now does any money move.
   *
   * The same `pay` the Pay now button calls, so there is one payment path and
   * one voucher: no money is deducted because a date arrived, only because
   * somebody said the bill was settled.
   *
   * `busy` guards the double-click, and the server's unique constraint on
   * (schedule, due date) guards everything the button cannot see — a second
   * tab, a retry after a timeout.
   */
  const answerPaid = async () => {
    if (!askingAbout || busy) return;
    setBusy(true);
    try {
      const voucher = await RegularPaymentService.pay(askingAbout.id, {});
      setNote(`${askingAbout.name} paid — voucher ${voucher.voucherNo}.`);
      refreshAll();
    } catch (e) {
      // The message is the server's: "already paid" is the one a second tab
      // gets, and it is the useful thing to say.
      setNote(e instanceof Error && e.message ? e.message : "That payment could not be made.");
      // Take it off the pile either way. Leaving a prompt that errors every
      // time in front of somebody is worse than the error itself.
      setDismissed((prev) => [...prev, askingAbout.id]);
    } finally {
      setBusy(false);
    }
  };

  /** "No, not paid" — the occurrence is recorded and nothing is deducted. */
  const answerNotPaid = async () => {
    if (!askingAbout || busy) return;
    setBusy(true);
    try {
      await skipOne(askingAbout);
    } finally {
      setBusy(false);
    }
  };

  const confirmRemove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await RegularPaymentService.remove(removing.id);
      setNote(`${removing.name} removed.`);
      setRemoving(null);
      refreshAll();
    } catch (e) {
      setNote(e instanceof Error && e.message ? e.message : "That could not be removed.");
    } finally {
      setBusy(false);
    }
  };

  const actionsFor = (row: RegularPayment) => [
    ...(mayWrite && row.state !== "PAUSED" && row.state !== "ENDED"
      ? [{ label: "Pay now", onSelect: () => { setPaying(row); setPayAmount(""); } }]
      : []),
    { label: "Payment history", onSelect: () => setHistoryOf(row) },
    ...(mayEdit
      ? [
          { label: "Edit", onSelect: () => setEditing(row) },
          // The same thing the due prompt's "No" does: the instalment is
          // recorded as not paid and the schedule moves on. It used to move on
          // and record nothing, so a missed month left no trace.
          { label: "Mark as not paid", onSelect: () => void skipOne(row) },
          {
            label: row.isActive ? "Pause" : "Resume",
            onSelect: () => void togglePause(row),
          },
        ]
      : []),
    ...(mayDelete
      ? [{ label: "Remove", tone: "danger" as const, onSelect: () => setRemoving(row) }]
      : []),
  ];

  const filtered = term !== "" || kind !== "" || state !== "";

  return (
    <div className="flex w-full flex-col gap-[16px] pb-[24px]">
      <FinanceStatCards cards={cards} />

      {/* Page-level controls, ABOVE the card — the pattern every other listing
          screen uses. These sat inside it, under a second "Regular payments"
          heading the page already carried in its header. */}
      <PageToolbar
        search={
          <SearchInput
            value={term}
            onChange={setTerm}
            placeholder="Search by name or category…"
            label="Search regular payments"
          />
        }
      >
        <FilterDropdown
          label="All types"
          value={kind}
          options={[
            { value: "", label: "All types" },
            { value: "EXPENSE", label: "Money out" },
            { value: "INCOME", label: "Money in" },
          ]}
          onChange={(next) => setKind(next as LedgerType | "")}
        />

        <FilterDropdown
          label="All states"
          value={state}
          options={[
            { value: "", label: "All states" },
            { value: "OVERDUE", label: "Overdue" },
            { value: "DUE", label: "Due today" },
            { value: "UPCOMING", label: "Upcoming" },
            { value: "PAUSED", label: "Paused" },
            { value: "ENDED", label: "Ended" },
          ]}
          onChange={(next) => setState(next as ScheduleState | "")}
        />

        {mayWrite && (
          <ActionButton variant="primary" onClick={() => setAdding(true)}>
            <PlusIcon />
            New schedule
          </ActionButton>
        )}
      </PageToolbar>

      <div className={TABLE_CARD}>
        <RefreshBar active={totalsQuery.fetching || listQuery.fetching} />

        <div className="table-scroll">
          <div className="hidden px-[16px] pt-[16px] md:block">
            <div className="min-w-[1000px]">
              <div
                className={`table-head grid ${GRID} border-b border-solid border-[#eaeaea] bg-white`}
              >
                {["Name", "Category", "Amount", "How often", "Next due", "Status", "Action"].map(
                  (label, i) => (
                    <div
                      key={label}
                      className={`${CELL} h-[40px] ${i === 6 ? "justify-center" : ""}`}
                    >
                      <span className={`${HEAD} whitespace-nowrap`}>{label}</span>
                    </div>
                  )
                )}
              </div>

              <QueryBoundary
                loading={listQuery.loading}
                error={listQuery.error}
                hasData={!listQuery.loading && !listQuery.error}
                errorMessage="The regular payments could not be loaded."
                onRetry={listQuery.refetch}
                skeleton={<TableSkeleton rows={6} columns={GRID} />}
              >
                {rows.length === 0 && (
                  <p className="px-[12px] py-[24px] text-[14px] text-[#8f8d87]">
                    {filtered
                      ? "Nothing matches that search."
                      : "No regular payments set up yet. Rent, salaries and bills go here."}
                  </p>
                )}
                {rows.map((row) => (
                  <div
                    key={row.id}
                    className={`grid ${GRID} border-b border-solid border-[#f2f2f2] transition-colors hover:bg-[#fafafa]`}
                  >
                    <div className={`${CELL} flex-col !items-start gap-[2px]`}>
                      <span className={`${TEXT} w-full truncate !text-[#1e1e1e]`}>
                        {row.name}
                      </span>
                      {row.notes && (
                        <span
                          className="w-full truncate text-[12px] tracking-[-0.24px] text-[#8f8d87]"
                          title={row.notes}
                        >
                          {row.notes}
                        </span>
                      )}
                    </div>
                    <div className={CELL}>
                      <span className={`${TEXT} truncate`}>{row.categoryName || "—"}</span>
                    </div>
                    <div className={CELL}>
                      <span
                        className="truncate text-[14px] leading-[1.5] font-semibold tracking-[-0.28px] tabular-nums"
                        style={{ color: row.kind === "INCOME" ? INCOME_INK : EXPENSE_INK }}
                      >
                        {row.kind === "INCOME" ? "+" : "-"}
                        {taka(row.amount)}
                      </span>
                    </div>
                    <div className={CELL}>
                      <span className={`${TEXT} truncate`}>
                        {FREQUENCY_LABEL[row.frequency] ?? row.frequency}
                      </span>
                    </div>
                    <div className={`${CELL} flex-col !items-start gap-[2px]`}>
                      <span className={`${TEXT} w-full truncate`}>
                        {displayDate(row.nextDueDate)}
                      </span>
                      <span className="w-full truncate text-[12px] tracking-[-0.24px] text-[#8f8d87]">
                        {whenText(row)}
                      </span>
                    </div>
                    <div className={CELL}>
                      <StatePill state={row.state} />
                    </div>
                    <div className={`${CELL} justify-center`}>
                      <RowActionMenu
                        label={`Actions for ${row.name}`}
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
              errorMessage="The regular payments could not be loaded."
              emptyMessage={
                filtered
                  ? "Nothing matches that search."
                  : "No regular payments set up yet."
              }
              onRetry={listQuery.refetch}
              rows={4}
            />
            {rows.map((row) => (
              <div
                key={row.id}
                className="rounded-[10px] border border-solid border-[#eaeaea] p-[12px]"
              >
                <div className="flex items-start justify-between gap-[10px]">
                  <div className="min-w-0">
                    <p className={`${TEXT} truncate !text-[#1e1e1e]`}>{row.name}</p>
                    <p className="mt-[2px] truncate text-[12px] tracking-[-0.24px] text-[#525252]">
                      {row.categoryName} · {FREQUENCY_LABEL[row.frequency] ?? row.frequency}
                    </p>
                  </div>
                  <span
                    className="shrink-0 text-[14px] font-semibold tracking-[-0.28px] tabular-nums"
                    style={{ color: row.kind === "INCOME" ? INCOME_INK : EXPENSE_INK }}
                  >
                    {row.kind === "INCOME" ? "+" : "-"}
                    {taka(row.amount)}
                  </span>
                </div>
                <div className="mt-[10px] flex items-center justify-between gap-[10px]">
                  <span className="flex items-center gap-[8px] text-[12px] tracking-[-0.24px] text-[#525252]">
                    <StatePill state={row.state} />
                    {whenText(row)}
                  </span>
                  <RowActionMenu label={`Actions for ${row.name}`} actions={actionsFor(row)} />
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
              noun="schedules"
            />
          </div>
        </div>
      </div>

      <ScheduleDialog
        open={adding || editing !== null}
        schedule={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
        onSaved={(saved) => {
          setNote(editing ? `${saved.name} updated.` : `${saved.name} scheduled.`);
          refreshAll();
        }}
      />

      {/* ── Due today: did you pay this bill? ──────────────────────────────
          The screen asks rather than assumes. Nothing is deducted by a date
          arriving; money moves only on "Yes, paid", and "No, not paid" writes
          an occurrence with no voucher behind it so the miss is on the record
          without being on the books.

          Only shown when nothing else is open, so it cannot land on top of a
          form somebody is filling in. */}
      <Modal
        open={askingAbout !== null && !paying && !editing && !adding && !removing && !historyOf}
        onClose={() => {
          if (!busy && askingAbout) setDismissed((prev) => [...prev, askingAbout.id]);
        }}
        title={askingAbout?.kind === "INCOME" ? "Payment due today" : "Monthly payment due"}
        width={460}
        footer={
          <>
            <button
              type="button"
              className={MODAL_GHOST}
              disabled={busy}
              onClick={() => void answerNotPaid()}
            >
              No, not paid
            </button>
            <button
              type="button"
              disabled={busy}
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={MODAL_PRIMARY}
              onClick={() => void answerPaid()}
            >
              {busy ? "Recording…" : "Yes, paid"}
            </button>
          </>
        }
      >
        {askingAbout && (
          <div className="flex flex-col gap-[14px]">
            <p className="text-[14px] leading-[1.6] text-[#525252]">
              Your {FREQUENCY_LABEL[askingAbout.frequency].toLowerCase()} payment for{" "}
              <span className="font-medium text-[#1e1e1e]">{askingAbout.name}</span>{" "}
              {askingAbout.state === "OVERDUE" ? "was due" : "is due"}{" "}
              {askingAbout.state === "OVERDUE"
                ? displayDate(askingAbout.nextDueDate)
                : "today"}
              . Did you pay this bill?
            </p>

            <dl className="flex flex-col gap-[8px] rounded-[10px] bg-[#fafafa] p-[12px]">
              {[
                ["Payment", askingAbout.name],
                ["Amount", taka(askingAbout.amount)],
                ["Due date", displayDate(askingAbout.nextDueDate)],
                [
                  askingAbout.kind === "INCOME" ? "Received into" : "Paid from",
                  askingAbout.paymentAccountName,
                ],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-[16px]">
                  <dt className="text-[13px] text-[#525252]">{label}</dt>
                  <dd className="min-w-0 truncate text-[13px] font-medium text-[#1e1e1e]">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>

            <p className="text-[12px] leading-[1.6] text-[#8f8d87]">
              Answering <span className="font-medium text-[#525252]">yes</span> writes a
              voucher for {taka(askingAbout.amount)} and takes it from{" "}
              {askingAbout.paymentAccountName}. Answering{" "}
              <span className="font-medium text-[#525252]">no</span> moves nothing and
              records the instalment as not paid.
              {duePrompts.length > 1 && ` ${duePrompts.length - 1} more due after this.`}
            </p>
          </div>
        )}
      </Modal>

      {/* ── What happened to each instalment ───────────────────────────────
          Paid and Not paid side by side. The schedule table's own Status
          column says where the ARRANGEMENT stands today; this says what became
          of each date it has passed, which is a different question and had no
          answer on screen at all. */}
      <Modal
        open={historyOf !== null}
        onClose={() => setHistoryOf(null)}
        title={historyOf ? `${historyOf.name} — payment history` : "Payment history"}
        width={520}
        footer={
          <button type="button" className={MODAL_GHOST} onClick={() => setHistoryOf(null)}>
            Close
          </button>
        }
      >
        {historyOf && <RunHistory scheduleId={historyOf.id} />}
      </Modal>

      {/* Pay now — a confirm rather than a form, because everything is already
          known. The amount box is there for the bill that came in at a
          different figure, and is empty by default so the schedule's own
          amount is what gets paid. */}
      <Modal
        open={paying !== null}
        onClose={() => !busy && setPaying(null)}
        title="Pay this instalment"
        width={460}
        footer={
          <>
            <button
              type="button"
              className={MODAL_GHOST}
              disabled={busy}
              onClick={() => setPaying(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={MODAL_PRIMARY}
              onClick={payNow}
            >
              {busy ? "Paying…" : "Pay & print"}
            </button>
          </>
        }
      >
        {paying && (
          <div className="flex flex-col gap-[14px]">
            <p className="text-[14px] leading-[1.6] text-[#525252]">
              <span className="font-medium text-[#1e1e1e]">{paying.name}</span> —{" "}
              {taka(paying.amount)}, due {displayDate(paying.nextDueDate)} (
              {whenText(paying)}). A voucher is written and{" "}
              {paying.kind === "INCOME" ? "received into" : "paid from"}{" "}
              {paying.paymentAccountName}.
            </p>
            <label className="flex flex-col gap-[6px]">
              <span className="text-[13px] font-medium text-[#525252]">
                Pay a different amount (optional)
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder={paying.amount.toFixed(2)}
                aria-label="Amount to pay"
                className="h-[42px] w-full rounded-[10px] border border-solid border-[#eaeaea] bg-white px-[12px] text-[14px] text-[#1e1e1e] outline-none transition-colors focus:border-[#f5b800]"
              />
              <span className="text-[12px] text-[#8f8d87]">
                Leave it blank to pay {taka(paying.amount)}. This changes the one payment,
                never the arrangement.
              </span>
            </label>
          </div>
        )}
      </Modal>

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
        open={removing !== null}
        onClose={() => !busy && setRemoving(null)}
        title="Remove this schedule?"
        width={440}
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
              {busy ? "Removing…" : "Remove"}
            </button>
          </>
        }
      >
        <p className="text-[14px] leading-[1.6] text-[#525252]">
          {removing ? `${removing.name} — ${taka(removing.amount)} ` : ""}
          will stop falling due. The payments already made stay in the books: removing the
          arrangement does not un-pay them. To stop it for a while instead, use Pause.
        </p>
      </Modal>
    </div>
  );
}
