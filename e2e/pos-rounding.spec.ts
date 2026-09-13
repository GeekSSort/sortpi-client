import { test, expect, type Page } from "@playwright/test";

import { stubApi } from "./stubApi";

/**
 * Whole-taka rounding at the till.
 *
 * `pos.round_to_whole`: a fraction of .40 or more rounds UP, anything under .40
 * rounds DOWN — ৳100.39 is ৳100, ৳100.40 is ৳101.
 *
 * The server applies the rule and checks the tender against its own result, so
 * what matters here is that the till shows and TENDERS that same figure. A till
 * showing ৳100.40 while the server charged ৳101 would be refused at payment; a
 * till rounding to ৳101 while the server kept the paisa would be refused for
 * paying sixty paisa too much.
 */

function ok(data: unknown, extra: Record<string, unknown> = {}) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ success: true, data, ...extra }),
  };
}

const product = (price: string) => ({
  id: "p-cable",
  name: "Cable",
  category: "c-1",
  category_name: "Electrical",
  is_active: true,
  images: [],
  variants: [
    {
      id: "v-cable",
      sku: "CB-1",
      name: "Default",
      is_default: true,
      is_active: true,
      price,
      barcodes: [],
    },
  ],
});

/**
 * A till selling one item at `price`, with rounding on or off.
 *
 * Registered after `stubApi`, so these win for the paths they claim. Returns
 * the sale bodies the till posts.
 */
async function till(page: Page, { price, round }: { price: string; round: boolean }) {
  const sales: string[] = [];

  await page.route(/\/inventory\/stock/, (r) =>
    r.fulfill(ok([{ sku: "CB-1", available: "50.000" }], { total: 1 }))
  );
  await page.route(/\/products\/\?|\/products\/$/, (r) =>
    r.fulfill(ok([product(price)], { total: 1 }))
  );
  await page.route(/\/settings\/resolved/, (r) =>
    r.fulfill(
      ok([
        { key: "pos.round_to_whole", value: round ? "true" : "false", value_type: "BOOL" },
        // VAT out of the way, so the bill is the shelf price and the arithmetic
        // below is the rounding and nothing else.
        { key: "tax.default_rate", value: "0", value_type: "DECIMAL" },
      ])
    )
  );
  await page.route(/\/warehouses/, (r) =>
    r.fulfill(
      ok(
        [
          {
            id: "w-1",
            code: "DHK-MAIN",
            name: "Dhaka Main",
            type: "MAIN",
            branch: "b-1",
            branch_name: "Dhaka — Head Office",
            is_active: true,
          },
        ],
        { total: 1 }
      )
    )
  );
  await page.route(/\/pos\/shifts/, (r) => r.fulfill(ok({ id: "sh-1", status: "OPEN" })));
  await page.route(/\/api\/v1\/sales\/?(\?|$)/, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fulfill(ok([], { total: 0 }));
      return;
    }
    const body = route.request().postData() || "";
    sales.push(body);
    const tender = JSON.parse(body).payments?.[0]?.amount ?? "0";
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          id: "s-1",
          invoice_number: "INV-0001",
          subtotal: price,
          grand_total: tender,
          rounding_adjustment: (Number(tender) - Number(price)).toFixed(4),
          paid_amount: tender,
          due_amount: "0.0000",
          items: [],
          payments: [],
        },
      }),
    });
  });

  return sales;
}

async function ringUp(page: Page) {
  await page.goto("/pos");
  await page.getByRole("button", { name: /Cable/ }).first().click();
  await expect(page.getByRole("button", { name: "Increase quantity" }).first()).toBeVisible({
    timeout: 15_000,
  });
}

test.use({ viewport: { width: 1600, height: 1000 } });

test.describe("rounding the payable to a whole taka", () => {
  test("forty paisa rounds up, on its own line", async ({ page }) => {
    await stubApi(page);
    await till(page, { price: "100.4000", round: true });
    await ringUp(page);

    await expect(page.getByText("Rounding").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("+৳0.60").first()).toBeVisible();
    await expect(page.getByText("৳101.00").first()).toBeVisible();
  });

  test("thirty-nine paisa rounds down", async ({ page }) => {
    await stubApi(page);
    await till(page, { price: "100.3900", round: true });
    await ringUp(page);

    await expect(page.getByText("-৳0.39").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("৳100.00").first()).toBeVisible();
  });

  test("with the setting off the paisa stay, and there is no rounding line", async ({
    page,
  }) => {
    await stubApi(page);
    await till(page, { price: "100.4000", round: false });
    await ringUp(page);

    await expect(page.getByText("৳100.40").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Rounding")).toHaveCount(0);
  });

  test("a bill that is already whole gets no rounding line", async ({ page }) => {
    await stubApi(page);
    await till(page, { price: "100.0000", round: true });
    await ringUp(page);

    await expect(page.getByText("৳100.00").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Rounding")).toHaveCount(0);
  });

  test("the payment dialog shows the same rounded total", async ({ page }) => {
    await stubApi(page);
    await till(page, { price: "100.4000", round: true });
    await ringUp(page);

    await page.getByRole("button", { name: "Pay Cash" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Rounding")).toBeVisible();
    await expect(dialog.getByText("+ ৳0.60")).toBeVisible();
    await expect(page.getByRole("button", { name: /Confirm ৳101\.00/ })).toBeVisible();
  });

  test("the tender sent to the server is the rounded figure", async ({ page }) => {
    // THE point of doing this on both sides. The server rounds ৳100.40 to ৳101
    // and checks the tender against that; the till must tender ৳101.
    await stubApi(page);
    const sales = await till(page, { price: "100.4000", round: true });
    await ringUp(page);

    await page.getByRole("button", { name: "Pay Cash" }).click();
    await page.getByRole("button", { name: /^Confirm/ }).click();

    await expect.poll(() => sales.length).toBeGreaterThan(0);
    expect(JSON.parse(sales[0]).payments[0].amount).toBe("101.00");
  });
});
