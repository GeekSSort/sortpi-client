import { SaleRecord, SalesQueryFilter } from "@/types/sales";
import { apiFetch, apiList, toAmount } from "./apiClient";
import { toSaleRecord } from "./mappers/sale";
import { invalidate } from "@/lib/query/useQuery";

/**
 * The one rate every line was taxed at, or null when they differ.
 *
 * The API sends `tax_rate` as a fraction (0.0800 for 8%). Rounded to two
 * decimal places before comparing, so lines that agree to the paisa are not
 * reported as disagreeing over floating-point dust.
 */
function singleTaxRate(items: any[]): number | null {
  const rates = items
    .map((it) => toAmount(it?.taxRate ?? it?.tax_rate))
    .filter((r) => Number.isFinite(r) && r > 0)
    .map((r) => Math.round(r * 10000) / 100);
  if (rates.length === 0) return null;
  return rates.every((r) => r === rates[0]) ? rates[0] : null;
}

/** `part` as a percentage of `whole`, to one decimal. Null when there is none. */
function percentOf(part: number, whole: number): number | null {
  if (!part || !whole) return null;
  return Math.round((part / whole) * 1000) / 10;
}

export interface SaleDetailLine {
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface SalePaymentDetail {
  id: string;
  paymentMethod: string;
  paymentProvider: string;
  amount: number;
  referenceNo: string;
}

export interface SaleDetail {
  id: string;
  invoiceNo: string;
  saleDate: string;
  customerName: string;
  cashierName: string;
  branchName: string;
  paymentMethod: string;
  referenceNo?: string;
  transactionId?: string;
  payments?: SalePaymentDetail[];
  status: string;
  subtotal: number;
  discount: number;
  tax: number;
  grandTotal: number;
  paid: number;
  due: number;
  /**
   * The VAT rate this sale was rung at, as a percentage.
   *
   * Taken from the LINES, which each carry the rate that was applied, rather
   * than derived from the totals — a sale can mix rates, and dividing tax by
   * subtotal would then invent a rate that no line actually used. `null` when
   * the lines disagree or carry none, which the screen shows as no percentage
   * rather than a wrong one.
   */
  taxRatePercent: number | null;
  /** Discount as a percentage of the subtotal. `null` when there is none. */
  discountPercent: number | null;
  items: SaleDetailLine[];
}

export class SalesService {
  /**
   * Fetch paginated & filtered sales records
   */
  static async getSales(params?: SalesQueryFilter): Promise<{ data: SaleRecord[]; total: number }> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set("search", params.search);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.page) searchParams.set("page", String(params.page));
    // The API caps a page at 200 (StandardPagination.max_page_size); asking
    // for more than that just gets 200 back.
    searchParams.set("limit", String(params?.limit ?? 200));
    // The API names these date_from / date_to. Sending startDate silently
    // returned every sale, because an unknown query parameter is ignored.
    if (params?.startDate) searchParams.set("date_from", params.startDate);
    if (params?.endDate) searchParams.set("date_to", params.endDate);
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : "";

