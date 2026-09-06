import { ReturnRecord } from "@/types/returns";
import { toAmount } from "../apiClient";
import { formatMoney } from "@/lib/format";

/**
 * A sale return -> a row in the returns table.
 *
 * Without this the table showed a customer name, a raw CONFIRMED status and
 * seven blanks, because the API calls those fields `reference_no`,
 * `invoice_number`, `return_date` and `grand_total`.
 */

const TENDER: Record<string, ReturnRecord["paymentMethod"]> = {
  CASH: "Cash",
  CARD: "Card",
  MOBILE: "bKash",
  BANK: "Bank Transfer",
  BANK_TRANSFER: "Bank Transfer",
};

const STATUS: Record<string, ReturnRecord["status"]> = {
  CONFIRMED: "Paid",
  COMPLETED: "Paid",
  DRAFT: "Pending",
  PENDING: "Pending",
  CANCELLED: "Rejected",
  REJECTED: "Rejected",
};

const WHEN = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export function toReturnRecord(row: any): ReturnRecord {
  const total = toAmount(row?.grandTotal ?? row?.grand_total);
  const refund = toAmount(row?.refundAmount ?? row?.refund_amount);
  const raw = String(row?.returnDate ?? row?.return_date ?? "");
  const at = new Date(raw);
  return {
    id: String(row?.id ?? ""),
    returnNo: String(row?.referenceNo ?? row?.reference_no ?? "—"),
    invoiceNo: String(row?.invoiceNumber ?? row?.invoice_number ?? "—"),
    dateTime: Number.isNaN(at.getTime()) ? raw || "—" : WHEN.format(at),
    customerName: String(row?.customerName ?? row?.customer_name ?? "Walk-in"),
    totalAmount: total,
    totalAmountFormatted: formatMoney(total),
    refundAmount: refund,
    refundAmountFormatted: formatMoney(refund),
    paymentMethod:
      TENDER[String(row?.refundMethod ?? row?.refund_method ?? "").toUpperCase()] ?? "Cash",
    status: STATUS[String(row?.status || "").toUpperCase()] ?? "Pending",
  };
}
