import { ProductItem } from "@/types/pos";
import { toAmount } from "../apiClient";
import { formatMoney } from "@/lib/format";
import { safeImageUrl } from "./imageUrl";

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

  // The scanner's key. A variant may carry several codes — the manufacturer's
  // and the shop's own label — so the primary one wins, and the first is the
  // fallback for a variant nobody has nominated one on.
  const codes: any[] = Array.isArray(variant?.barcodes) ? variant.barcodes : [];
  const primaryCode = codes.find((b) => b?.isPrimary) ?? codes[0];
  const barcode = String(primaryCode?.barcode ?? "");

  const images: any[] = Array.isArray(row?.images) ? row.images : [];
  // Only READY rows are ever served; a PENDING one has no bytes behind it yet.
  const ready = images.filter((i) => !i?.status || i.status === "READY");
  const primary = ready.find((i) => i?.isPrimary) ?? ready[0];
  const raw = String(
    primary?.url ??
      primary?.imageUrl ??
      primary?.image_url ??
      row?.image ??
      row?.imageUrl ??
      row?.image_url ??
      ""
  );
  // Some filenames contain spaces. Left unencoded they break the request.
  const image = raw ? safeImageUrl(raw) : "";

  const categoryName = opts?.categoryNames?.get(String(row?.category ?? "")) ?? "";

  // Null when nobody has priced the product yet.
  const price = toAmount(variant?.price);

  /**
   * What this product is taxed at, as the SERVER resolved it.
   *
   * The till used to tax every line at the shop's default rate, because `tax`
   * on the payload is only an id and there was nothing else to price with. The
   * server taxes each line at the PRODUCT's own rate and falls back to the
   * shop's only where a product has none — so a product carrying its own rate
   * was quoted at one figure on the screen and booked at another, with the
   * customer standing there for both.
   *
   * `tax_rate` and `tax_inclusive` are the resolved values, fallback already
   * applied, so the two sides cannot disagree about the fallback either.
   * Undefined for a payload from an older server; the cart falls back to the
   * shop setting exactly as it used to.
   */
  const taxRate = row?.taxRate === undefined || row?.taxRate === null
    ? undefined
    : toAmount(row.taxRate);
  const taxInclusive =
    row?.taxInclusive === undefined || row?.taxInclusive === null
      ? undefined
      : Boolean(row.taxInclusive);

  return {
    id: String(variant?.id ?? row?.id ?? ""),
    productId: String(row?.id ?? ""),
    name: String(row?.name ?? ""),
    sku,
    barcode,
    // The UI type names four categories; the catalogue has twenty. The real
    // name is carried through and the grid filters on it as a string.
    category: (categoryName || "Uncategorised") as ProductItem["category"],
    price,
    priceFormatted: price > 0 ? formatMoney(price, { decimals: 2 }) : "No price",
    stock: toAmount(opts?.stockBySku?.get(sku) ?? 0),
    image,
    taxRate,
    taxInclusive,
  };
}

/** What the shop paid, for the screens allowed to show it. */
export function costOf(row: any): string {
  const variants: any[] = Array.isArray(row?.variants) ? row.variants : [];
  const variant = variants.find((v) => v?.isDefault) || variants[0] || {};
  return formatMoney(toAmount(variant?.costPrice));
}
