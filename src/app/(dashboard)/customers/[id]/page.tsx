"use client";

import React, { use, useMemo, useState } from "react";
import Link from "next/link";
import { ApiError } from "@/services/apiClient";
import { CustomerService, CustomerInvoice } from "@/services/customerService";
import { useQuery, invalidate } from "@/lib/query/useQuery";
import { QueryBoundary, RefreshBar, EmptyState } from "@/components/shared/QueryBoundary";
import TableSkeleton from "@/components/shared/TableSkeleton";
import Modal, { GOLD_GRADIENT, MODAL_GHOST, MODAL_PRIMARY } from "@/components/shared/Modal";
import StatusPill from "@/components/shared/StatusPill";
import Avatar from "@/components/shared/Avatar";
import { formatMoney } from "@/lib/format";
import { clampToMax, clampTypedAmount } from "@/lib/money";
import { AmountLabel } from "@/components/shared/MaxButton";

/**
 * One customer: what they owe, on which invoices, and how to take money off it.
 *
 * The customers list showed a single `dueAmount` and nothing else, so "this
 * person owes 2.5 lakh" was the end of the story — which invoices made it up,
 * and what settling part of it would touch, existed only in the database.
 *
 * The allocation is the substance of this screen. A payment of 1.25 lakh
 * against 2.5 lakh across five invoices has to say WHICH five it settles and
 * by how much, or the answer is invented later by whoever reads the ledger.
 * `POST /customers/{id}/payments/` has taken `allocations` since payment
 * allocation was built and nothing had ever sent any, so every payment landed
 * ON ACCOUNT and no invoice was ever marked paid.
 *
 * Oldest first, and the invoice the money runs out in is the one left PART
 * paid — which is what a shop means by "he gave me half". Every line is
 * editable, because the customer sometimes says which bill they are settling.
 */

const BODY = "text-[14px] leading-[1.5] font-medium tracking-[-0.28px] text-[#525252]";
const HEAD = "text-[12px] leading-[16px] font-medium text-[#8f8d87]";
const FIELD =
  "h-[44px] w-full rounded-[10px] bg-white px-[12px] text-[14px] text-[#1e1e1e] shadow-[inset_0_0_0_1px_#eaeaea] outline-none focus:shadow-[inset_0_0_0_1.5px_#f5b800]";
const GRID = "grid-cols-[1.2fr_1fr_1fr_1fr_1fr_130px]";

const METHODS = ["CASH", "CARD", "BANK", "MOBILE", "OTHER"] as const;

function when(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(at);
}

