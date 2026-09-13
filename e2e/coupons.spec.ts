import { test, expect, type Page } from "@playwright/test";

import { stubApi } from "./stubApi";

/**
 * Coupon codes: set up in Settings, honoured at the till.
 *
 * The till NEVER decides what a code is worth. It asks the server and shows
 * the answer; the sale carries the CODE and the server prices it again. That
 * is the whole reason the field on the POS sat disabled for so long — the
 * version before it gave a real 10% away for the literal string "SAVE10",
 * worked out in the browser, and posted the reduced figure.
 *
 * So these tests watch the WIRE as much as the screen: what the till asks, and
 * what it sends when the sale is rung up.
 */

function ok(data: unknown, extra: Record<string, unknown> = {}) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ success: true, data, ...extra }),
  };
}

const COUPONS = [
  {
    id: "c-1",
    code: "SAVE10",
    mode: "PERCENT",
    value: "10.0000",
    is_active: true,
    description: "Eid leaflet",
  },
  {
    id: "c-2",
    code: "OLDONE",
    mode: "FLAT",
    value: "50.0000",
    is_active: false,
    description: "",
  },
  /**
   * A third off, which does not divide.
   *
   * Money is carried to FOUR decimals on the wire, so a percentage coupon
   * routinely answers with a figure finer than a paisa — 33.333% of ৳1,000 is
   * ৳333.3300, and a third of an odd bill is worse. The till has to show that
   * as money a drawer can hold.
   */
  {
    id: "c-3",
    code: "THIRD",
    mode: "PERCENT",
    value: "33.3333",
    is_active: true,
    description: "A third off",
  },
];

const COKE = {
  id: "p-coke",
  name: "Coca-Cola",
  category: "c-1",
  category_name: "Beverages",
  is_active: true,
  images: [],
  variants: [
    {
      id: "v-1",
      sku: "CK-1",
      name: "Default",
      is_default: true,
      is_active: true,
      price: "1000.0000",
      barcodes: [],
    },
  ],
};

type Calls = { checks: string[]; writes: string[]; sales: string[] };

async function withCoupons(page: Page): Promise<Calls> {
  const calls: Calls = { checks: [], writes: [], sales: [] };

  await page.route(/\/coupons\/check\/$/, async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    calls.checks.push(JSON.stringify(body));
    const found = COUPONS.find((c) => c.code === String(body.code || "").toUpperCase());
    if (!found) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          code: "UNKNOWN_COUPON",
          message: `There is no coupon called ${body.code}. Check the code and try again.`,
        }),
      });
      return;
    }
    if (!found.is_active) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          code: "COUPON_INACTIVE",
          message: `${found.code} is switched off at the moment.`,
        }),
      });
      return;
    }
    // The SERVER works it out — a share of whatever bill it was asked about.
    const payable = Number(body.payable || 0);
    const discount =
      found.mode === "PERCENT" ? (payable * Number(found.value)) / 100 : Number(found.value);
    await route.fulfill(
      ok({
        code: found.code,
        mode: found.mode,
        value: found.value,
        discount: discount.toFixed(4),
        description: found.description,
      })
    );
  });

  await page.route(/\/coupons\/?(\?|$)/, async (route) => {
    if (route.request().method() !== "GET") {
      calls.writes.push(`${route.request().method()} ${route.request().postData() || ""}`);
      await route.fulfill(ok({ ...COUPONS[0], id: "c-new" }));
      return;
    }
    await route.fulfill(ok(COUPONS, { total: COUPONS.length }));
  });

  await page.route(/\/sales\/?(\?|$)/, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fulfill(ok([], { total: 0 }));
      return;
    }
    calls.sales.push(route.request().postData() || "");
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          id: "s-1",
          invoice_number: "INV-0001",
          grand_total: "900.0000",
          paid_amount: "900.0000",
          due_amount: "0.0000",
          items: [],
          payments: [],
        },
      }),
    });
  });

  return calls;
}

/** The till, with one ৳1,000 bottle to sell. */
async function stubTill(page: Page) {
  await page.route(/\/inventory\/stock/, (r) =>
    r.fulfill(ok([{ sku: "CK-1", available: "50.000" }], { total: 1 }))
  );
  await page.route(/\/products\/\?|\/products\/$/, (r) => r.fulfill(ok([COKE], { total: 1 })));
  await page.route(/\/settings\/resolved/, (r) => r.fulfill(ok([])));
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
}

