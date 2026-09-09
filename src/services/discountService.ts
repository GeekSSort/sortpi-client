import { ApiError, apiFetch, apiList, toAmount } from "./apiClient";

/**
 * Shop offers, from the server.
 *
 * They used to live in this browser's localStorage: per device, per branch,
 * invisible to the server. So an offer set in the back office was one the till
 * had never heard of, a second till sold at full price, and clearing site data
 * deleted the shop's pricing — while the screen presented all of it as a
 * shop-wide setting.
 *
 * The amount off is no longer computed here either. The till used to work it
 * out and send the total as an INVOICE discount, which the pricing engine then
 * spread across every line in proportion — so a full-price product carried part
 * of another product's discount. The server now applies each offer to the line
 * it belongs to, and this only reads what it decided.
 */

export type DiscountMode = "PERCENT" | "FLAT";

export interface ProductDiscount {
  id: string;
  variantId: string;
  sku: string;
  productName: string;
  /** null for the shop-wide offer; a branch id for that branch's own. */
  branchId: string | null;
  mode: DiscountMode;
  value: number;
}

/** `{ variantId: offer }`, the shape every screen reads. */
export type DiscountMap = Record<string, ProductDiscount>;

function toDiscount(row: any): ProductDiscount {
  return {
    id: String(row?.id ?? ""),
    variantId: String(row?.variant ?? ""),
    sku: String(row?.sku ?? ""),
    productName: String(row?.productName ?? row?.product_name ?? ""),
    branchId: row?.branch ? String(row.branch) : null,
    mode: (row?.mode === "FLAT" ? "FLAT" : "PERCENT") as DiscountMode,
    value: toAmount(row?.value),
  };
}

export class DiscountService {
  /**
   * Every offer the shop is running, keyed by variant.
   *
   * A branch's own offer wins over the shop-wide one, which is the same rule
   * the server resolves by — the map is built shop-wide first so the branch row
   * overwrites it rather than the other way round.
   */
  static async map(): Promise<DiscountMap> {
    const rows = await apiList<ProductDiscount>(
      "/products/discounts/?limit=500",
      { method: "GET" },
      toDiscount
    );
    const out: DiscountMap = {};
    for (const row of [...rows.data].sort((a, b) => Number(!!a.branchId) - Number(!!b.branchId))) {
      if (row.variantId) out[row.variantId] = row;
    }
    return out;
  }

  /** Set the offer on one product. `branchId` null is the shop-wide one. */
  static async set(
    productId: string,
    input: { mode: DiscountMode; value: number; variantId?: string; branchId?: string | null }
  ): Promise<ProductDiscount> {
    const row = await apiFetch<any>(`/products/${productId}/discount/`, {
      method: "PUT",
      body: JSON.stringify({
        mode: input.mode,
        value: input.value,
        ...(input.variantId ? { variant: input.variantId } : {}),
        ...(input.branchId ? { branch: input.branchId } : {}),
      }),
    });
    return toDiscount(row);
  }

  /**
   * Wording a shopkeeper can act on.
   *
   * The screen showed `err.message`, which for a rejected field is the API's
   * generic "Validation failed." — true, and useless. The field that was
   * refused is in `errors`, so it is read out here.
   */
  static describeError(error: unknown): string {
    if (error instanceof ApiError) {
      if (error.code === "NETWORK_ERROR") return "Cannot reach the server.";
      if (error.status === 403) return "You do not have permission to change discounts.";
      if (error.code === "INVALID_DISCOUNT_VALUE" || error.code === "INVALID_DISCOUNT_MODE") {
        return error.message;
      }
      const first = Object.entries(error.errors || {})[0];
      if (first) {
        const [field, detail] = first;
        const text = Array.isArray(detail) ? String(detail[0]) : String(detail);
        // `variant` and `branch` name our own request shape, not anything the
        // reader chose, so they are translated rather than echoed.
        if (field === "variant" || field === "branch") {
          return "That product could not be matched. Refresh and try again.";
        }
        return field === "non_field_errors" ? text : `${field}: ${text}`;
      }
      return error.message;
    }
    return "Those discounts could not be saved.";
  }

  /** Remove it. Removing the shop-wide offer does not remove a branch's. */
  static async clear(
    productId: string,
    input: { variantId?: string; branchId?: string | null } = {}
  ): Promise<void> {
    await apiFetch(`/products/${productId}/discount/`, {
      method: "DELETE",
      body: JSON.stringify({
        ...(input.variantId ? { variant: input.variantId } : {}),
        ...(input.branchId ? { branch: input.branchId } : {}),
      }),
    });
  }
}

/** What comes off ONE unit, for display. The server decides what is charged. */
export function amountOff(price: number, offer: ProductDiscount | undefined): number {
  if (!offer || offer.value <= 0 || price <= 0) return 0;
  const off = offer.mode === "PERCENT" ? (price * offer.value) / 100 : offer.value;
  return Math.min(price, Math.max(0, off));
}

/** What it sells at, rounded the way the till shows money. */
export function priceAfter(price: number, offer: ProductDiscount | undefined): number {
  return Math.round(price - amountOff(price, offer));
}

/** A flat amount as a share of the price — for sorting and for the cap. */
export function effectivePercent(price: number, offer: ProductDiscount | undefined): number {
  if (!offer || price <= 0) return 0;
  return (amountOff(price, offer) / price) * 100;
}
