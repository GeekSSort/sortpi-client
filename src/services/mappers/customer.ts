import { CustomerRecord } from "@/types/customer";
import { toAmount } from "../apiClient";
import { formatMoney } from "@/lib/format";

/**
 * Customer -> a row in the customers table.
 *
 * The names differ on each side: the API says `code` and `current_balance`,
 * the table wants `customerId` and `dueAmount`. Without this only name and
 * phone showed, because those two happen to match.
 *
 * Orders and total spent come from the API, which annotates them onto the list
 * with a single aggregate. They used to be summed in the browser from a
 * separate fetch of the sales list -- which the API caps at 200 rows, so every
 * figure on the screen was really "of the last 200 sales in the shop".
 */

const TYPE: Record<string, CustomerRecord["type"]> = {
  RETAIL: "Regular",
  WHOLESALE: "Premium",
  VIP: "VIP",
};

export interface SalesTotals {
  orders: number;
  spent: number;
}

/**
 * `totals` is a fallback for callers that still have their own figures (the
 * bundled sample data). The server's own annotation wins when it is present.
 */
export function toCustomerRecord(row: any, totals?: SalesTotals): CustomerRecord {
  const due = toAmount(row?.currentBalance ?? row?.current_balance);
  const annotatedSpent = row?.totalSpent ?? row?.total_spent;
  const annotatedOrders = row?.orderCount ?? row?.order_count;
  const spent = annotatedSpent != null ? toAmount(annotatedSpent) : (totals?.spent ?? 0);
  const orders = annotatedOrders != null ? Number(annotatedOrders) || 0 : (totals?.orders ?? 0);
  return {
    id: String(row?.id ?? ""),
    customerId: String(row?.code || "—"),
    name: String(row?.name || "—"),
    phone: String(row?.phone || "—"),
    email: String(row?.email || "—"),
    type: TYPE[String(row?.customerType ?? row?.customer_type ?? "").toUpperCase()] ?? "Regular",
    orderCount: orders,
    totalSpent: spent,
    totalSpentFormatted: formatMoney(spent),
    dueAmount: due,
    dueAmountFormatted: formatMoney(due),
    status: row?.isActive === false || row?.is_active === false ? "Inactive" : "Active",
  };
}

/** Sales added up per customer, for those two columns. */
export function salesTotals(sales: any[]): Map<string, SalesTotals> {
  const out = new Map<string, SalesTotals>();
  for (const sale of sales || []) {
    const key = String(sale?.customer ?? sale?.customerId ?? "");
    if (!key) continue;
    const found = out.get(key) || { orders: 0, spent: 0 };
    found.orders += 1;
    found.spent += toAmount(sale?.grandTotal ?? sale?.grand_total);
    out.set(key, found);
  }
  return out;
}
