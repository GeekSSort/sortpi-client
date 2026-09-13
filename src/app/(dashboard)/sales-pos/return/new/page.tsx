"use client";

import React, { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ReturnService } from "@/services";
import { ReturnableSale } from "@/types/returns";
import { formatMoney } from "@/lib/format";
import { REFUND_METHODS, type RefundMethod } from "@/lib/paymentMethods";
import { useQuery, queryKey, useMutation } from "@/lib/query/useQuery";
import { DetailSkeleton } from "@/components/shared/Skeleton";
import { RefreshBar } from "@/components/shared/QueryBoundary";

/**
 * New Return — find the sale, pick what came back, refund it.
 *
 * Everything here is the real sale. The screen used to load the first three
 * products in the catalogue as though they were the customer's order, hardcode
 * the invoice and the customer, print three dollar figures that were not
 * derived from anything, and post to `/returns/refund` — an endpoint that does
 * not exist, so the failure fell through to a fabricated record and the page
 * reported a refund that never happened.
 *
 * Quantities are the only thing sent. The server refunds at the price and cost
 * stamped on the original line, and `returnable` is its own figure, so a line
 * cannot be refunded twice.
 */

/** Today as YYYY-MM-DD in the shop's own timezone, not UTC. */
function today(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

const FIELD =
  "h-[44px] w-full rounded-[10px] bg-white px-[12px] text-[14px] text-[#1e1e1e] shadow-[inset_0_0_0_1px_#eaeaea] outline-none focus:shadow-[inset_0_0_0_1.5px_#f5b800]";
const LABEL = "text-[13px] font-medium text-[#1e1e1e]";

/**
 * The next free `RET-…` reference for an invoice.
 *
 * `reference_no` is unique per organization (`uq_sreturn_org_ref`) and this
 * screen suggested `RET-{invoice}` and nothing else. That was survivable while
 * a refund meant the whole sale, because there was only ever one. Partial
 * refunds are the normal case now — two of the four came back today, the other
 * two next week — so the second return against an invoice collided with the
 * first and the desk got "A return already uses that reference." about a field
 * this screen had filled in itself.
 *
 * The suffix SKIPS taken names rather than counting them: a return deleted, or
 * created at another till, would otherwise put the count straight back onto a
 * number in use.
 *
 * Module scope, and a plain function: as a `useMemo` the React Compiler could
 * not preserve the loop, and picking a free name from a list is not state.
 */
function nextReference(
  invoiceNo: string | undefined,
  itemCount: number,
  prior: { returnNo: string }[] | undefined
): string {
  if (!invoiceNo || itemCount === 0) return "";
  const base = `RET-${invoiceNo}`;
  const taken = new Set((prior ?? []).map((r) => r.returnNo));
  if (!taken.has(base)) return base.slice(0, 50);
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate.slice(0, 50);
  }
  return `${base}-${Date.now().toString().slice(-5)}`.slice(0, 50);
}

