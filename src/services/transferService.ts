import { TransferRecord, TransferQueryFilter, CreateTransferPayload } from "@/types/transfers";
import { apiFetch, apiList } from "./apiClient";
import { toTransferRecord } from "./mappers/transfer";
import { BranchService } from "./branchService";

/**
 * Stock transfers, against the endpoints that exist.
 *
 * A transfer moves in two halves and four movements: `dispatch` takes stock out
 * of the source into a TRANSIT warehouse, and `receive` takes it out of transit
 * into the destination. Both were on the API from the start with nothing on the
 * screen able to call them, so a transfer could be drafted and then never move.
 */
/** One end of a transfer: a warehouse, and which branch it belongs to. */
export interface TransferEndpoint {
  id: string;
  name: string;
  branchId: string;
  /** MAIN or TRANSIT. A transfer never names a TRANSIT warehouse — the
      dispatch step moves stock into one on its own. */
  type: string;
}

export class TransferService {
  /**
   * Fetch transfer records with search and filters.
   *
   * `search` and `status` are applied by the API. They used to be sent and
   * ignored, so the search box changed nothing.
   */
  static async getTransfers(params?: TransferQueryFilter): Promise<{ data: TransferRecord[]; total: number }> {
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
      toTransferRecord
    );
  }

  /**
   * The two ends a transfer can name.
   *
   * Labelled by BRANCH first, because that is how a shop thinks about where
   * stock is going: "Chattogram", not "CTG-MAIN". A warehouse code on its own
   * told a storeman nothing about which shop it belonged to, and the two ends
   * of a transfer are exactly the question "which shop".
   *
   * Only what the caller can see: `/warehouses/` is branch-scoped, so a user
   * assigned to one branch is offered that branch's warehouses and no others.
   */
  static async getWarehouses(): Promise<TransferEndpoint[]> {
    const [res, branches] = await Promise.all([
      apiList<any>("/warehouses/?limit=200", { method: "GET" }, (r) => r),
      // One short request, shared with the branch switcher's cache entry.
      BranchService.list().catch(() => [] as { id: string; name: string; code: string }[]),
    ]);
    const branchNames = new Map(branches.map((b) => [b.id, b.name || b.code]));

    return res.data
      .filter((w: any) => w?.id)
      .map((w: any) => {
        const branchId = String(w?.branch ?? "");
        const branch = branchNames.get(branchId) || "";
        const code = String(w?.code ?? "");
        return {
          id: String(w.id),
          branchId,
          type: String(w?.type ?? ""),
          // "Dhaka — DHK-MAIN". The code stays, because it is what is printed
          // on the shelf and on the transfer note.
          name: [branch, code || w?.name].filter(Boolean).join(" — ") || String(w.id),
        };
      });
  }

  /**
   * Draft a transfer.
   *
   * Nothing moves yet — the created record is a DRAFT, and `dispatch` is what
   * takes the stock off the source shelf. The screen used to build a record in
   * local state and call it saved.
   */
  static async createTransfer(
    payload: CreateTransferPayload,
    /** The SOURCE branch, when it is not the one the caller is standing in.
        `perform_create` checks the caller may move stock out of the source
        warehouse, and that check reads the active branch — so drafting an
        inbound transfer has to say which branch it is drafting on behalf of.
        The header is refused for a branch the caller is not assigned to. */
    sourceBranchId?: string
  ): Promise<TransferRecord> {
    const created = await apiFetch<any>("/inventory/transfers/", {
      method: "POST",
      ...(sourceBranchId ? { branchId: sourceBranchId } : {}),
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
    return apiFetch<any>(`/inventory/transfers/${id}/dispatch/`, { method: "POST" }, toTransferRecord);
  }

  /**
   * Transit → source. The van turned round.
   *
   * A REVERSING pair of movements, never a deletion: the ledger is
   * insert-only, so a dispatch made by mistake and undone two minutes later
   * stays in the history as both things that happened. The transfer goes back
   * to DRAFT, so it can be corrected and sent again.
   *
   * DISPATCHED only. Once anything has been received the units are on another
   * branch's shelf and the API answers 409.
   */
  static async undoDispatch(id: string): Promise<TransferRecord> {
    return apiFetch<any>(
      `/inventory/transfers/${id}/undo-dispatch/`,
      { method: "POST" },
      toTransferRecord
    );
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
      toTransferRecord
    );
  }
}
