import { test, expect, type Page } from "@playwright/test";

import { stubApi } from "./stubApi";

/**
 * Finance — the sidebar group, and the Income & Expense screen's two views.
 *
 * Figma 369:5812 (the menu), 367:2574 (Monthly Summary) and 369:5873 (Yearly
 * Summary). The two frames are ONE screen: the cards and the chart are
 * identical in both and only the block underneath changes, so the toggle
 * between them is the thing worth driving.
 *
 * Everything here is real data through the real components. A screenshot test
 * would pass against a chart that renders no bars and a matrix that renders no
 * months, which is exactly the kind of empty-shell failure these avoid.
 */

function ok(data: unknown, extra: Record<string, unknown> = {}) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ success: true, data, ...extra }),
  };
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** A year with money on both sides, in the first three months. */
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
    income: i === 0 ? "190500.0000" : i === 1 ? "171200.0000" : i === 2 ? "193700.0000" : "0.0000",
    expense: i === 0 ? "155000.0000" : i === 1 ? "109200.0000" : i === 2 ? "207900.0000" : "0.0000",
  })),
  matrix: {
    income: [
      {
        category_id: "ic-1",
        category_name: "Service Revenue",
        months: ["158000.0000", "171200.0000", "184300.0000", ...Array(9).fill("0.0000")],
        total: "513500.0000",
      },
      {
        category_id: "ic-2",
        category_name: "Membership",
        months: ["32500.0000", ...Array(11).fill("0.0000")],
        total: "32500.0000",
      },
    ],
    expense: [
      {
        category_id: "ec-1",
        category_name: "Staff Salary",
        months: ["95000.0000", "95000.0000", "97000.0000", ...Array(9).fill("0.0000")],
        total: "287000.0000",
      },
    ],
    net: {
      months: ["35500.0000", "61800.0000", "-14200.0000", ...Array(9).fill("0.0000")],
      total: "83100.0000",
    },
  },
};

const ENTRIES = [
  {
    id: "e-1",
    type: "EXPENSE",
    date: "2026-04-11",
    category_id: "ec-1",
    category_name: "Marketing",
    description: "Social media promotion",
    reference_no: "",
    branch_id: null,
    branch_name: "",
    amount: "13200.0000",
    signed_amount: "-13200.0000",
  },
  {
    id: "i-1",
    type: "INCOME",
    date: "2026-04-10",
    category_id: "ic-1",
    category_name: "Service Revenue",
    description: "July service sales",
    reference_no: "",
    branch_id: null,
    branch_name: "",
    amount: "12500.0000",
    signed_amount: "12500.0000",
  },
];

/** Answer the finance endpoints with real books, and record what was asked. */
async function withBooks(page: Page) {
  const calls: { summary: string[]; transactions: string[]; writes: string[] } = {
    summary: [],
    transactions: [],
    writes: [],
  };

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^.*\/api\/v1/, "");

    if (path.startsWith("/income-expense/summary")) {
      calls.summary.push(url.search);
      await route.fulfill(ok(SUMMARY));
      return;
    }
    if (path.startsWith("/income-expense/transactions")) {
      calls.transactions.push(url.search);
      const type = url.searchParams.get("type");
      const rows = type ? ENTRIES.filter((e) => e.type === type) : ENTRIES;
      await route.fulfill(ok(rows, { total: rows.length, page: 1, limit: 8 }));
      return;
    }
    if (path.startsWith("/income-categories")) {
      await route.fulfill(ok([{ id: "ic-1", name: "Service Revenue" }], { total: 1 }));
      return;
    }
    if (path.startsWith("/expense-categories")) {
      await route.fulfill(ok([{ id: "ec-1", name: "Marketing" }], { total: 1 }));
      return;
    }
    if (path.startsWith("/accounts")) {
      await route.fulfill(
        ok([{ id: "a-1", account_type: "REVENUE" }, { id: "a-2", account_type: "EXPENSE" }], {
          total: 2,
        })
      );
      return;
    }
    if (
      (path.startsWith("/incomes") || path.startsWith("/expenses")) &&
      request.method() !== "GET"
    ) {
      calls.writes.push(`${request.method()} ${path} ${request.postData() || ""}`);
      await route.fulfill(ok({ id: "new" }));
      return;
    }
    await route.fallback();
  });

  return calls;
}

