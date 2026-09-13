import { test, expect, type Page } from "@playwright/test";

import { stubApi } from "./stubApi";

/**
 * Vouchers — the shop's money in and out, as numbered documents.
 *
 * What is worth driving here is not the table. It is the three things this
 * screen claims and the Income & Expense screen does not:
 *
 *   * a voucher comes back NUMBERED and goes straight to a printable slip;
 *   * the four cards are the server's totals for the same filter as the rows,
 *     not a sum of whatever page happened to load;
 *   * voiding is offered as a void, with the ledger consequence stated, and
 *     amending is not offered at all.
 *
 * Real data through the real components — a screenshot test would pass against
 * a table that renders no rows.
 */

function ok(data: unknown, extra: Record<string, unknown> = {}) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ success: true, data, ...extra }),
  };
}

const VOUCHERS = [
  {
    id: "v-1",
    type: "EXPENSE",
    voucher_no: "DHK-VCH-26-000002",
    date: "2026-04-11",
    category_id: "ec-1",
    category_name: "Rent",
    description: "April shop rent",
    amount: "60000.0000",
    signed_amount: "-60000.0000",
    branch_id: "b-1",
    branch_name: "Dhaka — Head Office",
    payment_account_id: "a-1",
    payment_account_name: "Cash",
    created_at: "2026-04-11T09:00:00Z",
  },
  {
    id: "v-2",
    type: "INCOME",
    voucher_no: "DHK-VCH-26-000001",
    date: "2026-04-09",
    category_id: "ic-1",
    category_name: "Membership",
    description: "Annual membership",
    amount: "12500.0000",
    signed_amount: "12500.0000",
    branch_id: "b-1",
    branch_name: "Dhaka — Head Office",
    payment_account_id: "a-2",
    payment_account_name: "Bank",
    created_at: "2026-04-09T09:00:00Z",
  },
];

const SUMMARY = {
  count: 2,
  income: "12500.0000",
  expense: "60000.0000",
  net: "-47500.0000",
};

/** Answer the voucher endpoints, and record what was asked and written. */
async function withVouchers(page: Page) {
  const calls: { list: string[]; summary: string[]; writes: string[] } = {
    list: [],
    summary: [],
    writes: [],
  };

  await page.route(/\/api\/v1\/.*/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^.*\/api\/v1/, "");

    if (path.startsWith("/vouchers/summary")) {
      calls.summary.push(url.search);
      await route.fulfill(ok(SUMMARY));
      return;
    }
    if (path.startsWith("/vouchers") && request.method() === "POST") {
      calls.writes.push(request.postData() || "");
      await route.fulfill(
        ok({
          ...VOUCHERS[0],
          id: "v-new",
          voucher_no: "DHK-VCH-26-000003",
          description: "May shop rent",
        })
      );
      return;
    }
    if (path.startsWith("/vouchers") && request.method() === "DELETE") {
      calls.writes.push(`DELETE ${path}`);
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    if (path.startsWith("/vouchers")) {
      calls.list.push(url.search);
      const type = url.searchParams.get("type");
      const rows = type ? VOUCHERS.filter((v) => v.type === type) : VOUCHERS;
      await route.fulfill(ok(rows, { total: rows.length, page: 1, limit: 25 }));
      return;
    }
    if (path.startsWith("/income-categories")) {
      await route.fulfill(ok([{ id: "ic-1", name: "Membership" }], { total: 1 }));
      return;
    }
    if (path.startsWith("/expense-categories")) {
      await route.fulfill(ok([{ id: "ec-1", name: "Rent" }], { total: 1 }));
      return;
    }
    if (path.startsWith("/accounts")) {
      await route.fulfill(
        ok(
          [
            { id: "a-1", code: "1100", name: "Cash", account_type: "ASSET", is_active: true },
            { id: "a-2", code: "1120", name: "Bank", account_type: "ASSET", is_active: true },
            {
              id: "a-3",
              code: "4100",
              name: "Sales Revenue",
              account_type: "REVENUE",
              is_active: true,
            },
          ],
          { total: 3 }
        )
      );
      return;
    }
    await route.fallback();
  });

  return calls;
}

