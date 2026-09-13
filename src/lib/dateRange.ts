/**
 * The date presets every list screen offers, as the two days the API takes.
 *
 * One place, because "this month" meaning different things on two screens is
 * the kind of difference nobody reports and everybody mistrusts.
 */

export const DATE_RANGES = [
  { value: "", label: "All time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
] as const;

export type DateRangeValue = (typeof DATE_RANGES)[number]["value"];

/** Local days, not UTC: a shop's "today" is the one outside its window. */
function day(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

export function rangeFor(value: string): { from?: string; to?: string } {
  if (!value) return {};
  const now = new Date();
  const to = day(now);
  if (value === "today") return { from: to, to };
  if (value === "7d" || value === "30d") {
    const back = new Date(now);
    back.setDate(back.getDate() - (value === "7d" ? 6 : 29));
    return { from: day(back), to };
  }
  if (value === "month") return { from: day(new Date(now.getFullYear(), now.getMonth(), 1)), to };
  if (value === "year") return { from: day(new Date(now.getFullYear(), 0, 1)), to };
  return {};
}
