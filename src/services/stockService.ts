import { StockItem, StockQueryFilter } from "@/types/stock";
import { apiFetch, apiList } from "./apiClient";
import { toStockItem } from "./mappers/inventory";

/**
 * The API's `AdjustmentReason` choices, verbatim.
 *
 * Spelled out as a union rather than left as `string`, because the screen was
 * sending "STOCK_IN" and "STOCK_OUT" — words this API has never accepted — and
 * a plain `string` parameter had nothing to say about it. Every count 400'd on
 * `reason` and the row silently put its old number back.
 */
export type AdjustmentReason = "COUNT" | "DAMAGE" | "EXPIRY" | "THEFT" | "CORRECTION";

export class StockService {
  /**
   * Fetch stock inventory with search & filter
   */
  static async getStock(
    params?: StockQueryFilter,
    /** Read as if standing in this branch, for this request only. The stock
        list is branch-scoped, so drafting a transfer OUT of another branch
        needs to see that branch's shelf. `X-Branch` is refused for a branch the
        caller is not assigned to, so this widens nothing. */
    branchId?: string
  ): Promise<{ data: StockItem[]; total: number }> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set("search", params.search);
    if (params?.warehouse) searchParams.set("warehouse", params.warehouse);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.includeUnstocked) searchParams.set("include_unstocked", "true");
    // The API caps a page at 200 (StandardPagination.max_page_size); asking
    // for more than that just gets 200 back.
    searchParams.set("limit", String(params?.limit ?? 200));
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : "";

    return apiList<StockItem>(
      `/inventory/stock/${qs}`,
      { method: "GET", ...(branchId ? { branchId } : {}) },
      toStockItem
    );
  }

  /**
   * Count a line to a new quantity.
   *
   * Two steps, because that is what the API is: `POST /inventory/adjustments/`
   * drafts a count, and `{id}/apply/` writes the movements. Applying
   * recomputes the difference against the balance AT THAT MOMENT rather than
   * trusting the draft, so a count drafted this morning cannot post the day's
   * sales into the ledger a second time.
   *
   * `newQuantity` is a COUNT, not a delta — the endpoint takes what is on the
   * shelf, and the service works out the movement.
   *
   * The old version posted `{productName, sku, warehouse, currentStock,
   * addQuantity}` to this path. Nothing there matches the serializer, so the
   * request 400'd into a fallback and the screen reported stock it never
   * added.
   */
  static async adjustStock(input: {
    warehouseId: string;
    variantId: string;
    newQuantity: number;
    referenceNo: string;
    reason: AdjustmentReason;
    note?: string;
    /** What each unit cost. REQUIRED when the line is empty: an empty line has
        no weighted average for the new units to inherit, and the API refuses
        the apply with `ADJUSTMENT_COST_REQUIRED` rather than let COGS on the
        first sale be computed against zero. */
    unitCost?: number;
  }): Promise<void> {
    const draft = await apiFetch<any>("/inventory/adjustments/", {
      method: "POST",
      body: JSON.stringify({
        reference_no: input.referenceNo,
        warehouse: input.warehouseId,
        reason: input.reason,
        note: input.note || "",
        items: [
          {
            variant: input.variantId,
            new_quantity: input.newQuantity,
            ...(input.unitCost != null ? { unit_cost: input.unitCost } : {}),
          },
        ],
      }),
    });

    const id = String(draft?.id ?? "");
    if (!id) throw new Error("The adjustment was not created.");
    await apiFetch<any>(`/inventory/adjustments/${id}/apply/`, { method: "POST" });
  }
}