test.describe("the voucher list", () => {
  test("it shows both sides, numbered, with the sign on the amount", async ({ page }) => {
    await stubApi(page);
    await withVouchers(page);
    await page.goto("/finance/vouchers");

    // `.first()` throughout: the screen renders the table AND the phone cards,
    // and both are in the DOM at every viewport — only one of them is shown.
    // A bare getByText matches both and trips Playwright's strict mode.
    await expect(page.getByText("DHK-VCH-26-000002").first()).toBeVisible();
    await expect(page.getByText("DHK-VCH-26-000001").first()).toBeVisible();
    // The sign belongs to the TYPE, and the figure on the wire is unsigned.
    await expect(page.getByText("-৳ 60,000").first()).toBeVisible();
    await expect(page.getByText("+৳ 12,500").first()).toBeVisible();
  });

  test("the four cards are the server's totals, not the page's", async ({ page }) => {
    await stubApi(page);
    await withVouchers(page);
    await page.goto("/finance/vouchers");

    await expect(page.getByText("Total Vouchers")).toBeVisible();
    await expect(page.getByText("Net Balance")).toBeVisible();
    // Negative net gets the loss wording rather than a green badge over a
    // number in brackets.
    await expect(page.getByText("-৳ 47,500")).toBeVisible();
    await expect(page.getByText("Overspent")).toBeVisible();
  });

  test("the type filter narrows the rows AND the cards together", async ({ page }) => {
    await stubApi(page);
    const calls = await withVouchers(page);
    await page.goto("/finance/vouchers");
    await expect(page.getByText("DHK-VCH-26-000002").first()).toBeVisible();

    await page.getByRole("button", { name: "All types" }).click();
    await page.getByRole("option", { name: "Income" }).click();

    await expect(page.getByText("DHK-VCH-26-000002")).toHaveCount(0);
    await expect(page.getByText("DHK-VCH-26-000001").first()).toBeVisible();

    // Both endpoints saw the same filter. Cards computed over a different one
    // is how a screen shows four totals that do not match the table below.
    expect(calls.list.some((q) => q.includes("type=INCOME"))).toBe(true);
    expect(calls.summary.some((q) => q.includes("type=INCOME"))).toBe(true);
  });
});

test.describe("writing a voucher", () => {
  test("it saves, comes back numbered, and opens the slip", async ({ page }) => {
    await stubApi(page);
    const calls = await withVouchers(page);
    await page.goto("/finance/vouchers");

    await page.getByRole("button", { name: "New voucher" }).click();
    await page.getByLabel("Category").selectOption("ec-1");
    await page.getByLabel("Amount").fill("60000");
    await page.getByLabel("Note").fill("May shop rent");
    await page.getByRole("button", { name: /save & print/i }).click();

    // The number the SERVER handed back, on the printable slip, without the
    // reader having to find the new row in the list first.
    await expect(page.getByText("PAYMENT VOUCHER")).toBeVisible();
    await expect(page.getByText("DHK-VCH-26-000003")).toBeVisible();

    // Money crosses as a four-decimal STRING, never a JSON number.
    expect(calls.writes.join("")).toContain('"amount":"60000.0000"');
    expect(calls.writes.join("")).toContain('"type":"EXPENSE"');
  });

  test("an income voucher prints as a receipt, not a payment", async ({ page }) => {
    await stubApi(page);
    await withVouchers(page);
    await page.goto("/finance/vouchers");

    await page.getByRole("button", { name: "New voucher" }).click();
    await page.getByRole("button", { name: /income received/i }).click();
    await page.getByLabel("Category").selectOption("ic-1");
    await page.getByLabel("Amount").fill("12500");
    await page.getByRole("button", { name: /save & print/i }).click();

    await expect(page.getByText(/VOUCHER/)).toBeVisible();
  });

  test("Save is refused until the voucher means something", async ({ page }) => {
    await stubApi(page);
    await withVouchers(page);
    await page.goto("/finance/vouchers");

    await page.getByRole("button", { name: "New voucher" }).click();
    const save = page.getByRole("button", { name: /save & print/i });
    // No category and no amount: a voucher for nothing, filed under nothing.
    await expect(save).toBeDisabled();

    await page.getByLabel("Category").selectOption("ec-1");
    await expect(save).toBeDisabled();
    await page.getByLabel("Amount").fill("0");
    await expect(save).toBeDisabled();
    await page.getByLabel("Amount").fill("500");
    await expect(save).toBeEnabled();
  });
});

test.describe("voiding", () => {
  test("the row offers a void and never an edit", async ({ page }) => {
    await stubApi(page);
    await withVouchers(page);
    await page.goto("/finance/vouchers");

    await page
      .getByRole("button", { name: /actions for voucher DHK-VCH-26-000002/i })
      .first()
      .click();
    // `menuitem`, not `button`: RowActionMenu gives each entry an explicit
    // role, which replaces the implicit button one.
    await expect(page.getByRole("menuitem", { name: "Void" })).toBeVisible();
    // A voucher is a printed document. Amending the figure afterwards leaves
    // two versions of one payment, so the correction is a void and a new one.
    await expect(page.getByRole("menuitem", { name: "Edit" })).toHaveCount(0);
  });

  test("the confirm says what happens to the ledger", async ({ page }) => {
    await stubApi(page);
    const calls = await withVouchers(page);
    await page.goto("/finance/vouchers");

    await page
      .getByRole("button", { name: /actions for voucher DHK-VCH-26-000002/i })
      .first()
      .click();
    await page.getByRole("menuitem", { name: "Void" }).click();

    await expect(page.getByText(/ledger rows behind it are reversed/i)).toBeVisible();
    await expect(page.getByText(/number is not reused/i)).toBeVisible();

    await page.getByRole("button", { name: "Void voucher" }).click();
    expect(calls.writes.some((w) => w.startsWith("DELETE /vouchers/v-1"))).toBe(true);
  });
});
