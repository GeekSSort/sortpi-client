import { test, expect } from "@playwright/test";

import { PayrollService } from "../src/services/payrollService";

/**
 * A payroll period is the whole month, in the shop's own timezone.
 *
 * `monthBounds` built both ends with `new Date(y, m, 1).toISOString()`. That
 * constructor makes LOCAL midnight, and in any zone ahead of UTC local
 * midnight is the previous day in UTC — so in Dhaka (+6) September's period
 * ran from 2026-08-31 to 2026-09-29.
 *
 * Both ends were wrong, and each in a way that costs money:
 *
 *   * the START overlapped the previous month's posted run, so the server
 *     refused the whole thing with "already posted and overlaps this period"
 *     and the month could not be run at all;
 *   * the END dropped the last day of every month, so anything dated on the
 *     31st fell outside the period that was supposed to pay for it.
 *
 * Pure arithmetic, so no browser is driven — but it is the arithmetic that
 * decides which days a wage covers.
 */

const CASES = [
  { month: "2026-09", start: "2026-09-01", end: "2026-09-30" },
  { month: "2026-02", start: "2026-02-01", end: "2026-02-28" },
  { month: "2024-02", start: "2024-02-01", end: "2024-02-29" }, // a leap year
  { month: "2026-12", start: "2026-12-01", end: "2026-12-31" },
  { month: "2026-01", start: "2026-01-01", end: "2026-01-31" },
];

test.describe("a payroll period covers its whole month", () => {
  for (const c of CASES) {
    test(`${c.month} runs ${c.start} to ${c.end}`, () => {
      expect(PayrollService.boundsOfMonth(c.month)).toEqual({
        start: c.start,
        end: c.end,
      });
    });
  }

  test("a period never reaches into the month before it", () => {
    for (const c of CASES) {
      const { start } = PayrollService.boundsOfMonth(c.month);
      expect(start.slice(0, 7), `${c.month} started in another month`).toBe(c.month);
    }
  });

  test("a period never stops short of its last day", () => {
    for (const c of CASES) {
      const { end } = PayrollService.boundsOfMonth(c.month);
      const [y, m] = c.month.split("-").map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      expect(Number(end.slice(8)), `${c.month} ended early`).toBe(lastDay);
    }
  });

  test("this month's key and this month's bounds agree", () => {
    const key = PayrollService.monthKey();
    expect(PayrollService.boundsOfMonth(key).start.slice(0, 7)).toBe(key);
  });
});
