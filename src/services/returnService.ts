import {
  ReturnRecord,
  ReturnQueryFilter,
  ReturnableSale,
  CreateReturnPayload,
} from "@/types/returns";
import { apiFetch, apiList, toAmount } from "./apiClient";
import { toReturnRecord } from "./mappers/returns";
import { invalidate } from "@/lib/query/useQuery";

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
   * `search`, `refund_method` and the dates are applied by the API. They used
   * to be sent and ignored, so the search box changed nothing.
   *
   * The API lists CONFIRMED refunds only, so a refund withdrawn from the Sales
   * screen drops out of here on the next fetch — and `withdrawReturn` below
   * invalidates "returns", so that fetch happens immediately.
   */
  static async getReturns(params?: ReturnQueryFilter): Promise<{ data: ReturnRecord[]; total: number }> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set("search", params.search);
    if (params?.refundMethod) searchParams.set("refund_method", params.refundMethod);
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
      toReturnRecord
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
      { method: "GET" });

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
      // The LIVE settlement, which is what a refund is measured against — the
      // tender at the till plus anything collected since, less what a previous
      // return credited back. `paidAmount` beside it is frozen at the moment
      // the sale was rung up and never moves again.
      settledAmount: toAmount(row.settledAmount ?? row.settled_amount ?? row.paidAmount),
      outstandingAmount: toAmount(row.outstandingAmount ?? row.outstanding_amount ?? row.dueAmount),
      items: (Array.isArray(row.items) ? row.items : []).map((item: any) => ({
        id: String(item?.id ?? ""),
        sku: String(item?.sku ?? ""),
        name: String(item?.productName ?? item?.sku ?? "Item"),
        quantity: toAmount(item?.quantity),
        // Absent for an older sale serialized before the field existed; the
        // quantity sold is then the only ceiling we know of.
        returnable: item?.returnable == null ? toAmount(item?.quantity) : toAmount(item.returnable),
        unitPrice: toAmount(item?.unitPrice ?? item?.unit_price),
        // What the line was CHARGED, which is what a refund gives back.
        // Falls back to the shelf price for a response from before the field
        // was carried here — right for an undiscounted line, which is most of
        // them, and no worse than what this screen did before.
        lineTotal:
          item?.lineTotal ?? item?.line_total
            ? toAmount(item?.lineTotal ?? item?.line_total)
            : toAmount(item?.unitPrice ?? item?.unit_price) * toAmount(item?.quantity),
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
      toReturnRecord
    );
  }

  /**
   * Undo a refund.
   *
   * The goods come back off the shelf and the money goes back on the books. A
   * return written against a still-completed sale has its own credit reversed;
   * the auto-return of a cancelled sale reinstates that sale instead — the
   * server decides which from the books, not from the sale's status.
   *
   * Refused when the goods have since been sold to somebody else. The error
   * names every SKU that is short, which is the only thing the operator can
   * act on.
   */
  static async withdrawReturn(id: string, reason = ""): Promise<ReturnRecord> {
    const row = await apiFetch<any>(`/returns/${id}/withdraw/`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    // The goods came back off the shelf and the money went back on the books,
    // so the stock screens and the customer's balance moved with it — not just
    // these two lists.
    invalidate("returns", "sales", "stock", "inventory", "customers", "pos-products");
    return toReturnRecord(row);
  }

  /** The refunds recorded against one invoice, newest first. */
  static async getReturnsForInvoice(invoiceNo: string): Promise<ReturnRecord[]> {
    const page = await ReturnService.getReturns({ search: invoiceNo, limit: 20 });
    return page.data.filter((r) => r.invoiceNo === invoiceNo);
  }
}