/** Money the person typed, as a number the arithmetic can use. */
function amountOf(raw: string): number {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Round to the server's own precision — FOUR places, not paisa.
 *
 * Its comment already said allocations are compared against the server's 4dp
 * figures, and then rounded to two. An invoice owing 4338.5950 became 4338.6000
 * on the way through `spreadOldestFirst`, which is five paisa MORE than it
 * owed, and the payment was refused: "MAIN-26-000126 has 4338.5950
 * outstanding, less than the 4338.6000 allocated to it." Nothing on the screen
 * could be adjusted to get out of it — the figure came from the dialog's own
 * spread, and the total it was capped against was rounded the same way.
 *
 * Rounding money UP against a ceiling is the failure mode; four places matches
 * `quantize_money` on the server, so the two agree exactly.
 */
function round(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/**
 * Spread an amount over the invoices, oldest first.
 *
 * The one that runs out mid-way is left PART paid, which is the whole point:
 * a shop that takes 1.25 lakh against 2.5 lakh has settled some invoices, is
 * halfway through one, and has not touched the rest.
 */
function spreadOldestFirst(total: number, invoices: CustomerInvoice[]): Record<string, string> {
  let left = round(total);
  const out: Record<string, string> = {};
  for (const invoice of invoices) {
    if (left <= 0) break;
    const take = round(Math.min(left, invoice.outstanding));
    if (take <= 0) continue;
    out[invoice.id] = String(take);
    left = round(left - take);
  }
  return out;
}

export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [note, setNote] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("CASH");
  const [reference, setReference] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  /**
   * One key for one PAYMENT, minted when the dialog opens.
   *
   * The ledger is insert-only, so a double-tapped Save posts the money twice
   * and the only correction is a manual reversing entry. A key per ATTEMPT —
   * which is what a `Date.now()` default gives — makes the header decorative.
   */
  const [payKey, setPayKey] = useState("");

  const customerQuery = useQuery(`customer:${id}`, () => CustomerService.getCustomer(id));
  const invoiceQuery = useQuery(`customer-invoices:${id}`, () =>
    CustomerService.getInvoices(id, { includeSettled: true })
  );

  const customer = customerQuery.data;
  const invoices = useMemo(() => invoiceQuery.data ?? [], [invoiceQuery.data]);
  const open = useMemo(() => invoices.filter((i) => i.outstanding > 0), [invoices]);
  const owed = useMemo(() => round(open.reduce((n, i) => n + i.outstanding, 0)), [open]);

  const typed = amountOf(amount);
  const allocated = useMemo(
    () => round(Object.values(allocations).reduce((n, v) => n + amountOf(v), 0)),
    [allocations]
  );
  const onAccount = round(typed - allocated);

  const openDialog = () => {
    setPayError(null);
    setAmount("");
    setMethod("CASH");
    setReference("");
    setAllocations({});
    setTouched(false);
    setPayKey(`pay-${id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
    setPayOpen(true);
  };

  /**
   * Typing an amount re-spreads it, until the person edits a line themselves.
   *
   * Capped at what is actually owed: over-typing is replaced by the balance,
   * so the box shows the largest payment that can be recorded rather than a
   * number the allocation below could never account for. Taking MORE than is
   * owed is an advance, and this screen is for settling invoices — the ledger
   * accepts one, but not from a field labelled "amount received" against a
   * list of what is due.
   */
  const onAmount = (value: string, box?: { value: string }) => {
    const capped = box ? clampTypedAmount(box, owed) : clampToMax(value, owed);
    setAmount(capped);
    if (!touched) setAllocations(spreadOldestFirst(amountOf(capped), open));
  };

  /**
   * A line is capped at what its own invoice still owes.
   *
   * It used to accept any number and warn afterwards, which meant the dialog
   * could be in a state the server would refuse — and the person found out by
   * pressing Save. Capping is the same treatment the amount box gets: the box
   * shows the largest figure that can go there.
   */
  const setLine = (invoiceId: string, value: string, box?: { value: string }) => {
    const invoice = open.find((i) => i.id === invoiceId);
    const max = invoice?.outstanding ?? 0;
    setTouched(true);
    setAllocations((prev) => ({
      ...prev,
      [invoiceId]: box ? clampTypedAmount(box, max) : clampToMax(value, max),
    }));
  };

  // Each LINE is capped at its own invoice as it is typed, so the only state
  // left to warn about is the total: lines that add up to more than the money
  // actually received. That one cannot be clamped away — which line should
  // give? — so it is said instead.
  // A tenth of the smallest unit the server stores, so float noise in the sum
  // does not read as over-allocation while a real 0.0001 excess still does.
  const overAllocated = allocated > typed + 0.00001;
  const canSave = typed > 0 && !overAllocated;
  /** How many invoices this payment actually touches. */
  const settles = useMemo(
    () => Object.values(allocations).filter((v) => amountOf(v) > 0).length,
    [allocations]
  );

  const save = async () => {
    setSaving(true);
    setPayError(null);
    try {
      await CustomerService.recordPayment(id, typed, reference, {
        paymentMethod: method,
        idempotencyKey: payKey,
        allocations: open
          .map((i) => ({ saleId: i.id, amount: amountOf(allocations[i.id] ?? "") }))
          .filter((a) => a.amount > 0),
      });
      setNote(
        onAccount > 0
          ? `${formatMoney(typed)} recorded — ${formatMoney(onAccount)} left on account.`
          : `${formatMoney(typed)} recorded against ${
              Object.values(allocations).filter((v) => amountOf(v) > 0).length
            } invoice(s).`
      );
      setPayOpen(false);
      // A payment moves the balance, the invoice list, the customers table, the
      // receivables report, the cash account and the dashboard's P&L — it is
      // one event and every one of those reads it.
      invalidate(
        `customer:${id}`,
        `customer-invoices:${id}`,
        "customers",
        "sales",
        "dashboard"
      );
    } catch (e) {
      setPayError(
        e instanceof ApiError ? e.message : "That payment could not be recorded."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-[14px]">
      <RefreshBar active={customerQuery.fetching || invoiceQuery.fetching} />

      {/* ── Who, and what they owe ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-[12px] rounded-[12px] bg-white p-[16px] shadow-[inset_0_0_0_1px_#eaeaea]">
        <div className="flex min-w-0 items-center gap-[12px]">
          <Avatar name={customer?.name || "—"} radius={8} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[17px] leading-[24px] font-semibold text-[#1e1e1e]">
              {customer?.name || "Customer"}
            </span>
            <span className="text-[12px] text-[#8f8d87]">
              {customer?.phone || "No phone"} · {customer?.customerId || ""}
            </span>
          </span>
        </div>

        {/* The two figures and the button did not fit a phone side by side and
            could not wrap, so the button was pushed off the right edge — on
            the one screen whose entire purpose is to take a payment. The two
            figures share a line, the button takes its own and spans it. */}
        <div className="flex w-full flex-wrap items-center gap-x-[20px] gap-y-[12px] sm:w-auto sm:flex-nowrap sm:justify-end">
          <span className="flex flex-col items-start sm:items-end">
            <span className={HEAD}>Outstanding</span>
            <span
              className={`text-[20px] leading-[28px] font-semibold ${
                owed > 0 ? "text-[#e63946]" : "text-[#1e1e1e]"
              }`}
            >
              {formatMoney(owed)}
            </span>
          </span>
          <span className="flex flex-col items-start sm:items-end">
            <span className={HEAD}>Open invoices</span>
            <span className="text-[20px] leading-[28px] font-semibold text-[#1e1e1e]">
              {open.length}
            </span>
          </span>
          <button
            type="button"
            onClick={openDialog}
            disabled={owed <= 0}
            style={{ backgroundImage: GOLD_GRADIENT }}
            className="flex h-[48px] w-full shrink-0 cursor-pointer items-center justify-center rounded-[12px] px-[16px] text-[16px] leading-[24px] font-semibold whitespace-nowrap text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            Record payment
          </button>
        </div>
      </div>

      {note && (
        <p className="rounded-[10px] bg-[#f2f9f5] px-[14px] py-[10px] text-[13px] font-medium text-[#16a34a]">
          {note}
        </p>
      )}

      {/* ── Their invoices ─────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-col rounded-[12px] bg-white p-[16px] shadow-[inset_0_0_0_1px_#eaeaea]">
        <div className="mb-[10px] flex items-center justify-between">
          <span className="text-[15px] font-semibold text-[#1e1e1e]">Invoices</span>
          <Link href="/customers" className="text-[13px] font-medium text-[#f5b800]">
            Back to customers
          </Link>
        </div>

        {/* `min-w-[820px]` and `overflow-x-auto` were on the SAME element, so
            neither did its job: the element forced itself to 820px and
            overflowed its parent, and having no content wider than itself it
            never scrolled. Under about 900px the invoice table pushed the
            whole page sideways — the header, the summary cards and the button
            went with it, and the horizontal scrollbar was the window's.

            The wrapper scrolls and the child sets the floor, which is the
            shape every other list here uses. Below md the table is replaced
            outright by cards, so the scroll never comes up on a phone. */}
        <div>
          <QueryBoundary
            loading={invoiceQuery.loading}
            error={invoiceQuery.error}
            hasData={invoiceQuery.data !== undefined}
            skeleton={<TableSkeleton rows={6} columns={GRID} />}
            errorMessage="Could not load this customer's invoices."
            onRetry={invoiceQuery.refetch}
          >
            {invoices.length === 0 ? (
              <EmptyState message="This customer has no invoices yet." compact />
            ) : (
              <>
              <div className="hidden md:block">
                <div className="overflow-x-auto">
                  <div className="min-w-[820px]">
                    <div className={`grid ${GRID} items-center border-b border-solid border-[#eaeaea] pb-[8px]`}>
                      <span className={HEAD}>Invoice</span>
                      <span className={HEAD}>Date</span>
                      <span className={HEAD}>Branch</span>
                      <span className={`${HEAD} text-right`}>Total</span>
                      <span className={`${HEAD} text-right`}>Still owed</span>
                      <span className={`${HEAD} text-center`}>Status</span>
                    </div>
                    {invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className={`grid ${GRID} items-center border-b border-solid border-[#f5f5f5] py-[10px]`}
                >
                  <span className="truncate text-[14px] font-medium text-[#1e1e1e]">
                    {invoice.invoiceNumber}
                  </span>
                  <span className={BODY}>{when(invoice.saleDate)}</span>
                  <span className={`${BODY} truncate`}>{invoice.branchName || "—"}</span>
                  <span className={`${BODY} text-right`}>{formatMoney(invoice.grandTotal)}</span>
                  <span
                    className={`text-right text-[14px] font-medium ${
                      invoice.outstanding > 0 ? "text-[#e63946]" : "text-[#525252]"
                    }`}
                  >
                    {formatMoney(invoice.outstanding)}
                  </span>
                  <span className="flex justify-center">
                    {/*
                      Three states, not two. "Part paid" is the one that
                      matters: an invoice that has taken money and is not
                      settled is the ordinary result of paying half a balance,
                      and showing it as merely "unpaid" loses the fact that
                      anything was received against it at all.
                    */}
                    <StatusPill
                      label={
                        invoice.outstanding <= 0
                          ? "Paid"
                          : invoice.paidAmount > 0
                            ? "Part paid"
                            : "Unpaid"
                      }
                      tone={
                        invoice.outstanding <= 0
                          ? "green"
                          : invoice.paidAmount > 0
                            ? "gold"
                            : "rose"
                      }
                    />
                  </span>
                </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Below md the same six columns become a card each. Every figure
                  survives — the invoice number, when, where, the total, what is
                  still owed and its state — because on this screen "what does
                  this person still owe, and on which invoice" IS the question,
                  and a column dropped to save width is the answer withheld. */}
              <div className="flex flex-col gap-[10px] md:hidden">
                {invoices.map((invoice) => {
                  const settled = invoice.outstanding <= 0;
                  const part = !settled && invoice.paidAmount > 0;
                  return (
                    <div
                      key={invoice.id}
                      className="rounded-[10px] border border-solid border-[#eaeaea] p-[12px]"
                    >
                      <div className="flex items-start justify-between gap-[10px]">
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-medium text-[#1e1e1e]">
                            {invoice.invoiceNumber}
                          </p>
                          <p className="mt-[2px] truncate text-[12px] text-[#8f8d87]">
                            {when(invoice.saleDate)}
                            {invoice.branchName ? ` · ${invoice.branchName}` : ""}
                          </p>
                        </div>
                        <StatusPill
                          label={settled ? "Paid" : part ? "Part paid" : "Unpaid"}
                          tone={settled ? "green" : part ? "gold" : "rose"}
                        />
                      </div>
                      <div className="mt-[10px] flex items-end justify-between gap-[10px]">
                        <span className="text-[12px] text-[#8f8d87]">
                          Total {formatMoney(invoice.grandTotal)}
                        </span>
                        <span
                          className={`text-[14px] font-semibold ${
                            invoice.outstanding > 0 ? "text-[#e63946]" : "text-[#525252]"
                          }`}
                        >
                          {settled ? "Settled" : `${formatMoney(invoice.outstanding)} owed`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              </>
            )}
          </QueryBoundary>
        </div>
      </div>

      {/* ── Take money off the balance ─────────────────────────────────── */}
      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title={`Record a payment from ${customer?.name ?? "this customer"}`}
        width={640}
        footer={
          <>
            <button type="button" className={MODAL_GHOST} onClick={() => setPayOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || !canSave}
              style={{ backgroundImage: GOLD_GRADIENT }}
              className={MODAL_PRIMARY}
              onClick={save}
            >
              {saving ? "Recording..." : "Record payment"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-[14px]">
          <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-3">
            {/* A div, not a label: the Max button belongs beside the name and
                an interactive element inside a <label> corrupts the accessible
                name of the input it labels. `htmlFor` does the association. */}
            <div className="flex flex-col gap-[6px]">
              <AmountLabel
                htmlFor="pay-amount"
                className="text-[13px] font-medium text-[#1e1e1e]"
                onMax={() => onAmount(String(owed))}
                maxDisabled={owed <= 0}
              >
                Amount received
              </AmountLabel>
              <input
                id="pay-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => onAmount(e.target.value, e.target)}
                placeholder={String(owed)}
                className={FIELD}
                autoFocus
              />
            </div>
            <label className="flex flex-col gap-[6px]">
              <span className="text-[13px] font-medium text-[#1e1e1e]">Paid by</span>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className={FIELD}
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m === "MOBILE" ? "Mobile banking" : m.charAt(0) + m.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-[6px]">
              <span className="text-[13px] font-medium text-[#1e1e1e]">Note (optional)</span>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Cheque no, txn id…"
                className={FIELD}
              />
            </label>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-[#1e1e1e]">
              Which invoices this settles
            </span>
            <button
              type="button"
              onClick={() => {
                setTouched(false);
                setAllocations(spreadOldestFirst(typed, open));
              }}
              className="cursor-pointer text-[12px] font-medium text-[#f5b800]"
            >
              Spread oldest first
            </button>
          </div>

          <div className="flex max-h-[260px] flex-col gap-[8px] overflow-y-auto rounded-[10px] border border-solid border-[#eaeaea] p-[10px]">
            {open.length === 0 ? (
              <span className="p-[8px] text-[13px] text-[#8f8d87]">
                Nothing outstanding. Anything recorded now sits on account.
              </span>
            ) : (
              open.map((invoice) => {
                const value = allocations[invoice.id] ?? "";
                const put = amountOf(value);
                const settles = put > 0 && put >= invoice.outstanding - 0.0001;
                return (
                  <div
                    key={invoice.id}
                    className="grid grid-cols-[1.4fr_1fr_1fr_110px] items-center gap-[10px]"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[13px] font-medium text-[#1e1e1e]">
                        {invoice.invoiceNumber}
                      </span>
                      <span className="text-[11px] text-[#8f8d87]">{when(invoice.saleDate)}</span>
                    </span>
                    <span className="text-right text-[13px] text-[#525252]">
                      {formatMoney(invoice.grandTotal)}
                    </span>
                    <span className="text-right text-[13px] font-medium text-[#e63946]">
                      {formatMoney(invoice.outstanding)}
                    </span>
                    <span className="flex flex-col items-end gap-[2px]">
                      {/*
                        Two LITERAL class strings, not one with the colour
                        interpolated in. Tailwind generates a class only if it
                        can see it spelled out in the source, so
                        `shadow-[inset_0_0_0_1px_${colour}]` produced no rule at
                        all — the box had no border in either state.
                      */}
                      <input
                        inputMode="decimal"
                        value={value}
                        onChange={(e) => setLine(invoice.id, e.target.value, e.target)}
                        placeholder="0"
                        aria-label={`Amount against ${invoice.invoiceNumber}`}
                        className="h-[36px] w-full rounded-[8px] px-[8px] text-right text-[13px] text-[#1e1e1e] shadow-[inset_0_0_0_1px_#eaeaea] outline-none focus:shadow-[inset_0_0_0_1.5px_#f5b800]"
                      />
                      {put > 0 && (
                        <span
                          className={`text-[11px] font-medium ${
                            settles ? "text-[#16a34a]" : "text-[#8f8d87]"
                          }`}
                        >
                          {settles ? "settles it" : "part paid"}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/*
            What this payment does, stated.

            This read "Allocated ৳10,000 of ৳10,000", and it read that way for
            every amount anybody ever typed: while the lines have not been
            edited by hand, `onAmount` re-spreads the whole amount on each
            keystroke, so `allocated` is `typed` BY CONSTRUCTION. A line whose
            two halves are always equal is not arithmetic, it is furniture —
            and it crowded out the fact worth reading, which is how many
            invoices this settles and what is left over.

            A payment need not be fully allocated: the remainder sits ON
            ACCOUNT, the ordinary case of clearing one invoice and leaving
            change against the rest. It must not be allocated for MORE than was
            received, and no line may settle more than its invoice owes. The
            server refuses both; saying so here means finding out before
            pressing Save rather than after.
          */}
          <div className="flex flex-wrap items-center justify-between gap-[8px] text-[13px]">
            {overAllocated ? (
              <span role="alert" className="font-medium text-[#a02620]">
                These lines add up to {formatMoney(allocated)}, which is{" "}
                {formatMoney(round(allocated - typed))} more than the{" "}
                {formatMoney(typed)} received.
              </span>
            ) : typed <= 0 ? (
              <span className="text-[#8f8d87]">
                Enter what was received. Max fills in the full {formatMoney(owed)}.
              </span>
            ) : (
              <span className="text-[#525252]">
                <span className="font-medium text-[#1e1e1e]">{formatMoney(allocated)}</span> across{" "}
                {settles} invoice{settles === 1 ? "" : "s"}
                {onAccount > 0 && (
                  <>
                    {" · "}
                    <span className="font-medium text-[#1e1e1e]">{formatMoney(onAccount)}</span> left
                    on account
                  </>
                )}
              </span>
            )}
          </div>

          {payError && (
            <p
              role="alert"
              className="rounded-[10px] bg-[#fdeceb] px-[12px] py-[10px] text-[13px] font-medium text-[#a02620]"
            >
              {payError}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
