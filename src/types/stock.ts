export interface StockItem {
  id: string;
  /** The product variant this balance is for — what an adjustment names. */
  variantId?: string;
  /** The warehouse id, as opposed to `warehouse`, which is its readable code. */
  warehouseId?: string;
  name: string;
  image: string;
  sku: string;
  warehouse: string;
  available: number;
  reserved: number;
  lowStock: number;
  status: "In Stock" | "Low Stock" | "Out of Stock";
}

export interface StockQueryFilter {
  search?: string;
  warehouse?: string;
  status?: string;
  page?: number;
  limit?: number;
}

