"use client";

import { SettingsService } from "@/services";
import { useQuery, queryKey } from "@/lib/query/useQuery";

/**
 * Does this shop take part payments?
 *
 * `pos.allow_partial_payment` decides more than the till. A shop that settles
 * every sale in full has no use for a Paid column that always equals the total
 * and a Due column that is always zero — two columns of noise squeezing the
 * ones that carry information. So the screens that report on sales ask this
 * and show the settlement breakdown only when there is a settlement to break
 * down; switch the setting off and they go back to the single Total Amount
 * they showed before part payment existed.
 *
 * The cache key is the till's own (`CartPanel`, `SelectedItems`), so opening
 * Sales after the POS costs no extra request and the two cannot disagree
 * about what the shop allows.
 *
 * Defaults to OFF while the settings load — the same default the setting
 * itself has. Flashing two columns in and then out again on every page load
 * is worse than showing them a beat late.
 */
export function usePartialPayment(): { allowPartial: boolean; loading: boolean } {
  const { data, loading } = useQuery(
    queryKey("settings", { scope: "values" }),
    () => SettingsService.getValues(),
    // It changes about as often as the VAT rate. Re-asking every 30s on a
    // table somebody is scrolling is pure noise.
    { staleMs: 5 * 60_000 }
  );

  return {
    allowPartial: String(data?.["pos.allow_partial_payment"] ?? "false") === "true",
    loading,
  };
}
