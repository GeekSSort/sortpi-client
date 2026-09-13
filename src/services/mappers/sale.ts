import { SaleRecord } from "@/types/sales";
import { toAmount } from "../apiClient";

/**
 * A sale from the server -> a row in the sales table. The two sides use
 * different words, not just different casing: `invoice_number` against
 * `invoiceNo`, `grand_total` against `totalAmount`.
 *
 * Status differs most. The server's COMPLETED or CANCELLED describes the
 * document; the table's Paid or Unpaid asks whether money is still owed.
 */

const CURRENCY = new Intl.NumberFormat("en-BD", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatAmount(value: number): string {
  return `৳ ${CURRENCY.format(value)}`;
}

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  BANK: "Bank Transfer",
  MOBILE: "bKash",
  OTHER: "Others",
};

function paymentMethodOf(row: any): string {
  const payments: any[] = Array.isArray(row?.payments) ? row.payments : [];
  if (payments.length === 0) return "Cash";
  // A split payment has no single method, so the largest part names it.
  const largest = payments.reduce((a, b) => (toAmount(b?.amount) > toAmount(a?.amount) ? b : a));
  const provider = largest?.payment_provider || largest?.paymentProvider;
  if (provider && typeof provider === "string" && provider.trim()) {
    return provider.trim();
  }
  const rawMethod = String(
    largest?.payment_method || largest?.paymentMethod || largest?.method || ""
  ).toUpperCase();
  return PAYMENT_LABELS[rawMethod] || rawMethod || "Cash";
}

function referenceNoOf(row: any): string {
  const payments: any[] = Array.isArray(row?.payments) ? row.payments : [];
  for (const p of payments) {
    const ref = p?.reference_no || p?.referenceNo || p?.transaction_id || p?.transactionId;
    if (ref && typeof ref === "string" && ref.trim()) return ref.trim();
  }
  const note = String(row?.note ?? "");
  const match = note.match(/Txn:\s*([^\s,;]+)/i);
  if (match && match[1]) return match[1];
  return "";
}

/**
 * The server sends an ISO timestamp; the table showed it raw, so a row read
 * "2026-09-05T09:32:41.514623+06:00". Rendered in the shape the rest of the
 * app uses — and the shape `matchesDay` parses, so the date filter above the
 * table keeps matching.
 */
const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

function whenOf(value: unknown): string {
  const raw = String(value ?? "");
  if (!raw) return "";
  const at = new Date(raw);
  if (Number.isNaN(at.getTime())) return raw;
  // "05 Sep 2026, 09:32 am" -> "05 Sep 2026 - 09:32 AM"
  const [day, time] = WHEN.format(at).split(", ");
  return `${day} - ${(time || "").toUpperCase()}`;
}

/**
 * Paid, Partial or Unpaid, from the two figures that decide it.
 *
 * Exported because the POS prints a receipt from its OWN checkout response,
 * before any sale row is mapped, and it used to print a hardcoded "Paid" on
 * every slip — including a part payment, where the customer walked out with a
 * receipt that denied the debt it had just created. One rule, both callers.
 */
export function paymentStateOf(paid: number, due: number): "Paid" | "Partial" | "Unpaid" {
  if (due <= 0) return "Paid";
  // Something was handed over and something is still owed. Its own state
  // because it is the one worth chasing — "Unpaid" is a sale nobody has paid
  // for, and showing both as Unpaid hid which customers walked out
  // mid-settlement. The server splits them the same way.
  return paid > 0 ? "Partial" : "Unpaid";
}

function statusOf(row: any): SaleRecord["status"] {
  if (String(row?.status).toUpperCase() === "CANCELLED") return "Refunded";
  // GOODS BACK, which is a different question from money owed and outranks it.
  //
  // A fully returned sale owes nothing, so the settlement below called it
  // Paid — the money had gone out, the items were on the shelf again, and the
  // row said the customer had paid for them. `refund_state` is the server's
  // own reading of the lines; there is no arithmetic here to disagree with it.
  const refunded = String(row?.refundState ?? row?.refund_state ?? "NONE").toUpperCase();
  if (refunded === "FULL") return "Refunded";
  if (refunded === "PARTIAL") return "Partially Refunded";
  // The SAME figures the columns show. Read from the frozen pair, this pill
  // said "Partial" forever on an invoice the customer had since settled.
  const { paid, due } = settlementOf(row);
  return paymentStateOf(paid, due);
}

/**
 * What this invoice has taken in and what it still owes, TODAY.
 *
 * `settled_amount` and `outstanding_amount` are the server's ledger-derived
 * figures: the tender at the till PLUS every payment collected against the
 * invoice since, less anything a return credited back. `paid_amount` and
 * `due_amount` beside them are frozen at the moment the sale was rung up and
 * never move again — a list built on those showed a customer as owing money
 * they had already paid, and went on showing it forever.
 *
 * The frozen pair is the fallback, for a response from before the live fields
 * existed. It is right for a sale nobody has paid against since, which is most
 * of them, and no worse than what this did before where it is not.
 */
export function settlementOf(row: any): { paid: number; due: number } {
  const live = row?.outstandingAmount ?? row?.outstanding_amount;
  if (live === undefined || live === null) {
    return {
      paid: toAmount(row?.paidAmount ?? row?.paid_amount),
      due: toAmount(row?.dueAmount ?? row?.due_amount),
    };
  }
  return {
    paid: toAmount(row?.settledAmount ?? row?.settled_amount),
    due: toAmount(live),
  };
}

export function toSaleRecord(row: any): SaleRecord {
  const total = toAmount(row?.grandTotal ?? row?.grand_total);
  const { paid, due } = settlementOf(row);
  const refNo = referenceNoOf(row);
  return {
    id: String(row?.id ?? ""),
    invoiceNo: String(row?.invoiceNumber ?? row?.invoice_number ?? ""),
    dateTime: whenOf(row?.saleDate ?? row?.sale_date),
    customerName: String(row?.customerName ?? row?.customer_name ?? "Walk-in Customer"),
    totalAmount: total,
    totalAmountFormatted: formatAmount(total),
    paidAmount: paid,
    paidAmountFormatted: formatAmount(paid),
    dueAmount: due,
    dueAmountFormatted: formatAmount(due),
    paymentMethod: paymentMethodOf(row),
    status: statusOf(row),
    referenceNo: refNo,
    transactionId: refNo,
  };
}
