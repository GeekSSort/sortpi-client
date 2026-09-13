import { test, expect, type Page } from "@playwright/test";

import { stubApi } from "./stubApi";

/**
 * Refunds: what the sale says afterwards, and what the customer gets back.
 *
 * Two defects live here and they are different kinds of wrong.
 *
 * THE STATUS said Paid on a sale whose every item had come back — the money
 * had gone out, the goods were on the shelf, and the row said the customer had
 * paid for them. A return does not touch `Sale.status` (nothing should; it has
 * two values and cancellation owns the flip), so the list now reads the
 * server's `refund_state`, which is derived from the lines. The reprinted
 * receipt had the same bug and printed the word into the customer's hand.
 *
 * THE MONEY was quoted from the SHELF price and from the sale TOTAL. Both are
 * the wrong figure whenever a sale was discounted or part paid: the screen
 * promised more than the shop hands over. A refund gives back what was
 * actually charged, and only the part of it that was actually PAID.
 */

function ok(data: unknown, extra: Record<string, unknown> = {}) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ success: true, data, ...extra }),
  };
}

/** Ten at ৳100, paid in full, nothing returned. */
const PAID = {
  id: "s-paid",
  invoice_number: "MAIN-26-000601",
  sale_date: "2026-04-11T10:00:00Z",
  customer_name: "Arif Hossain",
  status: "COMPLETED",
  grand_total: "1000.0000",
  paid_amount: "1000.0000",
  due_amount: "0.0000",
  settled_amount: "1000.0000",
  outstanding_amount: "0.0000",
  refund_state: "NONE",
  returned_amount: "0.0000",
  items: [
    {
      id: "i-1",
      sku: "CK-1",
      product_name: "Coca-Cola",
      quantity: "10.000",
      returnable: "10.000",
      unit_price: "100.0000",
      line_total: "1000.0000",
    },
  ],
  payments: [{ id: "p-1", payment_method: "CASH", amount: "1000.0000" }],
};

/** The same sale after everything came back. */
const REFUNDED = {
  ...PAID,
  id: "s-refunded",
  invoice_number: "MAIN-26-000602",
  refund_state: "FULL",
  returned_amount: "1000.0000",
  items: [{ ...PAID.items[0], returnable: "0.000" }],
};

/** Four of the ten back. */
const PART_REFUNDED = {
  ...PAID,
  id: "s-part",
  invoice_number: "MAIN-26-000603",
  refund_state: "PARTIAL",
  returned_amount: "400.0000",
  items: [{ ...PAID.items[0], returnable: "6.000" }],
};

/**
 * ৳1,000 sold, ৳600 handed over, ৳400 still owed.
 *
 * The case the whole refund calculation turns on.
 */
const PART_PAID = {
  ...PAID,
  id: "s-partpaid",
  invoice_number: "MAIN-26-000609",
  paid_amount: "600.0000",
  due_amount: "400.0000",
  settled_amount: "600.0000",
  outstanding_amount: "400.0000",
  payments: [{ id: "p-2", payment_method: "CASH", amount: "600.0000" }],
};

/** ৳800 charged for ten at a ৳100 shelf price — a ৳200 invoice discount. */
const DISCOUNTED = {
  ...PAID,
  id: "s-disc",
  invoice_number: "MAIN-26-000610",
  grand_total: "800.0000",
  paid_amount: "800.0000",
  settled_amount: "800.0000",
  items: [{ ...PAID.items[0], line_total: "800.0000" }],
};

/**
 * ৳1,000 of goods, a 10% coupon, ৳900 taken.
 *
 * `line_total` is still ৳1,000 — the coupon comes off the BILL after the lines
 * are priced — and `charged_total` is the server's ৳900 share. The screen must
 * quote the second.
 */
const COUPONED = {
  ...PAID,
  id: "s-coupon",
  invoice_number: "MAIN-26-000612",
  grand_total: "900.0000",
  paid_amount: "900.0000",
  settled_amount: "900.0000",
  items: [{ ...PAID.items[0], line_total: "1000.0000", charged_total: "900.0000" }],
};

/** Two lines, one of them already part returned. */
const MIXED = {
  ...PAID,
  id: "s-mixed",
  invoice_number: "MAIN-26-000611",
  refund_state: "PARTIAL",
  items: [
    { ...PAID.items[0], returnable: "4.000" },
    {
      id: "i-2",
      sku: "SP-1",
      product_name: "Sprite",
      quantity: "5.000",
      returnable: "5.000",
      unit_price: "60.0000",
      line_total: "300.0000",
    },
  ],
};

/**
 * Serve these sales, and capture what gets posted back.
 *
 * Every pattern is anchored on `/api/v1/`, which is not fussiness. A
 * Playwright RegExp route matches as a SUBSTRING and applies to NAVIGATION as
 * well as fetches, so a bare `/sales\/?$/` matched the browser's own request
 * for the page at `/sales-pos/sales` and handed the tab a JSON document. The
 * app never loaded, and the assertions then read the response body as page
 * text — `getByText("MAIN-26-000602")` found the invoice number inside the
 * JSON and passed, which is the worst way for this to go wrong.
 *
 * The prefix also keeps `/api/v1/returns/` from swallowing
 * `/api/v1/sales/{id}/returns/`, which is the other substring trap here.
 */
