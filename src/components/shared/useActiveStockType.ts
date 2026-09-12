"use client";

import { useMemo } from "react";
import { SettingsService, UnitsService } from "@/services";
import type { UnitOption } from "@/services/inventoryService";
import { useQuery, queryKey } from "@/lib/query/useQuery";
import { ACTIVE_STOCK_TYPE_KEY } from "@/lib/stockTypes";

/**
 * The shop's active stock type — the unit it counts in unless told otherwise.
 *
 * A DEFAULT, not a restriction. `Product.unit` is still per product, because a
 * shop genuinely sells bottles by the piece and cloth by the metre, and the
 * unit's `allowDecimal` is what lets the till take 2.5 of one and refuse 2.5
 * of the other. What this removes is answering the same question on every
 * product a single-commodity shop ever adds.
 *
 * Resolved to the UNIT, not just its id, because every caller wants the name
 * or the decimal flag rather than a uuid — and because a setting pointing at a
 * unit somebody has since deleted has to come back as "no default" rather than
 * as an id that matches nothing in the picker.
 *
 * Both reads share their cache keys with the screens that own them, so asking
 * here costs no extra request on a page that already lists units or settings.
 */
export function useActiveStockType(): {
  /** The active unit, or null when none is set or it no longer exists. */
  unit: UnitOption | null;
  /** Every stock type the shop has, for a picker to render. */
  units: UnitOption[];
  loading: boolean;
} {
  const values = useQuery(
    queryKey("settings", { scope: "values" }),
    () => SettingsService.getValues(),
    { staleMs: 5 * 60_000 }
  );
  const unitsQuery = useQuery(queryKey("units"), () => UnitsService.list(), {
    staleMs: 5 * 60_000,
  });

  const units = useMemo(() => unitsQuery.data ?? [], [unitsQuery.data]);
  const activeId = String(values.data?.[ACTIVE_STOCK_TYPE_KEY] ?? "");

  const unit = useMemo(
    () => (activeId ? (units.find((u) => u.id === activeId) ?? null) : null),
    [activeId, units]
  );

  return { unit, units, loading: values.loading || unitsQuery.loading };
}
