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

export function toCustomerRecord(row: any): CustomerRecord {
  const due = toAmount(row?.currentBalance ?? row?.current_balance);
  // Absent on a row the API has not annotated — a customer who has bought
  // nothing, or a create response, both of which are honestly zero.
  const spent = toAmount(row?.totalSpent ?? row?.total_spent);
  const orders = Number(row?.orderCount ?? row?.order_count ?? 0) || 0;
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
