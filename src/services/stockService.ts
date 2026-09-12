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
    // in | low | out — the three states the Stock screen shows.
    if (params?.stockStatus) searchParams.set("stock_status", params.stockStatus);
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
   * What one line holds RIGHT NOW, read fresh.
   *
   * The stock list a screen is holding was fetched when the screen opened, and
   * a till goes on selling while somebody fills in a form. Anything that turns
   * "add 10" into an absolute count has to compute it from the live figure, not
   * from a list that may be minutes old.
   *
   * Returns null when the warehouse has never held the line — which is a real
   * answer, not a failure: it means zero, and the caller has to state a cost.
   */
  static async liveLine(variantId: string, warehouseId: string): Promise<StockItem | null> {
    const rows = await apiList<StockItem>(
      `/inventory/stock/?variant=${encodeURIComponent(variantId)}&warehouse=${encodeURIComponent(
        warehouseId
      )}&limit=1`,
      { method: "GET" },
      toStockItem
    );
    return rows.data[0] ?? null;
  }

  /**
   * Count a line to a new quantity.
   *
   * One request: `POST /inventory/adjustments/` with `apply`, which drafts and
   * applies inside a single transaction. Applying recomputes the difference
   * against the balance AT THAT MOMENT rather than trusting the draft, so a
   * count drafted this morning cannot post the day's sales into the ledger a
   * second time.
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
    /** Set by a caller that meant a RELATIVE change — "ten more arrived",
        spelled as an absolute count because that is what the endpoint takes.
        The API then refuses with `ADJUSTMENT_STOCK_MOVED` if the shelf moved,
        instead of driving stock to a number computed against a balance that no
        longer exists and undoing whatever moved it. A genuine shelf count
        leaves it off: the counted number wins. */
    expectUnchanged?: boolean;
    /** What the caller SAW on the shelf when it worked `newQuantity` out.
        Required for `expectUnchanged` to mean anything — the server cannot
        infer it, because by the time it reads the balance it is reading the
        same number it would be comparing against. */
    expectedQuantity?: number;
  }): Promise<void> {
    /**
     * ONE request, not two.
     *
     * This used to draft the adjustment and then apply it in a second call, and
     * nothing could make those atomic from here: if the apply failed — the
     * network dropped, the balance had moved, the token expired — the draft was
     * left behind in a queue no screen lists and no endpoint can delete, since
     * an adjustment is deliberately not deletable. Every stock-in from this
     * form and from the till was that pair, so the orphans accumulated at
     * exactly the rate people counted stock.
     *
     * `apply` makes the server do both inside one transaction: either the
     * movements are written or nothing is.
     */
    await apiFetch<any>("/inventory/adjustments/", {
      method: "POST",
      body: JSON.stringify({
        reference_no: input.referenceNo,
        warehouse: input.warehouseId,
        reason: input.reason,
        note: input.note || "",
        apply: true,
        expect_unchanged: !!input.expectUnchanged,
        items: [
          {
            variant: input.variantId,
            new_quantity: input.newQuantity,
            ...(input.expectedQuantity != null
              ? { expected_quantity: input.expectedQuantity }
              : {}),
            ...(input.unitCost != null ? { unit_cost: input.unitCost } : {}),
          },
        ],
      }),
    });
  }
}
