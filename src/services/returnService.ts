import {
  ReturnRecord,
  ReturnQueryFilter,
  ReturnableSale,
  CreateReturnPayload,
} from "@/types/returns";
import { initialReturnsData } from "@/lib/services/returns.service";
import { apiFetch, apiList, toAmount } from "./apiClient";
import { toReturnRecord } from "./mappers/returns";

/**
 * Returns, against the endpoints that exist.
 *
 * A return is written by `POST /sales/{id}/returns/`, which puts the stock
 * back and refunds at the originally stamped cost. There is no
 * `/returns/refund` — an earlier version posted there, and because the
 * request 404'd into a fallback the screen reported a refund that never
 * happened.
 */
export class ReturnService {
  /**
   * Fetch returns with search and filters.
   *
   * `search`, `status` and the dates are applied by the API. They used to be
   * sent and ignored, so the search box changed nothing.
   */
  static async getReturns(params?: ReturnQueryFilter): Promise<{ data: ReturnRecord[]; total: number }> {
    const fallback = () => {
      let list = [...initialReturnsData];
      if (params?.search) {
        const q = params.search.toLowerCase();
        list = list.filter(
          (r) =>
            r.customerName.toLowerCase().includes(q) ||
            r.invoiceNo.toLowerCase().includes(q) ||
            r.returnNo.toLowerCase().includes(q)
        );
      }
      if (params?.status) {
        list = list.filter((r) => r.status.toLowerCase() === params.status?.toLowerCase());
      }
      return { data: list, total: list.length };
    };

    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set("search", params.search);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.startDate) searchParams.set("date_from", params.startDate);
    if (params?.endDate) searchParams.set("date_to", params.endDate);
    // The API caps a page at 200 (StandardPagination.max_page_size), so asking
    // for more than that just gets 200 back.
    searchParams.set("limit", String(params?.limit ?? 200));
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : "";

    return apiList<ReturnRecord>(
      `/returns/${qs}`,
      { method: "GET" },
      fallback,
      (row: any) => (row?.returnNo !== undefined ? row : toReturnRecord(row))
    );
  }

  /**
   * Find a sale by invoice number, with the lines that may still be returned.
   *
   * `returnable` is the server's own figure — the quantity sold minus what has
   * already come back — so a line returned twice cannot be refunded twice.
   */
  static async findSaleByInvoice(invoiceNo: string): Promise<ReturnableSale | null> {
    const query = invoiceNo.trim();
    if (!query) return null;

    const res = await apiList<any>(
      `/sales/?search=${encodeURIComponent(query)}&limit=10`,
      { method: "GET" },
      { data: [], total: 0 }
    );

    const wanted = query.toLowerCase();
    const row =
      res.data.find((s: any) => String(s?.invoiceNumber ?? "").toLowerCase() === wanted) ??
      res.data[0];
    if (!row) return null;

    return {
      id: String(row.id ?? ""),
      invoiceNo: String(row.invoiceNumber ?? ""),
      customerName: String(row.customerName ?? "Walk-in Customer"),
      saleDate: String(row.saleDate ?? ""),
      grandTotal: toAmount(row.grandTotal),
      items: (Array.isArray(row.items) ? row.items : []).map((item: any) => ({
        id: String(item?.id ?? ""),
        sku: String(item?.sku ?? ""),
        name: String(item?.productName ?? item?.sku ?? "Item"),
        quantity: toAmount(item?.quantity),
        // Absent for an older sale serialized before the field existed; the
        // quantity sold is then the only ceiling we know of.
        returnable: item?.returnable == null ? toAmount(item?.quantity) : toAmount(item.returnable),
        unitPrice: toAmount(item?.unitPrice ?? item?.unit_price),
      })),
    };
  }

  /**
   * Record a return against a sale and refund it.
   *
   * Nothing here is priced by the caller: the server refunds at the price and
   * cost stamped on the original line, so the body carries quantities only.
   */
  static async createReturn(saleId: string, payload: CreateReturnPayload): Promise<ReturnRecord> {
    const body = {
      reference_no: payload.referenceNo,
      return_date: payload.returnDate,
      refund_method: payload.refundMethod,
      reason: payload.reason || "",
      items: payload.items.map((line) => ({
        sale_item_id: line.saleItemId,
        quantity: line.quantity,
      })),
    };

    return apiFetch<ReturnRecord>(
      `/sales/${saleId}/returns/`,
      { method: "POST", body: JSON.stringify(body) },
      undefined,
      toReturnRecord
    );
  }
}
