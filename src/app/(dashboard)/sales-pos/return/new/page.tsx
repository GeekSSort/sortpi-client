"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ReturnService } from "@/services";
import { ReturnableSale } from "@/types/returns";
import { formatMoney } from "@/lib/format";

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

const REFUND_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Card" },
  { value: "MOBILE", label: "bKash" },
  { value: "BANK", label: "Bank Transfer" },
] as const;

type RefundMethod = (typeof REFUND_METHODS)[number]["value"];

/** Today as YYYY-MM-DD in the shop's own timezone, not UTC. */
function today(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

const FIELD =
  "h-[44px] w-full rounded-[10px] bg-white px-[12px] text-[14px] text-[#1e1e1e] shadow-[inset_0_0_0_1px_#eaeaea] outline-none focus:shadow-[inset_0_0_0_1.5px_#f5b800]";
const LABEL = "text-[13px] font-medium text-[#1e1e1e]";

export default function NewReturnPage() {
  const router = useRouter();

  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [sale, setSale] = useState<ReturnableSale | null>(null);
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  /** Quantity being returned, per sale-item id. */
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState<RefundMethod>("CASH");
  const [referenceNo, setReferenceNo] = useState("");
  const [returnDate, setReturnDate] = useState(today());

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const findSale = async () => {
    setLooking(true);
    setLookupError(null);
    setSale(null);
    setPicked({});
    try {
      const found = await ReturnService.findSaleByInvoice(invoiceQuery);
      if (!found) {
        setLookupError(`No sale found for "${invoiceQuery.trim()}".`);
      } else if (found.items.length === 0) {
        setSale(found);
        setLookupError("That sale has no lines to return.");
      } else {
        setSale(found);
        // A reference the shop can read off the slip, tied to the invoice it
        // is against rather than to the clock alone.
        setReferenceNo(`RET-${found.invoiceNo}`.slice(0, 50));
      }
    } catch {
      setLookupError("The sale could not be looked up. Try again.");
    } finally {
      setLooking(false);
    }
  };

  const setQty = (line: { id: string; returnable: number }, next: number) =>
    setPicked((prev) => {
      const clamped = Math.max(0, Math.min(line.returnable, next));
      const out = { ...prev };
      if (clamped === 0) delete out[line.id];
      else out[line.id] = clamped;
      return out;
    });

  const lines = sale?.items ?? [];

  const refundTotal = useMemo(
    () => lines.reduce((sum, line) => sum + (picked[line.id] ?? 0) * line.unitPrice, 0),
    [lines, picked]
  );
  const pickedCount = Object.values(picked).reduce((n, q) => n + q, 0);

  const canSubmit =
    !!sale && pickedCount > 0 && referenceNo.trim() !== "" && returnDate !== "" && !saving;

  const submit = async () => {
    if (!sale || !canSubmit) return;
    setSaving(true);
    setSaveError(null);
    try {
      await ReturnService.createReturn(sale.id, {
        referenceNo: referenceNo.trim(),
        returnDate,
        refundMethod,
        reason: reason.trim(),
        items: Object.entries(picked).map(([saleItemId, quantity]) => ({
          saleItemId,
          quantity,
        })),
      });
      setDone(true);
      // Long enough to read, short enough not to feel stuck.
      setTimeout(() => router.push("/sales-pos/return"), 1200);
    } catch (error) {
      // The server's own message is the useful one: it names the line that
      // exceeded what is returnable, or the permission that is missing.
      setSaveError(
        error instanceof Error && error.message
          ? error.message
          : "The refund could not be recorded."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-[20px] pb-[48px] select-none">
      <div>
        <h2 className="text-[20px] leading-[28px] font-semibold text-[#1e1e1e]">New Return</h2>
        <p className="mt-[2px] text-[13px] text-[#8f8d87]">
          Find the sale, choose what came back, and refund it.
        </p>
      </div>

      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-[16px]">
        {/* 1 — the sale */}
        <div className="flex flex-col gap-[10px] rounded-[12px] bg-white p-[16px] shadow-[inset_0_0_0_1px_#eaeaea]">
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
            <div className="border-b border-solid border-[#eaeaea] px-[16px] py-[12px]">
              <h3 className="text-[14px] font-semibold text-[#1e1e1e]">What came back</h3>
              <p className="mt-[2px] text-[12px] text-[#8f8d87]">
                Up to what is still returnable on each line.
              </p>
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
                value={referenceNo}
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
              <span className="text-[#8f8d87]">at the price on the original sale</span>
            </div>
            <div className="flex items-center justify-between border-t border-solid border-[#eaeaea] pt-[10px]">
              <span className="text-[15px] font-semibold text-[#1e1e1e]">Refund</span>
              <span className="text-[18px] font-semibold text-[#1e1e1e] tabular-nums">
                {formatMoney(refundTotal)}
              </span>
            </div>
            <p className="text-[12px] text-[#8f8d87]">
              An estimate from the line prices. The server refunds against the original sale, and
              its figure is the one recorded.
            </p>

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
