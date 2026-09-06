/**
 * The till's product discounts — what comes off which product.
 *
 * Kept per branch on the device: a Dhaka offer is not a Chattogram offer. The
 * catalogue has nowhere to store a product discount yet, so this is the one
 * place that owns the shape, the migration and the arithmetic. When the API
 * grows a field, only the two readers below change.
 */

import { tokenStore } from "@/services/apiClient";

const KEY = "sp_pos_discounts";

/** Off the price: a share of it, or a fixed number of taka. */
export type DiscountMode = "percent" | "flat";

export interface Discount {
  mode: DiscountMode;
  /** Percent when `mode` is "percent", taka when it is "flat". */
  value: number;
}

export type DiscountMap = Record<string, Discount>;

/** One store per branch, so switching branch does not carry offers across. */
export function discountStoreKey(): string {
  return `${KEY}_${tokenStore.branch() || "all"}`;
}

/**
 * The saved offers, or none.
 *
 * The first version wrote a bare percent (`{"7": 15}`). Those are read as
 * percents rather than dropped, so a shop that set its offers last week still
 * has them today.
 */
export function readDiscounts(): DiscountMap {
  try {
    const raw = window.localStorage.getItem(discountStoreKey());
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: DiscountMap = {};
    for (const [id, entry] of Object.entries(parsed)) {
      if (typeof entry === "number") {
        if (entry > 0) out[id] = { mode: "percent", value: entry };
      } else if (entry && typeof entry === "object") {
        const { mode, value } = entry as Partial<Discount>;
        const n = Number(value);
        if (Number.isFinite(n) && n > 0) {
          out[id] = { mode: mode === "flat" ? "flat" : "percent", value: n };
        }
      }
    }
    return out;
  } catch {
    // A browser that refuses storage simply starts with none.
    return {};
  }
}

/** Write the whole set, so a removal is saved as surely as a rate. */
export function writeDiscounts(next: DiscountMap): void {
  try {
    window.localStorage.setItem(discountStoreKey(), JSON.stringify(next));
  } catch {
    // The offers still apply for this session.
  }
}

/** What comes off one unit, never more than the price itself. */
export function amountOff(price: number, d: Discount | undefined): number {
  if (!d || d.value <= 0) return 0;
  const off = d.mode === "percent" ? (price * d.value) / 100 : d.value;
  return Math.min(price, Math.max(0, off));
}

/** What it sells at, rounded the way the till shows money. */
export function priceAfter(price: number, d: Discount | undefined): number {
  return Math.round(price - amountOff(price, d));
}

/** A flat amount as a share of the price — for sorting and for the cap. */
export function effectivePercent(price: number, d: Discount | undefined): number {
  if (!d || price <= 0) return 0;
  return (amountOff(price, d) / price) * 100;
}

/**
 * The shop's ceiling applied to one product.
 *
 * A percent is clamped directly; a flat amount is clamped to the taka the cap
 * allows on that price, so "৳500 off" on a ৳600 item becomes the largest
 * legal discount instead of being silently refused.
 */
export function capped(price: number, d: Discount, cap: number): Discount {
  if (d.mode === "percent") return { mode: "percent", value: Math.min(cap, d.value) };
  return { mode: "flat", value: Math.min(d.value, (price * cap) / 100) };
}
