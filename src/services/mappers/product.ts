import { ProductItem } from "@/types/pos";
import { toAmount } from "../apiClient";
import { formatMoney } from "@/lib/format";

/**
 * A catalogue product -> a tile on the till.
 *
 * Price is the branch's selling price, or the company-wide one if the branch
 * has none. `cost_price` is what the shop paid and is never shown here.
 *
 * Stock is per warehouse in `/inventory/stock/`, so the caller looks it up by
 * SKU and passes in what it found.
 */

export function toProductItem(
  row: any,
  opts?: { stockBySku?: Map<string, number>; categoryNames?: Map<string, string> }
): ProductItem {
  const variants: any[] = Array.isArray(row?.variants) ? row.variants : [];
  const variant = variants.find((v) => v?.isDefault) || variants[0] || {};
  const sku = String(variant?.sku ?? "");

  const images: any[] = Array.isArray(row?.images) ? row.images : [];
  // Only READY rows are ever served; a PENDING one has no bytes behind it yet.
  const ready = images.filter((i) => !i?.status || i.status === "READY");
  const primary = ready.find((i) => i?.isPrimary) ?? ready[0];
  const raw = String(primary?.url ?? primary ?? "");
  // Some filenames contain spaces. Left unencoded they break the request.
  const image = raw ? encodeURI(raw) : "";

  const categoryName = opts?.categoryNames?.get(String(row?.category ?? "")) ?? "";

  // Null when nobody has priced the product yet.
  const price = toAmount(variant?.price);

  return {
    id: String(variant?.id ?? row?.id ?? ""),
    name: String(row?.name ?? ""),
    sku,
    // The UI type names four categories; the catalogue has twenty. The real
    // name is carried through and the grid filters on it as a string.
    category: (categoryName || "Uncategorised") as ProductItem["category"],
    price,
    priceFormatted: price > 0 ? formatMoney(price, { decimals: 2 }) : "No price",
    stock: toAmount(opts?.stockBySku?.get(sku) ?? 0),
    image,
  };
}

/** What the shop paid, for the screens allowed to show it. */
export function costOf(row: any): string {
  const variants: any[] = Array.isArray(row?.variants) ? row.variants : [];
  const variant = variants.find((v) => v?.isDefault) || variants[0] || {};
  return formatMoney(toAmount(variant?.costPrice));
}
