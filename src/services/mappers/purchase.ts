import { PurchaseRecord } from "@/types/purchases";
import { toAmount } from "../apiClient";
import { formatMoney } from "@/lib/format";

/**
 * Purchase -> a row in the purchase history table.
 *
 * Without this the supplier arrives as a bare id under a key the table reads
 * as an object, and every name, amount and status on the page is blank.
 */

const STATUS: Record<string, PurchaseRecord["status"]> = {
  RECEIVED: "Received",
  PARTIAL: "Pending",
  CONFIRMED: "Ordered",
  DRAFT: "Pending",
  CANCELLED: "Cancelled",
};

function paymentStatus(total: number, due: number): PurchaseRecord["paymentStatus"] {
  if (due <= 0) return "Paid";
  return due >= total ? "Due" : "Partial";
}

export function toPurchaseRecord(row: any): PurchaseRecord {
  const total = toAmount(row?.grandTotal ?? row?.grand_total);
  const due = toAmount(row?.dueAmount ?? row?.due_amount);
  return {
    id: String(row?.id ?? ""),
    purchaseId: String(row?.referenceNo ?? row?.reference_no ?? "—"),
    supplier: {
      name: String(row?.supplierName ?? row?.supplier_name ?? "—"),
      // No supplier logo on the server; the table draws initials.
      avatar: "",
    },
    purchaseDate: String(row?.purchaseDate ?? row?.purchase_date ?? "—"),
    itemsCount: Array.isArray(row?.items) ? row.items.length : 0,
    totalAmount: total,
    totalAmountFormatted: formatMoney(total),
    paymentStatus: paymentStatus(total, due),
    status: STATUS[String(row?.status || "").toUpperCase()] ?? "Pending",
  };
}
