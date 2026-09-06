import { TransferRecord, TransferQueryFilter, CreateTransferPayload } from "@/types/transfers";
import { initialTransfersData } from "@/lib/services/transfers.service";
import { apiFetch, apiList } from "./apiClient";
import { toTransferRecord } from "./mappers/transfer";

/**
 * Stock transfers, against the endpoints that exist.
 *
 * A transfer moves in two halves and four movements: `dispatch` takes stock out
 * of the source into a TRANSIT warehouse, and `receive` takes it out of transit
 * into the destination. Both were on the API from the start with nothing on the
 * screen able to call them, so a transfer could be drafted and then never move.
 */
export class TransferService {
  /**
   * Fetch transfer records with search and filters.
   *
   * `search` and `status` are applied by the API. They used to be sent and
   * ignored, so the search box changed nothing.
   */
  static async getTransfers(params?: TransferQueryFilter): Promise<{ data: TransferRecord[]; total: number }> {
    const fallback = () => {
      let list = [...initialTransfersData];
      if (params?.search) {
        const q = params.search.toLowerCase();
        list = list.filter(
          (t) =>
            t.transferId.toLowerCase().includes(q) ||
            t.fromLocation.toLowerCase().includes(q) ||
            t.toLocation.toLowerCase().includes(q) ||
            t.productsSummary.toLowerCase().includes(q)
        );
      }
      if (params?.status) {
        list = list.filter((t) => t.status.toLowerCase() === params.status?.toLowerCase());
      }
      // The pager reads this, and it is now the real count: a hardcoded 50
      // meant the offline fallback claimed pages that did not exist.
      return { data: list, total: list.length };
    };

    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set("search", params.search);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.startDate) searchParams.set("date_from", params.startDate);
    if (params?.endDate) searchParams.set("date_to", params.endDate);
    if (params?.page) searchParams.set("page", String(params.page));
    // The API caps a page at 200 (StandardPagination.max_page_size); asking
    // for more than that just gets 200 back.
    searchParams.set("limit", String(params?.limit ?? 200));
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : "";

    return apiList<TransferRecord>(
      `/inventory/transfers/${qs}`,
      { method: "GET" },
      fallback,
      (row: any) => (row?.transferId !== undefined ? row : toTransferRecord(row))
    );
  }

  /** The two ends a transfer can name. */
  static async getWarehouses(): Promise<{ id: string; name: string }[]> {
    const res = await apiList<any>(
      "/warehouses/?limit=200",
      { method: "GET" },
      { data: [], total: 0 },
      (r) => r
    );
    return res.data
      .filter((w: any) => w?.id)
      .map((w: any) => ({
        id: String(w.id),
        // The code is what a storeman says out loud; the name is the label.
        name: [w?.code, w?.name].filter(Boolean).join(" — ") || String(w.id),
      }));
  }

  /**
   * Draft a transfer.
   *
   * Nothing moves yet — the created record is a DRAFT, and `dispatch` is what
   * takes the stock off the source shelf. The screen used to build a record in
   * local state and call it saved.
   */
  static async createTransfer(payload: CreateTransferPayload): Promise<TransferRecord> {
    const created = await apiFetch<any>("/inventory/transfers/", {
      method: "POST",
      body: JSON.stringify({
        reference_no: payload.referenceNo,
        from_warehouse: payload.fromWarehouseId,
        to_warehouse: payload.toWarehouseId,
        note: payload.note || "",
        items: payload.items.map((line) => ({
          variant: line.variantId,
          quantity: line.quantity,
        })),
      }),
    });
    return toTransferRecord(created);
  }

  /** Source → transit. Takes the stock off the source shelf. */
  static async dispatchTransfer(id: string): Promise<TransferRecord> {
    return apiFetch<any>(`/inventory/transfers/${id}/dispatch/`, { method: "POST" }, undefined, toTransferRecord);
  }

  /**
   * Transit → destination.
   *
   * `lines` says what actually ARRIVED, which is not always what was sent.
   * Sending none accepts the dispatched quantities as they stand.
   */
  static async receiveTransfer(
    id: string,
    lines?: { itemId: string; quantity: number }[]
  ): Promise<TransferRecord> {
    return apiFetch<any>(
      `/inventory/transfers/${id}/receive/`,
      {
        method: "POST",
        body: JSON.stringify({
          lines: (lines || []).map((l) => ({ item: l.itemId, quantity: l.quantity })),
        }),
      },
      undefined,
      toTransferRecord
    );
  }
}
