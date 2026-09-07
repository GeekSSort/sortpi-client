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

/** How many days back each option reaches, today included. */
const WINDOW_DAYS: Record<RangeOption, number> = {
  Today: 1,
  "This Week": 7,
  "This Month": 30,
  "This Year": 365,
};

/**
 * `today` is injected rather than read from the clock so callers can resolve a
 * range without an impure read during render.
 *
 * Rolling windows, not calendar-to-date.
 *
 * The week used to run Monday to today, on the reasoning that a shopkeeper
 * asking for "this week" means the week they are in. That is true, and it made
 * the control useless for most of the week: on a Monday "This Week" resolves
 * to Monday-to-Monday, so it returned one day — the same single day as
 * "Today", drawing the same flat graph — and on Tuesday it returned two. Same
 * on the 1st of a month and the 1st of January.
 *
 * A range picker whose options collapse into each other for the first days of
 * every period is not a range picker. Seven days back always spans a week of
 * trading, always differs from today, and always has a curve in it.
 */
export function resolveRange(option: RangeOption, today: Date): DateRange {
  const to = apiDay(today);

  const from = new Date(today);
  from.setDate(today.getDate() - (WINDOW_DAYS[option] - 1));
  return { fromDate: apiDay(from), toDate: to };
}

/**
 * The window immediately before `range`, of the same length.
 *
 * A trend needs something to be a trend against. "↑ 18.6% vs. last month" was
 * a constant in the page source — the same figure whatever the shop had done —
 * so the comparison window is resolved here and the caller asks the server for
 * it like any other range.
 *
 * Same length, ending the day before `from`: "This Week" on a Wednesday
 * compares three days against the three before them, not against a full week
 * that would always look larger.
 */
export function previousRange(range: DateRange): DateRange {
  const from = new Date(`${range.fromDate}T00:00:00`);
  const to = new Date(`${range.toDate}T00:00:00`);
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);

  const prevTo = new Date(from);
  prevTo.setDate(from.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevTo.getDate() - (days - 1));

  return { fromDate: apiDay(prevFrom), toDate: apiDay(prevTo) };
}

/** What to call the window a trend is measured against. */
export function previousLabel(option: RangeOption): string {
  if (option === "Today") return "vs. yesterday";
  if (option === "This Week") return "vs. previous 7 days";
  if (option === "This Month") return "vs. previous 30 days";
  return "vs. previous year";
}