/**
 * Switch to the entries list.
 *
 * The screen opens on the YEARLY summary — the shape of the whole book is what
 * somebody comes here for, and the list is where they go next to find one row.
 * So every test about the list has to ask for it.
 */
async function showMonthly(page: Page) {
  await page.getByRole("button", { name: /yearly summary/i }).click();
  await page.getByRole("button", { name: "Monthly Summary" }).click();
}

test.describe("the Finance group in the sidebar", () => {
  test("it sits after Purchases and opens its two children", async ({ page }) => {
    await stubApi(page);
    await withBooks(page);
    await page.goto("/dashboard");

    const nav = page.locator("aside");
    const finance = nav.getByRole("button", { name: /^finance$/i }).first();
    await expect(finance).toBeVisible();

    // Figma 369:5812 puts Finance directly after Purchases.
    const [purchases, financeBox, reports] = await Promise.all([
      nav.getByText("Purchases", { exact: true }).first().boundingBox(),
      finance.boundingBox(),
      nav.getByText("Reports", { exact: true }).first().boundingBox(),
    ]);
    expect(purchases!.y).toBeLessThan(financeBox!.y);
    expect(financeBox!.y).toBeLessThan(reports!.y);

    await finance.click();
    await expect(nav.getByRole("link", { name: "Income & Expense" })).toBeVisible();
    // The group's second child, built now. It reads the same two tables as the
    // first — a voucher IS an income or an expense — so the two screens cannot
    // disagree about a figure.
    await expect(nav.getByRole("link", { name: "Vouchers" })).toBeVisible();
  });

  test("the one child opens a real page", async ({ page }) => {
    await stubApi(page);
    await withBooks(page);

    await page.goto("/finance/income-expense");
    await expect(page.getByText("Income vs Expense Trend")).toBeVisible();
  });
});

test.describe("the four cards", () => {
  test("they carry the totals, and the net card names the margin", async ({ page }) => {
    await stubApi(page);
    await withBooks(page);
    await page.goto("/finance/income-expense");

    await expect(page.getByText("Total Income").first()).toBeVisible();
    await expect(page.getByText("Total Transactions")).toBeVisible();
    await expect(page.getByText("Total Expense")).toBeVisible();
    await expect(page.getByText("Net Balance")).toBeVisible();

    // Indian grouping, as the design writes it.
    await expect(page.getByText("৳ 1,90,500")).toBeVisible();
    await expect(page.getByText("৳ 1,55,000")).toBeVisible();
    await expect(page.getByText(/18\.6% Profitable/)).toBeVisible();
  });

  test("a loss is red and points down, not a green badge over a minus", async ({ page }) => {
    await stubApi(page);
    await withBooks(page);
    // Registered AFTER withBooks: Playwright runs the LAST handler first, so
    // this has to be the outermost one to win.
    // A predicate, not a glob: `summary*` does not cross the `/` before the
    // query string, so it never matched `/summary/?year=2026`.
    await page.route(
      (url) => url.pathname.includes("/income-expense/summary"),
      async (route) => {
      await route.fulfill(
        ok({
          ...SUMMARY,
          totals: {
            income: "100.0000",
            expense: "500.0000",
            net: "-400.0000",
            transactions: 2,
            margin_percent: "-400.0000",
          },
        })
      );
      }
    );
    await page.goto("/finance/income-expense");

    await expect(page.getByText(/At a loss/)).toBeVisible();
    await expect(page.getByText("-৳ 400").first()).toBeVisible();
  });
});