async function ringUp(page: Page) {
  await page.getByRole("button", { name: /Coca-Cola/ }).first().click();
  await expect(page.getByRole("button", { name: "Increase quantity" }).first()).toBeVisible({
    timeout: 15_000,
  });
}

test.use({ viewport: { width: 1600, height: 1000 } });

test.describe("setting coupons up in Settings", () => {
  test("the tab lists them and says what each takes off", async ({ page }) => {
    await stubApi(page);
    await withCoupons(page);
    await page.goto("/settings");
    await page.getByRole("tab", { name: "Coupons" }).click();

    await expect(page.getByText("SAVE10")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("10% off")).toBeVisible();
    await expect(page.getByText("৳50 off")).toBeVisible();
    // A switched-off code is still listed — a sale stamps the code it
    // honoured, so last month's takings have to stay readable.
    // The BADGE, not the on/off button beside it.
    await expect(page.locator("span").filter({ hasText: /^Off$/ })).toBeVisible();
  });

  test("a new coupon is created with its mode", async ({ page }) => {
    await stubApi(page);
    const calls = await withCoupons(page);
    await page.goto("/settings");
    await page.getByRole("tab", { name: "Coupons" }).click();
    await expect(page.getByText("SAVE10")).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /Add a coupon/i }).click();
    await page.getByLabel("Coupon code").fill("eid25");
    await page.getByLabel("Coupon amount").fill("25");
    await page.getByRole("button", { name: "Taka off" }).click();
    await page.getByRole("button", { name: /Save coupon/i }).click();

    await expect.poll(() => calls.writes.length).toBeGreaterThan(0);
    expect(calls.writes[0]).toContain('"code":"EID25"');
    expect(calls.writes[0]).toContain('"mode":"FLAT"');
    // Money crosses as a four-decimal STRING.
    expect(calls.writes[0]).toContain('"value":"25.0000"');
  });

  test("a coupon that takes nothing off is refused before it is sent", async ({ page }) => {
    await stubApi(page);
    const calls = await withCoupons(page);
    await page.goto("/settings");
    await page.getByRole("tab", { name: "Coupons" }).click();
    await page.getByRole("button", { name: /Add a coupon/i }).click();
    await page.getByLabel("Coupon code").fill("ZERO");
    await page.getByLabel("Coupon amount").fill("0");
    await page.getByRole("button", { name: /Save coupon/i }).click();

    await expect(page.getByText(/has to take something off/)).toBeVisible();
    expect(calls.writes).toHaveLength(0);
  });
});

