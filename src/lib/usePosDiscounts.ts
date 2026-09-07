"use client";

import { DiscountMap, DiscountService } from "@/services/discountService";
import { queryKey, useQuery } from "@/lib/query/useQuery";

/**
 * The shop's product offers, as every screen reads them.
 *
 * This used to be a `useSyncExternalStore` over localStorage, and that is the
 * whole defect it replaces: the offers lived in ONE browser. An offer set in
 * the back office was one the till had never heard of, a second till sold at
 * full price, and clearing site data deleted the shop's pricing.
 *
 * Now it is one cached request, shared by the product wall, the invoice column,
 * the selected-items list and the discounts screen — so all four agree, and a
 * rate changed on any of them refreshes the rest through the same cascade every
 * other write uses.
 */
export function useProductDiscounts(): DiscountMap {
  const { data } = useQuery(queryKey("discounts"), () => DiscountService.map(), {
    // Offers change about as often as prices do, and the till reads this on
    // every render of the wall. The cache key is invalidated on a write, so
    // this window only governs how long an untouched tab keeps an old rate.
    staleMs: 60_000,
  });
  return data ?? {};
}
