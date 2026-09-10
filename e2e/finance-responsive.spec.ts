import { test, expect, type Page } from "@playwright/test";

import { stubApi } from "./stubApi";

/**
 * Income & Expense on a phone, a tablet and a laptop.
 *
 * The screen has three things that do not fit a small viewport and each is
 * handled differently on purpose, so each is checked:
 *
 *   * the seven-column TABLE becomes a stack of cards below md;
 *   * the twelve-month CHART scrolls sideways rather than shrinking, because
 *     twelve groups at 375px puts the bars under 3px;
 *   * the fourteen-column MATRIX scrolls sideways too, and is NOT collapsed —
 *     reading across a category's year is the whole point of that view.
 *
 * The assertion that matters for all three is the same one: the PAGE BODY must
 * never scroll horizontally. A wide child that pushes the document sideways is
 * the failure this catches, and it is invisible to a desktop-only test.
 */

function ok(data: unknown, extra: Record<string, unknown> = {}) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ success: true, data, ...extra }),
  };
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const SUMMARY = {
  year: 2026,
  month: null,
  totals: {
    income: "190500.0000",
    expense: "155000.0000",
    net: "35500.0000",
    transactions: 6,
    margin_percent: "18.6400",
  },
  trend: MONTHS.map((label, i) => ({
    month: i + 1,
    label,
    income: `${(i + 1) * 12000}.0000`,
    expense: `${(i + 1) * 7000}.0000`,
  })),
  matrix: {
    income: [
      {
        category_id: "ic-1",
        category_name: "Service Revenue",
        months: MONTHS.map((_, i) => `${(i + 1) * 1000}.0000`),
        total: "78000.0000",
      },
    ],
    expense: [
      {
        category_id: "ec-1",
        category_name: "Staff Salary",
        months: MONTHS.map(() => "5000.0000"),
        total: "60000.0000",
      },
    ],
    net: { months: MONTHS.map(() => "1000.0000"), total: "12000.0000" },
  },
};

const ENTRIES = Array.from({ length: 6 }, (_, i) => ({
  id: `e-${i}`,
  type: i % 2 ? "INCOME" : "EXPENSE",
  date: "2026-04-11",
  category_id: "ec-1",
  category_name: "Marketing",
  description: "Social media promotion for the spring campaign",
  reference_no: "",
  branch_id: null,
  branch_name: "",
  amount: "13200.0000",
  signed_amount: i % 2 ? "13200.0000" : "-13200.0000",
}));

async function withBooks(page: Page) {
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^.*\/api\/v1/, "");
    if (path.startsWith("/income-expense/summary")) {
      await route.fulfill(ok(SUMMARY));
      return;
    }
    if (path.startsWith("/income-expense/transactions")) {
      await route.fulfill(ok(ENTRIES, { total: ENTRIES.length, page: 1, limit: 8 }));
      return;
    }
    await route.fallback();
  });
}

/**
 * Switch to the entries list. The screen opens on the yearly summary.
 */
async function showMonthly(page: Page) {
  await page.getByRole("button", { name: /yearly summary/i }).click();
  await page.getByRole("button", { name: "Monthly Summary" }).click();
  await page.waitForTimeout(400);
}

/** How far the document overflows its own viewport. Must be zero. */
async function bodyOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
}

const SIZES = [
  { name: "phone", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1280, height: 900 },
  { name: "desktop", width: 1440, height: 1078 },
];

for (const size of SIZES) {
  test.describe(`at ${size.name} (${size.width}px)`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test("the monthly view fits its viewport", async ({ page }) => {
      await stubApi(page);
      await withBooks(page);
      await page.goto("/finance/income-expense");
      await expect(page.getByText("Income vs Expense Trend")).toBeVisible();
      await showMonthly(page);

      expect(
        await bodyOverflow(page),
        `the page body scrolls sideways at ${size.width}px`
      ).toBeLessThanOrEqual(1);
    });

    test("the yearly view fits its viewport", async ({ page }) => {
      await stubApi(page);
      await withBooks(page);
      await page.goto("/finance/income-expense");
      await expect(
        page.getByRole("heading", { name: "Income Summary (Month by Month)" })
      ).toBeVisible({ timeout: 15_000 });

      expect(
        await bodyOverflow(page),
        `the yearly matrix pushes the page sideways at ${size.width}px`
      ).toBeLessThanOrEqual(1);
    });

    test("the four cards are all reachable", async ({ page }) => {
      await stubApi(page);
      await withBooks(page);
      await page.goto("/finance/income-expense");

      for (const title of ["Total Income", "Total Transactions", "Total Expense", "Net Balance"]) {
        await expect(page.getByText(title).first()).toBeVisible();
      }
    });
  });
}

test.describe("the table below md", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("becomes cards, and the seven-column grid is not rendered", async ({ page }) => {
    await stubApi(page);
    await withBooks(page);
    await page.goto("/finance/income-expense");
    await showMonthly(page);

    // The card list is what a phone gets.
    const card = page.locator("div.md\\:hidden").getByText("Marketing").first();
    await expect(card).toBeVisible();

    // And the table is hidden rather than squeezed.
    const table = page.locator("div.hidden.md\\:block").first();
    await expect(table).toBeHidden();
  });

  test("a row's actions still open", async ({ page }) => {
    await stubApi(page);
    await withBooks(page);
    await page.goto("/finance/income-expense");
    await showMonthly(page);

    await page.getByRole("button", { name: /Actions for Marketing/ }).first().click();
    await expect(page.getByText("Edit").first()).toBeVisible();
  });
});

test.describe("the table from md up", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("is the table, not the cards", async ({ page }) => {
    await stubApi(page);
    await withBooks(page);
    await page.goto("/finance/income-expense");
    await showMonthly(page);

    const table = page.locator("div.hidden.md\\:block").first();
    await expect(table).toBeVisible();
    await expect(page.getByText("Description", { exact: true }).first()).toBeVisible();
  });
});