test.describe("using a coupon at the till", () => {
  test("the code is CHECKED with the server, never priced here", async ({ page }) => {
    await stubApi(page);
    const calls = await withCoupons(page);
    await stubTill(page);
    await page.goto("/pos");
    await ringUp(page);

    await page.getByLabel("Coupon code").fill("save10");
    await page.getByRole("button", { name: "Apply" }).click();

    // The till asked, and it asked about THIS bill — a percentage coupon is
    // worth more on a bigger basket, so the question is meaningless without it.
    await expect.poll(() => calls.checks.length).toBeGreaterThan(0);
    expect(calls.checks[0]).toContain('"code":"SAVE10"');
    expect(calls.checks[0]).toContain('"payable":"1000.0000"');
  });

  test("the discount shows on its own row and moves the total", async ({ page }) => {
    await stubApi(page);
    await withCoupons(page);
    await stubTill(page);
    await page.goto("/pos");
    await ringUp(page);

    await page.getByLabel("Coupon code").fill("SAVE10");
    await page.getByRole("button", { name: "Apply" }).click();

    // Its own row — not folded into Discount, which is what the SHOP took off
    // by hand.
    await expect(page.getByText(/Coupon/).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("-৳100").first()).toBeVisible();
    await expect(page.getByText("৳900").first()).toBeVisible();
  });

  test("a coupon that does not divide still prints money, not three decimals", async ({
    page,
  }) => {
    /**
     * The reported defect. 33.3333% of ৳1,000 is ৳333.333 to the wire's four
     * decimals, and the till printed it: "-৳333.333", with a total to match.
     *
     * `toLocaleString` with no options defaults to a MAXIMUM of three fraction
     * digits and a minimum of none, so one call produced both this and "৳100"
     * on a round figure — the same column reading 100, 99.5 and 333.333.
     */
    await stubApi(page);
    await withCoupons(page);
    await stubTill(page);
    await page.goto("/pos");
    await ringUp(page);

    await page.getByLabel("Coupon code").fill("THIRD");
    await page.getByRole("button", { name: "Apply" }).click();

    await expect(page.getByText("-৳333.33").first()).toBeVisible({ timeout: 10_000 });
    // Two decimals, and not a third one anywhere on the screen.
    await expect(page.getByText("333.333")).toHaveCount(0);
    await expect(page.getByText("666.667")).toHaveCount(0);
    // And the total is the paisa figure, not the bare one.
    await expect(page.getByText("৳666.67").first()).toBeVisible();
  });

  test("a round amount still carries its two decimals", async ({ page }) => {
    // The other half of the same bug: ৳100 off a ৳1,000 bill printed as "৳100"
    // beside figures that had decimals, so the column did not line up.
    await stubApi(page);
    await withCoupons(page);
    await stubTill(page);
    await page.goto("/pos");
    await ringUp(page);

    await page.getByLabel("Coupon code").fill("SAVE10");
    await page.getByRole("button", { name: "Apply" }).click();

    await expect(page.getByText("-৳100.00").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("৳900.00").first()).toBeVisible();
  });

  test("the sale carries the CODE, not the figure", async ({ page }) => {
    await stubApi(page);
    const calls = await withCoupons(page);
    await stubTill(page);
    await page.goto("/pos");
    await ringUp(page);

    await page.getByLabel("Coupon code").fill("SAVE10");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText("-৳100").first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Pay Cash" }).click();
    await page.getByRole("button", { name: /^Confirm/ }).click();

    await expect.poll(() => calls.sales.length).toBeGreaterThan(0);
    // The code, so the server can price it itself.
    expect(calls.sales[0]).toContain('"coupon_code":"SAVE10"');
    // And NOT a discount the till worked out — that is the defect this whole
    // feature was rebuilt to remove.
    expect(calls.sales[0]).not.toContain('"coupon_discount"');
  });

  test("an unknown code is refused in words, and takes nothing off", async ({ page }) => {
    await stubApi(page);
    await withCoupons(page);
    await stubTill(page);
    await page.goto("/pos");
    await ringUp(page);

    await page.getByLabel("Coupon code").fill("NOPE");
    await page.getByRole("button", { name: "Apply" }).click();

    await expect(page.getByText(/no coupon called/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("-৳100")).toHaveCount(0);
  });

  test("a switched-off code says so rather than pretending not to exist", async ({ page }) => {
    // Two different conversations at a counter: "not running any more" sends
    // somebody to a manager, "no such code" sends them to check the leaflet.
    await stubApi(page);
    await withCoupons(page);
    await stubTill(page);
    await page.goto("/pos");
    await ringUp(page);

    await page.getByLabel("Coupon code").fill("OLDONE");
    await page.getByRole("button", { name: "Apply" }).click();

    await expect(page.getByText(/switched off/i)).toBeVisible({ timeout: 10_000 });
  });

  test("removing it puts the money back", async ({ page }) => {
    await stubApi(page);
    await withCoupons(page);
    await stubTill(page);
    await page.goto("/pos");
    await ringUp(page);

    await page.getByLabel("Coupon code").fill("SAVE10");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText("-৳100").first()).toBeVisible({ timeout: 10_000 });

    // The one in the coupon field, not the row menus behind it.
    await page.getByRole("button", { name: "Remove", exact: true }).first().click();

    await expect(page.getByText("-৳100")).toHaveCount(0);
    await expect(page.getByText("৳1,000").first()).toBeVisible();
  });

  test("the discount is re-checked when the basket changes", async ({ page }) => {
    // A 10% coupon on ৳1,000 is ৳100; on ৳2,000 it is ৳200. A figure the till
    // kept from the first check would be one the sale refuses to honour.
    await stubApi(page);
    const calls = await withCoupons(page);
    await stubTill(page);
    await page.goto("/pos");
    await ringUp(page);

    await page.getByLabel("Coupon code").fill("SAVE10");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText("-৳100").first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Increase quantity" }).first().click();

    await expect(page.getByText("-৳200").first()).toBeVisible({ timeout: 10_000 });
    expect(calls.checks.length).toBeGreaterThan(1);
    expect(calls.checks[calls.checks.length - 1]).toContain('"payable":"2000.0000"');
  });
});
