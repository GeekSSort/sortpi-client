import { PurchaseRecord, PurchaseQueryFilter } from "@/types/purchases";
import { initialPurchasesData } from "@/lib/services/purchases.service";
import { apiFetch, apiList, toAmount } from "./apiClient";
import { toPurchaseRecord } from "./mappers/purchase";

export class PurchaseService {
  /**
   * Fetch purchase history records with search & filters
   */
  static async getPurchases(params?: PurchaseQueryFilter): Promise<{ data: PurchaseRecord[]; total: number }> {
    const fallback = () => {
      let list = [...initialPurchasesData];
      if (params?.search) {
        const q = params.search.toLowerCase();
        list = list.filter(
          (p) =>
            p.purchaseId.toLowerCase().includes(q) ||
            p.supplier.name.toLowerCase().includes(q) ||
            p.status.toLowerCase().includes(q) ||
            p.paymentStatus.toLowerCase().includes(q)
        );
      }
      if (params?.status) {
        list = list.filter((p) => p.status.toLowerCase() === params.status?.toLowerCase());
      }
      if (params?.paymentStatus) {
        list = list.filter((p) => p.paymentStatus.toLowerCase() === params.paymentStatus?.toLowerCase());
      }
      // The pager reads this, and it is now the real count: a hardcoded 50
      // meant the offline fallback claimed pages that did not exist.
      return { data: list, total: list.length };
    };

    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set("search", params.search);
    if (params?.status) searchParams.set("status", params.status);
    // `paymentStatus` is NOT sent: it is derived here from grand_total against
    // due_amount, and the API has no such field to filter on. Sending it was a
    // no-op the endpoint ignored.
    if (params?.supplier) searchParams.set("supplier", params.supplier);
    if (params?.startDate) searchParams.set("date_from", params.startDate);
    if (params?.endDate) searchParams.set("date_to", params.endDate);
    if (params?.page) searchParams.set("page", String(params.page));
    // The API caps a page at 200 (StandardPagination.max_page_size); asking
    // for more than that just gets 200 back.
    searchParams.set("limit", String(params?.limit ?? 200));
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : "";

    return apiList<PurchaseRecord>(
      `/purchases/${qs}`,
      { method: "GET" },
      fallback,
      // Unmapped, the supplier arrives as an id under a key the table reads as
      // an object, and every column but the date comes out blank.
      (row: any) => (row?.supplier?.name !== undefined ? row : toPurchaseRecord(row))
    );
  }

  /**
   * DRAFT → CONFIRMED. The order is placed; nothing has arrived yet.
   *
   * This and the three below were on the API from the start with nothing on
   * the screen able to call them, so "Mark received" and "Mark paid" changed a
   * row on screen and nothing else.
   */
  static async confirm(id: string): Promise<PurchaseRecord> {
    return apiFetch<any>(`/purchases/${id}/confirm/`, { method: "POST" }, undefined, toPurchaseRecord);
  }

  /**
   * Goods in. Writes the stock movements and the supplier ledger entry.
   *
   * Omitting `lines` receives everything still outstanding. Sending them and
   * leaving one out means that line got NOTHING — the opposite default would
   * let a clerk recording one line silently mark the whole order delivered.
   */
  static async receive(
    id: string,
    lines?: { itemId: string; quantity: number }[]
  ): Promise<PurchaseRecord> {
    return apiFetch<any>(
      `/purchases/${id}/receive/`,
      {
        method: "POST",
        body: JSON.stringify(
          lines ? { lines: lines.map((l) => ({ item: l.itemId, quantity: l.quantity })) } : {}
        ),
      },
      undefined,
      toPurchaseRecord
    );
  }

  /** Money out against what is owed on this order. */
  static async recordPayment(
    id: string,
    amount: number,
    method = "CASH",
    note = ""
  ): Promise<{ amount: number }> {
    const row = await apiFetch<any>(`/purchases/${id}/payments/`, {
      method: "POST",
      body: JSON.stringify({ amount, payment_method: method, note }),
    });
    return { amount: toAmount(row?.amount) };
  }

  /** Cancels the order. Received goods are not un-received by this. */
  static async cancel(id: string): Promise<PurchaseRecord> {
    return apiFetch<any>(`/purchases/${id}/cancel/`, { method: "POST" }, undefined, toPurchaseRecord);
  }
}
