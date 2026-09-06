"use client";

import { useMemo } from "react";
import { SettingsService } from "@/services";
import { useQuery, queryKey } from "@/lib/query/useQuery";

/**
 * The shop's own identity, as a receipt masthead needs it.
 *
 * The till built this inline and every other screen that printed something
 * built its own header instead — so a purchase order carried no company name
 * at all and a reprinted sale from the Sales list looked nothing like the
 * slip the customer had been handed at the counter. One hook, one shape, one
 * cache key shared with the till, so opening Sales after using the POS costs
 * no extra request.
 */
export type ShopProfile = {
  name: string;
  tagline: string;
  address: string;
  bin: string;
  phone: string;
};

export function useShopProfile(): { shop: ShopProfile; loading: boolean } {
  const { data, loading } = useQuery(
    queryKey("settings", { scope: "company-profile" }),
    () => SettingsService.getCompanyProfile(),
    { staleMs: 300_000 }
  );

  const shop = useMemo<ShopProfile>(
    () => ({
      // Falling back to a placeholder would print a company that does not
      // exist on a document a customer keeps. Empty is the honest answer, and
      // Settings is where it gets filled in.
      name: data?.companyName || "",
      tagline: data?.businessType || "",
      address: data?.address || "",
      bin: data?.taxId || data?.tradeLicenseBin || "",
      phone: data?.phoneNumber || "",
    }),
    [data]
  );

  return { shop, loading };
}
