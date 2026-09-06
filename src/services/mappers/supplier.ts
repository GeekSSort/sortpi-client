import { SupplierRecord } from "@/types/suppliers";
import { toAmount } from "../apiClient";
import { formatMoney } from "@/lib/format";

/**
 * Supplier -> a row in the suppliers table.
 *
 * Rows used to go to the table straight from the API, so only name and phone
 * showed — the two names that happen to match — and every money column was
 * blank.
 *
 * Total purchases and the last purchase date come from the API, which
 * annotates them onto the list with a single aggregate. They used to be summed
 * in the browser from a separate fetch of the purchase list — which the API
 * caps at 200 rows, so every figure was really "of the last 200 purchases in
 * the shop".
 */

const WHEN = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function whenOf(value: unknown): string {
  const raw = String(value ?? "");
  if (!raw) return "—";
  const at = new Date(raw);
  return Number.isNaN(at.getTime()) ? raw : WHEN.format(at);
}

export function toSupplierRecord(row: any, index: number): SupplierRecord {
  const balance = toAmount(row?.currentBalance ?? row?.current_balance);
  // Absent on a row the API has not annotated — a supplier nothing has been
  // bought from, or a create response, both of which are honestly zero.
  const purchases = toAmount(row?.totalPurchases ?? row?.total_purchases);
  const lastDate = row?.lastPurchaseDate ?? row?.last_purchase_date;
  return {
    id: String(row?.id ?? ""),
    index: String(index).padStart(2, "0"),
    name: String(row?.name || "—"),
    // No supplier logo on the server; the table draws initials.
    avatar: "",
    phone: String(row?.phone || "—"),
    mail: String(row?.email || "—"),
    totalPurchases: purchases,
    totalPurchasesFormatted: formatMoney(purchases),
    balance,
    balanceFormatted: formatMoney(balance),
    lastPurchase: whenOf(lastDate),
    status: row?.isActive === false || row?.is_active === false ? "Inactive" : "Active",
  };
}
