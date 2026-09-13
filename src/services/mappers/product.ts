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

/**
 * A variant's own name, when it is worth showing.
 *
 * The API calls a product's only variant "Default", and a shop that sells one
 * size of one thing has nothing but those. Printing "Default" under every tile
 * in the shop is noise, so it comes back empty and the UI shows nothing.
 */
export function labelFor(variant: any): string {
  const name = String(variant?.name ?? "").trim();
  return !name || name.toLowerCase() === "default" ? "" : name;
}

/**
 * The same rule, for a payload that carries the variant's name as a plain
 * field rather than a nested object — a stock row, a transfer line, a purchase
 * line. They are each keyed on a variant and say so with `variant_name`.
 */
export function variantLabelOf(row: any): string {
  return labelFor({ name: row?.variantName ?? row?.variant_name });
}

/**
 * EVERY sellable variant of a product, one item each.
 *
 * This is the fix for a product that had more than one. The mapper used to
 * take `variants.find(isDefault) || variants[0]` and return a single item, so
 * a Coca-Cola with 250ml, 500ml and 1L reached the till as one tile at one
 * price — and the stock, prices and barcodes sitting against the other two
 * were unreachable from any screen. The server has been variant-keyed
 * throughout since it was built; it was this line that hid them.
 *
 * Inactive variants are dropped: `is_active` is how a shop retires a size it
 * no longer stocks, and a retired one must not be sellable. A product whose
 * variants are all inactive yields nothing, which is correct — there is
 * nothing to sell.
 */
export function toProductItems(
  row: any,
  opts?: { stockBySku?: Map<string, number>; categoryNames?: Map<string, string> }
): ProductItem[] {
  const variants: any[] = Array.isArray(row?.variants) ? row.variants : [];
  const sellable = variants.filter((v) => v?.isActive !== false);
  if (sellable.length === 0) return [];
  // The default first, then by name, so a wall of tiles is in a stable and
  // guessable order rather than in whatever order the API listed them.
  const ordered = [...sellable].sort((a, b) => {
    if (Boolean(a?.isDefault) !== Boolean(b?.isDefault)) return a?.isDefault ? -1 : 1;
    return String(a?.name ?? "").localeCompare(String(b?.name ?? ""));
  });
  return ordered.map((variant) => fromVariant(row, variant, opts));
}

/**
 * One product, its DEFAULT variant only.
 *
 * Kept for the callers that genuinely have a single variant in hand — the
 * barcode lookup builds its row from the one variant the scan resolved to, and
 * asking it to pick is meaningless. Anything LISTING a catalogue wants
 * `toProductItems`.
 */
export function toProductItem(
  row: any,
  opts?: { stockBySku?: Map<string, number>; categoryNames?: Map<string, string> }
): ProductItem {
  const variants: any[] = Array.isArray(row?.variants) ? row.variants : [];
  const variant = variants.find((v) => v?.isDefault) || variants[0] || {};
  return fromVariant(row, variant, opts);
}

function fromVariant(
  row: any,
  variant: any,
  opts?: { stockBySku?: Map<string, number>; categoryNames?: Map<string, string> }
): ProductItem {
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

  const name = String(row?.name ?? "");
  const variantLabel = labelFor(variant);

  return {
    id: String(variant?.id ?? row?.id ?? ""),
    productId: String(row?.id ?? ""),
    name,
    variantLabel,
    fullName: variantLabel ? `${name} ${variantLabel}` : name,
    sku,
    barcode,
    // The UI type names four categories; the catalogue has twenty. The real
    // name is carried through and the grid filters on it as a string.
    category: (categoryName || "Uncategorised") as ProductItem["category"],
    price,
    priceFormatted: price > 0 ? formatMoney(price, { decimals: 2 }) : "No price",
    stock: toAmount(opts?.stockBySku?.get(sku) ?? 0),
    image,
    unitShort: String(row?.unitShortName ?? row?.unit_short_name ?? ""),
    allowDecimal: (row?.unitAllowDecimal ?? row?.unit_allow_decimal ?? false) === true,
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
