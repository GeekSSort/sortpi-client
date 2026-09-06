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

const PAYMENT_LABELS: Record<string, SaleRecord["paymentMethod"]> = {
  CASH: "Cash",
  CARD: "Card",
  BANK: "Bank Transfer",
  MOBILE: "bKash",
};

function paymentMethodOf(row: any): SaleRecord["paymentMethod"] {
  const payments: any[] = Array.isArray(row?.payments) ? row.payments : [];
  if (payments.length === 0) return "Cash";
  // A split payment has no single method, so the largest part names it.
  const largest = payments.reduce((a, b) => (toAmount(b?.amount) > toAmount(a?.amount) ? b : a));
  return PAYMENT_LABELS[String(largest?.method || "").toUpperCase()] || "Cash";
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

function statusOf(row: any): SaleRecord["status"] {
  if (String(row?.status).toUpperCase() === "CANCELLED") return "Refunded";
  return toAmount(row?.dueAmount) > 0 ? "Unpaid" : "Paid";
}

export function toSaleRecord(row: any): SaleRecord {
  const total = toAmount(row?.grandTotal);
  return {
    id: String(row?.id ?? ""),
    invoiceNo: String(row?.invoiceNumber ?? ""),
    dateTime: whenOf(row?.saleDate),
    customerName: String(row?.customerName ?? "Walk-in Customer"),
    totalAmount: total,
    totalAmountFormatted: formatAmount(total),
    paymentMethod: paymentMethodOf(row),
    status: statusOf(row),
  };
}
