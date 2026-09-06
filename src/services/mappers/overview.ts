import { CustomerListItem, OrderListItem, SalesOverviewItem } from "@/types/overview";
import { toAmount } from "../apiClient";
import { formatMoney } from "@/lib/format";
import { toSaleRecord } from "./sale";

/**
 * The dashboard's pop-out panels, built from the ordinary lists: sales from
 * /sales/, orders from /purchases/, customers from /customers/. The
 * `/ceo-overview/...` endpoints they used to call never existed.
 */

export function toSalesOverviewItem(row: any): SalesOverviewItem {
  const sale = toSaleRecord(row);
  return {
    id: sale.id,
    invoiceNo: sale.invoiceNo,
    dateTime: sale.dateTime,
    customer: sale.customerName,
    totalAmount: sale.totalAmount,
    totalAmountFormatted: sale.totalAmountFormatted,
    paymentMethod: sale.paymentMethod,
    // This panel only distinguishes settled from not.
    status: sale.status === "Paid" ? "Paid" : "Unpaid",
  };
}

export function toOrderListItem(row: any): OrderListItem {
  const total = toAmount(row?.grandTotal);
  const due = toAmount(row?.dueAmount);
  const status = String(row?.status || "").toUpperCase();
  return {
    id: String(row?.id ?? ""),
    purchaseId: String(row?.referenceNo ?? ""),
    supplier: { name: String(row?.supplierName ?? "—") },
    purchaseDate: String(row?.purchaseDate ?? ""),
    items: Array.isArray(row?.items) ? row.items.length : 0,
    totalAmount: total,
    totalAmountFormatted: formatMoney(total),
    paymentStatus: due > 0 ? "Due" : "Paid",
    // The server has more states than the panel shows — RECEIVED is the only
    // one that means the goods arrived, so everything else reads as pending.
    status: status === "RECEIVED" ? "Received" : "Pending",
  };
}

const CUSTOMER_TYPE: Record<string, CustomerListItem["type"]> = {
  REGULAR: "Regular",
  VIP: "VIP",
  PREMIUM: "Premium",
  WHOLESALE: "Premium",
};

export function toCustomerListItem(row: any): CustomerListItem {
  // `current_balance` is what they owe. The server has no lifetime-spend
  // figure, so `totalSpent` stays 0 rather than showing the balance under a
  // heading that means something else.
  const due = toAmount(row?.currentBalance);
  return {
    id: String(row?.id ?? ""),
    customerId: String(row?.code ?? ""),
    customer: String(row?.name ?? ""),
    phone: String(row?.phone ?? ""),
    type: CUSTOMER_TYPE[String(row?.customerType || "").toUpperCase()] || "Regular",
    order: 0,
    totalSpent: 0,
    totalSpentFormatted: formatMoney(0),
    due,
    dueFormatted: formatMoney(due),
    status: row?.isActive === false ? "Inactive" : "Active",
  };
}
