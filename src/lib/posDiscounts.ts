/**
 * The arithmetic of a product discount, and nothing else.
 *
 * This module used to OWN the offers: it read and wrote them to localStorage,
 * per device, per branch. That is the defect the discount table replaced — an
 * offer set in the back office was one the till had never heard of, and a
 * second till sold at full price. Storage now lives on the server
 * (`services/discountService.ts`), and the server decides what a customer is
 * charged.
 *
 * What stays here is the pure arithmetic the SCREENS need to show a rate card:
 * what a given rate takes off a given price, what the shop's ceiling allows,
 * and how a flat amount reads as a percentage. None of it decides money — it
 * decides what a shopkeeper sees while they type.
 */

/** Off the price: a share of it, or a fixed number of taka. */
export type DiscountMode = "percent" | "flat";

export interface Discount {
  mode: DiscountMode;
  /** Percent when `mode` is "percent", taka when it is "flat". */
  value: number;
}

export type DiscountMap = Record<string, Discount>;

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
  if (d.mode === "percent") return { mode: "percent", value: toMoney(Math.min(cap, d.value)) };
  return { mode: "flat", value: toMoney(Math.min(d.value, (price * cap) / 100)) };
}

/**
 * Four decimal places, which is what the money column holds.
 *
 * `(19.99 * 20) / 100` is `3.9979999999999993` in IEEE-754, and the API refuses
 * it: "Ensure that there are no more than 4 decimal places." Applying a
 * discount to a selection would fail on whichever products happened to land on
 * a non-representable fraction, and the screen reported the whole batch as
 * "Not everything saved" without saying which or why.
 *
 * Rounded HERE rather than at the request, so the number shown in the rate
 * card's preview is the number that gets stored. Rounding only on the way out
 * would leave the two disagreeing in the fourth decimal, which is the kind of
 * difference nobody sees until they reconcile a day's takings.
 */
function toMoney(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
