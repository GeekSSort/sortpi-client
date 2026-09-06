import { InventoryProduct } from "@/types/inventory";
import { StockItem } from "@/types/stock";
import { toAmount } from "../apiClient";
import { formatMoney } from "@/lib/format";
import { safeImageUrl } from "./imageUrl";

/**
 * Catalogue and stock rows -> the inventory tables.
 *
 * Both used to show raw API rows, so category and brand appeared as ids and
 * price, stock, SKU and status were empty.
 *
 * Price and SKU sit on the product's default variant, not the product itself.
 * The category name, the brand name and the units on hand are now annotated
 * onto the row by the API. They used to need three more requests -- two lookup
 * tables and a crawl through every stock row in the shop, matched back by SKU
 * -- and the crawl stopped at 1200 rows, so anything past it read as empty
 * shelves.
 */

/** At or below this many units, a product counts as running out. */
const LOW_STOCK = 10;

function statusFor(available: number, reorder: number): StockItem["status"] {
  if (available <= 0) return "Out of Stock";
  return available <= Math.max(reorder, LOW_STOCK) ? "Low Stock" : "In Stock";
}

export function toInventoryProduct(row: any, index: number): InventoryProduct {
  const variants: any[] = Array.isArray(row?.variants) ? row.variants : [];
  const variant = variants.find((v) => v?.isDefault) || variants[0] || {};
  const sku = String(variant?.sku ?? "—");
  const price = toAmount(variant?.price);
  // The API's own figure, scoped to the branches the caller can see.
  const stock = toAmount(row?.stockOnHand ?? row?.stock_on_hand);

  const images: any[] = Array.isArray(row?.images) ? row.images : [];
  const ready = images.filter((i) => !i?.status || i.status === "READY");
  const primary = ready.find((i) => i?.isPrimary) ?? ready[0];
  const raw = String(primary?.url ?? primary ?? "");

  return {
    id: String(row?.id ?? ""),
    variantId: String(variant?.id ?? ""),
    index: String(index).padStart(2, "0"),
    name: String(row?.name || "—"),
    // Some filenames contain spaces; unencoded they break the request.
    image: raw ? safeImageUrl(raw) : "",
    // The UI type names five categories, the catalogue has twenty. The real
    // name is carried through and the table filters on it as a string.
    category: (row?.categoryName ||
      row?.category_name ||
      "Uncategorised") as InventoryProduct["category"],
    brand: row?.brandName || row?.brand_name || "—",
    price,
    priceFormatted: price > 0 ? formatMoney(price, { decimals: 2 }) : "No price",
    stock,
    sku,
    status: statusFor(stock, toAmount(row?.reorderLevel ?? row?.reorder_level)),
  };
}

export function toStockItem(row: any): StockItem {
  const available = toAmount(row?.available);
  const reorder = toAmount(row?.reorderLevel ?? row?.reorder_level);
  // Some filenames contain spaces; unencoded they break the request.
  const image = String(row?.productImage ?? row?.product_image ?? "");
  return {
    id: String(row?.id ?? ""),
    // The variant, not the stock row: an adjustment is written against it.
    variantId: String(row?.variant ?? ""),
    warehouseId: String(row?.warehouse ?? ""),
    name: String(row?.productName ?? row?.product_name ?? "—"),
    image: image ? safeImageUrl(image) : "",
    sku: String(row?.sku || "—"),
    // The warehouse comes back as an id and a code; the code is the readable one.
    warehouse: String(row?.warehouseCode ?? row?.warehouse_code ?? "—"),
    available,
    reserved: toAmount(row?.reservedQuantity ?? row?.reserved_quantity),
    lowStock: reorder || LOW_STOCK,
    averageCost: toAmount(row?.averageCost ?? row?.average_cost),
    status: statusFor(available, reorder),
  };
}
