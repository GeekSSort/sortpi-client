import { SaleRecord, SalesQueryFilter } from "@/types/sales";
import { initialSalesData } from "@/lib/services/sales.service";
import { apiList } from "./apiClient";
import { toSaleRecord } from "./mappers/sale";

export class SalesService {
  /**
   * Fetch paginated & filtered sales records
   */
  static async getSales(params?: SalesQueryFilter): Promise<{ data: SaleRecord[]; total: number }> {
    const fallback = () => {
      let result = [...initialSalesData];
      if (params?.search) {
        const q = params.search.toLowerCase();
        result = result.filter(
          (s) =>
            s.customerName.toLowerCase().includes(q) ||
            s.invoiceNo.toLowerCase().includes(q) ||
            s.paymentMethod.toLowerCase().includes(q)
        );
      }
      if (params?.status) {
        result = result.filter((s) => s.status.toLowerCase() === params.status?.toLowerCase());
      }
      // The pager reads this, and it is now the real count: a hardcoded 50
      // meant the offline fallback claimed pages that did not exist.
      return { data: result, total: result.length };
    };

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
      fallback,
      toSaleRecord
    );
  }

  /**
   * Export sales records as CSV
   */
  static async exportSales(format: "csv" | "pdf" | "excel" = "csv"): Promise<void> {
    const csvContent =
      "data:text/csv;charset=utf-8," +
      ["Invoice No,Date,Customer,Total Amount,Payment Method,Status"]
        .concat(
          initialSalesData.map(
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
}