    return apiList<SaleRecord>(
      `/sales/${qs}`,
      { method: "GET" },
      toSaleRecord
    );
  }

  /**
   * Export sales records as CSV.
   *
   * The rows are fetched here rather than taken from anything held on screen:
   * the file used to be written from the bundled sample sales, so every export
   * a shop ever took away was somebody else's invoices.
   */
  // `format` is accepted for the call sites that already pass it; only CSV is
  // written today, so it is deliberately unread rather than removed.
  /**
   * One sale, with its lines.
   *
   * The list row carries a total and nothing else, which is why the Sales
   * screen's "Print receipt" could only reprint a header and a grand total —
   * a slip that looked nothing like the one handed over at the counter. The
   * detail endpoint has the items.
   */
  static async getSale(id: string): Promise<SaleDetail> {
    const row = await apiFetch<any>(`/sales/${id}/`, { method: "GET" });
    const paymentsList = Array.isArray(row?.payments) ? row.payments : [];
    let refNo = "";
    let method = "";
    if (paymentsList.length > 0) {
      const largest = paymentsList.reduce((a: any, b: any) =>
        toAmount(b?.amount) > toAmount(a?.amount) ? b : a
      );
      const provider = largest?.payment_provider || largest?.paymentProvider;
      if (provider && typeof provider === "string" && provider.trim()) {
        method = provider.trim();
      } else {
        const rawMethod = String(
          largest?.payment_method || largest?.paymentMethod || largest?.method || ""
        ).toUpperCase();
        const labels: Record<string, string> = {
          CASH: "Cash",
          CARD: "Card",
          BANK: "Bank Transfer",
          MOBILE: "bKash",
        };
        method = labels[rawMethod] || rawMethod || "Cash";
      }
      for (const p of paymentsList) {
        const r = p?.reference_no || p?.referenceNo || p?.transaction_id || p?.transactionId;
        if (r && typeof r === "string" && r.trim()) {
          refNo = r.trim();
          break;
        }
      }
    }
    if (!refNo && row?.note) {
      const m = String(row.note).match(/Txn:\s*([^\s,;]+)/i);
      if (m && m[1]) refNo = m[1];
    }

    return {
      id: String(row?.id ?? id),
      invoiceNo: String(row?.invoiceNumber ?? row?.invoice_number ?? ""),
      saleDate: String(row?.saleDate ?? row?.sale_date ?? ""),
      customerName: String(row?.customerName ?? row?.customer_name ?? "Walk-in Customer"),
      cashierName: String(row?.cashierName ?? row?.cashier_name ?? ""),
      branchName: String(row?.branchName ?? row?.branch_name ?? ""),
      paymentMethod: method || "Cash",
      referenceNo: refNo,
      transactionId: refNo,
      status: String(row?.status ?? ""),
      subtotal: toAmount(row?.subtotal),
      discount: toAmount(row?.discountAmount ?? row?.discount_amount),
      tax: toAmount(row?.taxAmount ?? row?.tax_amount),
      grandTotal: toAmount(row?.grandTotal ?? row?.grand_total),
      paid: toAmount(row?.paidAmount ?? row?.paid_amount),
      due: toAmount(row?.dueAmount ?? row?.due_amount),
      taxRatePercent: singleTaxRate(row?.items ?? []),
      discountPercent: percentOf(
        toAmount(row?.discountAmount ?? row?.discount_amount),
        toAmount(row?.subtotal)
      ),
      items: (row?.items ?? []).map((it: any) => ({
        name: String(it?.productName ?? it?.product_name ?? it?.sku ?? ""),
        sku: String(it?.sku ?? ""),
        quantity: toAmount(it?.quantity),
        unitPrice: toAmount(it?.unitPrice ?? it?.unit_price),
        lineTotal: toAmount(it?.lineTotal ?? it?.line_total),
      })),
      payments: paymentsList.map((p: any) => ({
        id: String(p?.id ?? ""),
        paymentMethod: String(p?.payment_method ?? p?.paymentMethod ?? ""),
        paymentProvider: String(p?.payment_provider ?? p?.paymentProvider ?? ""),
        amount: toAmount(p?.amount),
        referenceNo: String(p?.reference_no ?? p?.referenceNo ?? ""),
      })),
    };
  }

  static async exportSales(_format: "csv" | "pdf" | "excel" = "csv"): Promise<void> {
    const { data: sales } = await SalesService.getSales();

    const csvContent =
      "data:text/csv;charset=utf-8," +
      ["Invoice No,Date,Customer,Total Amount,Payment Method,Status"]
        .concat(
          sales.map(
            (s) =>
              `${s.invoiceNo},${s.dateTime},${s.customerName},${s.totalAmount},${s.paymentMethod},${s.status}`
          )
        )
        .join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `sales_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Cancel and refund a sale.
   *
   * Calls POST /sales/{id}/cancel/, which restores inventory stock, reverses customer
   * debt in ledger, and updates the sale status to CANCELLED (mapped to Refunded on client).
   */
  static async refundSale(id: string, reason = "Customer requested refund"): Promise<SaleRecord> {
    const row = await apiFetch<any>(`/sales/${id}/cancel/`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    invalidate("sales");
    return toSaleRecord(row);
  }
}