function NewReturnForm() {
  const router = useRouter();

  /**
   * The invoice this page was sent here to refund.
   *
   * Refund on the Sales screen used to open a modal that refunded the WHOLE
   * sale — there was nowhere in it to say "two of the four came back", so a
   * partial return meant leaving the modal, coming here, and typing the
   * invoice number off the row you had just been looking at. It links here
   * with the invoice instead, and this page is the one that can already pick
   * lines and quantities.
   *
   * `useSearchParams` needs a Suspense boundary in the App Router, which is
   * why the page is split around one below.
   */
  const params = useSearchParams();
  const fromLink = (params.get("invoice") ?? "").trim();

  const [invoiceQuery, setInvoiceQuery] = useState(fromLink);
  /** The invoice actually asked for, which is what the cache is keyed on.
      Typing does not send a request; pressing Find does — or arriving with one
      in the URL, which is the same intent expressed by the link. */
  const [lookingUp, setLookingUp] = useState(fromLink);

  /** Quantity being returned, per sale-item id. */
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState<RefundMethod>("CASH");
  const [referenceNo, setReferenceNo] = useState("");
  const [returnDate, setReturnDate] = useState(today());

  const [saveError, setSaveError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Keyed on the invoice, so looking the same one up twice — a common thing at
  // a returns desk working through a bag of receipts — answers from cache.
  const lookup = useQuery(
    queryKey("sales", { invoice: lookingUp }),
    () => ReturnService.findSaleByInvoice(lookingUp),
    { enabled: lookingUp !== "" }
  );

  const sale: ReturnableSale | null = lookingUp === "" ? null : lookup.data ?? null;
  const looking = lookup.loading;

  const lookupError = (() => {
    if (lookingUp === "" || lookup.loading) return null;
    if (lookup.error) return "The sale could not be looked up. Try again.";
    if (lookup.data === undefined) return null;
    if (lookup.data === null) return `No sale found for "${lookingUp}".`;
    if (lookup.data.items.length === 0) return "That sale has no lines to return.";
    return null;
  })();

  const findSale = () => {
    const wanted = invoiceQuery.trim();
    if (!wanted) return;
    setPicked({});
    setLookingUp(wanted);
    // Asking for the same invoice again is a deliberate re-check, so it goes
    // back to the server rather than replaying a cached answer.
    if (wanted === lookingUp) void lookup.refetch();
  };

  /**
   * What has already come back against this invoice.
   *
   * Needed for the reference below, and only once a sale is on screen.
   */
  const priorReturns = useQuery(
    queryKey("returns", { invoice: sale?.invoiceNo ?? "none" }),
    () => ReturnService.getReturnsForInvoice(sale!.invoiceNo),
    { enabled: !!sale }
  );

  /**
   * A reference the shop can read off the slip — and a DIFFERENT one each time.
   *
   * `reference_no` is unique per organization (`uq_sreturn_org_ref`), and this
   * suggested `RET-{invoice}` and nothing else. That was survivable while a
   * refund meant the whole sale, because there was only ever one. Partial
   * refunds are the normal case now — two of the four came back today, the
   * other two next week — so the second return against an invoice collided
   * with the first and the desk got "A return already uses that reference."
   * with no hint that the fix was to edit a field it had filled in itself.
   *
   * So the suffix counts what is already there, and skips any reference that
   * exists rather than trusting the count: a return deleted or created
   * elsewhere would otherwise land straight back on a taken number.
   */
  const suggestedReference = nextReference(
    sale?.invoiceNo,
    sale?.items.length ?? 0,
    priorReturns.data
  );

  const reference = referenceNo || suggestedReference;

  const { mutate: createReturn, pending: saving } = useMutation(
    (args: { saleId: string; payload: Parameters<typeof ReturnService.createReturn>[1] }) =>
      ReturnService.createReturn(args.saleId, args.payload),
    // A refund writes a return, reverses part of the sale, puts the goods back
    // on the shelf and changes the day's takings.
    { invalidates: ["returns", "sales", "stock", "inventory", "dashboard"] }
  );

  const setQty = (line: { id: string; returnable: number }, next: number) =>
    setPicked((prev) => {
      const clamped = Math.max(0, Math.min(line.returnable, next));
      const out = { ...prev };
      if (clamped === 0) delete out[line.id];
      else out[line.id] = clamped;
      return out;
    });

  // Memoised because `?? []` would be a new array each render, and the refund
  // total below depends on it.
  const lines = useMemo(() => sale?.items ?? [], [sale]);

  /**
   * What the goods being sent back are WORTH.
   *
   * From `chargedTotal`, which is what the customer actually PAID for the line:
   * net of its own offer and its share of the invoice discount, AND of the
   * coupon, the points and any whole-taka rounding that happened to the bill
   * afterwards. It is the server's figure and the one it refunds. Quoting the
   * shelf price promised 1,000 for goods that took 800; quoting `lineTotal`
   * still promised 1,000 for a 10%-coupon sale that took 900.
   *
   * Per unit, so a partial return is a share of what was charged, which is
   * exactly how `_refund_for` works it out on the server.
   */
  const goodsValue = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const qty = picked[line.id] ?? 0;
        if (qty <= 0 || line.quantity <= 0) return sum;
        return sum + (line.chargedTotal / line.quantity) * qty;
      }, 0),
    [lines, picked]
  );

  /**
   * And what the CUSTOMER actually gets back, which is not the same figure.
   *
   * A refund returns money that was received. Where a sale still owes
   * something, the return clears the debt first and only the remainder is
   * handed over: ৳1,000 of goods against a ৳400 debt is ৳400 off the account
   * and ৳600 in cash. Quoting the goods value there would have the shop paying
   * out money it never took.
   *
   * The same rule the server applies in `_compute_return_credit`, so the
   * figure on screen is the figure that gets refunded.
   */
  const owed = sale?.outstandingAmount ?? 0;
  const creditBack = Math.min(goodsValue, Math.max(0, owed));
  const refundTotal = Math.max(0, goodsValue - creditBack);
  const pickedCount = Object.values(picked).reduce((n, q) => n + q, 0);

  /** Everything still returnable, in one press. */
  const refundEverything = () => {
    const all: Record<string, number> = {};
    for (const line of lines) {
      // What is LEFT, so a line already half returned takes only the rest —
      // the server caps at the same figure and would refuse anything more.
      if (line.returnable > 0) all[line.id] = line.returnable;
    }
    setPicked(all);
  };

  const everythingPicked =
    lines.length > 0 &&
    lines.every((line) => line.returnable <= 0 || (picked[line.id] ?? 0) >= line.returnable);

  const canSubmit =
    !!sale && pickedCount > 0 && reference.trim() !== "" && returnDate !== "" && !saving;

  const submit = async () => {
    if (!sale || !canSubmit) return;
    setSaveError(null);
    try {
      await createReturn({
        saleId: sale.id,
        payload: {
          referenceNo: reference.trim(),
          returnDate,
          refundMethod,
          reason: reason.trim(),
          items: Object.entries(picked).map(([saleItemId, quantity]) => ({
            saleItemId,
            quantity,
          })),
        },
      });
      setDone(true);
      // Long enough to read, short enough not to feel stuck.
      setTimeout(() => router.push("/sales-pos/return"), 1200);
    } catch (error) {
      // A reference collision is the one failure the desk cannot act on: the
      // field was filled in by this screen, so "already uses that reference"
      // reads as a bug rather than an instruction. The suggestion is computed
      // from the returns that existed when the sale was looked up, so another
      // till taking a return in between still lands on a taken number.
      //
      // Re-read them and say which reference to use, rather than leaving
      // somebody to invent one.
      const message = error instanceof Error ? error.message : "";
      if (/already uses that reference/i.test(message)) {
        await priorReturns.refetch();
        setSaveError(
          "Another return took that reference a moment ago. The suggestion has " +
            "been updated — press Record refund again."
        );
        return;
      }
      // Otherwise the server's own message is the useful one: it names the
      // line that exceeded what is returnable, or the permission missing.
      setSaveError(
        error instanceof Error && error.message
          ? error.message
          : "The refund could not be recorded."
      );
    }
  };

  return (
    // The page's own title and strapline are gone: the app header above already
    // carries both, so this printed the page's name twice down the screen.
    <div className="flex w-full flex-col gap-[20px] pb-[48px]">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-[16px]">
        {/* 1 — the sale */}
        <div className="relative flex flex-col gap-[10px] rounded-[12px] bg-white p-[16px] shadow-[inset_0_0_0_1px_#eaeaea]">
          <RefreshBar active={lookup.fetching} />
          <label htmlFor="invoice" className={LABEL}>
            Invoice number
          </label>
          <div className="flex flex-wrap items-center gap-[8px]">
            <input
              id="invoice"
              value={invoiceQuery}
              onChange={(e) => setInvoiceQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && findSale()}
              placeholder="INV-000123"
              className={`${FIELD} min-w-[200px] flex-1`}
            />
            <button
              type="button"
              onClick={findSale}
              disabled={looking || !invoiceQuery.trim()}
              style={{
                backgroundImage:
                  "linear-gradient(180deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 100%), linear-gradient(90deg, rgb(245,184,0) 0%, rgb(245,184,0) 100%)",
              }}
              className="flex h-[44px] shrink-0 cursor-pointer items-center justify-center rounded-[10px] px-[20px] text-[14px] font-semibold text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {looking ? "Looking…" : "Find sale"}
            </button>
          </div>

          {lookupError && <p className="text-[13px] text-[#e63946]">{lookupError}</p>}

          {/* The sale's own summary, at the size it will be, so the panel does
              not jump when the lookup lands. */}
          {looking && (
            <div className="mt-[4px] rounded-[10px] bg-[#fafafa] px-[12px] py-[10px]">
              <DetailSkeleton rows={2} />
            </div>
          )}

          {sale && (
            <div className="mt-[4px] flex flex-wrap items-center justify-between gap-[8px] rounded-[10px] bg-[#fafafa] px-[12px] py-[10px] text-[13px]">
              <span className="font-medium text-[#1e1e1e]">{sale.invoiceNo}</span>
              <span className="text-[#525252]">{sale.customerName}</span>
              <span className="font-medium text-[#1e1e1e] tabular-nums">
                {formatMoney(sale.grandTotal)}
              </span>
            </div>
          )}
        </div>

        {/* 2 — what came back */}
        {sale && lines.length > 0 && (
          <div className="overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_#eaeaea]">
            <div className="flex flex-wrap items-center justify-between gap-[10px] border-b border-solid border-[#eaeaea] px-[16px] py-[12px]">
              <div className="min-w-0">
                <h3 className="text-[14px] font-semibold text-[#1e1e1e]">What came back</h3>
                <p className="mt-[2px] text-[12px] text-[#8f8d87]">
                  Up to what is still returnable on each line.
                </p>
              </div>
              {/* The whole invoice, in one press.
                  The common case at a counter is everything coming back, and
                  doing it by hand is one press per line plus a count of what
                  is left on each. It fills the boxes and stops — the cashier
                  still reads the list and presses Record refund. */}
              <button
                type="button"
                onClick={everythingPicked ? () => setPicked({}) : refundEverything}
                className="flex h-[36px] shrink-0 cursor-pointer items-center justify-center rounded-[10px] px-[14px] text-[13px] font-semibold whitespace-nowrap transition-colors shadow-[inset_0_0_0_1px_#eaeaea] hover:bg-[#fafafa] text-[#525252] hover:text-[#1e1e1e]"
              >
                {everythingPicked ? "Clear selection" : "Refund all items"}
              </button>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[520px]">
                <div className="grid grid-cols-[1fr_90px_100px_130px] items-center gap-[8px] border-b border-solid border-[#eaeaea] bg-[#fafafa] px-[16px] py-[10px] text-[12px] font-medium text-[#8f8d87]">
                  <span>Item</span>
                  <span className="text-right">Price</span>
                  <span className="text-right">Returnable</span>
                  <span className="text-center">Returning</span>
                </div>

                {lines.map((line) => {
                  const qty = picked[line.id] ?? 0;
                  const none = line.returnable <= 0;
                  return (
                    <div
                      key={line.id}
                      className="grid grid-cols-[1fr_90px_100px_130px] items-center gap-[8px] border-b border-solid border-[#f4f4f4] px-[16px] py-[10px] last:border-b-0"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-[14px] text-[#1e1e1e]">{line.name}</span>
                        <span className="truncate text-[12px] text-[#8f8d87]">{line.sku}</span>
                      </span>

                      <span className="text-right text-[13px] text-[#525252] tabular-nums">
                        {formatMoney(line.unitPrice)}
                      </span>

                      <span
                        className={`text-right text-[13px] tabular-nums ${
                          none ? "text-[#a3a3a3]" : "text-[#525252]"
                        }`}
                      >
                        {none ? "none left" : line.returnable}
                      </span>

                      <span className="flex items-center justify-center gap-[6px]">
                        <button
                          type="button"
                          onClick={() => setQty(line, qty - 1)}
                          disabled={none || qty <= 0}
                          aria-label={`One fewer ${line.name}`}
                          className="flex size-[28px] items-center justify-center rounded-[8px] text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] not-disabled:cursor-pointer hover:not-disabled:text-[#1e1e1e] disabled:opacity-40"
                        >
                          −
                        </button>
                        <input
                          value={qty}
                          onChange={(e) => setQty(line, Number(e.target.value.replace(/\D/g, "")))}
                          disabled={none}
                          inputMode="numeric"
                          aria-label={`Quantity of ${line.name} returning`}
                          className="h-[28px] w-[46px] rounded-[8px] bg-white text-center text-[13px] text-[#1e1e1e] tabular-nums shadow-[inset_0_0_0_1px_#eaeaea] outline-none focus:shadow-[inset_0_0_0_1.5px_#f5b800] disabled:opacity-40"
                        />
                        <button
                          type="button"
                          onClick={() => setQty(line, qty + 1)}
                          disabled={none || qty >= line.returnable}
                          aria-label={`One more ${line.name}`}
                          className="flex size-[28px] items-center justify-center rounded-[8px] text-[#525252] shadow-[inset_0_0_0_1px_#eaeaea] not-disabled:cursor-pointer hover:not-disabled:text-[#1e1e1e] disabled:opacity-40"
                        >
                          +
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 3 — the paperwork */}
        {sale && lines.length > 0 && (
          <div className="grid grid-cols-1 gap-[12px] rounded-[12px] bg-white p-[16px] shadow-[inset_0_0_0_1px_#eaeaea] sm:grid-cols-2">
            <div className="flex flex-col gap-[6px]">
              <label htmlFor="reference" className={LABEL}>
                Return reference
              </label>
              <input
                id="reference"
                value={reference}
                onChange={(e) => setReferenceNo(e.target.value)}
                maxLength={50}
                placeholder="RET-000123"
                className={FIELD}
              />
            </div>

            <div className="flex flex-col gap-[6px]">
              <label htmlFor="return-date" className={LABEL}>
                Return date
              </label>
              <input
                id="return-date"
                type="date"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                className={FIELD}
              />
            </div>

            <div className="flex flex-col gap-[6px]">
              <label htmlFor="refund-method" className={LABEL}>
                Refund by
              </label>
              <select
                id="refund-method"
                value={refundMethod}
                onChange={(e) => setRefundMethod(e.target.value as RefundMethod)}
                className={`${FIELD} cursor-pointer`}
              >
                {REFUND_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-[6px]">
              <label htmlFor="reason" className={LABEL}>
                Reason <span className="font-normal text-[#8f8d87]">(optional)</span>
              </label>
              <input
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Damaged, wrong size…"
                className={FIELD}
              />
            </div>
          </div>
        )}

        {/* 4 — what it comes to */}
        {sale && lines.length > 0 && (
          <div className="flex flex-col gap-[10px] rounded-[12px] bg-white p-[16px] shadow-[inset_0_0_0_1px_#eaeaea]">
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-[#525252]">
                {pickedCount} item{pickedCount === 1 ? "" : "s"} returning
              </span>
              <span className="text-[#8f8d87]">at what was charged on the original sale</span>
            </div>

            {/* The goods, and then what of it is actually MONEY.
                Broken out because the two differ whenever the sale still owes
                something, and a single "Refund" line would be the wrong figure
                in the one case a cashier most needs the right one. */}
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-[#525252]">Goods returning</span>
              <span data-testid="goods-value" className="text-[#525252] tabular-nums">
                {formatMoney(goodsValue)}
              </span>
            </div>
            {creditBack > 0 && (
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-[#525252]">
                  Clears what is still owed
                  <span className="text-[#8f8d87]"> · {formatMoney(owed)} outstanding</span>
                </span>
                <span className="text-[#525252] tabular-nums">− {formatMoney(creditBack)}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-solid border-[#eaeaea] pt-[10px]">
              <span className="text-[15px] font-semibold text-[#1e1e1e]">
                {creditBack > 0 ? "Cash back to customer" : "Refund"}
              </span>
              <span
                data-testid="refund-total"
                className="text-[18px] font-semibold text-[#1e1e1e] tabular-nums"
              >
                {formatMoney(refundTotal)}
              </span>
            </div>
            {creditBack > 0 ? (
              // The sentence that stops a cashier handing over the wrong money.
              <p className="text-[12px] leading-[1.6] text-[#8f8d87]">
                This customer paid {formatMoney(sale.settledAmount)} of{" "}
                {formatMoney(sale.grandTotal)}, so {formatMoney(creditBack)} of the return comes
                off what they still owe and {formatMoney(refundTotal)} is handed back.
              </p>
            ) : (
              <p className="text-[12px] text-[#8f8d87]">
                Worked out from the original sale. The server refunds against it and its figure is
                the one recorded.
              </p>
            )}

            {saveError && (
              <p className="rounded-[8px] bg-[#ffdfe2] px-[10px] py-[8px] text-[13px] text-[#e63946]">
                {saveError}
              </p>
            )}

            {done && (
              <p className="rounded-[8px] bg-[#f5fff8] px-[10px] py-[8px] text-[13px] font-medium text-[#00b837]">
                Return recorded. Taking you back to the list…
              </p>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              style={{
                backgroundImage:
                  "linear-gradient(180deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 100%), linear-gradient(90deg, rgb(245,184,0) 0%, rgb(245,184,0) 100%)",
              }}
              className="mt-[4px] flex h-[48px] w-full cursor-pointer items-center justify-center rounded-[12px] text-[15px] font-semibold text-white shadow-[inset_0px_0px_1.5px_0px_rgba(255,255,255,0.25)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Recording…" : "Refund now"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * `useSearchParams` opts a route into client-side rendering and the App Router
 * requires a Suspense boundary around it, or the whole page is deopted and the
 * build warns. The fallback is the page's own skeleton so the wrapper is
 * invisible.
 */
export default function NewReturnPage() {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <NewReturnForm />
    </Suspense>
  );
}
