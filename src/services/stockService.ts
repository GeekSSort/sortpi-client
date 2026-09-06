import { StockItem, StockQueryFilter } from "@/types/stock";
import { initialStockData } from "@/lib/services/stock.service";
import { apiFetch, apiList } from "./apiClient";
import { toStockItem } from "./mappers/inventory";

export class StockService {
  /**
   * Fetch stock inventory with search & filter
   */
  static async getStock(params?: StockQueryFilter): Promise<{ data: StockItem[]; total: number }> {
    const fallback = () => {
      let list = [...initialStockData];
      if (params?.search) {
        const q = params.search.toLowerCase();
        list = list.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.sku.toLowerCase().includes(q) ||
            s.warehouse.toLowerCase().includes(q)
        );
      }
      if (params?.status) {
        list = list.filter((s) => s.status.toLowerCase() === params.status?.toLowerCase());
      }
      // The pager reads this, and it is now the real count: a hardcoded 50
      // meant the offline fallback claimed pages that did not exist.
      return { data: list, total: list.length };
    };

    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set("search", params.search);
    if (params?.warehouse) searchParams.set("warehouse", params.warehouse);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.page) searchParams.set("page", String(params.page));
    // The API caps a page at 200 (StandardPagination.max_page_size); asking
    // for more than that just gets 200 back.
    searchParams.set("limit", String(params?.limit ?? 200));
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : "";

    return apiList<StockItem>(
      `/inventory/stock/${qs}`,
      { method: "GET" },
      fallback,
      (row: any) => (row?.lowStock !== undefined ? row : toStockItem(row))
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
    reason: string;
    note?: string;
  }): Promise<void> {
    const draft = await apiFetch<any>("/inventory/adjustments/", {
      method: "POST",
      body: JSON.stringify({
        reference_no: input.referenceNo,
        warehouse: input.warehouseId,
        reason: input.reason,
        note: input.note || "",
        items: [{ variant: input.variantId, new_quantity: input.newQuantity }],
      }),
    });

    const id = String(draft?.id ?? "");
    if (!id) throw new Error("The adjustment was not created.");
    await apiFetch<any>(`/inventory/adjustments/${id}/apply/`, { method: "POST" });
  }
}