async function withSales(page: Page, rows: unknown[]) {
  const posted: string[] = [];

  await page.route(/\/api\/v1\/sales\/?(\?|$)/, (r) =>
    r.fulfill(ok(rows, { total: rows.length }))
  );
  await page.route(/\/api\/v1\/returns\/?(\?|$)/, (r) => r.fulfill(ok([], { total: 0 })));
  await page.route(/\/api\/v1\/sales\/[^/]+\/returns\/?$/, async (route) => {
    posted.push(route.request().postData() || "");
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { id: "r-1", reference_no: "RET-1" } }),
    });
  });

  return posted;
}

/** The sale is on screen and its lines have rendered. */
async function refundPage(page: Page, invoice: string) {
  await page.goto(`/sales-pos/return/new?invoice=${invoice}`);
  await expect(page.getByText("Coca-Cola").first()).toBeVisible({ timeout: 15_000 });
}

const qtyOf = (page: Page, name: string) =>
  page.getByLabel(`Quantity of ${name} returning`);

test.describe("what the sales list says after a refund", () => {
  test("a fully returned sale reads Refunded, not Paid", async ({ page }) => {
    await stubApi(page);
    await withSales(page, [REFUNDED]);
    await page.goto("/sales-pos/sales");

    await expect(page.getByText("MAIN-26-000602").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Refunded").first()).toBeVisible();
    // The defect. Owing nothing read as settled, so the row said Paid.
    await expect(page.getByText("Paid", { exact: true })).toHaveCount(0);
  });

  test("a part returned sale says so, and is not called Refunded", async ({ page }) => {
    await stubApi(page);
    await withSales(page, [PART_REFUNDED]);
    await page.goto("/sales-pos/sales");

    await expect(page.getByText("Partially Refunded").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Refunded", { exact: true })).toHaveCount(0);
  });

  test("a sale with nothing returned still reads Paid", async ({ page }) => {
    await stubApi(page);
    await withSales(page, [PAID]);
    await page.goto("/sales-pos/sales");

    await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Refunded")).toHaveCount(0);
  });

  test("a reload says the same thing — the state is the server's, not the page's", async ({
    page,
  }) => {
    await stubApi(page);
    await withSales(page, [REFUNDED]);
    await page.goto("/sales-pos/sales");
    await expect(page.getByText("Refunded").first()).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(page.getByText("Refunded").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Paid", { exact: true })).toHaveCount(0);
  });
});

test.describe("refunding a sale", () => {
  test("Refund all items fills every line to its maximum", async ({ page }) => {
    await stubApi(page);
    await withSales(page, [PAID]);
    await refundPage(page, "MAIN-26-000601");

    await page.getByRole("button", { name: "Refund all items" }).click();

    await expect(qtyOf(page, "Coca-Cola")).toHaveValue("10");
    await expect(page.getByTestId("refund-total")).toHaveText("৳ 1,000");
  });

  test("it only takes what is LEFT on a part returned line", async ({ page }) => {
    await stubApi(page);
    await withSales(page, [MIXED]);
    await refundPage(page, "MAIN-26-000611");

    await page.getByRole("button", { name: "Refund all items" }).click();

    // Six of the ten Coca-Colas are already back; no Sprites are.
    await expect(qtyOf(page, "Coca-Cola")).toHaveValue("4");
    await expect(qtyOf(page, "Sprite")).toHaveValue("5");
    // 4 × ৳100 of cola plus all ৳300 of sprite, not the ৳1,300 sold.
    await expect(page.getByTestId("refund-total")).toHaveText("৳ 700");
  });

  test("pressing it again clears the selection", async ({ page }) => {
    await stubApi(page);
    await withSales(page, [PAID]);
    await refundPage(page, "MAIN-26-000601");

    await page.getByRole("button", { name: "Refund all items" }).click();
    await expect(qtyOf(page, "Coca-Cola")).toHaveValue("10");

    await page.getByRole("button", { name: "Clear selection" }).click();
    await expect(qtyOf(page, "Coca-Cola")).toHaveValue("0");
  });

  test("a partial pick is priced per unit of what was charged", async ({ page }) => {
    await stubApi(page);
    await withSales(page, [PART_REFUNDED]);
    await refundPage(page, "MAIN-26-000603");

    await qtyOf(page, "Coca-Cola").fill("3");

    await expect(page.getByTestId("refund-total")).toHaveText("৳ 300");
  });

  test("the refund is what was CHARGED, not the shelf price", async ({ page }) => {
    // Ten at a ৳100 shelf price with a ৳200 invoice discount took ৳800. This
    // promised ৳1,000 — the shop paying ৳200 to take its own goods back.
    await stubApi(page);
    await withSales(page, [DISCOUNTED]);
    await refundPage(page, "MAIN-26-000610");

    await page.getByRole("button", { name: "Refund all items" }).click();

    await expect(page.getByTestId("goods-value")).toHaveText("৳ 800");
    await expect(page.getByTestId("refund-total")).toHaveText("৳ 800");
  });

  test("a coupon sale quotes what was paid, not the line total", async ({ page }) => {
    // ৳900 taken for ৳1,000 of goods. This quoted ৳1,000 — the coupon paid out a
    // second time, in cash — and the server refunded it too.
    await stubApi(page);
    await withSales(page, [COUPONED]);
    await refundPage(page, "MAIN-26-000612");

    await page.getByRole("button", { name: "Refund all items" }).click();

    await expect(page.getByTestId("goods-value")).toHaveText("৳ 900");
    await expect(page.getByTestId("refund-total")).toHaveText("৳ 900");
  });

  test("a part return of a coupon sale is a share of what was paid", async ({ page }) => {
    await stubApi(page);
    await withSales(page, [COUPONED]);
    await refundPage(page, "MAIN-26-000612");

    // Four of the ten: 4/10 of ৳900.
    await page.getByLabel("Quantity of Coca-Cola returning").fill("4");

    await expect(page.getByTestId("refund-total")).toHaveText("৳ 360");
  });

  test("a part paid sale refunds only what the customer actually paid", async ({ page }) => {
    // THE CASE. ৳1,000 of goods, ৳600 paid, ৳400 owed. The customer gets ৳600
    // and the ৳400 they never paid comes off what they owe.
    await stubApi(page);
    await withSales(page, [PART_PAID]);
    await refundPage(page, "MAIN-26-000609");

    await page.getByRole("button", { name: "Refund all items" }).click();

    await expect(page.getByTestId("goods-value")).toHaveText("৳ 1,000");
    await expect(page.getByText(/Clears what is still owed/)).toBeVisible();
    await expect(page.getByText("Cash back to customer")).toBeVisible();
    await expect(page.getByTestId("refund-total")).toHaveText("৳ 600");
    // And the sentence that stops a cashier handing over the other ৳400.
    await expect(page.getByText(/paid ৳ 600 of ৳ 1,000/)).toBeVisible();
  });

  test("returning less than the debt is all credit and no cash", async ({ page }) => {
    // ৳400 of goods against a ৳400 debt. The customer is owed nothing yet —
    // they have paid ৳600 and are keeping ৳600 of goods.
    await stubApi(page);
    await withSales(page, [PART_PAID]);
    await refundPage(page, "MAIN-26-000609");

    await qtyOf(page, "Coca-Cola").fill("4");

    await expect(page.getByTestId("goods-value")).toHaveText("৳ 400");
    await expect(page.getByTestId("refund-total")).toHaveText("৳ 0");
  });

  test("a fully paid sale just says Refund, with nothing to split", async ({ page }) => {
    await stubApi(page);
    await withSales(page, [PAID]);
    await refundPage(page, "MAIN-26-000601");

    await page.getByRole("button", { name: "Refund all items" }).click();

    await expect(page.getByText("Cash back to customer")).toHaveCount(0);
    await expect(page.getByText(/Clears what is still owed/)).toHaveCount(0);
    await expect(page.getByText("Refund", { exact: true })).toBeVisible();
  });

  test("quantities cannot go past what is returnable", async ({ page }) => {
    await stubApi(page);
    await withSales(page, [PART_REFUNDED]);
    await refundPage(page, "MAIN-26-000603");

    // Six left of the ten. Typing twenty is clamped here rather than refused
    // by the server with the customer standing at the counter.
    await qtyOf(page, "Coca-Cola").fill("20");
    await expect(qtyOf(page, "Coca-Cola")).toHaveValue("6");
  });

  test("a line with nothing left cannot be selected at all", async ({ page }) => {
    await stubApi(page);
    await withSales(page, [REFUNDED]);
    await refundPage(page, "MAIN-26-000602");

    await expect(page.getByText("none left")).toBeVisible();
    await expect(qtyOf(page, "Coca-Cola")).toBeDisabled();
  });

  test("only quantities are posted — the server prices the refund", async ({ page }) => {
    await stubApi(page);
    const posted = await withSales(page, [PART_PAID]);
    await refundPage(page, "MAIN-26-000609");

    await page.getByRole("button", { name: "Refund all items" }).click();
    await page.getByRole("button", { name: "Refund now" }).click();

    await expect.poll(() => posted.length).toBeGreaterThan(0);
    expect(posted[0]).toContain('"quantity":10');
    expect(posted[0]).toContain('"sale_item_id":"i-1"');
    // No amount of any kind. A caller that can name its own figure is a caller
    // that can refund whatever it likes.
    expect(posted[0]).not.toContain("amount");
  });
});
