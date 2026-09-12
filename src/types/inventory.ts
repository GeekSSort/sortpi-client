export interface InventoryProduct {
  id: string;
  /** The default variant. The till keys everything — prices, offers, stock —
      by variant, so a product id alone cannot be matched against them. */
  variantId: string;
  index: string;
  name: string;
  /**
   * WHICH variant this row is — "500ml".
   *
   * On the products LIST this is the default variant's, and usually empty. On
   * a picker built with `toInventoryVariants` it is the one being picked, and
   * it is the only thing telling three "Coca-Cola" rows apart.
   */
  variantLabel: string;
  /** How many sellable variants the product has. 1 for an ordinary product. */
  variantCount: number;
  image: string;
  category: "Electronics" | "Home & Living" | "Accessories" | "Footwear" | "Bags";
  brand: string;
  price: number;
  priceFormatted: string;
  stock: number;
  sku: string;
  /** The variant's primary barcode, "" when it has none. What the shelf label
      prints and what the till scans. */
  barcode: string;
  status: "In Stock" | "Low Stock" | "Out of Stock";
}

export interface InventoryQueryFilter {
  search?: string;
  category?: string;
  brand?: string;
  status?: string;
  page?: number;
  limit?: number;
}

