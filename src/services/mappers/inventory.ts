import { InventoryProduct } from "@/types/inventory";
import { StockItem } from "@/types/stock";
import { toAmount } from "../apiClient";
import { formatMoney } from "@/lib/format";
import { safeImageUrl } from "./imageUrl";
import { labelFor, variantLabelOf } from "./product";

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

/**
 * ONE ROW PER VARIANT, for the screens that pick something to move.
 *
 * A purchase line, a transfer line and a stock count each name a VARIANT, so
 * their pickers have to offer every one. They were built on
 * `toInventoryProduct`, which returns the default only — so a shop selling
 * Coca-Cola in three sizes could raise a purchase order for exactly one of
 * them, and the other two could never be bought, moved or counted through the
 * app at all.
 *
 * The products LIST deliberately does NOT use this: that screen is a catalogue
 * of products, and one row per size would triple it to say the same names.
 */
export function toInventoryVariants(row: any, startIndex: number): InventoryProduct[] {
  const variants: any[] = Array.isArray(row?.variants) ? row.variants : [];
  const sellable = variants.filter((v) => v?.isActive !== false);
  if (sellable.length === 0) return [];
  const ordered = [...sellable].sort((a, b) => {
    if (Boolean(a?.isDefault) !== Boolean(b?.isDefault)) return a?.isDefault ? -1 : 1;
    return String(a?.name ?? "").localeCompare(String(b?.name ?? ""));
  });
  return ordered.map((variant, offset) =>
    fromVariantRow(row, variant, startIndex + offset, sellable.length)
  );
}

export function toInventoryProduct(row: any, index: number): InventoryProduct {
  const variants: any[] = Array.isArray(row?.variants) ? row.variants : [];
  const sellable = variants.filter((v) => v?.isActive !== false);
  const variant = sellable.find((v) => v?.isDefault) || sellable[0] || {};
  return fromVariantRow(row, variant, index, Math.max(1, sellable.length));
}

function fromVariantRow(
  row: any,
  variant: any,
  index: number,
  variantCount: number
): InventoryProduct {
  const sku = String(variant?.sku ?? "—");
  // The primary one, or the first: a variant may carry several — a case code
  // and a unit code — and the label prints the one the shelf is scanned by.
  const codes: any[] = Array.isArray(variant?.barcodes) ? variant.barcodes : [];
  const barcode = String((codes.find((c) => c?.isPrimary) ?? codes[0])?.barcode ?? "");
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
    variantLabel: labelFor(variant),
    variantCount,
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
    barcode,
    status: statusFor(stock, toAmount(row?.reorderLevel ?? row?.reorder_level)),
  };
}

export function toStockItem(row: any): StockItem {
  const available = toAmount(row?.available);
  // Falls back to `available` only for a payload that predates the field —
  // nothing writes `reserved_quantity` today, so the two are equal.
  const quantity = row?.quantity == null ? available : toAmount(row.quantity);
  const reorder = toAmount(row?.reorderLevel ?? row?.reorder_level);
  // Some filenames contain spaces; unencoded they break the request.
  const image = String(row?.productImage ?? row?.product_image ?? "");
  return {
    id: String(row?.id ?? ""),
    // The variant, not the stock row: an adjustment is written against it.
    variantId: String(row?.variant ?? ""),
    warehouseId: String(row?.warehouse ?? ""),
    name: String(row?.productName ?? row?.product_name ?? "—"),
    variantLabel: variantLabelOf(row),
    image: image ? safeImageUrl(image) : "",
    sku: String(row?.sku || "—"),
    // The warehouse comes back as an id and a code; the code is the readable one.
    warehouse: String(row?.warehouseCode ?? row?.warehouse_code ?? "—"),
    quantity,
    available,
    reserved: toAmount(row?.reservedQuantity ?? row?.reserved_quantity),
    lowStock: reorder || LOW_STOCK,
    averageCost: toAmount(row?.averageCost ?? row?.average_cost),
    status: statusFor(available, reorder),
  };
}
