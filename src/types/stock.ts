export interface StockItem {
  id: string;
  /** The product variant this balance is for — what an adjustment names. */
  variantId?: string;
  /** The warehouse id, as opposed to `warehouse`, which is its readable code. */
  warehouseId?: string;
  name: string;
  /**
   * WHICH variant this balance is for — "500ml".
   *
   * A Stock row is keyed on variant + warehouse, so a product sold in three
   * sizes is three rows all reading "Coca-Cola", told apart by nothing but the
   * SKU — a code, not a name. Empty for a product with one unnamed variant,
   * which is the same rule the till's tiles follow.
   */
  variantLabel: string;
  image: string;
  sku: string;
  warehouse: string;
  /** What is ON THE SHELF. `available` is this minus what is spoken for, and
      counting against that would write the reserved units off the moment
      anything reserves any. */
  quantity: number;
  available: number;
  reserved: number;
  lowStock: number;
  /** The weighted average this line was bought at, or 0 when the line has
      never held stock — and also 0 for a caller without
      `inventory.view_valuation`, who does not get the key at all. Zero is the
      signal that a first count has to state what the units cost. */
  averageCost: number;
  status: "In Stock" | "Low Stock" | "Out of Stock";
}

export interface StockQueryFilter {
  /** in | low | out. Narrows to what the shelf is doing. */
  stockStatus?: string;
  search?: string;
  warehouse?: string;
  status?: string;
  page?: number;
  limit?: number;
  /** List the CATALOGUE against one warehouse rather than that warehouse's
      ledger rows, so a product it has never held comes back at zero instead of
      not coming back at all. Needs a resolvable warehouse — the named one, or
      the active branch's MAIN — and 400s `WAREHOUSE_REQUIRED` without one.
      NOT for the transfer picker, which asks for a page of 200 and would lose
      everything past the 200th name. */
  includeUnstocked?: boolean;
}

