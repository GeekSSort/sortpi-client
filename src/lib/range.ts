/**
 * The date ranges the dashboard cards offer, and what each one means.
 *
 * Both pickers used to be decorative: they set their own caption and nothing
 * else, so a card could read "Today" over a month of trading. The options now
 * resolve to a real from/to pair that the reports endpoint understands, which
 * is the only way "Today" and "This Year" can differ.
 */

export const RANGE_OPTIONS = ["Today", "This Week", "This Month", "This Year"] as const;
export type RangeOption = (typeof RANGE_OPTIONS)[number];

/**
 * A day as the API writes one: YYYY-MM-DD in the shop's own timezone.
 *
 * Deliberately not `toISOString().slice(0,10)` — that is UTC, so a day picked
 * in Dhaka (UTC+6) came out as the previous date for anything before 06:00.
 */
function apiDay(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export type DateRange = { fromDate: string; toDate: string };

/**
 * `today` is injected rather than read from the clock so callers can resolve a
 * range without an impure read during render.
 *
 * The week runs Monday to today, not the last seven days: a shopkeeper asking
 * for "this week" means the week they are in. Month and year are likewise
 * calendar-to-date, which is what every figure they compare against will be.
 */
export function resolveRange(option: RangeOption, today: Date): DateRange {
  const to = apiDay(today);

  if (option === "Today") return { fromDate: to, toDate: to };

  if (option === "This Week") {
    const monday = new Date(today);
    // getDay() is 0 on Sunday, which belongs to the week that started six days
    // earlier rather than to the one starting tomorrow.
    const back = (today.getDay() + 6) % 7;
    monday.setDate(today.getDate() - back);
    return { fromDate: apiDay(monday), toDate: to };
  }

  if (option === "This Month") {
    return { fromDate: apiDay(new Date(today.getFullYear(), today.getMonth(), 1)), toDate: to };
  }

  return { fromDate: apiDay(new Date(today.getFullYear(), 0, 1)), toDate: to };
}