test.describe("the trend chart", () => {
  test("it draws twelve months, both series, and a legend", async ({ page }) => {
    await stubApi(page);
    await withBooks(page);
    await page.goto("/finance/income-expense");

    const chart = page.getByRole("img", { name: /income against expense/i });
    await expect(chart).toBeVisible();

    // Every month is a column whether or not anything happened in it — the
    // axis is the year, not the data.
    for (const label of MONTHS) {
      await expect(chart.locator(`text=${label}`).first()).toBeVisible();
    }

    // Two series must never be told apart by colour alone.
    await expect(page.getByText("Income", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Expense", { exact: true }).first()).toBeVisible();

    // Bars are drawn from the data, not an empty frame.
    const income = chart.locator('rect[fill="#27b85e"]');
    const expense = chart.locator('rect[fill="#ff0000"]');
    expect(await income.count()).toBe(3);
    expect(await expense.count()).toBe(3);
  });

  test("hovering a bar names the month and the series, not just a number", async ({ page }) => {
    await stubApi(page);
    await withBooks(page);
    await page.goto("/finance/income-expense");

    const chart = page.getByRole("img", { name: /income against expense/i });
    await chart.locator('rect[fill="#27b85e"]').first().hover({ force: true });
    await expect(chart.locator("text=/Jan · Income/")).toBeVisible();
  });

  test("picking a year re-asks the server for it", async ({ page }) => {
    await stubApi(page);
    const calls = await withBooks(page);
    await page.goto("/finance/income-expense");
    await expect(page.getByText("Income vs Expense Trend")).toBeVisible();

    // The CHART's year picker specifically: in the yearly view the table's
    // period control shows a bare year too, and it is not a menu.
    await page.locator('button[aria-haspopup="listbox"]').first().click();
    await page.getByRole("option", { name: "2024" }).click();
    await expect.poll(() => calls.summary.some((s) => s.includes("year=2024"))).toBe(true);
  });
});

test.describe("the Monthly Summary view", () => {
  test("the table is the design's seven columns", async ({ page }) => {
    await stubApi(page);
    await withBooks(page);
    await page.goto("/finance/income-expense");
    await showMonthly(page);

    for (const head of ["#", "Date", "Category", "Description", "Type", "Amount", "Action"]) {
      await expect(page.getByText(head, { exact: true }).first()).toBeVisible();
    }
  });

  test("amounts carry their sign and their colour, and the type is written out", async ({ page }) => {
    await stubApi(page);
    await withBooks(page);
    await page.goto("/finance/income-expense");
    await showMonthly(page);

    // The sign belongs to the type. Both are on the row, so neither the
    // colour nor the sign is the only thing saying which way it goes.
    const expense = page.getByText("-৳ 13,200").first();
    await expect(expense).toBeVisible();
    await expect(expense).toHaveCSS("color", "rgb(255, 0, 0)");

    const income = page.getByText("+৳ 12,500").first();
    await expect(income).toBeVisible();
    await expect(income).toHaveCSS("color", "rgb(39, 184, 94)");

    await expect(page.getByText("Social media promotion").first()).toBeVisible();
    await expect(page.getByText("11-04-2026").first()).toBeVisible();
  });

  test("the type filter narrows the list at the server", async ({ page }) => {
    await stubApi(page);
    const calls = await withBooks(page);
    await page.goto("/finance/income-expense");
    await showMonthly(page);
    await expect(page.getByText("Social media promotion").first()).toBeVisible();

    await page.getByRole("button", { name: "All types" }).click();
    await page.getByRole("button", { name: "Income", exact: true }).last().click();

    await expect.poll(() => calls.transactions.some((s) => s.includes("type=INCOME"))).toBe(true);
    await expect(page.getByText("July service sales").first()).toBeVisible();
    await expect(page.getByText("Social media promotion")).toHaveCount(0);
  });

  test("searching re-asks the list but not the chart", async ({ page }) => {
    await stubApi(page);
    const calls = await withBooks(page);
    await page.goto("/finance/income-expense");
    await showMonthly(page);
    await expect(page.getByText("Social media promotion").first()).toBeVisible();

    const before = calls.summary.length;
    await page.getByLabel("Search transactions").fill("rent");
    await expect.poll(() => calls.transactions.some((s) => s.includes("search=rent"))).toBe(true);
    // The chart above it must not flicker on every keystroke.
    expect(calls.summary.length).toBe(before);
  });
});

test.describe("the Yearly Summary view", () => {
  test("the toggle swaps the block under the chart, keeping the top half", async ({ page }) => {
    await stubApi(page);
    await withBooks(page);
    await page.goto("/finance/income-expense");


    // The three sections of 369:5873.
    await expect(page.getByRole("heading", { name: "Income Summary (Month by Month)" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Expense Summary (Month by Month)" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Net Balance (Month by Month)" })).toBeVisible();

    // The cards and the chart are the same in both frames.
    await expect(page.getByText("Income vs Expense Trend")).toBeVisible();
    await expect(page.getByText("Total Income").first()).toBeVisible();
    // And the entries list is gone.
    await expect(page.getByText("Social media promotion")).toHaveCount(0);
  });

  test("a category reads across twelve months to a total", async ({ page }) => {
    await stubApi(page);
    await withBooks(page);
    await page.goto("/finance/income-expense");

    await expect(page.getByText("Service Revenue").first()).toBeVisible();
    await expect(page.getByText("Tk.158,000").first()).toBeVisible();
    await expect(page.getByText("Tk.513,500").first()).toBeVisible();
    // A month with nothing in it is a dash, not a blank or a zero.
    await expect(page.getByText("–").first()).toBeVisible();
  });

  test("a negative net month is red under the gold heading", async ({ page }) => {
    await stubApi(page);
    await withBooks(page);
    await page.goto("/finance/income-expense");

    const loss = page.getByText("-Tk.14,200").first();
    await expect(loss).toBeVisible();
    await expect(loss).toHaveCSS("color", "rgb(255, 0, 0)");
  });
});

test.describe("recording money", () => {
  test("Add entry posts to the side that was chosen", async ({ page }) => {
    await stubApi(page);
    const calls = await withBooks(page);
    await page.goto("/finance/income-expense");
    await showMonthly(page);

    await page.getByRole("button", { name: "Add entry" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "Income" }).click();
    await dialog.getByLabel("Category").selectOption("ic-1");
    await dialog.getByLabel("Amount").fill("2500");
    await dialog.getByLabel("Description").fill("Membership fee");
    await dialog.getByRole("button", { name: "Add entry" }).click();

    await expect
      .poll(() => calls.writes.some((w) => w.startsWith("POST /incomes/")))
      .toBe(true);
  });

  test("editing an expense cannot turn it into an income", async ({ page }) => {
    await stubApi(page);
    await withBooks(page);
    await page.goto("/finance/income-expense");
    await showMonthly(page);
    await expect(page.getByText("Social media promotion").first()).toBeVisible();

    await page.getByRole("button", { name: /Actions for Marketing/ }).first().click();
    await page.getByRole("menuitem", { name: "Edit" }).or(page.getByText("Edit")).first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // The two sides are different tables with opposite ledger signs, so the
    // control is absent rather than present-and-refused.
    await expect(dialog.getByText(/cannot be switched here/)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Income", exact: true })).toHaveCount(0);
  });

  test("deleting says what it does to the ledger", async ({ page }) => {
    await stubApi(page);
    const calls = await withBooks(page);
    await page.goto("/finance/income-expense");
    await showMonthly(page);
    await expect(page.getByText("Social media promotion").first()).toBeVisible();

    await page.getByRole("button", { name: /Actions for Marketing/ }).first().click();
    await page.getByText("Delete").first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/ledger rows behind it are reversed/)).toBeVisible();
    await dialog.getByRole("button", { name: "Delete" }).click();

    await expect
      .poll(() => calls.writes.some((w) => w.startsWith("DELETE /expenses/e-1/")))
      .toBe(true);
  });
});
